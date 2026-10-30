import type { Metadata } from "next";
import { SettingsScreen } from "@/components/app/settings/settings-screen";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsScreen />;
}
