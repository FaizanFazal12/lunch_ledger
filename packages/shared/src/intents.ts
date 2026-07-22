import { z } from "zod";

/**
 * The set of user intents the AI agent is allowed to detect.
 * The AI classifies into exactly one of these; deterministic code handles the rest.
 */
export const INTENTS = [
  "ADD_EXPENSE",
  "SHOW_BALANCE",
  "SHOW_HISTORY",
  "SETTLE_PAYMENT",
  "WHO_SHOULD_PAY",
  "ADD_MEMBER",
  "CREATE_GROUP",
  "REMOVE_MEMBER",
  "UNKNOWN",
] as const;

export const IntentSchema = z.enum(INTENTS);
export type Intent = z.infer<typeof IntentSchema>;
