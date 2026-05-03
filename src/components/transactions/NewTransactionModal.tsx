"use client";

import { AppSheet } from "@/components/ui/app-sheet";
import { TransactionForm } from "./TransactionForm";
import { TransferForm } from "./TransferForm";
import { useNewTransactionModal } from "@/contexts/new-transaction-modal";

export function NewTransactionModal() {
  const { open, txTab, setTxTab, closeModal } = useNewTransactionModal();

  return (
    <AppSheet
      open={open}
      onOpenChange={(o) => { if (!o) closeModal(); }}
      title="Nuevo movimiento"
      description="Registra un ingreso, gasto o transferencia."
    >
      {/* Pill tabs — 3 opciones */}
      <div
        role="tablist"
        aria-label="Tipo de movimiento"
        className="flex rounded-[14px] p-1 mb-5"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        {(["ingreso", "gasto", "transferencia"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`tx-tab-${tab}`}
            aria-selected={txTab === tab}
            aria-controls={`tx-panel-${tab}`}
            onClick={() => setTxTab(tab)}
            className="flex-1 py-2 text-[13px] transition-all"
            style={{
              borderRadius: 10,
              background: txTab === tab ? "var(--surface)" : "transparent",
              color: txTab === tab ? "var(--foreground)" : "var(--muted-foreground)",
              fontWeight: txTab === tab ? 700 : 600,
              boxShadow: txTab === tab ? "var(--shadow-sm)" : "none",
              transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            {tab === "ingreso" ? "Ingreso" : tab === "gasto" ? "Gasto" : "Transferir"}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`tx-panel-${txTab}`}
        aria-labelledby={`tx-tab-${txTab}`}
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
