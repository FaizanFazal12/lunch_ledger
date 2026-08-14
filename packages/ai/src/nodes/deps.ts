import type { Extractor } from "../llm/extractor.js";
import type { Tools } from "../tools/index.js";

/**
 * Dependencies injected into every node factory.
 *
 * Deliberately excludes the service layer: nodes reach the business layer *only*
 * through `tools`, so the "AI nodes -> Tool Layer -> services -> repositories"
 * rule is enforced by the type system rather than by convention.
 */
export interface AgentDeps {
  extractor: Extractor;
  tools: Tools;
}
