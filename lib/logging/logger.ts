/**
 * Structured logger. Never logs secrets, passwords, full legal
 * documents, or raw user messages — only metadata needed for
 * observability and debugging.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogFields {
  requestId?: string;
  userId?: string;
  route?: string;
  durationMs?: number;
  status?: number;
  errorType?: string;
  aiLatencyMs?: number;
  retrievalLatencyMs?: number;
  [key: string]: unknown;
}

const REDACTED_KEYS = [
  "password",
  "passwordHash",
  "apiKey",
  "token",
  "secret",
  "authorization",
];

function redact(fields: LogFields): LogFields {
  const clean: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACTED_KEYS.some((k) => key.toLowerCase().includes(k))) {
      clean[key] = "[REDACTED]";
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function log(level: LogLevel, message: string, fields: LogFields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...redact(fields),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) => log("info", message, fields),
  warn: (message: string, fields?: LogFields) => log("warn", message, fields),
  error: (message: string, fields?: LogFields) => log("error", message, fields),
  debug: (message: string, fields?: LogFields) => {
    if (process.env.NODE_ENV === "development") log("debug", message, fields);
  },
};
