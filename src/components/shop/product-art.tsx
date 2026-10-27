import { useId, type ReactNode } from "react";
import type { Product } from "@/lib/catalog";
import { cn } from "../ui/cn";
import { darken, lighten, luminance, mix, seeded } from "./color";

/**
 * Wick & Ember's product photography, drawn: each product's vessel, wax and colors come from its
 * `art` in the catalog. A studio shelf, soft shadows, cylindrical shading, and a living flame.
 */

const ESPRESSO = "#2A211A";
const LINEN = "#F6F0E6";
const LABEL_PAPER = "#F7F1E4";

/** The product's name as it appears on its label. */
export function labelName(name: string): string {
  return name.replace(/\s+(candle trio|pillar candle|gift box|mug candle)$/i, "");
}

interface Ids {
  bg: string;
  floor: string;
  blur: string;
  blurSoft: string;
  flame: string;
  glow: string;
  sheen: string;
}

export function ProductArt({
  product,
  className,
  lit = true,
  title,
}: {
  product: Pick<Product, "name" | "art">;
  className?: string;
  lit?: boolean;
  title?: string;
}) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids: Ids = {
    bg: `${raw}bg`,
    floor: `${raw}fl`,
    blur: `${raw}bl`,
    blurSoft: `${raw}bs`,
    flame: `${raw}fm`,
    glow: `${raw}gw`,
    sheen: `${raw}sh`,
  };
  const { vessel, accent } = product.art;
  const backdrop = mix(accent, LINEN, 0.87);
  const floor = mix(accent, "#E6DAC8", 0.8);
  const flatLay = vessel === "tool";

  return (
    <svg
      viewBox="0 0 400 500"
      role="img"
      aria-label={title ?? product.name}
      className={cn("block h-auto w-full", className)}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id={ids.bg} cx="50%" cy={flatLay ? "45%" : "34%"} r="78%">
          <stop offset="0" stopColor={lighten(backdrop, 0.45)} />
          <stop offset="0.6" stopColor={backdrop} />
          <stop offset="1" stopColor={darken(backdrop, 0.05)} />
        </radialGradient>
        <linearGradient id={ids.floor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={darken(floor, 0.03)} />
          <stop offset="0.25" stopColor={floor} />
          <stop offset="1" stopColor={lighten(floor, 0.18)} />
        </linearGradient>
        <filter id={ids.blur} x="-40%" y="-200%" width="180%" height="500%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={ids.blurSoft} x="-20%" y="-100%" width="140%" height="300%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <radialGradient id={ids.flame} cx="50%" cy="80%" r="64%" fx="50%" fy="88%">
          <stop offset="0" stopColor="#FFFDF1" />
          <stop offset="0.28" stopColor="#FFE9A8" />
          <stop offset="0.62" stopColor="#FFB650" />
          <stop offset="1" stopColor="#EE7C28" stopOpacity="0.85" />
        </radialGradient>
        <radialGradient id={ids.glow}>
          <stop offset="0" stopColor="#FFD68C" stopOpacity="0.62" />
          <stop offset="0.45" stopColor="#FFC66B" stopOpacity="0.18" />
          <stop offset="1" stopColor="#FFC66B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.sheen} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.16" />
          <stop offset="0.2" stopColor="#000" stopOpacity="0" />
          <stop offset="0.8" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.16" />
        </linearGradient>
      </defs>

      <rect width="400" height="500" fill={`url(#${ids.bg})`} />
      {!flatLay && (
        <>
          <rect y="384" width="400" height="116" fill={`url(#${ids.floor})`} />
          <rect y="384" width="400" height="1.2" fill={darken(floor, 0.1)} opacity="0.35" />
        </>
      )}

      {vessel === "jar" && <Jar ids={ids} product={product} lit={lit} />}
      {vessel === "pillar" && <Pillar ids={ids} product={product} lit={lit} />}
      {vessel === "mug" && <Mug ids={ids} product={product} lit={lit} />}
      {vessel === "tin" && <TinTrio ids={ids} product={product} lit={lit} />}
      {vessel === "box" && <GiftBox ids={ids} product={product} />}
      {vessel === "tool" && <Trimmer ids={ids} product={product} />}
    </svg>
  );
}

interface PartProps {
  ids: Ids;
  product: Pick<Product, "name" | "art">;
  lit?: boolean;
}

function Shadow({
  ids,
  cx,
  cy,
  rx,
  ry = 9,
  opacity = 0.22,
}: {
  ids: Ids;
  cx: number;
  cy: number;
  rx: number;
  ry?: number;
  opacity?: number;
}) {
  return (
    <>
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill={ESPRESSO}
        opacity={opacity}
        filter={`url(#${ids.blur})`}
      />
      <ellipse
        cx={cx}
        cy={cy - 1}
        rx={rx * 0.82}
        ry={ry * 0.42}
        fill={ESPRESSO}
        opacity={opacity * 0.9}
        filter={`url(#${ids.blurSoft})`}
      />
    </>
  );
}

/** A lit wick: the glow, the wick, and a flame that flickers (still for reduced motion). */
function Flame({ ids, x, y, s = 1 }: { ids: Ids; x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="-26" r="64" fill={`url(#${ids.glow})`} />
      <path
        d="M0 3 C 0.8 -0.5 -0.8 -3.5 0.5 -7.5"
        stroke={ESPRESSO}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      <g className="flame">
        <path
          d="M0.5 -52 C 6.5 -40 13 -28 11.4 -15.5 C 10.4 -6.2 5.8 -1.6 0.5 -1.6 C -4.8 -1.6 -9.6 -6.2 -10.6 -15.5 C -12 -28 -5.4 -40 0.5 -52 Z"
          fill={`url(#${ids.flame})`}
        />
        <path
          d="M0.5 -31 C 3.1 -23 5.4 -15.6 4.5 -10.4 C 3.8 -5.8 2.2 -4.2 0.5 -4.2 C -1.2 -4.2 -2.9 -5.8 -3.6 -10.4 C -4.5 -15.6 -2.2 -23 0.5 -31 Z"
          fill="#FFFCEC"
          opacity="0.9"
        />
        <ellipse cx="0.5" cy="-4.2" rx="3.4" ry="3" fill="#3D63C9" opacity="0.26" />
      </g>
    </g>
  );
}

/** A label on a curved surface: paper, a hairline inset, the shop name and the product name. */
function Label({
  x1,
  x2,
  top,
  bottom,
  bow,
  accent,
  name,
  note,
  ids,
  size = 14,
}: {
  x1: number;
  x2: number;
  top: number;
  bottom: number;
  bow: number;
  accent: string;
  name: string;
  note?: string;
  ids: Ids;
  size?: number;
}) {
  const cx = (x1 + x2) / 2;
  const path = `M${x1} ${top} Q${cx} ${top + bow} ${x2} ${top} L${x2} ${bottom} Q${cx} ${bottom + bow} ${x1} ${bottom} Z`;
  const inset = `M${x1 + 5} ${top + 5} Q${cx} ${top + bow + 5} ${x2 - 5} ${top + 5} L${x2 - 5} ${bottom - 5} Q${cx} ${bottom + bow - 5} ${x1 + 5} ${bottom - 5} Z`;
  const mid = (top + bottom) / 2 + bow * 0.55;
  return (
    <g>
      <path d={path} fill={LABEL_PAPER} />
      <path d={inset} fill="none" stroke={accent} strokeOpacity="0.55" strokeWidth="0.8" />
      <text
        x={cx}
        y={mid - 9}
        textAnchor="middle"
        fontFamily="var(--font-fraunces), Georgia, serif"
        fontStyle="italic"
        fontSize="9.5"
        fill={accent}
      >
        Wick &amp; Ember
      </text>
      <text
        x={cx}
        y={mid + 8}
        textAnchor="middle"
        fontFamily="var(--font-fraunces), Georgia, serif"
        fontSize={size}
        fill={ESPRESSO}
      >
        {name}
      </text>
      {note && (
        <text
          x={cx}
          y={mid + 22}
          textAnchor="middle"
          fontFamily="var(--font-figtree), system-ui, sans-serif"
          fontSize="8"
          fill={mix(ESPRESSO, LABEL_PAPER, 0.4)}
        >
          {note}
        </text>
      )}
      <path d={path} fill={`url(#${ids.sheen})`} />
    </g>
  );
}

// ---------- Jar ----------

function Jar({ ids, product, lit }: PartProps) {
  const { wax, vesselColor: glass, accent } = product.art;
  const g = `${ids.bg}jar`;
  const clear = luminance(glass) > 0.5;
  const tint = clear ? 0.34 : luminance(glass) < 0.1 ? 0.74 : 0.64;
  const L = 118;
  const R = 282;
  const rimY = 194;
  const base = 412;
  const waxY = 246;
  const body = `M${L} ${rimY} L${L} ${base - 16} Q${L} ${base} ${L + 16} ${base} L${R - 16} ${base} Q${R} ${base} ${R} ${base - 16} L${R} ${rimY} Z`;

  return (
    <g>
      <defs>
        <linearGradient id={`${g}glass`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={darken(glass, 0.38)} />
          <stop offset="0.07" stopColor={darken(glass, 0.12)} />
          <stop offset="0.22" stopColor={lighten(glass, 0.28)} />
          <stop offset="0.4" stopColor={glass} />
          <stop offset="0.74" stopColor={glass} />
          <stop offset="0.92" stopColor={darken(glass, 0.18)} />
          <stop offset="1" stopColor={darken(glass, 0.4)} />
        </linearGradient>
        <linearGradient id={`${g}wax`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={darken(wax, 0.16)} />
          <stop offset="0.3" stopColor={lighten(wax, 0.2)} />
          <stop offset="0.7" stopColor={wax} />
          <stop offset="1" stopColor={darken(wax, 0.2)} />
        </linearGradient>
        <linearGradient id={`${g}inner`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={darken(glass, 0.3)} stopOpacity={clear ? 0.18 : 0.42} />
          <stop offset="1" stopColor={darken(glass, 0.45)} stopOpacity={clear ? 0.28 : 0.6} />
        </linearGradient>
      </defs>

      <Shadow ids={ids} cx={200} cy={base + 2} rx={98} ry={10} />

      {/* Inside: the back wall, the wax and its surface */}
      <path
        d={`M${L + 4} ${rimY} L${L + 4} ${waxY} L${R - 4} ${waxY} L${R - 4} ${rimY} Z`}
        fill={`url(#${g}inner)`}
      />
      <path
        d={`M${L + 7} ${waxY} L${L + 7} ${base - 22} Q${L + 7} ${base - 9} ${L + 20} ${base - 9} L${R - 20} ${base - 9} Q${R - 7} ${base - 9} ${R - 7} ${base - 22} L${R - 7} ${waxY} Z`}
        fill={`url(#${g}wax)`}
      />
      <ellipse cx="200" cy={waxY} rx={(R - L) / 2 - 7} ry="11" fill={lighten(wax, 0.22)} />
      {lit && (
        <ellipse
          cx="200"
          cy={waxY + 1}
          rx="44"
          ry="5.6"
          fill={mix(wax, "#E9C27A", 0.3)}
          opacity="0.65"
        />
      )}

      {/* The glass */}
      <path d={body} fill={`url(#${g}glass)`} opacity={tint} />
      <path
        d={`M${L} ${base - 14} Q${L} ${base} ${L + 16} ${base} L${R - 16} ${base} Q${R} ${base} ${R} ${base - 14} L${R} ${base - 12} Q200 ${base - 4} ${L} ${base - 12} Z`}
        fill={darken(glass, 0.3)}
        opacity={clear ? 0.35 : 0.5}
      />
      <rect
        x={L + 14}
        y={rimY + 16}
        width="7"
        height={base - rimY - 44}
        rx="3.5"
        fill="#fff"
        opacity={clear ? 0.55 : 0.32}
      />
      <rect
        x={L + 27}
        y={rimY + 22}
        width="2"
        height={base - rimY - 70}
        rx="1"
        fill="#fff"
        opacity={clear ? 0.4 : 0.2}
      />
      <rect
        x={R - 19}
        y={rimY + 20}
        width="3"
        height={base - rimY - 60}
        rx="1.5"
        fill="#fff"
        opacity="0.16"
      />

      <Label
        ids={ids}
        x1={140}
        x2={260}
        top={300}
        bottom={366}
        bow={6}
        accent={accent}
        name={labelName(product.name)}
        note={product.art.vesselColor === "#CFDCD6" ? "12 oz · 70 hours" : "8 oz · 50 hours"}
        size={labelName(product.name).length > 12 ? 13 : 14.5}
      />

      {/* The rim */}
      <ellipse
        cx="200"
        cy={rimY}
        rx={(R - L) / 2}
        ry="12.5"
        fill="none"
        stroke={lighten(glass, 0.5)}
        strokeWidth="2.6"
        opacity="0.9"
      />
      <path
        d={`M${L + 2} ${rimY + 1} Q200 ${rimY + 26} ${R - 2} ${rimY + 1}`}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="1.6"
      />

      {lit && <Flame ids={ids} x={200} y={waxY - 1} />}
    </g>
  );
}

// ---------- Pillar ----------

function Pillar({ ids, product, lit }: PartProps) {
  const { wax, accent } = product.art;
  const g = `${ids.bg}pil`;
  const L = 130;
  const R = 270;
  const top = 168;
  const base = 408;
  const rx = (R - L) / 2;
  const body = `M${L} ${top} L${L} ${base} A${rx} 10 0 0 0 ${R} ${base} L${R} ${top} Z`;
  const kraft = "#D9C3A0";

  return (
    <g>
      <defs>
        <linearGradient id={`${g}body`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={darken(wax, 0.3)} />
          <stop offset="0.14" stopColor={darken(wax, 0.08)} />
          <stop offset="0.33" stopColor={lighten(wax, 0.24)} />
          <stop offset="0.52" stopColor={wax} />
          <stop offset="0.82" stopColor={darken(wax, 0.08)} />
          <stop offset="1" stopColor={darken(wax, 0.32)} />
        </linearGradient>
        <radialGradient id={`${g}glow`} cx="50%" cy="0%" r="62%">
          <stop offset="0" stopColor="#FFF0C8" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#FFDCA0" stopOpacity="0.3" />
          <stop offset="1" stopColor="#FFDCA0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${g}kraft`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={darken(kraft, 0.22)} />
          <stop offset="0.3" stopColor={lighten(kraft, 0.18)} />
          <stop offset="0.7" stopColor={kraft} />
          <stop offset="1" stopColor={darken(kraft, 0.24)} />
        </linearGradient>
      </defs>

      <Shadow ids={ids} cx={200} cy={base + 6} rx={86} ry={10} />
      <path d={body} fill={`url(#${g}body)`} />
      {lit && <path d={body} fill={`url(#${g}glow)`} />}

      {/* A drip from the rim */}
      <path
        d={`M150 ${top + 3} C150 ${top + 18} 147 ${top + 26} 148 ${top + 38} C149 ${top + 46} 156 ${top + 46} 156 ${top + 38} C156 ${top + 27} 155 ${top + 16} 158 ${top + 4} Z`}
        fill={lighten(wax, 0.14)}
      />
      <path
        d={`M151 ${top + 12} C150 ${top + 22} 150 ${top + 30} 151 ${top + 37}`}
        stroke="#fff"
        strokeOpacity="0.35"
        strokeWidth="1.4"
        fill="none"
      />

      {/* The top: a soft rim and a melt pool */}
      <ellipse cx="200" cy={top} rx={rx} ry="11" fill={lighten(wax, 0.16)} />
      <ellipse
        cx="200"
        cy={top + 1.5}
        rx={rx - 12}
        ry="7.5"
        fill={darken(wax, 0.06)}
        opacity="0.45"
      />
      <ellipse
        cx="200"
        cy={top + 2}
        rx={rx - 22}
        ry="5.5"
        fill={mix(wax, "#FFF2D2", lit ? 0.42 : 0.2)}
      />
      <ellipse
        cx="200"
        cy={top}
        rx={rx}
        ry="11"
        fill="none"
        stroke={lighten(wax, 0.4)}
        strokeWidth="1.4"
        opacity="0.7"
      />

      {/* A kraft band with twine */}
      <path
        d={`M${L} 318 A${rx} 10 0 0 0 ${R} 318 L${R} 356 A${rx} 10 0 0 1 ${L} 356 Z`}
        fill={`url(#${g}kraft)`}
      />
      <path
        d={`M${L} 323 A${rx} 10 0 0 0 ${R} 323`}
        fill="none"
        stroke={accent}
        strokeWidth="1.6"
        opacity="0.75"
      />
      <path
        d={`M${L} 351 A${rx} 10 0 0 0 ${R} 351`}
        fill="none"
        stroke={accent}
        strokeWidth="1.6"
        opacity="0.75"
      />
      <text
        x="200"
        y="338"
        textAnchor="middle"
        fontFamily="var(--font-fraunces), Georgia, serif"
        fontStyle="italic"
        fontSize="9.5"
        fill={accent}
      >
        Wick &amp; Ember
      </text>
      <text
        x="200"
        y="352"
        textAnchor="middle"
        fontFamily="var(--font-fraunces), Georgia, serif"
        fontSize="12"
        fill={ESPRESSO}
        opacity="0.85"
      >
        {labelName(product.name)}
      </text>

      {lit && <Flame ids={ids} x={200} y={top + 1} s={1.05} />}
    </g>
  );
}

// ---------- Mug ----------

function Mug({ ids, product, lit }: PartProps) {
  const { wax, vesselColor: glaze, accent } = product.art;
  const g = `${ids.bg}mug`;
  const clay = "#D9C3A3";
  const cx = 192;
  const rim = 214;
  const base = 405;
  const body = `M122 ${rim} C122 300 124 368 133 394 Q137 ${base} 150 ${base} L234 ${base} Q247 ${base} 251 394 C260 368 262 300 262 ${rim} Z`;
  const random = seeded(7);
  const speckles = Array.from({ length: 70 }, () => ({
    x: 124 + random() * 136,
    y: rim + 10 + random() * 170,
    r: 0.5 + random() * 1.1,
    o: 0.25 + random() * 0.45,
  }));

  return (
    <g>
      <defs>
        <linearGradient id={`${g}glaze`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={darken(glaze, 0.34)} />
          <stop offset="0.12" stopColor={darken(glaze, 0.08)} />
          <stop offset="0.3" stopColor={lighten(glaze, 0.22)} />
          <stop offset="0.5" stopColor={glaze} />
          <stop offset="0.82" stopColor={darken(glaze, 0.12)} />
          <stop offset="1" stopColor={darken(glaze, 0.36)} />
        </linearGradient>
        <linearGradient id={`${g}handle`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={darken(glaze, 0.3)} />
          <stop offset="0.6" stopColor={darken(glaze, 0.1)} />
          <stop offset="1" stopColor={darken(glaze, 0.34)} />
        </linearGradient>
        <linearGradient id={`${g}clay`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={darken(clay, 0.26)} />
          <stop offset="0.32" stopColor={lighten(clay, 0.2)} />
          <stop offset="1" stopColor={darken(clay, 0.3)} />
        </linearGradient>
        <clipPath id={`${g}clip`}>
          <path d={body} />
        </clipPath>
      </defs>

      <Shadow ids={ids} cx={cx + 12} cy={base + 2} rx={100} ry={10} />

      {/* Handle, behind the body */}
      <path
        d="M254 246 C300 238 314 262 312 292 C310 324 292 346 252 348"
        fill="none"
        stroke={`url(#${g}handle)`}
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M262 245 C296 241 306 262 305 288"
        fill="none"
        stroke={lighten(glaze, 0.25)}
        strokeOpacity="0.45"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Body, glaze, raw clay foot and speckles */}
      <path d={body} fill={`url(#${g}glaze)`} />
      <g clipPath={`url(#${g}clip)`}>
        <path
          d={`M110 378 C138 368 150 384 172 375 C194 366 208 382 228 372 C244 364 256 378 274 369 L274 420 L110 420 Z`}
          fill={`url(#${g}clay)`}
        />
        <path
          d="M110 378 C138 368 150 384 172 375 C194 366 208 382 228 372 C244 364 256 378 274 369"
          fill="none"
          stroke={darken(glaze, 0.3)}
          strokeWidth="2.2"
          opacity="0.55"
        />
        {speckles.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={accent} opacity={s.o} />
        ))}
        <rect x="146" y={rim + 18} width="7" height="128" rx="3.5" fill="#fff" opacity="0.18" />
      </g>

      {/* Rim and wax */}
      <ellipse cx={cx} cy={rim} rx="70" ry="12" fill={lighten(glaze, 0.06)} />
      <ellipse cx={cx} cy={rim + 1.5} rx="63" ry="9.8" fill={darken(glaze, 0.42)} />
      <ellipse cx={cx} cy={rim + 6} rx="61" ry="8.6" fill={wax} />
      {lit && (
        <ellipse
          cx={cx}
          cy={rim + 6.5}
          rx="34"
          ry="4.4"
          fill={mix(wax, "#E8BE78", 0.32)}
          opacity="0.7"
        />
      )}
      <ellipse
        cx={cx}
        cy={rim}
        rx="70"
        ry="12"
        fill="none"
        stroke={lighten(glaze, 0.38)}
        strokeWidth="1.5"
        opacity="0.7"
      />

      {lit && <Flame ids={ids} x={cx} y={rim + 5} />}
    </g>
  );
}

// ---------- Tins ----------

function Tin({
  ids,
  g,
  cx,
  base,
  w,
  h,
  metal,
  wax,
  accent,
  name,
  lid = false,
  lit = false,
}: {
  ids: Ids;
  g: string;
  cx: number;
  base: number;
  w: number;
  h: number;
  metal: string;
  wax: string;
  accent: string;
  name: string;
  lid?: boolean;
  lit?: boolean;
}) {
  const L = cx - w / 2;
  const R = cx + w / 2;
  const rx = w / 2;
  const ry = w * 0.12;
  const top = base - h;
  const body = `M${L} ${top} L${L} ${base} A${rx} ${ry} 0 0 0 ${R} ${base} L${R} ${top} Z`;
  const b1 = top + h * 0.28;
  const b2 = base - h * 0.2;

  return (
    <g>
      <Shadow ids={ids} cx={cx} cy={base + ry * 0.6} rx={rx * 1.08} ry={7} opacity={0.24} />
      <path d={body} fill={`url(#${g}metal)`} />
      <path
        d={`M${L} ${base - 3} A${rx} ${ry} 0 0 0 ${R} ${base - 3}`}
        fill="none"
        stroke={darken(metal, 0.3)}
        strokeWidth="1.2"
        opacity="0.5"
      />
      <path
        d={`M${L} ${b1} A${rx} ${ry} 0 0 0 ${R} ${b1} L${R} ${b2} A${rx} ${ry} 0 0 1 ${L} ${b2} Z`}
        fill={accent}
      />
      <path
        d={`M${L} ${b1} A${rx} ${ry} 0 0 0 ${R} ${b1} L${R} ${b2} A${rx} ${ry} 0 0 1 ${L} ${b2} Z`}
        fill={`url(#${ids.sheen})`}
      />
      <text
        x={cx}
        y={(b1 + b2) / 2 + ry * 0.75 + 3.5}
        textAnchor="middle"
        fontFamily="var(--font-fraunces), Georgia, serif"
        fontSize={w * 0.088}
        fill={LABEL_PAPER}
      >
        {name}
      </text>
      {lid ? (
        <>
          <path
            d={`M${L - 3} ${top - 9} L${L - 3} ${top + 5} A${rx + 3} ${ry + 0.5} 0 0 0 ${R + 3} ${top + 5} L${R + 3} ${top - 9} Z`}
            fill={`url(#${g}metal)`}
          />
          <ellipse cx={cx} cy={top - 9} rx={rx + 3} ry={ry + 0.5} fill={lighten(metal, 0.2)} />
          <ellipse
            cx={cx}
            cy={top - 9}
            rx={rx * 0.72}
            ry={ry * 0.68}
            fill="none"
            stroke={darken(metal, 0.2)}
            strokeOpacity="0.45"
            strokeWidth="1.3"
          />
          <ellipse
            cx={cx}
            cy={top - 9}
            rx={rx * 0.62}
            ry={ry * 0.56}
            fill="none"
            stroke="#fff"
            strokeOpacity="0.5"
            strokeWidth="1"
          />
          <ellipse
            cx={cx}
            cy={top - 9}
            rx={rx + 3}
            ry={ry + 0.5}
            fill="none"
            stroke={lighten(metal, 0.6)}
            strokeWidth="1.2"
            opacity="0.8"
          />
        </>
      ) : (
        <>
          <ellipse cx={cx} cy={top} rx={rx} ry={ry} fill={lighten(metal, 0.3)} />
          <ellipse cx={cx} cy={top + 0.8} rx={rx - 4.5} ry={ry - 1.6} fill={darken(metal, 0.32)} />
          <ellipse cx={cx} cy={top + 3.6} rx={rx - 6} ry={ry - 2.4} fill={wax} />
          {lit && (
            <ellipse
              cx={cx}
              cy={top + 4}
              rx={rx * 0.45}
              ry={ry * 0.45}
              fill={mix(wax, "#E7C07E", 0.32)}
              opacity="0.7"
            />
          )}
          <ellipse
            cx={cx}
            cy={top}
            rx={rx}
            ry={ry}
            fill="none"
            stroke={lighten(metal, 0.65)}
            strokeWidth="1.4"
            opacity="0.9"
          />
          {lit && <Flame ids={ids} x={cx} y={top + 3.5} s={0.82} />}
        </>
      )}
    </g>
  );
}

function TinTrio({ ids, product, lit }: PartProps) {
  const { wax, vesselColor: metal, accent } = product.art;
  const g = `${ids.bg}tin`;
  const name = labelName(product.name);
  const common = { ids, g, metal, wax, accent, name };
  return (
    <g>
      <defs>
        <linearGradient id={`${g}metal`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={darken(metal, 0.36)} />
          <stop offset="0.1" stopColor={darken(metal, 0.12)} />
          <stop offset="0.26" stopColor={lighten(metal, 0.55)} />
          <stop offset="0.4" stopColor={lighten(metal, 0.12)} />
          <stop offset="0.7" stopColor={darken(metal, 0.05)} />
          <stop offset="0.9" stopColor={darken(metal, 0.22)} />
          <stop offset="1" stopColor={darken(metal, 0.4)} />
        </linearGradient>
      </defs>
      <Tin {...common} cx={278} base={352} w={136} h={66} lid />
      <Tin {...common} cx={128} base={360} w={140} h={68} lit={lit} />
      <Tin {...common} cx={204} base={430} w={168} h={80} lit={lit} />
    </g>
  );
}

// ---------- Gift box ----------

function GiftBox({ ids, product }: PartProps) {
  const { vesselColor: board, accent: gold } = product.art;
  const g = `${ids.bg}box`;
  const front = board;
  const side = darken(board, 0.3);
  const topFace = lighten(board, 0.12);
  const ribbon = (id: string, dir: "x" | "y"): ReactNode => (
    <linearGradient id={id} x1="0" y1="0" x2={dir === "x" ? "1" : "0"} y2={dir === "y" ? "1" : "0"}>
      <stop offset="0" stopColor={darken(gold, 0.2)} />
      <stop offset="0.35" stopColor={lighten(gold, 0.35)} />
      <stop offset="0.65" stopColor={gold} />
      <stop offset="1" stopColor={darken(gold, 0.25)} />
    </linearGradient>
  );

  return (
    <g transform="translate(-34 -52) scale(1.16)">
      <defs>
        {ribbon(`${g}rx`, "x")}
        {ribbon(`${g}ry`, "y")}
        <linearGradient id={`${g}front`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={lighten(front, 0.06)} />
          <stop offset="1" stopColor={darken(front, 0.12)} />
        </linearGradient>
      </defs>

      <Shadow ids={ids} cx={214} cy={406} rx={140} ry={12} opacity={0.26} />

      {/* Base */}
      <path d="M96 290 L276 290 L276 408 L96 408 Z" fill={`url(#${g}front)`} />
      <path d="M276 290 L334 262 L334 376 L276 408 Z" fill={side} />
      {/* Lid */}
      <path d="M90 254 L282 254 L282 294 L90 294 Z" fill={lighten(front, 0.05)} />
      <path d="M282 254 L340 224 L340 264 L282 294 Z" fill={darken(board, 0.26)} />
      <path d="M90 254 L148 224 L340 224 L282 254 Z" fill={topFace} />
      <path d="M96 294 L276 294 L276 299 L96 299 Z" fill={darken(board, 0.45)} opacity="0.55" />

      {/* Ribbons: down the front, across the top, down the side */}
      <path d="M176 254 L196 254 L196 408 L176 408 Z" fill={`url(#${g}rx)`} />
      <path d="M176 254 L196 254 L254 224 L234 224 Z" fill={lighten(gold, 0.12)} />
      <path d="M115 243 L303 243 L321 233 L133 233 Z" fill={lighten(gold, 0.18)} />
      <path d="M302 244.4 L320 235 L320 384 L302 395 Z" fill={darken(gold, 0.18)} />

      {/* Bow */}
      <g>
        <path
          d="M214 238 C196 214 166 214 170 232 C173 246 200 246 214 238 Z"
          fill={`url(#${g}ry)`}
        />
        <path
          d="M214 238 C200 224 180 224 182 232 C184 240 202 242 214 238 Z"
          fill={darken(gold, 0.32)}
          opacity="0.55"
        />
        <path
          d="M216 238 C236 212 268 214 262 232 C258 246 230 246 216 238 Z"
          fill={`url(#${g}ry)`}
        />
        <path
          d="M216 238 C230 224 250 225 249 232 C248 240 228 242 216 238 Z"
          fill={darken(gold, 0.32)}
          opacity="0.55"
        />
        <path d="M211 240 L194 276 L201 272 L205 280 L216 244 Z" fill={darken(gold, 0.08)} />
        <path d="M219 240 L238 274 L231 271 L228 279 L214 244 Z" fill={darken(gold, 0.14)} />
        <ellipse cx="215" cy="239" rx="9" ry="7" fill={lighten(gold, 0.2)} />
        <ellipse cx="213" cy="237" rx="3.5" ry="2.2" fill="#fff" opacity="0.4" />
      </g>

      {/* Tag */}
      <path
        d="M205 246 C190 262 172 284 160 302"
        fill="none"
        stroke={darken(gold, 0.25)}
        strokeWidth="1"
      />
      <g transform="rotate(-7 138 326)">
        <path d="M100 306 L166 306 L175 316 L175 348 L100 348 Z" fill={LABEL_PAPER} />
        <circle cx="166" cy="316" r="2.3" fill={darken(board, 0.2)} />
        <text
          x="134"
          y="323"
          textAnchor="middle"
          fontFamily="var(--font-fraunces), Georgia, serif"
          fontStyle="italic"
          fontSize="8"
          fill={darken(gold, 0.3)}
        >
          Wick &amp; Ember
        </text>
        <text
          x="134"
          y="338"
          textAnchor="middle"
          fontFamily="var(--font-fraunces), Georgia, serif"
          fontSize="10"
          fill={ESPRESSO}
        >
          {labelName(product.name)}
        </text>
      </g>
    </g>
  );
}

// ---------- Brass trimmer ----------

function Trimmer({ ids, product }: PartProps) {
  const { vesselColor: brass } = product.art;
  const g = `${ids.bg}trim`;

  const shape = (fill: string, stroke: string) => (
    <g>
      <ellipse cx="-120" cy="-17" rx="24" ry="19" fill="none" stroke={stroke} strokeWidth="7.5" />
      <ellipse cx="-112" cy="21" rx="24" ry="19" fill="none" stroke={stroke} strokeWidth="7.5" />
      <path d="M-98 -8 L44 -3.2 L44 3.2 L-98 2 Z" fill={fill} />
      <path d="M-90 12 L44 2.6 L44 -3 L-92 6 Z" fill={fill} />
      <path
        d="M40 -5 L112 -3.5 Q121 -2.5 124 6 L131 24 L116 27 L109 9 Q107 5 100 5 L40 5 Z"
        fill={fill}
      />
      <rect
        x="111"
        y="21"
        width="30"
        height="13"
        rx="2.5"
        transform="rotate(-12 126 27)"
        fill={fill}
      />
      <circle cx="42" cy="0" r="7.5" fill={fill} />
    </g>
  );

  return (
    <g>
      <defs>
        <linearGradient id={`${g}brass`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={lighten(brass, 0.5)} />
          <stop offset="0.45" stopColor={brass} />
          <stop offset="1" stopColor={darken(brass, 0.32)} />
        </linearGradient>
      </defs>
      <g transform="translate(200 256) rotate(-34) scale(1.32)">
        <g transform="translate(9 13)" opacity="0.26" filter={`url(#${ids.blur})`}>
          {shape(ESPRESSO, ESPRESSO)}
        </g>
        {shape(`url(#${g}brass)`, `url(#${g}brass)`)}
        <circle cx="42" cy="0" r="3.2" fill={darken(brass, 0.35)} />
        <path d="M39.6 0 L44.4 0" stroke={lighten(brass, 0.4)} strokeWidth="1" />
        <path d="M-96 -4.5 L40 -1.2" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.2" />
        <path d="M50 -2.2 L110 -1.4" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.1" />
      </g>
    </g>
  );
}
