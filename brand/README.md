# Truce brand kit

Modern, clean and trustworthy: a calm lemon mark for an app that settles disputes fairly.

| | |
|---|---|
| Name | **Truce** in text. The logo writes it in lowercase: "truce". |
| Logo | The Common ground symbol on a lemon tile, then the name in Onest SemiBold |
| Symbol | Two corner pieces, the buyer and the seller, around a square: the ground they agree on |
| Colors | Lemon, ink, cream, mist and moss |
| Font | Onest |

## Logo

Use the files. The lettering is already turned into shapes, so it looks the same everywhere and
never needs retyping.

| File | Use on |
|---|---|
| `logo/truce-logo.svg` | Cream, white and other light backgrounds. This is the primary logo. |
| `logo/truce-logo-on-dark.svg` | Ink and other dark backgrounds |
| `logo/truce-logo-on-lemon.svg` | Lemon backgrounds, where the tile would disappear, so the symbol stands on its own |
| `logo/truce-symbol.svg` | The symbol alone in ink, for one-color uses |
| `logo/truce-wordmark.svg` | The name alone, when the symbol is already nearby |

PNG versions, 1200 and 600 px wide with transparent backgrounds, are in `logo/png/`.

- **Clear space:** keep at least half the tile's height empty around the logo.
- **Minimum size:** 96 px wide on screen. Below that, use the app icon.
- **Don't:**
  - recolor it outside the palette;
  - stretch, rotate or slant it;
  - add shadows, glows, gradients or outlines;
  - retype the name in another font;
  - put a version on the wrong background, for example the dark version on cream.

## App icon and favicon

| File | Use |
|---|---|
| `icon/truce-app-icon.svg` | The rounded icon, for the website, docs and social profiles |
| `icon/truce-app-icon-square.svg` | A full-bleed square for app stores and installable web apps, which apply their own mask. The symbol sits inside the safe zone of round masks. |
| `icon/favicon.svg`, `icon/favicon.ico` | The browser tab icon. The .ico holds 16, 32 and 48 px. |
| `icon/png/` | The rounded icon at 1024, 512, 256, 128 and 64 px; the square icon at 1024, 512 and 192 px; `apple-touch-icon.png` at 180 px; favicons at 16, 32 and 48 px |

For a web app:
- link `favicon.svg`, with `favicon.ico` as the fallback;
- use `apple-touch-icon.png` for iPhone and iPad;
- list the square 192 and 512 px PNGs in the web manifest as maskable icons.

## Colors

| Color | Hex | RGB | Use |
|---|---|---|---|
| Lemon | `#DDEB94` | 221, 235, 148 | The brand color: the logo tile, highlights and good outcomes, such as money kept |
| Ink | `#1E2614` | 30, 38, 20 | Text and dark surfaces |
| Cream | `#FAFBF3` | 250, 251, 243 | Page background, and text on ink |
| Mist | `#F1F6D2` | 241, 246, 210 | Tinted surfaces and selected rows |
| Moss | `#5C7524` | 92, 117, 36 | Links and accents on cream or mist |

**Readable combinations.** Text needs a contrast of at least 4.5:1, or 3:1 for large headings.

| Text on background | Contrast | OK for |
|---|---|---|
| Ink on cream, cream on ink | 15.0 | All text |
| Ink on mist | 14.0 | All text |
| Ink on lemon, lemon on ink | 12.2 | All text |
| Moss on cream, cream on moss | 5.0 | All text |
| Moss on mist | 4.7 | All text |
| Moss on lemon | 4.1 | Large headings only |
| Lemon on cream | 1.2 | Never for text; shapes only, such as the logo tile |

In practice:
- Body text is ink on cream.
- Primary buttons are ink with cream text.
- Good outcomes are lemon with ink text.
- Links are moss.

## Type

Onest for everything, loaded from [Google Fonts](https://fonts.google.com/specimen/Onest). It's
free under the SIL Open Font Licence 1.1.

| Style | Weight |
|---|---|
| Headings | SemiBold (600) |
| Labels and buttons | Medium (500) |
| Body text | Regular (400) |

Use sentence case for headings and buttons.

## Files

```
brand/
├── README.md       this guide
├── logo/           logo SVGs, plus png/
├── icon/           app icons and favicons, plus png/
└── tokens/         colors.css and tokens.json
```

The logo lettering is outlined from Onest SemiBold (SIL Open Font Licence 1.1).
