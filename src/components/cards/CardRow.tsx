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
import { Archive, ArchiveRestore, Banknote, Eye, EyeOff, GripVertical, Pencil } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { formatCents } from "@/lib/money";
import { formatCardBalance } from "@/lib/cardCycle";
import { cn } from "@/lib/utils";
import { CardFace } from "./CardFace";
import {
  EASE_OUT_EXPO,
  SPRING,
  dueOf,
  haptic,
  tint,
  usageOf,
  usageTextTone,
  usageTone,
  type Card,
} from "./shared";

const ACTION_W = 72;
const FULL_SWIPE = 0.55;

/**
 * Una tarjeta del listado: el plástico (CardFace, el mismo que el dashboard) sobre
 * una franja con el uso del cupo y cuándo toca pagar. La franja es lo nuevo: antes
 * decía «Corte día 15 · Pago día 5» y había que hacer la cuenta a mano.
 */
export function CardRow({
  card,
  index,
  archived,
  editing,
  nowMs,
  openId,
  setOpenId,
  onOpen,
  onEdit,
  onToggleArchive,
  onToggleInclude,
  onPay,
  onDragEnd,
}: {
  card: Card;
  index: number;
  archived?: boolean;
  editing?: boolean;
  nowMs: number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onOpen: () => void;
  onEdit: () => void;
  onToggleArchive: () => void;
  /** Sacarla del total o devolverla, igual que una cuenta. Sin él no se ofrece. */
  onToggleInclude?: () => void;
  /** Pagar la tarjeta: la única entrada al pago junto con el detalle. */
  onPay?: () => void;
  onDragEnd: () => void;
}) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const rowRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const dragged = useRef(false);
  const pastFull = useRef(false);
  const committing = useRef(false);
  const [lifted, setLifted] = useState(false);

  const revealed = useTransform(x, (v) => Math.max(0, -v));
  const actionsOpacity = useTransform(x, [-24, 0], [1, 0]);

  const usage = usageOf(card);
  const tone = usageTone(usage);
  const due = archived || card.currentBalance <= 0 ? null : dueOf(card, nowMs);

  const excluded = card.includeInBalance === false;
  const actions = archived
    ? [{ key: "unarchive", label: "Restaurar", icon: ArchiveRestore, className: "bg-[var(--os-cyan-2)]", onAction: onToggleArchive }]
    : [
        ...(onPay && card.currentBalance > 0
          ? [{ key: "pay", label: "Pagar", icon: Banknote, className: "bg-[var(--os-lime-2)]", onAction: onPay }]
          : []),
        { key: "edit", label: "Editar", icon: Pencil, className: "bg-[var(--os-violet-2)]", onAction: onEdit },
        ...(onToggleInclude
          ? [excluded
              ? { key: "include", label: "Sumar", icon: Eye, className: "bg-[var(--os-lime-2)]", onAction: onToggleInclude }
              : { key: "exclude", label: "Excluir", icon: EyeOff, className: "bg-[var(--os-cyan-2)]", onAction: onToggleInclude }]
          : []),
        { key: "archive", label: "Archivar", icon: Archive, className: "bg-[var(--os-orange-2)]", onAction: onToggleArchive },
      ];

  const swipeable = !editing;
  const actionsW = ACTION_W * actions.length;

  useEffect(() => {
    if (openId !== card._id && x.get() !== 0 && !committing.current) {
      animate(x, 0, reduce ? { duration: 0 } : SPRING);
    }
  }, [openId, card._id, x, reduce]);
  useEffect(() => {
    if (editing) animate(x, 0, { duration: 0 });
  }, [editing, x]);

  function fullWidth() {
    return rowRef.current?.offsetWidth ?? 360;
  }

  function close() {
    animate(x, 0, SPRING);
    setOpenId(null);
  }

  function handleDrag(_: unknown, info: PanInfo) {
    const past = -info.offset.x > fullWidth() * FULL_SWIPE;
    if (past !== pastFull.current) {
      pastFull.current = past;
      haptic(past ? 15 : 6);
    }
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    const w = fullWidth();
    const current = -x.get();
    pastFull.current = false;
    if (current > w * FULL_SWIPE) {
      const last = actions[actions.length - 1];
      committing.current = true;
      animate(x, -w, { duration: 0.2, ease: "easeIn" }).then(() => {
        setOpenId(null);
        last.onAction();
        animate(x, 0, { delay: 0.6, ...SPRING }).then(() => { committing.current = false; });
      });
      return;
    }
    const open = current > actionsW / 2 || info.velocity.x < -400;
    animate(x, open ? -actionsW : 0, SPRING);
    setOpenId(open ? card._id : null);
  }

  return (
    <Reorder.Item
      as="li"
      value={card}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setLifted(true)}
      onDragEnd={() => { setLifted(false); onDragEnd(); }}
      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
      animate={{
        opacity: 1,
        scale: lifted ? 1.02 : 1,
        boxShadow: lifted ? "0 18px 40px -12px rgba(0,0,0,0.4)" : "0 0 0 0 rgba(0,0,0,0)",
      }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.28, ease: EASE_OUT_EXPO } }}
      transition={{
        opacity: { duration: 0.4, ease: EASE_OUT_EXPO, delay: Math.min(index, 8) * 0.045 },
        scale: lifted ? { duration: 0.15 } : { duration: 0.4, ease: EASE_OUT_EXPO },
        boxShadow: { duration: 0.2 },
        layout: { duration: 0.3, ease: EASE_OUT_EXPO },
      }}
      style={{ zIndex: lifted ? 50 : undefined }}
      className="relative list-none overflow-hidden rounded-[22px]"
    >
      <div ref={rowRef} className="relative">
        {swipeable && (
          <motion.div
            className="absolute inset-y-0 right-0 flex overflow-hidden rounded-[22px]"
            style={{ width: revealed, opacity: actionsOpacity }}
            aria-hidden={openId !== card._id}
          >
            {actions.map((a, i) => {
              const ActionIcon = a.icon;
              const last = i === actions.length - 1;
              return (
                <button
                  key={a.key}
                  type="button"
                  tabIndex={openId === card._id ? 0 : -1}
                  onClick={() => { close(); a.onAction(); }}
                  className={cn(
                    "flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-bold text-white",
                    last ? "flex-[1_1_72px]" : "flex-[0_1_72px]",
                    a.className,
                  )}
                >
                  <ActionIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{a.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}

        <motion.div
          drag={swipeable ? "x" : false}
          dragDirectionLock
          dragConstraints={{ right: 0 }}
          dragElastic={{ left: 0.08, right: 0.02 }}
          dragMomentum={false}
          onDragStart={() => { dragged.current = true; if (openId !== card._id) setOpenId(card._id); }}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          style={{ x }}
          className="relative flex items-stretch"
        >
          <AnimatePresence initial={false}>
            {editing && (
              <motion.button
                type="button"
                aria-label={`Arrastrar ${card.name} para reordenar`}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 32, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={SPRING}
                onPointerDown={(e) => { haptic(8); controls.start(e); }}
                className="flex shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-l-[22px] bg-card text-muted-foreground active:cursor-grabbing"
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
              if (openId === card._id) return close();
              if (editing) return;
              onOpen();
            }}
            className={cn(
              "min-w-0 flex-1 overflow-hidden rounded-[22px] border border-border bg-card text-left transition-transform",
              !editing && "active:scale-[0.99]",
              archived && "opacity-70",
            )}
          >
            <CardFace
              brand={card.brand ?? "otro"}
              lastFourDigits={card.lastFourDigits}
              name={card.name}
              color={card.color}
              trailing={
                <span className="font-mono-num shrink-0 font-bold">
                  {formatCardBalance(card.currentBalance, card.currency)}
                </span>
              }
            />

            {/* Franja de estado: uso del cupo y cuándo toca pagar */}
            <div className="flex items-center gap-3 px-4 py-3">
              <ProgressRing
                value={Math.min(usage, 1)}
                color={tone}
                size={42}
                stroke={4.5}
                label={`${Math.round(usage * 100)}% del cupo usado`}
              >
                <span className="font-mono-num text-[11px] font-extrabold tabular-nums text-foreground">
                  {Math.round(usage * 100)}%
                </span>
              </ProgressRing>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">
                  Disponible{" "}
                  <strong className="font-mono-num tabular-nums text-foreground">
                    {formatCents(card.availableCredit, card.currency)}
                  </strong>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {excluded && !archived ? "Fuera del total · " : ""}
                  {card.bankName} · corte {card.cutoffDay}
                  {card.interestRate ? ` · ${(card.interestRate * 100).toFixed(1)}% m.v.` : ""}
                </p>
              </div>

              {due ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    !due.urgent && "bg-muted text-muted-foreground",
                  )}
                  style={
                    due.urgent
                      ? { background: tint("var(--os-orange)", 18), color: "var(--os-orange-text)" }
                      : undefined
                  }
                >
                  {due.text}
                </span>
              ) : (
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: tint(tone, 15), color: usageTextTone(usage) }}
                >
                  {archived ? "Archivada" : "Sin deuda"}
                </span>
              )}
            </div>
          </button>
        </motion.div>
      </div>
    </Reorder.Item>
  );
}
