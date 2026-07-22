import type { CoreServices } from "@lunchledger/core";
import type { Extractor } from "../llm/extractor.js";
import type { Tools } from "../tools/index.js";

/** Dependencies injected into every node factory. */
export interface AgentDeps {
  extractor: Extractor;
  tools: Tools;
  services: CoreServices;
}
