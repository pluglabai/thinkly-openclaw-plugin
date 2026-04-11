const PREFIX = "[Thinkly]";

const SENSITIVE_KEYS = new Set([
  "apitoken",
  "apikey",
  "api_key",
  "authorization",
  "token",
  "secret",
  "password",
]);

function maskValue(value: string): string {
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "***" + value.slice(-4);
}

function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase()) && typeof value === "string") {
      result[key] = maskValue(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitize(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const logger = {
  info(message: string, data?: unknown) {
    console.log(PREFIX, message, ...(data !== undefined ? [sanitize(data)] : []));
  },

  warn(message: string, data?: unknown) {
    console.warn(PREFIX, message, ...(data !== undefined ? [sanitize(data)] : []));
  },

  error(message: string, data?: unknown) {
    console.error(PREFIX, message, ...(data !== undefined ? [sanitize(data)] : []));
  },

  debug(message: string, data?: unknown) {
    console.debug(PREFIX, message, ...(data !== undefined ? [sanitize(data)] : []));
  },
};
