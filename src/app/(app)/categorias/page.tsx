"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { Plus, Archive } from "lucide-react";
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
import { ACCOUNT_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Doc } from "../../../../convex/_generated/dataModel";

type CategoryType = "ingreso" | "gasto" | "ambos";

function CategoryRow({ cat, onArchive }: { cat: Doc<"categories">; onArchive: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ backgroundColor: cat.color + "33", color: cat.color }}
      >
        {cat.name.charAt(0).toUpperCase()}
      </span>
      <span className="flex-1 text-sm font-medium text-foreground">{cat.name}</span>
      {cat.isDefault && (
        <Badge variant="secondary" className="text-[10px]">Sistema</Badge>
      )}
      {!cat.isDefault && (
        <button
          type="button"
          onClick={onArchive}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-danger"
          aria-label="Archivar categoría"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function CategoriasPage() {
  const categories = useQuery(api.categories.list, {});
  const createCategory = useMutation(api.categories.create);
  const archiveCategory = useMutation(api.categories.archive);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("gasto");
  const [color, setColor] = useState(ACCOUNT_COLORS[3]);
  const [loading, setLoading] = useState(false);

  const gastos = (categories ?? []).filter((c) => c.type === "gasto" || c.type === "ambos");
  const ingresos = (categories ?? []).filter((c) => c.type === "ingreso" || c.type === "ambos");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createCategory({ name: name.trim(), type, color, icon: "circle" });
      toast.success("Categoría creada");
      setName(""); setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive(id: Doc<"categories">["_id"]) {
    try {
      await archiveCategory({ categoryId: id });
      toast.success("Categoría archivada");
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
          open={open}
          onOpenChange={setOpen}
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
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => { if (v) setType(v as CategoryType); }}>
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
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-transform",
                      color === c ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Guardando…" : "Crear categoría"}
            </Button>
          </form>
        </AppSheet>
      </div>

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
                  <CategoryRow cat={cat} onArchive={() => handleArchive(cat._id)} />
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
                  <CategoryRow cat={cat} onArchive={() => handleArchive(cat._id)} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
