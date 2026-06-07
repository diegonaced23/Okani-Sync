"use client";

import dynamic from "next/dynamic";
import { AppSheet } from "@/components/ui/app-sheet";
import { PillTabs } from "@/components/ui/pill-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useNewTransactionModal } from "@/contexts/new-transaction-modal";

// Lazy-loaded: TransactionForm (433 líneas) y TransferForm (267 líneas) solo se descargan
// cuando el usuario abre el modal por primera vez, reduciendo el bundle inicial de la ruta.
const TransactionForm = dynamic(
  () => import("./TransactionForm").then((m) => m.TransactionForm),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full rounded-xl" /> }
);
const TransferForm = dynamic(
  () => import("./TransferForm").then((m) => m.TransferForm),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full rounded-xl" /> }
);

// Definición estática para evitar re-crear el array en cada render
const TX_TABS = [
  { key: "ingreso" as const, label: "Ingreso" },
  { key: "gasto" as const, label: "Gasto" },
  { key: "transferencia" as const, label: "Transferir" },
];

export function NewTransactionModal() {
  const { open, txTab, initialSourceId, setTxTab, closeModal } = useNewTransactionModal();

  return (
    <AppSheet
      open={open}
      onOpenChange={(o) => { if (!o) closeModal(); }}
      title="Nuevo movimiento"
      description="Registra un ingreso, gasto o transferencia."
    >
      {/* Selector de tipo de movimiento — mb-5 para separar del formulario */}
      <PillTabs
        tabs={TX_TABS}
        active={txTab}
        onChange={setTxTab}
        ariaLabel="Tipo de movimiento"
        className="mb-5"
      />

      <div
        role="tabpanel"
        id={`panel-${txTab}`}
        aria-labelledby={`tab-${txTab}`}
      >
        {txTab === "transferencia" ? (
          <TransferForm onSuccess={closeModal} />
        ) : (
          <TransactionForm
            key={txTab + (initialSourceId ?? "")}
            defaultType={txTab}
            initialSourceId={initialSourceId ?? undefined}
            onSuccess={closeModal}
          />
        )}
      </div>
    </AppSheet>
  );
}
