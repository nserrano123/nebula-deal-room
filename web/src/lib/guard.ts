// Nebula Shield · deterministic guards around the room agent.
// Input: label what a visitor is trying to do (logged, never trusted to block alone).
// Output: never let another customer's name or a raw secret leave the room.

export type AttackClass = "" | "prompt_injection" | "cross_tenant" | "discount_pressure" | "data_exfil";

const RULES: { cls: Exclude<AttackClass, "">; patterns: RegExp[] }[] = [
  {
    cls: "prompt_injection",
    patterns: [
      /ignore (all|any|the|your)?\s*(previous|prior|above)?\s*(instructions|rules|prompt)/i,
      /(system|developer) (prompt|message|instructions)/i,
      /you are now|act as (an?|the) (admin|developer|owner)|jailbreak|dan mode/i,
      /(reveal|print|show|repeat).{0,40}(prompt|instructions|rules|tools)/i,
      /\b(select|insert|update|delete|drop)\b.{0,40}\b(from|into|table)\b/i,
    ],
  },
  {
    cls: "cross_tenant",
    patterns: [
      /(other|another|different) (customer|client|company|companies|deal|proposal)s?/i,
      /(competitor|competition).{0,30}(price|pricing|deal|proposal|paying)/i,
      /what (did|does|do|are) .{0,40} (pay|paying|get|getting)/i,
      /(list|show).{0,20}(all|every) (customers|clients|proposals|deals)/i,
    ],
  },
  {
    cls: "discount_pressure",
    patterns: [
      /\b(\d{1,2}|fifty|forty|thirty)\s?%\s*(off|discount)/i,
      /(give|apply|approve|authorize|need) .{0,25}discount/i,
      /(natalia|the owner|your boss) (already )?(approved|agreed|said)/i,
      /(free|waive).{0,25}(implementation|license|fee)/i,
    ],
  },
  {
    cls: "data_exfil",
    patterns: [
      /(transcript|recording|full notes|raw notes|meeting notes)/i,
      /(email|phone).{0,30}(of|for) (everyone|all|the people|attendees|stakeholders)/i,
      /(token|link|url|password|api key|connection string)/i,
    ],
  },
];

export function classifyInput(text: string): AttackClass {
  for (const r of RULES) if (r.patterns.some((p) => p.test(text))) return r.cls;
  return "";
}

const SECRET_PATTERNS = [
  /postgres(ql)?:\/\/\S+/gi,
  /sk-ant-[\w-]+/g,
  /\b[0-9a-f]{32}\b/g, // proposal tokens
];

/**
 * Removes anything that must never leave this room: other customers' names and raw secrets.
 * Returns the safe text and whether something was stopped.
 */
export function checkOutput(text: string, otherCompanies: string[]): { text: string; leaked: string[] } {
  const leaked: string[] = [];
  let safe = text;
  for (const name of otherCompanies) {
    const core = name.replace(/\b(S\.?A\.?S\.?|Inc\.?|LLC|Ltd\.?|Partners)\b/gi, "").trim();
    if (core.length < 4) continue;
    const re = new RegExp(core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (re.test(safe)) {
      leaked.push(name);
      safe = safe.replace(re, "[another customer]");
    }
  }
  for (const p of SECRET_PATTERNS) {
    p.lastIndex = 0;
    if (p.test(safe)) {
      leaked.push("secret");
      safe = safe.replace(p, "[redacted]");
    }
  }
  return { text: safe, leaked };
}
