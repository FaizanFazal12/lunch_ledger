import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ExtractionSchema, type Extraction, type Intent } from "@lunchledger/shared";
import { buildExtractionSystemPrompt, type PromptContext } from "../prompts/extraction.prompt.js";
import { createProviderModel, type LlmProvider } from "./provider.js";

export interface ExtractContext {
  members: string[];
  currentUserName: string | null;
}

/** Turns a natural-language message into a structured Extraction. */
export interface Extractor {
  readonly kind: LlmProvider;
  extract(message: string, context: ExtractContext): Promise<Extraction>;
}

/**
 * Chooses a provider from the environment (OpenRouter > Gemini > mock).
 * Real providers share one implementation via LangChain's `withStructuredOutput`.
 */
export function createExtractor(env: NodeJS.ProcessEnv): Extractor {
  const { model, provider } = createProviderModel(env);
  return model === null ? new MockExtractor() : new StructuredExtractor(model, provider);
}

/** Extractor backed by any LangChain chat model that supports structured output. */
class StructuredExtractor implements Extractor {
  constructor(
    private readonly model: BaseChatModel,
    readonly kind: LlmProvider,
  ) {}

  async extract(message: string, context: ExtractContext): Promise<Extraction> {
    const promptCtx: PromptContext = {
      members: context.members,
      currentUserName: context.currentUserName,
    };
    const structured = this.model.withStructuredOutput(ExtractionSchema, {
      name: "expense_message_interpretation",
    });
    const raw = await structured.invoke([
      { role: "system", content: buildExtractionSystemPrompt(promptCtx) },
      { role: "user", content: message },
    ]);
    // Defensive re-validation: never trust model output shape blindly.
    return ExtractionSchema.parse(raw);
  }
}

/**
 * Deterministic, offline heuristic parser used when no API key is configured.
 * It is intentionally simple — enough to run the graph and business logic without
 * network access (tests/CI/demo). Real understanding is Gemini's job.
 */
export class MockExtractor implements Extractor {
  readonly kind = "mock" as const;

  async extract(message: string, context: ExtractContext): Promise<Extraction> {
    return Promise.resolve(parseHeuristically(message, context));
  }
}

function base(): Extraction {
  return {
    intent: "UNKNOWN",
    amount: null,
    payer: null,
    participantMode: "unspecified",
    names: [],
    excluded: [],
    settleFrom: null,
    settleTo: null,
    targetName: null,
    dateText: null,
    description: null,
  };
}

function parseHeuristically(message: string, ctx: ExtractContext): Extraction {
  const text = message.trim();
  const lower = text.toLowerCase();
  const out = base();

  const memberByLower = new Map<string, string>();
  for (const m of ctx.members) memberByLower.set(m.toLowerCase(), m);

  const amountMatch = /(\d+(?:\.\d+)?)/.exec(lower);
  const amount = amountMatch ? Number.parseFloat(amountMatch[1] as string) : null;

  const dateText = /\byesterday\b/.test(lower)
    ? "yesterday"
    : /\btoday\b/.test(lower)
      ? "today"
      : null;
  out.dateText = dateText;

  // Names mentioned (members + self references), in the order they appear.
  const mentioned = findMentionedNames(text, ctx.members);
  const hasSelf = /\b(me|myself|i)\b/i.test(text);

  out.intent = detectIntent(lower, amount, memberByLower);

  switch (out.intent) {
    case "SETTLE_PAYMENT": {
      out.amount = amount;
      const settle = parseSettlement(text, ctx.members);
      out.settleFrom = settle.from;
      out.settleTo = settle.to;
      break;
    }
    case "ADD_EXPENSE": {
      out.amount = amount;
      out.payer = detectPayer(text, ctx.members);
      applyParticipants(out, text, lower, mentioned, hasSelf, ctx.members);
      break;
    }
    case "ADD_MEMBER":
    case "REMOVE_MEMBER": {
      out.targetName = mentioned[0] ?? firstUnknownName(text, ctx.members);
      break;
    }
    case "CREATE_GROUP": {
      out.targetName = extractGroupName(text);
      break;
    }
    default:
      break;
  }

  return ExtractionSchema.parse(out);
}

function detectIntent(
  lower: string,
  amount: number | null,
  memberByLower: Map<string, string>,
): Intent {
  if (/\bgave\b/.test(lower) || isSettlePaid(lower, memberByLower)) return "SETTLE_PAYMENT";
  if (/\bbalances?\b/.test(lower) || /\bowes?\b/.test(lower) || /who owes/.test(lower)) {
    return "SHOW_BALANCE";
  }
  if (/who should pay/.test(lower)) return "WHO_SHOULD_PAY";
  if (/\bhistory\b/.test(lower) || /show .*(expenses|lunches)/.test(lower)) {
    return "SHOW_HISTORY";
  }
  if (/create .*group/.test(lower)) return "CREATE_GROUP";
  if (/\bremove\b/.test(lower)) return "REMOVE_MEMBER";
  if (/\badd\b.*\b(member|permanently|temporarily)\b/.test(lower)) return "ADD_MEMBER";
  if (amount !== null && /\bpaid\b/.test(lower)) return "ADD_EXPENSE";
  if (/\bpaid\b/.test(lower) || /\blunch\b/.test(lower)) return "ADD_EXPENSE";
  return "UNKNOWN";
}

/** "paid <member> <number>" => settlement (person before number). */
function isSettlePaid(lower: string, memberByLower: Map<string, string>): boolean {
  const m = /paid\s+([a-z]+)\s+\d/.exec(lower);
  return m !== null && memberByLower.has(m[1] as string);
}

function detectPayer(text: string, members: string[]): string | null {
  const lower = text.toLowerCase();
  if (/\bi paid\b/.test(lower) || /\bme paid\b/.test(lower)) return "me";
  const m = /\b([A-Za-z]+)\s+paid\b/.exec(text);
  if (m) {
    const name = m[1] as string;
    if (/^(i|me)$/i.test(name)) return "me";
    const member = members.find((mem) => mem.toLowerCase() === name.toLowerCase());
    if (member) return member;
  }
  // "paid for everyone" preceded by a name handled above; fall back to self if present.
  if (/\b(me|myself|i)\b/i.test(text)) return "me";
  return null;
}

function applyParticipants(
  out: Extraction,
  text: string,
  lower: string,
  mentioned: string[],
  hasSelf: boolean,
  members: string[],
): void {
  if (/\bexcept\b/.test(lower)) {
    out.participantMode = "all_except";
    const afterExcept = text.slice(lower.indexOf("except") + "except".length);
    out.excluded = findMentionedNames(afterExcept, members);
    return;
  }
  if (/\beveryone\b/.test(lower) || /\ball of us\b/.test(lower) || /\beverybody\b/.test(lower)) {
    out.participantMode = "all";
    return;
  }

  // Only treat mentions as an explicit participant *list* when there's a list signal.
  // Otherwise a bare "Ali paid 2500" means everyone, not "only Ali".
  const hasSelfWord = /\b(himself|herself|themselves)\b/.test(lower);
  const listSignal =
    /\bonly\b/.test(lower) ||
    /\band\b/.test(lower) ||
    text.includes(",") ||
    hasSelfWord ||
    mentioned.length > 1;

  if (!listSignal) {
    out.participantMode = "unspecified";
    return;
  }

  const names: string[] = [...mentioned];
  // "himself"/"herself" => include the payer as a participant.
  if (hasSelfWord && out.payer && out.payer !== "me" && !names.includes(out.payer)) {
    names.unshift(out.payer);
  }
  if (hasSelf && !names.includes("me")) names.push("me");

  out.participantMode = "only";
  out.names = names;
}

function parseSettlement(
  text: string,
  members: string[],
): { from: string | null; to: string | null } {
  // "<from> paid <to> <amount>"  |  "<from> gave <to> <amount>"
  const m = /\b([a-z]+)\s+(?:paid|gave)\s+([a-z]+)\b/i.exec(text);
  if (m) {
    const from = normalizePerson(m[1] as string, members);
    const to = normalizePerson(m[2] as string, members);
    return { from, to };
  }
  return { from: null, to: null };
}

function normalizePerson(raw: string, members: string[]): string | null {
  if (/^(i|me|myself)$/i.test(raw)) return "me";
  const member = members.find((m) => m.toLowerCase() === raw.toLowerCase());
  return member ?? null;
}

// Words that look like capitalised names but are really keywords/sentence starts.
const NAME_STOPWORDS = new Set([
  "only", "everyone", "everybody", "show", "paid", "gave", "for", "and", "the",
  "today", "yesterday", "add", "remove", "create", "group", "who", "should",
  "pay", "balance", "balances", "history", "lunch", "lunches", "went", "had",
  "all", "of", "us", "except", "member", "permanently", "temporarily", "me",
  "myself", "i", "self", "settled", "up",
]);

/**
 * Names referenced in the text, in order of appearance: members (canonicalised),
 * self-references ("me"), and unknown capitalised names (verbatim) so the resolver
 * can flag them for clarification.
 */
function findMentionedNames(text: string, members: string[]): string[] {
  const found: string[] = [];
  for (const token of text.split(/[^A-Za-z]+/)) {
    if (token.length === 0) continue;
    const lower = token.toLowerCase();
    if (/^(me|myself|i)$/.test(lower)) {
      if (!found.includes("me")) found.push("me");
      continue;
    }
    const member = members.find((m) => m.toLowerCase() === lower);
    if (member) {
      if (!found.includes(member)) found.push(member);
      continue;
    }
    // Unknown capitalised token that isn't a keyword -> treat as an unknown name.
    if (/^[A-Z][a-z]+$/.test(token) && !NAME_STOPWORDS.has(lower) && !found.includes(token)) {
      found.push(token);
    }
  }
  return found;
}

function firstUnknownName(text: string, members: string[]): string | null {
  const memberSet = new Set(members.map((m) => m.toLowerCase()));
  for (const m of text.matchAll(/\b([A-Z][a-z]+)\b/g)) {
    const name = m[1] as string;
    if (!memberSet.has(name.toLowerCase())) return name;
  }
  return null;
}

function extractGroupName(text: string): string | null {
  const quoted = /["'“”]([^"'“”]+)["'“”]/.exec(text);
  if (quoted) return (quoted[1] as string).trim();
  const after = /group\s+(?:called\s+|named\s+)?([A-Za-z][A-Za-z\s]+)/i.exec(text);
  return after ? (after[1] as string).trim() : null;
}
