import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // currentUser() retorna el objeto completo con publicMetadata — no depende del JWT.
  const user = await currentUser();
  if (user?.publicMetadata?.role !== "admin") redirect("/dashboard");

  return <>{children}</>;
}
