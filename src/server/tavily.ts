import "server-only";

/**
 * Tavily, for evidence that lives on the web: the listing as the buyer saw it, the shop's returns
 * policy, a public page about a product.
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
    const data = await this.post<{ results?: { url: string; raw_content?: string }[] }>("/extract", {
      urls,
      extract_depth: "basic",
      format: "markdown",
    });
    return (data.results ?? []).map((r) => ({ url: r.url, content: r.raw_content ?? "" }));
  }

  async search(query: string, maxResults = 5): Promise<SearchHit[]> {
    const data = await this.post<{ results?: SearchHit[] }>("/search", {
      query,
      max_results: maxResults,
      search_depth: "basic",
    });
    return (data.results ?? []).map(({ title, url, content }) => ({ title, url, content }));
  }
}

/** From TAVILY_API_KEY; null without it. */
export function tavilyFromEnv(): Tavily | null {
  const key = process.env.TAVILY_API_KEY?.trim();
  return key ? new Tavily(key) : null;
}
