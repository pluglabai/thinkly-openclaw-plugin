import { loadConfig } from "./config";
import { logger } from "./logger";
import {
  appendToBuffer,
  makeBufferKey,
  setActiveKey,
  getActiveKey,
} from "./buffer";
import {
  handleIngestStart,
  handleIngestSave,
  handleIngestCancel,
  getSession,
  addToIngestBuffer,
} from "./ingest";
import { handleClip } from "./clip";
import { parseIntent } from "./natural-language";

// ── Telegram send function (captured at register time) ──
type SendTelegramFn = (to: string, text: string, opts?: Record<string, unknown>) => Promise<unknown>;
let sendTelegram: SendTelegramFn | null = null;

// ── OpenClaw Plugin SDK types ──────────────────────────────

interface MessageAttachment {
  filename?: string;
  mimeType?: string;
  content?: string; // plain text extracted by SDK (if available)
}

interface MessageReceivedEvent {
  from: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
  attachments?: MessageAttachment[];
}

interface MessageContext {
  channelId: string;
  accountId?: string;
  conversationId?: string;
}

interface AgentEndEvent {
  messages: Array<{ role?: string; content?: unknown }>;
  success: boolean;
  error?: string;
  durationMs?: number;
}

interface AgentContext {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
}

interface PluginCommandContext {
  senderId?: string;
  channel: string;
  channelId?: string;
  isAuthorizedSender: boolean;
  args?: string;
  commandBody: string;
  from?: string;
  to?: string;
  accountId?: string;
  messageThreadId?: number;
}

interface PluginApi {
  registerCommand: (def: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: PluginCommandContext) => Promise<{ text: string }>;
  }) => void;
  on: (
    hookName: string,
    handler: (...args: unknown[]) => void | Promise<void>,
    opts?: { priority?: number },
  ) => void;
  pluginConfig?: Record<string, unknown>;
}

export default {
  id: "thinkly",
  name: "Thinkly Capture",
  description: "Save highlights from OpenClaw conversations",

  register(api: PluginApi) {
    // ── Capture Telegram send function ──────────────────
    sendTelegram = (api as any).runtime?.channel?.telegram?.sendMessageTelegram ?? null;

    // ── Config ───────────────────────────────────────────
    let configLoaded = false;

    function ensureConfig(): string | null {
      if (configLoaded) return null;
      try {
        loadConfig(api.pluginConfig ?? {});
      } catch (err) {
        return err instanceof Error
          ? err.message
          : "Thinkly plugin is not configured yet.";
      }
      configLoaded = true;
      logger.info("Config loaded");
      return null;
    }

    // ── Commands ─────────────────────────────────────────

    api.registerCommand({
      name: "clip",
      description: "Save recent conversation exchange to Thinkly",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx: PluginCommandContext) => {
        const from = ctx.from ?? ctx.senderId;
        const channel = ctx.channelId ?? ctx.channel;
        logger.info("clip command invoked", { args: ctx.args, channel, from });
        const configError = ensureConfig();
        if (configError) {
          logger.warn("clip command blocked by missing config", { message: configError });
          return {
            text: "Thinkly plugin is not configured yet. Add API URL and token in plugin settings.",
          };
        }
        try {
          const result = await handleClip({
            args: ctx.args,
            channel,
            from,
          });
          logger.info("clip result", { text: result?.text?.slice(0, 100) });
          return result;
        } catch (err) {
          logger.error("clip error", { message: err instanceof Error ? err.message : String(err) });
          return { text: "Clip failed: " + (err instanceof Error ? err.message : String(err)) };
        }
      },
    });

    api.registerCommand({
      name: "ingest",
      description: "Bulk import text or URLs to Thinkly",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx: PluginCommandContext) => {
        const configError = ensureConfig();
        if (configError) {
          logger.warn("ingest command blocked by missing config", { message: configError });
          return {
            text: "Thinkly plugin is not configured yet. Add API URL and token in plugin settings.",
          };
        }
        const args = ctx.args?.trim();
        const from = ctx.from ?? ctx.senderId;
        const channel = ctx.channelId ?? ctx.channel;
        const key = makeBufferKey(from);

        if (!args) {
          return handleIngestStart({ channel, key });
        }
        if (args === "save") {
          return handleIngestSave({ channel, key });
        }
        if (args === "cancel") {
          return handleIngestCancel({ channel, key });
        }
        return {
          text: "Invalid /ingest syntax. Use /ingest, /ingest save, or /ingest cancel",
        };
      },
    });

    // ── Message Hooks ────────────────────────────────────

    // Buffer user messages for /clip + ingest capture + NL intent
    api.on("message_received", (event: unknown, ctx: unknown) => {
      const ev = event as MessageReceivedEvent;
      const cx = ctx as MessageContext;
      const content = ev.content?.trim();
      const key = makeBufferKey(ev.from);

      logger.info("message_received", {
        from: ev.from,
        channel: cx.channelId,
        key,
        contentLen: content?.length ?? 0,
      });

      // Skip slash commands — they're handled by command router
      if (!content || content.startsWith("/")) return;

      // ── Fix 1: Ingest input capture ────────────────────
      const ingestSession = getSession(key);
      if (ingestSession && ingestSession.state === "collecting") {
        // File attachments
        const attachments = ev.attachments ?? [];
        for (const att of attachments) {
          if (att.content) {
            const added = addToIngestBuffer(key, {
              type: "file",
              filename: att.filename ?? "unnamed",
              mimeType: att.mimeType,
              content: att.content,
            });
            if (!added && sendTelegram) {
              const chatId = ev.from.replace(/^telegram:/, "");
              sendTelegram(chatId, "Input too large to ingest").catch(() => {});
            } else {
              logger.info("added to ingest buffer", { key, type: "file", filename: att.filename });
            }
          } else if (sendTelegram) {
            const chatId = ev.from.replace(/^telegram:/, "");
            sendTelegram(chatId, "Failed to extract text from file").catch(() => {});
          }
        }

        // Text / URL (only if there's actual text content beyond attachments)
        // Skip SDK media placeholders — file support deferred to next version
        const isMediaPlaceholder = /^<media:\w+>/.test(content);
        if (content && !isMediaPlaceholder) {
          const urlMatch = content.match(/^(https?:\/\/\S+)$/);
          let added: boolean;
          if (urlMatch) {
            added = addToIngestBuffer(key, { type: "url", url: urlMatch[1], content: "" });
          } else {
            added = addToIngestBuffer(key, { type: "text", content });
          }
          if (!added && sendTelegram) {
            const chatId = ev.from.replace(/^telegram:/, "");
            sendTelegram(chatId, "Input too large to ingest").catch(() => {});
          } else {
            logger.info("added to ingest buffer", { key, type: urlMatch ? "url" : "text" });
          }
        }

        // PRD v3.2 doc2 §8: ingest 중 clip buffer에는 추가하지 않는다
        return;
      }

      // ── Fix 2: NL intent auto-execution (skip during ingest) ─
      if (!ingestSession && sendTelegram) {
        const configError = ensureConfig();
        if (configError) {
          logger.warn("NL path skipped due to missing config", { message: configError });
        } else {
        parseIntent(content).then(async (result) => {
          if (result.confidence >= 0.85 && result.mapped_action && !result.needs_clarification) {
            logger.info("NL auto-execute", { intent: result.intent, action: result.mapped_action });
            try {
              let response: { text: string } | undefined;
              if (result.mapped_action === "/clip") {
                response = await handleClip({ channel: cx.channelId, from: ev.from });
              } else if (result.mapped_action === '/clip "text"' && result.inline_text) {
                response = await handleClip({ args: `"${result.inline_text}"`, channel: cx.channelId, from: ev.from });
              } else if (result.mapped_action === "/ingest") {
                response = await handleIngestStart({ channel: cx.channelId, key });
              } else if (result.mapped_action === "/ingest save") {
                response = await handleIngestSave({ channel: cx.channelId, key });
              } else if (result.mapped_action === "/ingest cancel") {
                response = await handleIngestCancel({ channel: cx.channelId, key });
              }
              if (response?.text && sendTelegram) {
                const chatId = ev.from.replace(/^telegram:/, "");
                await sendTelegram(chatId, response.text);
              }
            } catch (err) {
              logger.error("NL execution error", { message: err instanceof Error ? err.message : String(err) });
            }
          }
          if (result.needs_clarification && result.clarification_question && sendTelegram) {
            const chatId = ev.from.replace(/^telegram:/, "");
            await sendTelegram(chatId, result.clarification_question);
          }
        }).catch(() => { /* LLM failure → passthrough (PRD doc4) */ });
        }
      }

      // ── Clip buffer (always) ───────────────────────────
      appendToBuffer(key, {
        role: "user",
        content,
        timestamp: ev.timestamp ?? Date.now(),
      });
      setActiveKey(cx.channelId, key);
      logger.info("buffered user message", { key });
    });

    // Buffer assistant response after agent completes.
    // We use agent_end (same hookRunner as message_received) because
    // message_sent fires from a different hookRunner in the deliver system.
    api.on("agent_end", (event: unknown, _ctx: unknown) => {
      const ev = event as AgentEndEvent;
      const agentCtx = _ctx as AgentContext;

      // Resolve buffer key from module-level map using messageProvider as channel
      const channelId = agentCtx.messageProvider ?? "";
      const bufferKey = getActiveKey(channelId);

      logger.info("agent_end fired", {
        success: ev.success,
        messageCount: ev.messages?.length ?? 0,
        agentId: agentCtx.agentId,
        messageProvider: channelId,
        bufferKey,
      });

      if (!bufferKey) {
        logger.info("agent_end: no active buffer key for channel", { channelId });
        return;
      }
      if (!ev.success) {
        logger.info("agent_end: agent failed, skipping buffer");
        return;
      }

      // Extract the last assistant message from the messages array
      const messages = ev.messages ?? [];
      let lastAssistantContent: string | null = null;

      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === "assistant") {
          // Content can be string or array of content blocks
          if (typeof msg.content === "string") {
            lastAssistantContent = msg.content;
          } else if (Array.isArray(msg.content)) {
            // Anthropic format: [{type: "text", text: "..."}]
            const textParts = (msg.content as Array<{ type?: string; text?: string }>)
              .filter((b) => b.type === "text" && b.text)
              .map((b) => b.text);
            if (textParts.length > 0) {
              lastAssistantContent = textParts.join("\n");
            }
          }
          if (lastAssistantContent) break;
        }
      }

      if (lastAssistantContent) {
        appendToBuffer(bufferKey, {
          role: "assistant",
          content: lastAssistantContent,
          agentName: agentCtx.agentId,
          timestamp: Date.now(),
        });
        logger.info("buffered assistant message via agent_end", {
          key: bufferKey,
          agentId: agentCtx.agentId,
          contentLen: lastAssistantContent.length,
        });
      } else {
        logger.info("agent_end: no assistant content found", {
          messageCount: messages.length,
          roles: messages.slice(-5).map((m) => m.role).join(","),
        });
      }
    });

    logger.info("Plugin registered (hooks: message_received, agent_end)");
  },
};
