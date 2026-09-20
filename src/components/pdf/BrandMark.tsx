// Marca de Okany Sync para los documentos PDF (@react-pdf/renderer).
//
// Vive aparte porque la usan dos documentos —el extracto de reportes y el de
// tarjeta— y el glifo ya está duplicado en demasiados sitios: src/app/icon.svg,
// los tres SVG inline de React (Sidebar, Header, AuthShell) y los PNG de
// public/icons. Si el logo vuelve a cambiar, este archivo es UNA sola edición
// en lugar de dos.
//
// Dos decisiones que no son obvias y conviene no deshacer:
//
//  1. El símbolo de dólar lleva el `transform` aplicado a mano en las propias
//     coordenadas del path. En el SVG del navegador es
//     `translate(16 18.25) scale(0.4) translate(-12 -12)` sobre el trazo de
//     Lucide; aquí esa matriz ya está horneada —(x,y) → (16+0.4(x−12),
//     18.25+0.4(y−12))— para no depender de cómo react-pdf interpreta
//     `transform`, que no usa el mismo parser que un navegador.
//  2. Cada figura lleva `fill="none"` explícito: react-pdf no hereda el
//     `fill="none"` del <Svg> padre como sí hace el navegador, y sin él la
//     moneda sale como un disco negro macizo.

import { Svg, Path, Circle, Rect, Defs, LinearGradient, Stop } from "@react-pdf/renderer";

/** Verde profundo del glifo, el mismo `#052e16` del resto de la identidad. */
const INK = "#052e16";

interface BrandMarkProps {
  /** Lado del cuadrado, en puntos PDF. */
  size?: number;
  /**
   * Identificador del degradado. Solo hace falta tocarlo si un mismo documento
   * llega a pintar dos marcas: los `id` de <Defs> son globales al documento.
   */
  gradientId?: string;
}

export function BrandMark({ size = 32, gradientId = "okanyBrand" }: BrandMarkProps) {
  return (
    <Svg viewBox="0 0 32 32" style={{ width: size, height: size }}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4ADE80" />
          <Stop offset="1" stopColor="#22D3EE" />
        </LinearGradient>
      </Defs>
      <Rect width={32} height={32} rx={8} ry={8} fill={`url(#${gradientId})`} />
      {/* Arco concéntrico con la moneda, de recorrido asimétrico */}
      <Path
        d="M5.81 20.05A10.35 10.35 0 0 1 23.93 11.6"
        stroke={INK}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={16} cy={18.25} r={6.1} stroke={INK} strokeWidth={2} fill="none" />
      {/* El "$": barra vertical y ese, en dos paths por separado */}
      <Path d="M16 14.25v8" stroke={INK} strokeWidth={1.48} strokeLinecap="round" fill="none" />
      <Path
        d="M18 15.45H15a1.4 1.4 0 0 0 0 2.8h2a1.4 1.4 0 0 1 0 2.8H13.6"
        stroke={INK}
        strokeWidth={1.48}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
