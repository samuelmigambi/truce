import type { Metadata } from "next";
import { CasesInbox } from "@/components/app/cases/inbox";

export const metadata: Metadata = { title: "Cases" };

export default function CasesPage() {
  return <CasesInbox />;
}
