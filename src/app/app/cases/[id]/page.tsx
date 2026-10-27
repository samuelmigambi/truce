import type { Metadata } from "next";
import { CaseFile } from "@/components/app/case/case-file";

export const metadata: Metadata = { title: "Case" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseFile id={decodeURIComponent(id)} />;
}
