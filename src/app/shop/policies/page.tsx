import { Mail, RotateCcw, Truck } from "lucide-react";
import type { Metadata } from "next";
import { POLICIES, SHOP } from "@/lib/catalog";

export const metadata: Metadata = { title: "Shipping and returns" };

/** The shop's policies, as buyers read them, and as Truce cites them in a dispute. */
export default function PoliciesPage() {
  const sections = [
    { id: "shipping", title: "Shipping", icon: <Truck />, items: POLICIES.shipping },
    {
      id: "returns",
      title: "Returns and damaged items",
      icon: <RotateCcw />,
      items: POLICIES.returns,
    },
  ];
  return (
    <div className="mx-auto max-w-[760px] px-5 pt-12 sm:px-8 sm:pt-16">
      <p className="text-ember text-[15px]">Policies</p>
      <h1 className="text-espresso mt-3 font-serif text-[40px] leading-tight tracking-[-0.015em] sm:text-[48px]">
        Shipping and returns
      </h1>
      <p className="text-espresso-2 mt-4 text-[17px] leading-relaxed">
        The short version: we ship fast, with tracking, to the address on your PayPal payment, and
        if something arrives damaged we make it right.
      </p>

      <div className="mt-12 space-y-12">
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="scroll-mt-24"
          >
            <div className="flex items-center gap-3">
              <span className="bg-parchment text-ember ring-hairline flex size-10 items-center justify-center rounded-full ring-1 [&_svg]:size-5">
                {section.icon}
              </span>
              <h2 id={`${section.id}-title`} className="text-espresso font-serif text-[26px]">
                {section.title}
              </h2>
            </div>
            <ol className="mt-5 space-y-3">
              {section.items.map((item, i) => (
                <li
                  key={item}
                  className="border-hairline bg-parchment flex gap-4 rounded-[10px] border p-4 sm:p-5"
                >
                  <span className="text-ember font-serif text-lg leading-6 tabular-nums">
                    {i + 1}
                  </span>
                  <p className="text-espresso text-[16px] leading-relaxed">{item}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}

        <section
          aria-labelledby="contact-title"
          className="bg-espresso text-linen rounded-[12px] p-6 sm:p-8"
        >
          <div className="flex items-center gap-3">
            <Mail className="size-5 text-[#F2C08A]" />
            <h2 id="contact-title" className="font-serif text-2xl">
              Something wrong with an order?
            </h2>
          </div>
          <p className="text-linen/80 mt-3 leading-relaxed">
            Write to us at {SHOP.email} with your order number, and a photo if it arrived damaged.
            Most problems are quicker to fix by email than through a PayPal case.
          </p>
        </section>
      </div>
    </div>
  );
}
