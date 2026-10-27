import type { Metadata } from "next";
import { HealthScreen } from "@/components/app/health/health-screen";

export const metadata: Metadata = { title: "Shop health" };

export default function HealthPage() {
  return <HealthScreen />;
}
