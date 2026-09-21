"use client";

import { useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarDays, Plus } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/use-media-query";
import { dateChipLabel } from "@/lib/dateChipLabel";
import { todayStr } from "@/lib/money";
import { cn } from "@/lib/utils";
import { SPRING, haptic } from "./shared";

// Piezas para plegar lo opcional de los formularios de movimiento: la mayoría de
// las veces la fecha es hoy y no hay nota, así que en vez de un campo completo
// cada uno es una ficha que se despliega solo si se toca.

const CHIP =
  "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,color,transform] active:scale-95";

/** Fila de fichas bajo los campos principales */
export function ExtrasRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/**
 * Fecha como ficha: «Hoy», «Ayer» o «18 sep». En móvil, la ficha lleva encima un
 * <input type="date"> transparente cuyo toque abre el calendario nativo (con
 * showPicker() donde exista); en escritorio, el mismo calendario en popover que
 * DatePicker.
 */
export function DateChip({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const today = todayStr();
  const label = dateChipLabel(value, today);
  const changed = value !== today;
  const className = cn(
    CHIP,
    changed ? "bg-foreground text-background" : "bg-[var(--surface-2)] text-foreground",
  );
  const content = (
    <>
      <CalendarDays className="h-4 w-4" aria-hidden="true" />
      {label}
    </>
  );

  if (!isDesktop) {
    return (
      <label className={className}>
        {content}
        <input
          id={id}
          type="date"
          required
          value={value}
          // Vaciarlo con el «Borrar» de iOS dejaría el movimiento sin fecha
          onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
          // Tocar el campo no basta para abrir el calendario en todos los
          // navegadores: Chrome solo lo abre desde su iconito, que aquí está
          // invisible en una esquina. showPicker() lo abre desde cualquier punto.
          // Sin preventDefault: en iOS el toque ya lo abre y no hay que estorbarlo
          onClick={(e) => {
            try { e.currentTarget.showPicker?.(); } catch { /* ya abierto o no admitido */ }
          }}
          aria-label={`Fecha: ${label}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    );
  }

  const parsed = parseISO(value);
  const selected = isValid(parsed) ? parsed : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger id={id} aria-label={`Fecha: ${label}. Cambiar`} className={className}>
        {content}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
          locale={es}
          captionLayout="dropdown"
          defaultMonth={selected ?? new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Ficha «+ Nota»: desaparece al tocarla, porque su campo ocupa su lugar */
export function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => { haptic(); onClick(); }}
      className={cn(CHIP, "bg-[var(--surface-2)] text-muted-foreground hover:text-foreground")}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

/** Despliegue del campo que sale de una ficha: crece desde arriba y se enfoca */
export function Reveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  // Recorta solo mientras cambia de alto: en reposo cortaría el anillo de foco
  const [settled, setSettled] = useState(false);
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }}
          transition={reduce ? { duration: 0.15 } : { ...SPRING, opacity: { duration: 0.2 } }}
          style={{ overflow: settled ? "visible" : "hidden" }}
          onAnimationStart={() => setSettled(false)}
          onAnimationComplete={() => setSettled(true)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
