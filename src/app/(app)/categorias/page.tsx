"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { Plus, Archive, Pencil } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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
              selected
                ? "border-foreground bg-muted"
                : "border-transparent hover:bg-muted"
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

function CategoryRow({
  cat,
  onEdit,
  onArchive,
}: {
  cat: Doc<"categories">;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: cat.color + "33", color: cat.color }}
      >
        <CategoryIcon name={cat.icon} className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-medium text-foreground truncate">{cat.name}</span>
      {cat.isDefault && (
        <Badge variant="secondary" className="text-[10px] shrink-0">Sistema</Badge>
      )}
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
    </div>
  );
}

export default function CategoriasPage() {
  const categories = useQuery(api.categories.list, {});
  const createCategory = useMutation(api.categories.create);
  const updateCategory = useMutation(api.categories.update);
  const archiveCategory = useMutation(api.categories.archive);

  // Estado formulario creación
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CategoryType>("gasto");
  const [newColor, setNewColor] = useState(ACCOUNT_COLORS[3]);
  const [newIcon, setNewIcon] = useState<string>(CATEGORY_ICONS[0]);
  const [createLoading, setCreateLoading] = useState(false);

  // Estado confirmación archivo
  const [archivingCat, setArchivingCat] = useState<Doc<"categories"> | null>(null);

  // Estado formulario edición
  const [editingCat, setEditingCat] = useState<Doc<"categories"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(ACCOUNT_COLORS[0]);
  const [editIcon, setEditIcon] = useState<string>(CATEGORY_ICONS[0]);
  const [editLoading, setEditLoading] = useState(false);

  const gastos = (categories ?? []).filter((c) => c.type === "gasto" || c.type === "ambos");
  const ingresos = (categories ?? []).filter((c) => c.type === "ingreso" || c.type === "ambos");

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

  function handleArchive(cat: Doc<"categories">) {
    setArchivingCat(cat);
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
          <section className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Gastos ({gastos.length})
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {gastos.map((cat) => (
                <li key={cat._id}>
                  <CategoryRow
                    cat={cat}
                    onEdit={() => openEdit(cat)}
                    onArchive={() => handleArchive(cat)}
                  />
                </li>
              ))}
            </ul>
          </section>

          <Separator />

          {/* Ingresos */}
          <section className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ingresos ({ingresos.length})
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {ingresos.map((cat) => (
                <li key={cat._id}>
                  <CategoryRow
                    cat={cat}
                    onEdit={() => openEdit(cat)}
                    onArchive={() => handleArchive(cat)}
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <AlertDialog open={archivingCat !== null} onOpenChange={(open) => { if (!open) setArchivingCat(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archivar categoría</AlertDialogTitle>
            <AlertDialogDescription>
              {archivingCat?.isDefault
                ? "Esta categoría del sistema dejará de aparecer en tus selects."
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
    </div>
  );
}
