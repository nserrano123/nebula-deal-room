// Nebula Shield · ClickHouse side.
// Every interaction with a proposal room becomes an event; detection rules run as SQL over them.
import { createClient, type ClickHouseClient } from "@clickhouse/client-web";

let client: ClickHouseClient | undefined;

// Accepts CLICKHOUSE_URL (https://host:8443) or CLICKHOUSE_HOST (host only), as the Vercel integration names it.
function clickhouseUrl(): string | undefined {
  const raw = process.env.CLICKHOUSE_URL ?? process.env.CLICKHOUSE_HOST;
  if (!raw) return undefined;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return /:\d+(\/|$)/.test(withScheme.replace(/^https?:\/\//, "")) ? withScheme : `${withScheme.replace(/\/$/, "")}:8443`;
}

export function clickhouseConfigured(): boolean {
  return Boolean(clickhouseUrl() && process.env.CLICKHOUSE_PASSWORD);
}

function ch(): ClickHouseClient {
  if (!clickhouseConfigured()) throw new Error("ClickHouse is not configured. Set CLICKHOUSE_URL, CLICKHOUSE_USER and CLICKHOUSE_PASSWORD.");
  client ??= createClient({
    url: clickhouseUrl(),
    username: process.env.CLICKHOUSE_USER ?? process.env.CLICKHOUSE_USERNAME ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD,
    request_timeout: 60_000,
    clickhouse_settings: { async_insert: 1, wait_for_async_insert: 0 },
  });
  return client;
}

export const DB = "nebula_shield";

export const ATTACK_LABELS: Record<string, string> = {
  "": "None",
  prompt_injection: "Prompt injection",
  cross_tenant: "Cross-customer data probing",
  discount_pressure: "Unauthorized discount pressure",
  data_exfil: "Transcript / data exfiltration",
  token_probe: "Proposal link guessing",
};

export const VERDICT_LABELS: Record<string, string> = {
  allowed: "Allowed",
  blocked: "Attack flagged",
  leak_blocked: "Leak stopped at output",
  revoked: "Link revoked",
};

export type RoomEvent = {
  ts?: string; // ClickHouse fills now64() when absent
  tenant: string;
  proposal_code: string;
  token_hash: string;
  visitor_id: string;
  visitor_name: string;
  channel: "live" | "simulated";
  kind: "join" | "join_failed" | "message" | "tool_call" | "response";
  tool?: string;
  attack_class?: string;
  verdict: "allowed" | "blocked" | "leak_blocked" | "revoked";
  latency_ms?: number;
  text?: string;
};

export async function ensureSchema(): Promise<void> {
  const c = ch();
  await c.command({ query: `CREATE DATABASE IF NOT EXISTS ${DB}` });
  await c.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${DB}.room_events (
        ts            DateTime64(3) DEFAULT now64(3),
        tenant        LowCardinality(String),
        proposal_code String,
        token_hash    String,
        visitor_id    String,
        visitor_name  String,
        channel       LowCardinality(String),
        kind          LowCardinality(String),
        tool          LowCardinality(String) DEFAULT '',
        attack_class  LowCardinality(String) DEFAULT '',
        verdict       LowCardinality(String),
        latency_ms    UInt32 DEFAULT 0,
        text          String DEFAULT ''
      ) ENGINE = MergeTree
      PARTITION BY toDate(ts)
      ORDER BY (tenant, token_hash, ts)
      TTL toDateTime(ts) + INTERVAL 30 DAY`,
  });
  await c.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${DB}.detections (
        ts            DateTime64(3) DEFAULT now64(3),
        rule          LowCardinality(String),
        severity      LowCardinality(String),
        token_hash    String,
        visitor_id    String,
        proposal_code String,
        hits          UInt32,
        action        LowCardinality(String),
        detail        String
      ) ENGINE = MergeTree ORDER BY (ts, rule)`,
  });
}

let schemaReady: Promise<void> | undefined;

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms))]);

/** Writes room events. Never throws and never waits more than a few seconds: logging must not hold up the room. */
export async function logEvents(events: RoomEvent[]): Promise<void> {
  if (!clickhouseConfigured() || events.length === 0) return;
  try {
    schemaReady ??= ensureSchema().catch((e) => {
      schemaReady = undefined;
      throw e;
    });
    await withTimeout(schemaReady, 8_000, "ClickHouse schema check");
    await withTimeout(
      ch().insert({
        table: `${DB}.room_events`,
        values: events.map((e) => ({ ...e, text: (e.text ?? "").slice(0, 2000) })),
        format: "JSONEachRow",
      }),
      8_000,
      "ClickHouse insert",
    );
  } catch (e) {
    console.error("[clickhouse] insert failed", e);
  }
}

/** Connectivity check for /api/health. */
export async function ping(): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = performance.now();
  if (!clickhouseConfigured()) return { ok: false, ms: 0, error: "Not configured" };
  try {
    const rs = await withTimeout(ch().query({ query: "SELECT 1 AS ok", format: "JSONEachRow" }), 25_000, "ClickHouse ping");
    await rs.json();
    return { ok: true, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: (e as Error).message.slice(0, 300) };
  }
}

async function rows<T>(query: string, params: Record<string, unknown> = {}): Promise<{ rows: T[]; ms: number }> {
  const t0 = performance.now();
  const rs = await ch().query({ query, query_params: params, format: "JSONEachRow" });
  const data = (await rs.json()) as T[];
  return { rows: data, ms: Math.round(performance.now() - t0) };
}

// ---------------------------------------------------------------------------
// Simulated traffic: ClickHouse generates it itself, so millions of rows take seconds.
// Background: many tenants, mostly legitimate buyers. On top: attack campaigns in the last minutes.
// ---------------------------------------------------------------------------
export async function generateTraffic(total: number): Promise<{ inserted: number; ms: number }> {
  const n = Math.max(1000, Math.min(Math.floor(total), 5_000_000));
  const recent = Math.min(20_000, Math.floor(n / 50));
  const t0 = performance.now();
  await ch().command({
    query: `
      INSERT INTO ${DB}.room_events
      SELECT
        now64(3) - toIntervalMillisecond(r_time % 86400000)                 AS ts,
        concat('T', leftPad(toString(p % 60), 3, '0'))                       AS tenant,
        concat('PRP-', leftPad(toString(p), 5, '0'))                         AS proposal_code,
        lower(hex(cityHash64('tok', p)))                                     AS token_hash,
        lower(hex(cityHash64('vis', p, r_vis % 6)))                          AS visitor_id,
        'Buyer'                                                              AS visitor_name,
        'simulated'                                                          AS channel,
        multiIf(r_kind % 10 < 1, 'join', r_kind % 10 < 6, 'message', r_kind % 10 < 8, 'tool_call', 'response') AS kind,
        if(kind = 'tool_call', ['product_facts','simulate_price','escalate'][r_kind % 3 + 1], '') AS tool,
        multiIf(r_atk % 2000 < 3, 'prompt_injection', r_atk % 2000 < 5, 'discount_pressure', r_atk % 2000 < 6, 'cross_tenant', '') AS attack_class,
        if(attack_class = '', 'allowed', 'blocked')                          AS verdict,
        toUInt32(400 + r_lat % 2600)                                         AS latency_ms,
        ''                                                                   AS text
      FROM (SELECT number, rand(1) AS r_time, rand(2) % 4000 AS p, rand(3) AS r_vis, rand(4) AS r_kind,
                   rand(5) AS r_atk, rand(6) AS r_lat
              FROM numbers({n:UInt64}))`,
    query_params: { n: n - recent },
  });
  // Campaigns in the last 10 minutes: one link-guessing bot, one injection crew, one discount squeeze.
  await ch().command({
    query: `
      INSERT INTO ${DB}.room_events
      SELECT
        now64(3) - toIntervalMillisecond(rand(1) % 600000)                   AS ts,
        concat('T', leftPad(toString(rand(2) % 60), 3, '0'))                 AS tenant,
        concat('PRP-', leftPad(toString(target), 5, '0'))                   AS proposal_code,
        lower(hex(cityHash64('tok', target)))                                AS token_hash,
        lower(hex(cityHash64('attacker', crew)))                             AS visitor_id,
        ['Link scanner','Injection crew','Discount squeeze'][crew + 1]        AS visitor_name,
        'simulated'                                                          AS channel,
        if(crew = 0, 'join_failed', 'message')                               AS kind,
        ''                                                                   AS tool,
        ['token_probe','prompt_injection','discount_pressure'][crew + 1]     AS attack_class,
        'blocked'                                                            AS verdict,
        toUInt32(20 + rand(3) % 300)                                         AS latency_ms,
        ''                                                                   AS text
      FROM (SELECT number, number % 3 AS crew,
                   if(number % 3 = 0, rand(4) % 4000, 4000 + (number % 3)) AS target
              FROM numbers({m:UInt64}))`,
    query_params: { m: recent },
  });
  return { inserted: n, ms: Math.round(performance.now() - t0) };
}

// ---------------------------------------------------------------------------
// Detection rules, all in one pass over the window
// ---------------------------------------------------------------------------
export type Detection = {
  rule: string;
  rule_label: string;
  severity: "critical" | "high" | "medium";
  token_hash: string;
  visitor_id: string;
  visitor_name: string;
  proposal_code: string;
  hits: number;
  last_seen: string;
};

const RULE_LABELS: Record<string, string> = {
  link_guessing: "One visitor tried many proposal links",
  injection_burst: "Repeated prompt-injection attempts",
  discount_squeeze: "Repeated pressure for an unauthorized discount",
  cross_customer_probe: "Asked about other customers' deals",
  output_leak: "Agent output contained another customer's data",
};

export async function detect(windowMinutes = 15): Promise<{ detections: Detection[]; ms: number; scanned: number }> {
  const params = { w: windowMinutes };
  const { rows: found, ms } = await rows<Omit<Detection, "rule_label">>(
    `
    WITH recent AS (
      SELECT * FROM ${DB}.room_events WHERE ts > now64(3) - toIntervalMinute({w:UInt32})
    )
    SELECT * FROM (
    SELECT 'injection_burst' AS rule, 'high' AS severity, token_hash, any(visitor_id) AS visitor_id,
           any(visitor_name) AS visitor_name, any(proposal_code) AS proposal_code,
           toUInt32(count()) AS hits, toString(max(ts)) AS last_seen
      FROM recent WHERE attack_class IN ('prompt_injection', 'data_exfil')
     GROUP BY token_hash HAVING count() >= 3
    UNION ALL
    -- No aliases here: an alias named token_hash would shadow the column inside uniqExact.
    SELECT 'link_guessing', 'high', '', visitor_id, any(visitor_name), '',
           toUInt32(uniqExact(token_hash)), toString(max(ts))
      FROM recent WHERE kind = 'join_failed' OR attack_class = 'token_probe'
     GROUP BY visitor_id HAVING uniqExact(token_hash) >= 5
    UNION ALL
    SELECT 'discount_squeeze', 'medium', token_hash, any(visitor_id), any(visitor_name), any(proposal_code),
           toUInt32(count()), toString(max(ts))
      FROM recent WHERE attack_class = 'discount_pressure'
     GROUP BY token_hash HAVING count() >= 3
    UNION ALL
    SELECT 'cross_customer_probe', 'high', token_hash, any(visitor_id), any(visitor_name), any(proposal_code),
           toUInt32(count()), toString(max(ts))
      FROM recent WHERE attack_class = 'cross_tenant'
     GROUP BY token_hash HAVING count() >= 2
    UNION ALL
    SELECT 'output_leak', 'critical', token_hash, any(visitor_id), any(visitor_name), any(proposal_code),
           toUInt32(count()), toString(max(ts))
      FROM recent WHERE verdict = 'leak_blocked'
     GROUP BY token_hash
    )
    ORDER BY severity = 'critical' DESC, severity = 'high' DESC, hits DESC
    LIMIT 200`,
    params,
  );
  const { rows: count } = await rows<{ c: string }>(
    `SELECT count() AS c FROM ${DB}.room_events WHERE ts > now64(3) - toIntervalMinute({w:UInt32})`,
    params,
  );
  return {
    detections: found.map((d) => ({ ...d, hits: Number(d.hits), rule_label: RULE_LABELS[d.rule] ?? d.rule })),
    ms,
    scanned: Number(count[0]?.c ?? 0),
  };
}

export async function recordDetections(
  items: { d: Detection; action: string; detail: string }[],
): Promise<void> {
  if (items.length === 0) return;
  await ch().insert({
    table: `${DB}.detections`,
    format: "JSONEachRow",
    values: items.map(({ d, action, detail }) => ({
      rule: d.rule, severity: d.severity, token_hash: d.token_hash, visitor_id: d.visitor_id,
      proposal_code: d.proposal_code, hits: d.hits, action, detail,
    })),
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export async function stats() {
  const totals = await rows<{ events: string; tenants: string; proposals: string; attacks: string; blocked: string; leaks: string }>(`
    SELECT count() AS events, uniq(tenant) AS tenants, uniq(token_hash) AS proposals,
           countIf(attack_class != '') AS attacks, countIf(verdict != 'allowed') AS blocked,
           countIf(verdict = 'leak_blocked') AS leaks
      FROM ${DB}.room_events WHERE ts > now64(3) - INTERVAL 24 HOUR`);
  const timeline = await rows<{ minute: string; legit: string; attacks: string }>(`
    SELECT toString(toStartOfMinute(ts)) AS minute, countIf(attack_class = '') AS legit, countIf(attack_class != '') AS attacks
      FROM ${DB}.room_events WHERE ts > now64(3) - INTERVAL 60 MINUTE
     GROUP BY minute ORDER BY minute`);
  const byClass = await rows<{ attack_class: string; events: string; visitors: string }>(`
    SELECT attack_class, count() AS events, uniq(visitor_id) AS visitors
      FROM ${DB}.room_events WHERE ts > now64(3) - INTERVAL 24 HOUR AND attack_class != ''
     GROUP BY attack_class ORDER BY events DESC`);
  const live = await rows<{ ts: string; visitor_name: string; proposal_code: string; kind: string; attack_class: string; verdict: string; text: string }>(`
    SELECT toString(ts) AS ts, visitor_name, proposal_code, kind, attack_class, verdict, text
      FROM ${DB}.room_events WHERE channel = 'live' AND kind = 'message'
     ORDER BY ts DESC LIMIT 25`);
  const recentDetections = await rows<{ ts: string; rule: string; severity: string; proposal_code: string; visitor_id: string; hits: string; action: string; detail: string }>(`
    SELECT toString(ts) AS ts, rule, severity, proposal_code, visitor_id, hits, action, detail
      FROM ${DB}.detections ORDER BY ts DESC LIMIT 25`);
  const t = totals.rows[0];
  return {
    totals: {
      events: Number(t?.events ?? 0), tenants: Number(t?.tenants ?? 0), proposals: Number(t?.proposals ?? 0),
      attacks: Number(t?.attacks ?? 0), blocked: Number(t?.blocked ?? 0), leaks: Number(t?.leaks ?? 0),
    },
    timeline: timeline.rows.map((r) => ({ minute: r.minute, legit: Number(r.legit), attacks: Number(r.attacks) })),
    by_class: byClass.rows.map((r) => ({
      attack_class: r.attack_class, attack_label: ATTACK_LABELS[r.attack_class] ?? r.attack_class,
      events: Number(r.events), visitors: Number(r.visitors),
    })),
    live: live.rows.map((r) => ({
      ...r, attack_label: ATTACK_LABELS[r.attack_class] ?? r.attack_class, verdict_label: VERDICT_LABELS[r.verdict] ?? r.verdict,
    })),
    detections: recentDetections.rows.map((r) => ({ ...r, hits: Number(r.hits), rule_label: RULE_LABELS[r.rule] ?? r.rule })),
    query_ms: totals.ms + timeline.ms + byClass.ms + live.ms + recentDetections.ms,
  };
}

export async function resetData(): Promise<void> {
  await ch().command({ query: `TRUNCATE TABLE IF EXISTS ${DB}.room_events` });
  await ch().command({ query: `TRUNCATE TABLE IF EXISTS ${DB}.detections` });
}
