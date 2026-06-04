"use client";

import { Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PillTabs } from "@/components/ui/pill-tabs";
import { AccountCard } from "@/components/accounts/AccountCard";
import { AccountForm } from "@/components/accounts/AccountForm";
import { CardSummary } from "@/components/cards/CardSummary";
import { CardForm } from "@/components/cards/CardForm";
import { formatCents } from "@/lib/money";

type TabKey = "cuentas" | "tarjetas";

const TABS = [
  { key: "cuentas" as TabKey, label: "Cuentas" },
  { key: "tarjetas" as TabKey, label: "Tarjetas de crédito" },
];

function ProductosContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = (searchParams.get("tab") as TabKey) ?? "cuentas";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  const [openAccount, setOpenAccount] = useState(false);
  const [openCard, setOpenCard] = useState(false);

  const accounts = useQuery(api.accounts.list);
  const sharedAccounts = useQuery(api.accounts.listSharedWithMe);
  const cards = useQuery(api.cards.list);

  const totalCOP = (accounts ?? [])
    .filter((a) => a.currency === "COP")
    .reduce((sum, a) => sum + a.balance, 0);

  const totalDebt = (cards ?? []).reduce((s, c) => s + c.currentBalance, 0);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mis productos</h1>
          {activeTab === "cuentas" && accounts !== undefined && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Total COP: {formatCents(totalCOP, "COP")}
            </p>
          )}
          {activeTab === "tarjetas" && cards !== undefined && cards.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Deuda total: {formatCents(totalDebt, "COP")}
            </p>
          )}
        </div>

        {/* Botón desktop — cambia según el tab activo */}
        {activeTab === "cuentas" ? (
          <AppSheet
            open={openAccount}
            onOpenChange={setOpenAccount}
            title="Nueva cuenta"
            trigger={
              <Button
                size="sm"
                className="hidden md:flex gap-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-md"
              >
                <Plus className="h-4 w-4" /> Nueva cuenta
              </Button>
            }
          >
            <AccountForm onSuccess={() => setOpenAccount(false)} />
          </AppSheet>
        ) : (
          <AppSheet
            open={openCard}
            onOpenChange={setOpenCard}
            title="Nueva tarjeta de crédito"
            trigger={
              <Button
                size="sm"
                className="hidden md:flex gap-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-md"
              >
                <Plus className="h-4 w-4" /> Nueva tarjeta
              </Button>
            }
          >
            <CardForm onSuccess={() => setOpenCard(false)} />
          </AppSheet>
        )}
      </div>

      {/* Selector de tabs */}
      <PillTabs
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="Seleccionar tipo de producto"
      />

      {/* Panel: Cuentas */}
      {activeTab === "cuentas" && (
        <div
          className="space-y-6"
          role="tabpanel"
          id="panel-cuentas"
          aria-labelledby="tab-cuentas"
        >
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Mis cuentas
            </h2>
            {accounts === undefined ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No tienes cuentas registradas aún.
              </p>
            ) : (
              <div className="space-y-2">
                {accounts.map((account) => (
                  <AccountCard
                    key={account._id}
                    account={account}
                    onClick={() => router.push(`/cuentas/${account._id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {(sharedAccounts ?? []).length > 0 && (
            <>
              <Separator />
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Compartidas conmigo
                </h2>
                <div className="space-y-2">
                  {sharedAccounts!.map((account) =>
                    account ? (
                      <AccountCard
                        key={account._id}
                        account={account}
                        isShared
                        onClick={() => router.push(`/cuentas/${account._id}`)}
                      />
                    ) : null
                  )}
                </div>
              </section>
            </>
          )}

          {/* Botón mobile */}
          <div className="md:hidden">
            <AppSheet
              open={openAccount}
              onOpenChange={setOpenAccount}
              title="Nueva cuenta"
              trigger={
                <Button className="w-full gap-2 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-lg rounded-xl h-12 text-base font-semibold">
                  <Plus className="h-5 w-5" /> Agregar cuenta
                </Button>
              }
            >
              <AccountForm onSuccess={() => setOpenAccount(false)} />
            </AppSheet>
          </div>
        </div>
      )}

      {/* Panel: Tarjetas */}
      {activeTab === "tarjetas" && (
        <div
          className="space-y-6"
          role="tabpanel"
          id="panel-tarjetas"
          aria-labelledby="tab-tarjetas"
        >
          {cards === undefined ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-muted-foreground text-sm">
                No tienes tarjetas registradas.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cards.map((card) => (
                <CardSummary
                  key={card._id}
                  card={card}
                  onClick={() => router.push(`/tarjetas/${card._id}`)}
                />
              ))}
            </div>
          )}

          {/* Botón mobile */}
          {cards !== undefined && (
            <div className="md:hidden">
              <AppSheet
                open={openCard}
                onOpenChange={setOpenCard}
                title="Nueva tarjeta de crédito"
                trigger={
                  <Button className="w-full gap-2 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-lg rounded-xl h-12 text-base font-semibold">
                    <Plus className="h-5 w-5" /> Agregar tarjeta
                  </Button>
                }
              >
                <CardForm onSuccess={() => setOpenCard(false)} />
              </AppSheet>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductosPage() {
  return (
    <Suspense>
      <ProductosContent />
    </Suspense>
  );
}
