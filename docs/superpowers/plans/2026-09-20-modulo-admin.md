# Plan de implementación — Módulo admin

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

> **REGLA QUE ANULA A LA SKILL — NO HACER COMMITS.** `CLAUDE.md` del proyecto y las reglas globales del usuario prohíben a Claude ejecutar `git commit` o `git push` bajo cualquier circunstancia salvo petición explícita en ese mismo mensaje. Este plan sustituye el paso «Commit» habitual por un paso de **verificación**. Al terminar cada tarea, informa al usuario de que está lista para commitear; el commit lo hace él.

**Objetivo:** rehacer el panel de administración para que responda «¿está todo bien?» de un vistazo, dar visibilidad del uso por usuario, y corregir cinco defectos encontrados al inventariar el módulo.

**Arquitectura:** tres añadidos aditivos al esquema (`users.lastSeenAt`, `cronRuns`, `userStats`). Los contadores se materializan por **recálculo** —un cron diario más recálculo bajo demanda— en lugar de incrementarse en cada escritura, para que no puedan desincronizarse. Los ocho crons pasan por un despachador único que registra su latido. La lógica que *decide* (si un cron va atrasado, si una tasa está rancia, si una cuenta está dormida) se extrae a funciones puras en `src/lib/` porque es lo único que este repositorio sabe testear.

**Stack:** Next.js 16 (App Router, React 19), Convex, Tailwind v4, Framer Motion, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-20-modulo-admin-design.md`

## Restricciones globales

- **Privacidad:** ninguna superficie del panel expone importes, saldos, descripciones ni categorías. Solo conteos y fechas.
- **Lenguaje visual:** `PageContainer` variante `wide`; tarjetas con `GLASS_SURFACE` y `rounded-[24px]`; chips de icono con `tint(color, 16)` sobre tokens `--os-lime|cyan|magenta|orange|violet|yellow`; secciones encabezadas con `FIELD_LABEL`; entrada escalonada con `EASE_OUT_EXPO` y `delay: Math.min(index,10)*0.04`; `useReducedMotion()` respetado. Referencias: `src/lib/ios.ts`, `src/components/perfil/SettingsCard.tsx`.
- **Color semántico separado del acento de marca:** estado bien/atención/fallo usa `--success|--warning|--danger`, nunca el lima de marca.
- **Tope de conteo:** `STATS_COUNT_CAP = 10_000` por tabla y usuario. Si se alcanza, la interfaz muestra `10 000+`, nunca una cifra exacta falsa.
- **Corte de paginación en servidor:** 500 usuarios. Por debajo, filtrado en cliente sobre la proyección.
- **Gestor de paquetes:** `pnpm`. Nunca `npm install` ni `bun install`.
- **Verificación estándar de cada tarea:** `pnpm typecheck && pnpm lint && pnpm test`. Las tareas que tocan Convex añaden `npx convex codegen`.
- **Convex:** una action nueva va en un módulo normal de `convex/`, NO en `convex/actions/` (carpeta deprecada que exige `"use node"`).

---

# Fase 1 — Defectos críticos

Van primero porque uno es de seguridad y otro deja a una persona invitada sin poder entrar jamás. Son independientes entre sí y del resto del plan.

### Tarea 1: Cerrar `setManualRate` a administradores

Cualquier usuario autenticado puede hoy sobrescribir `currentExchangeRates`, una tabla **global** de la que depende la consolidación multi-moneda del dashboard de todos.

**Archivos:**
- Modificar: `convex/exchangeRates.ts:76-96`

**Interfaces:**
- Produce: `api.exchangeRates.setManualRate` con la misma firma, ahora restringida a admin.

- [ ] **Paso 1: Cambiar el guard**

En `convex/exchangeRates.ts`, dentro de `setManualRate`, sustituir la línea `const user = await getCurrentUser(ctx);` por:

```ts
    // assertAdmin y no getCurrentUser: `currentExchangeRates` es una tabla
    // GLOBAL, no del usuario. Con el guard anterior, cualquier usuario activo
    // podía falsear la conversión multi-moneda del dashboard de todos los demás.
    const user = await assertAdmin(ctx);
```

- [ ] **Paso 2: Ajustar el import**

Comprobar la línea de import de `./lib/auth` en la cabecera del archivo y añadir `assertAdmin`. Si `getCurrentUser` deja de usarse en el archivo, quitarlo del import.

Verificar: `grep -n "getCurrentUser\|assertAdmin" convex/exchangeRates.ts`

- [ ] **Paso 3: Comprobar que ninguna UI de usuario normal lo llamaba**

Run: `grep -rn "setManualRate" src/`

Esperado: sin resultados. Si aparece alguno, ese componente vive en una ruta de usuario y hay que moverlo o eliminarlo — anótalo y consulta antes de seguir.

- [ ] **Paso 4: Verificar**

Run: `npx convex codegen && pnpm typecheck && pnpm lint`
Esperado: sin errores.

Informa al usuario: tarea lista para commitear.

---

### Tarea 2: Normalizar el correo de las invitaciones

`createFromAdmin` guarda el correo **tal como lo teclea el admin**, y `ensureExists` lo busca con el correo que entrega el proveedor de identidad. Si difieren en mayúsculas, la invitación queda `pending` para siempre y su titular **no puede entrar nunca**. Hay que arreglar escritura, lectura y las filas ya existentes; con solo una de las tres no se corrige.

**Archivos:**
- Modificar: `convex/invitations.ts:5-26`
- Modificar: `convex/users.ts:121-126`
- Modificar: `convex/migrations.ts` (añadir migración al final)

**Interfaces:**
- Produce: `internal.migrations.normalizeInvitationEmails` — migración idempotente sin argumentos.

- [ ] **Paso 1: Normalizar en la escritura**

En `convex/invitations.ts`, dentro de `createFromAdmin`, antes de la consulta:

```ts
    // El correo se guarda y se busca SIEMPRE en minúsculas y sin espacios.
    // Antes se guardaba tal cual lo tecleaba el admin y se buscaba con el que
    // entrega el proveedor de identidad: si diferían en mayúsculas, la
    // invitación quedaba pendiente para siempre y su titular no podía entrar.
    const email = args.email.toLowerCase().trim();
```

Sustituir los dos usos de `args.email` (el `q.eq("email", args.email)` y el `email: args.email` del insert) por `email`.

- [ ] **Paso 2: Normalizar en la lectura**

En `convex/users.ts`, dentro de `ensureExists`, sustituir:

```ts
    const email = identity.email ?? "";
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
```

por:

```ts
    const email = identity.email ?? "";
    // `normalizedEmail` ya está calculado más arriba en este handler. La
    // invitación se busca con él porque es como se guarda desde
    // invitations.createFromAdmin.
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
```

Dejar `email` intacto para el resto del handler: es el que se guarda en `users.email` y ese comportamiento no cambia en esta tarea.

- [ ] **Paso 3: Migrar las filas existentes**

Añadir al final de `convex/migrations.ts`:

```ts
/**
 * Pasa a minúsculas el correo de las invitaciones ya guardadas.
 *
 * Sin esto, una invitación creada antes del arreglo con mayúsculas distintas a
 * las del proveedor de identidad sigue sin poder encontrarse, y su titular
 * sigue sin poder entrar. Idempotente: las que ya están normalizadas no se tocan.
 */
export const normalizeInvitationEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("invitations").collect();
    let changed = 0;
    for (const inv of all) {
      const normalized = inv.email.toLowerCase().trim();
      if (normalized === inv.email) continue;
      await ctx.db.patch(inv._id, { email: normalized });
      changed++;
    }
    return { total: all.length, changed };
  },
});
```

Comprobar que `internalMutation` ya está importado en ese archivo; si no, añadirlo.

- [ ] **Paso 4: Ejecutar la migración**

Run: `npx convex codegen && npx convex run migrations:normalizeInvitationEmails '{}'`
Esperado: un objeto `{ total, changed }`. Anota los números.

- [ ] **Paso 5: Verificar idempotencia**

Run: `npx convex run migrations:normalizeInvitationEmails '{}'`
Esperado: `changed: 0`. Si no es 0, la migración no es idempotente — detente y revisa.

- [ ] **Paso 6: Verificar**

Run: `pnpm typecheck && pnpm lint`

Informa al usuario: tarea lista para commitear.

---

### Tarea 3: Cerrar el panel a administradores desactivados

`listAll` y `adminStats` comprueban el rol en línea con `getCurrentUserOrNull`, que **no valida `active`**, así que un admin desactivado sigue recibiendo la lista completa de usuarios. El layout tiene el mismo hueco.

**Archivos:**
- Modificar: `convex/users.ts:445-475` (`listAll` y `adminStats`)
- Modificar: `src/app/(app)/admin/layout.tsx:10-13`

- [ ] **Paso 1: Usar `assertAdmin` en las dos queries**

En `convex/users.ts`, en `listAll` y en `adminStats`, sustituir la comprobación de rol en línea por `await assertAdmin(ctx);` al principio del handler, y eliminar los retornos de `[]` / `null` para no-admin: `assertAdmin` ya lanza.

Añadir sobre `listAll`:

```ts
/**
 * `assertAdmin` y no una comprobación de rol en línea: la versión anterior
 * usaba getCurrentUserOrNull, que NO valida `active`, así que un administrador
 * desactivado seguía recibiendo la lista completa de usuarios.
 */
```

- [ ] **Paso 2: Adaptar los consumidores al cambio de contrato**

Las queries ahora lanzan en vez de devolver `[]`/`null`. Comprobar quién las consume:

Run: `grep -rn "users.listAll\|users.adminStats" src/`

En cada componente encontrado, el `useQuery` pasa a poder fallar. Como el layout ya impide que un no-admin llegue a esas páginas, el único caso real es el admin desactivado, y ahí el error es el comportamiento correcto. No añadir capturas que lo oculten.

- [ ] **Paso 3: Comprobar `active` en el layout**

En `src/app/(app)/admin/layout.tsx`, sustituir la comprobación de rol por:

```tsx
  // Se comprueba `active` además del rol: getMe usa getCurrentUserOrNull, que
  // no lo valida, así que sin esta línea un administrador desactivado entraba
  // al panel y solo fallaban las secciones cuyo backend sí usa assertAdmin.
  if (!me) redirect("/login");
  if (me.role !== "admin" || !me.active) redirect("/dashboard");
```

- [ ] **Paso 4: Verificar**

Run: `npx convex codegen && pnpm typecheck && pnpm lint && pnpm build`

Informa al usuario: tarea lista para commitear.

---

### Tarea 4: Tabla única y completa de etiquetas de auditoría

La tabla está duplicada en `admin/page.tsx:12` y `users/[id]/page.tsx:25`, y entre las dos faltan ocho acciones que hoy se pintan como texto crudo.

**Archivos:**
- Modificar: `src/lib/constants.ts`
- Modificar: `src/app/(app)/admin/page.tsx:12-25`
- Modificar: `src/app/(app)/admin/users/[id]/page.tsx:25-38`
- Crear: `src/lib/__tests__/auditLabels.test.ts`

**Interfaces:**
- Produce: `AUDIT_ACTION_LABELS: Record<string, string>` exportado de `src/lib/constants.ts`.

- [ ] **Paso 1: Escribir el test que falla**

Crear `src/lib/__tests__/auditLabels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS } from "@/lib/constants";

describe("AUDIT_ACTION_LABELS", () => {
  it("tiene etiqueta para todas las acciones declaradas", () => {
    const sinEtiqueta = Object.values(AUDIT_ACTIONS).filter(
      (accion) => !(accion in AUDIT_ACTION_LABELS),
    );
    expect(sinEtiqueta).toEqual([]);
  });

  it("no define etiquetas para acciones que no existen", () => {
    const acciones = new Set<string>(Object.values(AUDIT_ACTIONS));
    const sobrantes = Object.keys(AUDIT_ACTION_LABELS).filter((k) => !acciones.has(k));
    expect(sobrantes).toEqual([]);
  });
});
```

- [ ] **Paso 2: Ejecutar el test y ver que falla**

Run: `pnpm vitest run src/lib/__tests__/auditLabels.test.ts`
Esperado: FALLA con «AUDIT_ACTION_LABELS is not exported» o similar.

- [ ] **Paso 3: Añadir la tabla a constants.ts**

Justo debajo de `AUDIT_ACTIONS` en `src/lib/constants.ts`:

```ts
/**
 * Texto legible de cada acción de auditoría.
 *
 * Vive junto a AUDIT_ACTIONS y no en los componentes porque estaba duplicada en
 * dos pantallas del panel y a las dos les faltaban acciones, así que el
 * historial mostraba identificadores crudos como `user.data.reset`. Un test
 * comprueba que cubre exactamente las acciones declaradas, ni más ni menos.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.USER_CREATED]: "Usuario creado",
  [AUDIT_ACTIONS.USER_INVITED]: "Usuario invitado",
  [AUDIT_ACTIONS.USER_UPDATED]: "Usuario actualizado",
  [AUDIT_ACTIONS.USER_DELETED]: "Usuario eliminado",
  [AUDIT_ACTIONS.USER_DEACTIVATED]: "Usuario desactivado",
  [AUDIT_ACTIONS.USER_ROLE_CHANGED]: "Rol cambiado",
  [AUDIT_ACTIONS.USER_DATA_RESET]: "Datos restablecidos de fábrica",
  [AUDIT_ACTIONS.ACCOUNT_CREATED]: "Cuenta creada",
  [AUDIT_ACTIONS.ACCOUNT_DELETED]: "Cuenta eliminada",
  [AUDIT_ACTIONS.ACCOUNT_SHARED]: "Cuenta compartida",
  [AUDIT_ACTIONS.ACCOUNT_SHARE_REVOKED]: "Acceso revocado",
  [AUDIT_ACTIONS.ACCOUNT_SHARE_ACCEPTED]: "Acceso aceptado",
  [AUDIT_ACTIONS.ACCOUNT_SHARE_REJECTED]: "Acceso rechazado",
  [AUDIT_ACTIONS.ACCOUNT_BALANCE_REASSIGNED]: "Saldo reasignado",
  [AUDIT_ACTIONS.CARD_CREATED]: "Tarjeta creada",
  [AUDIT_ACTIONS.CARD_DELETED]: "Tarjeta eliminada",
  [AUDIT_ACTIONS.ADMIN_EXPORT]: "Exportación de administrador",
};
```

**Importante:** abre `src/lib/constants.ts` y comprueba las claves reales de `AUDIT_ACTIONS`. Si hay alguna que no aparece arriba (el inventario detectó también `user.password.changed` y `user.data.exported`), añádela con su texto; el test fallará hasta que estén todas. No inventes claves que no existan: el segundo test lo detecta.

- [ ] **Paso 4: Ejecutar el test y ver que pasa**

Run: `pnpm vitest run src/lib/__tests__/auditLabels.test.ts`
Esperado: 2 tests en verde.

- [ ] **Paso 5: Eliminar las dos copias**

En `src/app/(app)/admin/page.tsx` y `src/app/(app)/admin/users/[id]/page.tsx`, borrar la constante local y sustituirla por `import { AUDIT_ACTION_LABELS } from "@/lib/constants";`.

En el punto donde se renderiza, usar `AUDIT_ACTION_LABELS[log.action] ?? log.action` para que una acción futura sin etiqueta degrade a su identificador en vez de a `undefined`.

- [ ] **Paso 6: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Informa al usuario: tarea lista para commitear.

---

# Fase 2 — Cimientos de datos

### Tarea 5: `users.lastSeenAt` con acelerador

Sin este campo, «quién usa la app» no tiene dato: la tarjeta «Activos» de hoy cuenta el booleano `active`, que solo dice si la cuenta está habilitada.

**Archivos:**
- Modificar: `convex/schema.ts` (tabla `users`)
- Modificar: `convex/users.ts::ensureExists`
- Crear: `src/lib/__tests__/adminHealth.test.ts` (solo el caso del acelerador; la tarea 8 amplía el archivo)
- Crear: `src/lib/adminHealth.ts`

**Interfaces:**
- Produce: `shouldRefreshLastSeen(previous: number | undefined, now: number): boolean` en `src/lib/adminHealth.ts`.
- Produce: campo `users.lastSeenAt?: number`.

- [ ] **Paso 1: Escribir el test que falla**

Crear `src/lib/__tests__/adminHealth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldRefreshLastSeen, LAST_SEEN_THROTTLE_MS } from "@/lib/adminHealth";

describe("shouldRefreshLastSeen", () => {
  const ahora = 1_800_000_000_000;

  it("escribe la primera vez, cuando no hay valor previo", () => {
    expect(shouldRefreshLastSeen(undefined, ahora)).toBe(true);
  });

  it("no escribe si el valor previo es reciente", () => {
    expect(shouldRefreshLastSeen(ahora - 60_000, ahora)).toBe(false);
  });

  it("escribe cuando el valor previo supera el umbral", () => {
    expect(shouldRefreshLastSeen(ahora - LAST_SEEN_THROTTLE_MS - 1, ahora)).toBe(true);
  });

  it("no escribe justo en el umbral, para no rebotar en el límite", () => {
    expect(shouldRefreshLastSeen(ahora - LAST_SEEN_THROTTLE_MS, ahora)).toBe(false);
  });

  it("escribe si el reloj del cliente dejó una marca en el futuro", () => {
    expect(shouldRefreshLastSeen(ahora + 60_000, ahora)).toBe(true);
  });
});
```

- [ ] **Paso 2: Ejecutar el test y ver que falla**

Run: `pnpm vitest run src/lib/__tests__/adminHealth.test.ts`
Esperado: FALLA — el módulo no existe.

- [ ] **Paso 3: Implementar**

Crear `src/lib/adminHealth.ts`:

```ts
/**
 * Reglas del panel de administración que deciden algo.
 *
 * Viven aquí, puras y sin Convex, porque este repositorio no tiene forma de
 * testear funciones de Convex y estas son justo las reglas en las que
 * equivocarse significa pintar de verde algo que está roto.
 */

/**
 * Cada cuánto se refresca `users.lastSeenAt`.
 *
 * `ensureExists` corre en cada carga de la app tras autenticarse. Sin
 * acelerador habría una escritura por montaje, y como `getMe` está suscrita a
 * esa fila, cada carga empujaría una actualización a todos sus suscriptores.
 */
export const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000; // 1 hora

export function shouldRefreshLastSeen(
  previous: number | undefined,
  now: number,
): boolean {
  if (previous === undefined) return true;
  // Una marca en el futuro solo puede venir de un reloj desajustado; se
  // reescribe para que no bloquee las actualizaciones hasta que el futuro llegue.
  if (previous > now) return true;
  return now - previous > LAST_SEEN_THROTTLE_MS;
}
```

- [ ] **Paso 4: Ejecutar el test y ver que pasa**

Run: `pnpm vitest run src/lib/__tests__/adminHealth.test.ts`
Esperado: 5 tests en verde.

- [ ] **Paso 5: Añadir el campo al esquema**

En `convex/schema.ts`, dentro de `users: defineTable({...})`, junto a los demás campos opcionales:

```ts
    // Última vez que el usuario cargó la app estando autenticado. Lo escribe
    // ensureExists con acelerador de una hora (ver src/lib/adminHealth.ts).
    // `undefined` = nunca ha entrado desde que existe el campo; la interfaz lo
    // dice así en vez de inventarse una fecha.
    lastSeenAt: v.optional(v.number()),
```

- [ ] **Paso 6: Escribirlo en `ensureExists`**

En `convex/users.ts`, importar `shouldRefreshLastSeen` desde `../src/lib/adminHealth` (mismo patrón que los demás imports de `src/lib` en este archivo) y añadir el refresco en los **dos** caminos de retorno temprano de usuario existente: el de `linked` y el de `existing`.

```ts
    if (linked) {
      if (!linked.active) throw new Error("No autorizado: usuario desactivado");
      await touchLastSeen(ctx, linked);
      return linked._id;
    }
```

Y un helper al final del archivo:

```ts
/** Refresca lastSeenAt solo si toca; ver shouldRefreshLastSeen. */
async function touchLastSeen(
  ctx: MutationCtx,
  user: Doc<"users">,
): Promise<void> {
  const now = Date.now();
  if (!shouldRefreshLastSeen(user.lastSeenAt, now)) return;
  await ctx.db.patch(user._id, { lastSeenAt: now });
}
```

Comprobar que `MutationCtx` y `Doc` están importados; si no, añadirlos desde `./_generated/server` y `./_generated/dataModel`.

- [ ] **Paso 7: Verificar**

Run: `npx convex codegen && pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Paso 8: Comprobar el acelerador contra el despliegue**

Abre la app en el navegador, recarga tres veces seguidas, y luego:

Run: `npx convex data users --limit 5`

Esperado: `lastSeenAt` aparece con valor, y **no** cambia entre recargas consecutivas. Si cambia en cada recarga, el acelerador no está aplicándose y hay que revisarlo antes de seguir: es el riesgo principal señalado en el spec.

Informa al usuario: tarea lista para commitear.

---

### Tarea 6: Latido de los crons

`convex/crons.ts` define ocho jobs y no existe ninguna tabla de ejecuciones. Si el job de tasas falla, la consolidación multi-moneda de todos miente en silencio.

Los ocho jobs pasan a apuntar a **un despachador único** que registra el latido. Se conservan las llamadas `crons.daily` / `crons.monthly` / `crons.cron` exactamente con sus mismos horarios: lo único que cambia en cada línea es a qué función apunta y un argumento con el identificador del job. Así el riesgo de alterar la programación es nulo.

**Archivos:**
- Modificar: `convex/schema.ts` (tabla nueva `cronRuns`)
- Crear: `convex/lib/cronJobs.ts`
- Crear: `convex/cronRuns.ts`
- Modificar: `convex/crons.ts`
- Crear: `convex/lib/__tests__/cronJobs.test.ts`

**Interfaces:**
- Produce: `CRON_JOBS` (array const) y `type CronJobId` en `convex/lib/cronJobs.ts`.
- Produce: `internal.cronRuns.run({ job: CronJobId })` — despachador.
- Produce: `internal.cronRuns.record({ job, startedAt, finishedAt, ok, error? })`.

- [ ] **Paso 1: Declarar el registro de jobs**

Crear `convex/lib/cronJobs.ts`:

```ts
/**
 * Registro único de los trabajos programados.
 *
 * `convex/crons.ts` los programa, el despachador de `convex/cronRuns.ts` los
 * ejecuta y el panel de administración muestra su salud. Los tres leen de aquí
 * para que no puedan discrepar sobre cuántos jobs hay ni cómo se llaman.
 *
 * `everyMs` es la periodicidad ESPERADA, y sirve para decidir si un job va
 * atrasado. No programa nada: la programación real vive en crons.ts.
 */
export const CRON_JOBS = [
  { id: "fetchExchangeRates", label: "Tasas de cambio", everyMs: 24 * 60 * 60 * 1000 },
  { id: "processRecurringTransactions", label: "Movimientos recurrentes", everyMs: 24 * 60 * 60 * 1000 },
  { id: "sendAlerts", label: "Alertas y notificaciones", everyMs: 24 * 60 * 60 * 1000 },
  { id: "sendDailyReminder", label: "Recordatorio diario", everyMs: 24 * 60 * 60 * 1000 },
  { id: "sendWeeklySummary", label: "Resumen semanal", everyMs: 7 * 24 * 60 * 60 * 1000 },
  { id: "captureNetWorth", label: "Snapshot de patrimonio", everyMs: 31 * 24 * 60 * 60 * 1000 },
  { id: "rolloverBudgets", label: "Rollover de presupuestos", everyMs: 31 * 24 * 60 * 60 * 1000 },
  { id: "sendMonthlySummary", label: "Resumen mensual", everyMs: 31 * 24 * 60 * 60 * 1000 },
] as const;

export type CronJobId = (typeof CRON_JOBS)[number]["id"];
```

- [ ] **Paso 2: Escribir el test que falla**

Crear `convex/lib/__tests__/cronJobs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CRON_JOBS } from "../cronJobs";

/**
 * crons.ts es quien programa de verdad. Si alguien añade un job allí y no aquí,
 * el panel lo daría por inexistente y nadie vería que falla; si lo quita de allí
 * y lo deja aquí, el panel lo daría por caído para siempre.
 */
function jobsProgramadosEnCrons(): string[] {
  const source = readFileSync(resolve(__dirname, "../../crons.ts"), "utf8");
  const found = new Set<string>();
  for (const m of source.matchAll(/job:\s*"([A-Za-z]+)"/g)) found.add(m[1]);
  return [...found].sort();
}

describe("CRON_JOBS", () => {
  it("coincide exactamente con los jobs programados en crons.ts", () => {
    expect(CRON_JOBS.map((j) => j.id).sort()).toEqual(jobsProgramadosEnCrons());
  });

  it("no repite identificadores", () => {
    expect(new Set(CRON_JOBS.map((j) => j.id)).size).toBe(CRON_JOBS.length);
  });

  it("declara una periodicidad positiva para cada job", () => {
    for (const job of CRON_JOBS) {
      expect(job.everyMs, job.id).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Paso 3: Ejecutar el test y ver que falla**

Run: `pnpm vitest run convex/lib/__tests__/cronJobs.test.ts`
Esperado: FALLA en el primer test — `crons.ts` aún no tiene argumentos `job:`.

- [ ] **Paso 4: Añadir la tabla al esquema**

En `convex/schema.ts`:

```ts
  // ============================================================
  // LATIDO DE LOS TRABAJOS PROGRAMADOS
  // Convex no guarda historial de ejecuciones, así que sin esta tabla no hay
  // forma de saber si un cron dejó de correr. El registro lo escribe el
  // despachador de convex/cronRuns.ts.
  // ============================================================
  cronRuns: defineTable({
    job: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    ok: v.boolean(),
    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  })
    .index("by_job", ["job"]),
```

- [ ] **Paso 5: Implementar el despachador**

Crear `convex/cronRuns.ts`:

```ts
/**
 * Despachador de los trabajos programados: ejecuta el job y deja constancia.
 *
 * Los ocho crons apuntan aquí en lugar de a su función directamente. Se hace
 * así, y no envolviendo cada una de las ocho funciones, para que la lógica del
 * latido —registrar, capturar el error, podar el historial— exista en un solo
 * sitio. Ocho copias divergen.
 */

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { CRON_JOBS, type CronJobId } from "./lib/cronJobs";

/** Ejecuciones que se conservan por job. Sin poda la tabla crece sin techo. */
const KEEP_PER_JOB = 20;

const jobValidator = v.union(
  ...(CRON_JOBS.map((j) => v.literal(j.id)) as [
    ReturnType<typeof v.literal<CronJobId>>,
    ...ReturnType<typeof v.literal<CronJobId>>[],
  ]),
);

export const record = internalMutation({
  args: {
    job: jobValidator,
    startedAt: v.number(),
    finishedAt: v.number(),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { job, startedAt, finishedAt, ok, error }) => {
    await ctx.db.insert("cronRuns", {
      job,
      startedAt,
      finishedAt,
      ok,
      error,
      durationMs: finishedAt - startedAt,
    });

    const previas = await ctx.db
      .query("cronRuns")
      .withIndex("by_job", (q) => q.eq("job", job))
      .order("desc")
      .collect();
    for (const vieja of previas.slice(KEEP_PER_JOB)) {
      await ctx.db.delete(vieja._id);
    }
  },
});

/** Última ejecución de cada job, para el panel. */
export const latestByJob = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: Record<string, { finishedAt?: number; ok: boolean; error?: string }> = {};
    for (const job of CRON_JOBS) {
      const last = await ctx.db
        .query("cronRuns")
        .withIndex("by_job", (q) => q.eq("job", job.id))
        .order("desc")
        .first();
      if (last) out[job.id] = { finishedAt: last.finishedAt, ok: last.ok, error: last.error };
    }
    return out;
  },
});

export const run = internalAction({
  args: { job: jobValidator },
  handler: async (ctx, { job }) => {
    const startedAt = Date.now();
    let ok = true;
    let error: string | undefined;

    try {
      await dispatch(ctx, job);
    } catch (err) {
      ok = false;
      error = err instanceof Error ? err.message : String(err);
      // Se registra y SE VUELVE A LANZAR: el latido no debe tragarse el fallo,
      // solo dejar constancia de él.
    }

    await ctx.runMutation(internal.cronRuns.record, {
      job, startedAt, finishedAt: Date.now(), ok, error,
    });

    if (!ok) throw new Error(`Cron '${job}' falló: ${error}`);
  },
});

/** Mapa job → función real. El `never` final impide olvidar uno. */
async function dispatch(ctx: GenericActionCtx, job: CronJobId): Promise<void> {
  switch (job) {
    case "fetchExchangeRates":
      return ctx.runAction(internal.actions.fetchExchangeRates.run, {});
    case "processRecurringTransactions":
      return ctx.runAction(internal.actions.processRecurringTransactions.run, {});
    case "sendAlerts":
      return ctx.runAction(internal.actions.sendAlerts.run, {});
    case "sendDailyReminder":
      return ctx.runAction(internal.actions.sendDailyReminder.run, {});
    case "sendWeeklySummary":
      return ctx.runAction(internal.actions.sendWeeklySummary.run, {});
    case "sendMonthlySummary":
      return ctx.runAction(internal.actions.sendMonthlySummary.run, {});
    case "captureNetWorth":
      return ctx.runMutation(internal.netWorthSnapshots.captureForAllUsers, {});
    case "rolloverBudgets":
      return ctx.runMutation(internal.budgets.rolloverRecurring, {});
    default: {
      const sinManejar: never = job;
      throw new Error(`Job sin despachar: ${String(sinManejar)}`);
    }
  }
}
```

**Nota para el implementador:** el tipo del `ctx` de `dispatch` debe ser el que Convex genera para actions. Si `GenericActionCtx` da problemas de tipado, extrae el tipo con `Parameters<Parameters<typeof internalAction>[0]["handler"]>[0]` o declara el helper dentro del handler. Comprueba también las firmas reales de las ocho funciones destino: si alguna no acepta `{}` como argumentos, ajústalo.

- [ ] **Paso 6: Apuntar los crons al despachador**

En `convex/crons.ts`, cambiar cada una de las ocho llamadas para que apunte a `internal.cronRuns.run` con su identificador. **No cambiar ningún horario.** Ejemplo del primero:

```ts
crons.daily(
  "actualizar tasas de cambio",
  { hourUTC: 11, minuteUTC: 0 },
  internal.cronRuns.run,
  { job: "fetchExchangeRates" }
);
```

Aplicar el mismo patrón a los ocho, usando los `id` de `CRON_JOBS`.

- [ ] **Paso 7: Ejecutar el test y ver que pasa**

Run: `npx convex codegen && pnpm vitest run convex/lib/__tests__/cronJobs.test.ts`
Esperado: 3 tests en verde.

- [ ] **Paso 8: Comprobar que los ocho siguen programados**

Run: `npx convex run cronRuns:run '{"job": "fetchExchangeRates"}'`
Esperado: termina sin error.

Run: `npx convex data cronRuns --limit 5`
Esperado: una fila con `job: "fetchExchangeRates"`, `ok: true` y `durationMs`.

Abre después el panel de Convex (`npx convex dashboard`), sección de funciones programadas, y confirma que aparecen los **ocho** jobs con sus horarios originales. Si falta alguno o cambió de hora, detente: has roto la programación.

- [ ] **Paso 9: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Informa al usuario: tarea lista para commitear.

---

### Tarea 7: Contadores por usuario, recalculados

**Archivos:**
- Modificar: `convex/lib/userData.ts` (añadir `countUserDocs`)
- Modificar: `convex/schema.ts` (tabla `userStats`)
- Crear: `convex/adminStats.ts`
- Modificar: `convex/crons.ts` (cron diario de recálculo)
- Modificar: `convex/lib/cronJobs.ts` (registrar el job nuevo)

**Interfaces:**
- Consume: `USER_DATA_TABLES`, `collectUserDocs` de `convex/lib/userData.ts`.
- Produce: `countUserDocs(ctx, table, userId, cap): Promise<number>`.
- Produce: `internal.adminStats.recomputeForUser({ userId })`, `internal.adminStats.recomputeAll({})`, `api.adminStats.recomputeNow({})`.
- Produce: `STATS_COUNT_CAP = 10_000`.

- [ ] **Paso 1: Añadir el contador al inventario existente**

En `convex/lib/userData.ts`, al final:

```ts
/**
 * Cuántos documentos de `table` tiene `userId`, con tope.
 *
 * Reutiliza `collectUserDocs` para que el conteo y el borrado miren exactamente
 * las mismas filas por los mismos índices: si divergieran, el panel diría un
 * número y el reset de fábrica borraría otro.
 */
export async function countUserDocs(
  ctx: QueryCtx,
  table: UserDataTable,
  userId: string,
  cap: number,
): Promise<number> {
  return (await collectUserDocs(ctx, table, userId, cap)).length;
}
```

- [ ] **Paso 2: Añadir la tabla al esquema**

En `convex/schema.ts`:

```ts
  // ============================================================
  // CONTADORES POR USUARIO — materializados por RECÁLCULO, no write-through
  // Los recalcula un cron diario (y el botón del panel) desde los índices
  // by_user. No se incrementan en cada escritura a propósito: eso obligaría a
  // tocar todas las rutas de escritura y una sola olvidada haría mentir los
  // números en silencio. Ver el spec del 2026-09-20.
  // ============================================================
  userStats: defineTable({
    userId: v.string(),
    counts: v.record(v.string(), v.number()),
    capped: v.boolean(),
    computedAt: v.number(),
  })
    .index("by_user", ["userId"]),
```

- [ ] **Paso 3: Implementar el recálculo**

Crear `convex/adminStats.ts`:

```ts
/**
 * Contadores agregados del panel de administración.
 *
 * Se materializan por recálculo: ver la decisión razonada en
 * docs/superpowers/specs/2026-09-20-modulo-admin-design.md.
 */

import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { assertAdmin, assertAdminFromAction } from "./lib/auth";
import { USER_DATA_TABLES, countUserDocs } from "./lib/userData";

/** Tope por tabla y usuario. Alcanzarlo se declara con `capped`. */
export const STATS_COUNT_CAP = 10_000;

export const recomputeForUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const counts: Record<string, number> = {};
    let capped = false;

    for (const table of USER_DATA_TABLES) {
      const n = await countUserDocs(ctx, table, userId, STATS_COUNT_CAP);
      counts[table] = n;
      if (n >= STATS_COUNT_CAP) capped = true;
    }

    const existing = await ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const row = { userId, counts, capped, computedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("userStats", row);
  },
});

export const recomputeAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      await ctx.scheduler.runAfter(0, internal.adminStats.recomputeForUser, {
        userId: user.clerkId,
      });
    }
    return users.length;
  },
});

/** Botón «recalcular ahora» del panel. */
export const recomputeNow = action({
  args: {},
  handler: async (ctx): Promise<{ users: number }> => {
    await assertAdminFromAction(ctx);
    const users: number = await ctx.runMutation(internal.adminStats.recomputeAll, {});
    return { users };
  },
});

/** Totales del panel: suma de los contadores más su antigüedad. */
export const getTotals = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    const rows = await ctx.db.query("userStats").collect();

    const totals: Record<string, number> = {};
    let capped = false;
    let computedAt: number | undefined;

    for (const row of rows) {
      for (const [table, n] of Object.entries(row.counts)) {
        totals[table] = (totals[table] ?? 0) + n;
      }
      if (row.capped) capped = true;
      // El más antiguo: el conjunto vale lo que vale su dato más viejo.
      if (computedAt === undefined || row.computedAt < computedAt) {
        computedAt = row.computedAt;
      }
    }

    return { totals, capped, computedAt, users: rows.length };
  },
});
```

`recomputeAll` encola una mutation por usuario con `ctx.scheduler` en lugar de contarlos todos en la misma transacción: así el recálculo escala con el número de usuarios sin arriesgar el límite de una sola mutation.

- [ ] **Paso 4: Programar el recálculo diario**

En `convex/lib/cronJobs.ts`, añadir al array:

```ts
  { id: "recomputeUserStats", label: "Contadores del panel", everyMs: 24 * 60 * 60 * 1000 },
```

En `convex/cronRuns.ts`, añadir el caso al `switch` de `dispatch`:

```ts
    case "recomputeUserStats":
      return ctx.runMutation(internal.adminStats.recomputeAll, {});
```

En `convex/crons.ts`, a las 3 UTC (fuera de la ventana de los demás jobs):

```ts
// Recalcula los contadores del panel de administración: diario a las 3 UTC,
// fuera de la ventana en la que corren los demás trabajos.
crons.daily(
  "recalcular contadores del panel",
  { hourUTC: 3, minuteUTC: 0 },
  internal.cronRuns.run,
  { job: "recomputeUserStats" }
);
```

- [ ] **Paso 5: Ejecutar los tests**

Run: `npx convex codegen && pnpm test`
Esperado: el test de `cronJobs` sigue en verde (ahora con 9 jobs), y el de `userData` también.

- [ ] **Paso 6: Comprobar el recálculo contra el despliegue**

Run: `npx convex run adminStats:recomputeAll '{}'`
Esperado: devuelve el número de usuarios.

Run: `npx convex data userStats --limit 5`
Esperado: una fila por usuario, con `counts` poblado y `computedAt` reciente. Contrasta los números con `npx convex run factoryReset:getResetPreviewInternal '{"userId": "<clerkId>"}'`: **deben coincidir tabla por tabla**. Si no coinciden, el contador y el borrado están mirando filas distintas y hay que resolverlo antes de seguir.

- [ ] **Paso 7: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Informa al usuario: tarea lista para commitear.

---

# Fase 3 — Reglas de salud

### Tarea 8: Completar `src/lib/adminHealth.ts`

**Archivos:**
- Modificar: `src/lib/adminHealth.ts`
- Modificar: `src/lib/__tests__/adminHealth.test.ts`

**Interfaces:**
- Consume: nada nuevo.
- Produce: `type HealthStatus = "ok" | "late" | "failed" | "unknown"`; `cronHealth(last, everyMs, now)`; `rateFreshness(updatedAt, now)`; `isDormant(lastSeenAt, txCount, now)`.

- [ ] **Paso 1: Añadir los tests que fallan**

Añadir a `src/lib/__tests__/adminHealth.test.ts`:

```ts
import { cronHealth, rateFreshness, isDormant, DORMANT_MS } from "@/lib/adminHealth";

describe("cronHealth", () => {
  const ahora = 1_800_000_000_000;
  const diario = 24 * 60 * 60 * 1000;

  it("es 'unknown' cuando el job nunca ha corrido", () => {
    expect(cronHealth(undefined, diario, ahora)).toBe("unknown");
  });

  it("acepta null, que es lo que devuelve getOverview", () => {
    expect(cronHealth(null, diario, ahora)).toBe("unknown");
  });

  it("es 'failed' si la última ejecución falló, aunque sea reciente", () => {
    expect(cronHealth({ finishedAt: ahora - 1000, ok: false }, diario, ahora)).toBe("failed");
  });

  it("es 'ok' dentro de la periodicidad más el margen", () => {
    expect(cronHealth({ finishedAt: ahora - diario, ok: true }, diario, ahora)).toBe("ok");
  });

  it("es 'late' cuando se pasa de la periodicidad más el margen", () => {
    const viejo = ahora - diario * 2 - 1;
    expect(cronHealth({ finishedAt: viejo, ok: true }, diario, ahora)).toBe("late");
  });
});

describe("rateFreshness", () => {
  const ahora = 1_800_000_000_000;
  const h = 60 * 60 * 1000;

  it("es 'unknown' si nunca se actualizó", () => {
    expect(rateFreshness(undefined, ahora)).toBe("unknown");
  });

  it("es 'ok' por debajo de 26 horas", () => {
    expect(rateFreshness(ahora - 25 * h, ahora)).toBe("ok");
  });

  it("es 'late' entre 26 y 48 horas", () => {
    expect(rateFreshness(ahora - 30 * h, ahora)).toBe("late");
  });

  it("es 'failed' por encima de 48 horas", () => {
    expect(rateFreshness(ahora - 49 * h, ahora)).toBe("failed");
  });
});

describe("isDormant", () => {
  const ahora = 1_800_000_000_000;

  it("considera dormida la cuenta que nunca entró y no tiene movimientos", () => {
    expect(isDormant(undefined, 0, ahora)).toBe(true);
  });

  it("no considera dormida a quien nunca entró pero sí registró movimientos", () => {
    expect(isDormant(undefined, 5, ahora)).toBe(false);
  });

  it("considera dormida a quien lleva más del umbral sin entrar", () => {
    expect(isDormant(ahora - DORMANT_MS - 1, 20, ahora)).toBe(true);
  });

  it("no considera dormida a quien entró hace poco", () => {
    expect(isDormant(ahora - 1000, 0, ahora)).toBe(false);
  });
});
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run src/lib/__tests__/adminHealth.test.ts`
Esperado: FALLA — las funciones no existen.

- [ ] **Paso 3: Implementar**

Añadir a `src/lib/adminHealth.ts`:

```ts
export type HealthStatus = "ok" | "late" | "failed" | "unknown";

/**
 * Margen sobre la periodicidad antes de dar un job por atrasado. Un cron diario
 * que corrió hace 25 horas no es una incidencia: puede haberse desplazado.
 */
const CRON_GRACE_FACTOR = 2;

export interface CronRunSummary {
  finishedAt?: number;
  ok: boolean;
}

/**
 * Acepta `null` además de `undefined` a propósito: `api.admin.getOverview`
 * devuelve `crons[job.id] ?? null` porque Convex descarta las propiedades
 * `undefined` al serializar el resultado de una query.
 */
export function cronHealth(
  last: CronRunSummary | null | undefined,
  everyMs: number,
  now: number,
): HealthStatus {
  // `unknown` es un estado de primera clase: recién desplegado ningún job ha
  // corrido, y decirlo es más honesto que pintarlo todo en verde.
  if (!last || last.finishedAt === undefined) return "unknown";
  if (!last.ok) return "failed";
  return now - last.finishedAt > everyMs * CRON_GRACE_FACTOR ? "late" : "ok";
}

/** El cron de tasas corre cada 24 h; 26 deja margen sin tapar un fallo real. */
const RATE_OK_MS = 26 * 60 * 60 * 1000;
const RATE_LATE_MS = 48 * 60 * 60 * 1000;

export function rateFreshness(updatedAt: number | undefined, now: number): HealthStatus {
  if (updatedAt === undefined) return "unknown";
  const age = now - updatedAt;
  if (age <= RATE_OK_MS) return "ok";
  if (age <= RATE_LATE_MS) return "late";
  return "failed";
}

/** Sin entrar durante este tiempo, la cuenta se considera dormida. */
export const DORMANT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Una cuenta está dormida si lleva mucho sin entrar, o si nunca entró y además
 * no registró nada. El segundo caso importa: `lastSeenAt` es un campo nuevo, así
 * que quien no haya vuelto desde el despliegue lo tiene sin definir sin estar
 * realmente inactivo — sus movimientos son la prueba de que sí usó la app.
 */
export function isDormant(
  lastSeenAt: number | undefined,
  transactionCount: number,
  now: number,
): boolean {
  if (lastSeenAt === undefined) return transactionCount === 0;
  return now - lastSeenAt > DORMANT_MS;
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run src/lib/__tests__/adminHealth.test.ts`
Esperado: 18 tests en verde — los 5 de la tarea 5 más 13 nuevos (5 de `cronHealth`, 4 de `rateFreshness`, 4 de `isDormant`).

- [ ] **Paso 5: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Informa al usuario: tarea lista para commitear.

---

# Fase 4 — Backend del panel

### Tarea 9: Queries del panel

**Archivos:**
- Crear: `convex/admin.ts`
- Modificar: `convex/users.ts` (añadir `listForAdmin`)

**Interfaces:**
- Consume: `internal.cronRuns.latestByJob` (tarea 6), `CRON_JOBS` (tarea 6), tabla `userStats` (tarea 7), campo `users.lastSeenAt` (tarea 5).
- Produce: `api.admin.getOverview({})` → `{ rates: { updatedAt?: number; pairs: number }, crons: Array<{ id, label, everyMs, last: CronRunSummary | null }>, users: { total, active, admins }, invitations: { pending } }`.
- Produce: `api.admin.listPendingInvitations({})` → `Array<{ id, email, role, invitedBy, createdAt }>`.
- Produce: `api.users.listForAdmin({})` → proyección, ver abajo.

- [ ] **Paso 1: Crear las queries del panel**

Crear `convex/admin.ts`:

```ts
/**
 * Lecturas del panel de administración.
 *
 * Todo pasa por `assertAdmin`, que además de comprobar el rol valida que la
 * cuenta esté activa. Ninguna de estas queries devuelve importes, saldos ni
 * descripciones: el panel muestra agregados y metadatos, nunca datos
 * financieros de nadie.
 */

import { query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { assertAdmin } from "./lib/auth";
import { CRON_JOBS } from "./lib/cronJobs";

export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);

    // Tasas: la fila más recientemente actualizada representa la frescura del job.
    const rates = await ctx.db.query("currentExchangeRates").collect();
    const ratesUpdatedAt = rates.length
      ? Math.max(...rates.map((r) => r.updatedAt))
      : undefined;

    const crons = await ctx.runQuery(internal.cronRuns.latestByJob, {});

    const users = await ctx.db.query("users").collect();
    const pending = await ctx.db
      .query("invitations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return {
      rates: { updatedAt: ratesUpdatedAt, pairs: rates.length },
      crons: CRON_JOBS.map((job) => ({ ...job, last: crons[job.id] ?? null })),
      users: {
        total: users.length,
        active: users.filter((u) => u.active).length,
        admins: users.filter((u) => u.role === "admin").length,
      },
      invitations: { pending: pending.length },
    };
  },
});

export const listPendingInvitations = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    const pending = await ctx.db
      .query("invitations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending.map((i) => ({
      id: i._id,
      email: i.email,
      role: i.role,
      invitedBy: i.invitedBy,
      createdAt: i.createdAt,
    }));
  },
});
```

**Nota:** una `query` no puede llamar a `ctx.runQuery` sobre una `internalQuery` en todas las versiones de Convex. Si el paso 3 falla por eso, mueve el cuerpo de `latestByJob` a una función auxiliar exportada desde `convex/cronRuns.ts` que reciba `ctx` y llámala directamente.

- [ ] **Paso 2: Crear la proyección de usuarios**

Añadir a `convex/users.ts`:

```ts
/**
 * Lista de usuarios para el panel, con PROYECCIÓN explícita.
 *
 * `listAll` devuelve el documento entero, incluidos `authId`,
 * `notificationPrefs` e `imageStorageId`, que el panel no necesita y no debería
 * mover. Aquí se elige campo a campo.
 */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);

    const users = await ctx.db.query("users").order("desc").collect();
    const stats = await ctx.db.query("userStats").collect();
    const byUser = new Map(stats.map((s) => [s.userId, s]));

    return users.map((u) => {
      const s = byUser.get(u.clerkId);
      return {
        clerkId: u.clerkId,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt,
        transactionCount: s?.counts.transactions ?? 0,
        accountCount: s?.counts.accounts ?? 0,
        statsComputedAt: s?.computedAt,
      };
    });
  },
});
```

- [ ] **Paso 3: Verificar contra el despliegue**

Run: `npx convex codegen && pnpm typecheck && pnpm lint`

Las queries exigen sesión de admin, así que no se pueden ejecutar desde la CLI. Se verifican desde la interfaz en la tarea 12.

Informa al usuario: tarea lista para commitear.

---

### Tarea 10: Acciones sobre invitaciones

Hoy no existe forma de revocar una invitación ni de reenviar el acceso desde la lista de pendientes.

**Archivos:**
- Modificar: `convex/invitations.ts`
- Modificar: `src/lib/constants.ts` (acción de auditoría nueva)
- Modificar: `src/lib/__tests__/auditLabels.test.ts` no necesita cambios; la etiqueta sí

**Interfaces:**
- Produce: `api.invitations.revoke({ invitationId })`.

- [ ] **Paso 1: Añadir la acción de auditoría**

En `src/lib/constants.ts`, junto a las demás de usuario:

```ts
  /** Un admin anuló una invitación pendiente antes de que se usara. */
  USER_INVITE_REVOKED: "user.invite.revoked",
```

Y su etiqueta en `AUDIT_ACTION_LABELS`:

```ts
  [AUDIT_ACTIONS.USER_INVITE_REVOKED]: "Invitación revocada",
```

- [ ] **Paso 2: Ejecutar el test de etiquetas**

Run: `pnpm vitest run src/lib/__tests__/auditLabels.test.ts`
Esperado: en verde. Si falla, la etiqueta y la acción no coinciden.

- [ ] **Paso 3: Implementar la revocación**

Añadir a `convex/invitations.ts`:

```ts
import { mutation } from "./_generated/server";
import { assertAdmin } from "./lib/auth";
import { AUDIT_ACTIONS } from "../src/lib/constants";

/**
 * Anula una invitación pendiente.
 *
 * Solo se borran las `pending`: una ya aceptada es el registro histórico de
 * cómo entró esa persona, y borrarla no revoca nada —la cuenta ya existe— pero
 * sí destruye la trazabilidad. Para quitar el acceso de alguien que ya entró
 * está desactivar o eliminar su usuario.
 */
export const revoke = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, { invitationId }) => {
    const admin = await assertAdmin(ctx);
    const invitation = await ctx.db.get(invitationId);
    if (!invitation) throw new Error("La invitación ya no existe");
    if (invitation.status !== "pending") {
      throw new Error("Esa invitación ya se usó: no se puede revocar");
    }

    await ctx.db.delete(invitationId);
    await ctx.db.insert("auditLogs", {
      userId: admin.clerkId,
      action: AUDIT_ACTIONS.USER_INVITE_REVOKED,
      metadata: { email: invitation.email, role: invitation.role },
      createdAt: Date.now(),
    });
  },
});
```

Comprueba la forma real de la tabla `auditLogs` en `convex/schema.ts` y ajusta los campos del insert si no coinciden. Si existe un helper para escribir auditoría desde una mutation con contexto de usuario, úsalo en lugar del insert directo.

- [ ] **Paso 4: Verificar**

Run: `npx convex codegen && pnpm typecheck && pnpm lint && pnpm test`

Informa al usuario: tarea lista para commitear.

---

# Fase 5 — Interfaz

> **Sobre el nivel de detalle de esta fase.** Las tareas 11 a 15 llevan código
> completo para las piezas compartidas (`AdminCard`, `StatusDot`) y, para cada
> tarjeta concreta, su contrato: qué query consume, qué calcula, qué muestra y
> qué debe decir cuando no hay datos. No llevan el JSX completo de las once
> tarjetas porque son composición sobre primitivas ya definidas y sobre un
> lenguaje visual con exemplars en el repositorio (`src/components/perfil/`,
> `src/components/dashboard/`), y porque las decisiones que importan —qué
> significa cada estado, qué no se puede mostrar nunca— sí están escritas.
> Donde un requisito no es negociable (mostrar la antigüedad del contador, no
> mostrar importes, usar «nunca ha entrado» en vez de una fecha inventada)
> aparece marcado como obligatorio.

### Tarea 11: Primitivas visuales del panel

Las ocho tarjetas comparten marco, cabecera y animación. Se declara una vez.

**Archivos:**
- Crear: `src/components/admin/AdminCard.tsx`
- Crear: `src/components/admin/StatusDot.tsx`

**Interfaces:**
- Produce: `<AdminCard icon tone title badge? footnote? index? >{children}</AdminCard>`.
- Produce: `<StatusDot status={HealthStatus} />` y `STATUS_TONE: Record<HealthStatus, string>`.

- [ ] **Paso 1: Crear `AdminCard`**

Crear `src/components/admin/AdminCard.tsx`:

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { EASE_OUT_EXPO, GLASS_SURFACE, tint } from "@/lib/ios";
import { cn } from "@/lib/utils";

/**
 * Marco de una tarjeta del panel de administración.
 *
 * Es gemela de `src/components/perfil/SettingsCard.tsx` y NO la reutiliza a
 * propósito: aquella vive en el módulo de perfil, tiene once consumidores
 * propios y un `description` que aquí no hace falta, porque en el panel el
 * contenido ES el dato. Generalizar una sola para los dos módulos haría que
 * cualquier ajuste del panel alterase la pantalla de perfil.
 */
export function AdminCard({
  icon: Icon,
  tone,
  title,
  badge,
  footnote,
  index = 0,
  children,
}: {
  icon: LucideIcon;
  /** Color del chip del icono; identifica la tarjeta de un vistazo */
  tone: string;
  title: string;
  /** Estado o cifra destacada, a la derecha del título */
  badge?: React.ReactNode;
  /** Matiz o advertencia, debajo del contenido */
  footnote?: React.ReactNode;
  index?: number;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: EASE_OUT_EXPO,
        delay: Math.min(index, 10) * 0.04,
      }}
      className={cn("rounded-[24px] p-4", GLASS_SURFACE)}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px]"
          style={{ background: tint(tone, 16), color: tone }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold text-foreground">
          {title}
        </h2>
        {badge}
      </div>

      <div className="mt-3">{children}</div>

      {footnote && (
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          {footnote}
        </p>
      )}
    </motion.section>
  );
}
```

- [ ] **Paso 2: Crear `StatusDot`**

Crear `src/components/admin/StatusDot.tsx`:

```tsx
import type { HealthStatus } from "@/lib/adminHealth";

/**
 * Color semántico del estado, separado del acento de marca a propósito: si el
 * lima de Okany significara «bien», un panel sano y la identidad visual serían
 * el mismo color y un problema no se vería sin leer.
 */
export const STATUS_TONE: Record<HealthStatus, string> = {
  ok: "var(--success)",
  late: "var(--warning)",
  failed: "var(--danger)",
  unknown: "var(--muted-foreground)",
};

const LABEL: Record<HealthStatus, string> = {
  ok: "Al día",
  late: "Atrasado",
  failed: "Falló",
  unknown: "Sin datos",
};

export function StatusDot({ status }: { status: HealthStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: STATUS_TONE[status] }}>
      <span aria-hidden="true" className="h-2 w-2 rounded-full"
            style={{ background: STATUS_TONE[status] }} />
      {LABEL[status]}
    </span>
  );
}
```

**Comprueba que los tokens `--success` y `--warning` existen** en `src/app/globals.css`. El inventario confirmó `--danger` y `--warning`; si `--success` no está, usa el que exista para «bien» y anótalo.

- [ ] **Paso 3: Verificar**

Run: `pnpm typecheck && pnpm lint`

Informa al usuario: tarea lista para commitear.

---

### Tarea 12: Dashboard — estado del sistema y personas

**Archivos:**
- Reescribir: `src/app/(app)/admin/page.tsx`
- Crear: `src/components/admin/RatesHealthCard.tsx`
- Crear: `src/components/admin/CronsHealthCard.tsx`
- Crear: `src/components/admin/UsersSummaryCard.tsx`
- Crear: `src/components/admin/PendingInvitationsCard.tsx`
- Crear: `src/components/admin/DormantUsersCard.tsx`

**Interfaces:**
- Consume: `api.admin.getOverview`, `api.admin.listPendingInvitations`, `api.users.listForAdmin`, `api.invitations.revoke`, `api.actions.adminUsers.sendAccessEmail`, `cronHealth`, `rateFreshness`, `isDormant`.

- [ ] **Paso 1: Reescribir la página como composición de bloques**

`admin/page.tsx` queda reducida a: `PageContainer variant="wide"`, cuatro `<section>` encabezadas con `FIELD_LABEL` («Estado del sistema», «Personas», «Uso», «Operación») y las tarjetas dentro, cada una con su `index` para el escalonado. Las cuatro `StatCard` actuales y la lista de auditoría en línea desaparecen.

Cada tarjeta hace su propio `useQuery`: son independientes y una lenta no debe bloquear al resto.

- [ ] **Paso 2: `RatesHealthCard`**

Muestra `<StatusDot status={rateFreshness(updatedAt, Date.now())} />`, cuándo se actualizó en lenguaje relativo, y cuántos pares hay.

Cuando el estado no es `ok`, un texto explica la consecuencia, que es lo que hace útil a la tarjeta:

> «La conversión entre monedas del dashboard de todos los usuarios está usando tasas de hace N días.»

- [ ] **Paso 3: `CronsHealthCard`**

Veredicto agregado arriba («8 de 9 al día») y debajo la lista de jobs con su `StatusDot` y su última ejecución relativa. Si alguno tiene `error`, mostrarlo truncado.

Calcula el estado con `cronHealth(job.last, job.everyMs, Date.now())`.

- [ ] **Paso 4: `UsersSummaryCard`**

Total, con sesión en los últimos 30 días, desactivados y administradores. La cifra de «con sesión reciente» se calcula desde `listForAdmin` con `isDormant`, no desde el booleano `active`: son cosas distintas y confundirlas era el defecto de la tarjeta anterior. Deja eso explícito en un comentario.

- [ ] **Paso 5: `PendingInvitationsCard`**

Lista de invitaciones pendientes con correo, rol, quién invitó y hace cuánto. Por fila, dos acciones: **reenviar acceso** (`api.actions.adminUsers.sendAccessEmail` — comprueba su firma: recibe `targetClerkId`, así que si la invitación aún no tiene usuario, usa en su lugar `createByAdmin` con el mismo correo, que es idempotente) y **revocar** (`api.invitations.revoke`, con confirmación).

Si no hay ninguna, estado vacío que lo diga, no una tarjeta en blanco.

- [ ] **Paso 6: `DormantUsersCard`**

Usuarios con `isDormant(lastSeenAt, transactionCount, Date.now())`. Por fila: nombre, correo y desde cuándo. Enlaza a su ficha.

- [ ] **Paso 7: Verificar en el navegador**

Run: `pnpm dev` y `pnpm dev:convex` en dos terminales. Entra a `/admin` con una cuenta de administrador.

Comprueba: las cuatro secciones aparecen; ninguna tarjeta muestra importes; el escalonado de entrada se ve; con `prefers-reduced-motion` activo no hay animación; a 400 px de ancho no hay scroll horizontal.

- [ ] **Paso 8: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

Informa al usuario: tarea lista para commitear.

---

### Tarea 13: Dashboard — uso y operación

**Archivos:**
- Crear: `src/components/admin/VolumeCard.tsx`
- Crear: `src/components/admin/RecentActivityCard.tsx`
- Crear: `src/components/admin/ManualRateCard.tsx`
- Modificar: `src/app/(app)/admin/page.tsx`

- [ ] **Paso 1: `VolumeCard`**

Lee `api.adminStats.getTotals`. Muestra movimientos, cuentas y tarjetas.

**Obligatorio:** mostrar siempre la antigüedad del dato («actualizado hace 3 horas») y, si `capped` es `true`, escribir `10 000+` en lugar de la cifra. Un número sin antigüedad al lado es un número en el que no se puede confiar, y un tope presentado como cifra exacta es peor que no tener el dato.

Incluye un botón «recalcular» que llama a `api.adminStats.recomputeNow`.

- [ ] **Paso 2: `RecentActivityCard`**

Lee `api.auditLogs.listRecent` con `limit: 20`. Usa `AUDIT_ACTION_LABELS[log.action] ?? log.action`. Añade un filtro por tipo de acción, en cliente sobre lo traído.

- [ ] **Paso 3: `ManualRateCard`**

Formulario de moneda origen, destino y tasa, que llama a `api.exchangeRates.setManualRate` (ya restringida a admin en la tarea 1). Usa `CURRENCIES` de `src/lib/constants.ts` para los selectores.

Nota al pie que explique la consecuencia: la tasa manual sobrescribe la global y la usarán todos los usuarios hasta que el cron la reemplace.

- [ ] **Paso 4: Montar las dos secciones restantes**

Añadir los bloques «Uso» y «Operación» a `admin/page.tsx`.

- [ ] **Paso 5: Verificar en el navegador**

Comprueba que «recalcular» actualiza la antigüedad, y que fijar una tasa manual se refleja en la tarjeta de tasas.

- [ ] **Paso 6: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

Informa al usuario: tarea lista para commitear.

---

### Tarea 14: Lista de usuarios

**Archivos:**
- Reescribir: `src/app/(app)/admin/users/page.tsx`
- Crear: `src/components/admin/UserFilters.tsx`
- Crear: `src/components/admin/UserRow.tsx`

- [ ] **Paso 1: Cambiar la query**

Sustituir `api.users.listAll` por `api.users.listForAdmin`.

- [ ] **Paso 2: Filtros**

`UserFilters` con: búsqueda por nombre o correo, rol (todos / admin / usuario), estado (todos / activos / desactivados) y actividad (todos / con sesión reciente / dormidos). Estado en la propia página, filtrado en cliente sobre la proyección.

Usa `OVERFLOW_ROW` de `src/lib/ios.ts` para la fila de chips de filtro: con dedo se desliza, con ratón se reparte en varias líneas.

- [ ] **Paso 3: Filas**

`UserRow` con: avatar, nombre, correo, distintivo de rol, distintivo de inactivo, **último acceso** y **número de movimientos**. Toda la fila navega a la ficha.

Si `lastSeenAt` es `undefined`, escribe «nunca ha entrado», no una fecha inventada.

- [ ] **Paso 4: Estado vacío**

Cuando los filtros no devuelven nada, dilo y ofrece limpiarlos. No dejes una lista en blanco.

- [ ] **Paso 5: Verificar en el navegador**

Comprueba los cuatro filtros combinados, y que a 400 px la fila sigue siendo legible.

- [ ] **Paso 6: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

Informa al usuario: tarea lista para commitear.

---

### Tarea 15: Ficha de usuario

**Archivos:**
- Modificar: `src/app/(app)/admin/users/[id]/page.tsx`
- Crear: `src/components/admin/UserUsageCard.tsx`

- [ ] **Paso 1: Dejar de pedir la lista entera**

En `users/[id]/page.tsx`, sustituir el `useQuery(api.users.listAll)` seguido de `.find(...)` por `useQuery(api.users.getByClerkId, { clerkId })`.

Añade el comentario:

```tsx
  // getByClerkId y no listAll().find(): la versión anterior descargaba TODOS
  // los usuarios para mostrar uno.
```

Comprueba la forma que devuelve `getByClerkId` y ajusta los usos: devuelve el documento de `users`, no la proyección de `listForAdmin`.

- [ ] **Paso 2: `UserUsageCard`**

Lee `api.users.listForAdmin` y toma la fila de este usuario, o añade una query dedicada si prefieres no traer la lista. Muestra: cuentas, movimientos, tarjetas, deudas y metas; alta y último acceso.

**Ni una cifra de dinero.** Es la restricción de privacidad acordada.

Muestra también la antigüedad del contador.

- [ ] **Paso 3: Montar**

Insertar la tarjeta entre el bloque de estado y la zona de peligro.

- [ ] **Paso 4: Verificar en el navegador**

Entra a la ficha de un usuario y contrasta los números con `npx convex run adminStats:recomputeAll '{}'` seguido de `npx convex data userStats`.

- [ ] **Paso 5: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

Informa al usuario: plan completo; todo listo para commitear.

---

## Resumen de cobertura del spec

| Sección del spec | Tarea |
|---|---|
| A. Esquema: `lastSeenAt` | 5 |
| A. Esquema: `cronRuns` | 6 |
| A. Esquema: `userStats` | 7 |
| B. Contadores por recompute | 7 |
| C. Latido de los crons | 6 |
| D. Dashboard bloque 1 (estado) | 12 |
| D. Dashboard bloque 2 (personas) | 12 |
| D. Dashboard bloque 3 (uso) | 13 |
| D. Dashboard bloque 4 (operación) | 13 |
| E. Lista de usuarios | 14 |
| E. Ficha de usuario | 15 |
| F.1 `setManualRate` | 1 |
| F.2 escaneo de `adminStats` | 7 (lo sustituye) y 13 (lo consume) |
| F.3 admin desactivado | 3 |
| F.4 etiquetas de auditoría | 4 |
| F.5 normalización de correo | 2 |
| Pruebas: `adminHealth` | 5 y 8 |
| Pruebas: invariante de tablas | heredado de `userData.test.ts` en 7 |
