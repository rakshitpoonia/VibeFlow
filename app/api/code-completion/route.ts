import { type NextRequest, NextResponse } from "next/server";

interface CodeSuggestionRequest {
  fileContent: string;
  cursorLine: number;
  cursorColumn: number;
  suggestionType: string;
  fileName?: string;
}

interface CodeContext {
  language: string;
  framework: string;
  beforeContext: string;
  currentLine: string;
  afterContext: string;
  cursorPosition: { line: number; column: number };
  isInFunction: boolean;
  isInClass: boolean;
  isAfterComment: boolean;
  incompletePatterns: string[];
}

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

    const prompt = buildPrompt(context, suggestionType);

    const suggestion = await generateSuggestion(prompt);

    return NextResponse.json({
      suggestion,
      context,
      metadata: {
        language: context.language,
        framework: context.framework,
        position: context.cursorPosition,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Context analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
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

  // Get surrounding context (10 lines before and after)
  const contextRadius = 10;
  const startLine = Math.max(0, line - contextRadius);
  const endLine = Math.min(lines.length, line + contextRadius);

  const beforeContext = lines.slice(startLine, line).join("\n");
  const afterContext = lines.slice(line + 1, endLine).join("\n");

  // Detect language and framework
  const language = detectLanguage(content, fileName);
  const framework = detectFramework(content);

  // Analyze code patterns
  const isInFunction = detectInFunction(lines, line);
  const isInClass = detectInClass(lines, line);
  const isAfterComment = detectAfterComment(currentLine, column);
  const incompletePatterns = detectIncompletePatterns(currentLine, column);

  return {
    language,
    framework,
    beforeContext,
    currentLine,
    afterContext,
    cursorPosition: { line, column },
    isInFunction,
    isInClass,
    isAfterComment,
    incompletePatterns,
  };
}

function buildPrompt(context: CodeContext, suggestionType: string): string {
  return `You are an expert code completion assistant.

IMPORTANT: Respond with ONLY code. Do NOT include explanations, comments, documentation, or any text other than the code.

Language: ${context.language}
Framework: ${context.framework}

Context:
${context.beforeContext}
${context.currentLine.substring(
  0,
  context.cursorPosition.column,
)}|CURSOR|${context.currentLine.substring(context.cursorPosition.column)}
${context.afterContext}

Analysis:
- In Function: ${context.isInFunction}
- In Class: ${context.isInClass}
- After Comment: ${context.isAfterComment}
- Incomplete Patterns: ${context.incompletePatterns.join(", ") || "None"}

Instructions:
1. Generate ONLY the code to insert - no text or explanation
2. Do not use markdown backticks or code blocks
3. Maintain proper indentation and style
4. Keep suggestion brief (1-5 lines max)
5. Make it contextually appropriate for ${context.language}`;
}

async function generateSuggestion(prompt: string): Promise<string> {
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "codellama:latest",
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 100,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`AI service error: ${response.statusText}`);
    }

    const data = await response.json();
    let suggestion = data.response.trim();

    // Clean up the suggestion - remove explanations, code blocks, extra text

    // Remove markdown code blocks if present
    if (suggestion.includes("```")) {
      const codeMatch = suggestion.match(/```[\w]*\n?([\s\S]*?)```/);
      suggestion = codeMatch ? codeMatch[1].trim() : suggestion;
    }

    // Remove common explanation patterns (lines starting with //, /*, #, etc after code)
    const lines = suggestion.split("\n");
    let codeEndIndex = lines.length;

    // Find where explanatory text starts (lines that look like explanations)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Stop at explanation markers
      if (
        line.startsWith("This") ||
        line.startsWith("Here") ||
        line.startsWith("The") ||
        line.startsWith("In") ||
        line.startsWith("For") ||
        line.startsWith("A ") ||
        (i > 0 &&
          line.length > 80 &&
          !lines[i - 1].trim().endsWith(",") &&
          !lines[i - 1].trim().endsWith("{") &&
          !lines[i - 1].trim().endsWith("("))
      ) {
        codeEndIndex = i;
        break;
      }
    }

    suggestion = lines.slice(0, codeEndIndex).join("\n").trim();

    // Limit to first few lines to avoid multi-line suggestions that include explanations
    const suggestionLines = suggestion.split("\n");
    if (suggestionLines.length > 5) {
      suggestion = suggestionLines.slice(0, 5).join("\n").trim();
    }

    return suggestion;
  } catch (error) {
    console.error("AI generation error:", error);
    return "// AI suggestion unavailable";
  }
}

// Helper functions for code analysis
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
    };
    if (ext && extMap[ext]) return extMap[ext];
  }

  // Content-based detection
  if (content.includes("interface ") || content.includes(": string"))
    return "TypeScript";
  if (content.includes("def ") || content.includes("import ")) return "Python";
  if (content.includes("func ") || content.includes("package ")) return "Go";

  return "JavaScript";
}

function detectFramework(content: string): string {
  if (content.includes("import React") || content.includes("useState"))
    return "React";
  if (content.includes("import Vue") || content.includes("<template>"))
    return "Vue";
  if (content.includes("@angular/") || content.includes("@Component"))
    return "Angular";
  if (content.includes("next/") || content.includes("getServerSideProps"))
    return "Next.js";

  return "None";
}

function detectInFunction(lines: string[], currentLine: number): boolean {
  for (let i = currentLine - 1; i >= 0; i--) {
    const line = lines[i];
    if (line?.match(/^\s*(function|def|const\s+\w+\s*=|let\s+\w+\s*=)/))
      return true;
    if (line?.match(/^\s*}/)) break;
  }
  return false;
}

function detectInClass(lines: string[], currentLine: number): boolean {
  for (let i = currentLine - 1; i >= 0; i--) {
    const line = lines[i];
    if (line?.match(/^\s*(class|interface)\s+/)) return true;
  }
  return false;
}

function detectAfterComment(line: string, column: number): boolean {
  const beforeCursor = line.substring(0, column);
  return /\/\/.*$/.test(beforeCursor) || /#.*$/.test(beforeCursor);
}

function detectIncompletePatterns(line: string, column: number): string[] {
  const beforeCursor = line.substring(0, column);
  const patterns: string[] = [];

  if (/^\s*(if|while|for)\s*\($/.test(beforeCursor.trim()))
    patterns.push("conditional");
  if (/^\s*(function|def)\s*$/.test(beforeCursor.trim()))
    patterns.push("function");
  if (/\{\s*$/.test(beforeCursor)) patterns.push("object");
  if (/\[\s*$/.test(beforeCursor)) patterns.push("array");
  if (/=\s*$/.test(beforeCursor)) patterns.push("assignment");
  if (/\.\s*$/.test(beforeCursor)) patterns.push("method-call");

  return patterns;
}
