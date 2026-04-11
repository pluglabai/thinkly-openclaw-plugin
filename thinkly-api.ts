import { getConfig } from "./config";
import { logger } from "./logger";
import type { HighlightPayload, ThinklyApiResponse } from "./types";

const NETWORK_ERROR_RESPONSE: ThinklyApiResponse = {
  success: false,
  data: null,
  error: { code: "NETWORK_ERROR" },
};

async function postJson(
  endpoint: string,
  apiKey: string,
  body: unknown,
): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

function shouldUseAgentApi(payload: HighlightPayload, transportMode?: string): boolean {
  return transportMode === "agent_api_v1";
}

function buildAgentClipPayload(payload: HighlightPayload) {
  const now = payload.source.timestamp || Date.now();

  return {
    id: `clip_${now}_${Math.random().toString(36).slice(2, 10)}`,
    title: payload.title,
    text: payload.text,
    contentFormat: "plain",
    sourceMetadata: {
      integration: "openclaw",
      mode: payload.source.mode,
      clipMode: payload.source.clipMode ?? null,
      threadUrl: payload.source.threadUrl ?? null,
      conversationId: payload.source.conversationId ?? null,
    },
    platform: "openclaw",
    siteName: "OpenClaw",
    conversationUrl: payload.source.threadUrl ?? null,
    conversationId: payload.source.conversationId ?? null,
    sourceMode: payload.source.mode,
    clipMode: payload.source.clipMode ?? null,
    blockType: payload.source.blockType ?? null,
    agentName: payload.source.agentName ?? null,
    userMessageId: payload.source.userMessageId ?? null,
    assistantMsgIds: payload.source.assistantMessageIds ?? [],
    threadUrl: payload.source.threadUrl ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildAgentIngestPayload(payload: HighlightPayload) {
  const isMarkdownFile = Boolean(
    payload.source.filename?.toLowerCase().endsWith(".md") ||
    payload.source.filename?.toLowerCase().endsWith(".markdown") ||
    payload.source.mimeType === "text/markdown",
  );

  const item = payload.source.url
    ? {
        type: "url",
        title: payload.title,
        url: payload.source.url,
        ...(payload.text.trim() ? { text: payload.text } : {}),
        provenance: {
          platform: "openclaw",
          sourceMode: payload.source.mode,
          sessionId: payload.source.sessionId ?? undefined,
          sourceMsgId: payload.source.sourceMessageId ?? undefined,
          filename: payload.source.filename ?? undefined,
          mimeType: payload.source.mimeType ?? undefined,
          pageTitle: payload.source.pageTitle ?? undefined,
          threadUrl: payload.source.threadUrl ?? undefined,
        },
      }
    : {
        type: isMarkdownFile ? "markdown" : "text",
        title: payload.title,
        text: payload.text,
        provenance: {
          platform: "openclaw",
          sourceMode: payload.source.mode,
          sessionId: payload.source.sessionId ?? undefined,
          sourceMsgId: payload.source.sourceMessageId ?? undefined,
          filename: payload.source.filename ?? undefined,
          mimeType: payload.source.mimeType ?? undefined,
          pageTitle: payload.source.pageTitle ?? undefined,
          threadUrl: payload.source.threadUrl ?? undefined,
        },
      };

  return {
    items: [item],
  };
}

async function saveViaLegacy(
  apiUrl: string,
  apiKey: string,
  payload: HighlightPayload,
): Promise<ThinklyApiResponse> {
  const endpoint = `${apiUrl}/api/highlights`;
  const res = await postJson(endpoint, apiKey, payload);
  const body = (await res.json()) as ThinklyApiResponse;

  if (body.success && body.data?.highlightId) {
    return {
      ...body,
      data: {
        ...body.data,
        openPath: body.data.openPath ?? `/highlights/${body.data.highlightId}`,
        transport: "legacy_highlights",
      },
    };
  }

  return body;
}

async function saveViaAgentApi(
  apiUrl: string,
  apiKey: string,
  payload: HighlightPayload,
): Promise<ThinklyApiResponse> {
  if (payload.source.mode === "clip") {
    const endpoint = `${apiUrl}/api/agent/clips`;
    const res = await postJson(endpoint, apiKey, buildAgentClipPayload(payload));
    const body = await res.json() as {
      data?: { id?: string };
      error?: { code?: string; message?: string };
    };

    if (res.ok && body?.data?.id) {
      return {
        success: true,
        data: {
          highlightId: body.data.id,
          openPath: `/clips/${body.data.id}`,
          transport: "agent_api_v1",
        },
        error: null,
      };
    }

    if (res.status === 409) {
      return {
        success: false,
        data: null,
        error: { code: "DUPLICATE_CLIP", details: body?.error?.message ?? body?.error?.code },
      };
    }

    return {
      success: false,
      data: null,
      error: { code: body?.error?.code ?? "SERVER_ERROR", details: body?.error?.message },
    };
  }

  const endpoint = `${apiUrl}/api/agent/ingest`;
  const res = await postJson(endpoint, apiKey, buildAgentIngestPayload(payload));
  const body = await res.json() as {
    data?: { created?: Array<{ id: string }> };
    error?: { code?: string; message?: string };
  };

  if (res.ok && body?.data?.created?.[0]?.id) {
    const firstId = body.data.created[0].id;
    return {
      success: true,
      data: {
        highlightId: firstId,
        openPath: `/clips/${firstId}`,
        transport: "agent_api_v1",
      },
      error: null,
    };
  }

  if (res.status === 409) {
    return {
      success: false,
      data: null,
      error: { code: "DUPLICATE_CLIP", details: body?.error?.message ?? body?.error?.code },
    };
  }

  return {
    success: false,
    data: null,
    error: { code: body?.error?.code ?? "SERVER_ERROR", details: body?.error?.message },
  };
}

export async function saveHighlight(
  payload: HighlightPayload,
): Promise<ThinklyApiResponse> {
  const { apiUrl, apiKey, transportMode } = getConfig();

  logger.debug("saveHighlight request", {
    mode: payload.source.mode,
    clipMode: payload.source.clipMode,
    titleLength: payload.title.length,
    textLength: payload.text.length,
  });

  try {
    const usingAgentApi = shouldUseAgentApi(payload, transportMode);
    if (usingAgentApi) {
      const agentBody = await saveViaAgentApi(apiUrl, apiKey, payload);
      if (agentBody.success) {
        logger.info("saveHighlight success", {
          highlightId: agentBody.data?.highlightId,
          transport: agentBody.data?.transport,
        });
        return agentBody;
      }

      logger.warn("saveHighlight agent api failed, falling back to legacy", {
        code: agentBody.error?.code,
        mode: payload.source.mode,
        clipMode: payload.source.clipMode,
      });
    }

    const legacyBody = await saveViaLegacy(apiUrl, apiKey, payload);
    if (legacyBody.success) {
      logger.info("saveHighlight success", {
        highlightId: legacyBody.data?.highlightId,
        transport: legacyBody.data?.transport,
      });
    } else {
      logger.warn("saveHighlight failed", {
        code: legacyBody.error?.code,
        mode: payload.source.mode,
      });
    }
    return legacyBody;
  } catch (err) {
    logger.error("saveHighlight network error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NETWORK_ERROR_RESPONSE;
  }
}
