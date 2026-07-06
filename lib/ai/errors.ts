import { APICallError, RetryError } from "ai";

/**
 * User-facing notice shown when OpenRouter returns HTTP 429. The free-tier
 * models share a daily request quota, so this is expected to happen from
 * time to time rather than being a hard failure.
 */
export const RATE_LIMIT_CHAT_MESSAGE =
  "⚠️ **Rate limit reached.** The free AI models have a shared daily usage quota that's currently exhausted. Please try again later.";

/** Same notice, shortened to fit as a single ghost-text comment line. */
export const RATE_LIMIT_COMPLETION_MESSAGE =
  "AI rate limit reached — quota exhausted, try again later";

/**
 * Detects an OpenRouter/provider rate-limit (HTTP 429). The AI SDK surfaces
 * these either directly as an `APICallError` or, after its internal retries,
 * wrapped in a `RetryError`. Falls back to a message check for anything the
 * class guards miss.
 */
export function isRateLimitError(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    return error.statusCode === 429;
  }
  if (RetryError.isInstance(error)) {
    return isRateLimitError(error.lastError);
  }
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|rate limit|quota|free-models-per-day/i.test(message);
}

/**
 * Wraps a message in a language-appropriate single-line comment so that, if a
 * user accepts the ghost text with Tab, it stays syntactically harmless.
 */
export function toCommentLine(message: string, language: string): string {
  switch (language) {
    case "Python":
      return `# ${message}`;
    case "CSS":
    case "JSON":
      return `/* ${message} */`;
    case "HTML":
      return `<!-- ${message} -->`;
    default:
      return `// ${message}`;
  }
}
