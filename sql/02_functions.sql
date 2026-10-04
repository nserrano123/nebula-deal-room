-- =====================================================================
-- Nebula · Functions
-- Every write from the agent goes through these functions: the agent
-- proposes, Postgres validates and calculates. No message ever shows a UUID;
-- records are identified by code and name.
-- =====================================================================
SET search_path TO nebula;

-- ---------------------------------------------------------------------
-- Entity resolution with readable errors
-- (distinguishes "does not exist" from "deleted" and warns about activity)
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_get_tenant(p_code text)
RETURNS tenant LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r tenant; v_moves int;
BEGIN
    SELECT * INTO r FROM tenant WHERE code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No tenant exists with code %.', p_code;
    END IF;
    IF r.audit_status = 'D' THEN
        SELECT count(*) INTO v_moves FROM opportunity WHERE tenant_id = r.id;
        RAISE EXCEPTION 'Tenant % (%) was deleted on %.%', r.code, r.name,
            to_char(r.deleted_at, 'YYYY-MM-DD'),
            CASE WHEN v_moves > 0 THEN format(' It still has %s opportunities on record.', v_moves) ELSE '' END;
    END IF;
    RETURN r;
END $$;

CREATE FUNCTION fn_get_plan(p_tenant_id uuid, p_code text)
RETURNS price_plan LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r price_plan; v_moves int;
BEGIN
    SELECT * INTO r FROM price_plan WHERE tenant_id = p_tenant_id AND code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No price plan exists with code %.', p_code;
    END IF;
    IF r.audit_status = 'D' THEN
        SELECT count(*) INTO v_moves FROM meeting_brief WHERE plan_id = r.id;
        RAISE EXCEPTION 'Price plan % (%) was deleted on %.%', r.code, r.name,
            to_char(r.deleted_at, 'YYYY-MM-DD'),
            CASE WHEN v_moves > 0 THEN format(' It is still linked to %s deal briefs.', v_moves) ELSE '' END;
    END IF;
    RETURN r;
END $$;

CREATE FUNCTION fn_get_module(p_tenant_id uuid, p_code text)
RETURNS product_module LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r product_module; v_moves int;
BEGIN
    SELECT * INTO r FROM product_module WHERE tenant_id = p_tenant_id AND code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No module exists with code %.', p_code;
    END IF;
    IF r.audit_status = 'D' THEN
        SELECT count(*) INTO v_moves FROM meeting_brief
         WHERE tenant_id = p_tenant_id AND p_code = ANY (module_codes);
        RAISE EXCEPTION 'Module % (%) was deleted on %.%', r.code, r.name,
            to_char(r.deleted_at, 'YYYY-MM-DD'),
            CASE WHEN v_moves > 0 THEN format(' It still appears in %s deal briefs.', v_moves) ELSE '' END;
    END IF;
    RETURN r;
END $$;

CREATE FUNCTION fn_get_opportunity(p_tenant_id uuid, p_code text)
RETURNS opportunity LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r opportunity; v_moves int;
BEGIN
    SELECT * INTO r FROM opportunity WHERE tenant_id = p_tenant_id AND code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No opportunity exists with code %.', p_code;
    END IF;
    IF r.audit_status = 'D' THEN
        SELECT count(*) INTO v_moves FROM proposal WHERE opportunity_id = r.id;
        RAISE EXCEPTION 'Opportunity % (%) was deleted on %.%', r.code, r.company_name,
            to_char(r.deleted_at, 'YYYY-MM-DD'),
            CASE WHEN v_moves > 0 THEN format(' It still has %s proposals.', v_moves) ELSE '' END;
    END IF;
    RETURN r;
END $$;

CREATE FUNCTION fn_get_brief(p_tenant_id uuid, p_code text)
RETURNS meeting_brief LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r meeting_brief; v_moves int;
BEGIN
    SELECT * INTO r FROM meeting_brief WHERE tenant_id = p_tenant_id AND code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No deal brief exists with code %.', p_code;
    END IF;
    IF r.audit_status = 'D' THEN
        SELECT count(*) INTO v_moves FROM proposal WHERE brief_id = r.id;
        RAISE EXCEPTION 'Deal brief % was deleted on %.%', r.code,
            to_char(r.deleted_at, 'YYYY-MM-DD'),
            CASE WHEN v_moves > 0 THEN format(' It still has %s proposals.', v_moves) ELSE '' END;
    END IF;
    RETURN r;
END $$;

CREATE FUNCTION fn_get_proposal(p_tenant_id uuid, p_code text)
RETURNS proposal LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r proposal; v_moves int;
BEGIN
    SELECT * INTO r FROM proposal WHERE tenant_id = p_tenant_id AND code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No proposal exists with code %.', p_code;
    END IF;
    IF r.audit_status = 'D' THEN
        SELECT count(*) INTO v_moves FROM proposal_event WHERE proposal_id = r.id;
        RAISE EXCEPTION 'Proposal % was deleted on %.%', r.code,
            to_char(r.deleted_at, 'YYYY-MM-DD'),
            CASE WHEN v_moves > 0 THEN format(' It still has %s customer interactions on record.', v_moves) ELSE '' END;
    END IF;
    RETURN r;
END $$;

-- The public proposal is found by its link, never by id
CREATE FUNCTION fn_get_proposal_by_token(p_token text)
RETURNS proposal LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r proposal;
BEGIN
    SELECT * INTO r FROM proposal WHERE public_token = p_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This proposal link is not valid.';
    END IF;
    IF r.audit_status = 'D' THEN
        RAISE EXCEPTION 'Proposal % is no longer available.', r.code;
    END IF;
    RETURN r;
END $$;

CREATE FUNCTION fn_get_stakeholder(p_opportunity_id uuid, p_code text)
RETURNS stakeholder LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r stakeholder; v_moves int;
BEGIN
    SELECT * INTO r FROM stakeholder WHERE opportunity_id = p_opportunity_id AND code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No stakeholder with code % exists for this proposal.', p_code;
    END IF;
    IF r.audit_status = 'D' THEN
        SELECT count(*) INTO v_moves FROM proposal_event WHERE stakeholder_id = r.id;
        RAISE EXCEPTION 'Stakeholder % (%) was deleted on %.%', r.code, r.name,
            to_char(r.deleted_at, 'YYYY-MM-DD'),
            CASE WHEN v_moves > 0 THEN format(' They still have %s interactions on record.', v_moves) ELSE '' END;
    END IF;
    RETURN r;
END $$;

-- Matches a person by email, or by name when there is no email
CREATE FUNCTION fn_upsert_stakeholder(p_tenant_id uuid, p_opportunity_id uuid, p_name text, p_email text,
                                      p_title text, p_role char(2), p_attended boolean)
RETURNS stakeholder LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE r stakeholder; v_role char(2) := coalesce(nullif(p_role, ''), 'OT');
BEGIN
    IF coalesce(trim(p_name), '') = '' THEN
        RAISE EXCEPTION 'Stakeholder name is required.';
    END IF;
    IF v_role NOT IN ('EX','FI','OP','IT','OT') THEN
        RAISE EXCEPTION 'Role % is not valid. Use EX (Executive), FI (Finance), OP (Operations), IT (IT) or OT (Other).', v_role;
    END IF;

    SELECT * INTO r FROM stakeholder
     WHERE opportunity_id = p_opportunity_id AND audit_status = 'A'
       AND ((p_email IS NOT NULL AND lower(email) = lower(p_email))
         OR (lower(name) = lower(trim(p_name))))
     ORDER BY (lower(email) = lower(p_email)) DESC NULLS LAST
     LIMIT 1;

    IF FOUND THEN
        UPDATE stakeholder
           SET email            = coalesce(email, p_email),
               title            = coalesce(p_title, title),
               role_category    = CASE WHEN v_role <> 'OT' THEN v_role ELSE role_category END,
               attended_meeting = attended_meeting OR coalesce(p_attended, false)
         WHERE id = r.id
        RETURNING * INTO r;
    ELSE
        INSERT INTO stakeholder (tenant_id, opportunity_id, code, name, email, title, role_category, attended_meeting)
        VALUES (p_tenant_id, p_opportunity_id, 'STK-' || lpad(nextval('stakeholder_seq')::text, 4, '0'),
                trim(p_name), p_email, p_title, v_role, coalesce(p_attended, false))
        RETURNING * INTO r;
    END IF;
    RETURN r;
END $$;

-- ---------------------------------------------------------------------
-- QUOTE: the only source of prices. Deterministic.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_quote(
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

    -- 1. License
    v_billable := greatest(p_users, pl.min_billable_users);
    v_n := v_n + 1;
    v_lines := v_lines || jsonb_build_object(
        'line_no', v_n, 'concept_code', 'LIC-' || pl.code,
        'concept_name', pl.name || ' license (all modules included)',
        'quantity', v_billable, 'unit_price', pl.price_per_user, 'currency', pl.currency,
        'subtotal', v_billable * pl.price_per_user,
        'recurrence_code', 'M', 'recurrence_label', fn_label('recurrence','M'),
        'note', CASE WHEN v_billable > p_users
                     THEN format('%s users requested; the plan minimum is %s billable users.', p_users, pl.min_billable_users)
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

    -- 4. Implementation (one-time)
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

    -- Totals by recurrence and currency
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'recurrence_code', rc, 'recurrence_label', fn_label('recurrence', rc),
               'currency', cur, 'total', total) ORDER BY rc, cur), '[]')
      INTO v_totals
      FROM (SELECT l->>'recurrence_code' rc, l->>'currency' cur, sum((l->>'subtotal')::numeric) total
              FROM jsonb_array_elements(v_lines) l GROUP BY 1, 2) x;

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
        'flags', v_flags,
        'requires_human', v_human,
        'requires_human_label', fn_label('bool', v_human::text),
        'quoted_at', now());
END $$;

-- ---------------------------------------------------------------------
-- Opportunity
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_create_opportunity(p_tenant_code text, p_company text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE t tenant; v_code text;
BEGIN
    t := fn_get_tenant(p_tenant_code);
    IF coalesce(trim(p_company), '') = '' THEN
        RAISE EXCEPTION 'The prospect company name is required.';
    END IF;
    v_code := 'OPP-' || lpad(nextval('opportunity_seq')::text, 4, '0');
    INSERT INTO opportunity (tenant_id, code, company_name) VALUES (t.id, v_code, trim(p_company));
    RETURN jsonb_build_object('opportunity_code', v_code, 'company_name', trim(p_company),
                              'status_code', 'O', 'status_label', fn_label('opportunity_status','O'));
END $$;

-- ---------------------------------------------------------------------
-- Deal brief: the agent hands over JSON; Postgres validates it.
-- Customer-side participants become stakeholders who attended.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_save_brief(p_tenant_code text, p_opportunity_code text, p_plan_code text,
                              p_transcript text, p_brief jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    t tenant; o opportunity; pl price_plan; s stakeholder;
    v_code text; v_mod text; v_modules text[]; v_cx char(1); p jsonb;
    v_people jsonb := '[]';
BEGIN
    t  := fn_get_tenant(p_tenant_code);
    o  := fn_get_opportunity(t.id, p_opportunity_code);
    pl := fn_get_plan(t.id, p_plan_code);

    IF coalesce(trim(p_transcript), '') = '' THEN
        RAISE EXCEPTION 'The meeting transcript is empty.';
    END IF;

    v_modules := coalesce(ARRAY(SELECT jsonb_array_elements_text(p_brief->'module_codes')), '{}');
    FOREACH v_mod IN ARRAY v_modules LOOP
        PERFORM fn_get_module(t.id, v_mod);
    END LOOP;

    v_cx := coalesce(p_brief->>'complexity', 'M');
    IF v_cx NOT IN ('L','M','H') THEN
        RAISE EXCEPTION 'Complexity % is not valid. Use L (Low), M (Medium) or H (High).', v_cx;
    END IF;

    v_code := 'BRF-' || lpad(nextval('brief_seq')::text, 4, '0');
    INSERT INTO meeting_brief (tenant_id, code, opportunity_id, transcript, summary, needs, objections,
                               wow_moments, buying_signals, open_questions, plan_id, users_count,
                               module_codes, legal_entities_count, employees_count, vehicles_count, complexity)
    VALUES (t.id, v_code, o.id, p_transcript, p_brief->>'summary',
            coalesce(p_brief->'needs', '[]'), coalesce(p_brief->'objections', '[]'),
            coalesce(p_brief->'wow_moments', '[]'), coalesce(p_brief->'buying_signals', '[]'),
            coalesce(p_brief->'open_questions', '[]'), pl.id,
            nullif(p_brief->>'users_count', '')::int, v_modules,
            coalesce(nullif(p_brief->>'legal_entities_count', '')::int, 1),
            coalesce(nullif(p_brief->>'employees_count', '')::int, 0),
            nullif(p_brief->>'vehicles_count', '')::int, v_cx);

    FOR p IN SELECT * FROM jsonb_array_elements(coalesce(p_brief->'participants', '[]')) LOOP
        s := fn_upsert_stakeholder(t.id, o.id, p->>'name', nullif(p->>'email', ''), p->>'title',
                                   coalesce(p->>'role_category', 'OT'), true);
        v_people := v_people || jsonb_build_object('stakeholder_code', s.code, 'name', s.name,
                        'role_category_code', s.role_category,
                        'role_category_label', fn_label('role_category', s.role_category));
    END LOOP;

    RETURN jsonb_build_object('brief_code', v_code, 'opportunity_code', o.code,
                              'company_name', o.company_name, 'plan_code', pl.code, 'plan_name', pl.name,
                              'stakeholders', v_people);
END $$;

-- ---------------------------------------------------------------------
-- Proposal: generated from the brief, born as a draft
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_create_proposal(p_tenant_code text, p_brief_code text, p_narrative text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    t tenant; b meeting_brief; o opportunity; pl price_plan;
    v_quote jsonb; v_code text; v_id uuid; v_version int; v_token text; l jsonb;
BEGIN
    t := fn_get_tenant(p_tenant_code);
    b := fn_get_brief(t.id, p_brief_code);
    SELECT * INTO o  FROM opportunity WHERE id = b.opportunity_id;
    SELECT * INTO pl FROM price_plan WHERE id = b.plan_id;

    IF b.users_count IS NULL THEN
        RAISE EXCEPTION 'Deal brief % has no user count; confirm it with % before quoting.', b.code, o.company_name;
    END IF;

    v_quote := fn_quote(t.code, pl.code, b.users_count, b.module_codes, b.legal_entities_count,
                        b.employees_count, b.complexity, b.vehicles_count);

    SELECT count(*) + 1 INTO v_version FROM proposal WHERE opportunity_id = o.id;
    v_code := 'PRP-' || lpad(nextval('proposal_seq')::text, 4, '0');

    INSERT INTO proposal (tenant_id, code, opportunity_id, brief_id, version, quote, narrative)
    VALUES (t.id, v_code, o.id, b.id, v_version, v_quote, p_narrative)
    RETURNING id, public_token INTO v_id, v_token;

    FOR l IN SELECT * FROM jsonb_array_elements(v_quote->'lines') LOOP
        INSERT INTO proposal_line (proposal_id, line_no, concept_code, concept_name, quantity,
                                   unit_price, currency, subtotal, recurrence, note)
        VALUES (v_id, (l->>'line_no')::int, l->>'concept_code', l->>'concept_name',
                (l->>'quantity')::numeric, (l->>'unit_price')::numeric, l->>'currency',
                (l->>'subtotal')::numeric, l->>'recurrence_code', l->>'note');
    END LOOP;

    RETURN jsonb_build_object('proposal_code', v_code, 'version', v_version, 'public_token', v_token,
                              'opportunity_code', o.code, 'company_name', o.company_name,
                              'status_code', 'D', 'status_label', fn_label('proposal_status','D'),
                              'quote', v_quote);
END $$;

CREATE FUNCTION fn_set_narrative(p_tenant_code text, p_proposal_code text, p_narrative text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE t tenant; p proposal;
BEGIN
    t := fn_get_tenant(p_tenant_code);
    p := fn_get_proposal(t.id, p_proposal_code);
    IF p.status <> 'D' THEN
        RAISE EXCEPTION 'Proposal % is % (%); only a Draft can be edited.',
            p.code, p.status, fn_label('proposal_status', p.status);
    END IF;
    UPDATE proposal SET narrative = p_narrative WHERE id = p.id;
    RETURN jsonb_build_object('proposal_code', p.code, 'status_code', p.status,
                              'status_label', fn_label('proposal_status', p.status));
END $$;

-- Human approval: the agent never sends without it
CREATE FUNCTION fn_approve_proposal(p_tenant_code text, p_proposal_code text, p_approved_by text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE t tenant; p proposal;
BEGIN
    t := fn_get_tenant(p_tenant_code);
    p := fn_get_proposal(t.id, p_proposal_code);
    IF p.status <> 'D' THEN
        RAISE EXCEPTION 'Proposal % is % (%); only a Draft can be approved.',
            p.code, p.status, fn_label('proposal_status', p.status);
    END IF;
    IF coalesce(trim(p.narrative), '') = '' THEN
        RAISE EXCEPTION 'Proposal % has no written text yet; generate it before approving.', p.code;
    END IF;
    UPDATE proposal SET status = 'P', approved_by = p_approved_by, approved_at = now() WHERE id = p.id;
    RETURN jsonb_build_object('proposal_code', p.code, 'status_code', 'P',
                              'status_label', fn_label('proposal_status','P'), 'public_token', p.public_token);
END $$;

CREATE FUNCTION fn_mark_sent(p_tenant_code text, p_proposal_code text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE t tenant; p proposal;
BEGIN
    t := fn_get_tenant(p_tenant_code);
    p := fn_get_proposal(t.id, p_proposal_code);
    IF p.status <> 'P' THEN
        RAISE EXCEPTION 'Proposal % is % (%); only an Approved proposal can be sent.',
            p.code, p.status, fn_label('proposal_status', p.status);
    END IF;
    UPDATE proposal SET status = 'S', sent_at = now() WHERE id = p.id;
    RETURN jsonb_build_object('proposal_code', p.code, 'status_code', 'S',
                              'status_label', fn_label('proposal_status','S'));
END $$;

-- ---------------------------------------------------------------------
-- Proposal room (customer side)
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_public_proposal(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE p proposal; o opportunity; t tenant;
BEGIN
    p := fn_get_proposal_by_token(p_token);
    IF p.status NOT IN ('S','V','A','R') THEN
        RAISE EXCEPTION 'Proposal % has not been sent yet.', p.code;
    END IF;
    SELECT * INTO o FROM opportunity WHERE id = p.opportunity_id;
    SELECT * INTO t FROM tenant WHERE id = p.tenant_id;
    RETURN jsonb_build_object(
        'proposal_code', p.code, 'version', p.version,
        'status_code', p.status, 'status_label', fn_label('proposal_status', p.status),
        'tenant_name', t.name, 'owner_name', t.owner_name,
        'company_name', o.company_name,
        'narrative', p.narrative, 'quote', p.quote, 'sent_at', p.sent_at);
END $$;

-- The only things the agent may claim about the product
CREATE FUNCTION fn_product_facts(p_tenant_code text)
RETURNS TABLE (fact_code text, topic text, content text, availability_code char(1), availability_label text)
LANGUAGE sql STABLE SET search_path = nebula, public AS $$
    SELECT f.code, f.topic, f.content, f.availability, nebula.fn_label('availability', f.availability)
      FROM nebula.product_fact f
      JOIN nebula.tenant t ON t.id = f.tenant_id
     WHERE t.code = p_tenant_code AND f.audit_status = 'A'
     ORDER BY f.topic, f.code
$$;

-- A person enters the room. Returns everything the agent needs to brief them:
-- who they are, whether they were in the meeting, what their role cares about,
-- and what their own colleagues said.
CREATE FUNCTION fn_join_room(p_token text, p_name text, p_email text DEFAULT NULL,
                             p_title text DEFAULT NULL, p_role_category char(2) DEFAULT 'OT')
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    p proposal; o opportunity; b meeting_brief; s stakeholder;
    v_is_new boolean; v_focus text; v_voice jsonb;
BEGIN
    p := fn_get_proposal_by_token(p_token);
    IF p.status NOT IN ('S','V') THEN
        RAISE EXCEPTION 'Proposal % is % (%); the room is not open.',
            p.code, p.status, fn_label('proposal_status', p.status);
    END IF;
    SELECT * INTO o FROM opportunity WHERE id = p.opportunity_id;
    SELECT * INTO b FROM meeting_brief WHERE id = p.brief_id;

    v_is_new := NOT EXISTS (
        SELECT 1 FROM stakeholder
         WHERE opportunity_id = o.id AND audit_status = 'A'
           AND ((p_email IS NOT NULL AND lower(email) = lower(p_email)) OR lower(name) = lower(trim(p_name))));

    s := fn_upsert_stakeholder(p.tenant_id, o.id, p_name, p_email, p_title, p_role_category, false);

    INSERT INTO proposal_event (proposal_id, stakeholder_id, event_type, payload)
    VALUES (p.id, s.id, 'OP', jsonb_build_object('is_new_stakeholder', v_is_new));
    IF p.status = 'S' THEN
        UPDATE proposal SET status = 'V' WHERE id = p.id;
    END IF;

    SELECT focus INTO v_focus FROM role_focus WHERE tenant_id = p.tenant_id AND role_category = s.role_category;

    -- What colleagues said in the meeting (excluding this person's own words)
    SELECT coalesce(jsonb_agg(x), '[]') INTO v_voice FROM (
        SELECT jsonb_build_object('kind', 'need', 'text', e->>'need', 'quote', e->>'quote', 'speaker', e->>'speaker') x
          FROM jsonb_array_elements(b.needs) e
        UNION ALL
        SELECT jsonb_build_object('kind', 'wow', 'text', e->>'moment', 'quote', e->>'quote', 'speaker', e->>'speaker')
          FROM jsonb_array_elements(b.wow_moments) e
        UNION ALL
        SELECT jsonb_build_object('kind', 'objection', 'text', e->>'objection', 'quote', e->>'quote',
                                  'speaker', e->>'speaker', 'handled', e->'handled')
          FROM jsonb_array_elements(b.objections) e
    ) v
    WHERE lower(coalesce(x->>'speaker', '')) <> lower(s.name);

    RETURN jsonb_build_object(
        'stakeholder_code', s.code, 'name', s.name, 'title', s.title,
        'role_category_code', s.role_category,
        'role_category_label', fn_label('role_category', s.role_category),
        'attended_meeting', s.attended_meeting,
        'attended_meeting_label', fn_label('attended', s.attended_meeting::text),
        'is_new_stakeholder', v_is_new,
        'is_new_stakeholder_label', fn_label('bool', v_is_new::text),
        'role_focus', v_focus,
        'meeting_summary', b.summary,
        'colleague_voice', v_voice,
        'open_questions', b.open_questions);
END $$;

-- Signal log: questions, escalations, email replies
CREATE FUNCTION fn_log_event(p_token text, p_event_type char(2), p_stakeholder_code text DEFAULT NULL,
                             p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE p proposal; s stakeholder;
BEGIN
    p := fn_get_proposal_by_token(p_token);
    IF p_event_type NOT IN ('OP','QU','SI','ES','RE') THEN
        RAISE EXCEPTION 'Event type % is not valid.', p_event_type;
    END IF;
    IF p_stakeholder_code IS NOT NULL THEN
        s := fn_get_stakeholder(p.opportunity_id, p_stakeholder_code);
    END IF;
    INSERT INTO proposal_event (proposal_id, stakeholder_id, event_type, payload)
    VALUES (p.id, s.id, p_event_type, p_payload);
    IF p_event_type = 'OP' AND p.status = 'S' THEN
        UPDATE proposal SET status = 'V' WHERE id = p.id;
    END IF;
    RETURN jsonb_build_object('proposal_code', p.code, 'stakeholder_code', s.code, 'stakeholder_name', s.name,
                              'event_type_code', p_event_type,
                              'event_type_label', fn_label('event_type', p_event_type));
END $$;

-- Simulation: a stakeholder changes users or modules; the official proposal does not change
CREATE FUNCTION fn_simulate(p_token text, p_stakeholder_code text DEFAULT NULL,
                            p_users int DEFAULT NULL, p_module_codes text[] DEFAULT NULL,
                            p_employees int DEFAULT NULL, p_legal_entities int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    p proposal; b meeting_brief; t tenant; pl price_plan; s stakeholder;
    v_sim jsonb; v_orig numeric; v_new numeric; v_cur text;
BEGIN
    p := fn_get_proposal_by_token(p_token);
    IF p.status NOT IN ('S','V') THEN
        RAISE EXCEPTION 'Proposal % is % (%); simulations are not available.',
            p.code, p.status, fn_label('proposal_status', p.status);
    END IF;
    IF p_stakeholder_code IS NOT NULL THEN
        s := fn_get_stakeholder(p.opportunity_id, p_stakeholder_code);
    END IF;
    SELECT * INTO b  FROM meeting_brief WHERE id = p.brief_id;
    SELECT * INTO t  FROM tenant WHERE id = p.tenant_id;
    SELECT * INTO pl FROM price_plan WHERE id = b.plan_id;

    v_sim := fn_quote(t.code, pl.code,
                      coalesce(p_users, b.users_count),
                      coalesce(p_module_codes, b.module_codes),
                      coalesce(p_legal_entities, b.legal_entities_count),
                      coalesce(p_employees, b.employees_count),
                      b.complexity, b.vehicles_count);

    v_cur := pl.currency;
    SELECT sum((x->>'total')::numeric) INTO v_orig FROM jsonb_array_elements(p.quote->'totals') x
     WHERE x->>'recurrence_code' = 'M' AND x->>'currency' = v_cur;
    SELECT sum((x->>'total')::numeric) INTO v_new FROM jsonb_array_elements(v_sim->'totals') x
     WHERE x->>'recurrence_code' = 'M' AND x->>'currency' = v_cur;

    INSERT INTO proposal_event (proposal_id, stakeholder_id, event_type, payload)
    VALUES (p.id, s.id, 'SI', jsonb_build_object('inputs', v_sim->'inputs', 'modules', v_sim->'modules',
                                                  'monthly_total', v_new, 'currency', v_cur));

    RETURN jsonb_build_object(
        'proposal_code', p.code,
        'simulation', v_sim,
        'monthly_original', v_orig, 'monthly_simulated', v_new,
        'monthly_delta', v_new - v_orig, 'currency', v_cur,
        'message', format('This is a simulation. The official proposal changes only when %s approves it.', t.owner_name));
END $$;

-- ---------------------------------------------------------------------
-- Opportunity outcome: the basis for learning
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_close_opportunity(p_tenant_code text, p_opportunity_code text,
                                     p_status char(1), p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE t tenant; o opportunity;
BEGIN
    t := fn_get_tenant(p_tenant_code);
    o := fn_get_opportunity(t.id, p_opportunity_code);
    IF p_status NOT IN ('W','L','S') THEN
        RAISE EXCEPTION 'Outcome % is not valid. Use W (Won), L (Lost) or S (Stalled).', p_status;
    END IF;
    UPDATE opportunity SET status = p_status, outcome_reason = p_reason,
           closed_at = CASE WHEN p_status IN ('W','L') THEN now() END
     WHERE id = o.id;
    RETURN jsonb_build_object('opportunity_code', o.code, 'company_name', o.company_name,
                              'status_code', p_status, 'status_label', fn_label('opportunity_status', p_status));
END $$;

-- =====================================================================
-- Views for the seller and for Deal radar (text-to-SQL, read-only)
-- =====================================================================

-- One row per proposal
CREATE VIEW v_proposal_signals AS
SELECT t.code                                   AS tenant_code,
       p.code                                   AS proposal_code,
       o.code                                   AS opportunity_code,
       o.company_name,
       p.status                                 AS status_code,
       fn_label('proposal_status', p.status)    AS status_label,
       p.sent_at,
       count(*) FILTER (WHERE e.event_type = 'OP')                     AS opens,
       count(DISTINCT e.stakeholder_id) FILTER (WHERE e.event_type = 'OP') AS distinct_viewers,
       count(DISTINCT e.stakeholder_id) FILTER (WHERE e.event_type = 'OP' AND NOT s.attended_meeting)
                                                                         AS viewers_not_in_meeting,
       max(e.created_at) FILTER (WHERE e.event_type = 'OP')            AS last_opened_at,
       count(*) FILTER (WHERE e.event_type = 'QU')                     AS questions,
       count(*) FILTER (WHERE e.event_type = 'SI')                     AS simulations,
       count(*) FILTER (WHERE e.event_type = 'ES')                     AS escalations
  FROM proposal p
  JOIN tenant t       ON t.id = p.tenant_id
  JOIN opportunity o  ON o.id = p.opportunity_id
  LEFT JOIN proposal_event e ON e.proposal_id = p.id
  LEFT JOIN stakeholder s    ON s.id = e.stakeholder_id
 WHERE p.audit_status = 'A'
 GROUP BY t.code, p.id, o.id;

-- One row per stakeholder: what each person cares about
CREATE VIEW v_stakeholder_signals AS
SELECT t.code                                        AS tenant_code,
       o.code                                        AS opportunity_code,
       o.company_name,
       s.code                                        AS stakeholder_code,
       s.name                                        AS stakeholder_name,
       s.title,
       s.role_category                               AS role_category_code,
       fn_label('role_category', s.role_category)    AS role_category_label,
       s.attended_meeting,
       fn_label('attended', s.attended_meeting::text) AS attended_meeting_label,
       count(*) FILTER (WHERE e.event_type = 'OP')   AS opens,
       min(e.created_at) FILTER (WHERE e.event_type = 'OP') AS first_opened_at,
       max(e.created_at)                             AS last_activity_at,
       count(*) FILTER (WHERE e.event_type = 'QU')   AS questions,
       count(*) FILTER (WHERE e.event_type = 'SI')   AS simulations,
       count(*) FILTER (WHERE e.event_type = 'ES')   AS escalations,
       coalesce(jsonb_agg(e.payload->>'question' ORDER BY e.created_at)
                FILTER (WHERE e.event_type = 'QU'), '[]')            AS questions_asked,
       (array_agg((e.payload->'inputs'->>'users')::int ORDER BY e.created_at DESC)
                FILTER (WHERE e.event_type = 'SI'))[1]               AS last_simulated_users
  FROM stakeholder s
  JOIN opportunity o ON o.id = s.opportunity_id
  JOIN tenant t      ON t.id = s.tenant_id
  LEFT JOIN proposal_event e ON e.stakeholder_id = s.id
 WHERE s.audit_status = 'A'
 GROUP BY t.code, o.id, s.id;

-- Timeline of every interaction
CREATE VIEW v_deal_timeline AS
SELECT t.code AS tenant_code, o.company_name, p.code AS proposal_code,
       e.created_at, s.name AS stakeholder_name,
       fn_label('role_category', s.role_category) AS role_category_label,
       fn_label('attended', s.attended_meeting::text) AS attended_meeting_label,
       e.event_type AS event_type_code, fn_label('event_type', e.event_type) AS event_type_label,
       e.payload
  FROM proposal_event e
  JOIN proposal p    ON p.id = e.proposal_id
  JOIN opportunity o ON o.id = p.opportunity_id
  JOIN tenant t      ON t.id = p.tenant_id
  LEFT JOIN stakeholder s ON s.id = e.stakeholder_id;

-- Learning: wow moments and objections by deal outcome
CREATE VIEW v_learning AS
SELECT t.code AS tenant_code, o.status AS outcome_code,
       fn_label('opportunity_status', o.status) AS outcome_label,
       'W' AS signal_kind_code, 'Wow moment' AS signal_kind_label,
       w->>'moment' AS signal, o.code AS opportunity_code, o.company_name
  FROM meeting_brief b
  JOIN opportunity o ON o.id = b.opportunity_id
  JOIN tenant t      ON t.id = b.tenant_id
  CROSS JOIN LATERAL jsonb_array_elements(b.wow_moments) w
 WHERE b.audit_status = 'A'
UNION ALL
SELECT t.code, o.status, fn_label('opportunity_status', o.status), 'O', 'Objection',
       j->>'objection', o.code, o.company_name
  FROM meeting_brief b
  JOIN opportunity o ON o.id = b.opportunity_id
  JOIN tenant t      ON t.id = b.tenant_id
  CROSS JOIN LATERAL jsonb_array_elements(b.objections) j
 WHERE b.audit_status = 'A';
