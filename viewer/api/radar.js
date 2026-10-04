import { all, handle } from "./_db.js";

export default handle(async () => ({
  proposals: await all("select * from nebula.v_proposal_signals"),
  stakeholders: await all("select * from nebula.v_stakeholder_signals"),
  timeline: await all("select * from nebula.v_deal_timeline order by created_at"),
  learning: await all("select * from nebula.v_learning"),
}));
