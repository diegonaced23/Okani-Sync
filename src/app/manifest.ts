import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Okany Sync",
    short_name: "Okany",
    description: "Gestión de finanzas personales multi-moneda",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#1F262A",
    theme_color: "#1F262A",
    lang: "es-CO",
    dir: "ltr",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Nueva transacción",
        url: "/transacciones?nuevo=true",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
    ],
  };
}
