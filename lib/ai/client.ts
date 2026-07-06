import {
  createOpenRouter,
  type OpenRouterProvider,
} from "@openrouter/ai-sdk-provider";

let provider: OpenRouterProvider | null = null;

/**
 * Lazily constructed OpenRouter provider. The API key is read at request
 * time, not module-load time, so `next build` succeeds on machines (and
 * Vercel build steps) where OPENROUTER_API_KEY is not exposed.
 */
export function getOpenRouter(): OpenRouterProvider {
  if (!provider) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. Add it to .env locally and to the Vercel project environment variables.",
      );
    }
    provider = createOpenRouter({ apiKey });
  }
  return provider;
}
