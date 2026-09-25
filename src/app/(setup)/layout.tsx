import { redirect } from "next/navigation";
import { authNextJs } from "@/lib/auth-server";

/**
 * Marco de las pantallas de paso: con sesión, pero fuera de la app.
 *
 * Solo comprueba la sesión. El marco visual lo pone AuthShell en cada página,
 * igual que en el grupo (auth). No se valida nada más acá —si el usuario está
 * activo, si existe su fila— porque esta pantalla tiene que ser alcanzable
 * justo cuando AuthGuard está mandando a alguien hacia ella.
 */
export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await authNextJs.isAuthenticated())) redirect("/login");
  return <>{children}</>;
}
