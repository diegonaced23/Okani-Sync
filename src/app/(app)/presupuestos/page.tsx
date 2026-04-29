import type { Metadata } from "next";

export const metadata: Metadata = { title: "Presupuestos" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Presupuestos</h1>
      <p className="text-muted-foreground">Este módulo se construye en próximos sprints.</p>
    </div>
  );
}
