"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const ensureExists = useMutation(api.users.ensureExists);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      ensureExists().catch(() => {});
    }
  }, [isLoaded, isSignedIn, ensureExists]);

  if (!isLoaded || !isSignedIn) return null;

  return <>{children}</>;
}
