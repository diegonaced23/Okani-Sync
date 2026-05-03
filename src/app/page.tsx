import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (user.publicMetadata?.role === "admin") redirect("/admin");
  redirect("/dashboard");
}
