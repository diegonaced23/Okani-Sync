# Proyecto Okany Sync

> Aplicación PWA de gestión de finanzas personales — enfoque 80% mobile, 20% desktop.

---

## 1. Resumen Ejecutivo

Okany Sync es una Progressive Web App (PWA) en español (es-CO) que centraliza la gestión financiera personal del usuario: cuentas multi-moneda, tarjetas de crédito (con cuotas e intereses compuestos), deudas, transacciones, presupuestos y reportes exportables. Los usuarios solo pueden ser creados desde un panel administrativo y reciben un correo de bienvenida automático vía Resend. Soporta cuentas compartidas entre usuarios.

- Idioma: Español (es-CO), incluyendo comentarios del código.
- Moneda por defecto: COP (Peso Colombiano). Soporte multi-moneda con consolidación por tasa de cambio.
- Autenticación: Clerk con OAuth Google.
- Sin registro público. Solo el administrador crea usuarios.
- Cuentas compartidas: un usuario puede compartir una cuenta con otro con permisos viewer/editor/admin.
- Web Push API para notificaciones del navegador.
- Tema claro/oscuro con toggle animado de https://theme-toggle.rdsx.dev/.
- Dark theme con paleta `#343434` / `#1F262A`. Light theme armoniosa.

---

## 2. Stack Tecnológico

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **Iconos**: lucide-react
- **Validación**: Zod (cliente y servidor)
- **State**: React hooks + Convex queries (sin Redux/Zustand)
- **Gráficos**: Recharts
- **Animaciones**: framer-motion
- **PWA**: next-pwa (Service Workers, manifest, offline básico, Web Push)

### Backend
- **DB + API**: Convex (real-time queries, mutations, storage)
- **Storage**: Convex Files (recibos hasta 5MB por archivo)

### Auth
- **Provider**: Clerk
  - OAuth Google habilitado
  - OAuth Apple deshabilitado por ahora (se agregará luego cuando exista cuenta de Apple Developer)
  - Magic Links opcional
  - Webhook que sincroniza `user.created` / `user.updated` / `user.deleted` a Convex
  - Sin signup público (deshabilitado en Clerk Dashboard)
  - Localización: `esES`

### Emails Transaccionales
- **Provider**: Resend
  - En desarrollo local se usa el remitente de pruebas `onboarding@resend.dev`
  - Cuando exista dominio se configura DNS (SPF/DKIM) y se cambia al remitente final
  - Plantilla con `react-email`
  - Disparado desde una `action` de Convex

### Notificaciones Push
- **Web Push API** (estándar W3C, disponible en Chrome/Edge/Firefox/Safari iOS 16.4+).
- Se almacena la `pushSubscription` del navegador en `users.pushSubscription`.
- Convex action `sendWebPush` envía notificaciones usando librería `web-push` (Node), llamada desde `actions/sendPushNotification.ts`.
- Casos de uso: presupuesto excedido, cuota próxima, deuda vencida, cuenta compartida.

### Hosting
- **Frontend**: Vercel (cuando llegue el momento del deploy)
- **Backend**: Convex Cloud
- **Mientras tanto**: desarrollo local con `npm run dev` (Next.js + Convex dev server)

### Reportes
- **CSV**: librería `papaparse` (export client-side)
- **PDF**: `@react-pdf/renderer` (extracto bancario con logo placeholder)

### Toggle Tema
- Implementación basada en https://theme-toggle.rdsx.dev/.
- Persistencia en `localStorage` + sincronización con `users.theme` en Convex.

### Tasas de Cambio (multi-moneda)
- Tabla `exchangeRates` para histórico.
- Fuente recomendada: https://exchangerate.host (API gratuita, sin key).
- Cron job diario en Convex actualiza tasas COP/USD/EUR/MXN automáticamente.
- El usuario también puede ingresar una tasa manual.

---

## 3. Estructura de Carpetas

```
okany-sync/
├── public/
│   ├── icons/                     # Iconos PWA (192, 512, maskable) - placeholder
│   ├── logo-placeholder.svg       # Logo provisional
│   ├── manifest.json              # Manifest PWA en español
│   └── sw.js                      # Service Worker (generado por next-pwa)
├── src/
│   ├── app/
│   │   ├── layout.tsx             # ClerkProvider + ConvexProvider + ThemeProvider
│   │   ├── page.tsx               # Landing / redirect a /dashboard si autenticado
│   │   ├── (auth)/
│   │   │   └── sign-in/page.tsx   # Solo login (sin sign-up público)
│   │   ├── (app)/
│   │   │   ├── layout.tsx         # Layout con bottom nav (mobile) + sidebar (desktop)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── cuentas/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── compartidas/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── tarjetas/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── deudas/page.tsx
│   │   │   ├── transacciones/page.tsx
│   │   │   ├── categorias/page.tsx
│   │   │   ├── presupuestos/page.tsx
│   │   │   ├── reportes/page.tsx
│   │   │   ├── perfil/page.tsx
│   │   │   └── admin/
│   │   │       ├── page.tsx       # Lista de usuarios
│   │   │       └── usuarios/[id]/page.tsx
│   │   └── api/
│   │       └── webhooks/
│   │           └── clerk/route.ts # Webhook Clerk → Convex sync
│   ├── components/
│   │   ├── ui/                    # shadcn/ui
│   │   ├── layout/
│   │   │   ├── BottomNav.tsx      # Navegación mobile (5 items principales)
│   │   │   ├── Sidebar.tsx        # Navegación desktop
│   │   │   └── Header.tsx
│   │   ├── theme/
│   │   │   └── ThemeToggle.tsx    # Implementación de theme-toggle.rdsx.dev
│   │   ├── dashboard/
│   │   │   ├── BalanceCard.tsx    # Saldo consolidado en moneda preferida
│   │   │   ├── AccountsCarousel.tsx
│   │   │   ├── MonthlyChart.tsx
│   │   │   └── RecentTransactions.tsx
│   │   ├── accounts/
│   │   │   ├── AccountForm.tsx
│   │   │   ├── ShareAccountDialog.tsx
│   │   │   └── SharedAccountBadge.tsx
│   │   ├── cards/
│   │   │   ├── CardForm.tsx
│   │   │   ├── PurchaseForm.tsx   # Form que calcula cuota con interés compuesto
│   │   │   └── InstallmentSchedule.tsx
│   │   ├── debts/
│   │   ├── transactions/
│   │   ├── budgets/
│   │   ├── categories/
│   │   ├── reports/
│   │   ├── notifications/
│   │   │   └── PushSubscriptionBanner.tsx
│   │   └── admin/
│   ├── lib/
│   │   ├── utils.ts               # cn(), formatCurrency(), formatDate() en es-CO
│   │   ├── validators.ts          # Schemas Zod
│   │   ├── constants.ts           # Categorías por defecto, monedas, etc.
│   │   ├── money.ts               # Cálculos financieros (interés compuesto, conversión)
│   │   ├── push.ts                # Subscribe/unsubscribe Web Push
│   │   └── resend.ts              # Cliente Resend
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useTheme.ts
│   │   ├── useCurrency.ts
│   │   ├── useExchangeRate.ts
│   │   └── usePushNotifications.ts
│   └── emails/
│       └── WelcomeEmail.tsx       # Plantilla react-email para correo de bienvenida
├── convex/
│   ├── schema.ts                  # Esquema de la BD
│   ├── auth.config.ts             # Config Clerk JWT
│   ├── users.ts                   # CRUD usuarios + admin
│   ├── accounts.ts
│   ├── accountShares.ts           # Compartir cuentas
│   ├── exchangeRates.ts           # Tasas de cambio
│   ├── cards.ts
│   ├── cardPurchases.ts
│   ├── debts.ts
│   ├── categories.ts
│   ├── budgets.ts
│   ├── transactions.ts
│   ├── reports.ts
│   ├── notifications.ts
│   ├── http.ts                    # Endpoints HTTP (webhook Clerk)
│   ├── crons.ts                   # Tareas programadas (recurrentes, alertas, tasas)
│   └── actions/
│       ├── sendWelcomeEmail.ts
│       ├── sendPushNotification.ts
│       ├── fetchExchangeRates.ts  # Llama a exchangerate.host
│       ├── deleteUserCascade.ts   # Borrado en cascada de un usuario
│       └── generateReport.ts
├── .env.local
├── next.config.mjs
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

---

## 4. Módulos

### 4.1 Login
- Pantalla única `/sign-in` con botón "Continuar con Google".
- Sin formulario de registro. Si el usuario no existe en Clerk, no puede entrar.
- Manejo de errores en español (Clerk localization `esES`).
- Redirección post-login a `/dashboard`.
- Si el usuario tiene `role = admin`, acceso adicional a `/admin`.

### 4.2 Dashboard
- Saludo personalizado.
- **Balance total consolidado**: suma de cuentas (propias + compartidas con permiso viewer/editor/admin) convertidas a la moneda preferida del usuario (COP por defecto) usando la última tasa de `exchangeRates`. Resta deudas activas.
- Carrusel/lista de cuentas registradas (con badge de "Compartida" si aplica).
- Gráfico de gastos del mes por categoría (Pie Chart, Recharts).
- Gráfico de tendencia mensual de últimos 6 meses (Line Chart).
- Lista de últimas 5-10 transacciones.
- CTA flotante "+" para registrar transacción rápida.

### 4.3 Cuentas
- Lista combinada: cuentas propias + compartidas conmigo (separador visual).
- Cuenta por defecto **Billetera** creada al registrar al usuario.
- Botón "+ Agregar cuenta" abre Sheet con formulario:
  - Nombre, tipo, banco, número (últimos 4), saldo inicial, **moneda**, color, icono.
- Detalle de cuenta `/cuentas/[id]`:
  - Saldo en moneda original + equivalente en moneda preferida.
  - Transacciones de esa cuenta, gráfico mensual.
  - Sección "Compartida con": lista de usuarios con su permiso, botón para invitar/revocar.
  - Botón editar/archivar (solo el dueño puede editar y archivar).
- Pantalla `/cuentas/compartidas`:
  - Invitaciones recibidas pendientes (aceptar/rechazar).
  - Cuentas compartidas conmigo activas (botón salir de compartido).

### 4.4 Tarjetas
Las tarjetas son **personales** (no se comparten).
- Lista con: cupo total, deuda actual, cupo disponible, día de corte, día de pago, moneda.
- Detalle:
  - Resumen del periodo actual.
  - Lista de compras a cuotas activas con desglose capital/interés.
  - Cronograma de cuotas pendientes.
- Formulario nueva tarjeta:
  - Nombre, banco, marca, últimos 4 dígitos, cupo, día de corte, día de pago, **tasa mensual default** (opcional), **moneda**, color, icono.
- Formulario nueva compra:
  - Descripción, monto total, número de cuotas, **¿genera intereses?** (toggle), tasa (si aplica, default la de la tarjeta).
  - Si tiene interés: el sistema calcula automáticamente la cuota mensual con **interés compuesto** y muestra preview del cronograma:
    - **Fórmula**: `M = P × (i × (1+i)^n) / ((1+i)^n − 1)`
    - Donde: M = cuota mensual, P = monto, i = tasa mensual decimal, n = número de cuotas.
    - **Ejemplo**: 500.000 COP a 8% mensual / 3 cuotas → cuota ≈ 194.014 COP, interés total ≈ 82.041 COP.
  - Genera N filas en `cardInstallments` con desglose `principalAmount` + `interestAmount` + `remainingPrincipal`.

### 4.5 Deudas
- Lista de deudas con saldo pendiente, tipo, estado (activa/pagada/vencida), moneda.
- Formulario:
  - Nombre, descripción, acreedor, tipo, monto original, saldo pendiente, tasa mensual (opc.), cuota mensual sugerida (opc.), fecha inicio, fecha límite (opc.), moneda.
- Botón "Registrar pago": crea transacción tipo `pago_deuda` y registro en `debtPayments`, descuenta de `currentBalance`.

### 4.6 Perfil
- Cambiar nombre (sincroniza a Clerk).
- Cambiar contraseña (Clerk password reset flow).
- Lista de sesiones activas + botón "Cerrar sesión" (Clerk session revoke) y "Cerrar todas las demás".
- Configuración de tema (light / dark / system).
- **Configuración de moneda preferida** (default COP).
- **Configuración de localización** (default es-CO).
- **Activar/desactivar Web Push** (con banner de permiso del navegador).

### 4.7 Categorías
- Lista separada por tipo: Ingreso / Gasto.
- Categorías por defecto creadas al registrar usuario:
  - Gastos: Alimentación, Transporte, Vivienda, Servicios, Salud, Entretenimiento, Educación, Ropa, Otros.
  - Ingresos: Salario, Freelance, Inversiones, Regalos, Otros.
- CRUD: crear, editar (nombre, color, icono), archivar (soft delete) y eliminar (solo si no tiene transacciones).
- Subcategorías opcionales vía `parentId`.

### 4.8 Admin
- Acceso restringido a `users.role === "admin"`.
- Lista de usuarios con búsqueda, filtros (rol, estado).
- Crear usuario:
  - Formulario: nombre, email, rol.
  - Action en Convex: `clerkClient.users.createUser` → `db.insert("users", ...)` → `scheduler.runAfter(0, sendWelcomeEmail, ...)`.
- Editar usuario (nombre, rol, estado activo/inactivo).
- **Eliminar usuario (borrado en cascada)**:
  - Action `deleteUserCascade` ejecuta en transacción:
    1. Elimina `transactions`, `cardInstallments`, `cardPurchases`, `cards`, `debtPayments`, `debts`, `budgets`, `categories`, `recurringTransactions`, `notifications`, `sessions` del usuario.
    2. Elimina `accounts` propias + sus `accountShares`.
    3. Para `accountShares` donde el usuario es `sharedWithUserId`: revoca el acceso.
    4. Elimina archivos en Convex Files asociados a sus transacciones.
    5. Elimina el usuario en Clerk (`clerkClient.users.deleteUser`).
    6. Elimina el documento en `users`.
    7. Inserta entrada en `auditLogs` con `action: "user.deleted"` y metadata del conteo eliminado.
  - Confirmación con doble factor: el admin debe escribir el email del usuario para confirmar.

### 4.9 Presupuestos
- Lista de presupuestos del mes seleccionado.
- Cada presupuesto: categoría, monto (en moneda preferida), gastado, % avance, barra de progreso.
- Alerta visual cuando supera `alertThreshold` (default 80%) + Web Push si está activo.
- Crear/editar: categoría + monto + mes.
- Selector de mes (anteriores/futuros).
- Mutation interna recalcula `spent` cuando se crea/edita/elimina transacción de gasto.

### 4.10 Reportes
- Filtros:
  - Rango: mes actual, mes anterior, rango personalizado, año actual.
  - Cuenta(s): todas o selección múltiple (incluye compartidas).
  - Tarjeta(s): todas o selección múltiple.
  - Categoría(s) opcional.
  - Moneda: filtrar por moneda específica o consolidar todo a moneda preferida.
- Generación:
  - **CSV**: download con `papaparse`. Columnas: fecha, descripción, categoría, cuenta/tarjeta, tipo, monto, moneda, monto consolidado, notas.
  - **PDF**: estilo extracto bancario con `@react-pdf/renderer`. Header con logo placeholder, datos del usuario, periodo, totales (ingresos / gastos / neto) en moneda preferida, tabla agrupada por fecha.

### 4.11 Transacciones
- Lista cronológica con virtual scroll.
- Filtros: tipo, cuenta, tarjeta, categoría, rango, búsqueda por texto.
- Vista detalle: monto + moneda, descripción, categoría, cuenta/tarjeta, fecha, recibo adjunto (opcional), notas, etiquetas.
- Crear transacción:
  - Tipo: ingreso / gasto / transferencia / pago tarjeta / pago deuda.
  - Si gasto/ingreso: cuenta o tarjeta + categoría.
  - Si transferencia: cuenta origen + cuenta destino. Si las monedas difieren, pedir tasa de cambio (autollenada con la última de `exchangeRates`).
  - Si tarjeta: opcional convertir en compra a cuotas (ver módulo Tarjetas).
  - **Adjuntar recibo SIEMPRE OPCIONAL** (Convex Files, máx 5MB).
- Editar / eliminar (con confirmación). Eliminar revierte saldo de la cuenta correspondiente.

---

## 5. Base de Datos (Convex)

> El esquema completo está en `convex/schema.ts`. Resumen de tablas:

| Tabla | Propósito | Índices clave |
|-------|-----------|---------------|
| `users` | Usuarios sincronizados desde Clerk + push subscription | `by_clerkId`, `by_email`, `by_role` |
| `accounts` | Cuentas (con `ownerId`, soporta multi-moneda) | `by_owner`, `by_owner_archived`, `by_owner_type` |
| `accountShares` | Permisos de cuentas compartidas | `by_account`, `by_shared_user`, `by_owner`, `by_shared_user_status` |
| `exchangeRates` | Histórico de tasas de cambio | `by_pair`, `by_pair_date` |
| `cards` | Tarjetas de crédito (personales) | `by_user`, `by_user_archived` |
| `cardPurchases` | Compras (con interés compuesto) | `by_user`, `by_card`, `by_user_status` |
| `cardInstallments` | Cronograma con desglose capital/interés | `by_purchase`, `by_user_month`, `by_card_month`, `by_user_paid` |
| `debts` | Deudas registradas | `by_user`, `by_user_status` |
| `debtPayments` | Pagos a deudas | `by_debt`, `by_user_month` |
| `categories` | Categorías personales | `by_user`, `by_user_type`, `by_user_archived` |
| `budgets` | Presupuestos por categoría/mes | `by_user_month`, `by_user_category_month` |
| `transactions` | Movimientos (incluye campos para conversión) | `by_user`, `by_user_month`, `by_user_date`, `by_account`, `by_account_month`, `by_card`, `by_user_type_month`, `by_user_category_month` |
| `recurringTransactions` | Plantillas para auto-generar | `by_user`, `by_user_active`, `by_next_occurrence` |
| `sessions` | Log de sesiones | `by_user`, `by_clerk_session` |
| `auditLogs` | Auditoría (incluye borrados en cascada) | `by_user`, `by_action`, `by_target` |
| `notifications` | Alertas in-app + flag de Web Push enviado | `by_user`, `by_user_read`, `by_user_push_sent` |

### Reglas de integridad
- Cada query/mutation valida `userId === ctx.auth.getUserIdentity().subject` (excepciones para `role: admin`).
- **Acceso a cuentas**: una mutation/query sobre una cuenta debe verificar que el `userId` actual sea `accounts.ownerId` o tenga un `accountShares.status === "aceptada"`.
- **Borrado en cascada de usuario**: implementado en `actions/deleteUserCascade.ts`. Los datos no se conservan.
- **Eliminación de cuenta**: borra transacciones, shares, archivos. Solo el `ownerId` puede eliminar.
- `accounts.balance` y `cards.currentBalance` se actualizan transaccionalmente con cada transacción.
- `budgets.spent` se recalcula en helper interno.
- `accountShares` requieren aceptación: el usuario invitado puede aceptar/rechazar antes de tener acceso.

---

## 6. Permisos de Cuentas Compartidas

No se necesita un nuevo rol global. Se manejan **permisos por cuenta** vía `accountShares.permission`:

| Permiso | Puede ver | Puede crear transacciones | Puede editar/archivar cuenta | Puede compartir con otros |
|---------|-----------|---------------------------|------------------------------|---------------------------|
| `viewer` | ✅ | ❌ | ❌ | ❌ |
| `editor` | ✅ | ✅ | ❌ | ❌ |
| `admin` | ✅ | ✅ | ✅ (excepto eliminar) | ✅ |
| `owner` (implícito) | ✅ | ✅ | ✅ | ✅ + eliminar |

Helper `convex/lib/permissions.ts` con funciones:
- `assertCanRead(ctx, accountId)`
- `assertCanWrite(ctx, accountId)`
- `assertCanManage(ctx, accountId)`
- `assertIsOwner(ctx, accountId)`

---

## 7. Sincronización Clerk ↔ Convex

1. Clerk emite webhook firmado a `/api/webhooks/clerk`.
2. El handler verifica firma con `svix` y llama a Convex (`internalMutation` `users.upsertFromClerk`).
3. Eventos manejados:
   - `user.created`: inserta documento en `users` (rol por defecto: `user`, locale `es-CO`, currency `COP`).
   - `user.updated`: sincroniza nombre, email, imagen.
   - `user.deleted`: dispara `deleteUserCascade`.
4. Al crear el primer admin: script manual `npx convex run users:promoteToAdmin --email it.boccol@gmail.com` o setear `publicMetadata.role = "admin"` en Clerk Dashboard.

---

## 8. Flujo de Creación de Usuarios (Admin)

```
Admin → /admin → "Nuevo usuario"
  ↓
Convex action `users.createByAdmin`:
  1. clerkClient.users.createUser({ emailAddress, firstName, ... })
  2. db.insert("users", { clerkId, email, name, role, locale: "es-CO", currency: "COP", ... })
  3. db.insert("auditLogs", { action: "user.created", ... })
  4. scheduler.runAfter(0, "actions/sendWelcomeEmail", { userId })
  ↓
Action `sendWelcomeEmail`:
  - resend.emails.send({
      from: "Okany Sync <onboarding@resend.dev>", // Dominio dev
      to: user.email,
      subject: "Bienvenido a Okany Sync",
      react: WelcomeEmail({ name, signInUrl })
    })
  - db.patch(userId, { welcomeEmailSentAt: Date.now() })
```

---

## 9. Multi-moneda y Tasas de Cambio

### Almacenamiento
- Cada cuenta, tarjeta, deuda, transacción tiene su propio campo `currency`.
- Saldos se guardan en la moneda original (sin conversión).
- `users.currency` guarda la moneda preferida del usuario (default `COP`).

### Consolidación
- Al mostrar el balance total en Dashboard:
  - Para cada cuenta, si `account.currency === user.currency` → suma directa.
  - Si difieren → busca la última `exchangeRates` activa para ese par y convierte.
  - Si no hay tasa: muestra el saldo en moneda original con badge de advertencia.

### Actualización de tasas
- Cron diario (`convex/crons.ts`) corre `actions/fetchExchangeRates.ts`.
- Llama a `https://api.exchangerate.host/latest?base=COP&symbols=USD,EUR,MXN,GBP` (gratis, sin API key).
- Inserta nuevas filas en `exchangeRates` con `source: "api"`.
- El usuario también puede ingresar tasa manual desde `/perfil`.

### Transferencias multi-moneda
- Al transferir entre cuentas con monedas distintas, el form pide la tasa (autollenada con la última conocida).
- La transacción guarda `amount` + `currency` (origen) y `toAmount` + `toCurrency` + `exchangeRate` (destino).

---

## 10. Cálculo de Cuotas con Interés Compuesto

### Fórmula
```
M = P × (i × (1+i)^n) / ((1+i)^n − 1)
```
Donde:
- `M` = cuota mensual a pagar
- `P` = monto base de la compra
- `i` = tasa de interés mensual en decimal (8% = 0.08)
- `n` = número de cuotas

### Ejemplo del usuario
- Compra: 500.000 COP, 8% mensual, 3 cuotas.
- (1 + 0.08)^3 = 1.259712
- M = 500.000 × (0.08 × 1.259712) / (1.259712 − 1) = 500.000 × 0.388034 ≈ **194.017 COP**
- Total a pagar: 582.051 COP. Interés total: 82.051 COP.

### Cronograma con desglose
Para cada cuota se almacena en `cardInstallments`:
- `amount`: cuota fija (~194.017)
- `interestAmount`: saldo restante × tasa (mes 1: 500.000 × 0.08 = 40.000)
- `principalAmount`: amount − interestAmount (mes 1: 154.017)
- `remainingPrincipal`: saldo restante − principal (mes 1: 345.983)

### Helper
```ts
// src/lib/money.ts
export function calculateInstallment(
  principal: number,
  monthlyRate: number,
  installments: number
): {
  amountPerInstallment: number;
  totalWithInterest: number;
  totalInterest: number;
  schedule: Array<{
    installmentNumber: number;
    amount: number;
    principalAmount: number;
    interestAmount: number;
    remainingPrincipal: number;
  }>;
}
```

---

## 11. Web Push Notifications

### Setup
1. Generar VAPID keys: `npx web-push generate-vapid-keys`.
2. Añadir a `.env.local`:
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:it.boccol@gmail.com
   ```
3. En cliente: `usePushNotifications` hook pide permiso, suscribe el SW, envía la `subscription` a Convex (`users.savePushSubscription`).
4. En servidor: action `sendPushNotification` usa `web-push` para enviar payload a la subscription guardada.

### Casos de uso
- Presupuesto al 80% / 100%.
- Cuota de tarjeta próxima a vencer (3 días antes).
- Deuda vencida.
- Pago de tarjeta próximo (cutoffDay+5).
- Cuenta compartida contigo (invitación).
- Aceptación de invitación a cuenta compartida.

### iOS
- iOS 16.4+ soporta Web Push solo para PWA instalada (Add to Home Screen). Documentar este requisito en el banner de permiso.

---

## 12. Tema y Diseño

### Variables CSS (Tailwind)

#### Dark Theme
```css
--background: #1F262A;       /* Fondo principal */
--surface: #343434;          /* Cards, sheets */
--surface-elevated: #2A3236; /* Hover, popovers */
--border: #3D4448;
--text-primary: #F5F5F5;
--text-secondary: #A3A8AB;
--accent: #4ADE80;           /* Verde para ingresos / positivos */
--danger: #EF4444;           /* Rojo para gastos / negativos */
--warning: #F59E0B;
--info: #38BDF8;
```

#### Light Theme (paleta armoniosa)
```css
--background: #FAFAF9;       /* Off-white cálido */
--surface: #FFFFFF;
--surface-elevated: #F5F5F4;
--border: #E7E5E4;
--text-primary: #1C1917;
--text-secondary: #57534E;
--accent: #16A34A;
--danger: #DC2626;
--warning: #D97706;
--info: #0284C7;
```

### Toggle de Tema
- Componente `ThemeToggle.tsx` basado en https://theme-toggle.rdsx.dev/.
- `next-themes` para persistencia + SSR-safe.
- Sincroniza con `users.theme` en Convex cuando hay sesión.

### Layout Mobile-First
- **Bottom nav** (mobile, 5 items): Dashboard, Transacciones, "+" central (FAB), Cuentas, Más.
- **Sidebar** (desktop ≥ 1024px): navegación lateral con todos los módulos.
- Componentes usan `Sheet` (mobile) / `Dialog` (desktop) según viewport.

---

## 13. Configuración PWA

- `public/manifest.json`: `name: "Okany Sync"`, `short_name: "Okany"`, `lang: "es-CO"`, theme color `#1F262A`, background `#1F262A`.
- Iconos placeholder 192/512/maskable hasta tener logo final.
- `next-pwa` con runtime caching para queries Convex (`NetworkFirst` + fallback offline).
- Splash screen iOS via meta tags.
- Apple touch icon placeholder.
- **Service Worker** registra suscripción Web Push.

---

## 14. Variables de Entorno

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard

# Convex
NEXT_PUBLIC_CONVEX_URL=
CONVEX_DEPLOY_KEY=

# Resend (en dev usa onboarding@resend.dev)
RESEND_API_KEY=
RESEND_FROM_EMAIL=Okany Sync <onboarding@resend.dev>

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:it.boccol@gmail.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 15. Seguridad

- Todas las queries/mutations en Convex validan identidad con `ctx.auth.getUserIdentity()`.
- Permisos de cuenta validados con helpers `assertCanRead/Write/Manage/Owner`.
- Acciones admin verifican `role === "admin"`.
- Webhook Clerk valida firma con `svix`.
- Validación dual: Zod en cliente + Convex `v.*` en servidor.
- Recibos en Convex Files solo accesibles vía URL firmada generada por mutation autenticada.
- Audit log para acciones admin, borrado en cascada, compartir cuentas, cambios de rol.
- **Borrado en cascada confirmado con doble entrada**: el admin debe escribir el email del usuario.

---

## 16. Convenciones de Código

- **Idioma**: español para UI, mensajes de error y comentarios. Identificadores en inglés.
- **Componentes**: PascalCase.
- **Hooks**: prefijo `use`, camelCase.
- **Convex**: archivos en plural minúscula (`accounts.ts`, `transactions.ts`).
- **Tipos**: `Doc<"tableName">` y `Id<"tableName">` de Convex.
- **Formato monetario**: `formatCurrency(amount, currency)` usando `Intl.NumberFormat("es-CO", { style: "currency", currency })`.
- **Fechas**: `formatDate(timestamp)` con `date-fns/locale/es`.

---

## 17. Roadmap de Implementación

| Sprint | Entregables |
|--------|-------------|
| 1 | Setup: Next.js + Convex + Clerk (Google) + Tailwind + shadcn + PWA + Theme Toggle |
| 2 | Auth + Sync Clerk-Convex + Layouts mobile/desktop |
| 3 | Cuentas multi-moneda + Categorías (seed) + Transacciones básicas |
| 4 | Cuentas compartidas (`accountShares`) + Permisos |
| 5 | Tarjetas + Compras a cuotas con interés compuesto + Cronograma |
| 6 | Deudas + Pagos + Presupuestos |
| 7 | Tasas de cambio + Consolidación dashboard + Reportes (CSV + PDF) |
| 8 | Web Push + Notificaciones + Crons |
| 9 | Admin (CRUD usuarios + cascada) + Resend (welcome email) + Audit logs |
| 10 | Perfil + Sesiones + Pulido UX + Pruebas + Deploy local→Vercel |

---

## 18. Dependencias Principales

```json
{
  "dependencies": {
    "@clerk/nextjs": "^5.x",
    "@clerk/themes": "^2.x",
    "@clerk/localizations": "^2.x",
    "convex": "^1.x",
    "@convex-dev/auth": "^0.x",
    "next": "15.x",
    "react": "19.x",
    "react-dom": "19.x",
    "tailwindcss": "^3.x",
    "zod": "^3.x",
    "recharts": "^2.x",
    "framer-motion": "^11.x",
    "next-themes": "^0.x",
    "next-pwa": "^5.x",
    "resend": "^4.x",
    "react-email": "^3.x",
    "@react-email/components": "^0.x",
    "papaparse": "^5.x",
    "@react-pdf/renderer": "^4.x",
    "date-fns": "^3.x",
    "lucide-react": "^0.x",
    "svix": "^1.x",
    "web-push": "^3.x"
  }
}
```

---

## 19. Anotaciones Importantes para la Construcción

1. **No registrar usuarios públicos**: deshabilitar sign-up en Clerk Dashboard.
2. **Seed inicial al crear usuario**: en `users.upsertFromClerk` (o action equivalente), crear automáticamente:
   - Cuenta `Billetera` (`isDefault: true`, `currency: "COP"`).
   - Categorías por defecto (`isDefault: true`).
3. **Convex no acepta `Date`**: siempre usar `Date.now()` y números.
4. **`month`** se calcula con `format(new Date(timestamp), "yyyy-MM", { locale: es })`.
5. **Mutations transaccionales**: crear transacción + actualizar saldo cuenta/tarjeta + actualizar `spent` presupuesto en una sola mutation.
6. **Cuotas de tarjeta**: al crear compra, generar todas las cuotas + desglose capital/interés. Mutation que paga cuota crea `transaction` tipo `pago_tarjeta`, marca `paid: true`, actualiza `paidInstallments`.
7. **Transferencias entre monedas**: validar que `exchangeRate` esté presente cuando origen/destino tienen monedas distintas.
8. **Soft delete vs cascada**: cuentas/tarjetas/categorías usan `archived` (soft). Eliminación de **usuario** es cascada total.
9. **Permisos cuentas compartidas**: usar helpers `assertCanRead/Write/Manage/Owner` en TODAS las mutations/queries que tocan accounts/transactions.
10. **PWA offline**: solo lectura cacheada en MVP. No se soportan mutations offline.
11. **Web Push**: documentar en banner que iOS requiere instalar PWA (Add to Home Screen) para recibir push.
12. **Email de bienvenida**: en dev usar `onboarding@resend.dev`; cuando exista dominio real, configurar SPF/DKIM y cambiar remitente.
13. **Theme toggle**: envolver con `mounted` flag para evitar hydration mismatch.
14. **Localización Clerk**: `<ClerkProvider localization={esES}>`.
15. **Crons**: `convex/crons.ts` con jobs:
    - Diario: actualizar `exchangeRates`, generar `recurringTransactions`, revisar cuotas próximas + presupuestos para crear notificaciones + Web Push.
16. **Tasa de cambio fallback**: si la API de exchangerate.host falla, usar la última tasa conocida y emitir warning en logs.

---

## 20. Configuración Pendiente (cuando exista dominio)

- Configurar dominio real en Vercel.
- Agregar registros DNS (SPF, DKIM, DMARC) en Resend.
- Cambiar `RESEND_FROM_EMAIL` al remitente del dominio.
- Actualizar `NEXT_PUBLIC_APP_URL` y URLs de callback en Clerk.

---

**Última actualización**: 2026-04-28
