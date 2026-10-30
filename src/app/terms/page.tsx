import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="29 October 2026"
      intro={
        <p>
          These terms cover your use of Truce, a service that helps online sellers answer PayPal
          disputes. By creating an account you agree to them. Truce is in beta, so we keep them
          short and plain.
        </p>
      }
      sections={[
        {
          title: "What Truce does",
          body: (
            <>
              <p>
                Truce reads the disputes on the PayPal account you connect, gathers the records
                around each one, and drafts a recommendation and a reply. Drafts are written with AI
                models and checked against your evidence before you see them.
              </p>
              <p>
                Nothing reaches PayPal or a buyer until you approve it. You decide whether to fight,
                settle or refund, and you can edit any draft first.
              </p>
            </>
          ),
        },
        {
          title: "Your account",
          body: (
            <ul>
              <li>Give us accurate details and keep your password to yourself.</li>
              <li>You&rsquo;re responsible for what happens under your account.</li>
              <li>
                Only connect PayPal accounts and shops you own or are authorized to manage, and only
                add people to a shop who should see its disputes.
              </li>
            </ul>
          ),
        },
        {
          title: "Your PayPal connection",
          body: (
            <p>
              You connect PayPal with your own REST app keys. Truce uses them only to read your
              disputes and the payments and orders behind them, and to send the steps you approve.
              You can disconnect a shop at any time in its settings, and you can also revoke the
              keys in PayPal&rsquo;s developer dashboard.
            </p>
          ),
        },
        {
          title: "No guaranteed outcomes",
          body: (
            <>
              <p>
                PayPal, card issuers and buyers make the final decisions on disputes. Truce&rsquo;s
                recommendations and cost estimates are guidance, not legal or financial advice, and
                we can&rsquo;t promise any case will be won.
              </p>
              <p>
                AI can make mistakes. Read each draft before you approve it; once approved, it is
                sent as your own response.
              </p>
            </>
          ),
        },
        {
          title: "Acceptable use",
          body: (
            <ul>
              <li>
                Don&rsquo;t use Truce to mislead PayPal or buyers, or to submit false evidence.
              </li>
              <li>Don&rsquo;t try to break, overload or get around the service&rsquo;s limits.</li>
              <li>Don&rsquo;t access shops or data that aren&rsquo;t yours.</li>
            </ul>
          ),
        },
        {
          title: "Your data",
          body: (
            <p>
              Your shop&rsquo;s records stay yours. We use them only to run Truce for you, as the{" "}
              <Link href="/privacy" className="text-moss-deep font-medium hover:underline">
                Privacy policy
              </Link>{" "}
              explains.
            </p>
          ),
        },
        {
          title: "The beta",
          body: (
            <p>
              Truce is free during the beta. Features may change, and the service may occasionally
              be unavailable. We&rsquo;ll give notice in the app before introducing any charges, and
              you can stop using Truce at any time.
            </p>
          ),
        },
        {
          title: "Ending your use",
          body: (
            <p>
              You can disconnect PayPal and stop using Truce whenever you like. We may suspend
              accounts that break these terms or put other sellers, buyers or the service at risk.
            </p>
          ),
        },
        {
          title: "Liability",
          body: (
            <p>
              Truce is provided as it is during the beta. To the extent the law allows, we
              aren&rsquo;t liable for indirect losses, lost profits, or the outcome of any dispute.
            </p>
          ),
        },
        {
          title: "Changes to these terms",
          body: (
            <p>
              If we change these terms, we&rsquo;ll update the date above and tell you in the app
              when the change matters. Using Truce after a change means you accept the new terms.
            </p>
          ),
        },
      ]}
    />
  );
}
