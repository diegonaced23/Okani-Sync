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
  // Sesión válida no implica fila en `users`: en el primer login la crea (o
  // vincula) ensureExists desde AuthGuard, y hasta entonces estas queries
  // fallarían con "Usuario no encontrado". getMe es reactiva y devuelve null
  // mientras tanto, así que se espera a ella.
  const me    = useQuery(api.users.getMe, isAuthenticated ? {} : "skip");
  const ready = !!me;

  const accounts   = useQuery(api.accounts.list,   ready ? undefined : "skip");
  const cards      = useQuery(api.cards.list,       ready ? undefined : "skip");
  const categories = useQuery(api.categories.list,  ready ? {}        : "skip");
  const goals      = useQuery(api.goals.list,       ready ? undefined : "skip");

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
