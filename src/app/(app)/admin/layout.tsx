import { redirect } from "next/navigation";
import { authNextJs } from "@/lib/auth-server";
import { api } from "../../../../convex/_generated/api";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await authNextJs.fetchAuthQuery(api.users.getMe);
  // Se comprueba `active` además del rol: getMe usa getCurrentUserOrNull, que
  // no lo valida, así que sin esta línea un administrador desactivado entraba
  // al panel y solo fallaban las secciones cuyo backend sí usa assertAdmin.
  if (!me) redirect("/login");
  if (me.role !== "admin" || !me.active) redirect("/dashboard");

  return <>{children}</>;
}
