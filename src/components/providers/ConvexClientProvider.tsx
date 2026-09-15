"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import type { AuthClient } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { authClient } from "@/lib/auth-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// El tipo `AuthClient` del paquete se reconstruye vía
// `ReturnType<typeof createAuthClient<...>>` con un genérico sintético — no
// unifica de forma limpia con un cliente real creado con plugins concretos
// (error conocido de inferencia de @convex-dev/better-auth 0.12.5, no un
// problema de forma: authClient sí expone .useSession/.convex.token en
// runtime, verificado contra el código fuente del plugin).
const typedAuthClient = authClient as unknown as AuthClient;

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexBetterAuthProvider client={convex} authClient={typedAuthClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
