import type { Product } from "@/lib/catalog";

/** Reads "3 in wide × 4 in tall" out of a product's size line. */
export function parseSize(product: Product): { width: number; height: number } | null {
  const line = product.details.find((d) => /size/i.test(d.label))?.value ?? "";
  const m = line.match(/([\d.]+)\s*in wide\s*×\s*([\d.]+)\s*in tall/i);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
}

/**
 * The product drawn to scale on a one-inch grid, so nobody is surprised by its size. Photos are
 * close-ups; this isn't.
 */
export function SizeGuide({ product }: { product: Product }) {
  const size = parseSize(product);
  if (!size) return null;
  const unit = 26;
  const cols = 7;
  const rows = 6;
  const w = size.width * unit;
  const h = size.height * unit;
  const left = 24 + ((cols - 1) * unit - w) / 2 + unit / 2;
  const floor = 12 + (rows - 0.5) * unit;
  const top = floor - h;
  const fill = product.art.vessel === "pillar" ? product.art.wax : product.art.vesselColor;
  const count = product.art.vessel === "tin" ? "Each tin" : "Shown";

  return (
    <figure className="border-hairline bg-parchment grid grid-cols-1 items-center gap-5 rounded-[10px] border p-4 sm:grid-cols-[minmax(0,250px)_1fr] sm:p-5">
      <svg
        viewBox={`0 0 ${cols * unit + 48} ${rows * unit + 40}`}
        role="img"
        aria-label={`Drawn to scale: ${size.width} inches wide and ${size.height} inches tall`}
        className="w-full max-w-[250px]"
      >
        {Array.from({ length: cols + 1 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={24 + i * unit}
            x2={24 + i * unit}
            y1={12}
            y2={12 + rows * unit}
            stroke="#2A211A"
            strokeOpacity="0.08"
          />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line
            key={`h${i}`}
            x1={24}
            x2={24 + cols * unit}
            y1={12 + i * unit}
            y2={12 + i * unit}
            stroke="#2A211A"
            strokeOpacity="0.08"
          />
        ))}
        <line
          x1={24}
          x2={24 + cols * unit}
          y1={floor}
          y2={floor}
          stroke="#2A211A"
          strokeOpacity="0.35"
        />
        <rect
          x={left}
          y={top}
          width={w}
          height={h}
          rx={product.art.vessel === "pillar" ? 3 : 8}
          fill={fill}
          fillOpacity="0.85"
          stroke="#2A211A"
          strokeOpacity="0.4"
        />
        {/* Width */}
        <line
          x1={left}
          x2={left + w}
          y1={floor + 12}
          y2={floor + 12}
          stroke="#A7472B"
          strokeWidth="1.2"
        />
        <line
          x1={left}
          x2={left}
          y1={floor + 7}
          y2={floor + 17}
          stroke="#A7472B"
          strokeWidth="1.2"
        />
        <line
          x1={left + w}
          x2={left + w}
          y1={floor + 7}
          y2={floor + 17}
          stroke="#A7472B"
          strokeWidth="1.2"
        />
        <text
          x={left + w / 2}
          y={floor + 27}
          textAnchor="middle"
          fontSize="10"
          fill="#A7472B"
          fontFamily="var(--font-figtree), system-ui"
        >
          {size.width} in
        </text>
        {/* Height */}
        <line
          x1={left + w + 14}
          x2={left + w + 14}
          y1={top}
          y2={floor}
          stroke="#A7472B"
          strokeWidth="1.2"
        />
        <line
          x1={left + w + 9}
          x2={left + w + 19}
          y1={top}
          y2={top}
          stroke="#A7472B"
          strokeWidth="1.2"
        />
        <line
          x1={left + w + 9}
          x2={left + w + 19}
          y1={floor}
          y2={floor}
          stroke="#A7472B"
          strokeWidth="1.2"
        />
        <text
          x={left + w + 24}
          y={(top + floor) / 2 + 3.5}
          fontSize="10"
          fill="#A7472B"
          fontFamily="var(--font-figtree), system-ui"
        >
          {size.height} in
        </text>
      </svg>
      <figcaption>
        <p className="text-espresso font-serif text-lg">{count} to scale</p>
        <p className="text-espresso-2 mt-1 text-sm leading-relaxed">
          Each square is one inch. Our photos are close-ups, so this is the surest way to picture
          the size.
        </p>
      </figcaption>
    </figure>
  );
}
