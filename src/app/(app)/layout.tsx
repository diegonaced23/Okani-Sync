import { redirect } from "next/navigation";
import { authNextJs } from "@/lib/auth-server";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { PushSubscriptionBanner } from "@/components/notifications/PushSubscriptionBanner";
import { NewTransactionModalProvider } from "@/contexts/new-transaction-modal";
import { NewTransactionModal } from "@/components/transactions/NewTransactionModal";
import { AppDataProvider } from "@/contexts/app-data";
import { ThemeSync } from "@/components/theme/ThemeSync";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await authNextJs.isAuthenticated())) redirect("/login");

  return (
    <NewTransactionModalProvider>
      <AppDataProvider>
        <div className="flex min-h-screen bg-background overflow-x-hidden">
          {/* Skip link — accesibilidad teclado */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-xl focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:ring-2 focus:ring-ring"
          >
            Ir al contenido principal
          </a>
          {/* Aurora de fondo — efecto sutil de profundidad */}
          <div aria-hidden className="os-aurora" />
          {/* Aplica el tema guardado en la cuenta en un dispositivo que aún no eligió */}
          <ThemeSync />
          <Sidebar />

          {/* Área principal — min-w-0 evita que el flex item se expanda más allá del viewport */}
          <div className="flex flex-1 flex-col min-w-0 lg:pl-[17.5rem] overflow-x-hidden">
            <Header />
            <PushSubscriptionBanner />
            <main id="main-content" className="flex-1 px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:px-8 lg:pb-8">
              <AuthGuard>{children}</AuthGuard>
            </main>
          </div>

          <BottomNav />
        </div>
        <NewTransactionModal />
      </AppDataProvider>
    </NewTransactionModalProvider>
  );
}
