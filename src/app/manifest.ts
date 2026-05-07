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
        src: "/icons/placeholder.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Nueva transacción",
        url: "/transacciones?nuevo=true",
        icons: [{ src: "/icons/placeholder.svg", sizes: "any" }],
      },
    ],
  };
}
