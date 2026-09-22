import type { Metadata } from "next";
import { ErrorScreen } from "@/components/errors/ErrorScreen";

export const metadata: Metadata = { title: "Página no encontrada" };

// Cualquier URL que no exista, en toda la app. «Ir al inicio» apunta a "/",
// que ya decide si toca el dashboard, el panel admin o el login.
export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      title="Esta página no existe"
      detail="El enlace puede estar mal escrito, o esta sección se movió o se eliminó."
    />
  );
}
