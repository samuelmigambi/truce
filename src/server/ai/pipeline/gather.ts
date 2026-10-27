import "server-only";

import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { z } from "zod";
import { productById } from "@/lib/catalog";
import type { SimilarCase } from "@/lib/domain";
import { formatDay } from "../dates";
import { findSimilar } from "../embeddings";
import { deadline } from "../events";
import { requestOptions, runAgent, ThinkFilter, type Tool, type ToolResult } from "../loop";
import { reasoningParams } from "../models";
import { caseBlock, gatherSystem, orderLine, photoSystem, type PromptRecord } from "../prompts";
import { fence } from "../safety";
import * as R from "./evidence";
import { failureReason, TIMEOUTS } from "./run";
import type { Run } from "./types";

/**
 * Gathering on Lightning with tools: the model picks the sources that matter for this kind of
 * dispute and calls them side by side, and each tool writes records from the shop's data. Super VL
 * reads the buyer's photos and Qwen3 embeddings find similar closed cases along the way. Whatever
 * a dispute of this kind always needs is added by code if the model skipped it, so the file is
 * complete either way.
 */

export interface Gathered {
  records: PromptRecord[];
  similar: SimilarCase[];
  /** The photos as data URLs, for the drafter to look at too. */
  photos: { caption: string; dataUrl: string }[];
  similarFailed: boolean;
}

interface State {
  run: Run;
  records: R.NewRecord[];
  done: Map<string, string>;
  pages: Map<string, Promise<{ url: string; content: string } | null>>;
  similar: SimilarCase[];
  similarFailed: boolean;
  photos: { caption: string; dataUrl: string }[];
}

const NO_INPUT = z.object({});
const PolicyInput = z.object({ topic: z.enum(["shipping", "returns"]) });

const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^0\./,
];

/** Whether Tavily's servers could reach this host: not this machine, a private network or a bare name. */
function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host.includes(":")) return !(host === "::1" || /^(fc|fd|fe8|fe9|fea|feb)/.test(host));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !PRIVATE_IPV4.some((range) => range.test(host));
  if (!host.includes(".")) return false;
  return !/\.(localhost|local|internal|lan|home|test|example)$/.test(host);
}

/**
 * The site's public origin for Tavily, or null when it isn't public (local development), so the
 * listing comes from the catalog straight away instead of waiting on a page Tavily can't reach.
 */
export function publicBase(siteUrl: string | null | undefined): string | null {
  if (!siteUrl) return null;
  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return isPublicHost(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

/** A page read gives up after this, and the record falls back to the catalog, saying so. */
export const PAGE_MS = 7_000;

function readPage(state: State, path: string): Promise<{ url: string; content: string } | null> {
  const base = publicBase(state.run.deps.siteUrl);
  const web = state.run.deps.web;
  if (!base || !web) return Promise.resolve(null);
  const url = `${base}${path}`;
  let page = state.pages.get(url);
  if (!page) {
    // The reader aborts its own request at PAGE_MS too; this race is the backstop.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PAGE_MS + 500));
    page = Promise.race([
      web
        .extract([url])
        .then((pages) => pages.find((p) => p.content.trim()) ?? null)
        .catch((error) => {
          console.error("[analysis] couldn't read", url, error);
          return null;
        }),
      timeout,
    ]);
    state.pages.set(url, page);
  }
  return page;
}

/** Runs a source once per analysis; a second call says it's already in the file. */
async function once(
  state: State,
  key: string,
  produce: () => Promise<{ records: R.NewRecord[]; label: string }>,
): Promise<ToolResult> {
  const previous = state.done.get(key);
  if (previous !== undefined)
    return { content: { note: "Already in the case file." }, label: previous };
  state.done.set(key, "");
  let produced: { records: R.NewRecord[]; label: string };
  try {
    produced = await produce();
  } catch (error) {
    state.done.delete(key);
    throw error;
  }
  const { records, label } = produced;
  state.records.push(...records);
  state.done.set(key, label);
  return {
    content: records.length
      ? {
          added: records.map((r) => ({
            kind: r.kind,
            title: r.title,
            summary: r.untrusted ? fence(r.untrusted, r.summary, 600) : r.summary,
          })),
        }
      : { added: [], note: "Nothing on file for this." },
    label,
  };
}

const orderTool: Tool<Record<string, never>, State> = {
  name: "order_and_payment",
  description:
    "The order (items, prices, the label's address) and the PayPal payment (capture, Seller Protection status, the address on PayPal's Transaction Details).",
  input: NO_INPUT,
  pending: "Reading the order and payment",
  run: (_input, state) =>
    once(state, "order", async () => {
      const order = state.run.order;
      if (!order) return { records: [], label: "No order on file" };
      return {
        records: R.orderRecords(order, state.run.deps.workspace.shopName),
        label: `Order ${order.id} and its PayPal payment`,
      };
    }),
};

const trackingTool: Tool<Record<string, never>, State> = {
  name: "tracking",
  description:
    "The carrier's tracking for the order: every scan, the delivery date and place, and whether tracking was added to the PayPal order.",
  input: NO_INPUT,
  pending: "Checking tracking",
  run: (_input, state) =>
    once(state, "tracking", async () => {
      const record = state.run.order ? R.trackingRecord(state.run.order) : null;
      const t = state.run.order?.tracking;
      if (!record || !t) return { records: [], label: "No tracking on file" };
      return {
        records: [record],
        label: t.deliveredAt
          ? `${t.carrier}: delivered ${formatDay(t.deliveredAt)}`
          : `${t.carrier}: no delivery scan`,
      };
    }),
};

const listingTool: Tool<Record<string, never>, State> = {
  name: "listing",
  description:
    "The product listing as the buyer saw it on the shop's site: the description and the stated size, weight and materials.",
  input: NO_INPUT,
  pending: "Reading the listing",
  run: (_input, state) =>
    once(state, "listing", async () => {
      const products = [...new Set(state.run.order?.items.map((i) => i.productId) ?? [])]
        .map((id) => productById(id))
        .filter((p) => p !== undefined)
        .slice(0, 3);
      if (products.length === 0) return { records: [], label: "No listing found" };
      const records = await Promise.all(
        products.map(async (p) =>
          R.listingRecord(p, await readPage(state, `/shop/products/${p.slug}`)),
        ),
      );
      const live = records.some((r) => r.source.startsWith("http"));
      return {
        records,
        label: live ? "Listing read from the live shop page" : "Listing from the catalog copy",
      };
    }),
};

const policiesTool: Tool<{ topic: "shipping" | "returns" }, State> = {
  name: "shop_policies",
  description:
    "One of the shop's published policies, as the buyer could read it: shipping (where and how orders ship) or returns (returns and damaged items).",
  input: PolicyInput,
  pending: "Reading the shop's policies",
  run: ({ topic }, state) =>
    once(state, `policy:${topic}`, async () => {
      const record = R.policyRecord(topic, await readPage(state, "/shop/policies"));
      const live = record.source.startsWith("http");
      return {
        records: [record],
        label: `${topic === "shipping" ? "Shipping" : "Returns"} policy${live ? " from the live page" : ""}`,
      };
    }),
};

const messagesTool: Tool<Record<string, never>, State> = {
  name: "buyer_messages",
  description:
    "The buyer's claim and every message on the dispute, from the buyer, the seller and PayPal.",
  input: NO_INPUT,
  pending: "Reading the messages",
  run: (_input, state) =>
    once(state, "messages", async () => {
      const records = R.messageRecords(state.run.kase);
      return {
        records,
        label:
          records.length === 1
            ? "The buyer's claim"
            : `The claim and ${records.length - 1} more ${records.length === 2 ? "message" : "messages"}`,
      };
    }),
};

async function readOnePhoto(state: State, caption: string, url: string): Promise<R.NewRecord> {
  const { run } = state;
  const dataUrl = run.deps.readPhoto ? await run.deps.readPhoto(url).catch(() => null) : null;
  if (!dataUrl) return R.photoRecord(caption, url, null, run.kase.openedAt);
  state.photos.push({ caption, dataUrl });
  const product = run.order?.items
    .map((i) => productById(i.productId))
    .find((p) => p !== undefined);
  const size = product?.details.find((d) => /size/i.test(d.label));
  const hint = product
    ? `The product is the ${product.name}.${size ? ` For reference, its listing states the size as ${size.value}; read any measurement yourself rather than assuming it matches.` : ""}`
    : "";
  const content: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `The buyer's caption:\n${fence("buyer", caption, 300)}\n\n${hint}\n\nDescribe the photo.`,
    },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
  const model = run.deps.models.draft;
  const started = Date.now();
  try {
    const response = await run.client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: photoSystem() },
          { role: "user", content },
        ],
        // Thinking stays on: on 27 Oct it read a ruler right every time, and without it one
        // reading in two was off by an inch, which the draft then repeated. It costs about 4 s.
        max_tokens: 2500,
        ...reasoningParams(true),
      },
      requestOptions(deadline(TIMEOUTS.photo.deadline, run.deps.signal), TIMEOUTS.photo.attempt),
    );
    run.meter.record("gather", model, response.usage ?? null, Date.now() - started);
    const think = new ThinkFilter();
    const reading =
      (think.push(response.choices[0]?.message.content ?? "") + think.flush()).trim() || null;
    return R.photoRecord(caption, url, reading, run.kase.openedAt);
  } catch (error) {
    console.error("[analysis] photo reading failed", error);
    run.problems.push("photo");
    return R.photoRecord(caption, url, null, run.kase.openedAt);
  }
}

const photosTool: Tool<Record<string, never>, State> = {
  name: "buyer_photos",
  description:
    "Looks at the photos the buyer sent with the vision model and records what each one shows.",
  input: NO_INPUT,
  pending: "Looking at the buyer's photos",
  run: (_input, state) =>
    once(state, "photos", async () => {
      const photos = state.run.kase.photos.slice(0, 3);
      if (photos.length === 0) return { records: [], label: "No photos from the buyer" };
      const records = await Promise.all(photos.map((p) => readOnePhoto(state, p.caption, p.url)));
      return {
        records,
        label:
          photos.length === 1 ? "Read the buyer's photo" : `Read ${photos.length} buyer photos`,
      };
    }),
};

const similarTool: Tool<Record<string, never>, State> = {
  name: "similar_cases",
  description:
    "Closed cases from this shop that are most like this one, with how they ended and why.",
  input: NO_INPUT,
  pending: "Finding similar past cases",
  run: (_input, state) =>
    once(state, "similar", async () => {
      const { run } = state;
      const model = run.deps.models.embed;
      try {
        const found = await findSimilar(run.client, run.deps.store, model, run.kase, run.closed, {
          signal: deadline(TIMEOUTS.embed.deadline, run.deps.signal),
          attemptTimeoutMs: TIMEOUTS.embed.attempt,
        });
        // A search served from the cache still shows on the model strip, at no cost.
        if (found.searched)
          run.meter.record("similar", model, found.usage ?? { prompt_tokens: 0 }, found.ms);
        state.similar = found.similar;
        const records = await Promise.all(
          found.similar.map(async (match) => {
            const past = run.closed.find((c) => c.id === match.caseId)!;
            const events = await run.deps.store
              .listEvents(run.deps.workspace.id, past.id)
              .catch(() => []);
            return R.historyRecord(past, events);
          }),
        );
        const n = records.length;
        return {
          records,
          label: n ? `${n} similar past ${n === 1 ? "case" : "cases"}` : "No similar past cases",
        };
      } catch (error) {
        console.error("[analysis] similar cases failed", error);
        state.similarFailed = true;
        return { records: [], label: "Similar cases unavailable" };
      }
    }),
};

const TOOLS = [
  orderTool,
  trackingTool,
  listingTool,
  policiesTool,
  messagesTool,
  photosTool,
  similarTool,
] as const;

/** What a dispute of this kind always needs, whatever the model chose. */
function required(run: Run): { tool: Tool<unknown, State>; input: unknown; key: string }[] {
  const { kase, order } = run;
  const list: { tool: Tool<unknown, State>; input: unknown; key: string }[] = [
    { tool: orderTool, input: {}, key: "order" },
    { tool: messagesTool, input: {}, key: "messages" },
  ];
  if (order?.tracking) list.push({ tool: trackingTool, input: {}, key: "tracking" });
  if (kase.reason === "not_received" || kase.reason === "unauthorized") {
    list.push({ tool: policiesTool, input: { topic: "shipping" }, key: "policy:shipping" });
  } else {
    list.push({ tool: listingTool, input: {}, key: "listing" });
    list.push({ tool: policiesTool, input: { topic: "returns" }, key: "policy:returns" });
  }
  if (kase.photos.length > 0) list.push({ tool: photosTool, input: {}, key: "photos" });
  if (run.closed.length > 0) list.push({ tool: similarTool, input: {}, key: "similar" });
  return list;
}

export async function gatherStep(run: Run): Promise<Gathered> {
  const model = run.deps.models.fast;
  run.emit({
    type: "step",
    step: "gather",
    state: "start",
    label: "Gathering the evidence",
    model,
  });
  const state: State = {
    run,
    records: [],
    done: new Map(),
    pages: new Map(),
    similar: [],
    similarFailed: false,
    photos: [],
  };

  const photoNote = run.kase.photos.length
    ? `The buyer sent ${run.kase.photos.length === 1 ? "a photo" : `${run.kase.photos.length} photos`}.`
    : "The buyer sent no photos.";
  // A round's model time runs from the end of the last round's tools to its usage report.
  let mark = Date.now();
  try {
    const agent = runAgent({
      client: run.client,
      model,
      system: gatherSystem(),
      messages: [
        {
          role: "user",
          content: `${caseBlock(run.kase, run.now)}\n\n${orderLine(run.order)}\n${photoNote}`,
        },
      ],
      tools: TOOLS,
      context: state,
      maxRounds: 3,
      maxToolCalls: 10,
      maxTokens: 600,
      thinking: false,
      signal: deadline(TIMEOUTS.gather.deadline, run.deps.signal),
      attemptTimeoutMs: TIMEOUTS.gather.attempt,
    });
    for await (const event of agent) {
      if (event.type === "tool-start")
        run.emit({ type: "tool", id: `gather-${event.id}`, label: event.label, state: "start" });
      if (event.type === "tool-end") {
        run.emit({
          type: "tool",
          id: `gather-${event.id}`,
          label: event.label,
          state: event.ok ? "done" : "error",
        });
        mark = Date.now();
      }
      if (event.type === "usage") {
        run.meter.record(
          "gather",
          model,
          {
            prompt_tokens: event.input,
            completion_tokens: event.output,
            prompt_cache_hit_tokens: event.cached,
          },
          Date.now() - mark,
        );
      }
    }
  } catch (error) {
    console.error("[analysis] gather loop failed", error);
    run.problems.push("gather");
    run.emit({
      type: "tool",
      id: "gather-model",
      label: `Lightning ${failureReason(error)}; collecting the standard records instead`,
      state: "error",
    });
  }

  // Whatever this kind of dispute always needs, in case the model skipped it.
  for (const need of required(run)) {
    if (state.done.has(need.key)) continue;
    const id = `gather-auto-${need.key.replace(":", "-")}`;
    run.emit({ type: "tool", id, label: need.tool.pending, state: "start" });
    try {
      const result = await need.tool.run(need.input, state);
      run.emit({ type: "tool", id, label: result.label, state: "done" });
    } catch (error) {
      console.error("[analysis] required source failed", need.key, error);
      run.emit({ type: "tool", id, label: need.tool.pending, state: "error" });
    }
  }

  const records = R.numberRecords(state.records);
  run.emit({
    type: "step",
    step: "gather",
    state: "done",
    label: `Collected ${records.length} evidence records`,
    model,
  });
  return {
    records,
    similar: state.similar,
    photos: state.photos,
    similarFailed: state.similarFailed,
  };
}
