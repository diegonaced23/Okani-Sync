import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 text-center">
        <div className="flex justify-center mb-4">
          <span
            aria-hidden
            style={{
              width: 64, height: 64, borderRadius: 18,
              background: "linear-gradient(135deg, #4ADE80, #22D3EE)",
              display: "grid", placeItems: "center",
              boxShadow: "0 8px 32px -4px rgba(74,222,128,0.45)",
              flexShrink: 0,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 14c0-5 4-9 8-9s8 4 8 9" stroke="#052e16" strokeWidth="3" strokeLinecap="round" />
              <circle cx="12" cy="17" r="2.5" fill="#052e16" />
            </svg>
          </span>
        </div>
        <h1 className="text-3xl font-bold">
          <span className="text-accent">Okany</span>
          <span className="text-foreground"> Sync</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gestión de finanzas personales
        </p>
      </div>
      <SignIn />
    </main>
  );
}
