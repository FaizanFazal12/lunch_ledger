import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type LlmProvider = "openrouter" | "gemini" | "mock";

export interface ProviderModel {
  /** A LangChain chat model supporting `.withStructuredOutput`, or null for offline mock. */
  model: BaseChatModel | null;
  provider: LlmProvider;
  modelName: string | null;
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-20b:free";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

/**
 * Chooses the AI provider from environment variables, in priority order:
 *   1. OpenRouter  (OPENROUTER_API_KEY)   — OpenAI-compatible gateway, free models
 *   2. Gemini      (GOOGLE_API_KEY)
 *   3. Mock        (neither set)          — deterministic offline parser
 */
export function createProviderModel(env: NodeJS.ProcessEnv): ProviderModel {
  if (nonEmpty(env.OPENROUTER_API_KEY)) {
    const modelName = nonEmpty(env.OPENROUTER_MODEL)
      ? env.OPENROUTER_MODEL
      : DEFAULT_OPENROUTER_MODEL;
    const model = new ChatOpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      model: modelName,
      temperature: 0,
      configuration: {
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: {
          "HTTP-Referer": "https://lunchledger.local",
          "X-Title": "LunchLedger AI",
        },
      },
    });
    return { model, provider: "openrouter", modelName };
  }

  if (nonEmpty(env.GOOGLE_API_KEY)) {
    const modelName = nonEmpty(env.GEMINI_MODEL) ? env.GEMINI_MODEL : DEFAULT_GEMINI_MODEL;
    const model = new ChatGoogleGenerativeAI({
      apiKey: env.GOOGLE_API_KEY,
      model: modelName,
      temperature: 0,
    });
    return { model, provider: "gemini", modelName };
  }

  return { model: null, provider: "mock", modelName: null };
}
