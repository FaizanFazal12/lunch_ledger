import { z } from "zod";
import { IntentSchema } from "./intents.js";

/**
 * How the set of expense participants was expressed in natural language.
 * The Participant Resolver node turns this + `names` into concrete member ids.
 *
 * - "all"          -> everyone in the group ("everyone", "all of us", "everyone had lunch")
 * - "all_except"   -> everyone except `excluded` ("everyone except Hamza")
 * - "only"         -> exactly the people in `names` ("only Ali and Ahmed went")
 * - "unspecified"  -> not stated; resolver decides a sensible default (usually everyone)
 */
export const ParticipantModeSchema = z.enum([
  "all",
  "all_except",
  "only",
  "unspecified",
]);
export type ParticipantMode = z.infer<typeof ParticipantModeSchema>;

// Some models emit "" for "not applicable" optional fields instead of null, and may
// include blank entries in string arrays. These helpers normalise that before validation.
const emptyToNull = (v: unknown): unknown =>
  typeof v === "string" && v.trim().length === 0 ? null : v;

/**
 * These are factories, not shared constants, and must stay that way.
 *
 * `withStructuredOutput` converts this schema to JSON Schema, and the converter
 * deduplicates by object identity: a schema instance used for more than one field
 * becomes a `$ref` pointing at the first occurrence. Gemini's `response_schema`
 * rejects `$ref` outright ("Unknown name \"$ref\""), so reusing one instance across
 * `payer`/`settleFrom` or `names`/`excluded` breaks the Gemini provider entirely.
 * A fresh instance per field keeps the emitted JSON Schema fully inlined.
 */

/** A nullable string field that treats "" / whitespace as null. */
function optionalName() {
  return z.preprocess(emptyToNull, z.string().min(1).nullable());
}

/**
 * An array of non-empty strings. Tolerates models that emit a single string
 * ("Hamza") or a comma-joined string ("Hamza, Ali") instead of a JSON array,
 * and drops blank/whitespace entries.
 */
function nameList() {
  return z.preprocess((v: unknown) => {
    const clean = (arr: unknown[]): string[] =>
      arr
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
    if (Array.isArray(v)) return clean(v);
    if (typeof v === "string") return clean(v.split(","));
    if (v === null || v === undefined) return [];
    return v;
  }, z.array(z.string().min(1)));
}

/**
 * The AI's structured understanding of a single user message.
 *
 * This is the ONLY thing the LLM produces. It never computes money, splits,
 * or balances — those are deterministic and live in @lunchledger/core.
 *
 * Names are captured verbatim as the user said them (e.g. "Ali", "me", "Bilal").
 * "me" / "myself" / "I" are normalised to the literal string "me" by the model
 * and resolved to the current user downstream.
 */
export const ExtractionSchema = z.object({
  intent: IntentSchema,

  /** Total amount of money mentioned, in whole currency units (e.g. 2500). Null if none. */
  amount: z.number().nonnegative().nullable(),

  /** Who paid. A member name, the literal "me", or null if not stated. */
  payer: optionalName(),

  /** How participants were expressed. */
  participantMode: ParticipantModeSchema,

  /** Names explicitly referenced as participants (used for "only" mode and extra additions). */
  names: nameList(),

  /** Names to exclude (used for "all_except" mode). */
  excluded: nameList(),

  /** For SETTLE_PAYMENT: who is paying. Member name or "me". */
  settleFrom: optionalName(),

  /** For SETTLE_PAYMENT: who is being paid. Member name or "me". */
  settleTo: optionalName(),

  /** For ADD_MEMBER / REMOVE_MEMBER / CREATE_GROUP: the target name. */
  targetName: optionalName(),

  /** Natural-language date reference, e.g. "today", "yesterday", "last friday". Null if none. */
  dateText: optionalName(),

  /** Free-text description of the expense, if any. */
  description: optionalName(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
