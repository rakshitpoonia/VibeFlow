import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { getOpenRouter } from "@/lib/ai/client";
import { DEFAULT_CHAT_MODEL, isSupportedModel } from "@/lib/ai/models";
import { isRateLimitError, RATE_LIMIT_CHAT_MESSAGE } from "@/lib/ai/errors";

export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  model?: string;
}

const SYSTEM_PROMPT = `You are a concise AI programming assistant inside a web IDE.
- Lead with the answer or the code; skip preamble and filler.
- Use markdown code blocks with language tags for all code.
- Keep prose short and practical; explain only what the user needs to act.
- Maintain continuity with the conversation history when it is relevant.
- If a request is ambiguous, state your assumption in one line and proceed.`;

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequest = await req.json();
    const { message, history = [], model } = body;

    // Validate input
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 },
      );
    }

    // Validate history format
    const validHistory = Array.isArray(history)
      ? history.filter(
          (msg) =>
            msg &&
            typeof msg === "object" &&
            typeof msg.role === "string" &&
            typeof msg.content === "string" &&
            ["user", "assistant"].includes(msg.role),
        )
      : [];

    const recentHistory = validHistory.slice(-10);

    // Only allowlisted models may hit the OpenRouter account
    const modelId = isSupportedModel(model) ? model : DEFAULT_CHAT_MODEL;

    const result = await generateText({
      // Reasoning off: these hybrid models otherwise leak deliberation text
      // into the reply and multiply response latency.
      model: getOpenRouter().chat(modelId, {
        reasoning: { enabled: false, effort: "none" },
      }),
      system: SYSTEM_PROMPT,
      messages: [...recentHistory, { role: "user", content: message }],
      temperature: 0.7,
      maxOutputTokens: 1000,
    });

    return NextResponse.json({
      response: result.text.trim(),
      model: modelId,
      tokens: result.usage?.totalTokens,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat API Error:", error);

    // Free models share a daily quota; surface a clear, retryable notice.
    if (isRateLimitError(error)) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message: RATE_LIMIT_CHAT_MESSAGE,
          timestamp: new Date().toISOString(),
        },
        { status: 429 },
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: "Failed to generate AI response",
        details: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
