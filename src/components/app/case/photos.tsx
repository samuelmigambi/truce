"use client";

import { Expand } from "lucide-react";
import { useState } from "react";
import type { CasePhoto } from "@/lib/domain";
import { Dialog } from "../../ui/overlay";

/** The buyer's photos, as they sent them. Truce's vision model reads these too. */
export function BuyerPhotos({ photos, buyer }: { photos: CasePhoto[]; buyer: string }) {
  const [open, setOpen] = useState<CasePhoto | null>(null);
  return (
    <>
      <ul className="grid grid-cols-2 gap-3">
        {photos.map((photo) => (
          <li key={photo.url}>
            <button
              type="button"
              onClick={() => setOpen(photo)}
              className="group border-line-soft bg-cream relative block w-full overflow-hidden rounded-[10px] border text-left"
            >
              {/* Buyer photos are user content of unknown size; a plain img keeps them as sent. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.caption}
                className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <span className="bg-paper/90 text-ink shadow-lift absolute top-2 right-2 flex size-7 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Expand className="size-3.5" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={`Photo from ${buyer}`}
        description={open?.caption}
        size="lg"
      >
        {open && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={open.url}
            alt={open.caption}
            className="border-line-soft w-full rounded-[10px] border"
          />
        )}
      </Dialog>
    </>
  );
}
