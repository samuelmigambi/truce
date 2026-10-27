/**
 * Server-sent events, both ways: the routes encode one `data: <JSON>` line per event, and the
 * browser reads them back from a fetch response (EventSource can't POST).
 */

/** Sent every 15 s so proxies keep a slow stream open. */
export const KEEP_ALIVE = ": keep-alive\n\n";

export function encodeEvent(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Reads a server-sent event stream and yields each event's parsed JSON. */
export async function* readEvents<T>(response: Response, signal?: AbortSignal): AsyncGenerator<T> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => line.slice(6))
          .join("\n");
        if (data) yield JSON.parse(data) as T;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** A streaming Response that sends each event from `events`, with keep-alives while waiting. */
export function eventStream(events: AsyncIterable<unknown>, signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The browser went away.
        }
      };
      const timer = setInterval(() => send(KEEP_ALIVE), 15_000);
      try {
        for await (const event of events) {
          if (signal?.aborted) break;
          send(encodeEvent(event));
        }
      } catch (error) {
        console.error("[stream] failed", error);
        send(encodeEvent({ type: "error", message: "Something went wrong on our side. Try again in a moment." }));
      } finally {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
