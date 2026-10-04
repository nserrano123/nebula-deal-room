// Nebula demo viewer: a read/simulate window over the Neon functions and views.
// Run: node --env-file=.env.demo viewer/server.js
import http from "node:http";
import { readFile } from "node:fs/promises";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DEMO_DATABASE_URL, max: 4 });
const PORT = process.env.PORT || 3000;
const html = await readFile(new URL("./public/index.html", import.meta.url), "utf8");

const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
const all = async (sql) => (await pool.query(sql)).rows;
const token = async () =>
  (await one("select public_token from nebula.proposal order by created_at limit 1"))?.public_token;

const routes = {
  "GET /api/proposal": async () =>
    (await one("select nebula.fn_public_proposal($1) as r", [await token()])).r,
  "GET /api/brief": async () =>
    one(`select b.code, b.transcript, b.summary, b.needs, b.objections, b.wow_moments,
                b.buying_signals, b.open_questions, o.company_name
           from nebula.meeting_brief b join nebula.opportunity o on o.id = b.opportunity_id
          order by b.created_at limit 1`),
  "GET /api/facts": async () => all("select * from nebula.fn_product_facts('FF')"),
  "GET /api/radar": async () => ({
    proposals: await all("select * from nebula.v_proposal_signals"),
    stakeholders: await all("select * from nebula.v_stakeholder_signals"),
    timeline: await all("select * from nebula.v_deal_timeline order by created_at"),
    learning: await all("select * from nebula.v_learning"),
  }),
  "POST /api/simulate": async (body) => {
    const users = Number.parseInt(body.users, 10);
    if (!Number.isInteger(users) || users < 1 || users > 100000) throw new Error("Enter a number of users between 1 and 100000.");
    return (await one("select nebula.fn_simulate($1, null, $2) as r", [await token(), users])).r;
  },
};

http
  .createServer(async (req, res) => {
    const path = req.url.split("?")[0];
    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    const handler = routes[`${req.method} ${path}`];
    if (!handler) return res.writeHead(404).end("Not found");
    try {
      let raw = "";
      for await (const c of req) raw += c;
      const out = await handler(raw ? JSON.parse(raw) : {});
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
  })
  .listen(PORT, () => console.log(`Nebula viewer: http://localhost:${PORT}`));
