# Módulo Perfil: contraseña y configuraciones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al módulo perfil un flujo de cambio/creación de contraseña y cuatro configuraciones nuevas (preferencias de notificación, sesiones con dispositivo real, avatar con datos de cuenta, y export completo de datos), dividiendo la página monolítica en componentes.

**Architecture:** El backend Convex gana un punto de control único para notificaciones (`convex/lib/notify.ts`) que consulta preferencias por familia antes de crear notificación in-app y push, más funciones de avatar sobre `_storage` y una action de export que entrega el JSON por URL de storage. El frontend pasa de un archivo cliente de ~300 líneas a `src/components/perfil/*` con una tarjeta por responsabilidad. La lógica pura (parseo de user agent, mapeo tipo→familia, armado del payload de export) vive en `src/lib/` con tests de Vitest.

**Tech Stack:** Next.js 16 (App Router, React 19), Convex, Better Auth (`better-auth@^1.6.26`, `@convex-dev/better-auth@^0.12.5`), Tailwind v4 + Shadcn/ui, Vitest (entorno `node`), Sonner para toasts, lucide-react para iconos.

**Spec:** `docs/superpowers/specs/2026-09-17-perfil-configuraciones-design.md`

## Global Constraints

- **Nunca hacer `git commit` ni `git push`.** Está prohibido por `CLAUDE.md` y por las reglas globales del usuario. Los pasos de "Checkpoint" de este plan solo listan los archivos tocados y proponen un mensaje de commit **para que lo ejecute el usuario**. El agente no ejecuta ningún comando de git que escriba.
- **Leer `convex/_generated/ai/guidelines.md` antes de tocar código de Convex.** Reglas que este plan aplica y que deben respetarse: (a) todas las funciones llevan validadores de argumentos; (b) nunca `.filter()` en queries — usar `withIndex`; (c) nunca `.collect()` sin cota — usar `.take(n)`; (d) `"use node"` jamás en un archivo que también exporte queries o mutations; (e) nunca `ctx.db` dentro de una action; (f) tipar los ctx con `QueryCtx` / `MutationCtx` / `ActionCtx`, nunca `any`.
- **Dinero:** todos los valores monetarios en la BD son enteros escalados ×100. Usar `toCents` / `fromCents` de `src/lib/money.ts`.
- **Identidad:** el identificador de usuario en todas las tablas de negocio es `clerkId`, nunca `identity.subject` crudo (bajo Better Auth eso es el `authId`). Resolver siempre con los helpers de `convex/lib/auth.ts`.
- **Idioma:** todo el texto visible y los comentarios de código van en español con acentuación correcta.
- **Verificación al final de cada tarea:** `npm test`, `npm run lint`, `npm run typecheck`.

---

### Task 1: `parseUserAgent` — lógica pura de dispositivo

**Files:**
- Create: `src/lib/userAgent.ts`
- Test: `src/lib/__tests__/userAgent.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type ParsedUserAgent = { browser: string; os: string; isMobile: boolean }`
  - `parseUserAgent(ua: string | null | undefined): ParsedUserAgent`
  - `formatDevice(parsed: ParsedUserAgent): string` — etiqueta lista para mostrar ("Chrome · macOS").

  Los consume la Task 11.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/userAgent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseUserAgent } from "../userAgent";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const EDGE_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
const FIREFOX_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

describe("parseUserAgent", () => {
  it("detecta Chrome en macOS y lo marca como escritorio", () => {
    expect(parseUserAgent(CHROME_MAC)).toEqual({
      browser: "Chrome",
      os: "macOS",
      isMobile: false,
    });
  });

  it("detecta Safari en iOS y lo marca como móvil", () => {
    expect(parseUserAgent(SAFARI_IOS)).toEqual({
      browser: "Safari",
      os: "iOS",
      isMobile: true,
    });
  });

  it("no confunde Edge con Chrome: Edge se anuncia como Chrome en su UA", () => {
    expect(parseUserAgent(EDGE_WIN).browser).toBe("Edge");
    expect(parseUserAgent(EDGE_WIN).os).toBe("Windows");
  });

  it("no confunde Chrome con Safari: Chrome también incluye 'Safari' en su UA", () => {
    expect(parseUserAgent(CHROME_MAC).browser).toBe("Chrome");
  });

  it("detecta Firefox en Linux", () => {
    expect(parseUserAgent(FIREFOX_LINUX)).toEqual({
      browser: "Firefox",
      os: "Linux",
      isMobile: false,
    });
  });

  it("detecta Android como móvil", () => {
    expect(parseUserAgent(CHROME_ANDROID)).toEqual({
      browser: "Chrome",
      os: "Android",
      isMobile: true,
    });
  });

  it("degrada a 'Desconocido' con entradas vacías o basura", () => {
    for (const input of [null, undefined, "", "   ", "no-soy-un-user-agent"]) {
      expect(parseUserAgent(input)).toEqual({
        browser: "Desconocido",
        os: "Desconocido",
        isMobile: false,
      });
    }
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/__tests__/userAgent.test.ts`
Expected: FAIL — `Failed to resolve import "../userAgent"`.

- [ ] **Step 3: Implementar `src/lib/userAgent.ts`**

```ts
/**
 * Parseo mínimo del user agent de una sesión de Better Auth para mostrar
 * "Chrome · macOS" en la lista de sesiones del perfil.
 *
 * El orden de las comprobaciones importa: los navegadores mienten en su UA.
 * Edge se anuncia como Chrome (`Edg/...` además de `Chrome/...`) y Chrome se
 * anuncia como Safari (`Safari/537.36`), así que hay que ir de lo más
 * específico a lo más genérico.
 *
 * No se añade una dependencia de parseo: aquí solo se necesita una etiqueta
 * legible, no una identificación exacta.
 */
export type ParsedUserAgent = {
  browser: string;
  os: string;
  isMobile: boolean;
};

const DESCONOCIDO = "Desconocido";

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const value = ua?.trim() ?? "";
  if (!value) return { browser: DESCONOCIDO, os: DESCONOCIDO, isMobile: false };

  const browser =
    /\bEdg[A-Z]?\//i.test(value) ? "Edge"
    : /\bOPR\/|\bOpera\b/i.test(value) ? "Opera"
    : /\bFirefox\/|\bFxiOS\//i.test(value) ? "Firefox"
    : /\bChrome\/|\bCriOS\//i.test(value) ? "Chrome"
    : /\bSafari\//i.test(value) ? "Safari"
    : DESCONOCIDO;

  const os =
    /\biPhone\b|\biPad\b|\biPod\b|\biOS\b/i.test(value) ? "iOS"
    : /\bAndroid\b/i.test(value) ? "Android"
    : /\bWindows\b/i.test(value) ? "Windows"
    : /\bMac OS X\b|\bMacintosh\b/i.test(value) ? "macOS"
    : /\bLinux\b|\bX11\b/i.test(value) ? "Linux"
    : DESCONOCIDO;

  const isMobile = os === "iOS" || os === "Android" || /\bMobile\b/i.test(value);

  return { browser, os, isMobile };
}

/** Etiqueta lista para mostrar: "Chrome · macOS", o "Dispositivo desconocido". */
export function formatDevice(parsed: ParsedUserAgent): string {
  if (parsed.browser === DESCONOCIDO && parsed.os === DESCONOCIDO) {
    return "Dispositivo desconocido";
  }
  return `${parsed.browser} · ${parsed.os}`;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/__tests__/userAgent.test.ts`
Expected: PASS, 7 tests.

Nota sobre Android: el UA de Chrome en Android contiene `Linux`, pero la comprobación de `Android` va antes, así que `os` resuelve a `"Android"`. Si el test de Android falla con `"Linux"`, el orden de las ramas se alteró.

- [ ] **Step 5: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Checkpoint (el usuario commitea)**

Archivos tocados: `src/lib/userAgent.ts`, `src/lib/__tests__/userAgent.test.ts`
Mensaje sugerido: `feat: agregar parseo de user agent para la lista de sesiones`

**NO ejecutar `git commit`.** Informar al usuario y seguir.

---

### Task 2: Mapeo tipo de notificación → familia configurable

**Files:**
- Create: `src/lib/notifications.ts`
- Test: `src/lib/__tests__/notifications.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type NotificationType` — unión de los 15 literales de `notifications.type` del schema.
  - `type NotificationPrefKey = "presupuestos" | "tarjetas" | "deudasPrestamos" | "recurrentes" | "recordatorioDiario" | "resumenes"`
  - `type NotificationPrefs = Record<NotificationPrefKey, boolean>`
  - `NOTIFICATION_PREF_KEYS: readonly NotificationPrefKey[]`
  - `NOTIFICATION_PREF_LABELS: Record<NotificationPrefKey, { title: string; description: string }>`
  - `DEFAULT_NOTIFICATION_PREFS: NotificationPrefs` (todo `true`)
  - `prefKeyForType(type: NotificationType): NotificationPrefKey | null`
  - `isNotificationAllowed(type: NotificationType, prefs: Partial<NotificationPrefs> | undefined | null): boolean`

  Lo consumen las Tasks 3, 4, 5 y 10.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/notifications.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  prefKeyForType,
  isNotificationAllowed,
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_PREF_KEYS,
  type NotificationType,
} from "../notifications";

describe("prefKeyForType", () => {
  const casos: Array<[NotificationType, string | null]> = [
    ["presupuesto_alerta", "presupuestos"],
    ["presupuesto_excedido", "presupuestos"],
    ["cuota_proxima", "tarjetas"],
    ["pago_tarjeta_proximo", "tarjetas"],
    ["deuda_vencida", "deudasPrestamos"],
    ["deuda_proxima", "deudasPrestamos"],
    ["prestamo_vencido", "deudasPrestamos"],
    ["prestamo_proximo", "deudasPrestamos"],
    ["transaccion_recurrente", "recurrentes"],
    ["recordatorio_registro", "recordatorioDiario"],
    ["resumen_semanal", "resumenes"],
    ["resumen_mensual", "resumenes"],
    ["cuenta_compartida", null],
    ["share_aceptado", null],
    ["sistema", null],
  ];

  it.each(casos)("mapea %s → %s", (tipo, esperado) => {
    expect(prefKeyForType(tipo)).toBe(esperado);
  });

  it("cubre los 15 tipos del schema", () => {
    expect(casos).toHaveLength(15);
  });
});

describe("isNotificationAllowed", () => {
  it("permite todo cuando el usuario no tiene preferencias guardadas", () => {
    expect(isNotificationAllowed("resumen_semanal", undefined)).toBe(true);
    expect(isNotificationAllowed("resumen_semanal", null)).toBe(true);
  });

  it("permite las familias que faltan en un objeto parcial", () => {
    expect(isNotificationAllowed("resumen_semanal", { presupuestos: false })).toBe(true);
  });

  it("bloquea la familia desactivada", () => {
    expect(isNotificationAllowed("presupuesto_excedido", { presupuestos: false })).toBe(false);
  });

  it("nunca bloquea los tipos no configurables, ni con todo apagado", () => {
    const todoApagado = Object.fromEntries(
      NOTIFICATION_PREF_KEYS.map((k) => [k, false])
    ) as Record<(typeof NOTIFICATION_PREF_KEYS)[number], boolean>;

    expect(isNotificationAllowed("cuenta_compartida", todoApagado)).toBe(true);
    expect(isNotificationAllowed("share_aceptado", todoApagado)).toBe(true);
    expect(isNotificationAllowed("sistema", todoApagado)).toBe(true);
  });

  it("el default trae las seis familias activas", () => {
    expect(Object.values(DEFAULT_NOTIFICATION_PREFS)).toEqual([true, true, true, true, true, true]);
    expect(NOTIFICATION_PREF_KEYS).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/__tests__/notifications.test.ts`
Expected: FAIL — `Failed to resolve import "../notifications"`.

- [ ] **Step 3: Implementar `src/lib/notifications.ts`**

```ts
/**
 * Preferencias de notificación por familia.
 *
 * Vive en `src/lib/` y no en `convex/` porque lo consumen los dos lados: la
 * tarjeta de preferencias del perfil y el punto de control de los crons
 * (`convex/lib/notify.ts`). Es el mismo patrón que ya usa `convex/users.ts`
 * importando `../src/lib/constants`.
 */

/** Los 15 literales de `notifications.type` en convex/schema.ts. */
export type NotificationType =
  | "presupuesto_alerta"
  | "presupuesto_excedido"
  | "cuota_proxima"
  | "deuda_vencida"
  | "deuda_proxima"
  | "prestamo_vencido"
  | "prestamo_proximo"
  | "recordatorio_registro"
  | "transaccion_recurrente"
  | "resumen_semanal"
  | "resumen_mensual"
  | "pago_tarjeta_proximo"
  | "cuenta_compartida"
  | "share_aceptado"
  | "sistema";

export type NotificationPrefKey =
  | "presupuestos"
  | "tarjetas"
  | "deudasPrestamos"
  | "recurrentes"
  | "recordatorioDiario"
  | "resumenes";

export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

export const NOTIFICATION_PREF_KEYS = [
  "presupuestos",
  "tarjetas",
  "deudasPrestamos",
  "recurrentes",
  "recordatorioDiario",
  "resumenes",
] as const satisfies readonly NotificationPrefKey[];

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  presupuestos: true,
  tarjetas: true,
  deudasPrestamos: true,
  recurrentes: true,
  recordatorioDiario: true,
  resumenes: true,
};

export const NOTIFICATION_PREF_LABELS: Record<
  NotificationPrefKey,
  { title: string; description: string }
> = {
  presupuestos: {
    title: "Presupuestos",
    description: "Cuando te acercas al umbral o lo superas",
  },
  tarjetas: {
    title: "Tarjetas de crédito",
    description: "Cuotas y pagos próximos a vencer",
  },
  deudasPrestamos: {
    title: "Deudas y préstamos",
    description: "Vencimientos propios y de quienes te deben",
  },
  recurrentes: {
    title: "Movimientos recurrentes",
    description: "Cuando se genera un movimiento automático",
  },
  recordatorioDiario: {
    title: "Recordatorio diario",
    description: "Aviso al final del día si no registraste nada",
  },
  resumenes: {
    title: "Resúmenes",
    description: "Resumen semanal de los lunes y resumen mensual",
  },
};

/**
 * Familia configurable a la que pertenece un tipo, o `null` si el tipo no es
 * configurable. `cuenta_compartida`, `share_aceptado` y `sistema` son
 * interactivas o críticas (alguien te compartió una cuenta, tu acceso cambió):
 * silenciarlas dejaría al usuario sin enterarse de algo que requiere su acción.
 */
export function prefKeyForType(type: NotificationType): NotificationPrefKey | null {
  switch (type) {
    case "presupuesto_alerta":
    case "presupuesto_excedido":
      return "presupuestos";
    case "cuota_proxima":
    case "pago_tarjeta_proximo":
      return "tarjetas";
    case "deuda_vencida":
    case "deuda_proxima":
    case "prestamo_vencido":
    case "prestamo_proximo":
      return "deudasPrestamos";
    case "transaccion_recurrente":
      return "recurrentes";
    case "recordatorio_registro":
      return "recordatorioDiario";
    case "resumen_semanal":
    case "resumen_mensual":
      return "resumenes";
    case "cuenta_compartida":
    case "share_aceptado":
    case "sistema":
      return null;
  }
}

/**
 * `prefs` ausente o con la clave ausente significa ACTIVO. Es lo que mantiene
 * la retrocompatibilidad: ningún usuario existente pierde notificaciones al
 * desplegar el campo nuevo.
 */
export function isNotificationAllowed(
  type: NotificationType,
  prefs: Partial<NotificationPrefs> | undefined | null
): boolean {
  const key = prefKeyForType(type);
  if (key === null) return true;
  return prefs?.[key] ?? true;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/__tests__/notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Checkpoint (el usuario commitea)**

Archivos: `src/lib/notifications.ts`, `src/lib/__tests__/notifications.test.ts`
Mensaje sugerido: `feat: agregar mapeo de tipos de notificacion a familias configurables`

---

### Task 3: Schema y constantes

**Files:**
- Modify: `convex/schema.ts` (tabla `users`, líneas 26-59)
- Modify: `src/lib/constants.ts` (`AUDIT_ACTIONS` ~línea 155-172, y bloque de límites)

**Interfaces:**
- Consumes: `NotificationPrefKey` de la Task 2 (solo conceptualmente: el validador de Convex repite las claves literales).
- Produces: campos `users.notificationPrefs`, `users.imageStorageId`, `users.lastAvatarUploadAt`; constantes `AUDIT_ACTIONS.USER_PASSWORD_CHANGED`, `AUDIT_ACTIONS.USER_DATA_EXPORTED`, `MAX_AVATAR_SIZE_BYTES`, `ALLOWED_AVATAR_MIME_TYPES`, `AVATAR_UPLOAD_THROTTLE_MS`, `EXPORT_MAX_ROWS_PER_TABLE`, `EXPORT_FILE_TTL_MS`.

- [ ] **Step 1: Añadir los campos al schema**

En `convex/schema.ts`, dentro de `users: defineTable({...})`, justo después del campo `theme` y antes de `createdAt`:

```ts
    // Preferencias de notificación por familia. Opcional a propósito:
    // `undefined` significa "todo activo", así que ningún usuario existente
    // pierde notificaciones al desplegar el campo. El mapeo tipo → familia
    // vive en src/lib/notifications.ts y lo aplica convex/lib/notify.ts.
    notificationPrefs: v.optional(
      v.object({
        presupuestos: v.boolean(),
        tarjetas: v.boolean(),
        deudasPrestamos: v.boolean(),
        recurrentes: v.boolean(),
        recordatorioDiario: v.boolean(),
        resumenes: v.boolean(),
      })
    ),
    // Avatar subido por el usuario. `imageUrl` (arriba) es el campo heredado de
    // Clerk: se sigue leyendo como respaldo pero ya no se escribe nunca.
    imageStorageId: v.optional(v.id("_storage")),
    // Estrangulador de subidas de avatar (ver users.generateAvatarUploadUrl).
    lastAvatarUploadAt: v.optional(v.number()),
```

- [ ] **Step 2: Añadir las constantes**

En `src/lib/constants.ts`, dentro de `AUDIT_ACTIONS`, junto a `USER_PASSWORD_RESET`:

```ts
  USER_PASSWORD_CHANGED: "user.password.changed",
  USER_DATA_EXPORTED: "user.data.exported",
```

Y un bloque nuevo tras `DEFAULT_ALERT_THRESHOLD`:

```ts
// ─── Avatar de perfil ────────────────────────────────────────────────────────

export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export const ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

// Estrangulador entre dos generaciones de URL de subida del mismo usuario.
// Evita que `generateAvatarUploadUrl` sea un vector de llenado de storage sin
// necesidad de una tabla de rate limiting.
export const AVATAR_UPLOAD_THROTTLE_MS = 10_000;

// ─── Exportación de datos ────────────────────────────────────────────────────

// Cota por tabla del export completo. Las guidelines de Convex prohíben
// `.collect()` sin límite; cuando se alcanza, el export marca esa tabla como
// truncada y la UI lo advierte.
export const EXPORT_MAX_ROWS_PER_TABLE = 10_000;

// Vida del archivo de export en `_storage` antes de su borrado programado.
export const EXPORT_FILE_TTL_MS = 60 * 60 * 1000; // 1 hora
```

- [ ] **Step 3: Sincronizar el schema con el backend**

Run: `npm run dev:convex` (dejarlo correr hasta que imprima que sincronizó, luego detenerlo) o `npx convex dev --once`
Expected: el push del schema pasa sin errores de validación. Los tres campos son opcionales, así que ningún documento existente queda inválido.

- [ ] **Step 4: Verificar tipos y tests**

Run: `npm run typecheck && npm test`
Expected: sin errores, tests en verde.

- [ ] **Step 5: Checkpoint (el usuario commitea)**

Archivos: `convex/schema.ts`, `src/lib/constants.ts`
Mensaje sugerido: `feat: agregar campos de preferencias de notificacion y avatar al schema de usuarios`

---

### Task 4: Funciones Convex de usuario — preferencias, auditoría propia y rate limit de auditoría

**Files:**
- Modify: `convex/lib/rateLimit.ts`
- Modify: `convex/users.ts` (añadir tras `updateName`, ~línea 203)

**Interfaces:**
- Consumes: `DEFAULT_NOTIFICATION_PREFS`, `isNotificationAllowed`, `NotificationType` (Task 2); campos del schema (Task 3); `AUDIT_ACTIONS` (Task 3); `getCurrentUser` de `convex/lib/auth.ts`.
- Produces:
  - `api.users.updateNotificationPrefs({ prefs: Partial<NotificationPrefs> })`
  - `api.users.logSelfAudit({ action: string })`
  - `internal.users.isNotificationEnabledInternal({ userId: string, type: NotificationType }) → boolean` — lo consume la Task 5.
  - `assertAuditRateLimit(ctx, clerkId, opts)` en `convex/lib/rateLimit.ts`.

- [ ] **Step 1: Añadir el limitador sobre `auditLogs`**

En `convex/lib/rateLimit.ts`, tras `assertRateLimit`:

```ts
/**
 * Igual que `assertRateLimit` pero contando filas de `auditLogs` por su índice
 * `by_user`.
 *
 * Hace falta una función aparte porque `assertRateLimit` cuenta filas de
 * `transactions`: aplicarlo a una operación que no crea transacciones limitaría
 * en función de cuántos movimientos registró el usuario, que no tiene relación
 * con la operación que se quiere proteger.
 */
export async function assertAuditRateLimit(
  ctx: MutationCtx,
  clerkId: string,
  opts: { max: number; windowMs: number; message: string }
) {
  const latest = await ctx.db
    .query("auditLogs")
    .withIndex("by_user", (q) => q.eq("userId", clerkId))
    .order("desc")
    .take(opts.max + 1);
  const cutoff = Date.now() - opts.windowMs;
  if (latest.filter((row) => row.createdAt >= cutoff).length >= opts.max) {
    throw new Error(opts.message);
  }
}
```

- [ ] **Step 2: Añadir las funciones a `convex/users.ts`**

Importes a añadir en la cabecera del archivo:

```ts
import {
  DEFAULT_NOTIFICATION_PREFS,
  isNotificationAllowed,
  NOTIFICATION_PREF_KEYS,
  type NotificationType,
} from "../src/lib/notifications";
import { assertAuditRateLimit } from "./lib/rateLimit";
```

(`AUDIT_ACTIONS` ya está importado en la primera línea del archivo.)

Y tras `updateName`:

```ts
/** Actualiza (con merge) las preferencias de notificación del usuario. */
export const updateNotificationPrefs = mutation({
  args: {
    prefs: v.object({
      presupuestos: v.optional(v.boolean()),
      tarjetas: v.optional(v.boolean()),
      deudasPrestamos: v.optional(v.boolean()),
      recurrentes: v.optional(v.boolean()),
      recordatorioDiario: v.optional(v.boolean()),
      resumenes: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { prefs }) => {
    const user = await getCurrentUser(ctx);
    // El merge parte del default "todo activo" cuando el usuario aún no tiene
    // preferencias: así el objeto guardado siempre está completo y el validador
    // del schema (que exige los seis booleanos) se satisface.
    const merged = { ...DEFAULT_NOTIFICATION_PREFS, ...user.notificationPrefs };
    for (const key of NOTIFICATION_PREF_KEYS) {
      const value = prefs[key];
      if (value !== undefined) merged[key] = value;
    }
    await ctx.db.patch(user._id, {
      notificationPrefs: merged,
      updatedAt: Date.now(),
    });
  },
});

// Acciones que el propio usuario puede registrar en `auditLogs` desde el
// cliente. La whitelist es el control: sin ella, un cliente podría inyectar
// entradas de acciones administrativas en el log de auditoría.
const SELF_AUDIT_ACTIONS: readonly string[] = [
  AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
  AUDIT_ACTIONS.USER_DATA_EXPORTED,
];

/**
 * Registra en `auditLogs` una acción del propio usuario. Existe porque el
 * cambio de contraseña ocurre íntegramente dentro de Better Auth, sin pasar por
 * ninguna función de Convex, y CLAUDE.md exige auditar los cambios sensibles.
 *
 * Nunca acepta `targetUserId` ni metadata: siempre escribe `userId` del
 * llamante y una acción de la whitelist.
 */
export const logSelfAudit = mutation({
  args: { action: v.string() },
  handler: async (ctx, { action }) => {
    const user = await getCurrentUser(ctx);
    if (!SELF_AUDIT_ACTIONS.includes(action)) {
      throw new Error("Acción de auditoría no permitida");
    }
    await assertAuditRateLimit(ctx, user.clerkId, {
      max: 10,
      windowMs: 60_000,
      message: "Demasiadas operaciones seguidas. Intenta de nuevo en un minuto.",
    });
    await ctx.db.insert("auditLogs", {
      userId: user.clerkId,
      action,
      entity: "users",
      entityId: user._id,
      createdAt: Date.now(),
    });
  },
});

/**
 * ¿Debe entregarse una notificación de este tipo a este usuario? La consulta
 * `convex/lib/notify.ts` antes de crear la notificación in-app y el push.
 * `userId` es el clerkId, igual que en el resto de tablas de negocio.
 */
export const isNotificationEnabledInternal = internalQuery({
  args: { userId: v.string(), type: v.string() },
  handler: async (ctx, { userId, type }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .unique();
    // Sin fila de usuario no hay preferencias que respetar; se deja pasar para
    // no silenciar notificaciones por un problema de resolución de identidad.
    if (!user) return true;
    return isNotificationAllowed(type as NotificationType, user.notificationPrefs);
  },
});
```

- [ ] **Step 3: Sincronizar y verificar**

Run: `npx convex dev --once && npm run typecheck && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Verificar a mano en el dashboard de Convex**

Ejecutar `api.users.logSelfAudit` con `{ action: "user.role.changed" }` desde el dashboard autenticado como un usuario normal.
Expected: error `Acción de auditoría no permitida`. Con `{ action: "user.password.changed" }`: éxito y una fila nueva en `auditLogs`.

- [ ] **Step 5: Checkpoint (el usuario commitea)**

Archivos: `convex/lib/rateLimit.ts`, `convex/users.ts`
Mensaje sugerido: `feat: agregar preferencias de notificacion y auditoria propia del usuario`

---

### Task 5: `notify()` — punto de control único de notificaciones

**Files:**
- Create: `convex/lib/notify.ts`
- Modify: `convex/actions/sendAlerts.ts`
- Modify: `convex/actions/sendDailyReminder.ts`
- Modify: `convex/actions/sendWeeklySummary.ts`
- Modify: `convex/actions/sendMonthlySummary.ts`
- Modify: `convex/actions/processRecurringTransactions.ts`

**Interfaces:**
- Consumes: `internal.users.isNotificationEnabledInternal` (Task 4), `NotificationType` (Task 2), `internal.notifications.createInternal` y `internal.actions.sendPushNotification.run` (ya existentes).
- Produces: `notify(ctx: ActionCtx, args): Promise<Id<"notifications"> | null>` y `isNotificationEnabled(ctx: ActionCtx, userId: string, type: NotificationType): Promise<boolean>`.

- [ ] **Step 1: Crear `convex/lib/notify.ts`**

```ts
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { NotificationType } from "../../src/lib/notifications";

/**
 * Punto de control único de las notificaciones que generan los crons.
 *
 * Antes, cada aviso repetía el mismo par de llamadas (crear la notificación
 * in-app y disparar el push) en nueve sitios distintos y sin ningún filtro: los
 * jobs empujaban a todo usuario con suscripción. Ahora el par vive acá y pasa
 * primero por las preferencias del usuario.
 *
 * Devuelve el id de la notificación creada, o `null` si el usuario tiene
 * silenciada esa familia (ver src/lib/notifications.ts).
 */
export async function notify(
  ctx: ActionCtx,
  args: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    actionUrl?: string;
    relatedEntityId?: string;
    push: { title: string; body: string };
  }
): Promise<Id<"notifications"> | null> {
  if (!(await isNotificationEnabled(ctx, args.userId, args.type))) return null;

  const notificationId = await ctx.runMutation(internal.notifications.createInternal, {
    userId: args.userId,
    type: args.type,
    title: args.title,
    message: args.message,
    actionUrl: args.actionUrl,
    relatedEntityId: args.relatedEntityId,
  });

  await ctx.runAction(internal.actions.sendPushNotification.run, {
    userId: args.userId,
    title: args.push.title,
    body: args.push.body,
    url: args.actionUrl,
    notificationId,
  });

  return notificationId;
}

/**
 * Consulta suelta de la preferencia, para los call sites que no pueden usar
 * `notify` porque crean la notificación con una mutation propia — hoy solo las
 * alertas de presupuesto, que la crean y marcan el presupuesto como notificado
 * en la misma transacción a propósito.
 */
export async function isNotificationEnabled(
  ctx: ActionCtx,
  userId: string,
  type: NotificationType
): Promise<boolean> {
  return await ctx.runQuery(internal.users.isNotificationEnabledInternal, {
    userId,
    type,
  });
}
```

- [ ] **Step 2: Migrar `sendAlerts.ts` — cuotas de tarjeta**

Añadir el importe `import { notify, isNotificationEnabled } from "../lib/notify";` en la cabecera.

En `checkUpcomingInstallments`, este bloque:

```ts
    const notifId = await ctx.runMutation(internal.notifications.createInternal, {
      userId,
      type: "cuota_proxima",
      title: "Cuota próxima a vencer",
      message: `${cardName} tiene ${cuotaLabel} venciendo en menos de 3 días.`,
      actionUrl: `/tarjetas/${cardId}`,
      relatedEntityId: cardId as string,
    });

    await ctx.runAction(internal.actions.sendPushNotification.run, {
      userId,
      title: "⏰ Cuota próxima a vencer",
      body: `${cardName} — ${cuotaLabel} vence en menos de 3 días.`,
      url: `/tarjetas/${cardId}`,
      notificationId: notifId,
    });
```

pasa a ser:

```ts
    await notify(ctx, {
      userId,
      type: "cuota_proxima",
      title: "Cuota próxima a vencer",
      message: `${cardName} tiene ${cuotaLabel} venciendo en menos de 3 días.`,
      actionUrl: `/tarjetas/${cardId}`,
      relatedEntityId: cardId as string,
      push: {
        title: "⏰ Cuota próxima a vencer",
        body: `${cardName} — ${cuotaLabel} vence en menos de 3 días.`,
      },
    });
```

Los textos se copian **literalmente** del bloque que se reemplaza. Esta tarea no debe cambiar ni un carácter de lo que recibe el usuario: lo único que cambia es que ahora pasa por el filtro de preferencias. Lo mismo aplica a los cuatro avisos del Step 4 y a los cuatro archivos del Step 5 — leer el bloque existente y trasladar sus textos tal cual.

- [ ] **Step 3: Migrar `sendAlerts.ts` — alertas de presupuesto (la excepción)**

`checkBudgetAlerts` usa `internal.notifications.createAndMarkBudgetAlert`, que crea la notificación y marca el presupuesto como notificado en una sola transacción a propósito (un crash entre ambas reenviaría la alerta al día siguiente). Ese bloque **no** pasa por `notify`. En su lugar, justo después de calcular `const type = isOver ? "presupuesto_excedido" : "presupuesto_alerta";`, insertar:

```ts
    // El presupuesto queda sin marcar a propósito: si el usuario reactiva la
    // familia, la alerta vuelve a evaluarse en el siguiente ciclo.
    if (!(await isNotificationEnabled(ctx, budget.userId, type))) continue;
```

El resto del bloque (la mutation atómica y el push) se deja tal cual.

- [ ] **Step 4: Migrar los cuatro avisos restantes de `sendAlerts.ts`**

Aplicar el mismo reemplazo del Step 2 en `checkOverdueDebts` (`deuda_vencida`), `checkUpcomingDebts7Days` (`deuda_proxima`), `checkOverdueLoans` (`prestamo_vencido`) y `checkUpcomingLoans7Days` (`prestamo_proximo`). Conservar los textos existentes y el `relatedEntityId` que cada uno ya pasa.

- [ ] **Step 5: Migrar los otros cuatro archivos**

Mismo reemplazo, un tipo por archivo:

- `convex/actions/sendDailyReminder.ts` → `recordatorio_registro`
- `convex/actions/sendWeeklySummary.ts` → `resumen_semanal`
- `convex/actions/sendMonthlySummary.ts` → `resumen_mensual`
- `convex/actions/processRecurringTransactions.ts` → `transaccion_recurrente`

En `sendDailyReminder.ts` el contador `sent++` debe pasar a contar solo los envíos reales:

```ts
      const notificationId = await notify(ctx, { /* ... */ });
      if (notificationId) sent++;
```

- [ ] **Step 6: Verificar que no queda ningún par sin migrar**

Run: `grep -rn "sendPushNotification.run" convex/actions/`
Expected: **una sola** aparición, la de `checkBudgetAlerts` en `sendAlerts.ts` (la excepción documentada del Step 3). El grep no cubre `convex/lib/notify.ts` porque está fuera de `convex/actions/`. Cualquier otra aparición significa un call site sin migrar.

- [ ] **Step 7: Verificar tipos, lint y tests**

Run: `npx convex dev --once && npm run typecheck && npm run lint && npm test`
Expected: sin errores.

- [ ] **Step 8: Probar los crons a mano**

Desde el dashboard de Convex, ejecutar `internal.actions.sendDailyReminder.run` con el usuario de prueba teniendo `notificationPrefs.recordatorioDiario = false`.
Expected: el log imprime `0 recordatorios enviados` y no aparece ninguna fila nueva en `notifications`. Poniendo la preferencia en `true`, la notificación sí se crea.

- [ ] **Step 9: Checkpoint (el usuario commitea)**

Archivos: `convex/lib/notify.ts` y los cinco archivos de `convex/actions/`
Mensaje sugerido: `feat: filtrar notificaciones de los crons por preferencias del usuario`

---

### Task 6: Backend del avatar

**Files:**
- Modify: `convex/users.ts` (`getMe` al inicio del archivo, y funciones nuevas tras `updateName`)
- Modify: `convex/actions/deleteUserCascade.ts`

**Interfaces:**
- Consumes: constantes de la Task 3, campos del schema de la Task 3.
- Produces:
  - `api.users.getMe` ahora devuelve además `avatarUrl: string | null`.
  - `api.users.generateAvatarUploadUrl() → string`
  - `api.users.updateAvatar({ storageId: Id<"_storage"> })`
  - `api.users.removeAvatar()`

  Los consume la Task 12.

- [ ] **Step 1: Hacer que `getMe` resuelva la URL del avatar**

Reemplazar el handler de `getMe` en `convex/users.ts`:

```ts
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;
    // La URL de storage es temporal, así que se resuelve en cada lectura y no
    // se persiste. `imageUrl` es el campo heredado de Clerk: se sigue leyendo
    // como respaldo para quien aún tenga foto de antes, pero ya no se escribe.
    const avatarUrl = user.imageStorageId
      ? await ctx.storage.getUrl(user.imageStorageId)
      : (user.imageUrl ?? null);
    return { ...user, avatarUrl };
  },
});
```

- [ ] **Step 2: Añadir las tres funciones de avatar**

Importes a añadir en la cabecera de `convex/users.ts`:

```ts
import {
  MAX_AVATAR_SIZE_BYTES,
  ALLOWED_AVATAR_MIME_TYPES,
  AVATAR_UPLOAD_THROTTLE_MS,
} from "../src/lib/constants";
```

Y tras las funciones de la Task 4:

```ts
/**
 * URL de subida para el avatar. Lleva un estrangulador simple por usuario: sin
 * él, un cliente podría pedir URLs en bucle y llenar el storage con archivos
 * que nunca se enlazan a ninguna fila.
 *
 * No se usa `assertRateLimit`: esa función cuenta filas de `transactions`, así
 * que aquí limitaría según cuántos movimientos registró el usuario.
 */
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    if (
      user.lastAvatarUploadAt !== undefined &&
      now - user.lastAvatarUploadAt < AVATAR_UPLOAD_THROTTLE_MS
    ) {
      throw new Error("Espera unos segundos antes de subir otra foto");
    }
    await ctx.db.patch(user._id, { lastAvatarUploadAt: now });
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Enlaza un archivo ya subido como avatar del usuario.
 *
 * La validación de `contentType` es defensa en profundidad, no garantía: el
 * tipo lo declara el cliente al subir y no se verifica por magic bytes. Es el
 * mismo criterio que convex/transactions.ts aplica a los comprobantes.
 */
export const updateAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await getCurrentUser(ctx);
    const meta = await ctx.storage.getMetadata(storageId);

    const invalid =
      !meta ||
      !meta.contentType ||
      !ALLOWED_AVATAR_MIME_TYPES.includes(
        meta.contentType as (typeof ALLOWED_AVATAR_MIME_TYPES)[number]
      ) ||
      meta.size > MAX_AVATAR_SIZE_BYTES;

    if (invalid) {
      // Borrar el archivo rechazado: si no, cada intento fallido deja basura
      // permanente en storage.
      await ctx.storage.delete(storageId);
      throw new Error("La foto debe ser JPEG, PNG o WebP y pesar menos de 2 MB");
    }

    const previous = user.imageStorageId;
    await ctx.db.patch(user._id, { imageStorageId: storageId, updatedAt: Date.now() });
    if (previous) await ctx.storage.delete(previous);
  },
});

/** Quita la foto de perfil y borra el archivo. */
export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user.imageStorageId) return;
    const previous = user.imageStorageId;
    await ctx.db.patch(user._id, { imageStorageId: undefined, updatedAt: Date.now() });
    await ctx.storage.delete(previous);
  },
});
```

- [ ] **Step 3: Borrar el avatar en la cascada de eliminación**

`convex/actions/deleteUserCascade.ts` barre 12 entidades pero no conoce `_storage`. Sin esto, cada usuario eliminado deja su avatar huérfano para siempre.

Añadir a `convex/users.ts` una mutation interna:

```ts
/** Borra el archivo de avatar de un usuario. Usada por la cascada de eliminación. */
export const deleteAvatarFileInternal = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user?.imageStorageId) return;
    await ctx.storage.delete(user.imageStorageId);
    await ctx.db.patch(user._id, { imageStorageId: undefined });
  },
});
```

Y llamarla en `convex/actions/deleteUserCascade.ts` dentro de `run`, **antes** del borrado de la fila del usuario y de las entidades:

```ts
    await ctx.runMutation(internal.users.deleteAvatarFileInternal, { clerkId });
```

- [ ] **Step 4: Verificar**

Run: `npx convex dev --once && npm run typecheck && npm run lint`
Expected: sin errores.

- [ ] **Step 5: Probar los rechazos a mano**

Desde el dashboard de Convex: llamar `api.users.generateAvatarUploadUrl` dos veces seguidas.
Expected: la segunda falla con `Espera unos segundos antes de subir otra foto`.

Subir un PDF a la URL obtenida y llamar `api.users.updateAvatar` con ese `storageId`.
Expected: error sobre el formato, y el archivo desaparece del listado de Files del dashboard.

- [ ] **Step 6: Checkpoint (el usuario commitea)**

Archivos: `convex/users.ts`, `convex/actions/deleteUserCascade.ts`
Mensaje sugerido: `feat: agregar foto de perfil con almacenamiento en convex`

---

### Task 7: Backend del export de datos

**Files:**
- Create: `src/lib/exportPayload.ts`
- Test: `src/lib/__tests__/exportPayload.test.ts`
- Create: `convex/exportData.ts` (internal queries — sin `"use node"`, porque contiene queries)
- Create: `convex/actions/exportMyData.ts` (la action y su limpieza)

**Interfaces:**
- Consumes: `fromCents` de `src/lib/money.ts`, `EXPORT_MAX_ROWS_PER_TABLE` y `EXPORT_FILE_TTL_MS` y `AUDIT_ACTIONS` (Task 3), `getCurrentUserFromAction` de `convex/lib/auth.ts`.
- Produces:
  - `buildTableExport<T extends Record<string, unknown>>(rows: T[], limit: number, moneyFields: readonly string[]): { rows: unknown[]; count: number; truncated: boolean }`
  - `api.actions.exportMyData.run() → { url: string; sizeBytes: number; truncatedTables: string[] }` — lo consume la Task 13.

- [ ] **Step 1: Escribir el test de la lógica pura**

Crear `src/lib/__tests__/exportPayload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTableExport } from "../exportPayload";

describe("buildTableExport", () => {
  const filas = [
    { _id: "a", amount: 150050, description: "Mercado" },
    { _id: "b", amount: 2500, description: "Café" },
  ];

  it("añade el valor humano junto al entero en centavos", () => {
    const resultado = buildTableExport(filas, 10, ["amount"]);
    expect(resultado.rows[0]).toEqual({
      _id: "a",
      amount: 150050,
      amountValue: 1500.5,
      description: "Mercado",
    });
  });

  it("conserva el entero original sin tocarlo", () => {
    const resultado = buildTableExport(filas, 10, ["amount"]);
    expect((resultado.rows[1] as { amount: number }).amount).toBe(2500);
  });

  it("ignora los campos de dinero que no están en la fila", () => {
    const resultado = buildTableExport([{ _id: "x" }], 10, ["amount", "balance"]);
    expect(resultado.rows[0]).toEqual({ _id: "x" });
  });

  it("no marca truncado cuando hay menos filas que el límite", () => {
    const resultado = buildTableExport(filas, 10, []);
    expect(resultado).toMatchObject({ count: 2, truncated: false });
  });

  it("marca truncado cuando se alcanzó el límite exacto", () => {
    const resultado = buildTableExport(filas, 2, []);
    expect(resultado).toMatchObject({ count: 2, truncated: true });
  });

  it("no rompe con una tabla vacía", () => {
    expect(buildTableExport([], 10, ["amount"])).toEqual({
      rows: [],
      count: 0,
      truncated: false,
    });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/__tests__/exportPayload.test.ts`
Expected: FAIL — `Failed to resolve import "../exportPayload"`.

- [ ] **Step 3: Implementar `src/lib/exportPayload.ts`**

```ts
import { fromCents } from "./money";

export type TableExport = {
  rows: unknown[];
  count: number;
  truncated: boolean;
};

/**
 * Prepara las filas de una tabla para el archivo de export.
 *
 * Los montos se emiten dos veces: el entero en centavos tal cual está en la BD
 * (fidelidad exacta, es la convención del proyecto) y su valor humano en un
 * campo `<campo>Value`, para que el archivo se pueda leer sin conocer la
 * convención.
 *
 * `truncated` se marca cuando el número de filas alcanzó el tope de lectura,
 * que es la señal de que pudo quedar historia fuera.
 */
export function buildTableExport<T extends Record<string, unknown>>(
  rows: T[],
  limit: number,
  moneyFields: readonly string[]
): TableExport {
  const mapped = rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const field of moneyFields) {
      const value = row[field];
      if (typeof value === "number") {
        out[`${field}Value`] = fromCents(value);
      }
    }
    return out;
  });

  return {
    rows: mapped,
    count: mapped.length,
    truncated: mapped.length >= limit,
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/__tests__/exportPayload.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Crear las internal queries de lectura**

Crear `convex/exportData.ts`. Cada tabla se lee por su índice de usuario y con cota, según las guidelines de Convex (nunca `.filter()`, nunca `.collect()`):

```ts
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { EXPORT_MAX_ROWS_PER_TABLE } from "../src/lib/constants";

/**
 * Lecturas acotadas por usuario para el export completo de la cuenta.
 *
 * Una internal query por grupo de tablas en vez de una sola: cada query de
 * Convex es una transacción con límite de documentos leídos, y quince tablas
 * con hasta 10 000 filas cada una no caben en una sola.
 */

export const readAccountTables = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const limit = EXPORT_MAX_ROWS_PER_TABLE;
    return {
      accounts: await ctx.db
        .query("accounts")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .take(limit),
      accountShares: await ctx.db
        .query("accountShares")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .take(limit),
      categories: await ctx.db
        .query("categories")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
    };
  },
});

export const readCardTables = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const limit = EXPORT_MAX_ROWS_PER_TABLE;
    return {
      cards: await ctx.db
        .query("cards")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      cardPurchases: await ctx.db
        .query("cardPurchases")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      // cardInstallments no tiene índice `by_user` suelto; `by_user_month`
      // sirve igual porque userId es su primer campo (prefijo del índice).
      cardInstallments: await ctx.db
        .query("cardInstallments")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .take(limit),
    };
  },
});

export const readTransactionTables = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const limit = EXPORT_MAX_ROWS_PER_TABLE;
    return {
      transactions: await ctx.db
        .query("transactions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      recurringTransactions: await ctx.db
        .query("recurringTransactions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      budgets: await ctx.db
        .query("budgets")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .take(limit),
    };
  },
});

export const readDebtTables = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const limit = EXPORT_MAX_ROWS_PER_TABLE;
    return {
      debts: await ctx.db
        .query("debts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      debtPayments: await ctx.db
        .query("debtPayments")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .take(limit),
      loans: await ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      loanRepayments: await ctx.db
        .query("loanRepayments")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .take(limit),
    };
  },
});

export const readGoalTables = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const limit = EXPORT_MAX_ROWS_PER_TABLE;
    return {
      goals: await ctx.db
        .query("goals")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      netWorthSnapshots: await ctx.db
        .query("netWorthSnapshots")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .take(limit),
    };
  },
});
```

- [ ] **Step 6: Crear la action de export**

Crear `convex/actions/exportMyData.ts`. Sin `"use node"`: no usa ningún builtin de Node, y `Blob` y `ctx.storage` están disponibles en el runtime por defecto.

```ts
import { action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getCurrentUserFromAction } from "../lib/auth";
import { buildTableExport } from "../../src/lib/exportPayload";
import {
  EXPORT_MAX_ROWS_PER_TABLE,
  EXPORT_FILE_TTL_MS,
  AUDIT_ACTIONS,
} from "../../src/lib/constants";

/**
 * Campos monetarios por tabla. El export emite cada uno dos veces: el entero
 * en centavos y su valor humano en `<campo>Value` (ver src/lib/exportPayload.ts).
 */
// Nombres verificados uno a uno contra convex/schema.ts. Se excluyen a
// propósito los numéricos que NO son dinero: interestRate, cutoffDay,
// paymentDay, dayOfMonth, displayOrder, contadores de cuotas y timestamps.
const MONEY_FIELDS: Record<string, readonly string[]> = {
  accounts: ["balance", "initialBalance"],
  accountShares: [],
  categories: [],
  cards: ["creditLimit", "currentBalance", "availableCredit", "minimumPayment"],
  cardPurchases: ["totalAmount", "totalWithInterest", "amountPerInstallment", "totalInterest"],
  cardInstallments: ["amount", "principalAmount", "interestAmount", "remainingPrincipal"],
  transactions: ["amount", "toAmount"],
  recurringTransactions: ["amount"],
  budgets: ["amount", "spent"],
  debts: ["originalAmount", "currentBalance", "monthlyPayment"],
  debtPayments: ["amount"],
  loans: ["originalAmount", "currentBalance"],
  loanRepayments: ["amount"],
  goals: ["targetAmount", "currentAmount"],
  netWorthSnapshots: [
    "totalAssets",
    "totalCardDebt",
    "totalDebt",
    "totalLoansReceivable",
    "netWorth",
  ],
};

/**
 * Respaldo completo de la cuenta.
 *
 * El JSON NO se devuelve en el valor de retorno: se guarda en `_storage` y se
 * entrega por URL. Un retorno directo de quince tablas quedaría expuesto al
 * límite de tamaño del valor de retorno de una función de Convex; pasar por
 * storage elimina esa clase de riesgo y además da una URL real de descarga.
 */
export const run = action({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromAction(ctx);
    const userId = user.clerkId;

    const grupos = await Promise.all([
      ctx.runQuery(internal.exportData.readAccountTables, { userId }),
      ctx.runQuery(internal.exportData.readCardTables, { userId }),
      ctx.runQuery(internal.exportData.readTransactionTables, { userId }),
      ctx.runQuery(internal.exportData.readDebtTables, { userId }),
      ctx.runQuery(internal.exportData.readGoalTables, { userId }),
    ]);

    const tablasCrudas = Object.assign({}, ...grupos) as Record<
      string,
      Record<string, unknown>[]
    >;

    const tablas: Record<string, ReturnType<typeof buildTableExport>> = {};
    const truncatedTables: string[] = [];
    for (const [nombre, filas] of Object.entries(tablasCrudas)) {
      const exportada = buildTableExport(
        filas,
        EXPORT_MAX_ROWS_PER_TABLE,
        MONEY_FIELDS[nombre] ?? []
      );
      tablas[nombre] = exportada;
      if (exportada.truncated) truncatedTables.push(nombre);
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      app: "Okany Sync",
      usuario: { email: user.email, name: user.name, currency: user.currency },
      nota:
        "Los montos vienen en dos formas: el campo original es el entero en " +
        "centavos tal cual está almacenado, y el campo '<nombre>Value' es su " +
        "valor decimal equivalente.",
      maxFilasPorTabla: EXPORT_MAX_ROWS_PER_TABLE,
      tablas,
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("No se pudo generar el archivo de exportación");

    // El archivo es temporal: sin este borrado programado, cada exportación
    // dejaría un archivo permanente por usuario.
    await ctx.scheduler.runAfter(
      EXPORT_FILE_TTL_MS,
      internal.actions.exportMyData.cleanup,
      { storageId }
    );

    await ctx.runMutation(internal.users.logAuditAction, {
      userId,
      action: AUDIT_ACTIONS.USER_DATA_EXPORTED,
      metadata: { truncatedTables },
    });

    return { url, sizeBytes: json.length, truncatedTables };
  },
});

/** Borra el archivo temporal de exportación. Programada por `run`. */
export const cleanup = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await ctx.storage.delete(storageId);
  },
});
```

**Nota:** los nombres de `MONEY_FIELDS` ya están verificados contra `convex/schema.ts` y deben copiarse tal cual. No sustituir ninguno por una suposición: un campo inexistente no rompe nada — `buildTableExport` lo ignora — pero deja ese monto sin su valor legible en el archivo.

- [ ] **Step 7: Verificar**

Run: `npx convex dev --once && npm run typecheck && npm run lint && npm test`
Expected: sin errores.

- [ ] **Step 8: Probar el export a mano**

Desde el dashboard de Convex, ejecutar `api.actions.exportMyData.run` autenticado.
Expected: devuelve `{ url, sizeBytes, truncatedTables: [] }`. Abrir la URL: el JSON tiene las quince tablas y los montos con su campo `Value`. En Files del dashboard aparece el archivo; una hora después desaparece.

- [ ] **Step 9: Checkpoint (el usuario commitea)**

Archivos: `src/lib/exportPayload.ts`, `src/lib/__tests__/exportPayload.test.ts`, `convex/exportData.ts`, `convex/actions/exportMyData.ts`
Mensaje sugerido: `feat: agregar exportacion completa de los datos de la cuenta`

---

### Task 8: Dividir la página de perfil en componentes (sin cambio de comportamiento)

**Files:**
- Create: `src/components/perfil/AvatarCard.tsx`
- Create: `src/components/perfil/CurrencyCard.tsx`
- Create: `src/components/perfil/ThemeCard.tsx`
- Create: `src/components/perfil/PushCard.tsx`
- Create: `src/components/perfil/SessionsCard.tsx`
- Create: `src/components/perfil/SignOutButton.tsx`
- Modify: `src/app/(app)/perfil/page.tsx`

**Interfaces:**
- Consumes: `api.users.getMe` (Task 6, ahora con `avatarUrl`).
- Produces: los seis componentes. Sus props:
  - `AvatarCard({ me }: { me: Doc<"users"> & { avatarUrl: string | null } })`
  - `CurrencyCard({ currency }: { currency: string })`
  - `ThemeCard({})`
  - `PushCard({})`
  - `SessionsCard({})`
  - `SignOutButton({})`

  Los consumen las Tasks 9-13.

Esta tarea es **puro movimiento de código**: no cambia ni un comportamiento. Se hace primero porque montar cuatro secciones nuevas sobre el archivo actual lo dejaría en ~700 líneas con nueve responsabilidades.

- [ ] **Step 1: Extraer las tarjetas sin tocar su lógica**

Mover cada bloque de `src/app/(app)/perfil/page.tsx` a su archivo, con `"use client"` en cada uno y llevándose su estado y sus mutations:

- `AvatarCard` ← el bloque `{/* Avatar y nombre */}` con `editingName`, `newName`, `savingName`, `handleNameSave` y `api.users.updateName`.
- `CurrencyCard` ← el bloque `{/* Moneda preferida */}` con `handleCurrencyChange` y `api.users.updateCurrency`.
- `ThemeCard` ← el bloque `{/* Tema */}` con `useTheme`, `handleThemeChange` y `api.users.updateTheme`.
- `PushCard` ← el bloque `{/* Notificaciones push */}` con `usePushNotifications`.
- `SessionsCard` ← la `<section>` de sesiones con `authClient.useSession`, `sessions`, `loadSessions`, `revokingSession`, `handleRevokeSession`, `handleRevokeAllOther` y el tipo `SessionRow`.
- `SignOutButton` ← el bloque de cerrar sesión con `handleSignOut`.

- [ ] **Step 2: Dejar la página como composición**

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarCard } from "@/components/perfil/AvatarCard";
import { CurrencyCard } from "@/components/perfil/CurrencyCard";
import { ThemeCard } from "@/components/perfil/ThemeCard";
import { PushCard } from "@/components/perfil/PushCard";
import { SessionsCard } from "@/components/perfil/SessionsCard";
import { SignOutButton } from "@/components/perfil/SignOutButton";

export default function PerfilPage() {
  const me = useQuery(api.users.getMe);

  if (me === undefined) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Perfil</h1>

      <AvatarCard me={me} />
      <CurrencyCard currency={me?.currency ?? "COP"} />
      <ThemeCard />
      <PushCard />

      <Separator />
      <SessionsCard />
      <Separator />

      <SignOutButton />
    </div>
  );
}
```

- [ ] **Step 3: Verificar que nada cambió**

Run: `npm run dev` (y `npm run dev:convex` en otra terminal), abrir `http://localhost:3000/perfil`
Expected: la página se ve y se comporta exactamente igual que antes: editar el nombre guarda, cambiar moneda muestra el toast, los tres botones de tema funcionan, el switch de push responde, la lista de sesiones carga y "Cerrar otras sesiones" funciona.

- [ ] **Step 4: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores. En particular, el `eslint-disable` de `react-hooks/set-state-in-effect` que hoy está en `page.tsx:51` debe viajar con `loadSessions` a `SessionsCard`.

- [ ] **Step 5: Checkpoint (el usuario commitea)**

Archivos: los seis componentes nuevos y `src/app/(app)/perfil/page.tsx`
Mensaje sugerido: `refactor: dividir la pagina de perfil en componentes por seccion`

---

### Task 9: `PasswordCard` — cambiar o crear contraseña

**Files:**
- Create: `src/components/perfil/PasswordCard.tsx`
- Modify: `src/app/(app)/perfil/page.tsx`
- Modify: `src/components/auth/ResetPasswordForm.tsx`

**Interfaces:**
- Consumes: `authClient` de `src/lib/auth-client.ts`, `api.users.logSelfAudit` (Task 4), `AUDIT_ACTIONS` (Task 3).
- Produces: `PasswordCard({ email }: { email: string })`.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { AUDIT_ACTIONS } from "@/lib/constants";

const MIN_LENGTH = 8;

export function PasswordCard({ email }: { email: string }) {
  const logSelfAudit = useMutation(api.users.logSelfAudit);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelado = false;
    authClient.listAccounts().then(({ data }) => {
      if (cancelado) return;
      // Los usuarios que vienen de la migración entraron por magic link y no
      // tienen cuenta `credential`: para ellos changePassword fallaría con
      // CREDENTIAL_ACCOUNT_NOT_FOUND. Ver docs/migracion-better-auth.md.
      setHasPassword((data ?? []).some((a) => a.providerId === "credential"));
    });
    return () => { cancelado = true; };
  }, []);

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < MIN_LENGTH) {
      toast.error(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres`);
      return;
    }
    if (next !== confirm) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    if (next === current) {
      toast.error("La contraseña nueva debe ser distinta de la actual");
      return;
    }

    setLoading(true);
    // Importante: NO se usa la bandera `revokeOtherSessions` de changePassword.
    // Pese al nombre, su implementación borra TODAS las sesiones (incluida la
    // actual) y crea una nueva con token nuevo, dejando obsoleto el token que
    // useSession() tiene en memoria. El endpoint dedicado sí preserva la sesión
    // actual filtrándola por token.
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
    });
    if (error) {
      setLoading(false);
      toast.error(
        error.code === "INVALID_PASSWORD"
          ? "La contraseña actual no es correcta"
          : (error.message ?? "No se pudo cambiar la contraseña")
      );
      return;
    }

    await authClient.revokeOtherSessions();
    try {
      await logSelfAudit({ action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED });
    } catch {
      // La auditoría es best-effort: no tiene sentido alarmar al usuario ni
      // revertir un cambio de contraseña que ya se aplicó.
    }
    setLoading(false);
    setCurrent(""); setNext(""); setConfirm("");
    toast.success("Contraseña actualizada. Se cerraron tus otras sesiones.");
  }

  async function handleCreate() {
    setLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "No se pudo enviar el correo");
      return;
    }
    toast.success("Te enviamos un correo para definir tu contraseña");
  }

  if (hasPassword === null) {
    return <Skeleton className="h-32 rounded-xl" />;
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Contraseña</h2>
      </div>

      {hasPassword ? (
        <form onSubmit={handleChange} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Contraseña actual</Label>
            <Input id="current-password" type="password" autoComplete="current-password"
              required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Contraseña nueva</Label>
            <Input id="new-password" type="password" autoComplete="new-password"
              required minLength={MIN_LENGTH} value={next}
              onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirmar contraseña nueva</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password"
              required minLength={MIN_LENGTH} value={confirm}
              onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Al cambiarla se cerrarán tus sesiones en otros dispositivos.
          </p>
          <Button type="submit" className="gap-2" disabled={loading}>
            <KeyRound className="h-4 w-4" />
            {loading ? "Guardando…" : "Cambiar contraseña"}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Entras con enlace mágico. Puedes definir una contraseña para iniciar
            sesión sin esperar el correo cada vez.
          </p>
          <Button variant="outline" className="gap-2" onClick={handleCreate} disabled={loading}>
            <KeyRound className="h-4 w-4" />
            {loading ? "Enviando…" : "Crear contraseña"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Montarlo en la página**

En `src/app/(app)/perfil/page.tsx`, importar `PasswordCard` y renderizarlo tras `<ThemeCard />`:

```tsx
      {me?.email && <PasswordCard email={me.email} />}
```

- [ ] **Step 3: Arreglar el destino de `ResetPasswordForm`**

Hoy termina con `router.push("/sign-in")` y no hay middleware que rebote a los autenticados, así que quien llegue desde perfil (con sesión viva) acabaría mirando un formulario de login. En `src/components/auth/ResetPasswordForm.tsx`, tras el `toast.success`:

```tsx
    const { data: session } = await authClient.getSession();
    toast.success("Contraseña definida.");
    router.push(session ? "/" : "/sign-in");
    router.refresh();
```

- [ ] **Step 4: Probar la rama "ya tiene contraseña"**

Con un usuario que tenga contraseña, abrir `/perfil`:
Expected: aparece el formulario de tres campos. Con la contraseña actual mal → toast "La contraseña actual no es correcta". Con todo correcto → toast de éxito, los campos se vacían, y la sesión actual **sigue viva** (recargar la página no expulsa). En otro navegador con sesión del mismo usuario, esa sesión queda cerrada. En `auditLogs` aparece una fila `user.password.changed`.

- [ ] **Step 5: Probar la rama "sin contraseña"**

Con un usuario que solo haya entrado por magic link:
Expected: aparece el texto explicativo y el botón "Crear contraseña". Al pulsarlo llega el correo; el enlace abre `/reset-password`, define la contraseña y redirige a `/` (no a `/sign-in`, porque la sesión sigue activa).

- [ ] **Step 6: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores.

- [ ] **Step 7: Checkpoint (el usuario commitea)**

Archivos: `src/components/perfil/PasswordCard.tsx`, `src/app/(app)/perfil/page.tsx`, `src/components/auth/ResetPasswordForm.tsx`
Mensaje sugerido: `feat: permitir cambiar o crear la contrasena desde el perfil`

---

### Task 10: `NotificationPrefsCard`

**Files:**
- Create: `src/components/perfil/NotificationPrefsCard.tsx`
- Modify: `src/app/(app)/perfil/page.tsx`

**Interfaces:**
- Consumes: `api.users.updateNotificationPrefs` (Task 4); `NOTIFICATION_PREF_KEYS`, `NOTIFICATION_PREF_LABELS`, `DEFAULT_NOTIFICATION_PREFS`, `type NotificationPrefs` (Task 2); `usePushNotifications` (existente).
- Produces: `NotificationPrefsCard({ prefs }: { prefs: NotificationPrefs | undefined })`.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Switch } from "@/components/ui/switch";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  NOTIFICATION_PREF_KEYS,
  NOTIFICATION_PREF_LABELS,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
  type NotificationPrefKey,
} from "@/lib/notifications";

export function NotificationPrefsCard({ prefs }: { prefs: NotificationPrefs | undefined }) {
  const updatePrefs = useMutation(api.users.updateNotificationPrefs);
  const { status: pushStatus } = usePushNotifications();
  const actuales = { ...DEFAULT_NOTIFICATION_PREFS, ...prefs };

  async function handleToggle(key: NotificationPrefKey, value: boolean) {
    try {
      await updatePrefs({ prefs: { [key]: value } });
    } catch {
      toast.error("No se pudo guardar la preferencia");
    }
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Qué quieres que te avisemos</h2>
      </div>

      <ul className="divide-y divide-border">
        {NOTIFICATION_PREF_KEYS.map((key) => (
          <li key={key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {NOTIFICATION_PREF_LABELS[key].title}
              </p>
              <p className="text-xs text-muted-foreground">
                {NOTIFICATION_PREF_LABELS[key].description}
              </p>
            </div>
            <Switch
              id={`pref-${key}`}
              aria-label={NOTIFICATION_PREF_LABELS[key].title}
              checked={actuales[key]}
              onCheckedChange={(v) => handleToggle(key, v)}
            />
          </li>
        ))}
      </ul>

      {/* Los switches NUNCA se deshabilitan: estas preferencias gobiernan
          también la notificación dentro de la app, así que siguen teniendo
          efecto aunque el push esté apagado en este dispositivo. */}
      {pushStatus !== "subscribed" && (
        <p className="text-xs text-muted-foreground">
          El push está desactivado en este dispositivo. Estas preferencias
          siguen aplicando a las notificaciones dentro de la app.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Los avisos sobre cuentas compartidas y cambios en tu acceso no se pueden
        silenciar: requieren que hagas algo.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Montarlo en la página**

Importarlo y renderizarlo justo después de `<PushCard />`:

```tsx
      <NotificationPrefsCard prefs={me?.notificationPrefs} />
```

- [ ] **Step 3: Probar**

Abrir `/perfil`:
Expected: seis switches, todos activos en un usuario sin preferencias guardadas. Apagar "Resúmenes" y recargar: sigue apagado. En el dashboard de Convex, la fila del usuario tiene `notificationPrefs` con los seis booleanos y `resumenes: false`.

- [ ] **Step 4: Verificar el efecto real**

Con "Recordatorio diario" apagado, ejecutar `internal.actions.sendDailyReminder.run` desde el dashboard.
Expected: no se crea notificación para ese usuario (es la verificación de extremo a extremo de la Task 5).

- [ ] **Step 5: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Checkpoint (el usuario commitea)**

Archivos: `src/components/perfil/NotificationPrefsCard.tsx`, `src/app/(app)/perfil/page.tsx`
Mensaje sugerido: `feat: agregar preferencias de notificacion por tipo en el perfil`

---

### Task 11: `SessionsCard` con dispositivo real

**Files:**
- Modify: `src/components/perfil/SessionsCard.tsx` (creado en la Task 8)

**Interfaces:**
- Consumes: `parseUserAgent` y `formatDevice` (Task 1).
- Produces: nada nuevo.

- [ ] **Step 1: Arreglar el orden**

El comparador actual ignora su segundo argumento, así que no ordena de forma estable. Reemplazarlo:

```ts
  // Antes: [...sessions].sort((a) => (a.token === currentToken ? -1 : 1))
  const sortedSessions = sessions
    ? [...sessions].sort(
        (a, b) =>
          Number(b.token === currentToken) - Number(a.token === currentToken)
      )
    : null;
```

- [ ] **Step 2: Mostrar el dispositivo**

Importar `import { parseUserAgent, formatDevice } from "@/lib/userAgent";` y `import { Monitor } from "lucide-react";`, y reemplazar el contenido de cada `<li>`:

```tsx
{sortedSessions.map((session, idx) => {
  const device = parseUserAgent(session.userAgent);
  const DeviceIcon = device.isMobile ? Smartphone : Monitor;
  return (
    <li key={session.id} className="flex items-center gap-3 px-4 py-3">
      <DeviceIcon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-foreground truncate">{formatDevice(device)}</p>
          {idx === 0 && <Badge variant="secondary" className="text-[10px]">Actual</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {formatRelative(new Date(session.updatedAt).getTime())}
          {/* `ipAddress` puede venir vacío: Better Auth lo deriva de cabeceras
              tipo x-forwarded-for y no está verificado que Convex las reenvíe.
              Cuando falta no se escribe nada, en vez de un "IP desconocida". */}
          {session.ipAddress ? ` · ${session.ipAddress}` : ""}
        </p>
      </div>
      {idx !== 0 && (
        <button
          type="button"
          onClick={() => handleRevokeSession(session.token)}
          disabled={revokingSession === session.token}
          className="text-xs text-danger hover:underline disabled:opacity-50 shrink-0"
        >
          {revokingSession === session.token ? "Cerrando…" : "Cerrar"}
        </button>
      )}
    </li>
  );
})}
```

- [ ] **Step 3: Probar con dos navegadores**

Iniciar sesión con el mismo usuario en dos navegadores distintos y abrir `/perfil`:
Expected: dos filas con etiquetas reales ("Chrome · macOS", "Safari · iOS"), la actual arriba con el badge. Si `ipAddress` llega vacío, la línea secundaria solo muestra la fecha relativa, sin un `·` colgando. Cerrar la otra sesión la elimina de la lista.

- [ ] **Step 4: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Checkpoint (el usuario commitea)**

Archivos: `src/components/perfil/SessionsCard.tsx`
Mensaje sugerido: `feat: mostrar navegador y sistema operativo en las sesiones activas`

---

### Task 12: `AvatarCard` con subida y `AccountInfoCard`

**Files:**
- Modify: `src/components/perfil/AvatarCard.tsx` (creado en la Task 8)
- Create: `src/components/perfil/AccountInfoCard.tsx`
- Modify: `src/app/(app)/perfil/page.tsx`

**Interfaces:**
- Consumes: `api.users.generateAvatarUploadUrl`, `api.users.updateAvatar`, `api.users.removeAvatar`, `me.avatarUrl` (Task 6); `MAX_AVATAR_SIZE_BYTES`, `ALLOWED_AVATAR_MIME_TYPES` (Task 3).
- Produces: `AccountInfoCard({ me })`.

- [ ] **Step 1: Añadir la subida a `AvatarCard`**

Añadir al componente (conservando el nombre editable que ya tiene):

```tsx
  const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const updateAvatar = useMutation(api.users.updateAvatar);
  const removeAvatar = useMutation(api.users.removeAvatar);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;

    // Validación en cliente para dar un mensaje inmediato; la de verdad está en
    // convex/users.ts::updateAvatar, que además borra el archivo si no pasa.
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type as (typeof ALLOWED_AVATAR_MIME_TYPES)[number])) {
      toast.error("La foto debe ser JPEG, PNG o WebP");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error("La foto no puede pesar más de 2 MB");
      return;
    }

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await updateAvatar({ storageId });
      toast.success("Foto actualizada");
    } catch (error) {
      toast.error(error instanceof Error && error.message !== "upload failed"
        ? error.message
        : "No se pudo subir la foto");
    } finally {
      setUploading(false);
    }
  }
```

Y reemplazar el `<span>` de la inicial por:

```tsx
  <div className="relative shrink-0">
    {me.avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Convex storage, no optimizable por next/image
      <img src={me.avatarUrl} alt="" aria-hidden
        className="h-14 w-14 rounded-2xl object-cover" />
    ) : (
      <span aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white"
        style={{ background: "linear-gradient(135deg, var(--os-magenta), oklch(0.32 0.14 20))" }}>
        {me.name?.trim().charAt(0).toUpperCase() ?? "U"}
      </span>
    )}
    <button type="button" onClick={() => fileInputRef.current?.click()}
      disabled={uploading}
      aria-label="Cambiar foto de perfil"
      className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-50">
      <Camera className="h-3 w-3" aria-hidden="true" />
    </button>
    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
      className="sr-only" onChange={handleFile} />
  </div>
```

Y, cuando hay foto, un enlace para quitarla bajo el email:

```tsx
  {me.avatarUrl && (
    <button type="button" onClick={() => removeAvatar()}
      className="text-xs text-danger hover:underline">
      Quitar foto
    </button>
  )}
```

Importes nuevos: `useRef`, `Camera` de `lucide-react`, `Id` de `convex/_generated/dataModel`, y las dos constantes.

- [ ] **Step 2: Crear `AccountInfoCard`**

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Mail, Shield, CalendarDays } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

export function AccountInfoCard({ me }: { me: Doc<"users"> }) {
  const filas = [
    { icon: Mail, label: "Correo", value: me.email },
    { icon: CalendarDays, label: "Cuenta creada", value: formatDate(me.createdAt) },
    { icon: CalendarDays, label: "Última actualización", value: formatDate(me.updatedAt) },
  ];

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Datos de la cuenta</h2>
        {me.role === "admin" && <Badge variant="secondary" className="text-[10px]">Administrador</Badge>}
      </div>
      <dl className="divide-y divide-border">
        {filas.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 py-2.5">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <dt className="text-sm text-muted-foreground flex-1">{label}</dt>
            <dd className="text-sm text-foreground truncate">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

Verificar que `formatDate` existe en `src/lib/utils.ts` con esa firma (`grep -n "export function formatDate" src/lib/utils.ts`). Si el nombre difiere, usar el que haya en vez de crear uno nuevo.

- [ ] **Step 3: Montar `AccountInfoCard` en la página**

Renderizarlo justo después de `<AvatarCard me={me} />`.

- [ ] **Step 4: Probar**

Abrir `/perfil`:
Expected: el botón de cámara abre el selector. Subir un JPEG < 2 MB muestra la foto inmediatamente (la query es reactiva). Subir un PDF muestra el toast de formato sin llegar al servidor. "Quitar foto" vuelve a la inicial. Subir dos fotos seguidas muy rápido muestra "Espera unos segundos". Reemplazar una foto deja **un solo** archivo en Files del dashboard, no dos.

- [ ] **Step 5: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Checkpoint (el usuario commitea)**

Archivos: `src/components/perfil/AvatarCard.tsx`, `src/components/perfil/AccountInfoCard.tsx`, `src/app/(app)/perfil/page.tsx`
Mensaje sugerido: `feat: agregar foto de perfil y datos de la cuenta al perfil`

---

### Task 13: `ExportDataCard`

**Files:**
- Create: `src/components/perfil/ExportDataCard.tsx`
- Modify: `src/app/(app)/perfil/page.tsx`

**Interfaces:**
- Consumes: `api.actions.exportMyData.run` (Task 7).
- Produces: `ExportDataCard({})`.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ExportDataCard() {
  const exportMyData = useAction(api.actions.exportMyData.run);
  const [loading, setLoading] = useState(false);
  const [truncadas, setTruncadas] = useState<string[]>([]);

  async function handleExport() {
    setLoading(true);
    setTruncadas([]);
    try {
      const { url, truncatedTables } = await exportMyData();
      setTruncadas(truncatedTables);
      const a = document.createElement("a");
      a.href = url;
      a.download = `okany-sync-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Descarga lista");
    } catch {
      toast.error("No se pudo generar la exportación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Exportar mis datos</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Descarga un archivo JSON con tus cuentas, movimientos, tarjetas, deudas,
        préstamos, presupuestos y metas. El enlace caduca en una hora.
      </p>
      <Button variant="outline" className="gap-2" onClick={handleExport} disabled={loading}>
        <Download className="h-4 w-4" />
        {loading ? "Preparando…" : "Descargar respaldo"}
      </Button>
      {truncadas.length > 0 && (
        <p className="text-xs text-warning" role="alert">
          El respaldo quedó incompleto en: {truncadas.join(", ")}. Se exportaron
          las primeras 10 000 filas de cada una.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Montarlo en la página**

Renderizarlo tras `<SessionsCard />`, antes del `<Separator />` final.

- [ ] **Step 3: Probar**

Pulsar "Descargar respaldo":
Expected: el navegador descarga un `.json` con las quince tablas, cada una con `rows`, `count` y `truncated`. Los montos traen su campo `Value`. No aparece la advertencia de truncado en una cuenta normal.

- [ ] **Step 4: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Checkpoint (el usuario commitea)**

Archivos: `src/components/perfil/ExportDataCard.tsx`, `src/app/(app)/perfil/page.tsx`
Mensaje sugerido: `feat: agregar descarga del respaldo completo de la cuenta`

---

### Task 14: Verificación final y documentación

**Files:**
- Modify: `src/app/(app)/mas/page.tsx` (la descripción de "Mi perfil", línea ~22)
- Modify: `CLAUDE.md` (sección de módulos, si aplica)

- [ ] **Step 1: Actualizar la descripción del enlace a perfil**

En `ACCOUNT_LINKS` de `src/app/(app)/mas/page.tsx`, la entrada de `/perfil` dice `"Nombre, moneda, tema, sesiones"`. Cambiarla a:

```ts
{ href: "/perfil", icon: User, label: "Mi perfil", desc: "Contraseña, notificaciones, foto, sesiones y respaldo" },
```

- [ ] **Step 2: Correr la verificación completa**

Run: `npm test && npm run lint && npm run typecheck && npm run typecheck:sw && npm run build`
Expected: todo en verde. Ningún paso se puede dar por bueno sin ver su salida.

- [ ] **Step 3: Recorrido manual de extremo a extremo**

Con `npm run dev` y `npm run dev:convex` corriendo, en `/perfil`:

1. Cambiar la foto, y quitarla.
2. Editar el nombre.
3. Cambiar la moneda y el tema.
4. Cambiar la contraseña y confirmar que la sesión actual sobrevive.
5. Apagar una familia de notificaciones y verificar con el cron correspondiente desde el dashboard.
6. Ver la lista de sesiones con dos navegadores y cerrar una.
7. Descargar el respaldo y abrir el JSON.

- [ ] **Step 4: Anotar en CLAUDE.md lo que cambió de forma estructural**

Añadir a la lista de módulos de Convex `exportData`, y en la sección de convenciones una línea sobre el punto de control de notificaciones:

```md
### Notificaciones

Toda notificación generada por un cron pasa por `convex/lib/notify.ts::notify`,
que consulta las preferencias del usuario (`users.notificationPrefs`) antes de
crear la notificación in-app y disparar el push. El mapeo tipo → familia vive en
`src/lib/notifications.ts`. Las alertas de presupuesto son la única excepción:
usan una mutation atómica propia y consultan la preferencia por separado.
```

- [ ] **Step 5: Checkpoint final (el usuario commitea)**

Archivos: `src/app/(app)/mas/page.tsx`, `CLAUDE.md`
Mensaje sugerido: `docs: documentar el punto de control de notificaciones y actualizar el enlace a perfil`

---

## Notas de ejecución

- **Orden:** las Tasks 1-7 son backend y lógica pura, y se pueden hacer en paralelo entre sí salvo que la 4 depende de la 2 y la 3, la 5 depende de la 4, y la 6 y 7 dependen de la 3. Las Tasks 8-13 son frontend y **la 8 debe ir antes que las 9-13**, porque todas montan sobre los componentes que ella crea.
- **Nada de commits automáticos.** Cada "Checkpoint" solo informa al usuario de qué tocó y qué mensaje sugiere. Es una regla dura de `CLAUDE.md` y de las reglas globales del usuario.
- **Si un paso de verificación falla, parar.** No seguir a la tarea siguiente con tests o tipos en rojo.
