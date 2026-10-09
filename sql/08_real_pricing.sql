-- =====================================================================
-- Fail Fast's real pricing model (Oct 2026)
-- Full user at USD 99 with volume tiers, implementation waived with a
-- commitment, electronic documents listed and discounted, annual = 11 months.
-- Values marked [CONFIRM] are Natalia's to confirm.
-- =====================================================================
SET search_path TO nebula;

ALTER TABLE price_plan ADD COLUMN IF NOT EXISTS impl_mode             char(1) NOT NULL DEFAULT 'H'
    CHECK (impl_mode IN ('H','W'));                          -- H estimated in hours, W waived with commitment
ALTER TABLE price_plan ADD COLUMN IF NOT EXISTS impl_reference_price  numeric(14,2);
ALTER TABLE price_plan ADD COLUMN IF NOT EXISTS commitment_months     int;
ALTER TABLE price_plan ADD COLUMN IF NOT EXISTS annual_months_charged int;
ALTER TABLE price_plan ADD COLUMN IF NOT EXISTS edoc_unit_price       numeric(14,2);
ALTER TABLE price_plan ADD COLUMN IF NOT EXISTS edoc_currency         char(3);
ALTER TABLE price_plan ADD COLUMN IF NOT EXISTS edoc_discount_pct     numeric(5,2);

CREATE TABLE IF NOT EXISTS price_tier (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id       uuid NOT NULL REFERENCES price_plan(id),
    min_users     int NOT NULL,
    max_users     int,                       -- NULL: no upper limit
    discount_pct  numeric(5,2) NOT NULL,
    unit_price    numeric(14,2) NOT NULL,
    UNIQUE (plan_id, min_users)
);

INSERT INTO code_label (domain, code, label) VALUES
    ('impl_mode', 'H', 'Estimated in hours'), ('impl_mode', 'W', 'Waived with commitment')
ON CONFLICT DO NOTHING;

-- Transportation plan with the real price list
UPDATE price_plan p
   SET price_per_user = 99, currency = 'USD', min_billable_users = 1,
       impl_mode = 'W', impl_reference_price = 6000, impl_currency = 'USD',   -- [CONFIRM] reference value
       commitment_months = 24,                                                 -- [CONFIRM]
       annual_months_charged = 11,
       edoc_unit_price = 150, edoc_currency = 'COP', edoc_discount_pct = 100
  FROM tenant t
 WHERE t.id = p.tenant_id AND t.code = 'FF' AND p.code = 'TR';

DELETE FROM price_tier WHERE plan_id IN (SELECT p.id FROM price_plan p JOIN tenant t ON t.id = p.tenant_id
                                          WHERE t.code = 'FF' AND p.code = 'TR');
INSERT INTO price_tier (plan_id, min_users, max_users, discount_pct, unit_price)
SELECT p.id, v.mn, v.mx, v.d, v.u
  FROM price_plan p JOIN tenant t ON t.id = p.tenant_id,
       (VALUES (1, 15, 0, 99), (16, 35, 10, 89), (36, 60, 18, 81),
               (61, 100, 25, 74), (101, 175, 32, 67), (176, NULL::int, 40, 59)) AS v(mn, mx, d, u)
 WHERE t.code = 'FF' AND p.code = 'TR';

CREATE OR REPLACE FUNCTION nebula.fn_quote(
    p_tenant_code     text,
    p_plan_code       text,
    p_users           int,
    p_module_codes    text[]  DEFAULT '{}',
    p_legal_entities  int     DEFAULT 1,
    p_employees       int     DEFAULT 0,
    p_complexity      char(1) DEFAULT 'M',
    p_vehicles        int     DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE
    t            tenant;
    pl           price_plan;
    m            product_module;
    v_code       text;
    v_lines      jsonb := '[]';
    v_flags      jsonb := '[]';
    v_modules    jsonb := '[]';
    v_human      boolean := false;
    v_billable   int;
    v_unit       numeric;
    v_qty        numeric;
    v_hours      numeric := 0;
    v_mult       numeric;
    v_n          int := 0;
    v_totals     jsonb;
    v_monthly    numeric;
    v_per_veh    jsonb := NULL;
    tr           price_tier;
    v_price      numeric;
    v_tier       jsonb := NULL;
    v_list       jsonb := NULL;
    v_pay        jsonb := NULL;
    v_benefits   jsonb := '[]';
    v_mtotal     numeric;
BEGIN
    t  := fn_get_tenant(p_tenant_code);
    pl := fn_get_plan(t.id, p_plan_code);

    IF p_users IS NULL OR p_users <= 0 THEN
        RAISE EXCEPTION 'Number of users must be greater than zero (received: %).', coalesce(p_users::text, 'empty');
    END IF;
    IF coalesce(p_legal_entities, 0) < 1 THEN
        RAISE EXCEPTION 'There must be at least one legal entity (received: %).', coalesce(p_legal_entities::text, 'empty');
    END IF;
    IF coalesce(p_employees, 0) < 0 THEN
        RAISE EXCEPTION 'Number of employees cannot be negative (received: %).', p_employees;
    END IF;
    IF p_complexity NOT IN ('L','M','H') THEN
        RAISE EXCEPTION 'Complexity % is not valid. Use L (Low), M (Medium) or H (High).', p_complexity;
    END IF;

    -- 1. License: volume tier when the plan has tiers, otherwise the plan's price
    SELECT * INTO tr FROM price_tier
     WHERE plan_id = pl.id AND p_users >= min_users AND p_users <= coalesce(max_users, 2147483647)
     ORDER BY min_users DESC LIMIT 1;
    v_price := coalesce(tr.unit_price, pl.price_per_user);
    v_billable := greatest(p_users, pl.min_billable_users);
    IF tr.id IS NOT NULL THEN
        v_tier := jsonb_build_object('min_users', tr.min_users, 'max_users', tr.max_users,
                                     'discount_pct', tr.discount_pct, 'list_price', pl.price_per_user,
                                     'unit_price', tr.unit_price, 'currency', pl.currency);
        v_list := jsonb_build_object('currency', pl.currency, 'total', v_billable * pl.price_per_user);
    END IF;
    v_n := v_n + 1;
    v_lines := v_lines || jsonb_build_object(
        'line_no', v_n, 'concept_code', 'LIC-' || pl.code,
        'concept_name', CASE WHEN tr.id IS NOT NULL THEN 'Full user license (all modules included)'
                             ELSE pl.name || ' license (all modules included)' END,
        'quantity', v_billable, 'unit_price', v_price, 'currency', pl.currency,
        'subtotal', v_billable * v_price,
        'recurrence_code', 'M', 'recurrence_label', fn_label('recurrence','M'),
        'note', CASE WHEN v_billable > p_users
                     THEN format('%s users requested; the plan minimum is %s billable users.', p_users, pl.min_billable_users)
                     WHEN tr.id IS NOT NULL AND tr.discount_pct > 0
                     THEN format('Volume tier %s–%s users: %s%% off the list price of %s %s.', tr.min_users,
                                 coalesce(tr.max_users::text, '+'), tr.discount_pct, pl.currency, pl.price_per_user)
                END);
    IF v_billable > p_users THEN
        v_flags := v_flags || jsonb_build_object('code','MIN_USERS',
            'message', format('The %s-user minimum of plan %s (%s) applies.', pl.min_billable_users, pl.code, pl.name));
    END IF;

    -- 2. Additional legal entities
    IF p_legal_entities > 1 THEN
        v_qty := p_legal_entities - 1;
        IF pl.additional_entity_price IS NOT NULL THEN
            v_unit := pl.additional_entity_price;
        ELSIF pl.additional_entity_pct IS NOT NULL THEN
            v_unit := round(v_billable * pl.price_per_user * pl.additional_entity_pct / 100, 2);
        ELSE
            v_unit := 0;
            v_human := true;
            v_flags := v_flags || jsonb_build_object('code','ENTITY_PRICE',
                'message', format('Plan %s (%s) has no price for additional legal entities.', pl.code, pl.name));
        END IF;
        v_n := v_n + 1;
        v_lines := v_lines || jsonb_build_object(
            'line_no', v_n, 'concept_code', 'ENT-ADD', 'concept_name', 'Additional legal entity',
            'quantity', v_qty, 'unit_price', v_unit, 'currency', pl.currency, 'subtotal', v_qty * v_unit,
            'recurrence_code', 'M', 'recurrence_label', fn_label('recurrence','M'), 'note', NULL);
    END IF;

    -- 3. Modules: implementation hours and per-employee charges
    FOREACH v_code IN ARRAY coalesce(p_module_codes, '{}') LOOP
        m := fn_get_module(t.id, v_code);
        v_hours := v_hours + m.base_impl_hours;
        v_modules := v_modules || jsonb_build_object(
            'module_code', m.code, 'module_name', m.name,
            'pricing_mode_code', m.pricing_mode, 'pricing_mode_label', fn_label('pricing_mode', m.pricing_mode));

        IF m.pricing_mode = 'E' THEN
            IF coalesce(p_employees, 0) = 0 THEN
                v_flags := v_flags || jsonb_build_object('code','MISSING_EMPLOYEES',
                    'message', format('Module %s (%s) is priced per employee and no employee count was given.', m.code, m.name));
            ELSIF m.max_quotable_units IS NOT NULL AND p_employees > m.max_quotable_units THEN
                v_human := true;
                v_flags := v_flags || jsonb_build_object('code','NEGOTIATE',
                    'message', format('Module %s (%s) above %s employees is negotiated directly.', m.code, m.name, m.max_quotable_units));
            ELSE
                v_qty := greatest(p_employees, coalesce(m.min_billable_units, 0));
                v_n := v_n + 1;
                v_lines := v_lines || jsonb_build_object(
                    'line_no', v_n, 'concept_code', 'EMP-' || m.code,
                    'concept_name', m.name || ' per employee',
                    'quantity', v_qty, 'unit_price', m.price_per_unit, 'currency', m.currency,
                    'subtotal', v_qty * m.price_per_unit,
                    'recurrence_code', 'M', 'recurrence_label', fn_label('recurrence','M'),
                    'note', CASE WHEN v_qty > p_employees
                                 THEN format('Minimum billable: %s employees.', m.min_billable_units) END);
            END IF;
        END IF;
    END LOOP;

    -- 4. Implementation (one-time): waived with a commitment, or estimated in hours
    IF pl.impl_mode = 'W' THEN
        v_n := v_n + 1;
        v_lines := v_lines || jsonb_build_object(
            'line_no', v_n, 'concept_code', 'IMPL', 'concept_name', 'Implementation and training',
            'quantity', 1, 'unit_price', pl.impl_reference_price, 'currency', pl.impl_currency,
            'subtotal', pl.impl_reference_price,
            'recurrence_code', 'O', 'recurrence_label', fn_label('recurrence','O'), 'note', NULL);
        v_n := v_n + 1;
        v_lines := v_lines || jsonb_build_object(
            'line_no', v_n, 'concept_code', 'IMPL-WAIVED', 'concept_name', 'Implementation waived with commitment',
            'quantity', 1, 'unit_price', -pl.impl_reference_price, 'currency', pl.impl_currency,
            'subtotal', -pl.impl_reference_price,
            'recurrence_code', 'O', 'recurrence_label', fn_label('recurrence','O'),
            'note', format('Requires a %s-month commitment.', pl.commitment_months));
    ELSE
    SELECT multiplier INTO v_mult FROM impl_complexity WHERE tenant_id = t.id AND code = p_complexity;
    v_mult  := coalesce(v_mult, 1);
    v_hours := ceil((v_hours + p_users * pl.impl_hours_per_user) * v_mult);
    IF v_hours > 0 THEN
        v_n := v_n + 1;
        v_lines := v_lines || jsonb_build_object(
            'line_no', v_n, 'concept_code', 'IMPL', 'concept_name', 'Implementation and training',
            'quantity', v_hours, 'unit_price', pl.impl_hour_rate, 'currency', pl.impl_currency,
            'subtotal', v_hours * pl.impl_hour_rate,
            'recurrence_code', 'O', 'recurrence_label', fn_label('recurrence','O'),
            'note', format('Estimated hours at %s complexity (factor %s).', fn_label('complexity', p_complexity), v_mult));
    END IF;
    END IF;

    -- Totals by recurrence and currency
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'recurrence_code', rc, 'recurrence_label', fn_label('recurrence', rc),
               'currency', cur, 'total', total) ORDER BY rc, cur), '[]')
      INTO v_totals
      FROM (SELECT l->>'recurrence_code' rc, l->>'currency' cur, sum((l->>'subtotal')::numeric) total
              FROM jsonb_array_elements(v_lines) l GROUP BY 1, 2) x;

    -- Payment options and included benefits
    SELECT sum((l->>'subtotal')::numeric) INTO v_mtotal
      FROM jsonb_array_elements(v_lines) l
     WHERE l->>'recurrence_code' = 'M' AND l->>'currency' = pl.currency;
    IF pl.annual_months_charged IS NOT NULL THEN
        v_pay := jsonb_build_object('currency', pl.currency, 'monthly', v_mtotal,
                                    'twelve_months_monthly', v_mtotal * 12,
                                    'annual_months_charged', pl.annual_months_charged,
                                    'annual_prepaid', v_mtotal * pl.annual_months_charged,
                                    'annual_saving', v_mtotal * (12 - pl.annual_months_charged));
    END IF;
    IF pl.edoc_unit_price IS NOT NULL THEN
        v_benefits := v_benefits || jsonb_build_object('code', 'EDOC',
            'name', 'Electronic documents: invoices, notes, support documents, payroll and reception events',
            'list_price', pl.edoc_unit_price, 'currency', pl.edoc_currency, 'unit', 'document',
            'discount_pct', pl.edoc_discount_pct);
    END IF;

    -- Per-vehicle equivalent (monthly, in plan currency)
    IF coalesce(p_vehicles, 0) > 0 THEN
        SELECT sum((l->>'subtotal')::numeric) INTO v_monthly
          FROM jsonb_array_elements(v_lines) l
         WHERE l->>'recurrence_code' = 'M' AND l->>'currency' = pl.currency;
        v_per_veh := jsonb_build_object('vehicles', p_vehicles, 'currency', pl.currency,
                                        'monthly_per_vehicle', round(v_monthly / p_vehicles, 2));
    END IF;

    RETURN jsonb_build_object(
        'tenant_code', t.code, 'tenant_name', t.name,
        'plan_code', pl.code, 'plan_name', pl.name,
        'inputs', jsonb_build_object(
            'users', p_users, 'legal_entities', p_legal_entities, 'employees', p_employees,
            'vehicles', p_vehicles, 'complexity_code', p_complexity,
            'complexity_label', fn_label('complexity', p_complexity)),
        'modules', v_modules,
        'lines', v_lines,
        'totals', v_totals,
        'per_vehicle', v_per_veh,
        'tier', v_tier,
        'list_monthly', v_list,
        'payment_options', v_pay,
        'benefits', v_benefits,
        'commitment_months', pl.commitment_months,
        'flags', v_flags,
        'requires_human', v_human,
        'requires_human_label', fn_label('bool', v_human::text),
        'quoted_at', now());
END $$;
