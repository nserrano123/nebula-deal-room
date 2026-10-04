import { one, token, handle } from "./_db.js";

export default handle(async (req) => {
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const users = Number.parseInt(body.users, 10);
  if (!Number.isInteger(users) || users < 1 || users > 100000)
    throw new Error("Enter a number of users between 1 and 100000.");
  return (await one("select nebula.fn_simulate($1, null, $2) as r", [await token(), users])).r;
}, "POST");
