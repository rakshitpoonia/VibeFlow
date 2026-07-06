import { type NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { getOpenRouter } from "@/lib/ai/client";
import { COMPLETION_MODELS } from "@/lib/ai/models";
import {
  isRateLimitError,
  RATE_LIMIT_COMPLETION_MESSAGE,
  toCommentLine,
} from "@/lib/ai/errors";

export const maxDuration = 60;

interface CodeSuggestionRequest {
  fileContent: string;
  cursorLine: number;
  cursorColumn: number;
  suggestionType: string;
  fileName?: string;
}

interface CodeContext {
  language: string;
  beforeContext: string;
  currentLine: string;
  afterContext: string;
  cursorPosition: { line: number; column: number };
}

// Ghost text is latency-sensitive: cap each model attempt so a slow model
// falls through to the next one instead of stalling the editor.
const PER_MODEL_TIMEOUT_MS = 10_000;

const SYSTEM_PROMPT = `You are an inline code completion engine inside a code editor.
The user's code contains a <CURSOR> marker. Output ONLY the code to insert at that marker.
Rules:
- Raw code only: no markdown, no backticks, no explanations, no surrounding prose.
- Continue the current statement, or add at most 5 short lines.
- Match the existing indentation, naming and style exactly.
- Never repeat code that already appears before the cursor.
- If there is nothing useful to insert, output nothing.`;

export async function POST(request: NextRequest) {
  try {
    const body: CodeSuggestionRequest = await request.json();

    const { fileContent, cursorLine, cursorColumn, suggestionType, fileName } =
      body;

    // Validate input
    if (!fileContent || cursorLine < 0 || cursorColumn < 0 || !suggestionType) {
      return NextResponse.json(
        { error: "Invalid input parameters" },
        { status: 400 },
      );
    }

    const context = analyzeCodeContext(
      fileContent,
      cursorLine,
      cursorColumn,
      fileName,
    );

    const prompt = buildPrompt(context, fileName);

    const { text, rateLimited } = await generateSuggestion(prompt);

    // On rate limit, show the notice as a language-appropriate comment in
    // ghost text (harmless if accepted with Tab) instead of a hard error.
    if (text === null && rateLimited) {
      return NextResponse.json({
        suggestion: toCommentLine(
          RATE_LIMIT_COMPLETION_MESSAGE,
          context.language,
        ),
        context,
        metadata: {
          language: context.language,
          position: context.cursorPosition,
          generatedAt: new Date().toISOString(),
        },
      });
    }

    if (text === null) {
      return NextResponse.json(
        { error: "AI completion is currently unavailable" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      suggestion: text,
      context,
      metadata: {
        language: context.language,
        position: context.cursorPosition,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Code completion error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 },
    );
  }
}

function analyzeCodeContext(
  content: string,
  line: number,
  column: number,
  fileName?: string,
): CodeContext {
  const lines = content.split("\n");
  const currentLine = lines[line] || "";

  // Asymmetric window: completions depend mostly on what precedes the
  // cursor, so send more lines before it than after.
  const beforeRadius = 25;
  const afterRadius = 8;
  const startLine = Math.max(0, line - beforeRadius);
  const endLine = Math.min(lines.length, line + 1 + afterRadius);

  const beforeContext = lines.slice(startLine, line).join("\n");
  const afterContext = lines.slice(line + 1, endLine).join("\n");

  const language = detectLanguage(content, fileName);

  return {
    language,
    beforeContext,
    currentLine,
    afterContext,
    cursorPosition: { line, column },
  };
}

function buildPrompt(context: CodeContext, fileName?: string): string {
  const { beforeContext, currentLine, afterContext, cursorPosition } = context;

  const markedLine =
    currentLine.substring(0, cursorPosition.column) +
    "<CURSOR>" +
    currentLine.substring(cursorPosition.column);

  const code = [beforeContext, markedLine, afterContext]
    .filter((part) => part.length > 0)
    .join("\n");

  return `Language: ${context.language}${fileName ? `\nFile: ${fileName}` : ""}

${code}`;
}

/**
 * Tries each completion model in order (best to worst for inline
 * completion). Falls back to the next model on error, timeout or empty
 * output; the caller — and the frontend — never see which model answered.
 * `text` is null only when every model failed; `rateLimited` is true when
 * that failure was (at least partly) an HTTP 429 quota error.
 */
async function generateSuggestion(
  prompt: string,
): Promise<{ text: string | null; rateLimited: boolean }> {
  const openrouter = getOpenRouter();
  let rateLimited = false;

  for (const modelId of COMPLETION_MODELS) {
    try {
      const result = await generateText({
        // These are hybrid reasoning models; reasoning must stay off here or
        // deliberation text leaks into the completion and latency balloons.
        model: openrouter.chat(modelId, {
          reasoning: { enabled: false, effort: "none" },
        }),
        system: SYSTEM_PROMPT,
        prompt,
        temperature: 0.2,
        maxOutputTokens: 150,
        // No per-model retries: we already fall back across models, so fail
        // fast instead of retrying (which stalls the editor and, on a 429,
        // burns the shared free quota even harder).
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(PER_MODEL_TIMEOUT_MS),
      });

      const suggestion = sanitizeSuggestion(result.text);
      if (suggestion) {
        return { text: suggestion, rateLimited: false };
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        rateLimited = true;
      }
      console.warn(`Completion model ${modelId} failed, falling back:`, error);
    }
  }

  return { text: null, rateLimited };
}

function sanitizeSuggestion(raw: string): string {
  let suggestion = raw.trim();

  // Strip markdown code fences if the model ignored instructions
  if (suggestion.includes("```")) {
    const codeMatch = suggestion.match(/```[\w]*\n?([\s\S]*?)```/);
    suggestion = codeMatch ? codeMatch[1] : suggestion.replace(/```[\w]*/g, "");
    suggestion = suggestion.trim();
  }

  // Drop any echoed cursor marker
  suggestion = suggestion.replace(/<CURSOR>/g, "");

  // Keep ghost text short: cap at 5 lines
  const lines = suggestion.split("\n");
  if (lines.length > 5) {
    suggestion = lines.slice(0, 5).join("\n").trimEnd();
  }

  return suggestion;
}

function detectLanguage(content: string, fileName?: string): string {
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const extMap: Record<string, string> = {
      ts: "TypeScript",
      tsx: "TypeScript",
      js: "JavaScript",
      jsx: "JavaScript",
      py: "Python",
      java: "Java",
      go: "Go",
      rs: "Rust",
      php: "PHP",
      css: "CSS",
      html: "HTML",
      json: "JSON",
      vue: "Vue",
    };
    if (ext && extMap[ext]) return extMap[ext];
  }

  // Content-based detection (fallback when no fileName is provided)
  if (content.includes("interface ") || content.includes(": string"))
    return "TypeScript";
  if (/^\s*def\s+\w+\s*\(/m.test(content)) return "Python";
  if (content.includes("func ") || content.includes("package ")) return "Go";

  return "JavaScript";
}
