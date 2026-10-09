// The proposal room talks to Postgres as nebula_room: it can EXECUTE five room functions and nothing else.
// The token comes from the URL the buyer opened, never from the model.
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { NebulaError, query } from "./db";

const ROOM_FUNCTIONS = new Set(["fn_public_proposal", "fn_join_room", "fn_log_event", "fn_simulate"]);

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 16);

export const isWellFormedToken = (token: string) => /^[0-9a-f]{32}$/.test(token);

export async function roomCall<T = Record<string, unknown>>(fn: string, args: unknown[], casts: string[] = []): Promise<T> {
  if (!ROOM_FUNCTIONS.has(fn)) throw new Error(`Function ${fn} is not available in the room.`);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const sql = neon(process.env.DATABASE_URL);
  const placeholders = args.map((_, i) => `$${i + 1}${casts[i] ? `::${casts[i]}` : ""}`).join(", ");
  try {
    const [, rows] = await sql.transaction([
      sql.query("set local role nebula_room"),
      sql.query(`select nebula.${fn}(${placeholders}) as r`, args),
    ]);
    return (rows as { r: T }[])[0].r;
  } catch (e) {
    const pgError = e as { code?: string; message?: string };
    if (pgError?.code === "P0001") throw new NebulaError(pgError.message ?? "The room rejected the request.");
    throw e;
  }
}

export async function productFacts() {
  const sql = neon(process.env.DATABASE_URL!);
  const [, rows] = await sql.transaction([
    sql.query("set local role nebula_room"),
    sql.query("select fact_code, topic, content, availability_code, availability_label from nebula.fn_product_facts($1)", [
      process.env.NEBULA_TENANT_CODE ?? "FF",
    ]),
  ]);
  return rows as { fact_code: string; topic: string; content: string; availability_code: string; availability_label: string }[];
}

// ---------------------------------------------------------------------------
// Owner-side helpers (run as the app owner, never exposed to the model)
// ---------------------------------------------------------------------------
export async function otherCompanies(token: string): Promise<string[]> {
  const rows = await query<{ company_name: string }>(
    `select distinct o.company_name from nebula.opportunity o
      where o.audit_status = 'A'
        and o.id <> coalesce((select opportunity_id from nebula.proposal where public_token = $1), '00000000-0000-0000-0000-000000000000')`,
    [token],
  );
  return rows.map((r) => r.company_name);
}

export async function liveTokens(): Promise<{ proposal_code: string; company_name: string; token: string; token_hash: string; revoked: boolean }[]> {
  const rows = await query<{ proposal_code: string; company_name: string; token: string; revoked: boolean }>(
    `select p.code as proposal_code, o.company_name, p.public_token as token, p.token_revoked_at is not null as revoked
       from nebula.proposal p join nebula.opportunity o on o.id = p.opportunity_id
      where p.status in ('S','V') and p.audit_status = 'A' order by p.code`,
  );
  return rows.map((r) => ({ ...r, token_hash: tokenHash(r.token) }));
}

export async function revokeToken(token: string, reason: string) {
  return (await query<{ r: Record<string, unknown> }>(`select nebula.fn_revoke_token($1, $2) as r`, [token, reason]))[0].r;
}

export async function restoreAll() {
  return query(
    `select nebula.fn_restore_token('FF', code) from nebula.proposal where token_revoked_at is not null`,
  );
}
