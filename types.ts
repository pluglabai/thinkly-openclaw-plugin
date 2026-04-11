// ── Constants ────────────────────────────────────────────

export const ASSISTANT_ROLES = new Set([
  "assistant",
  "assistant_reasoning",
  "assistant_tool",
  "assistant_tool_result",
]);

export const MAX_BUFFER_SIZE = 20;
export const MAX_INGEST_ITEMS = 20;

// ── Highlight (unified data model) ──────────────────────

export interface HighlightSource {
  platform: "openclaw";
  mode: "clip" | "ingest";

  conversationId?: string;
  conversationTitle?: string;
  threadUrl?: string;

  // clip
  userMessageId?: string;
  assistantMessageIds?: string[];
  agentName?: string;
  blockType?: "exchange";
  clipMode?: "exchange" | "inline" | "user_only";

  // ingest
  sessionId?: string;
  sourceMessageId?: string;
  filename?: string;
  mimeType?: string;
  url?: string;
  pageTitle?: string;

  timestamp: number;
}

export interface HighlightPayload {
  text: string;
  title: string;
  source: HighlightSource;
}

// ── Conversation Buffer ─────────────────────────────────

export interface BufferedMessage {
  role: "user" | "assistant";
  content: string;
  messageId?: string;
  agentName?: string;
  timestamp: number;
}

// ── Exchange Block (clip detection) ─────────────────────

export interface ExchangeBlock {
  userMessage: BufferedMessage;
  assistantMessages: BufferedMessage[];
  mode: "exchange" | "user_only";
}

// ── Ingest ──────────────────────────────────────────────

export interface IngestTextItem {
  type: "text";
  content: string;
  sourceMessageId?: string;
}

export interface IngestFileItem {
  type: "file";
  filename: string;
  mimeType?: string;
  content: string; // plain text only — empty means extraction failed
  sourceMessageId?: string;
}

export interface IngestUrlItem {
  type: "url";
  url: string;
  content: string; // empty string — server fills via fetch
  pageTitle?: string;
  sourceMessageId?: string;
}

export type IngestItem = IngestTextItem | IngestFileItem | IngestUrlItem;

export interface IngestSession {
  state: "collecting";
  sessionId: string;
  startedAt: number;
  buffer: IngestItem[];
}

// ── Natural Language ─────────────────────────────────────

export interface NaturalLanguageParseResult {
  intent: "clip" | "clip_inline" | "ingest" | "ingest_save" | "ingest_cancel" | "unknown";
  confidence: number;
  mapped_action: "/clip" | "/clip \"text\"" | "/ingest" | "/ingest save" | "/ingest cancel" | null;
  inline_text: string | null;
  needs_clarification: boolean;
  clarification_question: string | null;
}

// ── API Response ────────────────────────────────────────

export interface ThinklyApiResponse {
  success: boolean;
  data: {
    highlightId: string;
    openPath?: string;
    transport?: "legacy_highlights" | "agent_api_v1";
  } | null;
  error: { code: string; details?: unknown } | null;
}
