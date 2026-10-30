import type { Metadata } from "next";
import { AskHome } from "@/components/app/ask/ask-home";

export const metadata: Metadata = { title: "Ask Truce" };

/** The shop's home: Ask Truce, with the open chat in the address and recent chats under it. */
export default function HomePage() {
  return <AskHome />;
}
