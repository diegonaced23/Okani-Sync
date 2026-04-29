"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CardSummary } from "@/components/cards/CardSummary";
import { CardForm } from "@/components/cards/CardForm";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";

export default function TarjetasPage() {
  const cards = useQuery(api.cards.list);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const totalDebt = (cards ?? []).reduce((s, c) => s + c.currentBalance, 0);
  const isLoading = cards === undefined;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tarjetas</h1>
          {!isLoading && (cards ?? []).length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Deuda total: {formatCents(totalDebt, "COP")}
            </p>
          )}
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button size="sm" className="gap-1.5" />}>
            <Plus className="h-4 w-4" /> Nueva
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-xl">
            <SheetHeader className="pb-4">
              <SheetTitle>Nueva tarjeta de crédito</SheetTitle>
            </SheetHeader>
            <CardForm onSuccess={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : (cards ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-muted-foreground text-sm">No tienes tarjetas registradas.</p>
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Agregar tarjeta
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {cards!.map((card) => (
            <CardSummary
              key={card._id}
              card={card}
              onClick={() => router.push(`/tarjetas/${card._id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
