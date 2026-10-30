import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="29 October 2026"
      intro={
        <p>
          This explains what Truce collects, why, who helps us process it, and the choices you have.
          We collect only what we need to answer your disputes, and we never sell it.
        </p>
      }
      sections={[
        {
          title: "What we collect",
          body: (
            <ul>
              <li>
                <strong className="text-ink font-medium">Your account:</strong> your name, email and
                a securely hashed password, or your Google profile if you sign in with Google.
              </li>
              <li>
                <strong className="text-ink font-medium">Your shops:</strong> the shop details,
                policies and notification settings you enter.
              </li>
              <li>
                <strong className="text-ink font-medium">Your PayPal connection:</strong> your REST
                app client ID and secret. The secret is encrypted before it&rsquo;s stored.
              </li>
              <li>
                <strong className="text-ink font-medium">Dispute records:</strong> disputes, the
                payments, orders and tracking behind them, buyer messages and photos, and the drafts
                and decisions made in Truce.
              </li>
              <li>
                <strong className="text-ink font-medium">Basic logs:</strong> sign-in and request
                records used to keep the service secure. Keys and passwords are removed from logs.
              </li>
            </ul>
          ),
        },
        {
          title: "How we use it",
          body: (
            <ul>
              <li>To sync your disputes and draft recommendations and replies.</li>
              <li>To send the steps you approve to PayPal.</li>
              <li>To keep your account secure and prevent abuse.</li>
            </ul>
          ),
        },
        {
          title: "Who helps us run Truce",
          body: (
            <>
              <p>We share data only with the providers needed to run the service:</p>
              <ul>
                <li>Google Cloud and Firebase, for hosting, storage and sign-in.</li>
                <li>
                  Nebius Token Factory, which runs the NVIDIA Nemotron models that read cases and
                  write drafts.
                </li>
                <li>
                  Tavily, for public web searches about a case, such as a carrier&rsquo;s notice.
                </li>
                <li>PayPal, to read your disputes and send the steps you approve.</li>
              </ul>
              <p>We don&rsquo;t sell your data or use it for advertising.</p>
            </>
          ),
        },
        {
          title: "Buyers' information",
          body: (
            <p>
              Disputes include details about your buyers, such as names, addresses and messages. We
              process them only on your behalf to respond to the dispute, and they&rsquo;re only
              visible to members of the shop.
            </p>
          ),
        },
        {
          title: "Security",
          body: (
            <p>
              Data is encrypted in transit and at rest, PayPal secrets get an extra layer of
              encryption, and sessions use secure, http-only cookies. Only members of a shop can see
              its records.
            </p>
          ),
        },
        {
          title: "Keeping and deleting data",
          body: (
            <p>
              We keep your data while your account is active. You can disconnect PayPal at any time,
              which stops new syncing. To have your account and its data deleted, ask us and
              we&rsquo;ll remove it, except where the law requires us to keep a record.
            </p>
          ),
        },
        {
          title: "Your choices",
          body: (
            <p>
              You can see and update your account and shop details in the app, sign out of every
              device, and ask for a copy or deletion of your data.
            </p>
          ),
        },
        {
          title: "Changes",
          body: (
            <p>
              If we change this policy, we&rsquo;ll update the date above and tell you in the app
              when the change matters.
            </p>
          ),
        },
      ]}
    />
  );
}
