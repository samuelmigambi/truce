import type { Metadata } from "next";
import { Chat } from "@/components/app/ask/chat";

export const metadata: Metadata = { title: "Ask Truce" };

/** Ask Truce, full page: the conversation fills the screen, the input stays in reach. */
export default function AskPage() {
  return (
    <div className="h-[calc(100dvh-56px)] lg:h-dvh">
      <Chat variant="page" />
    </div>
  );
}
