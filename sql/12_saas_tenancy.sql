-- =====================================================================
-- Nebula as a SaaS: any B2B company sets up its own CRM.
--
--  * tenant          the company that sells (Fail Fast is customer zero)
--  * tenant_member   its people and their role
--  * brand           its business lines (Fail Fast, Simba), each with its own
--                    reference prefix, counter and proposal content
--  * sales_stage     its sales process, step by step
--  * opportunity     now has a brand, a stage, a stage history and, when the
--                    company already had a CRM, a link to that record
--  * meeting_brief   now says which stage it belongs to and where it came from
--  * proposal        now carries the printed reference, the PDF and its annexes
--
-- Runs on the Supabase project that also holds the existing CRM (schema public).
-- Nothing in public is altered; when a public table is present, Nebula keeps it
-- in step (reference counters, proposal list, files).
-- =====================================================================
SET search_path = nebula, public;

-- ---------------------------------------------------------------------
-- Tenant settings and members
-- ---------------------------------------------------------------------
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS legal_name text;
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS country_code char(2) NOT NULL DEFAULT 'CO';
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'America/Bogota';
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS lang char(2) NOT NULL DEFAULT 'es';

CREATE TABLE IF NOT EXISTS tenant_member (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id),
    user_id       uuid REFERENCES auth.users(id),
    code          text NOT NULL,
    full_name     text NOT NULL,
    title         text,
    email         text NOT NULL,
    phone         text,
    role_code     char(1) NOT NULL DEFAULT 'S' CHECK (role_code IN ('A','M','S')),   -- admin, manager, seller
    audit_status  char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    deleted_at    timestamptz,
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, email)
);

-- ---------------------------------------------------------------------
-- Brands (business lines) and their reference counters
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id),
    code          text NOT NULL,
    name          text NOT NULL,
    ref_prefix    text NOT NULL,            -- FF → FF-2026-0016
    profile       jsonb NOT NULL DEFAULT '{}',  -- letter, credentials, about, contact: the proposal's fixed content
    audit_status  char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    deleted_at    timestamptz,
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, ref_prefix)
);

CREATE TABLE IF NOT EXISTS brand_counter (
    brand_id  uuid NOT NULL REFERENCES brand(id),
    year      int  NOT NULL,
    last_num  int  NOT NULL DEFAULT 0,
    PRIMARY KEY (brand_id, year)
);

-- ---------------------------------------------------------------------
-- The sales process of each tenant
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_stage (
    tenant_id      uuid NOT NULL REFERENCES tenant(id),
    code           text NOT NULL,
    name           text NOT NULL,
    sort_no        int  NOT NULL,
    kind_code      char(1) NOT NULL DEFAULT 'O' CHECK (kind_code IN ('O','W','L')),  -- open, won, lost
    takes_meeting  boolean NOT NULL DEFAULT false,   -- this step is a meeting: upload its notes or recording
    makes_proposal boolean NOT NULL DEFAULT false,   -- this step produces the proposal
    crm_stage      text,                             -- the same step in the tenant's previous CRM, if any
    audit_status   char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    PRIMARY KEY (tenant_id, code)
);

ALTER TABLE opportunity ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brand(id);
ALTER TABLE opportunity ADD COLUMN IF NOT EXISTS stage_code text;
ALTER TABLE opportunity ADD COLUMN IF NOT EXISTS owner_member_id uuid REFERENCES tenant_member(id);
ALTER TABLE opportunity ADD COLUMN IF NOT EXISTS crm_entity_type text;   -- 'inbound' | 'pipeline' in the Fail Fast CRM
ALTER TABLE opportunity ADD COLUMN IF NOT EXISTS crm_entity_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_crm_uq ON opportunity (tenant_id, crm_entity_type, crm_entity_id)
    WHERE crm_entity_id IS NOT NULL AND audit_status = 'A';

CREATE TABLE IF NOT EXISTS opportunity_stage_log (
    id              bigserial PRIMARY KEY,
    opportunity_id  uuid NOT NULL REFERENCES opportunity(id),
    stage_code      text NOT NULL,
    note            text,
    changed_by      text,
    changed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunity_stage_log_opp ON opportunity_stage_log (opportunity_id, changed_at);

ALTER TABLE meeting_brief ADD COLUMN IF NOT EXISTS stage_code text;
ALTER TABLE meeting_brief ADD COLUMN IF NOT EXISTS source_code char(1) NOT NULL DEFAULT 'U';
ALTER TABLE meeting_brief ADD COLUMN IF NOT EXISTS source_ref text;   -- Google Doc link, Teams file name, …
DO $$ BEGIN
    ALTER TABLE meeting_brief ADD CONSTRAINT meeting_brief_source_chk CHECK (source_code IN ('G','T','Z','U','R'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Proposal: printed reference, PDF and annexes
-- ---------------------------------------------------------------------
ALTER TABLE proposal ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brand(id);
ALTER TABLE proposal ADD COLUMN IF NOT EXISTS file_path text;           -- storage: company-files/<path>
ALTER TABLE proposal ADD COLUMN IF NOT EXISTS crm_proposal_id uuid;     -- row in public.proposals
ALTER TABLE proposal ADD COLUMN IF NOT EXISTS document jsonb NOT NULL DEFAULT '{}';  -- letter, sections and configuration of the printed document

CREATE TABLE IF NOT EXISTS proposal_annex (
    proposal_id  uuid NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    annex_no     int  NOT NULL,
    kind_code    char(1) NOT NULL CHECK (kind_code IN ('I','S','R','F','O')),
    title        text NOT NULL,
    content      jsonb NOT NULL DEFAULT '{}',
    PRIMARY KEY (proposal_id, annex_no)
);

INSERT INTO code_label (domain, code, label) VALUES
 ('member_role','A','Administrador'), ('member_role','M','Gerente'), ('member_role','S','Vendedor'),
 ('stage_kind','O','Abierta'), ('stage_kind','W','Ganada'), ('stage_kind','L','Perdida'),
 ('brief_source','G','Notas de Google Meet (Gemini)'), ('brief_source','T','Microsoft Teams'),
 ('brief_source','Z','Zoom'), ('brief_source','U','Archivo cargado'), ('brief_source','R','Grabación'),
 ('annex_kind','I','Plan de implementación'), ('annex_kind','S','Respuestas de seguridad'),
 ('annex_kind','R','Matriz de seguridad vial'), ('annex_kind','F','Descripción funcional'),
 ('annex_kind','O','Otro')
ON CONFLICT (domain, code) DO UPDATE SET label = excluded.label;

-- ---------------------------------------------------------------------
-- Lookups with readable errors
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_brand(p_tenant_id uuid, p_code text)
RETURNS brand LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r brand; v_moves int;
BEGIN
    SELECT * INTO r FROM brand WHERE tenant_id = p_tenant_id AND code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la línea de negocio %.', p_code;
    END IF;
    IF r.audit_status = 'D' THEN
        SELECT count(*) INTO v_moves FROM proposal WHERE brand_id = r.id;
        RAISE EXCEPTION 'La línea de negocio % (%) fue eliminada el %.%', r.code, r.name,
            to_char(r.deleted_at, 'YYYY-MM-DD'),
            CASE WHEN v_moves > 0 THEN format(' Aún tiene %s propuestas registradas.', v_moves) ELSE '' END;
    END IF;
    RETURN r;
END $$;

CREATE OR REPLACE FUNCTION fn_get_stage(p_tenant_id uuid, p_code text)
RETURNS sales_stage LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r sales_stage; v_moves int;
BEGIN
    SELECT * INTO r FROM sales_stage WHERE tenant_id = p_tenant_id AND code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la etapa % en el proceso de ventas.', p_code;
    END IF;
    IF r.audit_status = 'D' THEN
        SELECT count(*) INTO v_moves FROM opportunity WHERE tenant_id = p_tenant_id AND stage_code = r.code AND audit_status = 'A';
        RAISE EXCEPTION 'La etapa % (%) fue eliminada.%', r.code, r.name,
            CASE WHEN v_moves > 0 THEN format(' Aún tiene %s oportunidades en ella.', v_moves) ELSE '' END;
    END IF;
    RETURN r;
END $$;

-- ---------------------------------------------------------------------
-- Next printed reference of a brand: FF-2026-0016.
-- One counter per brand and year, shared by the whole team. When the
-- previous CRM keeps per-person counters (public.proposal_counters), they
-- are moved forward too, so the old configurator never repeats a number.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_next_reference(p_tenant_code text, p_brand_code text, p_on date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    t tenant := fn_get_tenant(p_tenant_code);
    b brand  := fn_get_brand(t.id, p_brand_code);
    v_year int := extract(year FROM coalesce(p_on, (now() AT TIME ZONE t.time_zone)::date))::int;
    v_num  int;
    v_ref  text;
BEGIN
    INSERT INTO brand_counter (brand_id, year, last_num) VALUES (b.id, v_year, 1)
    ON CONFLICT (brand_id, year) DO UPDATE SET last_num = brand_counter.last_num + 1
    RETURNING last_num INTO v_num;
    v_ref := b.ref_prefix || '-' || v_year || '-' || lpad(v_num::text, 4, '0');

    IF to_regclass('public.proposal_counters') IS NOT NULL THEN
        UPDATE public.proposal_counters c SET last_num = greatest(c.last_num, v_num)
         WHERE c.year = v_year
           AND c.owner_id IN (SELECT m.user_id FROM tenant_member m WHERE m.tenant_id = t.id AND m.user_id IS NOT NULL);
    END IF;

    RETURN jsonb_build_object('reference', v_ref, 'brand_code', b.code, 'brand_name', b.name,
                              'year', v_year, 'seq_num', v_num);
END $$;

-- ---------------------------------------------------------------------
-- Opportunity from a record of the previous CRM (or reuse the one linked)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_link_crm_opportunity(p_tenant_code text, p_brand_code text,
    p_entity_type text, p_entity_id uuid, p_company text, p_stage_code text DEFAULT NULL, p_owner_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    t tenant := fn_get_tenant(p_tenant_code);
    b brand  := fn_get_brand(t.id, p_brand_code);
    o opportunity;
    v_member uuid;
BEGIN
    IF p_entity_type NOT IN ('inbound','pipeline') THEN
        RAISE EXCEPTION 'Tipo de registro del CRM no válido: %. Use inbound o pipeline.', p_entity_type;
    END IF;
    IF p_stage_code IS NOT NULL THEN PERFORM fn_get_stage(t.id, p_stage_code); END IF;
    SELECT id INTO v_member FROM tenant_member WHERE tenant_id = t.id AND lower(email) = lower(p_owner_email) AND audit_status = 'A';

    SELECT * INTO o FROM opportunity
     WHERE tenant_id = t.id AND crm_entity_type = p_entity_type AND crm_entity_id = p_entity_id AND audit_status = 'A';
    IF NOT FOUND THEN
        INSERT INTO opportunity (tenant_id, code, company_name, brand_id, stage_code, owner_member_id, crm_entity_type, crm_entity_id)
        VALUES (t.id, 'OPP-' || lpad(nextval('opportunity_seq')::text, 4, '0'), p_company, b.id,
                coalesce(p_stage_code, (SELECT code FROM sales_stage WHERE tenant_id = t.id AND audit_status = 'A' ORDER BY sort_no LIMIT 1)),
                v_member, p_entity_type, p_entity_id)
        RETURNING * INTO o;
        INSERT INTO opportunity_stage_log (opportunity_id, stage_code, note, changed_by)
        VALUES (o.id, o.stage_code, 'Vinculada desde el CRM', p_owner_email);
    END IF;
    RETURN jsonb_build_object('opportunity_code', o.code, 'company_name', o.company_name,
                              'brand_code', b.code, 'brand_name', b.name, 'stage_code', o.stage_code,
                              'stage_name', (SELECT name FROM sales_stage WHERE tenant_id = t.id AND code = o.stage_code));
END $$;

-- ---------------------------------------------------------------------
-- Move an opportunity to a stage (one click per step). Mirrors the step
-- in the previous CRM when the opportunity is linked to it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_stage(p_tenant_code text, p_opportunity_code text, p_stage_code text,
    p_note text DEFAULT NULL, p_changed_by text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    t tenant := fn_get_tenant(p_tenant_code);
    o opportunity := fn_get_opportunity(t.id, p_opportunity_code);
    s sales_stage := fn_get_stage(t.id, p_stage_code);
BEGIN
    UPDATE opportunity SET stage_code = s.code,
           status = CASE s.kind_code WHEN 'W' THEN 'W' WHEN 'L' THEN 'L' ELSE 'O' END,
           closed_at = CASE WHEN s.kind_code IN ('W','L') THEN now() ELSE NULL END
     WHERE id = o.id;
    INSERT INTO opportunity_stage_log (opportunity_id, stage_code, note, changed_by)
    VALUES (o.id, s.code, p_note, p_changed_by);

    IF s.crm_stage IS NOT NULL AND o.crm_entity_id IS NOT NULL THEN
        IF o.crm_entity_type = 'inbound' AND to_regclass('public.inbound_opportunities') IS NOT NULL THEN
            EXECUTE 'UPDATE public.inbound_opportunities SET etapa = $1::etapa_enum, updated_at = now() WHERE id = $2'
              USING s.crm_stage, o.crm_entity_id;
        ELSIF o.crm_entity_type = 'pipeline' AND to_regclass('public.pipeline_companies') IS NOT NULL THEN
            EXECUTE 'UPDATE public.pipeline_companies SET etapa = $1::etapa_enum, updated_at = now() WHERE id = $2'
              USING s.crm_stage, o.crm_entity_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('opportunity_code', o.code, 'company_name', o.company_name,
                              'stage_code', s.code, 'stage_name', s.name,
                              'status_code', CASE s.kind_code WHEN 'W' THEN 'W' WHEN 'L' THEN 'L' ELSE 'O' END,
                              'status_label', fn_label('opportunity_status', CASE s.kind_code WHEN 'W' THEN 'W' WHEN 'L' THEN 'L' ELSE 'O' END));
END $$;

-- ---------------------------------------------------------------------
-- The board: every open opportunity with its step, meetings and latest proposal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_pipeline(p_tenant_code text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = nebula, public AS $$
    WITH t AS (SELECT * FROM fn_get_tenant(p_tenant_code))
    SELECT jsonb_build_object(
      'stages', coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'stage_code', s.code, 'stage_name', s.name, 'sort_no', s.sort_no,
                    'kind_code', s.kind_code, 'kind_label', fn_label('stage_kind', s.kind_code),
                    'takes_meeting', s.takes_meeting, 'takes_meeting_label', fn_label('bool', s.takes_meeting::text),
                    'makes_proposal', s.makes_proposal, 'makes_proposal_label', fn_label('bool', s.makes_proposal::text))
                    ORDER BY s.sort_no)
                  FROM sales_stage s, t WHERE s.tenant_id = t.id AND s.audit_status = 'A'), '[]'),
      'brands', coalesce((SELECT jsonb_agg(jsonb_build_object('brand_code', b.code, 'brand_name', b.name, 'ref_prefix', b.ref_prefix) ORDER BY b.code)
                  FROM brand b, t WHERE b.tenant_id = t.id AND b.audit_status = 'A'), '[]'),
      'opportunities', coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'opportunity_code', o.code, 'company_name', o.company_name,
                    'brand_code', b.code, 'brand_name', b.name,
                    'stage_code', o.stage_code, 'stage_name', s.name,
                    'status_code', o.status, 'status_label', fn_label('opportunity_status', o.status),
                    'owner_name', m.full_name,
                    'meetings', (SELECT count(*) FROM meeting_brief mb WHERE mb.opportunity_id = o.id AND mb.audit_status = 'A'),
                    'last_meeting_at', (SELECT max(meeting_at) FROM meeting_brief mb WHERE mb.opportunity_id = o.id AND mb.audit_status = 'A'),
                    'latest_proposal', (SELECT jsonb_build_object('proposal_code', p.code, 'reference', p.external_ref,
                                                 'version', p.version, 'status_code', p.status,
                                                 'status_label', fn_label('proposal_status', p.status))
                                          FROM proposal p WHERE p.opportunity_id = o.id AND p.audit_status = 'A'
                                         ORDER BY p.version DESC, p.created_at DESC LIMIT 1),
                    'stage_changed_at', (SELECT max(changed_at) FROM opportunity_stage_log l WHERE l.opportunity_id = o.id))
                    ORDER BY s.sort_no, o.company_name)
                  FROM opportunity o JOIN t ON o.tenant_id = t.id
                  LEFT JOIN brand b ON b.id = o.brand_id
                  LEFT JOIN sales_stage s ON s.tenant_id = o.tenant_id AND s.code = o.stage_code
                  LEFT JOIN tenant_member m ON m.id = o.owner_member_id
                 WHERE o.audit_status = 'A'), '[]'))
$$;

-- ---------------------------------------------------------------------
-- Brief with its stage and source (wraps fn_save_brief)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_tag_brief(p_tenant_code text, p_brief_code text, p_stage_code text,
    p_source_code char(1), p_source_ref text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    t tenant := fn_get_tenant(p_tenant_code);
    br meeting_brief := fn_get_brief(t.id, p_brief_code);
BEGIN
    IF p_stage_code IS NOT NULL THEN PERFORM fn_get_stage(t.id, p_stage_code); END IF;
    IF p_source_code NOT IN ('G','T','Z','U','R') THEN
        RAISE EXCEPTION 'Origen de la reunión no válido: %.', p_source_code;
    END IF;
    UPDATE meeting_brief SET stage_code = p_stage_code, source_code = p_source_code, source_ref = p_source_ref
     WHERE id = br.id;
    RETURN jsonb_build_object('brief_code', br.code, 'stage_code', p_stage_code,
                              'source_code', p_source_code, 'source_label', fn_label('brief_source', p_source_code));
END $$;

-- ---------------------------------------------------------------------
-- Give a proposal its printed reference and brand
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_assign_reference(p_tenant_code text, p_proposal_code text, p_brand_code text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    t tenant := fn_get_tenant(p_tenant_code);
    p proposal := fn_get_proposal(t.id, p_proposal_code);
    b brand := fn_get_brand(t.id, p_brand_code);
    r jsonb;
BEGIN
    IF p.external_ref IS NOT NULL AND p.brand_id = b.id THEN
        RETURN jsonb_build_object('proposal_code', p.code, 'reference', p.external_ref, 'brand_code', b.code, 'brand_name', b.name);
    END IF;
    IF p.status NOT IN ('D','P') THEN
        RAISE EXCEPTION 'La propuesta % ya fue enviada con la referencia %; no se le asigna otra.', p.code, coalesce(p.external_ref, 'sin referencia');
    END IF;
    r := fn_next_reference(p_tenant_code, p_brand_code);
    UPDATE proposal SET external_ref = r->>'reference', brand_id = b.id WHERE id = p.id;
    RETURN jsonb_build_object('proposal_code', p.code, 'reference', r->>'reference', 'brand_code', b.code, 'brand_name', b.name);
END $$;

-- ---------------------------------------------------------------------
-- Register the PDF of a proposal. When the opportunity comes from the
-- previous CRM, the file and the proposal also show up there, exactly as
-- its own configurator saves them.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_register_proposal_file(p_tenant_code text, p_proposal_code text,
    p_file_path text, p_file_name text, p_file_size bigint, p_owner_email text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    t tenant := fn_get_tenant(p_tenant_code);
    p proposal := fn_get_proposal(t.id, p_proposal_code);
    o opportunity;
    v_user uuid;
    v_file uuid;
    v_crm uuid;
BEGIN
    IF p.external_ref IS NULL THEN
        RAISE EXCEPTION 'La propuesta % aún no tiene referencia; asígnela antes de guardar el PDF.', p.code;
    END IF;
    SELECT * INTO o FROM opportunity WHERE id = p.opportunity_id;
    UPDATE proposal SET file_path = p_file_path WHERE id = p.id;

    SELECT m.user_id INTO v_user FROM tenant_member m
     WHERE m.tenant_id = t.id AND lower(m.email) = lower(p_owner_email) AND m.audit_status = 'A';

    IF o.crm_entity_id IS NOT NULL AND v_user IS NOT NULL AND to_regclass('public.proposals') IS NOT NULL THEN
        EXECUTE 'INSERT INTO public.company_files (owner_id, entity_type, entity_id, file_name, file_path, file_size, mime_type)
                 VALUES ($1, $2::entity_enum, $3, $4, $5, $6, ''application/pdf'') RETURNING id'
          INTO v_file USING v_user, o.crm_entity_type, o.crm_entity_id, p_file_name, p_file_path, p_file_size;
        EXECUTE 'INSERT INTO public.proposals (owner_id, entity_type, entity_id, consecutivo, seq_num, proposal_type, empresa, config, file_id)
                 VALUES ($1, $2::entity_enum, $3, $4, $5, $6, $7, $8, $9) RETURNING id'
          INTO v_crm USING v_user, o.crm_entity_type, o.crm_entity_id, p.external_ref,
               split_part(p.external_ref, '-', 3)::int,
               CASE WHEN (SELECT code FROM brand WHERE id = p.brand_id) = 'SIM' THEN 'simba' ELSE 'general' END,
               o.company_name, jsonb_build_object('nebula_proposal', p.code, 'version', p.version), v_file;
        UPDATE proposal SET crm_proposal_id = v_crm WHERE id = p.id;
    END IF;

    RETURN jsonb_build_object('proposal_code', p.code, 'reference', p.external_ref, 'file_path', p_file_path,
                              'in_crm', v_crm IS NOT NULL, 'in_crm_label', fn_label('bool', (v_crm IS NOT NULL)::text));
END $$;

CREATE OR REPLACE FUNCTION fn_save_annexes(p_tenant_code text, p_proposal_code text, p_annexes jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    t tenant := fn_get_tenant(p_tenant_code);
    p proposal := fn_get_proposal(t.id, p_proposal_code);
BEGIN
    IF p.status NOT IN ('D','P') THEN
        RAISE EXCEPTION 'La propuesta % (%) ya fue enviada; sus anexos no se cambian.', p.code, coalesce(p.external_ref, 'sin referencia');
    END IF;
    DELETE FROM proposal_annex WHERE proposal_id = p.id;
    INSERT INTO proposal_annex (proposal_id, annex_no, kind_code, title, content)
    SELECT p.id, ord::int, a->>'kind_code', a->>'title', coalesce(a->'content', '{}')
      FROM jsonb_array_elements(coalesce(p_annexes, '[]')) WITH ORDINALITY AS x(a, ord);
    RETURN jsonb_build_object('proposal_code', p.code,
        'annexes', coalesce((SELECT jsonb_agg(jsonb_build_object('annex_no', annex_no, 'kind_code', kind_code,
                     'kind_label', fn_label('annex_kind', kind_code), 'title', title) ORDER BY annex_no)
                     FROM proposal_annex WHERE proposal_id = p.id), '[]'));
END $$;

CREATE OR REPLACE FUNCTION fn_set_document(p_tenant_code text, p_proposal_code text, p_document jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE
    t tenant := fn_get_tenant(p_tenant_code);
    p proposal := fn_get_proposal(t.id, p_proposal_code);
BEGIN
    IF p.status NOT IN ('D','P') THEN
        RAISE EXCEPTION 'La propuesta % (%) ya fue enviada; su documento no se cambia.', p.code, coalesce(p.external_ref, 'sin referencia');
    END IF;
    UPDATE proposal SET document = coalesce(p_document, '{}') WHERE id = p.id;
    RETURN jsonb_build_object('proposal_code', p.code, 'reference', p.external_ref);
END $$;

-- ---------------------------------------------------------------------
-- Security: only the server app reaches this schema
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA nebula FROM anon, authenticated, public;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA nebula FROM anon, authenticated, public;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA nebula FROM anon, authenticated, public;
DO $$ DECLARE r text; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'nebula' LOOP
    EXECUTE format('ALTER TABLE nebula.%I ENABLE ROW LEVEL SECURITY', r);
  END LOOP;
END $$;
