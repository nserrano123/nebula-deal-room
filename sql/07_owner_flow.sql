-- =====================================================================
-- Owner flow: confirm what the meeting left open, before quoting.
-- A real meeting often leaves the user count unstated; the owner confirms
-- it here instead of letting the model guess.
-- =====================================================================
CREATE OR REPLACE FUNCTION nebula.fn_confirm_brief_counts(
    p_tenant_code text, p_brief_code text,
    p_users int DEFAULT NULL, p_employees int DEFAULT NULL,
    p_legal_entities int DEFAULT NULL, p_vehicles int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = nebula, public AS $$
DECLARE t tenant; b meeting_brief;
BEGIN
    t := fn_get_tenant(p_tenant_code);
    b := fn_get_brief(t.id, p_brief_code);
    IF p_users IS NOT NULL AND p_users < 1 THEN
        RAISE EXCEPTION 'The number of users must be at least 1.';
    END IF;
    IF p_legal_entities IS NOT NULL AND p_legal_entities < 1 THEN
        RAISE EXCEPTION 'The number of legal entities must be at least 1.';
    END IF;
    IF coalesce(p_employees, 0) < 0 OR coalesce(p_vehicles, 0) < 0 THEN
        RAISE EXCEPTION 'Employees and vehicles cannot be negative.';
    END IF;
    UPDATE meeting_brief
       SET users_count          = coalesce(p_users, users_count),
           employees_count      = coalesce(p_employees, employees_count),
           legal_entities_count = coalesce(p_legal_entities, legal_entities_count),
           vehicles_count       = coalesce(p_vehicles, vehicles_count)
     WHERE id = b.id
     RETURNING * INTO b;
    RETURN jsonb_build_object('brief_code', b.code, 'users_count', b.users_count,
                              'employees_count', b.employees_count,
                              'legal_entities_count', b.legal_entities_count,
                              'vehicles_count', b.vehicles_count);
END $$;
