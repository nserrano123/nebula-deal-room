// One turn in a proposal room, with every layer of Nebula Shield around the agent.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { runRoomTurn } from "@/mastra/agents/room-host";
import { ATTACK_LABELS, VERDICT_LABELS, logEvents, type RoomEvent } from "./clickhouse";
import { NebulaError, TENANT_CODE } from "./db";
import { checkOutput, classifyInput } from "./guard";
import { isWellFormedToken, otherCompanies, roomCall, tokenHash } from "./room-db";

export const visitorId = (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const ua = req.headers.get("user-agent") ?? "";
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 16);
};

// The person context returned at join is signed, so a visitor cannot edit it to inject instructions.
const key = () => createHash("sha256").update(`nebula-room|${process.env.DATABASE_URL ?? ""}`).digest();
export const sign = (data: unknown) => createHmac("sha256", key()).update(JSON.stringify(data)).digest("hex");
export function verify(data: unknown, sig: string): boolean {
  const expected = Buffer.from(sign(data), "hex");
  const given = Buffer.from(sig ?? "", "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type Base = { token: string; visitor_id: string; visitor_name: string; channel: "live" | "simulated" };

function base(b: Base, proposal_code: string): Omit<RoomEvent, "kind" | "verdict"> {
  return {
    tenant: TENANT_CODE,
    proposal_code,
    token_hash: isWellFormedToken(b.token) ? tokenHash(b.token) : tokenHash(b.token.slice(0, 64)),
    visitor_id: b.visitor_id,
    visitor_name: b.visitor_name,
    channel: b.channel,
  };
}

export async function openRoom(b: Base) {
  const t0 = Date.now();
  try {
    if (!isWellFormedToken(b.token)) throw new NebulaError("This proposal link is not valid.");
    const proposal = await roomCall<Record<string, unknown>>("fn_public_proposal", [b.token]);
    return { proposal };
  } catch (e) {
    await logEvents([{ ...base(b, ""), kind: "join_failed", attack_class: "token_probe", verdict: "blocked", latency_ms: Date.now() - t0, text: (e as Error).message }]);
    throw e;
  }
}

export async function joinRoom(b: Base, who: { name: string; email?: string | null; title?: string | null; role?: string | null }) {
  const { proposal } = await openRoom(b);
  const person = await roomCall<Record<string, unknown>>(
    "fn_join_room",
    [b.token, who.name, who.email || null, who.title || null, who.role || "OT"],
    ["text", "text", "text", "text", "char"],
  );
  await logEvents([{ ...base(b, String(proposal.proposal_code)), kind: "join", verdict: "allowed", text: `${who.name} joined` }]);
  const ctx = { proposal, person };
  return { ...ctx, sig: sign(ctx) };
}

export type TurnResult = {
  reply: string;
  attack_class: string;
  attack_label: string;
  verdict: string;
  verdict_label: string;
  leaked: string[];
  tools: { tool: string; ok: boolean }[];
  latency_ms: number;
};

export async function roomTurn(
  b: Base,
  ctx: { proposal: Record<string, unknown>; person: Record<string, unknown> },
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<TurnResult> {
  const t0 = Date.now();
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const attack = classifyInput(last);
  const proposalCode = String(ctx.proposal.proposal_code);
  const ev = base(b, proposalCode);
  const tools: { tool: string; ok: boolean }[] = [];

  // Revoked or invalid links stop here, before the model sees anything.
  await openRoom(b);

  const raw = await runRoomTurn(
    {
      token: b.token,
      stakeholder_code: String(ctx.person.stakeholder_code),
      proposal: ctx.proposal,
      person: ctx.person,
      onToolCall: (tool, ok) => tools.push({ tool, ok }),
    },
    messages.slice(-12),
  );
  const { text, leaked } = checkOutput(raw, await otherCompanies(b.token));
  const verdict = leaked.length > 0 ? "leak_blocked" : attack ? "blocked" : "allowed";
  const latency = Date.now() - t0;

  await logEvents([
    { ...ev, kind: "message", attack_class: attack, verdict: attack ? "blocked" : "allowed", text: last },
    ...tools.map((t) => ({ ...ev, kind: "tool_call" as const, tool: t.tool, verdict: t.ok ? ("allowed" as const) : ("blocked" as const) })),
    { ...ev, kind: "response", attack_class: attack, verdict, latency_ms: latency, text },
  ]);

  return {
    reply: text,
    attack_class: attack,
    attack_label: ATTACK_LABELS[attack] ?? attack,
    verdict,
    verdict_label: VERDICT_LABELS[verdict] ?? verdict,
    leaked,
    tools,
    latency_ms: latency,
  };
}
