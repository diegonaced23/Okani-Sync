"use client";

import { createContext, useContext, useState } from "react";

export type TxTab = "ingreso" | "gasto" | "transferencia";

type NewTransactionModalContextType = {
  open: boolean;
  txTab: TxTab;
  // Fuente pre-seleccionada en formato "card:ID" | "account:ID" | null
  initialSourceId: string | null;
  openModal: (tab?: TxTab) => void;
  // Atajo para abrir directamente con una tarjeta pre-seleccionada en pestaña "gasto"
  openWithCard: (cardId: string) => void;
  closeModal: () => void;
  setTxTab: (tab: TxTab) => void;
};

const NewTransactionModalContext = createContext<NewTransactionModalContextType | null>(null);

export function NewTransactionModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [txTab, setTxTab] = useState<TxTab>("gasto");
  const [initialSourceId, setInitialSourceId] = useState<string | null>(null);

  function openModal(tab: TxTab = "gasto") {
    setInitialSourceId(null);
    setTxTab(tab);
    setOpen(true);
  }

  function openWithCard(cardId: string) {
    setInitialSourceId(`card:${cardId}`);
    setTxTab("gasto");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    // Limpiar la fuente al cerrar para no contaminar la próxima apertura genérica
    setInitialSourceId(null);
  }

  return (
    <NewTransactionModalContext.Provider
      value={{ open, txTab, initialSourceId, openModal, openWithCard, closeModal, setTxTab }}
    >
      {children}
    </NewTransactionModalContext.Provider>
  );
}

export function useNewTransactionModal() {
  const ctx = useContext(NewTransactionModalContext);
  if (!ctx) throw new Error("useNewTransactionModal must be used within NewTransactionModalProvider");
  return ctx;
}
