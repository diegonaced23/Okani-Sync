"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Camera, Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { MAX_AVATAR_SIZE_BYTES, ALLOWED_AVATAR_MIME_TYPES, MAX_USER_NAME_LENGTH } from "@/lib/constants";
import { EASE_OUT_EXPO, GLASS_SURFACE, haptic } from "@/lib/ios";
import { cn } from "@/lib/utils";

export function AvatarCard({ me }: { me: Doc<"users"> & { avatarUrl: string | null } }) {
  const reduce = useReducedMotion();
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

  function startEditing() {
    haptic();
    setNewName(me?.name ?? "");
    setEditingName(true);
  }

  async function handleNameSave() {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("El nombre no puede estar vacío");
      return;
    }
    if (trimmed === me.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await updateName({ name: trimmed });
      toast.success("Nombre actualizado");
      setEditingName(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el nombre");
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
    haptic();
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
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] p-5", GLASS_SURFACE)}
      aria-label="Tu foto y tu nombre"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-[var(--os-magenta)] opacity-[0.10] blur-3xl"
      />

      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Convex storage, no optimizable por next/image
            <img src={me.avatarUrl} alt="" aria-hidden
              className="h-16 w-16 rounded-[20px] object-cover" />
          ) : (
            // Mismo degradado que UserAvatar en la cabecera y la barra lateral
            <span aria-hidden
              className="flex h-16 w-16 items-center justify-center rounded-[20px] text-2xl font-bold text-white"
              style={{ background: "linear-gradient(135deg, var(--os-magenta), oklch(0.32 0.14 20))" }}>
              {me.name?.trim().charAt(0).toUpperCase() ?? "U"}
            </span>
          )}
          <button type="button" onClick={() => { haptic(); fileInputRef.current?.click(); }}
            disabled={uploading}
            aria-label="Cambiar foto de perfil"
            className="touch-hit absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[0_4px_12px_-4px_rgb(0_0_0/0.4)] transition-transform active:scale-90 disabled:opacity-50">
            {uploading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <Camera className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="sr-only" onChange={handleFile} />
        </div>

        <div className="min-w-0 flex-1">
          {editingName ? (
            // Los botones bajan a su propia línea: en una pantalla estrecha, el campo
            // y dos botones en fila junto al avatar no caben y se comprimían.
            <div className="space-y-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleNameSave(); }
                  if (e.key === "Escape") { e.preventDefault(); setEditingName(false); }
                }}
                maxLength={MAX_USER_NAME_LENGTH}
                aria-label="Tu nombre"
                placeholder={me?.name ?? ""}
                className="h-9 text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleNameSave}
                  disabled={savingName}
                  className="touch-hit flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[13px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  {savingName
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    : <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingName(false)}
                  className="touch-hit flex h-9 items-center justify-center gap-1.5 rounded-[14px] px-3 text-[13px] font-semibold text-muted-foreground transition-colors active:bg-muted"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              aria-label={`Cambiar tu nombre, ahora ${me?.name || "sin nombre"}`}
              // truncate va en el span: en el botón recortaría el ::after de touch-hit
              className="touch-hit flex max-w-full items-center gap-1.5 text-left"
            >
              <span className="block truncate text-lg font-extrabold text-foreground">
                {me?.name || "Sin nombre"}
              </span>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          )}

          <p className="truncate text-sm text-muted-foreground">{me?.email}</p>

          {me.avatarUrl && !editingName && (
            <button type="button" onClick={handleRemove} disabled={removing}
              className="touch-hit mt-1 inline-flex items-center gap-1 text-xs font-semibold text-danger disabled:opacity-50">
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              {removing ? "Quitando…" : "Quitar foto"}
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
