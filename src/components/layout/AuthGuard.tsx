"use client";

import { useAuth } from "@clerk/nextjs";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded || !isSignedIn) return null;

  return <>{children}</>;
}
