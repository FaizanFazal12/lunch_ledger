import { END, START, StateGraph } from "@langchain/langgraph";
import { AgentState, type AgentStateType } from "../state/graphState.js";
import type { AgentDeps } from "../nodes/deps.js";
import { makeUnderstandNode } from "../nodes/understand.node.js";
import { makeResolveNode } from "../nodes/resolve.node.js";
import { makeExecuteNode } from "../nodes/execute.node.js";
import { makeRespondNode } from "../nodes/respond.node.js";

/**
 * Assembles the agent pipeline:
 *
 *   START -> understand -> [UNKNOWN? -> respond]
 *                       -> resolve -> [needs clarification? -> respond]
 *                                  -> execute -> respond -> END
 *
 * Each node is independent and single-responsibility, per the design.
 */
export function buildAgentGraph(deps: AgentDeps) {
  const graph = new StateGraph(AgentState)
    .addNode("understand", makeUnderstandNode(deps))
    .addNode("resolve", makeResolveNode(deps))
    .addNode("execute", makeExecuteNode(deps))
    .addNode("respond", makeRespondNode())
    .addEdge(START, "understand")
    .addConditionalEdges("understand", afterUnderstand, {
      resolve: "resolve",
      respond: "respond",
    })
    .addConditionalEdges("resolve", afterResolve, {
      execute: "execute",
      respond: "respond",
    })
    .addEdge("execute", "respond")
    .addEdge("respond", END);

  return graph.compile();
}

function afterUnderstand(state: AgentStateType): "resolve" | "respond" {
  return state.intent === "UNKNOWN" ? "respond" : "resolve";
}

function afterResolve(state: AgentStateType): "execute" | "respond" {
  return state.clarification !== null && state.clarification.length > 0 ? "respond" : "execute";
}
