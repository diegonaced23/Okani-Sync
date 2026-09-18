"use client";

import type { ReactNode } from "react";
import { GRADIENT_MAP, ACCOUNT_GRADIENTS } from "@/lib/constants";
import type { CardBrand } from "@/lib/cardCycle";
import { BrandLogo } from "./BrandLogo";

interface CardFaceProps {
  brand: CardBrand;
  lastFourDigits: string;
  name: string;
  color: string;
  /** Contenido de la esquina inferior derecha (saldo, cupo…). */
  trailing?: ReactNode;
}

function resolveCard(color: string) {
  const g = GRADIENT_MAP[color];
  if (g) return { background: g.gradient, darkText: g.darkText };
  return { background: ACCOUNT_GRADIENTS[0].gradient, darkText: false };
}

/** Cara visual de la tarjeta. La comparten el listado (CardSummary) y la vista previa del formulario. */
export function CardFace({ brand, lastFourDigits, name, color, trailing }: CardFaceProps) {
  const { background, darkText } = resolveCard(color);
  const textColor = darkText ? "oklch(0.18 0.02 260)" : "white";

  return (
    <div
      className="relative overflow-hidden"
      style={{ background, color: textColor, padding: 18, minHeight: 120 }}
    >
      <span aria-hidden style={{
        position: "absolute", top: -50, right: -50,
        width: 150, height: 150, borderRadius: "50%",
        border: "22px solid oklch(1 0 0 / 0.12)",
        pointerEvents: "none",
      }} />
      <div className="relative flex justify-between items-center mb-4">
        <span aria-hidden style={{
          width: 32, height: 22, borderRadius: 5,
          background: "linear-gradient(135deg, oklch(0.85 0.05 90), oklch(0.65 0.08 60))",
        }} />
        <BrandLogo brand={brand} size={30} className="opacity-90" />
      </div>
      <p className="font-mono-num" style={{ fontSize: 15, letterSpacing: "0.18em", fontWeight: 600, opacity: 0.90 }}>
        •••• •••• •••• {lastFourDigits || "••••"}
      </p>
      <div className="flex justify-between items-end gap-3 mt-2" style={{ fontSize: 11, opacity: 0.80 }}>
        <span className="truncate">{name}</span>
        {trailing}
      </div>
    </div>
  );
}
