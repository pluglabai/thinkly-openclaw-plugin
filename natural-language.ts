import { getConfig } from "./config";
import { logger } from "./logger";
import type { NaturalLanguageParseResult } from "./types";

const UNKNOWN_RESULT: NaturalLanguageParseResult = {
  intent: "unknown",
  confidence: 0,
  mapped_action: null,
  inline_text: null,
  needs_clarification: false,
  clarification_question: null,
};

const SYSTEM_PROMPT = `You are an intent parser for Thinkly capture actions inside OpenClaw.
Your job is to map a user's natural language message to one of the following actions:

- /clip (save recent conversation exchange)
- /clip "text" (save specific quoted text)
- /ingest (start collecting files/text/URLs)
- /ingest save (save collected data)
- /ingest cancel (cancel collection)

Rules:
1. Return JSON only. No explanation.
2. Do not execute anything yourself.
3. If the user's request is ambiguous, set needs_clarification = true and provide a clarification_question.
4. If the user clearly wants to save the recent conversation or recent answer, map to /clip.
5. If the user clearly wants to start collecting files/text/URLs, map to /ingest.
6. If the user clearly wants to save collected ingest data, map to /ingest save.
7. If the user clearly wants to cancel ingest, map to /ingest cancel.
8. Be conservative with confidence. If not clearly a Thinkly action, return intent: "unknown".

Return format:
{
  "intent": "...",
  "confidence": 0.0,
  "mapped_action": "...",
  "inline_text": null,
  "needs_clarification": false,
  "clarification_question": null
}`;

const VALID_INTENTS = new Set([
  "clip", "clip_inline", "ingest", "ingest_save", "ingest_cancel", "unknown",
]);

const VALID_ACTIONS = new Set([
  "/clip", "/clip \"text\"", "/ingest", "/ingest save", "/ingest cancel", null,
]);

function validateResult(raw: Record<string, unknown>): NaturalLanguageParseResult | null {
  const intent = raw.intent;
  if (typeof intent !== "string" || !VALID_INTENTS.has(intent)) return null;

  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0;
  const mapped_action = typeof raw.mapped_action === "string" ? raw.mapped_action : null;
  const inline_text = typeof raw.inline_text === "string" ? raw.inline_text : null;
  const needs_clarification = typeof raw.needs_clarification === "boolean" ? raw.needs_clarification : false;
  const clarification_question = typeof raw.clarification_question === "string" ? raw.clarification_question : null;

  return {
    intent: intent as NaturalLanguageParseResult["intent"],
    confidence: Math.max(0, Math.min(1, confidence)),
    mapped_action: VALID_ACTIONS.has(mapped_action) ? mapped_action as NaturalLanguageParseResult["mapped_action"] : null,
    inline_text,
    needs_clarification,
    clarification_question,
  };
}

export async function parseIntent(content: string): Promise<NaturalLanguageParseResult> {
  const config = getConfig();

  // No LLM config → skip
  if (!config.llm) {
    return UNKNOWN_RESULT;
  }

  const { provider, model, apiKey } = config.llm;

  // Only OpenAI-compatible API supported
  let baseUrl: string;
  if (provider === "openai") {
    baseUrl = "https://api.openai.com/v1";
  } else {
    // Treat as OpenAI-compatible endpoint
    baseUrl = "https://api.openai.com/v1";
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    logger.error("parseIntent network error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return UNKNOWN_RESULT;
  }

  if (!res.ok) {
    logger.error("parseIntent API error", { status: res.status });
    return UNKNOWN_RESULT;
  }

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    logger.error("parseIntent invalid JSON response");
    return UNKNOWN_RESULT;
  }

  // Extract content from OpenAI response
  let jsonStr: string;
  try {
    const choices = body.choices as Array<{ message?: { content?: string } }>;
    jsonStr = choices?.[0]?.message?.content ?? "";
  } catch {
    logger.error("parseIntent unexpected response structure");
    return UNKNOWN_RESULT;
  }

  // Parse intent JSON
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    logger.error("parseIntent malformed JSON from LLM", { raw: jsonStr.slice(0, 200) });
    return UNKNOWN_RESULT;
  }

  const result = validateResult(parsed);
  if (!result) {
    logger.warn("parseIntent invalid result structure", { parsed });
    return UNKNOWN_RESULT;
  }

  logger.debug("parseIntent result", {
    intent: result.intent,
    confidence: result.confidence,
    mapped_action: result.mapped_action,
  });

  return result;
}
