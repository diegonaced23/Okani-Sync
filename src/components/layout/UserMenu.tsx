"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { User, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { UserAvatar, clearCachedAvatar } from "@/components/layout/UserAvatar";

export function UserMenu({ avatarClassName = "h-8 w-8 rounded-[10px]" }: { avatarClassName?: string }) {
  const router = useRouter();
  const me = useQuery(api.users.getMe);

  async function handleSignOut() {
    await authClient.signOut();
    clearCachedAvatar();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menú de usuario"
        className={`touch-hit flex shrink-0 ${avatarClassName}`}
      >
        <UserAvatar className="h-full w-full rounded-[inherit] text-sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Base UI exige que GroupLabel viva dentro de un Group: sin él, abrir el menú lanza error. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <p className="truncate text-foreground">{me?.name || "Usuario"}</p>
            <p className="truncate font-normal">{me?.email}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/perfil")}>
          <User /> Perfil
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOut /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
