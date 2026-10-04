import { one, token, handle } from "./_db.js";

export default handle(async () =>
  (await one("select nebula.fn_public_proposal($1) as r", [await token()])).r);
