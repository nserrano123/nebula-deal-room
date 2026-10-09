import { Mastra } from "@mastra/core/mastra";
import { dealBriefAgent } from "./agents/deal-brief";
import { roomHostAgent } from "./agents/room-host";
import { proposalWriterAgent } from "./agents/proposal-writer";

export const mastra = new Mastra({
  agents: { dealBriefAgent, roomHostAgent, proposalWriterAgent },
});
