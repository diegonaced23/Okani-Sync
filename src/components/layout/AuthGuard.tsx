"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { clearCachedAvatar } from "@/components/layout/UserAvatar";

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

function AccessDeniedScreen({
  message,
  onSignOut,
  title = "Sin acceso",
  actionLabel = "Cerrar sesión",
}: {
  message: string;
  onSignOut: () => void;
  title?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-4">
      <div className="rounded-full bg-destructive/10 p-4">
        <Ban className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onSignOut}>
        {actionLabel}
      </Button>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { isAuthenticated } = useConvexAuth();
  const ensureExists = useMutation(api.users.ensureExists);
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
    if (sessionPending || !session || !isAuthenticated) return;
    ensureExists()
      .then(() => setSetup("done"))
      .catch(() => setSetup("denied"));
  }, [sessionPending, session, isAuthenticated, ensureExists]);

  useEffect(() => {
    if (isAdminOnRestrictedRoute) router.replace("/admin");
  }, [isAdminOnRestrictedRoute, router]);

  async function handleSignOut() {
    await authClient.signOut();
    clearCachedAvatar();
    router.push("/login");
    router.refresh();
  }

  // La sesión del cliente dejó de ser válida mientras la pantalla estaba
  // abierta: caducó, o la revocaron desde otro dispositivo (perfil → Sesiones
  // activas). El efecto de arriba corta antes de tiempo en ese caso y `setup`
  // se queda en "loading" para siempre — hasta ahora el usuario se quedaba
  // mirando el skeleton sin saber qué pasaba.
  //
  // Se resuelve con un botón y no con un redirect automático porque el botón
  // cierra sesión primero: navegar a /login con la cookie todavía puesta
  // dejaría al usuario dando vueltas.
  if (!sessionPending && !session) {
    return (
      <AccessDeniedScreen
        title="Sesión expirada"
        message="Tu sesión caducó o se cerró desde otro dispositivo. Vuelve a iniciar sesión para continuar."
        actionLabel="Volver a iniciar sesión"
        onSignOut={handleSignOut}
      />
    );
  }

  // Comprobación inicial de invitación aún en progreso
  if (setup === "loading") return <AppShellSkeleton />;

  // Sin invitación válida
  if (setup === "denied") {
    return (
      <AccessDeniedScreen
        message="Tu cuenta no está autorizada. Contacta al administrador para recibir una invitación."
        onSignOut={handleSignOut}
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
        onSignOut={handleSignOut}
      />
    );
  }

  // Cuenta desactivada — reactivo: si un admin la desactiva, esto se aplica de inmediato
  if (!me.active) {
    return (
      <AccessDeniedScreen
        message="Tu cuenta ha sido desactivada. Contacta al administrador."
        onSignOut={handleSignOut}
      />
    );
  }

  if (isAdminOnRestrictedRoute) return <AppShellSkeleton />;

  return <>{children}</>;
}
