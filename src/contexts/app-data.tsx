"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

interface AppDataContextType {
  accounts: Doc<"accounts">[] | undefined;
  cards: Doc<"cards">[] | undefined;
  categories: Doc<"categories">[] | undefined;
  goals: Doc<"goals">[] | undefined;
  // Listas ya filtradas (sin archivados); seguras de iterar aunque los datos aún carguen
  accountList: Doc<"accounts">[];
  cardList: Doc<"cards">[];
}

const AppDataContext = createContext<AppDataContextType | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();

  const accounts   = useQuery(api.accounts.list,   isAuthenticated ? undefined : "skip");
  const cards      = useQuery(api.cards.list,       isAuthenticated ? undefined : "skip");
  const categories = useQuery(api.categories.list,  isAuthenticated ? {}        : "skip");
  const goals      = useQuery(api.goals.list,       isAuthenticated ? undefined : "skip");

  const accountList = useMemo(
    () => (accounts ?? []).filter((a) => !a.archived),
    [accounts]
  );
  const cardList = useMemo(
    () => (cards ?? []).filter((c) => !c.archived),
    [cards]
  );

  const value = useMemo(
    () => ({ accounts, cards, categories, goals, accountList, cardList }),
    [accounts, cards, categories, goals, accountList, cardList]
  );

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData debe usarse dentro de AppDataProvider");
  return ctx;
}
