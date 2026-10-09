-- =====================================================================
-- Nebula Shield · Postgres side (Cyberdefense Hackathon, Oct 9 2026)
-- 1. Proposal links can be revoked by the detection engine.
-- 2. The customer-facing room runs under a role that can only EXECUTE
--    the room functions: no table reads, no other tenant, no raw SQL.
-- Idempotent: safe to run more than once.
-- =====================================================================
SET search_path TO nebula;

ALTER TABLE nebula.proposal ADD COLUMN IF NOT EXISTS token_revoked_at     timestamptz;
ALTER TABLE nebula.proposal ADD COLUMN IF NOT EXISTS token_revoked_reason text;

INSERT INTO nebula.code_label (domain, code, label) VALUES
    ('token_status', 'A', 'Active'),
    ('token_status', 'R', 'Revoked')
ON CONFLICT DO NOTHING;

-- A revoked link stops working everywhere, because every room function resolves the token here.
CREATE OR REPLACE FUNCTION nebula.fn_get_proposal_by_token(p_token text)
RETURNS nebula.proposal LANGUAGE plpgsql STABLE SET search_path = nebula, public AS $$
DECLARE r proposal; t tenant;
BEGIN
    SELECT * INTO r FROM proposal WHERE public_token = p_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This proposal link is not valid.';
    END IF;
    IF r.audit_status = 'D' THEN
        RAISE EXCEPTION 'Proposal % is no longer available.', r.code;
    END IF;
    IF r.token_revoked_at IS NOT NULL THEN
        SELECT * INTO t FROM tenant WHERE id = r.tenant_id;
        RAISE EXCEPTION 'The link to proposal % was revoked for security reasons. Contact % for a new one.',
            r.code, t.owner_name;
    END IF;
    RETURN r;
END $$;

CREATE OR REPLACE FUNCTION nebula.fn_revoke_token(p_token text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE r proposal; o opportunity;
BEGIN
    SELECT * INTO r FROM proposal WHERE public_token = p_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This proposal link is not valid.';
    END IF;
    SELECT * INTO o FROM opportunity WHERE id = r.opportunity_id;
    UPDATE proposal SET token_revoked_at = coalesce(token_revoked_at, now()),
                        token_revoked_reason = coalesce(token_revoked_reason, p_reason)
     WHERE id = r.id;
    RETURN jsonb_build_object('proposal_code', r.code, 'company_name', o.company_name,
                              'token_status_code', 'R', 'token_status_label', fn_label('token_status', 'R'),
                              'reason', coalesce(r.token_revoked_reason, p_reason));
END $$;

-- Demo reset: the owner re-enables a link.
CREATE OR REPLACE FUNCTION nebula.fn_restore_token(p_tenant_code text, p_proposal_code text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE t tenant; r proposal; o opportunity;
BEGIN
    t := fn_get_tenant(p_tenant_code);
    r := fn_get_proposal(t.id, p_proposal_code);
    SELECT * INTO o FROM opportunity WHERE id = r.opportunity_id;
    UPDATE proposal SET token_revoked_at = NULL, token_revoked_reason = NULL WHERE id = r.id;
    RETURN jsonb_build_object('proposal_code', r.code, 'company_name', o.company_name,
                              'token_status_code', 'A', 'token_status_label', fn_label('token_status', 'A'));
END $$;

-- ---------------------------------------------------------------------
-- Least privilege for the room
-- ---------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nebula_room') THEN
        CREATE ROLE nebula_room NOLOGIN;
    END IF;
END $$;
GRANT nebula_room TO CURRENT_USER;   -- lets the app switch into it with SET LOCAL ROLE

-- Room functions run with their owner's rights; the role itself can touch nothing else.
ALTER FUNCTION nebula.fn_public_proposal(text)                                     SECURITY DEFINER;
ALTER FUNCTION nebula.fn_join_room(text, text, text, text, char)                   SECURITY DEFINER;
ALTER FUNCTION nebula.fn_log_event(text, char, text, jsonb)                        SECURITY DEFINER;
ALTER FUNCTION nebula.fn_simulate(text, text, int, text[], int, int)               SECURITY DEFINER;
ALTER FUNCTION nebula.fn_product_facts(text)                                       SECURITY DEFINER;

REVOKE ALL ON ALL TABLES IN SCHEMA nebula FROM nebula_room;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA nebula FROM PUBLIC;
GRANT USAGE ON SCHEMA nebula TO nebula_room;
GRANT EXECUTE ON FUNCTION
    nebula.fn_public_proposal(text),
    nebula.fn_join_room(text, text, text, text, char),
    nebula.fn_log_event(text, char, text, jsonb),
    nebula.fn_simulate(text, text, int, text[], int, int),
    nebula.fn_product_facts(text)
TO nebula_room;
