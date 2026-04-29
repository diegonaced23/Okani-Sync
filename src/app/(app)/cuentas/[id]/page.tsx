import type { Metadata } from "next";

export const metadata: Metadata = { title: "Detalle de cuenta" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Detalle de cuenta</h1>
      <p className="text-muted-foreground">Este módulo se construye en próximos sprints.</p>
    </div>
  );
}
