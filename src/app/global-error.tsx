"use client";

import { Geist, Geist_Mono } from "next/font/google";
import { ErrorScreen } from "@/components/errors/ErrorScreen";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Último recurso: falló el layout raíz, así que esta página reemplaza al
// documento entero y trae su propio <html>, estilos y fuentes. Sin
// ThemeProvider no hay forma de saber el tema elegido: va en oscuro, que es el
// tema por defecto de la app.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="es-CO" className={`dark ${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <title>Algo salió mal | Okany Sync</title>
        <ErrorScreen
          code="500"
          title="Algo salió mal"
          detail="La app no pudo arrancar. Intenta de nuevo en unos segundos; si sigue igual, vuelve más tarde."
          digest={error.digest}
          error={error}
          onRetry={unstable_retry}
          reloadHome
        />
      </body>
    </html>
  );
}
