"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { clearCachedAvatar } from "@/components/layout/UserAvatar";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    clearCachedAvatar();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex justify-center pb-4">
      <Button
        variant="outline"
        className="gap-2 text-danger border-danger/30 hover:bg-danger/10"
        onClick={handleSignOut}
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </Button>
    </div>
  );
}
