import { Mastra } from "@mastra/core/mastra";
import { dealBriefAgent } from "./agents/deal-brief";

export const mastra = new Mastra({
  agents: { dealBriefAgent },
});
