# Okany Sync

PWA de gestión de finanzas personales con soporte multi-moneda. Diseñada para funcionar como app nativa en móvil y escritorio.

## Características

- **Cuentas y saldos** — múltiples cuentas con distinta moneda, saldo consolidado en tiempo real
- **Transacciones** — ingresos, gastos, transferencias entre cuentas (doble entrada), pagos de tarjeta y deuda
- **Tarjetas de crédito** — compras a cuotas con cálculo de interés compuesto (capital + interés por cuota)
- **Deudas** — seguimiento de préstamos con historial de abonos
- **Presupuestos** — por categoría y mes, con alertas cuando se acerca el límite
- **Cuentas compartidas** — comparte una cuenta con otros usuarios (roles: viewer, editor, admin)
- **Reportes** — exportación CSV y PDF por rango de fechas
- **Notificaciones push** — alertas de presupuesto, cuotas próximas y deudas vencidas (Web Push)
- **Transacciones recurrentes** — generadas automáticamente vía cron diario
- **Multi-moneda** — tasas de cambio actualizadas diariamente, conversión en el dashboard

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16 (App Router), React 19 |
| Backend | Convex (BD reactiva + serverless + crons) |
| Auth | Clerk |
| Estilos | Tailwind CSS v4 + Shadcn/ui |
| PWA | Serwist (Service Worker) |
| Email | Resend |
| Errores | Sentry (solo producción) |
| Tests | Vitest |

## Requisitos

- Node.js 20+
- Cuenta en [Convex](https://convex.dev)
- Cuenta en [Clerk](https://clerk.com)

## Configuración

Crea un archivo `.env.local` con las siguientes variables:

```env
# Convex
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
CLERK_JWT_ISSUER_DOMAIN=

# Resend (emails de bienvenida)
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=

# Sentry (opcional, solo producción)
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

Para generar las claves VAPID:
```bash
npx web-push generate-vapid-keys
```

## Desarrollo

```bash
npm install

# Requiere dos terminales en paralelo:
npm run dev          # Next.js → http://localhost:3000
npm run dev:convex   # Convex en modo watch
```

## Comandos disponibles

```bash
npm run build          # Build de producción
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm test               # Vitest (una pasada)
npm run test:watch     # Vitest en modo watch
npm run test:coverage  # Cobertura (solo src/lib/**)
```

## Notas de implementación

- Los montos en la BD son **enteros × 100** (centavos). Usar `toCents` / `fromCents` / `formatCents` de `src/lib/money.ts`.
- El Service Worker solo está activo en producción (Serwist lo deshabilita en desarrollo).
