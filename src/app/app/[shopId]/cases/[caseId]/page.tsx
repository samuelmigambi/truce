import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseFile } from "@/components/app/case/case-file";

export const metadata: Metadata = { title: "Case" };

/** Case IDs are short runs of letters, digits and a little punctuation; anything else isn't one. */
function caseIdFrom(raw: string): string | null {
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return /^[\w.:-]{1,120}$/.test(id) ? id : null;
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ shopId: string; caseId: string }>;
}) {
  const { caseId } = await params;
  const id = caseIdFrom(caseId);
  if (!id) notFound();
  return <CaseFile id={id} />;
}
