import { redirect } from "next/navigation";

export default function CuentasPage() {
  redirect("/productos?tab=cuentas");
}
