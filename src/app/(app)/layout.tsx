import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { PushSubscriptionBanner } from "@/components/notifications/PushSubscriptionBanner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="flex min-h-screen bg-background overflow-x-hidden">
      {/* Aurora de fondo — efecto sutil de profundidad */}
      <div aria-hidden className="os-aurora" />
      <Sidebar />

      {/* Área principal — min-w-0 evita que el flex item se expanda más allá del viewport */}
      <div className="flex flex-1 flex-col min-w-0 lg:pl-64 overflow-x-hidden">
        <Header />
        <PushSubscriptionBanner />
        <main className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-8">
          <AuthGuard>{children}</AuthGuard>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
