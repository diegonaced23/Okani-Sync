"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { MAX_AVATAR_SIZE_BYTES, ALLOWED_AVATAR_MIME_TYPES } from "@/lib/constants";

export function AvatarCard({ me }: { me: Doc<"users"> & { avatarUrl: string | null } }) {
  const updateName = useMutation(api.users.updateName);
  const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const updateAvatar = useMutation(api.users.updateAvatar);
  const removeAvatar = useMutation(api.users.removeAvatar);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingName, setSavingName] = useState(false);

  async function handleNameSave() {
    if (!newName.trim()) return;
    setSavingName(true);
    try {
      await updateName({ name: newName.trim() });
      toast.success("Nombre actualizado");
      setEditingName(false);
    } catch {
      toast.error("Error al actualizar el nombre");
    } finally {
      setSavingName(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;

    // Validación en cliente para dar un mensaje inmediato; la de verdad está en
    // convex/users.ts::updateAvatar, que además borra el archivo si no pasa.
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type as (typeof ALLOWED_AVATAR_MIME_TYPES)[number])) {
      toast.error("La foto debe ser JPEG, PNG o WebP");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error("La foto no puede pesar más de 2 MB");
      return;
    }

    setUploading(true);
    try {
      const urlResult = await generateUploadUrl();
      if (!urlResult.ok) {
        toast.error(urlResult.error);
        return;
      }
      const res = await fetch(urlResult.url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const result = await updateAvatar({ storageId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Foto actualizada");
    } catch (error) {
      toast.error(error instanceof Error && error.message !== "upload failed"
        ? error.message
        : "No se pudo subir la foto");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeAvatar();
      toast.success("Foto eliminada");
    } catch {
      toast.error("No se pudo quitar la foto");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="rounded-xl bg-card border border-border p-5">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Convex storage, no optimizable por next/image
            <img src={me.avatarUrl} alt="" aria-hidden
              className="h-14 w-14 rounded-2xl object-cover" />
          ) : (
            <span aria-hidden
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white"
              style={{ background: "linear-gradient(135deg, var(--os-magenta), oklch(0.32 0.14 20))" }}>
              {me.name?.trim().charAt(0).toUpperCase() ?? "U"}
            </span>
          )}
          <button type="button" onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Cambiar foto de perfil"
            className="touch-hit absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-50">
            <Camera className="h-3 w-3" aria-hidden="true" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="sr-only" onChange={handleFile} />
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex gap-2">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder={me?.name ?? ""} className="h-8 text-sm" autoFocus />
              <Button size="sm" onClick={handleNameSave} disabled={savingName}>
                {savingName ? "…" : "Guardar"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <button type="button"
              onClick={() => { setNewName(me?.name ?? ""); setEditingName(true); }}
              // truncate va en el span: en el botón recortaría el ::after de touch-hit
              className="touch-hit block max-w-full text-lg font-bold text-foreground hover:underline text-left">
              <span className="block truncate">{me?.name || "Sin nombre"}</span>
            </button>
          )}
          <p className="text-sm text-muted-foreground truncate">
            {me?.email}
          </p>
          {me.avatarUrl && (
            <button type="button" onClick={handleRemove} disabled={removing}
              className="touch-hit text-xs text-danger hover:underline disabled:opacity-50">
              {removing ? "Quitando…" : "Quitar foto"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
