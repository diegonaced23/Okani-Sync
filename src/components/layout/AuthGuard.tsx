"use client";

import { useEffect, useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useMutation, useAction, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function AppShellSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-7 w-48" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

type Setup = "loading" | "done" | "denied";

function AccessDeniedScreen({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-4">
      <div className="rounded-full bg-destructive/10 p-4">
        <Ban className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold">Sin acceso</h1>
        <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onSignOut}>
        Cerrar sesión
      </Button>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const ensureExists = useMutation(api.users.ensureExists);
  const syncRole = useAction(api.actions.adminUsers.syncRoleToClerk);
  // Suscripción reactiva: si active cambia en Convex, este componente se actualiza sin recargar
  const me = useQuery(api.users.getMe);
  const [setup, setSetup] = useState<Setup>("loading");
  const pathname = usePathname();
  const router = useRouter();

  // Guard de rol: admin solo puede acceder a /admin y /perfil
  const isAdminOnRestrictedRoute =
    me != null &&
    me.active === true &&
    me.role === "admin" &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/perfil");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    ensureExists()
      .then(async () => {
        await syncRole().catch(() => {}); // best-effort: no bloquea si Clerk falla
        setSetup("done");
      })
      .catch(() => setSetup("denied"));
  }, [isLoaded, isSignedIn, ensureExists, syncRole]);

  useEffect(() => {
    if (isAdminOnRestrictedRoute) router.replace("/admin");
  }, [isAdminOnRestrictedRoute, router]);

  // Comprobación inicial de invitación aún en progreso
  if (setup === "loading") return <AppShellSkeleton />;

  // Sin invitación válida
  if (setup === "denied") {
    return (
      <AccessDeniedScreen
        message="Tu cuenta no está autorizada. Contacta al administrador para recibir una invitación."
        onSignOut={signOut}
      />
    );
  }

  // setup === "done" — esperar a que Convex cargue el usuario
  if (me === undefined) return <AppShellSkeleton />;

  // Cuenta eliminada de Convex
  if (me === null) {
    return (
      <AccessDeniedScreen
        message="No se encontró tu cuenta. Contacta al administrador."
        onSignOut={signOut}
      />
    );
  }

  // Cuenta desactivada — reactivo: si un admin la desactiva, esto se aplica de inmediato
  if (!me.active) {
    return (
      <AccessDeniedScreen
        message="Tu cuenta ha sido desactivada. Contacta al administrador."
        onSignOut={signOut}
      />
    );
  }

  if (isAdminOnRestrictedRoute) return <AppShellSkeleton />;

  return <>{children}</>;
}
