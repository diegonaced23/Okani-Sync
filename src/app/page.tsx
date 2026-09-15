import { redirect } from "next/navigation";
import { authNextJs } from "@/lib/auth-server";
import { api } from "../../convex/_generated/api";

export default async function RootPage() {
  const me = await authNextJs.fetchAuthQuery(api.users.getMe);
  if (!me) redirect("/sign-in");
  if (me.role === "admin") redirect("/admin");
  redirect("/dashboard");
}
