"use client";

import { AppSheet } from "@/components/ui/app-sheet";
import { PillTabs } from "@/components/ui/pill-tabs";
import { TransactionForm } from "./TransactionForm";
import { TransferForm } from "./TransferForm";
import { useNewTransactionModal } from "@/contexts/new-transaction-modal";

// Definición estática para evitar re-crear el array en cada render
const TX_TABS = [
  { key: "ingreso" as const, label: "Ingreso" },
  { key: "gasto" as const, label: "Gasto" },
  { key: "transferencia" as const, label: "Transferir" },
];

export function NewTransactionModal() {
  const { open, txTab, setTxTab, closeModal } = useNewTransactionModal();

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
            key={txTab}
            defaultType={txTab}
            onSuccess={closeModal}
          />
        )}
      </div>
    </AppSheet>
  );
}
