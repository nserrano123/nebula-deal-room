-- =====================================================================
-- Nebula · End-to-end test of the demo script
-- Leaves test data behind; re-run 01–03 to reset.
-- =====================================================================
SET search_path TO nebula;
\pset pager off

\echo '--- 1. Opportunity'
SELECT fn_create_opportunity('FF', 'Pacific Freight Partners');

\echo '--- 2. Deal brief (what the agent returns after reading the transcript)'
SELECT fn_save_brief('FF', 'OPP-0001', 'TR', 'See examples/transcript_pacific_freight.txt',
  '{"summary":"Freight company with 12 finance and dispatch users reconciling everything in spreadsheets.",
    "participants":[{"name":"Mark Chen","title":"CFO","role_category":"FI","email":"mark@pacificfreight.example"}],
    "needs":[{"need":"One system for accounting, billing and dispatch","quote":"we reconcile everything in spreadsheets","speaker":"Mark Chen"},
             {"need":"Automated supplier invoice processing","quote":"That is the part that kills us at month end","speaker":"Mark Chen"}],
    "objections":[{"objection":"Rollout risk","quote":"We cannot stop operations","speaker":"Mark Chen","handled":true}],
    "wow_moments":[{"moment":"AI bank reconciliation","trigger":"treasury demo","quote":"Wait, it does that on its own? My team spends days on that every month.","speaker":"Mark Chen"}],
    "buying_signals":["Asked for a proposal to take to the CEO next week"],
    "open_questions":["Projected cash flow requirement"],
    "users_count":12, "module_codes":["ERP","TMS"],
    "legal_entities_count":1, "employees_count":0, "vehicles_count":null, "complexity":"M"}'::jsonb);

\echo '--- 3. Draft proposal'
SELECT jsonb_pretty(fn_create_proposal('FF', 'BRF-0001') - 'quote');
SELECT line_no, concept_name, quantity, unit_price, currency, subtotal,
       fn_label('recurrence', recurrence) AS recurrence_label, note
  FROM proposal_line ORDER BY line_no;
SELECT quote->'flags' AS flags FROM proposal;

\echo '--- 4. Approving without text must fail'
DO $$ BEGIN PERFORM nebula.fn_approve_proposal('FF','PRP-0001','Natalia');
EXCEPTION WHEN others THEN RAISE NOTICE 'Expected: %', SQLERRM; END $$;

\echo '--- 5. Text, approval, send'
SELECT fn_set_narrative('FF', 'PRP-0001', 'Mark, thank you for the conversation...');
SELECT fn_approve_proposal('FF', 'PRP-0001', 'Natalia Serrano');
SELECT fn_mark_sent('FF', 'PRP-0001');

\echo '--- 6. The CEO (not in the meeting) enters the room'
SELECT jsonb_pretty(fn_join_room((SELECT public_token FROM proposal), 'Sarah Lee',
                                 'sarah@pacificfreight.example', 'CEO', 'EX'));

\echo '--- 7. She asks two questions and simulates 40 users'
SELECT fn_log_event((SELECT public_token FROM proposal), 'QU', 'STK-0002',
                    '{"question":"Do you have projected cash flow?","answer_fact":"TRE-02"}');
SELECT fn_log_event((SELECT public_token FROM proposal), 'QU', 'STK-0002',
                    '{"question":"How long until my team sees results?","answer_fact":"IMP-01"}');
SELECT jsonb_pretty(fn_simulate((SELECT public_token FROM proposal), 'STK-0002', 40) - 'simulation');

\echo '--- 8. The CFO (in the meeting) comes back'
SELECT fn_join_room((SELECT public_token FROM proposal), 'Mark Chen', 'mark@pacificfreight.example')
       ->> 'attended_meeting_label' AS mark_attended;

\echo '--- 9. Seller view: per proposal and per stakeholder'
SELECT proposal_code, company_name, status_label, opens, distinct_viewers, viewers_not_in_meeting,
       questions, simulations
  FROM v_proposal_signals;
SELECT stakeholder_name, title, role_category_label, attended_meeting_label, opens, questions,
       questions_asked, last_simulated_users
  FROM v_stakeholder_signals ORDER BY stakeholder_code;

\echo '--- 10. Readable errors'
DO $$ BEGIN PERFORM nebula.fn_quote('FF','XX',10);
EXCEPTION WHEN others THEN RAISE NOTICE '%', SQLERRM; END $$;
UPDATE price_plan SET audit_status = 'D', deleted_at = now() WHERE code = 'TR';
DO $$ BEGIN PERFORM nebula.fn_quote('FF','TR',10);
EXCEPTION WHEN others THEN RAISE NOTICE '%', SQLERRM; END $$;
UPDATE price_plan SET audit_status = 'A', deleted_at = NULL WHERE code = 'TR';
DO $$ BEGIN PERFORM nebula.fn_join_room('nope', 'Someone');
EXCEPTION WHEN others THEN RAISE NOTICE '%', SQLERRM; END $$;
SELECT fn_quote('FF','TR',20, ARRAY['PAY'], 1, 800)->'flags' AS flags_800_employees,
       fn_quote('FF','TR',20, ARRAY['PAY'], 1, 800)->>'requires_human_label' AS requires_human;

\echo '--- 11. Outcome and learning'
SELECT fn_close_opportunity('FF', 'OPP-0001', 'W', 'CEO convinced by AI reconciliation and parallel rollout');
SELECT outcome_label, signal_kind_label, signal, company_name FROM v_learning;
