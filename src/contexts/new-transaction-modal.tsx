"use client";

import { createContext, useContext, useState } from "react";

export type TxTab = "ingreso" | "gasto" | "transferencia";

type NewTransactionModalContextType = {
  open: boolean;
  txTab: TxTab;
  openModal: (tab?: TxTab) => void;
  closeModal: () => void;
  setTxTab: (tab: TxTab) => void;
};

const NewTransactionModalContext = createContext<NewTransactionModalContextType | null>(null);

export function NewTransactionModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [txTab, setTxTab] = useState<TxTab>("gasto");

  function openModal(tab: TxTab = "gasto") {
    setTxTab(tab);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  return (
    <NewTransactionModalContext.Provider value={{ open, txTab, openModal, closeModal, setTxTab }}>
      {children}
    </NewTransactionModalContext.Provider>
  );
}

export function useNewTransactionModal() {
  const ctx = useContext(NewTransactionModalContext);
  if (!ctx) throw new Error("useNewTransactionModal must be used within NewTransactionModalProvider");
  return ctx;
}
