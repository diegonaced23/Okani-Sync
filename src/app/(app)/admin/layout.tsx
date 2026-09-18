import { redirect } from "next/navigation";
import { authNextJs } from "@/lib/auth-server";
import { api } from "../../../../convex/_generated/api";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await authNextJs.fetchAuthQuery(api.users.getMe);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  return <>{children}</>;
}
