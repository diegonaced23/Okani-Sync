"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Check, X, LogOut, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { formatCents } from "@/lib/money";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const PERMISSION_LABELS: Record<string, string> = {
  viewer: "Visualizador",
  editor: "Editor",
  admin: "Administrador",
};

export default function CompartidasPage() {
  const router = useRouter();
  const [leavingShare, setLeavingShare] = useState<{ id: Id<"accountShares">; accountName: string } | null>(null);

  const pending = useQuery(api.accountShares.listMyPendingInvitations);
  const active = useQuery(api.accountShares.listMyActiveShares);

  const respond = useMutation(api.accountShares.respondToInvitation);
  const leave = useMutation(api.accountShares.leaveSharedAccount);

  async function handleRespond(shareId: Id<"accountShares">, accept: boolean) {
    try {
      await respond({ shareId, accept });
      toast.success(accept ? "Invitación aceptada" : "Invitación rechazada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  function handleLeave(shareId: Id<"accountShares">, accountName: string) {
    setLeavingShare({ id: shareId, accountName });
  }

  async function executeLeave() {
    if (!leavingShare) return;
    try {
      await leave({ shareId: leavingShare.id });
      toast.success("Saliste de la cuenta compartida");
      setLeavingShare(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  const isLoading = pending === undefined || active === undefined;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/cuentas")}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
          aria-label="Volver a cuentas"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-bold text-foreground">Cuentas compartidas</h1>
      </div>

      {/* Invitaciones pendientes */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Invitaciones pendientes
        </h2>

        {isLoading ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : (pending ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center rounded-xl bg-card border border-border">
            Sin invitaciones pendientes.
          </p>
        ) : (
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <ul className="divide-y divide-border">
              {pending!.map((inv) => (
                <li key={inv._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {inv.accountName ?? "Cuenta sin nombre"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      De {inv.ownerName ?? "usuario desconocido"} ·{" "}
                      {PERMISSION_LABELS[inv.permission] ?? inv.permission}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRespond(inv._id, false)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted text-muted-foreground hover:text-danger transition-colors"
                      aria-label="Rechazar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespond(inv._id, true)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
                      aria-label="Aceptar"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Separator />

      {/* Cuentas compartidas activas */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Compartidas conmigo
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (active ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center rounded-xl bg-card border border-border">
            Ninguna cuenta compartida contigo aún.
          </p>
        ) : (
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <ul className="divide-y divide-border">
              {active!.map((share) => (
                <li key={share._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {share.account?.name ?? "Cuenta"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      De {share.ownerName ?? "otro usuario"} ·{" "}
                      {PERMISSION_LABELS[share.permission] ?? share.permission}
                    </p>
                    {share.account && (
                      <p className="text-xs font-medium text-foreground mt-0.5">
                        {formatCents(share.account.balance, share.account.currency)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">
                      {share.account?.currency}
                    </Badge>
                    <button
                      type="button"
                      onClick={() =>
                        handleLeave(share._id, share.account?.name ?? "esta cuenta")
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted text-muted-foreground hover:text-danger transition-colors"
                      aria-label="Salir de cuenta compartida"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <AlertDialog open={leavingShare !== null} onOpenChange={(open) => { if (!open) setLeavingShare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salir de la cuenta</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Salir de &quot;{leavingShare?.accountName}&quot;? Perderás el acceso a esta cuenta compartida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={executeLeave}>
              Salir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
