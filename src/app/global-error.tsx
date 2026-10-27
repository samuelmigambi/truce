"use client";

import { useEffect } from "react";
import "./globals.css";

/** The last resort, when the root layout itself fails: plain, readable, and a way to retry. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-cream text-ink flex min-h-dvh items-center justify-center px-6 font-sans antialiased">
        <main className="max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Truce couldn&rsquo;t load</h1>
          <p className="text-ink-2 mt-3">
            Something went wrong on our side. Nothing was sent or changed.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-btn bg-ink text-cream mt-6 inline-flex h-10 items-center px-4 text-sm font-medium"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
