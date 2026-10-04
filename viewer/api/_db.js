import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DEMO_DATABASE_URL, max: 3 });

export const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
export const all = async (sql) => (await pool.query(sql)).rows;
export const token = async () =>
  (await one("select public_token from nebula.proposal order by created_at limit 1"))?.public_token;

export const handle = (fn, method = "GET") => async (req, res) => {
  if (req.method !== method) return res.status(405).json({ error: "Method not allowed" });
  try {
    res.status(200).json(await fn(req));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
