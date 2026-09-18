"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const SPLASH_KEY = "okany-splash";

// useLayoutEffect avisa cuando corre en SSR, y en el servidor no hay layout que
// medir. En el navegador tiene que ser la versión de layout: corre ANTES del
// primer paint, así que la clase de la intro ya está puesta en el primer
// fotograma y no se llega a ver el formulario en su posición final.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function BrandMark({ ref }: { ref: React.RefObject<HTMLSpanElement | null> }) {
  return (
    <span ref={ref} className="auth-logo auth-mark" aria-hidden="true">
      <svg width="54" height="54" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 14c0-5 4-9 8-9s8 4 8 9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="12" cy="17" r="2.5" fill="currentColor" />
      </svg>
    </span>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: React.ReactNode;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLSpanElement>(null);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    const logo = logoRef.current;
    if (!root || !logo) return;

    // La intro se decide acá y no en CSS: si no se añade la clase, todo queda
    // en su estado final y visible. Es la posición segura — sin JS, o si algo
    // falla, la pantalla se ve entera igual.
    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem(SPLASH_KEY) === "1";
    } catch {
      // Navegación privada o storage bloqueado: la intro vuelve a correr.
    }
    if (alreadySeen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Cuánto hay que bajar el logo para que arranque centrado en el viewport:
    // la diferencia entre el centro de la ventana y el centro de su posición
    // final. Se mide en vez de codificarse porque depende del alto de la
    // tarjeta, que no es el mismo en /login que en /reset-password y cambia
    // con el tamaño de la ventana.
    const rect = logo.getBoundingClientRect();
    const lift = window.innerHeight / 2 - (rect.top + rect.height / 2);
    root.style.setProperty("--auth-lift", `${Math.round(lift)}px`);
    root.classList.add("auth-intro");

    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // Ídem: sin storage la intro se repite, que es preferible a romper.
    }
  }, []);

  return (
    <>
      <div className="os-aurora" aria-hidden="true" />

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div ref={rootRef} className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center">
            <BrandMark ref={logoRef} />
            <h1 className="auth-rise auth-rise-1 mt-6 text-3xl font-bold tracking-display">
              {title}
            </h1>
            <p className="auth-rise auth-rise-1 mt-2 text-sm text-muted-foreground">
              {subtitle}
            </p>
          </div>

          <div className="auth-rise auth-rise-2 auth-card mt-7 p-6">{children}</div>

          {footer ? (
            <div className="auth-rise auth-rise-2 mt-5 text-center text-xs text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
