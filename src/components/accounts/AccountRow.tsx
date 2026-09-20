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
import {
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Star,
  TrendingDown,
  Users,
} from "lucide-react";
import { GRADIENT_MAP, ACCOUNT_GRADIENTS } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPE_META } from "./accountTypes";
import { EASE_OUT_EXPO, SPRING, accountSubtitle, haptic, isExcluded, tint, type AccountView } from "./shared";

/** Ancho de cada acción revelada al deslizar */
const ACTION_W = 72;
/** Deslizar más allá de esta fracción del ancho ejecuta la última acción, como Mail en iOS */
const FULL_SWIPE = 0.55;

export function AccountRow({
  account,
  index,
  /** Cuenta de otra persona compartida conmigo: no se edita ni se archiva */
  isShared,
  archived,
  editing,
  openId,
  setOpenId,
  onOpen,
  onEdit,
  onToggleArchive,
  onToggleInclude,
  onDragEnd,
}: {
  account: AccountView;
  index: number;
  isShared?: boolean;
  archived?: boolean;
  editing?: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onOpen: () => void;
  onEdit: () => void;
  onToggleArchive: () => void;
  onToggleInclude: () => void;
  onDragEnd: () => void;
}) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const rowRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const dragged = useRef(false);
  const pastFull = useRef(false);
  const committing = useRef(false);
  // Estado propio en vez de whileDrag: con dragControls el "levantado" no siempre
  // se revertía al soltar y la fila quedaba escalada.
  const [lifted, setLifted] = useState(false);

  const revealed = useTransform(x, (v) => Math.max(0, -v));
  const actionsOpacity = useTransform(x, [-24, 0], [1, 0]);

  const g = GRADIENT_MAP[account.color] ?? ACCOUNT_GRADIENTS[0];
  const Icon = ACCOUNT_TYPE_META[account.type].icon;
  const negative = account.balance < 0;
  const excluded = isExcluded(account);

  const actions = archived
    ? [{ key: "unarchive", label: "Restaurar", icon: ArchiveRestore, className: "bg-[var(--os-cyan-2)]", onAction: onToggleArchive }]
    : [
        { key: "edit", label: "Editar", icon: Pencil, className: "bg-[var(--os-violet-2)]", onAction: onEdit },
        excluded
          ? { key: "include", label: "Sumar", icon: Eye, className: "bg-[var(--os-lime-2)]", onAction: onToggleInclude }
          : { key: "exclude", label: "Excluir", icon: EyeOff, className: "bg-[var(--os-cyan-2)]", onAction: onToggleInclude },
        // La cuenta por defecto no se puede archivar: el backend lo rechaza
        ...(account.isDefault
          ? []
          : [{ key: "archive", label: "Archivar", icon: Archive, className: "bg-[var(--os-orange-2)]", onAction: onToggleArchive }]),
      ];

  const swipeable = !isShared && !editing && actions.length > 0;
  const actionsW = ACTION_W * actions.length;

  // Solo una fila abierta a la vez; entrar en modo reordenar cierra todas
  useEffect(() => {
    if (openId !== account._id && x.get() !== 0 && !committing.current) {
      animate(x, 0, reduce ? { duration: 0 } : SPRING);
    }
  }, [openId, account._id, x, reduce]);
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
        // Si la acción falla y la fila sigue montada, vuelve a su sitio
        animate(x, 0, { delay: 0.6, ...SPRING }).then(() => { committing.current = false; });
      });
      return;
    }
    const open = current > actionsW / 2 || info.velocity.x < -400;
    animate(x, open ? -actionsW : 0, SPRING);
    setOpenId(open ? account._id : null);
  }

  return (
    <Reorder.Item
      as="li"
      value={account}
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
      transition={{
        opacity: { duration: 0.4, ease: EASE_OUT_EXPO, delay: Math.min(index, 12) * 0.035 },
        scale: lifted ? { duration: 0.15 } : { duration: 0.4, ease: EASE_OUT_EXPO },
        boxShadow: { duration: 0.2 },
        layout: { duration: 0.3, ease: EASE_OUT_EXPO },
      }}
      style={{ zIndex: lifted ? 50 : undefined }}
      className={cn(
        "relative list-none overflow-hidden rounded-[18px] transition-colors",
        lifted && "bg-card",
      )}
    >
      <div ref={rowRef} className="relative">
        {swipeable && (
          <motion.div
            className="absolute inset-y-0 right-0 flex overflow-hidden rounded-[18px]"
            style={{ width: revealed, opacity: actionsOpacity }}
            aria-hidden={openId !== account._id}
          >
            {actions.map((a, i) => {
              const ActionIcon = a.icon;
              const last = i === actions.length - 1;
              return (
                <button
                  key={a.key}
                  type="button"
                  tabIndex={openId === account._id ? 0 : -1}
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
          onDragStart={() => { dragged.current = true; if (openId !== account._id) setOpenId(account._id); }}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          style={{ x }}
          className="relative flex items-center"
        >
          {/* Agarre: solo en modo reordenar */}
          <AnimatePresence initial={false}>
            {editing && !isShared && (
              <motion.button
                type="button"
                aria-label={`Arrastrar ${account.name} para reordenar`}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 32, opacity: 1 }}
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
              if (openId === account._id) return close();
              if (editing) return;
              onOpen();
            }}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors",
              !editing && "hover:bg-muted/50 active:bg-muted/70",
              (archived || excluded) && "opacity-70",
            )}
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] ring-1 ring-inset ring-white/15"
              style={{ background: g.gradient, color: g.darkText ? "oklch(0.18 0.02 260)" : "white" }}
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold leading-tight text-foreground">
                  {account.name}
                </span>
                {account.isDefault && (
                  <Star className="h-3 w-3 shrink-0 fill-current" style={{ color: "var(--os-orange-text)" }} role="img" aria-label="Cuenta por defecto" />
                )}
                {isShared && (
                  <Users className="h-3 w-3 shrink-0 text-muted-foreground" role="img" aria-label="Compartida conmigo" />
                )}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate">{accountSubtitle(account)}</span>
                {excluded && !archived && (
                  <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 text-[10px] font-semibold">
                    <EyeOff className="h-2.5 w-2.5" aria-hidden="true" />
                    Fuera del total
                  </span>
                )}
              </span>
            </span>

            <span className="flex shrink-0 flex-col items-end gap-1">
              <span
                className="font-mono-num text-sm font-bold tabular-nums"
                style={{ color: negative ? "var(--os-magenta)" : undefined }}
              >
                {formatCents(account.balance, account.currency)}
              </span>
              {negative ? (
                <span
                  className="flex items-center gap-0.5 rounded-full px-2 py-px text-[11px] font-semibold"
                  style={{ background: tint("var(--os-magenta)", 15), color: "var(--os-magenta)" }}
                >
                  <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />
                  Sobregiro
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-px text-[11px] font-semibold text-muted-foreground">
                  {account.currency}
                </span>
              )}
            </span>
          </button>
        </motion.div>
      </div>
    </Reorder.Item>
  );
}
