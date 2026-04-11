import { getBuffer, makeBufferKey } from "./buffer";
import { logger } from "./logger";
import { saveHighlight } from "./thinkly-api";
import { ASSISTANT_ROLES } from "./types";
import type {
  BufferedMessage,
  ExchangeBlock,
  HighlightPayload,
} from "./types";

// ── Title ────────────────────────────────────────────────

function generateClipTitle(userMessage: string): string {
  const title = userMessage.replace(/\s+/g, " ").trim().slice(0, 60);
  return title || "Untitled";
}

// ── Exchange Detection (PRD doc3 §4) ─────────────────────

export function detectLastExchangeBlock(
  buffer: BufferedMessage[],
): ExchangeBlock | null {
  if (buffer.length === 0) return null;

  // 1. Find last assistant from the end
  let lastAssistantIndex = -1;
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (ASSISTANT_ROLES.has(buffer[i].role)) {
      lastAssistantIndex = i;
      break;
    }
  }

  // 2. No assistant → user-only fallback
  if (lastAssistantIndex < 0) {
    const lastUser = [...buffer].reverse().find((m) => m.role === "user");
    if (!lastUser) return null;
    return {
      userMessage: lastUser,
      assistantMessages: [],
      mode: "user_only",
    };
  }

  // 3. Find contiguous assistant block range (oldest → newest)
  let assistantStart = lastAssistantIndex;
  while (
    assistantStart - 1 >= 0 &&
    ASSISTANT_ROLES.has(buffer[assistantStart - 1].role)
  ) {
    assistantStart--;
  }

  // 4. Find closest user before assistant block
  let userIndex = -1;
  for (let i = assistantStart - 1; i >= 0; i--) {
    if (buffer[i].role === "user") {
      userIndex = i;
      break;
    }
  }

  if (userIndex < 0) return null;

  return {
    userMessage: buffer[userIndex],
    assistantMessages: buffer.slice(assistantStart, lastAssistantIndex + 1),
    mode: "exchange",
  };
}

// ── Response helpers ─────────────────────────────────────

function handleApiResponse(res: {
  success: boolean;
  data: { highlightId: string } | null;
  error: { code: string } | null;
}): { text: string } {
  if (res.success && res.data?.highlightId) {
    const openPath = res.data.openPath ?? `/highlights/${res.data.highlightId}`;
    return {
      text: `✓ Saved to Thinkly\nOpen → https://thinkly.pluglab.ai${openPath}`,
    };
  }
  if (res.error?.code === "DUPLICATE_CLIP") {
    return { text: "Already saved to Thinkly" };
  }
  if (res.error?.code === "UNAUTHORIZED") {
    return { text: "Login required to save to Thinkly" };
  }
  return { text: "Failed to save to Thinkly" };
}

// ── Handler (PRD doc3 §8) ────────────────────────────────

export async function handleClip(ctx: {
  args?: string;
  channel: string;
  from?: string;
}): Promise<{ text: string }> {
  const key = makeBufferKey(ctx.from);
  const args = ctx.args?.trim();

  // ── 1. Inline clip ──────────────────────────────────────
  if (args) {
    const match = args.match(/^"(.+)"$/);
    if (!match) {
      return { text: 'Invalid /clip syntax. Use /clip or /clip "text"' };
    }
    const inlineText = match[1];
    if (!inlineText.trim()) {
      return { text: 'Invalid /clip syntax. Use /clip or /clip "text"' };
    }

    const payload: HighlightPayload = {
      text: inlineText,
      title: generateClipTitle(inlineText),
      source: {
        platform: "openclaw",
        mode: "clip",
        clipMode: "inline",
        timestamp: Date.now(),
      },
    };

    logger.info("Clip inline", { titleLength: payload.title.length });
    const res = await saveHighlight(payload);
    return handleApiResponse(res);
  }

  // ── 2. Exchange clip ────────────────────────────────────
  const buffer = getBuffer(key);
  if (buffer.length === 0) {
    return { text: "No messages available to clip" };
  }

  const exchange = detectLastExchangeBlock(buffer);
  if (!exchange) {
    return { text: "No messages available to clip" };
  }

  // 3. Build text
  let text: string;
  const agentName =
    exchange.assistantMessages.find((m) => m.agentName)?.agentName ||
    "Assistant";

  if (exchange.mode === "exchange") {
    const assistantText = exchange.assistantMessages
      .map((m) => m.content)
      .join("\n");
    text = `User:\n${exchange.userMessage.content}\n\nAssistant (${agentName}):\n${assistantText}`;
  } else {
    text = `User:\n${exchange.userMessage.content}`;
  }

  // 4. Build payload
  const payload: HighlightPayload = {
    text,
    title: generateClipTitle(exchange.userMessage.content),
    source: {
      platform: "openclaw",
      mode: "clip",
      clipMode: exchange.mode,
      userMessageId: exchange.userMessage.messageId,
      assistantMessageIds: exchange.assistantMessages
        .map((m) => m.messageId)
        .filter(Boolean) as string[],
      agentName: agentName !== "Assistant" ? agentName : undefined,
      blockType: exchange.mode === "exchange" ? "exchange" : undefined,
      timestamp: Date.now(),
    },
  };

  // 5. Send
  logger.info("Clip exchange", {
    mode: exchange.mode,
    assistantCount: exchange.assistantMessages.length,
  });
  const res = await saveHighlight(payload);
  return handleApiResponse(res);
}
