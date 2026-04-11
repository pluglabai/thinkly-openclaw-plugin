import { MAX_BUFFER_SIZE } from "./types";
import type { BufferedMessage } from "./types";

// ── Conversation buffer (module-level, survives plugin re-registration) ──

const conversationBuffers = new Map<string, BufferedMessage[]>();

export function appendToBuffer(key: string, msg: BufferedMessage): void {
  let buffer = conversationBuffers.get(key);
  if (!buffer) {
    buffer = [];
    conversationBuffers.set(key, buffer);
  }
  buffer.push(msg);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.shift();
  }
}

export function getBuffer(key: string): BufferedMessage[] {
  return conversationBuffers.get(key) ?? [];
}

export function clearBuffer(key: string): void {
  conversationBuffers.delete(key);
}

/**
 * Build a consistent buffer key from sender identity.
 * `from` already contains channel prefix (e.g. "telegram:5236510026").
 */
export function makeBufferKey(from?: string): string {
  return from || "unknown";
}

// ── Active key tracking (module-level, survives plugin re-registration) ──
// Maps channelId → last active buffer key, so agent_end can find the right buffer.
// lastActiveKey is a fallback for when agent_end's messageProvider doesn't match any channelId.

const activeKeyMap = new Map<string, string>();
let lastActiveKey: string | null = null;

export function setActiveKey(channelId: string, bufferKey: string): void {
  activeKeyMap.set(channelId, bufferKey);
  lastActiveKey = bufferKey;
}

export function getActiveKey(channelId: string): string | null {
  return activeKeyMap.get(channelId) ?? lastActiveKey;
}

/** Reset internal state for testing only. */
export function _resetForTesting(): void {
  activeKeyMap.clear();
  lastActiveKey = null;
}
