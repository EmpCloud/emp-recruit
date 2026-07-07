// ============================================================================
// AI PROVIDER — provider-agnostic LLM caller.
//
// One `callLLM(prompt)` that works with WHATEVER LLM the operator configures via
// environment variables. No SDKs — plain fetch — so adding a provider is just a
// branch. Auto-detects the active provider from the API keys present, or honours
// an explicit AI_PROVIDER override.
//
// Supported providers (set the matching key in the repo-root .env):
//   AI_PROVIDER=openai        OPENAI_API_KEY=sk-...        [AI_MODEL=gpt-4o-mini]
//   AI_PROVIDER=anthropic     ANTHROPIC_API_KEY=sk-ant-... [AI_MODEL=claude-sonnet-5]
//   AI_PROVIDER=gemini        GEMINI_API_KEY=...           [AI_MODEL=gemini-2.0-flash]
//   AI_PROVIDER=compatible    OPENAI_API_KEY=...  OPENAI_BASE_URL=https://api.groq.com/openai/v1
//                             (Groq, OpenRouter, Together, Ollama, LM Studio, vLLM, …)
//
// If no key is configured, callLLM() throws NoProviderError and callers fall back
// to the deterministic heuristic scorer.
// ============================================================================

import { logger } from "../../utils/logger";
import { AppError } from "../../utils/errors";

export type AiProvider = "openai" | "anthropic" | "gemini" | "compatible";

export class NoProviderError extends Error {
  constructor() {
    super("No AI provider configured (set AI_PROVIDER + the matching API key in .env)");
    this.name = "NoProviderError";
  }
}

// A clean, user-facing AI error. Extends AppError so the global error handler
// returns the friendly `message` + status. The message is ALWAYS safe to show
// an end user — it never leaks provider internals, keys, model slugs, or raw JSON.
export class AiUnavailableError extends AppError {
  constructor(message: string, statusCode = 503) {
    super(statusCode, "AI_UNAVAILABLE", message);
    this.name = "AiUnavailableError";
  }
}

// Map any raw AI/provider error into a friendly, safe message for users.
// Distinguishes the common cases (busy/rate-limited, timeout, auth/config,
// bad output) so the message is actionable without exposing internals.
export function friendlyAiError(err: unknown): AiUnavailableError {
  if (err instanceof AiUnavailableError) return err;
  if (err instanceof NoProviderError) {
    return new AiUnavailableError(
      "AI features aren't set up yet. Please contact your administrator to enable them.",
      503,
    );
  }
  const raw = (err instanceof Error ? err.message : String(err || "")).toLowerCase();

  if (/429|rate.?limit|exhaust|overload|temporarily|too many requests|quota/.test(raw)) {
    return new AiUnavailableError(
      "The AI service is busy right now. Please wait a few seconds and try again.",
      503,
    );
  }
  if (/timeout|timed out|aborted|etimedout/.test(raw)) {
    return new AiUnavailableError(
      "The AI took too long to respond. Please try again in a moment.",
      504,
    );
  }
  if (/401|403|invalid.?api.?key|unauthorized|no ai provider|not configured/.test(raw)) {
    return new AiUnavailableError(
      "AI features aren't available right now. Please contact your administrator.",
      503,
    );
  }
  if (/no parseable json|did not return|empty|unusable/.test(raw)) {
    return new AiUnavailableError(
      "The AI couldn't produce a usable result this time. Please try again.",
      502,
    );
  }
  // Anything else — generic, never leak the raw text.
  return new AiUnavailableError(
    "Something went wrong with the AI service. Please try again shortly.",
    502,
  );
}

interface ResolvedProvider {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

// Sensible default models per provider (overridable via AI_MODEL).
const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-2.0-flash",
  compatible: "gpt-4o-mini",
};

/**
 * Figure out which provider to use. Explicit AI_PROVIDER wins; otherwise pick the
 * first provider whose key is present. Returns null when nothing is configured.
 */
export function resolveProvider(): ResolvedProvider | null {
  const explicit = (process.env.AI_PROVIDER || "").toLowerCase().trim() as AiProvider | "";
  const model = process.env.AI_MODEL?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || process.env.AI_BASE_URL?.trim();

  const build = (provider: AiProvider, apiKey?: string): ResolvedProvider | null => {
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: model || DEFAULT_MODELS[provider],
      baseUrl: provider === "compatible" || provider === "openai" ? baseUrl : undefined,
    };
  };

  // Explicit override.
  if (explicit === "openai") return build("openai", openaiKey);
  if (explicit === "anthropic") return build("anthropic", anthropicKey);
  if (explicit === "gemini") return build("gemini", geminiKey);
  if (explicit === "compatible") return build("compatible", openaiKey);

  // Auto-detect: first key wins (Anthropic first since it was the original).
  return (
    build("anthropic", anthropicKey) ||
    build("openai", openaiKey) ||
    build("gemini", geminiKey) ||
    null
  );
}

export function isAiConfigured(): boolean {
  return resolveProvider() !== null;
}

/** Human-readable label of what's active, for logs / a settings "test" endpoint. */
export function activeProviderLabel(): string {
  const p = resolveProvider();
  return p ? `${p.provider}:${p.model}` : "none (heuristic)";
}

/**
 * Send a single-prompt completion to the active provider and return the raw text.
 * `opts.json` hints the model to return JSON (uses native JSON mode where supported).
 */
export async function callLLM(
  prompt: string,
  opts: { maxTokens?: number; temperature?: number; json?: boolean; timeoutMs?: number; maxAttempts?: number } = {},
): Promise<string> {
  const p = resolveProvider();
  if (!p) throw new NoProviderError();

  const maxTokens = opts.maxTokens ?? 1500;
  const temperature = opts.temperature ?? 0.2;
  const timeoutMs = opts.timeoutMs ?? 90_000; // hard per-request ceiling
  // Free tiers (esp. OpenRouter ":free") 429 frequently, so retry generously —
  // the overall timeout still caps total time, and fast models retry cheaply.
  const maxAttempts = opts.maxAttempts ?? 6;

  switch (p.provider) {
    case "anthropic":
      return callAnthropic(p, prompt, maxTokens, temperature, timeoutMs);
    case "gemini":
      return callGemini(p, prompt, maxTokens, temperature, opts.json, timeoutMs);
    case "openai":
    case "compatible":
      return callOpenAICompatible(p, prompt, maxTokens, temperature, opts.json, timeoutMs, maxAttempts);
    default:
      throw new NoProviderError();
  }
}

// --- Anthropic (Messages API) ----------------------------------------------
async function callAnthropic(p: ResolvedProvider, prompt: string, maxTokens: number, temperature: number, timeoutMs = 90_000): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": p.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: p.model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json();
  return json?.content?.[0]?.text || "";
}

// --- OpenAI + OpenAI-compatible (Chat Completions) -------------------------
// Handles OpenRouter, Groq, Together, local servers, etc. Free tiers (esp.
// OpenRouter ":free" models) return 429 under load, so we retry with backoff
// before giving up; a persistent failure bubbles up and the caller falls back
// to its heuristic/honest path.
async function callOpenAICompatible(
  p: ResolvedProvider,
  prompt: string,
  maxTokens: number,
  temperature: number,
  json?: boolean,
  timeoutMs = 90_000,
  maxAttempts = 4,
): Promise<string> {
  const base = (p.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const isOpenRouter = /openrouter\.ai/i.test(base);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${p.apiKey}`,
  };
  // OpenRouter uses these to attribute traffic and grant better free-tier limits.
  if (isOpenRouter) {
    headers["HTTP-Referer"] = process.env.PUBLIC_APP_URL || "http://localhost:5179";
    headers["X-Title"] = "EMP Recruit";
  }

  const body: any = {
    model: p.model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: prompt }],
  };
  if (json) body.response_format = { type: "json_object" };

  const MAX_ATTEMPTS = maxAttempts;
  const deadline = Date.now() + timeoutMs; // overall budget across all attempts
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (Date.now() >= deadline) { lastErr = lastErr || "timed out"; break; }
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        // Per-attempt timeout bounded by the remaining overall budget.
        signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
      });
    } catch (err: any) {
      lastErr = err?.name === "TimeoutError" || err?.name === "AbortError" ? "request timed out" : String(err?.message || err);
      break; // timeout/network — stop; caller falls back
    }

    let transient = false;
    if (res.ok) {
      const j: any = await res.json();
      // OpenRouter/aggregators frequently return upstream errors as HTTP 200
      // with an `error` field (e.g. "ResourceExhausted", 429/502/503). Treat
      // rate-limit / exhausted / 5xx nested codes as transient and retry.
      if (j?.error) {
        const errCode = Number(j.error.code) || 0;
        const errMsg = String(j.error.message || JSON.stringify(j.error)).slice(0, 200);
        lastErr = `200-body-error(${errCode}): ${errMsg}`;
        transient = errCode === 429 || errCode >= 500 || /rate.?limit|exhaust|overload|temporarily|unavailable|try again/i.test(errMsg);
      } else {
        return j?.choices?.[0]?.message?.content || "";
      }
    } else {
      const text = (await res.text()).slice(0, 400);
      lastErr = `${res.status}: ${text}`;
      // 400 with response_format unsupported → retry once without it.
      if (json && res.status === 400 && /response_format/i.test(text)) {
        delete body.response_format;
        continue;
      }
      transient = res.status === 429 || res.status >= 500;
    }

    if (transient && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      // Exponential-ish backoff; free tiers need a moment to free a worker.
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 1200 * attempt);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    break; // non-transient error, or out of attempts
  }
  throw new Error(`${p.provider} ${lastErr}`);
}

// --- Google Gemini (generateContent) ---------------------------------------
async function callGemini(
  p: ResolvedProvider,
  prompt: string,
  maxTokens: number,
  temperature: number,
  json?: boolean,
  timeoutMs = 90_000,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent?key=${p.apiKey}`;
  const body: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  };
  if (json) body.generationConfig.responseMimeType = "application/json";

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j: any = await res.json();
  return j?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join("") || "";
}

// Log the resolved provider once at import so operators can confirm config.
logger.info(`AI provider: ${activeProviderLabel()}`);
