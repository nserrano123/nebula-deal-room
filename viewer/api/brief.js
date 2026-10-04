import { one, handle } from "./_db.js";

export default handle(async () =>
  one(`select b.code, b.transcript, b.summary, b.needs, b.objections, b.wow_moments,
              b.buying_signals, b.open_questions, o.company_name
         from nebula.meeting_brief b join nebula.opportunity o on o.id = b.opportunity_id
        order by b.created_at limit 1`));
