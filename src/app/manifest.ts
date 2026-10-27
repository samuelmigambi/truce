import type { MetadataRoute } from "next";

/** Lets Truce install as a web app, with the brand's square, maskable icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Truce",
    short_name: "Truce",
    description: "PayPal disputes, handled for small online sellers. You approve every step.",
    start_url: "/app",
    display: "standalone",
    background_color: "#FAFBF3",
    theme_color: "#FAFBF3",
    icons: [
      {
        src: "/brand/truce-app-icon-square-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/truce-app-icon-square-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/brand/truce-app-icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
