import type { MetadataRoute } from "next";
import { THEME_COLORS } from "./components/ui";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ignis AI",
    short_name: "Ignis AI",
    description: "Self-building AI chat and interface that adapts to your workflow.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    categories: ["productivity", "utilities", "developer tools"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
