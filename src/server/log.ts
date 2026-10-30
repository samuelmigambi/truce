import "server-only";

/**
 * Structured logs: one JSON line per event, the shape Cloud Logging reads (`severity`,
 * `message`). Fields whose names look like credentials are replaced before anything is written,
 * and errors keep their name, message and PayPal's debug details, never a request's headers.
 */

type Severity = "INFO" | "WARNING" | "ERROR";

const SENSITIVE = /secret|token|password|authorization|cookie|api[-_]?key|credential|^key$/i;

function plain(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    const extra = value as Error & {
      status?: unknown;
      issue?: unknown;
      debugId?: unknown;
      code?: unknown;
    };
    return {
      name: value.name,
      message: value.message.slice(0, 500),
      ...(extra.status !== undefined ? { status: extra.status } : {}),
      ...(extra.issue !== undefined ? { issue: extra.issue } : {}),
      ...(extra.debugId !== undefined ? { debugId: extra.debugId } : {}),
      ...(typeof extra.code === "string" ? { code: extra.code } : {}),
    };
  }
  if (depth > 4) return "[nested]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => plain(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE.test(key) ? "[redacted]" : plain(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 1000) return `${value.slice(0, 1000)}…`;
  return value;
}

function write(severity: Severity, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    severity,
    message: event,
    time: new Date().toISOString(),
    ...(plain(fields) as Record<string, unknown>),
  });
  if (severity === "ERROR") console.error(line);
  else if (severity === "WARNING") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Record<string, unknown>) => write("INFO", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("WARNING", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("ERROR", event, fields),
};

/** For tests: the same cleaning the log lines get. */
export const redactForLog = (fields: Record<string, unknown>) => plain(fields);
