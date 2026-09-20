"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { clearCachedAvatar } from "@/components/layout/UserAvatar";
import { GLASS_SURFACE, haptic } from "@/lib/ios";
import { cn } from "@/lib/utils";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    haptic();
    await authClient.signOut();
    clearCachedAvatar();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className={cn(
        "touch-hit flex h-12 w-full items-center justify-center gap-2 rounded-[18px] text-[15px] font-bold text-danger transition-transform active:scale-[0.99]",
        GLASS_SURFACE,
      )}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Cerrar sesión
    </button>
  );
}
