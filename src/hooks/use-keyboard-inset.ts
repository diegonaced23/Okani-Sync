"use client";

import { useEffect, useState } from "react";

/**
 * Cuánto tapa el teclado virtual el borde inferior de la pantalla, en px.
 *
 * iOS Safari y Chrome en Android (sin `interactive-widget=resizes-content`) no
 * encogen el viewport de diseño al abrir el teclado: solo el visual. Un elemento
 * `fixed; bottom: 0` queda entonces detrás del teclado. La diferencia entre el
 * viewport de diseño (innerHeight) y lo visible (visualViewport) es el teclado.
 *
 * Por debajo de `MIN_KEYBOARD_PX` se toma como 0: al plegarse la barra de
 * direcciones de Safari el visualViewport también cambia unas decenas de px, y
 * eso no es un teclado.
 */
const MIN_KEYBOARD_PX = 120;

export interface KeyboardInset {
  /** Alto tapado por el teclado; 0 si no hay teclado */
  inset: number;
  /** Alto visible sobre el teclado (visualViewport.height) mientras está abierto */
  visibleHeight: number;
}

export function useKeyboardInset(enabled = true): KeyboardInset {
  const [state, setState] = useState<KeyboardInset>({ inset: 0, visibleHeight: 0 });

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !vv) return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // offsetTop: iOS desplaza el viewport visual para enseñar el campo enfocado
        const covered = window.innerHeight - vv.height - vv.offsetTop;
        const inset = covered >= MIN_KEYBOARD_PX ? Math.round(covered) : 0;
        const visibleHeight = inset ? Math.round(vv.height) : 0;
        setState((prev) =>
          prev.inset === inset && prev.visibleHeight === visibleHeight ? prev : { inset, visibleHeight },
        );
      });
    };

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      setState({ inset: 0, visibleHeight: 0 });
    };
  }, [enabled]);

  return state;
}
