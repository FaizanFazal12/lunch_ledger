import type { CoreServices } from "@lunchledger/core";
import type { Intent } from "@lunchledger/shared";
import type { LlmProvider } from "./llm/provider.js";
import { createExtractor } from "./llm/extractor.js";
import { createTools } from "./tools/index.js";
import { buildAgentGraph } from "./graph/buildGraph.js";
import type { AgentDeps } from "./nodes/deps.js";

export interface AgentInput {
  message: string;
  groupId: string;
  currentUserId: string | null;
  currentUserName: string | null;
  now?: Date;
}

export interface AgentResult {
  reply: string;
  intent: Intent;
  clarification: string | null;
  data: unknown;
}

export interface Agent {
  /** The active AI provider: "openrouter", "gemini", or "mock" (deterministic offline mode). */
  readonly llm: LlmProvider;
  run(input: AgentInput): Promise<AgentResult>;
}

/**
 * Builds the LunchLedger AI agent over the given business services.
 * The provider (Gemini vs deterministic mock) is chosen from environment variables.
 */
export function createAgent(services: CoreServices, env: NodeJS.ProcessEnv): Agent {
  const extractor = createExtractor(env);
  const deps: AgentDeps = {
    extractor,
    tools: createTools(services),
    services,
  };
  const graph = buildAgentGraph(deps);

  return {
    llm: extractor.kind,
    async run(input: AgentInput): Promise<AgentResult> {
      const final = await graph.invoke({
        message: input.message,
        groupId: input.groupId,
        currentUserId: input.currentUserId,
        currentUserName: input.currentUserName,
        now: input.now ?? new Date(),
      });
      return {
        reply: final.reply,
        intent: final.intent,
        clarification: final.clarification,
        data: final.data,
      };
    },
  };
}
