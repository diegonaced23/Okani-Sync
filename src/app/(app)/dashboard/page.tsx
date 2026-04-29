import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      <p className="text-muted-foreground">
        Bienvenido a Okany Sync. El dashboard se construye en el Sprint 7.
      </p>
    </div>
  );
}
