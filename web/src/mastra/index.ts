import { Mastra } from "@mastra/core/mastra";
import { dealBriefAgent } from "./agents/deal-brief";
import { roomHostAgent } from "./agents/room-host";

export const mastra = new Mastra({
  agents: { dealBriefAgent, roomHostAgent },
});
