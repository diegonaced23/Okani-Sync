import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SWRegistration } from "@/components/SWRegistration";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Okany Sync", template: "%s | Okany Sync" },
  description: "Gestión de finanzas personales multi-moneda",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Okany",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "oklch(0.985 0.006 90)" },
    { media: "(prefers-color-scheme: dark)",  color: "oklch(0.16 0.025 255)" },
  ],
  width: "device-width",
  initialScale: 1,
  // Necesario para que env(safe-area-inset-*) devuelva valores reales en iOS
  // (notch, barra de gestos). Con statusBarStyle "black-translucent" la PWA
  // dibuja bajo la barra de estado, así que el Header compensa el inset superior.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SWRegistration />
        <SpeedInsights />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ConvexClientProvider>{children}</ConvexClientProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
