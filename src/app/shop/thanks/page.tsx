import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ThanksMark } from "@/components/shop/thanks-mark";
import { ShopLink } from "@/components/shop/ui";
import { POLICIES } from "@/lib/catalog";

export const metadata: Metadata = { title: "Thank you" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const order = one(params.order)?.slice(0, 40);
  const paypalId = one(params.paypal)?.slice(0, 40);

  const steps = [
    { title: "We pour and pack it", body: "Your order leaves Portland within 1–2 business days." },
    {
      title: "Tracking goes to PayPal",
      body: POLICIES.shipping[2] ?? "Tracking is added to your PayPal order.",
    },
    {
      title: "It arrives by USPS",
      body: "To the address on your PayPal payment, the only one we ship to.",
    },
  ];

  return (
    <div className="mx-auto max-w-[680px] px-5 pt-16 text-center sm:px-8 sm:pt-20">
      <div className="flex justify-center">
        <ThanksMark />
      </div>
      <h1 className="text-espresso mt-6 font-serif text-[40px] leading-tight tracking-[-0.015em] sm:text-[48px]">
        Thank you. Your order is in.
      </h1>
      <p className="text-espresso-2 mt-3 text-[17px]">
        {order ? (
          <>
            Order <span className="text-espresso font-medium">{order}</span>
          </>
        ) : (
          "We've got your payment"
        )}
        {paypalId && <span className="text-espresso-3"> · PayPal {paypalId}</span>}
      </p>

      <ol className="mt-12 grid gap-3 text-left sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="border-hairline bg-parchment rounded-[10px] border p-5">
            <span className="text-ember font-serif text-lg">{i + 1}</span>
            <h2 className="text-espresso mt-2 font-serif text-lg leading-snug">{s.title}</h2>
            <p className="text-espresso-2 mt-1 text-sm leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ShopLink href="/shop" variant="secondary">
          Back to the shop
        </ShopLink>
      </div>

      <div className="border-hairline mt-14 rounded-[12px] border border-dashed p-5 text-left font-sans">
        <p className="text-espresso text-sm font-medium">This is a demo shop</p>
        <p className="text-espresso-2 mt-1 text-sm leading-relaxed">
          Your sandbox order now sits in Truce, where the before-shipping checks run on it.
        </p>
        <Link
          href="/app/orders"
          className="text-ember mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          See it in Truce
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
