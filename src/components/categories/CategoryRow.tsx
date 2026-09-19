"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  Reorder,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { Archive, GripVertical, Lock, Pencil } from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, SPRING, haptic, tint, type Category } from "./shared";

/** Ancho de las dos acciones reveladas al deslizar (72px cada una) */
const ACTIONS_W = 144;
/** Deslizar más allá de esta fracción del ancho archiva directo (como Mail en iOS) */
const FULL_SWIPE = 0.55;

export interface RowStats {
  amount: number;
  count: number;
  /** Fracción (0–1) del total de la pestaña */
  share: number;
}

interface CategoryRowProps {
  cat: Category;
  index: number;
  stats: RowStats | undefined;
  currency: string;
  editing: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onEdit: () => void;
  onArchive: () => void;
  onLocked: () => void;
  onDragEnd: () => void;
}

export function CategoryRow({
  cat,
  index,
  stats,
  currency,
  editing,
  openId,
  setOpenId,
  onEdit,
  onArchive,
  onLocked,
  onDragEnd,
}: CategoryRowProps) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const rowRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const dragged = useRef(false);
  const pastFull = useRef(false);
  const committing = useRef(false);
  // Estado propio en vez de whileDrag: con dragControls el "levantado" no siempre
  // se revertía al soltar y la fila quedaba escalada y con sombra.
  const [lifted, setLifted] = useState(false);

  const revealed = useTransform(x, (v) => Math.max(0, -v));
  const actionsOpacity = useTransform(x, [-24, 0], [1, 0]);
  const swipeable = !cat.isSystem && !editing;

  // Solo una fila abierta a la vez: si se abre otra (o se entra a reordenar), esta se cierra
  useEffect(() => {
    if (openId !== cat._id && x.get() !== 0 && !committing.current) {
      animate(x, 0, reduce ? { duration: 0 } : SPRING);
    }
  }, [openId, cat._id, x, reduce]);
  useEffect(() => {
    if (editing) animate(x, 0, { duration: 0 });
  }, [editing, x]);

  function fullWidth() {
    return rowRef.current?.offsetWidth ?? 360;
  }

  function handleDrag(_: unknown, info: PanInfo) {
    // Aviso háptico al cruzar el umbral de archivado directo, en ambos sentidos
    const past = -info.offset.x > fullWidth() * FULL_SWIPE;
    if (past !== pastFull.current) {
      pastFull.current = past;
      haptic(past ? 15 : 6);
    }
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    const w = fullWidth();
    const current = x.get();
    pastFull.current = false;
    if (-current > w * FULL_SWIPE) {
      // Sale de pantalla y se archiva; la fila se colapsa con la animación de salida
      // Marca la salida en curso: el efecto de "cerrar las demás filas" no debe traerla de vuelta
      committing.current = true;
      animate(x, -w, { duration: 0.2, ease: "easeIn" }).then(() => {
        setOpenId(null);
        onArchive();
        // Si el archivado falla la fila sigue montada: vuelve a su sitio
        animate(x, 0, { delay: 0.6, ...SPRING }).then(() => { committing.current = false; });
      });
      return;
    }
    const open = -current > ACTIONS_W / 2 || info.velocity.x < -400;
    animate(x, open ? -ACTIONS_W : 0, SPRING);
    setOpenId(open ? cat._id : null);
  }

  function close() {
    animate(x, 0, SPRING);
    setOpenId(null);
  }

  return (
    <Reorder.Item
      as="li"
      value={cat}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setLifted(true)}
      onDragEnd={() => { setLifted(false); onDragEnd(); }}
      // Sin `y` en la entrada: Reorder.Item usa ese valor para el arrastre
      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
      animate={{
        opacity: 1,
        scale: lifted ? 1.03 : 1,
        boxShadow: lifted ? "0 16px 36px -12px rgba(0,0,0,0.35)" : "0 0 0 0 rgba(0,0,0,0)",
      }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.28, ease: EASE_OUT_EXPO } }}
      // El retraso escalonado es solo para la entrada; al reordenar se mueve sin esperar
      transition={{
        opacity: { duration: 0.4, ease: EASE_OUT_EXPO, delay: Math.min(index, 12) * 0.035 },
        scale: lifted ? { duration: 0.15 } : { duration: 0.4, ease: EASE_OUT_EXPO },
        boxShadow: { duration: 0.2 },
        layout: { duration: 0.3, ease: EASE_OUT_EXPO },
      }}
      style={{ zIndex: lifted ? 50 : undefined }}
      className={cn(
        "relative list-none overflow-hidden rounded-[16px] transition-colors",
        lifted && "bg-card",
      )}
    >
      <div ref={rowRef} className="relative">
        {/* Acciones detrás de la fila: crecen desde la derecha a medida que se desliza */}
        {swipeable && (
          <motion.div
            className="absolute inset-y-0 right-0 flex overflow-hidden rounded-[16px]"
            style={{ width: revealed, opacity: actionsOpacity }}
            aria-hidden={openId !== cat._id}
          >
            <button
              type="button"
              tabIndex={openId === cat._id ? 0 : -1}
              onClick={() => { close(); onEdit(); }}
              className="flex min-w-0 flex-[0_1_72px] flex-col items-center justify-center gap-1 bg-[var(--os-cyan-2)] text-[11px] font-bold text-white"
            >
              <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Editar</span>
            </button>
            <button
              type="button"
              tabIndex={openId === cat._id ? 0 : -1}
              onClick={() => { committing.current = true; setOpenId(null); onArchive(); }}
              className="flex min-w-0 flex-[1_1_72px] flex-col items-center justify-center gap-1 bg-[var(--os-orange-2)] text-[11px] font-bold text-white"
            >
              <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Archivar</span>
            </button>
          </motion.div>
        )}

        <motion.div
          drag={swipeable ? "x" : false}
          dragDirectionLock
          dragConstraints={{ right: 0 }}
          dragElastic={{ left: 0.08, right: 0.02 }}
          dragMomentum={false}
          onDragStart={() => { dragged.current = true; if (openId !== cat._id) setOpenId(cat._id); }}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          style={{ x }}
          className="relative flex items-center"
        >
          {/* Agarre: solo en modo reordenar */}
          <AnimatePresence initial={false}>
            {editing && (
              <motion.button
                type="button"
                aria-label={`Arrastrar ${cat.name} para reordenar`}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 36, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={SPRING}
                onPointerDown={(e) => { haptic(8); controls.start(e); }}
                className="flex shrink-0 cursor-grab touch-none items-center justify-center self-stretch text-muted-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </motion.button>
            )}
          </AnimatePresence>

          <button
            type="button"
            onPointerDown={() => { dragged.current = false; }}
            onClick={() => {
              if (dragged.current) return;
              if (openId === cat._id) return close();
              if (editing) return;
              if (cat.isSystem) return onLocked();
              onEdit();
            }}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors",
              !editing && "hover:bg-muted/50 active:bg-muted/70",
            )}
          >
            <span
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
              style={{
                background: tint(cat.color, 17),
                color: cat.color,
                boxShadow: `inset 0 0 0 1px ${tint(cat.color, 22)}`,
              }}
            >
              <CategoryIcon name={cat.icon} className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold leading-tight text-foreground">{cat.name}</span>
                {cat.type === "ambos" && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    Ambos
                  </span>
                )}
                {cat.isSystem && (
                  <>
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="sr-only">(categoría del sistema, no editable)</span>
                  </>
                )}
              </span>
              {/* Proporción del total del mes en la pestaña */}
              <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-muted/70">
                <motion.span
                  className="block h-full rounded-full"
                  style={{ background: cat.color }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${Math.max(stats?.share ?? 0, stats?.count ? 0.02 : 0) * 100}%` }}
                  transition={{ duration: 0.7, ease: EASE_OUT_EXPO, delay: 0.15 + Math.min(index, 12) * 0.035 }}
                />
              </span>
            </span>

            <AnimatePresence initial={false}>
              {!editing && (
                <motion.span
                  className="flex shrink-0 flex-col items-end"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {stats?.count ? (
                    <>
                      <span className="font-mono-num text-sm font-bold tabular-nums text-foreground">
                        {formatCents(stats.amount, currency)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {stats.count} {stats.count === 1 ? "mov." : "movs."}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground/70">Sin uso</span>
                  )}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </motion.div>
      </div>
    </Reorder.Item>
  );
}
