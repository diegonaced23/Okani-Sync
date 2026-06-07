"use client";

import type { Doc } from "../../../convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { CategoryIcon } from "@/lib/category-icons";

interface CategorySelectProps {
  id?: string;
  value: string;
  onValueChange: (v: string) => void;
  categories: Doc<"categories">[];
}

// Select de categoría con icono y color — comparte UI entre TransactionForm y TransactionDetailSheet
export function CategorySelect({ id, value, onValueChange, categories }: CategorySelectProps) {
  const selectedCat = categories.find((c) => c._id === value);

  return (
    <Select value={value} onValueChange={(v) => onValueChange(v ?? "")}>
      <SelectTrigger id={id} className="w-full" style={{ background: "var(--surface-2)" }}>
        {selectedCat ? (
          <span className="flex items-center gap-2 min-w-0">
            <CategoryIcon
              name={selectedCat.icon}
              aria-hidden
              className="h-4 w-4 shrink-0"
              style={{ color: selectedCat.color }}
              strokeWidth={1.8}
            />
            <span className="truncate">{selectedCat.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Sin categoría</span>
        )}
      </SelectTrigger>
      <SelectContent side="bottom" className="max-h-[40vh]">
        <SelectItem value="">Sin categoría</SelectItem>
        {categories.map((cat) => (
          <SelectItem key={cat._id} value={cat._id}>
            <CategoryIcon
              name={cat.icon}
              aria-hidden
              className="h-[16px] w-[16px] shrink-0"
              style={{ color: cat.color }}
              strokeWidth={1.8}
            />
            {cat.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
