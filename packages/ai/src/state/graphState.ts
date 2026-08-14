import { Annotation } from "@langchain/langgraph";
import type { DateRange } from "@lunchledger/core";
import type { Extraction, Intent } from "@lunchledger/shared";

/** Deterministic resolution output consumed by the executor node. */
export interface ResolvedInput {
  payerId: string | null;
  participantUserIds: string[];
  guestNames: string[];
  settleFromId: string | null;
  settleToId: string | null;
  occurredAt: Date;
  /** Window for history queries, or null when the message named no period. */
  dateRange: DateRange | null;
  /** Names the resolver could not map to a member — triggers a clarification. */
  unknownNames: string[];
}

const lastValue = <T>(defaultValue: () => T) => ({
  reducer: (_prev: T, next: T): T => next,
  default: defaultValue,
});

/**
 * The channels flowing through the LangGraph pipeline:
 *   understand -> resolve -> execute -> respond
 * Each node is independent and writes only the channels it owns.
 */
export const AgentState = Annotation.Root({
  // --- inputs ---
  message: Annotation<string>(),
  groupId: Annotation<string>(),
  currentUserId: Annotation<string | null>(),
  currentUserName: Annotation<string | null>(),
  now: Annotation<Date>(),

  // --- produced by nodes ---
  intent: Annotation<Intent>(lastValue<Intent>(() => "UNKNOWN")),
  extraction: Annotation<Extraction | null>(lastValue<Extraction | null>(() => null)),
  resolved: Annotation<ResolvedInput | null>(lastValue<ResolvedInput | null>(() => null)),
  clarification: Annotation<string | null>(lastValue<string | null>(() => null)),
  data: Annotation<unknown>(lastValue<unknown>(() => null)),
  reply: Annotation<string>(lastValue<string>(() => "")),
});

export type AgentStateType = typeof AgentState.State;
export type AgentStateUpdate = Partial<AgentStateType>;
