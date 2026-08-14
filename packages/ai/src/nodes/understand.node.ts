import type { AgentDeps } from "./deps.js";
import type { AgentStateType, AgentStateUpdate } from "../state/graphState.js";

/**
 * Understanding node (Intent Detection + Entity Extraction).
 * The LLM reads the message and returns a fully structured Extraction. It performs
 * NO math and NO database access — it only interprets language.
 */
export function makeUnderstandNode(deps: AgentDeps) {
  return async function understand(state: AgentStateType): Promise<AgentStateUpdate> {
    const members = await deps.tools.getMembers({ groupId: state.groupId });
    const extraction = await deps.extractor.extract(state.message, {
      members: members.map((m) => m.name),
      currentUserName: state.currentUserName,
    });
    return { extraction, intent: extraction.intent };
  };
}
