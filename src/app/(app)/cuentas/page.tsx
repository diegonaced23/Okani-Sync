"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AccountCard } from "@/components/accounts/AccountCard";
import { AccountForm } from "@/components/accounts/AccountForm";
import { formatCents } from "@/lib/money";
import { useRouter } from "next/navigation";

export default function CuentasPage() {
  const accounts = useQuery(api.accounts.list);
  const sharedAccounts = useQuery(api.accounts.listSharedWithMe);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const totalCOP = (accounts ?? [])
    .filter((a) => a.currency === "COP")
    .reduce((sum, a) => sum + a.balance, 0);

  const isLoading = accounts === undefined;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cuentas</h1>
          {!isLoading && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Total COP: {formatCents(totalCOP, "COP")}
            </p>
          )}
        </div>
        <AppSheet
          open={open}
          onOpenChange={setOpen}
          title="Nueva cuenta"
          trigger={<Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nueva</Button>}
        >
          <AccountForm onSuccess={() => setOpen(false)} />
        </AppSheet>
      </div>

      {/* Mis cuentas */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Mis cuentas
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (accounts ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No tienes cuentas registradas aún.
          </p>
        ) : (
          <div className="space-y-2">
            {accounts!.map((account) => (
              <AccountCard
                key={account._id}
                account={account}
                onClick={() => router.push(`/cuentas/${account._id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Cuentas compartidas conmigo */}
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
    </div>
  );
}
