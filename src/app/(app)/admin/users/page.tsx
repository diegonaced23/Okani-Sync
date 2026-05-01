"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { formatRelative } from "@/lib/utils";

export default function AdminUsersPage() {
  const users = useQuery(api.users.listAll);
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = (users ?? []).filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const isLoading = users === undefined;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
          {!isLoading && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {users!.length} usuario{users!.length !== 1 ? "s" : ""} registrado{users!.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o correo…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabla de usuarios */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            {search ? "Sin resultados." : "No hay usuarios."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((user) => (
              <li key={user._id}>
                <button
                  type="button"
                  onClick={() => router.push(`/admin/users/${user.clerkId}`)}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      user.role === "admin"
                        ? "bg-accent/20 text-accent"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {user.role === "admin" ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!user.active && (
                      <Badge variant="destructive" className="text-[10px]">Inactivo</Badge>
                    )}
                    <Badge
                      variant={user.role === "admin" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {user.role === "admin" ? "Admin" : "Usuario"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground hidden sm:block">
                      {formatRelative(user.createdAt)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
