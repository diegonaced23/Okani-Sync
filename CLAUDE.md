# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reglas obligatorias

- **Nunca hacer `git commit` ni `git push`.** Solo el usuario puede crear commits y pushear al repositorio. Claude puede editar archivos, pero los commits son responsabilidad exclusiva del usuario.

@AGENTS.md

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Commands

```bash
# Desarrollo (necesita dos terminales)
npm run dev           # Next.js en localhost:3000
npm run dev:convex    # Convex en modo watch (sincroniza schema y funciones)

# Verificación
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit (Next.js)
npm run typecheck:sw  # tsc --noEmit -p tsconfig.sw.json (Service Worker)

# Tests
npm test              # vitest run (una pasada)
npm run test:watch    # vitest en modo watch
npm run test:coverage # con cobertura (solo src/lib/**)

# Producción
npm run build
```

Para ejecutar un único archivo de tests: `npx vitest run src/lib/__tests__/<archivo>.test.ts`

## Arquitectura

### Stack

- **Next.js 16** (App Router, React 19) — puede tener breaking changes vs. versiones anteriores; leer `node_modules/next/dist/docs/` si hay dudas
- **Convex** — backend reactivo (BD + funciones serverless + crons)
- **Clerk** — autenticación; `userId` en todo el código es el `clerkId` de Clerk
- **Serwist** — Service Worker / PWA (solo activo en producción)
- **Sentry** — error tracking (solo en producción)
- **Tailwind CSS v4 + Shadcn/ui** — design system; componentes propios en `src/components/ui/`

### Estructura de rutas

```
src/app/
  (auth)/sign-in/    → páginas de Clerk
  (app)/             → app autenticada (layout con BottomNav + Header)
    dashboard/
    transacciones/
    cuentas/[id]/
    tarjetas/[id]/
    presupuestos/
    deudas/
    categorias/
    reportes/
    perfil/
    mas/
    admin/usuarios/  → solo rol "admin"
```

### Backend Convex

```
convex/
  schema.ts                   → fuente de verdad del modelo de datos
  http.ts                     → webhook Clerk → upsert/delete de usuarios
  crons.ts                    → 3 jobs diarios (tasas de cambio, recurrentes, alertas)
  lib/
    permissions.ts            → assertCanRead/Write/Manage/IsOwner para cuentas compartidas
    money.ts                  → toCents / fromCents (espejo del de src/lib/)
    auth.ts, clerkApi.ts, ...
  actions/
    fetchExchangeRates.ts
    processRecurringTransactions.ts
    sendAlerts.ts
    sendPushNotification.ts
    sendWelcomeEmail.ts
    deleteUserCascade.ts
    adminUsers.ts
```

### Módulos de UI

Cada módulo en `src/components/<módulo>/` tiene sus propios componentes de lista, formulario y detalles. Usan hooks de Convex (`useQuery`, `useMutation`) directamente.

## Convenciones críticas

### Montos de dinero
Todos los valores monetarios en la BD son **enteros escalados ×100** (centavos). Nunca almacenar floats.

```ts
import { toCents, fromCents, formatCents } from "@/lib/money";
// Guardar:  toCents(1500.50)  → 150050
// Leer:     fromCents(150050) → 1500.50
// Mostrar:  formatCents(150050, "COP") → "$ 1.501"
```

### Timestamps y mes
- Timestamps: `Date.now()` (número, ms)
- Campo `month`: siempre `"YYYY-MM"` (usar `toMonthString()` / `currentMonth()` de `src/lib/money.ts`)

### Transferencias (doble entrada)
Una transferencia genera **2 transacciones** enlazadas por `transferGroupId` (UUID):
- TX salida: `type: "gasto"`, `accountId` = cuenta origen, `toAccountId` = destino
- TX entrada: `type: "ingreso"`, `accountId` = cuenta destino

### Cuentas compartidas
Antes de leer o escribir una cuenta, usar los helpers de `convex/lib/permissions.ts`:
- `assertCanRead` — viewer, editor, admin, owner
- `assertCanWrite` — editor, admin, owner (no viewer)
- `assertCanManage` — admin, owner
- `assertIsOwner` — solo el dueño

### Multi-moneda
Cada cuenta/tarjeta tiene su propia `currency`. La consolidación en el dashboard usa `currentExchangeRates` (lookup O(1)) y el histórico `exchangeRates` para reportes por fecha.

### Autenticación en Convex
El `userId` siempre es `identity.subject` (el `clerkId`). Los usuarios se sincronizan desde Clerk vía webhook en `convex/http.ts` → `convex/users.ts`.

### Web Push
- Suscripciones en tabla `pushSubscriptions` (separada de `users`), indexada por `userId` y `endpoint`
- Una suscripción caducada (410 Gone) se elimina individualmente, no en bulk
- El SW (`src/app/sw.ts`) escucha eventos `push` y `notificationclick`
- El SW se compila con `tsconfig.sw.json` separado

## Tests

Los tests viven en `src/lib/__tests__/` y cubren únicamente `src/lib/**`. El entorno es `node` (no jsdom). Vitest es el runner.
