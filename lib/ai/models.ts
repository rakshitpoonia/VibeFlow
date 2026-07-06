/**
 * The only OpenRouter models this app is allowed to call.
 * Keep this list in sync with the chat model dropdown — the API routes
 * reject anything not listed here so arbitrary client-sent model ids
 * can never reach the paid OpenRouter account.
 *
 * This module is imported from client components: constants only, no
 * SDK or env access (that lives in lib/ai/client.ts, server-side).
 */
export const SUPPORTED_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "poolside/laguna-m.1:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

export function isSupportedModel(id: unknown): id is SupportedModel {
  return (
    typeof id === "string" &&
    (SUPPORTED_MODELS as readonly string[]).includes(id)
  );
}

/** Display names for the chat model dropdown. */
export const MODEL_LABELS: Record<SupportedModel, string> = {
  "nvidia/nemotron-3-ultra-550b-a55b:free": "Nemotron 3 Ultra 550B",
  "poolside/laguna-m.1:free": "Poolside Laguna M.1",
  "nvidia/nemotron-3-super-120b-a12b:free": "Nemotron 3 Super 120B",
};

export const DEFAULT_CHAT_MODEL: SupportedModel =
  "nvidia/nemotron-3-super-120b-a12b:free";

/**
 * Fallback order for inline code completion, best first. Completion is
 * latency-critical (ghost text), so ranking weighs speed and completion
 * stability over raw capability:
 *  1. Nemotron 3 Super — 12B active params, lowest latency, strong
 *     instruction following for "code only" constraints.
 *  2. Laguna M.1 — code-specialized, high completion quality, a bit slower.
 *  3. Nemotron 3 Ultra — most capable but 55B active params; too slow to
 *     lead for ghost text, kept as the last resort.
 */
export const COMPLETION_MODELS: readonly SupportedModel[] = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "poolside/laguna-m.1:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];
