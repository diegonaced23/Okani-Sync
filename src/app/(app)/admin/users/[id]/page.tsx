"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck, User, Trash2, Link2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { DeleteUserDialog } from "@/components/admin/DeleteUserDialog";
import { toast } from "sonner";
import { formatRelative } from "@/lib/utils";

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "user.created":           "Usuario creado",
  "user.updated":           "Usuario actualizado",
  "user.deleted":           "Usuario eliminado",
  "user.deactivated":       "Usuario desactivado",
  "user.role.changed":      "Rol cambiado",
  "user.password_reset":    "Link de acceso generado",
  "account.shared":         "Cuenta compartida",
  "account.share.revoked":  "Acceso revocado",
  "account.share.accepted": "Invitación aceptada",
  "account.share.rejected": "Invitación rechazada",
  "account.created":        "Cuenta creada",
  "account.deleted":        "Cuenta eliminada",
};

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clerkId } = use(params);
  const router = useRouter();

  const users = useQuery(api.users.listAll);
  const auditLogs = useQuery(api.auditLogs.listForUser, { targetClerkId: clerkId });
  const updateUser = useMutation(api.users.updateByAdmin);
  const generateResetLink = useAction(api.actions.adminUsers.generateResetLink);

  const user = (users ?? []).find((u) => u.clerkId === clerkId);

  const [name, setName] = useState("");
  const [nameEditing, setNameEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [confirmLinkOpen, setConfirmLinkOpen] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  const isLoading = users === undefined;

  if (!isLoading && !user) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-muted-foreground">Usuario no encontrado.</p>
        <Button variant="outline" onClick={() => router.push("/admin/users")}>Volver</Button>
      </div>
    );
  }

  async function handleRoleChange(newRole: "admin" | "user") {
    try {
      await updateUser({ targetClerkId: clerkId, role: newRole });
      toast.success("Rol actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleActiveToggle(active: boolean) {
    try {
      await updateUser({ targetClerkId: clerkId, active });
      toast.success(active ? "Usuario activado" : "Usuario desactivado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleNameSave() {
    if (!name.trim()) return;
    setSavingName(true);
    try {
      await updateUser({ targetClerkId: clerkId, name: name.trim() });
      toast.success("Nombre actualizado");
      setNameEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingName(false);
    }
  }

  async function handleGenerateResetLink() {
    setConfirmLinkOpen(false);
    setGeneratingLink(true);
    try {
      const url = await generateResetLink({ targetClerkId: clerkId });
      setResetLink(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar el link");
    } finally {
      setGeneratingLink(false);
    }
  }

  async function handleCopy() {
    if (!resetLink) return;
    await navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <button
        type="button"
        onClick={() => router.push("/admin/users")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Usuarios
      </button>

      {/* Header usuario */}
      {isLoading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-start gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              user!.role === "admin" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
            }`}>
              {user!.role === "admin" ? <ShieldCheck className="h-6 w-6" /> : <User className="h-6 w-6" />}
            </span>
            <div className="flex-1">
              {nameEditing ? (
                <div className="flex gap-2">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={user!.name}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" onClick={handleNameSave} disabled={savingName}>
                    {savingName ? "…" : "Guardar"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setNameEditing(false)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setName(user!.name); setNameEditing(true); }}
                  className="text-lg font-bold text-foreground hover:underline"
                >
                  {user!.name}
                </button>
              )}
              <p className="text-sm text-muted-foreground">{user!.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Creado {formatRelative(user!.createdAt)}
                {user!.welcomeEmailSentAt && " · Email de bienvenida enviado"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Controles */}
      {user && (
        <div className="space-y-4">
          {/* Rol */}
          <div className="flex items-center justify-between rounded-xl bg-card border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Rol</p>
              <p className="text-xs text-muted-foreground">Determina el acceso al panel admin</p>
            </div>
            <Select
              value={user.role}
              onValueChange={(v) => { if (v) handleRoleChange(v as "admin" | "user"); }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuario</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Estado activo */}
          <div className="flex items-center justify-between rounded-xl bg-card border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Estado</p>
              <p className="text-xs text-muted-foreground">
                {user.active ? "El usuario puede iniciar sesión" : "El usuario no puede acceder"}
              </p>
            </div>
            <Switch checked={user.active} onCheckedChange={handleActiveToggle} />
          </div>

          {/* Acceso temporal */}
          <div className="flex items-center justify-between rounded-xl bg-card border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Acceso temporal</p>
              <p className="text-xs text-muted-foreground">
                Genera un link de un solo uso para que el usuario inicie sesión
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmLinkOpen(true)}
              disabled={generatingLink}
            >
              <Link2 className="h-3.5 w-3.5" />
              {generatingLink ? "Generando…" : "Generar link"}
            </Button>
          </div>

          {/* Zona de peligro */}
          <Separator />
          <div className="rounded-xl bg-danger/5 border border-danger/20 p-4">
            <p className="text-sm font-semibold text-danger mb-1">Zona de peligro</p>
            <p className="text-xs text-muted-foreground mb-3">
              Eliminar el usuario borra TODOS sus datos permanentemente: cuentas, tarjetas,
              transacciones, deudas, categorías, presupuestos y su cuenta de Clerk.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar usuario
            </Button>
          </div>
        </div>
      )}

      {/* Audit logs */}
      {(auditLogs ?? []).length > 0 && (
        <>
          <Separator />
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Historial de acciones
            </h2>
            <div className="rounded-xl bg-card border border-border overflow-hidden">
              <ul className="divide-y divide-border">
                {auditLogs!.map((log) => (
                  <li key={log._id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-foreground">
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatRelative(log.createdAt)}
                      </span>
                    </div>
                    {log.metadata && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {JSON.stringify(log.metadata).slice(0, 100)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}

      {/* Dialog de eliminación */}
      {user && (
        <DeleteUserDialog
          targetClerkId={clerkId}
          targetEmail={user.email}
          targetName={user.name}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => router.push("/admin/users")}
        />
      )}

      {/* Confirmación de generar link */}
      <AlertDialog open={confirmLinkOpen} onOpenChange={setConfirmLinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Generar link de acceso?</AlertDialogTitle>
            <AlertDialogDescription>
              Se creará un link de un solo uso para <strong>{user?.email}</strong>.
              Compártelo de forma segura con el usuario. Expira después de usarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateResetLink} variant="default">
              Generar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para mostrar el link generado */}
      <Dialog open={!!resetLink} onOpenChange={(open) => { if (!open) setResetLink(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link de acceso generado</DialogTitle>
            <DialogDescription>
              Es de un solo uso. Compártelo de forma segura con el usuario.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              readOnly
              value={resetLink ?? ""}
              className="text-xs font-mono"
            />
            <Button size="icon" variant="outline" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
