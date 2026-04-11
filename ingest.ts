// Key is now passed directly from command handler
import { logger } from "./logger";
import { saveHighlight } from "./thinkly-api";
import { MAX_INGEST_ITEMS } from "./types";
import type { HighlightPayload, IngestItem, IngestSession } from "./types";

// Session state — shared with index.ts via getSession()
const ingestSessions = new Map<string, IngestSession>();

export function getSession(key: string): IngestSession | undefined {
  return ingestSessions.get(key);
}

export function deleteSession(key: string): void {
  ingestSessions.delete(key);
}

export async function handleIngestStart(ctx: {
  channel: string;
  key: string;
}): Promise<{ text: string }> {
  const key = ctx.key;

  // Discard existing session
  ingestSessions.delete(key);

  ingestSessions.set(key, {
    state: "collecting",
    sessionId: crypto.randomUUID(),
    startedAt: Date.now(),
    buffer: [],
  });

  logger.info("Ingest session started", { key });
  return {
    text: "Ingest mode started. Send files, text, or URLs. Type /ingest save to store.\n⚠️ 에이전트도 메시지에 응답할 수 있습니다.",
  };
}

function generateIngestTitle(item: IngestItem): string {
  if (item.type === "file" && item.filename?.trim()) {
    return item.filename.trim().slice(0, 80);
  }
  if (item.type === "url" && item.pageTitle?.trim()) {
    return item.pageTitle.trim().slice(0, 80);
  }
  const text = item.content.replace(/\s+/g, " ").trim();
  return text.slice(0, 80) || "Untitled";
}

export async function handleIngestSave(ctx: {
  channel: string;
  key: string;
}): Promise<{ text: string }> {
  const key = ctx.key;
  const session = ingestSessions.get(key);

  // 1. Session check
  if (!session || session.state !== "collecting") {
    return { text: "No active ingest session" };
  }

  // 2. Empty buffer check
  if (session.buffer.length === 0) {
    ingestSessions.delete(key);
    return { text: "No content to save" };
  }

  // 3. Iterate items
  let successCount = 0;
  let failCount = 0;

  for (const item of session.buffer) {
    // 3a. Validate
    if (item.type === "text" && (!item.content || item.content.trim().length === 0)) {
      failCount++;
      continue;
    }
    if (item.type === "file" && !item.content) {
      failCount++;
      continue;
    }

    // 3b. Build payload
    const payload: HighlightPayload = {
      text: item.type === "url" ? "" : item.content,
      title: generateIngestTitle(item),
      source: {
        platform: "openclaw",
        mode: "ingest",
        sessionId: session.sessionId,
        sourceMessageId: item.sourceMessageId,
        ...(item.type === "file" && {
          filename: item.filename,
          mimeType: item.mimeType,
        }),
        ...(item.type === "url" && {
          url: item.url,
          pageTitle: item.pageTitle,
        }),
        timestamp: Date.now(),
      },
    };

    // 3c. Send to server
    try {
      const res = await saveHighlight(payload);
      if (res.success && res.data?.highlightId) {
        successCount++;
      } else {
        failCount++;
      }
    } catch {
      failCount++;
    }
  }

  // 4. Delete session (regardless of result)
  ingestSessions.delete(key);
  logger.info("Ingest save completed", { successCount, failCount });

  // 5. Result message
  if (successCount === 0) {
    return { text: "Failed to save highlights to Thinkly" };
  }
  if (failCount > 0) {
    return { text: `Saved ${successCount} items to Thinkly (${failCount} failed)` };
  }
  return { text: `Saved ${successCount} items to Thinkly` };
}

export async function handleIngestCancel(ctx: {
  channel: string;
  key: string;
}): Promise<{ text: string }> {
  const key = ctx.key;
  ingestSessions.delete(key);
  logger.info("Ingest session cancelled", { key });
  return { text: "Ingest cancelled" };
}

export function addToIngestBuffer(
  key: string,
  item: IngestItem,
): boolean {
  const session = ingestSessions.get(key);
  if (!session || session.state !== "collecting") return false;

  if (session.buffer.length >= MAX_INGEST_ITEMS) {
    return false; // caller should return "Input too large to ingest"
  }

  session.buffer.push(item);
  return true;
}
