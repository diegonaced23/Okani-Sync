"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { UserFilters, EMPTY_FILTERS, type UserFiltersValue } from "@/components/admin/UserFilters";
import { UserRow, type AdminUser } from "@/components/admin/UserRow";
import { activityStatus } from "@/lib/adminHealth";
import { GLASS_SURFACE } from "@/lib/ios";
import { cn } from "@/lib/utils";
import { PageContainer } from "@/components/layout/PageContainer";

export default function AdminUsersPage() {
  const users = useQuery(api.users.listForAdmin);

  const [filters, setFilters] = useState<UserFiltersValue>(EMPTY_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);
  // Se fija al montar: Date.now() en el render rompería la pureza del
  // componente (igual que RatesHealthCard / DormantUsersCard).
  const [nowMs] = useState(() => Date.now());

  const filtered = useMemo(() => {
    if (!users) return [] as AdminUser[];
    const q = filters.search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      if (filters.role !== "all" && u.role !== filters.role) return false;
      if (filters.status === "active" && !u.active) return false;
      if (filters.status === "inactive" && u.active) return false;
      // La actividad usa `activityStatus`, no `active`: son preguntas
      // distintas ("¿está deshabilitada?" vs. "¿la está usando alguien?").
      // Los tres estados importan: quien nunca entró y no tiene contadores
      // calculados queda FUERA de los dos filtros, porque no se sabe en cuál
      // cae y meterlo en uno afirmaría lo que no se ha comprobado.
      const estado = activityStatus(u.lastSeenAt, u.transactionCount, nowMs);
      if (filters.activity === "recent" && estado !== "active") return false;
      if (filters.activity === "dormant" && estado !== "dormant") return false;
      return true;
    });
  }, [users, filters, nowMs]);

  const hasFilters =
    filters.search.trim() !== "" || filters.role !== "all" || filters.status !== "all" || filters.activity !== "all";

  return (
    <PageContainer variant="wide" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
          {users !== undefined && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {hasFilters
                ? `${filtered.length} de ${users.length} usuario${users.length !== 1 ? "s" : ""}`
                : `${users.length} usuario${users.length !== 1 ? "s" : ""} registrado${users.length !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Invitar usuario
        </Button>
      </div>

      <UserFilters value={filters} onChange={setFilters} />

      <div className={cn("rounded-[24px] overflow-hidden", GLASS_SURFACE)}>
        {users === undefined ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay usuarios registrados.</p>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">Ningún usuario coincide con estos filtros.</p>
                <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Limpiar filtros
                </Button>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((user) => (
              <li key={user.clerkId}>
                <UserRow user={user} now={nowMs} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageContainer>
  );
}
