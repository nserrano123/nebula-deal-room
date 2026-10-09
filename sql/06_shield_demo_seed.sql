-- =====================================================================
-- Nebula Shield · demo data: two customers with live proposal rooms.
-- Andean Cargo and Pacific Freight must never see each other's deal.
-- Run once per branch. Prints the two public tokens.
-- =====================================================================
DO $$
DECLARE
    v_opp text; v_brf text; v_prp text;
    v_deals jsonb := jsonb_build_array(
      jsonb_build_object(
        'company', 'Andean Cargo S.A.S.',
        'transcript', 'See examples/transcript_andean_cargo.txt',
        'brief', '{"summary":"Freight company with about 60 trucks and two legal entities; accounting, operations and billing live in three systems reconciled by hand.",
          "participants":[{"name":"Laura Méndez","title":"Finance Director","role_category":"FI","email":null},
                          {"name":"Andrés Rojo","title":"Head of Operations","role_category":"OP","email":null}],
          "needs":[{"need":"Stop reconciling three systems by hand","quote":"we match everything by hand in Excel","speaker":"Laura Méndez"}],
          "objections":[{"objection":"Cannot stop operations to switch","quote":"we can''t stop operations to switch systems","speaker":"Laura Méndez","handled":true}],
          "wow_moments":[{"moment":"Automatic bank reconciliation","trigger":"Treasury demo","quote":"It does that by itself?","speaker":"Laura Méndez"},
                         {"moment":"Invoice straight from the delivery note","trigger":"E-invoicing demo","quote":"That would get rid of our third system.","speaker":"Andrés Rojo"}],
          "buying_signals":["Asked when they could start"],"open_questions":["Exact number of employees for payroll"],
          "users_count":25,"module_codes":["ERP","TMS"],"legal_entities_count":2,"employees_count":0,"vehicles_count":60,"complexity":"M"}'::jsonb,
        'narrative', 'Laura, Andrés: thank you for the conversation. This proposal covers one system for accounting, operations and billing across both companies.'),
      jsonb_build_object(
        'company', 'Pacific Freight Partners',
        'transcript', 'See examples/transcript_pacific_freight.txt',
        'brief', '{"summary":"Freight company with 12 finance and dispatch users reconciling everything in spreadsheets.",
          "participants":[{"name":"Mark Chen","title":"CFO","role_category":"FI","email":"mark@pacificfreight.example"}],
          "needs":[{"need":"One system for accounting, billing and dispatch","quote":"we reconcile everything in spreadsheets","speaker":"Mark Chen"}],
          "objections":[{"objection":"Rollout risk","quote":"We cannot stop operations","speaker":"Mark Chen","handled":true}],
          "wow_moments":[{"moment":"AI bank reconciliation","trigger":"Treasury demo","quote":"Wait, it does that on its own?","speaker":"Mark Chen"}],
          "buying_signals":["Asked for a proposal to take to the CEO"],"open_questions":["Projected cash flow requirement"],
          "users_count":12,"module_codes":["ERP","TMS"],"legal_entities_count":1,"employees_count":0,"vehicles_count":null,"complexity":"M"}'::jsonb,
        'narrative', 'Mark, thank you for the conversation. This proposal brings accounting, billing and dispatch into one system for your 12 users.'));
    d jsonb;
BEGIN
    FOR d IN SELECT * FROM jsonb_array_elements(v_deals) LOOP
        v_opp := nebula.fn_create_opportunity('FF', d->>'company')->>'opportunity_code';
        v_brf := nebula.fn_save_brief('FF', v_opp, 'TR', d->>'transcript', d->'brief')->>'brief_code';
        v_prp := nebula.fn_create_proposal('FF', v_brf)->>'proposal_code';
        PERFORM nebula.fn_set_narrative('FF', v_prp, d->>'narrative');
        PERFORM nebula.fn_approve_proposal('FF', v_prp, 'Natalia Serrano');
        PERFORM nebula.fn_mark_sent('FF', v_prp);
        RAISE NOTICE '% → % sent', d->>'company', v_prp;
    END LOOP;
END $$;

SELECT p.code AS proposal_code, o.company_name, p.status, p.public_token
  FROM nebula.proposal p JOIN nebula.opportunity o ON o.id = p.opportunity_id
 WHERE p.status IN ('S','V') ORDER BY p.code;
