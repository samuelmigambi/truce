"use client";

import { useEffect, useRef, useState } from "react";

type Step = "signing" | "no-key" | "wrong" | "limited" | "offline";

const MESSAGES: Record<Step, string> = {
  signing: "Signing you in…",
  "no-key": "Open this page from the owner link.",
  wrong: "That key didn't match.",
  limited: "Too many tries. Try again in an hour.",
  offline: "Couldn't reach the server. Try again in a moment.",
};

/** Takes the key from the fragment, wipes it from the address bar, posts it, then opens the app. */
async function signIn(): Promise<Step | null> {
  const key = new URLSearchParams(window.location.hash.slice(1)).get("key");
  window.history.replaceState(null, "", "/owner");
  if (!key) return "no-key";
  try {
    const response = await fetch("/api/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (response.ok) {
      window.location.replace("/app");
      return null;
    }
    return response.status === 429 ? "limited" : "wrong";
  } catch {
    return "offline";
  }
}

export function OwnerSignIn() {
  const [step, setStep] = useState<Step>("signing");
  // Once only, even when development mode runs effects twice: the key is gone after the first.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void signIn().then((next) => {
      if (next) setStep(next);
    });
  }, []);

  return (
    <p role="status" aria-live="polite">
      {MESSAGES[step]}
    </p>
  );
}
