import "server-only";

/**
 * Tavily, for evidence that lives on the web: the listing as the buyer saw it, the shop's returns
 * policy, a public page about a product. Callers bound every request (see webReader in
 * src/server/ai/web.ts) by passing a fetch that gives up in time.
 */

const BASE = "https://api.tavily.com";

export interface ExtractedPage {
  url: string;
  content: string;
}

export interface SearchHit {
  title: string;
  url: string;
  content: string;
}

export interface SearchOptions {
  /** At most this many hits (Tavily allows 20); 5 unless set. */
  maxResults?: number;
  /** Only pages on these domains, such as the shop's own site. */
  includeDomains?: string[];
}

export class Tavily {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Tavily ${path} failed with ${response.status}`);
    return (await response.json()) as T;
  }

  /** The readable text of up to 20 pages. */
  async extract(urls: string[]): Promise<ExtractedPage[]> {
    const data = await this.post<{ results?: { url: string; raw_content?: string }[] }>(
      "/extract",
      {
        urls,
        extract_depth: "basic",
        format: "markdown",
      },
    );
    return (data.results ?? []).map((r) => ({ url: r.url, content: r.raw_content ?? "" }));
  }

  /** Pages that answer `query`, best first; with `includeDomains`, only pages on those sites. */
  async search(query: string, options: SearchOptions = {}): Promise<SearchHit[]> {
    const domains = options.includeDomains?.filter(Boolean) ?? [];
    const data = await this.post<{ results?: SearchHit[] }>("/search", {
      query,
      max_results: Math.min(20, Math.max(1, options.maxResults ?? 5)),
      search_depth: "basic",
      ...(domains.length ? { include_domains: domains } : {}),
    });
    return (data.results ?? []).map(({ title, url, content }) => ({
      title: title ?? "",
      url,
      content: content ?? "",
    }));
  }
}

/** From TAVILY_API_KEY; null without it. */
export function tavilyFromEnv(): Tavily | null {
  const key = process.env.TAVILY_API_KEY?.trim();
  return key ? new Tavily(key) : null;
}
