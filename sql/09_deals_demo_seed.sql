-- =====================================================================
-- Deals demo: one fictitious customer whose proposal room had a normal,
-- busy two days. The CFO and the CEO were not in the meeting; they read
-- the proposal, asked questions and simulated prices. One person who was
-- in the meeting never came back. Everything goes through the same
-- functions the app uses; only the event timestamps are spread afterwards
-- so the timeline reads like two real days.
-- Run once per branch.
-- =====================================================================
DO $$
DECLARE
    v_opp text; v_brf text; v_prp text; v_tok text; v_prop uuid;
    s_priya text; s_rachel text; s_tom text;
BEGIN
    v_opp := nebula.fn_create_opportunity('FF', 'Sierra Verde Logistics')->>'opportunity_code';
    v_brf := nebula.fn_save_brief('FF', v_opp, 'TR', 'Fictitious demo meeting (see sql/09_deals_demo_seed.sql).', $j$
      {"summary":"Regional freight carrier with about 80 trucks and two legal entities. Billing waits on paper delivery notes and finance closes the month by hand across three systems.",
       "participants":[{"name":"Daniel Ortiz","title":"COO","role_category":"OP","email":null},
                       {"name":"Priya Nair","title":"Controller","role_category":"FI","email":null}],
       "needs":[{"need":"Invoice the same day a load is delivered","quote":"we invoice two weeks after the truck is back","speaker":"Daniel Ortiz"},
                {"need":"Close the month without manual reconciliation","quote":"closing takes us eight days and most of it is copy and paste","speaker":"Priya Nair"}],
       "objections":[{"objection":"Implementation during peak season","quote":"we cannot afford a messy go-live in November","speaker":"Daniel Ortiz","handled":true}],
       "wow_moments":[{"moment":"Invoice generated from the delivery note","trigger":"Billing demo","quote":"so the driver closes the trip and the invoice is already out?","speaker":"Daniel Ortiz"},
                      {"moment":"Automatic bank reconciliation","trigger":"Treasury demo","quote":"that alone would give me back three days","speaker":"Priya Nair"}],
       "buying_signals":["Asked to send the proposal to the CFO and the CEO"],
       "open_questions":["Whether both legal entities go live at the same time"],
       "users_count":30,"module_codes":["ERP","TMS"],"legal_entities_count":2,"employees_count":0,"vehicles_count":80,"complexity":"M"}
    $j$::jsonb)->>'brief_code';
    v_prp := nebula.fn_create_proposal('FF', v_brf)->>'proposal_code';
    PERFORM nebula.fn_set_narrative('FF', v_prp,
'Daniel, Priya: thank you for the time on Tuesday.

You told us two things cost Sierra Verde the most today: invoices go out two weeks after the truck is back, and closing the month takes eight days of copy and paste. This proposal covers one system for operations, billing and accounting across both of your companies, so the trip, the invoice and the books are the same record.

What changes for you
- The driver closes the trip and the invoice is issued from the delivery note the same day.
- Bank movements reconcile on their own; Priya''s team reviews exceptions instead of matching lines.
- Both legal entities share one catalog of customers, routes and vehicles.

About timing: Daniel was clear that November cannot have a messy go-live. We plan the rollout around your peak season, and you decide the start date.

The investment, the volume tier and the payment options are below. Any question, the agent on this page answers it, and anything it cannot answer comes straight to me.

Natalia Serrano');
    PERFORM nebula.fn_approve_proposal('FF', v_prp, 'Natalia Serrano');
    PERFORM nebula.fn_mark_sent('FF', v_prp);

    SELECT id, public_token INTO v_prop, v_tok FROM nebula.proposal p
     WHERE p.code = v_prp AND p.tenant_id = (SELECT id FROM nebula.tenant WHERE code = 'FF');

    -- Day 1, afternoon: Priya (was in the meeting) comes back with a practical question.
    s_priya := nebula.fn_join_room(v_tok, 'Priya Nair', NULL, 'Controller', 'FI')->>'stakeholder_code';
    PERFORM nebula.fn_log_event(v_tok, 'QU', s_priya, '{"question":"Do we need to change banks for the automatic reconciliation to work?","answer_fact":null}');

    -- Day 1, evening: the CFO was not in the meeting.
    s_rachel := nebula.fn_join_room(v_tok, 'Rachel Kim', 'rachel.kim@sierraverde.example', 'CFO', 'FI')->>'stakeholder_code';
    PERFORM nebula.fn_log_event(v_tok, 'QU', s_rachel, '{"question":"How long until we are live, and what does implementation cost us?","answer_fact":null}');
    PERFORM nebula.fn_simulate(v_tok, s_rachel, 45, NULL, NULL, NULL);
    PERFORM nebula.fn_log_event(v_tok, 'QU', s_rachel, '{"question":"If we add the regional office and go to 45 users, what happens to the price per user?","answer_fact":null}');
    PERFORM nebula.fn_log_event(v_tok, 'QU', s_rachel, '{"question":"Is there a discount for paying the year upfront?","answer_fact":null}');
    PERFORM nebula.fn_log_event(v_tok, 'ES', s_rachel, '{"reason":"Rachel Kim (CFO, not in the meeting) wants a call to review contract terms and a start date before the end of the quarter."}');

    -- Day 2, morning: the CEO reads it, also not in the meeting.
    s_tom := nebula.fn_join_room(v_tok, 'Tom Alvarez', NULL, 'CEO', 'EX')->>'stakeholder_code';
    PERFORM nebula.fn_log_event(v_tok, 'QU', s_tom, '{"question":"Can we start with one company and add the second one in January?","answer_fact":null}');
    PERFORM nebula.fn_simulate(v_tok, s_tom, 20, NULL, NULL, 1);
    PERFORM nebula.fn_log_event(v_tok, 'QU', s_tom, '{"question":"Which other freight companies are running on this today?","answer_fact":null}');
    PERFORM nebula.fn_log_event(v_tok, 'ES', s_tom, '{"reason":"Tom Alvarez (CEO, not in the meeting) asked for two references from freight customers before deciding."}');
    PERFORM nebula.fn_join_room(v_tok, 'Tom Alvarez', NULL, 'CEO', 'EX');

    -- Spread the events over two days, in the order they happened.
    UPDATE nebula.proposal SET sent_at = now() - interval '2 days 4 hours' WHERE id = v_prop;
    WITH ordered AS (
        SELECT id, row_number() OVER (ORDER BY id) AS n FROM nebula.proposal_event WHERE proposal_id = v_prop
    ), offsets(n, ago) AS (VALUES
        (1, interval '1 day 22 hours'), (2, interval '1 day 21 hours 52 minutes'),
        (3, interval '1 day 17 hours'), (4, interval '1 day 16 hours 55 minutes'), (5, interval '1 day 16 hours 51 minutes'),
        (6, interval '1 day 16 hours 50 minutes'), (7, interval '1 day 16 hours 47 minutes'), (8, interval '1 day 16 hours 46 minutes'),
        (9, interval '20 hours'), (10, interval '19 hours 56 minutes'), (11, interval '19 hours 54 minutes'),
        (12, interval '19 hours 53 minutes'), (13, interval '19 hours 50 minutes'), (14, interval '3 hours'))
    UPDATE nebula.proposal_event e SET created_at = now() - o.ago
      FROM ordered x JOIN offsets o ON o.n = x.n
     WHERE e.id = x.id;

    RAISE NOTICE 'Sierra Verde Logistics → % (room /room/%)', v_prp, v_tok;
END $$;
