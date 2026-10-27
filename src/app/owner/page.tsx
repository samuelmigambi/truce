import type { Metadata } from "next";
import { OwnerSignIn } from "./sign-in";

export const metadata: Metadata = {
  title: "Signing in",
  robots: { index: false, follow: false },
};

/**
 * The owner's way into the live sandbox: /owner#key=… The key rides in the fragment, which
 * browsers never send to a server, so it stays out of request logs; the page posts it to
 * /api/owner and then opens the app.
 */
export default function OwnerPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <OwnerSignIn />
    </main>
  );
}
