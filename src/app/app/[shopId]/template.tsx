import { PageTransition } from "@/components/page-transition";

/** Each screen in a shop fades and rises into place; the shell around it stays still. */
export default function ShopTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
