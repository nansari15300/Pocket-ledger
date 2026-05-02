import type { MetadataRoute } from "next";

/** `output: export` (STATIC_BUILD): route ko fully static banana zaroori — warna /manifest.webmanifest collect fail */
export const dynamic = "force-static";

/** PWA install + theme; icons `public/app-icon.png` (single asset — hosts add 512 later if desired). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pocket Ledger",
    short_name: "Pocket Ledger",
    description: "Modern Accounting Software",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#f1f5f9",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
