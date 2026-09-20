"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AppSheet } from "@/components/ui/app-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useNewTransactionModal, type TxTab } from "@/contexts/new-transaction-modal";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, SPRING, haptic } from "./shared";

// Lazy-loaded: los formularios solo se descargan al abrir el modal por primera vez,
// lo que mantiene el bundle inicial de cada ruta pequeño.
const TransactionForm = dynamic(
  () => import("./TransactionForm").then((m) => m.TransactionForm),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full rounded-[22px]" /> }
);
const TransferForm = dynamic(
  () => import("./TransferForm").then((m) => m.TransferForm),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full rounded-[22px]" /> }
);

// Definición estática para no recrear el array en cada render
const TX_TABS: { key: TxTab; label: string }[] = [
  { key: "ingreso", label: "Ingreso" },
  { key: "gasto", label: "Gasto" },
  { key: "transferencia", label: "Transferir" },
];

/** Tono de cada pestaña: entra, sale, o se mueve entre cuentas. */
const TAB_TONE: Record<TxTab, string> = {
  ingreso: "var(--os-lime)",
  gasto: "var(--os-magenta)",
  transferencia: "var(--os-cyan)",
};

export function NewTransactionModal() {
  const reduce = useReducedMotion();
  const { open, txTab, initialSourceId, setTxTab, closeModal } = useNewTransactionModal();

  return (
    <AppSheet
      open={open}
      onOpenChange={(o) => { if (!o) closeModal(); }}
      title="Nuevo movimiento"
      description="Un ingreso, un gasto o una transferencia entre cuentas."
    >
      {/* Tipo de movimiento: la píldora se desliza y toma el color del tipo */}
      <div
        role="tablist"
        aria-label="Tipo de movimiento"
        className="mb-5 flex rounded-[18px] border border-border bg-[var(--surface-2)] p-1"
      >
        {TX_TABS.map((t) => {
          const active = txTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={active}
              aria-controls={`panel-${t.key}`}
              onClick={() => { haptic(); setTxTab(t.key); }}
              className={cn(
                "touch-hit relative flex-1 rounded-[14px] py-2 text-[13px] transition-colors",
                active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="tx-type-pill"
                  className="absolute inset-0 rounded-[14px]"
                  style={{
                    background: `color-mix(in oklch, ${TAB_TONE[t.key]} 14%, var(--surface))`,
                    boxShadow: `inset 0 0 0 1.5px color-mix(in oklch, ${TAB_TONE[t.key]} 45%, transparent)`,
                  }}
                  transition={SPRING}
                />
              )}
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Los paneles entran deslizándose en la dirección del cambio de pestaña */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={txTab}
          role="tabpanel"
          id={`panel-${txTab}`}
          aria-labelledby={`tab-${txTab}`}
          // Fundido con un desplazamiento mínimo, sin dirección: entre tres pestañas
          // que van y vienen, un sentido fijo se siente mal en la mitad de los cambios.
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
        >
          {txTab === "transferencia" ? (
            <TransferForm onSuccess={closeModal} />
          ) : (
            <TransactionForm
              // El remount limpia el estado del formulario al cambiar de tipo o de fuente
              key={txTab + (initialSourceId ?? "")}
              defaultType={txTab}
              initialSourceId={initialSourceId ?? undefined}
              onSuccess={closeModal}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </AppSheet>
  );
}
