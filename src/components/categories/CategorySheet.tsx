"use client";

import { useId, useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Archive, Check, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { Input } from "@/components/ui/input";
import { CategoryIcon } from "@/components/ui/category-icon";
import { ACCOUNT_COLORS, CATEGORY_ICONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CategoryPreview, ColorPicker, IconPicker, TypeSegmented } from "./pickers";
import {
  OVERFLOW_ROW,
  SUGGESTIONS,
  TYPE_LABELS,
  haptic,
  isLightColor,
  tint,
  type Category,
  type CategoryType,
} from "./shared";

const LABEL = "block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground";

interface CategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  category: Category | null;
  /** Tipo inicial al crear: el de la pestaña visible */
  defaultType: CategoryType;
  /** Nombres ya usados (en minúsculas), para no sugerir duplicados */
  existingNames: Set<string>;
  onArchive: (cat: Category) => void;
}

export function CategorySheet({
  open,
  onOpenChange,
  category,
  defaultType,
  existingNames,
  onArchive,
}: CategorySheetProps) {
  // Cada apertura monta un formulario nuevo: el estado arranca limpio sin efectos
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? "Editar categoría" : "Nueva categoría"}
      footer
    >
      <CategoryForm
        key={`${category?._id ?? "new"}-${session}`}
        category={category}
        defaultType={defaultType}
        existingNames={existingNames}
        onDone={() => onOpenChange(false)}
        onArchive={(cat) => { onOpenChange(false); onArchive(cat); }}
      />
    </AppSheet>
  );
}

function CategoryForm({
  category,
  defaultType,
  existingNames,
  onDone,
  onArchive,
}: {
  category: Category | null;
  defaultType: CategoryType;
  existingNames: Set<string>;
  onDone: () => void;
  onArchive: (cat: Category) => void;
}) {
  const formId = useId();
  const reduce = useReducedMotion();
  const createCategory = useMutation(api.categories.create);
  const updateCategory = useMutation(api.categories.update);

  const isEdit = category !== null;
  const [name, setName] = useState(category?.name ?? "");
  const [type, setType] = useState<CategoryType>(category?.type ?? defaultType);
  const [color, setColor] = useState(category?.color ?? ACCOUNT_COLORS[3]);
  const [icon, setIcon] = useState<string>(category?.icon ?? CATEGORY_ICONS[0]);
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

  const trimmed = name.trim();
  const duplicate =
    trimmed.length > 0 &&
    existingNames.has(trimmed.toLowerCase()) &&
    trimmed.toLowerCase() !== category?.name.trim().toLowerCase();
  const unchanged =
    isEdit && trimmed === category.name && color === category.color && icon === category.icon;
  const canSubmit = trimmed.length > 0 && !duplicate && !unchanged && status === "idle";

  const suggestions = isEdit
    ? []
    : SUGGESTIONS.filter(
        (s) => (type === "ambos" || s.type === type) && !existingNames.has(s.name.toLowerCase())
      );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    try {
      if (isEdit) {
        await updateCategory({ categoryId: category._id, name: trimmed, color, icon });
      } else {
        await createCategory({ name: trimmed, type, color, icon });
      }
      haptic(12);
      setStatus("done");
      toast.success(isEdit ? "Categoría actualizada" : `«${trimmed}» creada`);
      // Deja ver el ✓ un instante antes de cerrar la hoja
      setTimeout(onDone, reduce ? 0 : 520);
    } catch (err) {
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <CategoryPreview name={name} icon={icon} color={color} type={type} />

      {/* Nombre */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-name`} className={LABEL}>Nombre</label>
        <Input
          id={`${formId}-name`}
          placeholder="Ej: Mascotas"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={duplicate || undefined}
          aria-describedby={duplicate ? `${formId}-dup` : undefined}
          className="h-11 rounded-[14px] text-base"
        />
        {duplicate && (
          <p id={`${formId}-dup`} role="alert" className="text-xs font-medium text-destructive">
            Ya tienes una categoría con ese nombre.
          </p>
        )}

        {/* Sugerencias: rellenan nombre, ícono y color de un toque */}
        {suggestions.length > 0 && (
          <div className={cn(OVERFLOW_ROW, "pt-1")}>
            {suggestions.map((s, i) => {
              const active = trimmed.toLowerCase() === s.name.toLowerCase();
              return (
                <motion.button
                  key={s.name}
                  type="button"
                  initial={reduce ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.3 }}
                  onClick={() => {
                    haptic();
                    setName(s.name);
                    setIcon(s.icon);
                    setColor(s.color);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
                    active ? "border-transparent text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
                  )}
                  style={active ? { background: tint(s.color, 20), borderColor: tint(s.color, 50) } : undefined}
                >
                  <CategoryIcon name={s.icon} className="h-3.5 w-3.5" style={{ color: s.color }} aria-hidden="true" />
                  {s.name}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tipo: se elige al crear; cambiarlo después desordenaría los movimientos ya registrados */}
      <div className="space-y-2">
        <span className={LABEL}>Tipo</span>
        {isEdit ? (
          <div className="flex items-center justify-between rounded-[14px] border border-border bg-[var(--surface-2)] px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">{TYPE_LABELS[category.type]}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden="true" /> No se puede cambiar
            </span>
          </div>
        ) : (
          <TypeSegmented value={type} onChange={setType} />
        )}
      </div>

      <div className="space-y-2">
        <span className={LABEL}>Color</span>
        <ColorPicker value={color} onChange={setColor} original={category?.color} />
      </div>

      <div className="space-y-2">
        <span className={LABEL}>Ícono</span>
        <IconPicker value={icon} onChange={setIcon} color={color} />
      </div>

      {isEdit && (
        <div className="border-t border-border pt-5">
          <button
            type="button"
            onClick={() => onArchive(category)}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 active:scale-[0.98]"
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
            Archivar categoría
          </button>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Deja de aparecer al registrar movimientos. Puedes restaurarla cuando quieras.
          </p>
        </div>
      )}

      <AppSheetFooter>
        <button
          type="submit"
          form={formId}
          disabled={!canSubmit}
          className={cn(
            "relative flex h-12 w-full items-center justify-center overflow-hidden rounded-[16px] text-[15px] font-bold transition-[opacity,transform,box-shadow] active:scale-[0.98] disabled:opacity-40",
            "shadow-[0_10px_24px_-10px_var(--btn-glow)]",
            isLightColor(color) ? "text-neutral-900" : "text-white",
          )}
          style={{
            background: `linear-gradient(135deg, ${color}, color-mix(in oklch, ${color} 70%, black))`,
            ["--btn-glow" as string]: tint(color, 80),
            // Guardando y guardado van deshabilitados, pero no atenuados
            ...(status !== "idle" ? { opacity: 1 } : null),
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={status}
              className="flex items-center gap-2 drop-shadow-sm"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              {status === "saving" && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Guardando…</>}
              {status === "done" && <><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> Listo</>}
              {status === "idle" && (isEdit ? "Guardar cambios" : "Crear categoría")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}
