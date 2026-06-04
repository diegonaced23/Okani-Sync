import { redirect } from "next/navigation";

export default function TarjetasPage() {
  redirect("/productos?tab=tarjetas");
}
