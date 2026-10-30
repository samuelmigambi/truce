import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import { Providers } from "@/components/providers";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const onest = Onest({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-onest",
});

const description =
  "Truce handles PayPal disputes for small online sellers. It prevents the avoidable ones, fights the winnable ones, and you approve every step.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: { default: "Truce: PayPal disputes, handled", template: "%s · Truce" },
  description,
  applicationName: "Truce",
  openGraph: {
    title: "Truce: PayPal disputes, handled",
    description,
    siteName: "Truce",
    type: "website",
    images: [{ url: "/brand/truce-og.png", width: 1200, height: 630, alt: "Truce" }],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFBF3" },
    { media: "(prefers-color-scheme: dark)", color: "#18181A" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The head script sets data-theme before React loads, so the server's markup differs there.
    <html lang="en" className={onest.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-cream text-ink min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
