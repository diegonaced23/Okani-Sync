/**
 * Glifo de la marca: moneda con arco ascendente. Mismo trazo que
 * src/app/icon.svg, Sidebar.tsx y Header.tsx. Ocupa el recuadro entero porque
 * ya trae su propio margen dentro de la rejilla de 32: encogerlo lo dejaría con
 * el doble de aire que el icono de la app.
 */
export function BrandGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M5.81 20.05A10.35 10.35 0 0 1 23.93 11.6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="18.25" r="6.1" stroke="currentColor" strokeWidth="2" />
      <g transform="translate(16 18.25) scale(0.4) translate(-12 -12)">
        <path
          d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
          stroke="currentColor"
          strokeWidth="3.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
