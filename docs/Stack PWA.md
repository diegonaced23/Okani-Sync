# Stack - PWA Gestión de Dinero Personal

## Decisión de Stack

### Frontend

- **Framework**: Next.js 15 (App Router)
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS
- **Validation**: Zod (cliente + servidor)
- **State Management**: React hooks + Convex queries (no necesita Redux/Zustand)

### Backend

- **Database + API**: Convex
    - Database: realtime queries + mutations
    - Storage: Convex Files (5MB por archivo)
    - No se necesita servidor separado
    - Operaciones estimadas: ~750/mes (free tier = 500K ops/mes)

### Authentication

- **Provider**: Clerk
    - OAuth social integrado
    - Sessions + Magic Links
    - Integración nativa con Convex (@clerk/convex)
    - Free tier: 10k usuarios

### Hosting

- **Frontend + API**: Vercel
    - Deploy automático desde GitHub
    - Next.js optimizado nativamente
    - Edge middleware compatible
    - Free tier: 100GB bandwidth/mes

### Archivos

- **Documentos/Recibos**: Convex Files (primario)
- **Fallback (si necesita más espacio)**: Cloudinary free tier (25MB/mes)

---

## Configuración Inicial

### 1. Crear proyecto

```bash
npx create-next-app@latest money-app --typescript --tailwind --app
cd money-app
```

### 2. Instalar dependencias principales

```bash
npm install convex @clerk/nextjs @clerk/convex zod recharts framer-motion
npm install -D shadcn-ui
npx shadcn-ui@latest init
```

### 3. Variables de entorno (.env.local)

```
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Convex
NEXT_PUBLIC_CONVEX_URL=
```

### 4. Estructura de directorios

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (auth)/
│   │   ├── sign-in/page.tsx
│   │   └── sign-up/page.tsx
│   ├── dashboard/
│   │   ├── page.tsx (overview)
│   │   ├── transactions/page.tsx
│   │   ├── budgets/page.tsx
│   │   └── goals/page.tsx
│   ├── api/
│   │   └── clerk/webhook/route.ts (sync users)
│   └── layout.tsx
├── components/
│   ├── TransactionForm.tsx
│   ├── TransactionList.tsx
│   ├── BudgetCard.tsx
│   ├── Charts/
│   │   ├── SpendingByCategory.tsx
│   │   └── MonthlyTrend.tsx
│   └── Navbar.tsx
├── lib/
│   ├── convex.ts (client setup)
│   └── validators.ts (Zod schemas)
└── convex/
    ├── schema.ts
    ├── transactions.ts (mutations + queries)
    ├── budgets.ts
    ├── categories.ts
    └── _generated/ (auto-generated)
```

---

## Puntos Clave de Implementación

### Convex Setup

- `convex/schema.ts`: Define las tablas con `defineTable`
- Todas las queries/mutations retornan datos serializables (sin Dates directas)
- Usar `getCurrentUser()` para validar userId en server
- Indexing: `userId` en todas las queries frecuentes

### Clerk Integration

```typescript
// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs'

export default function RootLayout({children}) {
  return (
    <ClerkProvider>
      {children}
    </ClerkProvider>
  )
}
```

```typescript
// Webhook en API para sincronizar usuarios
// app/api/clerk/webhook/route.ts
import { Webhook } from 'svix'
import { api } from '@convex/react'

export async function POST(req: Request) {
  const evt = await wh.verify(await req.text(), headers)
  // evt.type === "user.created" → sync to Convex
}
```

### Zod Validation

```typescript
// lib/validators.ts
export const transactionSchema = z.object({
  amount: z.number().positive("Debe ser mayor que 0"),
  description: z.string().min(1),
  category: z.enum(["food", "transport", ...]),
  date: z.date(),
  receiptUrl: z.string().url().optional(),
})
```

### Convex Queries con autenticación

```typescript
// convex/transactions.ts
import { query, mutation } from "./_generated/server"
import { getCurrentUser } from "./auth.ts"

export const getTransactions = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const user = await getCurrentUser(ctx)
    return await ctx.db
      .query("transactions")
      .filter(q => q.eq(q.field("userId"), user.clerkId))
      .filter(q => q.eq(q.field("month"), month))
      .collect()
  }
})
```

### Manejo de archivos (Convex Files)

```typescript
// Para subir recibos:
import { v } from "convex/values"
import { FileReferenceValue } from "convex/server"

export const createTransaction = mutation({
  args: {
    receipt: v.optional(v.string()), // fileId de Convex Files
    ...
  },
  handler: async (ctx, args) => {
    // receipt es una referencia al archivo
  }
})
```

---

## Seguridad

- **Clerk manage sessions** (cookies httpOnly automático)
- **Convex valida userId** en cada query/mutation
- **Zod valida en cliente** (UX) + **Convex valida en servidor** (seguridad)
- **Convex Files**: Solo el owner puede ver sus archivos (enforce en schema)
- **CORS**: Vercel + Convex no tienen problemas, Clerk lo maneja

---

## Performance & Scalability

### Convex

- Queries son **local-first** (cached en cliente)
- Mutations sincronizadas automáticamente
- Índices en `userId` + `month` para transacciones
- No hay N+1 queries (Convex resuelve joins automático)

### Next.js

- ISR para páginas estáticas (si aplica)
- `use client` solo en componentes interactivos
- Image optimization con `<Image>`
- Code splitting automático

### Pricing (mes 1 → siempre)

- Convex: $0 (500K ops/mes)
- Clerk: $0 (10k users)
- Vercel: $0 (100GB bandwidth)
- **Total: $0/mes** hasta que crezca

---

## Features MVP

1. ✅ Autenticación con Clerk
2. ✅ Crear/Leer/Actualizar transacciones
3. ✅ Categorías personalizadas
4. ✅ Presupuestos mensuales por categoría
5. ✅ Gráficos de gasto (Recharts)
6. ✅ Upload de recibos (Convex Files)
7. ✅ Responsive (mobile-first)
8. ✅ PWA (offline mode básico con Service Workers)

---

## Comandos útiles

```bash
# Convex
npm run dev          # Starts Convex dev server + Next.js
convex deploy        # Deploy schema a producción
convex logs          # Ver logs del servidor

# Clerk
# No commands needed, todo está en dashboard

# Vercel deploy
vercel deploy        # Deploy a staging
vercel deploy --prod # Deploy a producción

# Testing
npm run test         # Jest + Testing Library (si configuras)
```

---

## Notas Importantes

### Convex

- `npm run dev` inicia automáticamente el servidor Convex
- Cambios en `convex/schema.ts` requieren hot-reload
- Los types se generan automáticamente en `_generated/`
- No uses `Date` directo, usa timestamps (números)

### Clerk

- Los webhooks sincronizarán users a Convex automáticamente
- Session cookie se valida en middleware si configuras
- OAuth tiene que estar habilitado en Clerk Dashboard

### Vercel

- Conecta GitHub repo para deploy automático
- Env vars en Vercel Dashboard (CLERK_SECRET_KEY es sensible)
- Deploy automático en cada push a `main`

### Desarrollo local

```bash
# Terminal 1: Convex dev + Next.js
npm run dev

# Terminal 2 (optional): Convex dashboard
npm run convex:dashboard
```

---

## Resumen ejecutivo

**Stack elegido: Next.js 15 + Convex + Clerk + Vercel**

**Por qué:**

- Zero-config authentication (Clerk)
- Backend completo sin servidor (Convex)
- Deployments instantáneos (Vercel + Next.js)
- Type-safe end-to-end (TypeScript)
- Gratis hasta escalar significativamente

**Costo:** $0/mes por 5 usuarios, uso esporádico **Tiempo setup:** 2-3 horas para estructura base **TTM (Time To Market):** 2-3 semanas (MVP)

---

**Última actualización:** April 28