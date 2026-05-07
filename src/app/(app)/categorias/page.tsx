"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { Plus, Archive, Pencil, GripVertical, Trash2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppSheet } from "@/components/ui/app-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ACCOUNT_COLORS, CATEGORY_ICONS } from "@/lib/constants";
import { CategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
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

type CategoryType = "ingreso" | "gasto" | "ambos";

function isTypeCompatible(sourceType: CategoryType, targetType: CategoryType): boolean {
  if (sourceType === "ambos") return true;
  return targetType === sourceType || targetType === "ambos";
}

// ─── Pickers ──────────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div role="group" aria-label="Seleccionar color" className="flex flex-wrap gap-2">
      {ACCOUNT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          aria-pressed={value === c}
          className={cn(
            "h-7 w-7 rounded-full border-2 transition-transform",
            value === c ? "border-foreground scale-110" : "border-transparent"
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function IconPicker({
  value,
  onChange,
  color,
}: {
  value: string;
  onChange: (name: string) => void;
  color: string;
}) {
  return (
    <div role="group" aria-label="Seleccionar ícono" className="grid grid-cols-7 gap-1.5">
      {CATEGORY_ICONS.map((name) => {
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            aria-label={name}
            aria-pressed={selected}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-colors",
              selected ? "border-foreground bg-muted" : "border-transparent hover:bg-muted"
            )}
          >
            <CategoryIcon
              name={name}
              className="h-4 w-4"
              style={{ color: selected ? color : undefined }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Fila ordenable (activas) ─────────────────────────────────────────────────

function SortableCategoryRow({
  cat,
  onEdit,
  onArchive,
  onDragEnd,
}: {
  cat: Doc<"categories">;
  onEdit: () => void;
  onArchive: () => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      as="li"
      value={cat}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="flex items-center gap-3 py-2.5 px-4 bg-card border-b border-border last:border-b-0"
      style={{ listStyle: "none", position: "relative" }}
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 8px 28px -6px rgba(0,0,0,0.18)",
        borderRadius: 12,
        zIndex: 50,
      }}
    >
      <button
        type="button"
        aria-label="Arrastrar para reordenar"
        className="touch-none shrink-0 p-1 -ml-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => controls.start(e)}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: cat.color + "33", color: cat.color }}
      >
        <CategoryIcon name={cat.icon} className="h-4 w-4" />
      </span>

      <span className="flex-1 text-sm font-medium text-foreground truncate">{cat.name}</span>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Editar categoría"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onArchive}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-danger"
          aria-label="Archivar categoría"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      </div>
    </Reorder.Item>
  );
}

// ─── Fila archivada ───────────────────────────────────────────────────────────

function ArchivedCategoryRow({
  cat,
  onDelete,
}: {
  cat: Doc<"categories">;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5 px-4 bg-card border-b border-border last:border-b-0">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-60"
        style={{ backgroundColor: cat.color + "33", color: cat.color }}
      >
        <CategoryIcon name={cat.icon} className="h-4 w-4" />
      </span>

      <span className="flex-1 text-sm font-medium text-muted-foreground truncate">{cat.name}</span>

      <span className="text-[10px] text-muted-foreground/60 shrink-0 capitalize">
        {cat.type === "ambos" ? "ambos" : cat.type}
      </span>

      <button
        type="button"
        onClick={onDelete}
        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-danger shrink-0"
        aria-label="Eliminar categoría"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// ─── Flujo de eliminación ─────────────────────────────────────────────────────

function DeleteCategoryFlow({
  deletingCat,
  txCount,
  activeCategories,
  onClose,
  onRemove,
  onMigrate,
}: {
  deletingCat: Doc<"categories"> | null;
  txCount: number | undefined;
  activeCategories: Doc<"categories">[];
  onClose: () => void;
  onRemove: () => Promise<void>;
  onMigrate: (targetId: Id<"categories">) => Promise<void>;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [migrationTarget, setMigrationTarget] = useState<string>("");
  const [migrationStep, setMigrationStep] = useState<"select" | "confirm">("select");
  const [loading, setLoading] = useState(false);

  // Resetear estado al cambiar categoría
  useEffect(() => {
    setConfirmName("");
    setMigrationTarget("");
    setMigrationStep("select");
    setLoading(false);
  }, [deletingCat?._id]);

  const isOpen = deletingCat !== null;
  const catName = deletingCat?.name ?? "";
  const catType = deletingCat?.type as CategoryType | undefined;
  const countLabel = txCount === 501 ? "más de 500" : String(txCount ?? 0);

  const compatibleTargets = catType
    ? activeCategories.filter(
        (c) => c._id !== deletingCat?._id && isTypeCompatible(catType, c.type as CategoryType)
      )
    : [];

  const targetCat = compatibleTargets.find((c) => c._id === migrationTarget);

  async function handleRemove() {
    setLoading(true);
    try {
      await onRemove();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleMigrate() {
    if (!migrationTarget) return;
    setLoading(true);
    try {
      await onMigrate(migrationTarget as Id<"categories">);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppSheet
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={
        txCount === undefined
          ? "Eliminar categoría"
          : txCount === 0
          ? "Eliminar categoría"
          : "Categoría con movimientos"
      }
    >
      {/* Loading */}
      {txCount === undefined && (
        <div className="space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {/* Sin transacciones → confirmar con nombre */}
      {txCount === 0 && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">
              Esta acción es <strong>irreversible</strong>. Una vez eliminada, la categoría no se puede recuperar.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-name">
              Escribí <strong>{catName}</strong> para confirmar
            </Label>
            <Input
              id="confirm-name"
              placeholder={catName}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <Button
            variant="destructive"
            className="w-full"
            disabled={loading || confirmName !== catName}
            onClick={handleRemove}
          >
            {loading ? "Eliminando…" : "Eliminar categoría"}
          </Button>
        </div>
      )}

      {/* Con transacciones → migrar */}
      {txCount !== undefined && txCount > 0 && (
        <div className="space-y-5">
          {migrationStep === "select" && (
            <>
              <div className="rounded-lg bg-muted px-4 py-3 space-y-1">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{catName}</strong> tiene{" "}
                  <strong className="text-foreground">{countLabel} movimientos</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  Antes de eliminarla, migrá los movimientos a otra categoría.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Categoría destino</Label>
                <Select value={migrationTarget} onValueChange={(v) => { if (v) setMigrationTarget(v); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {compatibleTargets.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-flex h-4 w-4 items-center justify-center rounded-full"
                            style={{ backgroundColor: c.color + "33", color: c.color }}
                          >
                            <CategoryIcon name={c.icon} className="h-2.5 w-2.5" />
                          </span>
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                disabled={!migrationTarget}
                onClick={() => setMigrationStep("confirm")}
              >
                Migrar
              </Button>
            </>
          )}

          {migrationStep === "confirm" && targetCat && (
            <>
              <div className="flex items-start gap-3 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">
                  Se migrarán <strong>{countLabel} movimientos</strong> a{" "}
                  <strong>{targetCat.name}</strong> y la categoría{" "}
                  <strong>{catName}</strong> se eliminará automáticamente.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={loading}
                  onClick={handleMigrate}
                >
                  {loading ? "Migrando…" : "Confirmar y eliminar"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={loading}
                  onClick={() => setMigrationStep("select")}
                >
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </AppSheet>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function CategoriasPage() {
  const categories = useQuery(api.categories.list, {});
  const createCategory = useMutation(api.categories.create);
  const updateCategory = useMutation(api.categories.update);
  const archiveCategory = useMutation(api.categories.archive);
  const reorderCategories = useMutation(api.categories.reorder);
  const removeCategory = useMutation(api.categories.remove);
  const migrateAndDeleteMutation = useMutation(api.categories.migrateAndDelete);

  // ── Estado formulario creación ────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CategoryType>("gasto");
  const [newColor, setNewColor] = useState(ACCOUNT_COLORS[3]);
  const [newIcon, setNewIcon] = useState<string>(CATEGORY_ICONS[0]);
  const [createLoading, setCreateLoading] = useState(false);

  // ── Estado formulario edición ─────────────────────────────────────────────
  const [editingCat, setEditingCat] = useState<Doc<"categories"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(ACCOUNT_COLORS[0]);
  const [editIcon, setEditIcon] = useState<string>(CATEGORY_ICONS[0]);
  const [editLoading, setEditLoading] = useState(false);

  // ── Estado confirmación archivo ───────────────────────────────────────────
  const [archivingCat, setArchivingCat] = useState<Doc<"categories"> | null>(null);

  // ── Estado archivadas ─────────────────────────────────────────────────────
  const [showArchived, setShowArchived] = useState(false);
  const [deletingCat, setDeletingCat] = useState<Doc<"categories"> | null>(null);

  const archivedCategories = useQuery(
    api.categories.listArchived,
    showArchived ? {} : "skip"
  );
  const txCount = useQuery(
    api.categories.transactionCount,
    deletingCat ? { categoryId: deletingCat._id } : "skip"
  );

  // ── Estado local para reordenamiento optimista ────────────────────────────
  const [gastosItems, setGastosItems] = useState<Doc<"categories">[]>([]);
  const [ingresosItems, setIngresosItems] = useState<Doc<"categories">[]>([]);

  const gastosRef = useRef<Doc<"categories">[]>([]);
  const ingresosRef = useRef<Doc<"categories">[]>([]);

  const [prevCategories, setPrevCategories] = useState(categories);
  if (categories !== prevCategories) {
    setPrevCategories(categories);
    if (categories !== undefined) {
      const sorted = [...categories].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      setGastosItems(sorted.filter((c) => c.type === "gasto" || c.type === "ambos"));
      setIngresosItems(sorted.filter((c) => c.type === "ingreso" || c.type === "ambos"));
    }
  }

  useEffect(() => { gastosRef.current = gastosItems; }, [gastosItems]);
  useEffect(() => { ingresosRef.current = ingresosItems; }, [ingresosItems]);

  function openEdit(cat: Doc<"categories">) {
    setEditingCat(cat);
    setEditName(cat.name);
    setEditColor(cat.color);
    setEditIcon(cat.icon);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreateLoading(true);
    try {
      await createCategory({ name: newName.trim(), type: newType, color: newColor, icon: newIcon });
      toast.success("Categoría creada");
      setNewName("");
      setNewIcon(CATEGORY_ICONS[0]);
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCat || !editName.trim()) return;
    setEditLoading(true);
    try {
      await updateCategory({
        categoryId: editingCat._id as Id<"categories">,
        name: editName.trim(),
        color: editColor,
        icon: editIcon,
      });
      toast.success("Categoría actualizada");
      setEditingCat(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setEditLoading(false);
    }
  }

  async function executeArchive() {
    if (!archivingCat) return;
    try {
      await archiveCategory({ categoryId: archivingCat._id });
      toast.success("Categoría archivada");
      setArchivingCat(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  function handleSectionDragEnd(sectionRef: React.MutableRefObject<Doc<"categories">[]>) {
    reorderCategories({
      categoryIds: sectionRef.current.map((c) => c._id),
    }).catch(() => toast.error("Error al guardar el orden"));
  }

  async function handleRemove() {
    if (!deletingCat) return;
    await removeCategory({ categoryId: deletingCat._id });
    toast.success("Categoría eliminada");
  }

  async function handleMigrateAndDelete(targetId: Id<"categories">) {
    if (!deletingCat) return;
    const result = await migrateAndDeleteMutation({
      categoryId: deletingCat._id,
      targetCategoryId: targetId,
    });
    if (result?.willContinue) {
      toast.success("Migrando movimientos…");
    } else {
      toast.success("Movimientos migrados y categoría eliminada");
    }
  }

  const isLoading = categories === undefined;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Categorías</h1>
        <AppSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="Nueva categoría"
          trigger={
            <Button
              size="sm"
              className="gap-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-md"
            >
              <Plus className="h-4 w-4" /> Nueva
            </Button>
          }
        >
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Nombre</Label>
              <Input
                id="cat-name"
                placeholder="Ej: Mascotas"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={newType} onValueChange={(v) => { if (v) setNewType(v as CategoryType); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gasto">Gasto</SelectItem>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
            <div className="space-y-1.5">
              <Label>Ícono</Label>
              <IconPicker value={newIcon} onChange={setNewIcon} color={newColor} />
            </div>
            <Button type="submit" className="w-full" disabled={createLoading}>
              {createLoading ? "Guardando…" : "Crear categoría"}
            </Button>
          </form>
        </AppSheet>
      </div>

      {/* Sheet de edición */}
      <AppSheet
        open={!!editingCat}
        onOpenChange={(open) => { if (!open) setEditingCat(null); }}
        title="Editar categoría"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-cat-name">Nombre</Label>
            <Input
              id="edit-cat-name"
              placeholder="Nombre de la categoría"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </div>
          {editingCat && (
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <p className="text-sm px-3 py-2 rounded-md bg-muted text-foreground capitalize">
                {editingCat.type === "ambos" ? "Ingresos y gastos" : editingCat.type === "ingreso" ? "Ingreso" : "Gasto"}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker value={editColor} onChange={setEditColor} />
          </div>
          <div className="space-y-1.5">
            <Label>Ícono</Label>
            <IconPicker value={editIcon} onChange={setEditIcon} color={editColor} />
          </div>
          <Button type="submit" className="w-full" disabled={editLoading}>
            {editLoading ? "Guardando…" : "Guardar cambios"}
          </Button>
        </form>
      </AppSheet>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Gastos */}
          <section className="rounded-xl bg-card border border-border">
            <div className="px-4 py-2.5 bg-muted/50 border-b border-border rounded-t-xl">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Gastos ({gastosItems.length})
              </h2>
            </div>
            <Reorder.Group
              as="ul"
              axis="y"
              values={gastosItems}
              onReorder={(items) => {
                setGastosItems(items);
                gastosRef.current = items;
              }}
              className="rounded-b-xl overflow-hidden"
              style={{ listStyle: "none", padding: 0, margin: 0 }}
            >
              {gastosItems.map((cat) => (
                <SortableCategoryRow
                  key={cat._id}
                  cat={cat}
                  onEdit={() => openEdit(cat)}
                  onArchive={() => setArchivingCat(cat)}
                  onDragEnd={() => handleSectionDragEnd(gastosRef)}
                />
              ))}
            </Reorder.Group>
          </section>

          <Separator />

          {/* Ingresos */}
          <section className="rounded-xl bg-card border border-border">
            <div className="px-4 py-2.5 bg-muted/50 border-b border-border rounded-t-xl">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ingresos ({ingresosItems.length})
              </h2>
            </div>
            <Reorder.Group
              as="ul"
              axis="y"
              values={ingresosItems}
              onReorder={(items) => {
                setIngresosItems(items);
                ingresosRef.current = items;
              }}
              className="rounded-b-xl overflow-hidden"
              style={{ listStyle: "none", padding: 0, margin: 0 }}
            >
              {ingresosItems.map((cat) => (
                <SortableCategoryRow
                  key={cat._id}
                  cat={cat}
                  onEdit={() => openEdit(cat)}
                  onArchive={() => setArchivingCat(cat)}
                  onDragEnd={() => handleSectionDragEnd(ingresosRef)}
                />
              ))}
            </Reorder.Group>
          </section>

          {/* Toggle archivadas */}
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex w-full items-center gap-2 px-1 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showArchived ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="font-medium">
              Archivadas
              {archivedCategories !== undefined && ` (${archivedCategories.length})`}
            </span>
          </button>

          {/* Sección archivadas */}
          {showArchived && (
            <section className="rounded-xl bg-card border border-border">
              {archivedCategories === undefined ? (
                <div className="p-4 space-y-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                </div>
              ) : archivedCategories.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No hay categorías archivadas
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {archivedCategories.map((cat) => (
                    <ArchivedCategoryRow
                      key={cat._id}
                      cat={cat}
                      onDelete={() => setDeletingCat(cat)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {/* Diálogo de confirmación de archivo */}
      <AlertDialog open={archivingCat !== null} onOpenChange={(open) => { if (!open) setArchivingCat(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archivar categoría</AlertDialogTitle>
            <AlertDialogDescription>
              {archivingCat?.isDefault
                ? "Esta categoría dejará de aparecer en los selectores."
                : `¿Archivar "${archivingCat?.name}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={executeArchive}>
              Archivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Flujo de eliminación */}
      <DeleteCategoryFlow
        deletingCat={deletingCat}
        txCount={txCount}
        activeCategories={categories ?? []}
        onClose={() => setDeletingCat(null)}
        onRemove={handleRemove}
        onMigrate={handleMigrateAndDelete}
      />
    </div>
  );
}
