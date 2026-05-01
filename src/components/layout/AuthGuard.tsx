"use client";

import { useEffect, useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "loading" | "granted" | "denied";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const ensureExists = useMutation(api.users.ensureExists);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    ensureExists()
      .then(() => setStatus("granted"))
      .catch(() => setStatus("denied"));
  }, [isLoaded, isSignedIn, ensureExists]);

  if (status === "loading") return null;

  if (status === "denied") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-4">
        <div className="rounded-full bg-destructive/10 p-4">
          <Ban className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">Sin acceso</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            Tu cuenta no está autorizada. Contacta al administrador para recibir una invitación.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          Cerrar sesión
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
