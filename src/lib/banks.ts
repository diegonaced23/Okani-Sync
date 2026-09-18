import type { GradientKey } from "@/lib/constants";

/** Máximo de caracteres del nombre del banco (también lo valida `cards.create`). */
export const BANK_NAME_MAX = 35;

// Bancos y emisores de tarjetas de crédito en Colombia, en orden alfabético, con el
// degradado de ACCOUNT_GRADIENTS más cercano a su color de marca (solo una sugerencia).
// Incluye compañías de financiamiento y fintechs que emiten tarjeta (Nu, Tuya, Ualá…).
// Si falta alguno, el usuario lo escribe con la opción "Otro".
export const CARD_BANKS: readonly { name: string; color: GradientKey }[] = [
  { name: "Bancamía", color: "g-ember" },
  { name: "Banco Agrario", color: "g-lime" },
  { name: "Banco AV Villas", color: "g-red" },
  { name: "Banco Caja Social", color: "g-ocean" },
  { name: "Banco Cooperativo Coopcentral", color: "g-lime" },
  { name: "Banco de Bogotá", color: "g-night" },
  { name: "Banco de Occidente", color: "g-ocean" },
  { name: "Banco Falabella", color: "g-lime" },
  { name: "Banco Finandina", color: "g-ocean" },
  { name: "Banco GNB Sudameris", color: "g-night" },
  { name: "Banco Mundo Mujer", color: "g-rose" },
  { name: "Banco Pichincha", color: "g-gold" },
  { name: "Banco Popular", color: "g-lime" },
  { name: "Banco Santander", color: "g-red" },
  { name: "Banco Serfinanza", color: "g-ocean" },
  { name: "Banco Unión", color: "g-ocean" },
  { name: "Banco W", color: "g-ember" },
  { name: "Bancolombia", color: "g-gold" },
  { name: "Bancoomeva", color: "g-lime" },
  { name: "BBVA", color: "g-ocean" },
  { name: "Citibank", color: "g-ocean" },
  { name: "Coltefinanciera", color: "g-night" },
  { name: "Davivienda", color: "g-red" },
  { name: "Itaú", color: "g-ember" },
  { name: "Lulo Bank", color: "g-lime" },
  { name: "Mibanco", color: "g-lime" },
  { name: "Nu", color: "g-violet" },
  { name: "RappiCard", color: "g-rose" },
  { name: "Scotiabank Colpatria", color: "g-red" },
  { name: "Tuya", color: "g-gold" },
  { name: "Ualá", color: "g-ocean" },
];

/** Banco del catálogo con ese nombre exacto, si existe. */
export function findBank(name: string) {
  return CARD_BANKS.find((b) => b.name === name);
}
