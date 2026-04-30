# Informe de Seguridad — Okany Sync v0.1.0

**Fecha de auditoría:** 2026-04-29
**Fecha de remediación:** 2026-04-29
**Alcance:** Revisión completa del código fuente (backend Convex, frontend Next.js 16, configuración de infraestructura)
**Auditor:** Security Auditor Agent

---

## Resumen Ejecutivo

**Estado general: Completamente auditado y remedado 🟢**

Todas las vulnerabilidades críticas, altas, medias y bajas han sido corregidas o documentadas como intencionales. La superficie de ataque está significativamente reducida. Solo quedan pendientes menores de infraestructura (activar CSP enforcement, configurar `VAPID_SUBJECT`) y mejoras de hardening de segundo orden (rate limiting con `convex-helpers`).

**Cambios aplicados el 2026-04-29 (Críticos y Altos):**
- ✅ **C-1** — IDOR en `listByAccountMonth` eliminado; usa `assertCanRead` del sistema de permisos.
- ✅ **A-1** — Inyección HTML en template de email eliminada; `escapeHtml` aplicado a `name` y `signInUrl`.
- ✅ **A-2** — Validación de límites en handlers `create` y `update` de `transactions`, `accounts`, `cards` y `budgets`.
- ✅ **A-3** — Parámetros `limit` acotados a máximo 100 en `transactions.listRecent` y `notifications.listRecent`.
- ✅ **A-4** — CSP en modo `Report-Only` en `next.config.ts`; pasar a enforcement tras 24-48h en producción.

**Cambios aplicados el 2026-04-29 (Medios):**
- ✅ **M-1** — Mensaje de error unificado en `accountShares.share`; no revela si un email está registrado.
- ✅ **M-2 (parcial)** — Rate limiting manual en `accountShares.share` y `transactions.create`; pendiente `convex-helpers` para cobertura completa.
- ✅ **M-3** — Bloqueo de democión y desactivación del último admin activo en `users.updateByAdmin`.
- ✅ **M-4** — PII (email) eliminado de `console.log` en `deleteUserCascade` y `sendWelcomeEmail`.
- ✅ **M-5** — `monthlySummary` limita el array `months` a un máximo de 24 elementos.
- ✅ **M-6** — `VAPID_SUBJECT` ya no tiene fallback hardcodeado; falla explícitamente si no está configurada.

**Cambios aplicados el 2026-04-29 (Bajos):**
- ✅ **B-1** — Cerrado como intencional: `proxy.ts` es el estándar de Next.js 16+.
- ✅ **B-2** — Validación de formato de email añadida antes de la búsqueda en BD en `accountShares.share`.
- ✅ **B-3** — Cotas de monto y longitud añadidas en `debts.create`, `debts.update` y `debts.addPayment`.
- ✅ **B-4** — Whitelist de MIME types en `transactions.create` para `receiptStorageId` (JPEG, PNG, WebP, PDF).
- ✅ **B-5** — Cerrado como informativo: `sessions` es log de auditoría, no control de acceso.
- ✅ **B-6** — `getByClerkId` restringido a propio usuario o admin; verificado que no hay call sites en el frontend.

---

## Vulnerabilidades Críticas

### C-1: IDOR — Lectura de transacciones de cuentas ajenas ✅ CORREGIDO

**Archivo:** `convex/transactions.ts`
**Severidad:** CRÍTICO → Resuelto

**Descripción:**
La query `listByAccountMonth` primero busca todas las transacciones de una cuenta usando el índice `by_account_month`, y luego intenta filtrar por el usuario autenticado con:

```typescript
return direct.filter((t) => t.userId === clerkId || t.accountId === accountId);
```

La condición `t.accountId === accountId` siempre es verdadera para todos los registros retornados del índice (que usa exactamente ese campo como clave). El filtro es por tanto una no-operación — retorna el 100% de las filas sin importar quién sea `clerkId`. Cualquier usuario autenticado que conozca un `Id<"accounts">` puede leer todas las transacciones de esa cuenta.

El ID de una cuenta puede filtrarse de múltiples formas: un share previamente revocado, una URL guardada de `/cuentas/[id]`, o fuerza bruta de IDs de Convex (que son secuenciales o predecibles en algunas versiones).

**Impacto:** Un usuario puede leer el historial financiero completo de otro usuario, incluyendo montos, descripciones, fechas y categorías de todas sus transacciones.

**Corrección aplicada:**

```typescript
// convex/transactions.ts — listByAccountMonth
handler: async (ctx, { accountId, month }) => {
  await assertCanRead(ctx, accountId); // verifica owner/admin/editor/viewer
  return await ctx.db
    .query("transactions")
    .withIndex("by_account_month", (q) =>
      q.eq("accountId", accountId).eq("month", month)
    )
    .order("desc")
    .collect();
},
```

---

## Vulnerabilidades Altas

### A-1: Inyección HTML en template de email de bienvenida ✅ CORREGIDO

**Archivo:** `convex/lib/emailTemplates.ts`
**Severidad:** ALTO → Resuelto

**Descripción:**
La función `welcomeEmailHtml` interpola directamente los parámetros `name` y `signInUrl` en HTML sin escapado:

```typescript
¡Bienvenido, ${name}! 👋
...
<a href="${signInUrl}" ...>
```

El campo `name` proviene del perfil de Clerk, que el usuario controla. Un admin que crea un usuario con nombre `<img src=x onerror=alert(1)>` inyecta ese HTML en el email enviado al nuevo usuario. El campo `signInUrl` proviene de `process.env.NEXT_PUBLIC_APP_URL`, que si es manipulada en entornos comprometidos puede resultar en un enlace de phishing en el email.

**Impacto:** Inyección de contenido en emails enviados desde el dominio de la aplicación. Posible phishing o exfiltración de datos si el cliente de email renderiza el HTML inyectado.

**Corrección aplicada:**

```typescript
// convex/lib/emailTemplates.ts
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function welcomeEmailHtml(name: string, signInUrl: string): string {
  const safeName = escapeHtml(name);
  const safeSignInUrl = signInUrl.startsWith("https://") ? escapeHtml(signInUrl) : "#";
  // usar safeName y safeSignInUrl en el template
}
```

---

### A-2: Ausencia generalizada de validación de límites en el backend Convex ✅ CORREGIDO

**Archivos:** `convex/transactions.ts`, `convex/accounts.ts`, `convex/cards.ts`, `convex/budgets.ts`
**Severidad:** ALTO → Resuelto

**Descripción:**
Los schemas de Convex (`v.string()`, `v.number()`) sólo validan el tipo de dato, no los límites. Los schemas Zod en `src/lib/validators.ts` son exclusivamente frontend y nunca se aplican en el backend. Ejemplos concretos:

1. `transactions.create`: `amount: v.number()` acepta valores negativos, cero, `Infinity` o `Number.MAX_SAFE_INTEGER`. Un monto negativo pasado como gasto aumentaría el saldo de la cuenta indefinidamente.
2. `transactions.create`: `description: v.string()` y `notes: v.optional(v.string())` aceptan cadenas de longitud arbitraria — posible ataque de amplificación de almacenamiento.
3. `transactions.create`: `currency: v.string()` acepta cualquier cadena como código de moneda.
4. `accountShares.share`: El email del invitado no tiene validación de formato; sólo se hace `.toLowerCase().trim()`.
5. `accounts.create`: `accountNumber: v.optional(v.string())` puede recibir cadenas de longitud arbitraria.

**Impacto:** Corrupción de datos, ataques de amplificación de almacenamiento, comportamiento inesperado en cálculos de saldos.

**Corrección aplicada:** Validación manual al inicio de cada handler `create` y `update` en todos los módulos afectados:

- `transactions.create` y `update`: monto > 0, monto ≤ 9.999.999.999, descripción 1-200 chars, notas ≤ 500 chars, currency `/^[A-Za-z]{3}$/`
- `transactions.createTransfer`: mismas cotas de monto, descripción y notas
- `accounts.create` y `update`: nombre 1-100 chars, saldo inicial ≥ 0, currency válido, accountNumber ≤ 50 chars, notas ≤ 500 chars
- `cards.create` y `update`: nombre 1-100 chars, límite > 0, currency válido, cutoffDay/paymentDay 1-31, interestRate 0-1000, lastFourDigits exactamente 4 dígitos
- `budgets.create` y `update`: monto > 0, currency válido, alertThreshold 0-100, notas ≤ 500 chars

---

### A-3: Parámetros `limit` no acotados exponen escaneos completos de tabla ✅ CORREGIDO

**Archivos:** `convex/transactions.ts`, `convex/notifications.ts`
**Severidad:** ALTO → Resuelto

**Descripción:**
Las queries `listRecent` y `listRecent` (notificaciones) aceptan un parámetro `limit` opcional de tipo `v.optional(v.number())` sin cota superior. Un cliente malicioso puede pasar `Number.MAX_SAFE_INTEGER`, forzando a Convex a iterar toda la tabla.

```typescript
// Convex permite esto sin restricción alguna:
transactions.listRecent({ limit: 9007199254740991 })
```

**Impacto:** DoS de la función, posible exceso del límite de datos de Convex (4MB por respuesta), costo computacional innecesario.

**Corrección aplicada:**

```typescript
const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
// .take(safeLimit) — máximo 100 registros por llamada
```

Aplicado en `transactions.listRecent` y `notifications.listRecent`.

---

### A-4: Ausencia de Content Security Policy (CSP) ✅ IMPLEMENTADO (Report-Only)

**Archivo:** `next.config.ts`
**Severidad:** ALTO → Parcialmente Resuelto

**Descripción:**
El archivo `next.config.ts` define varios headers de seguridad correctos (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `HSTS`, `Referrer-Policy`, `Permissions-Policy`) pero omite completamente `Content-Security-Policy`. CSP es la defensa más efectiva del navegador contra XSS. Sin ella, cualquier XSS inyectado puede ejecutar scripts arbitrarios, robar cookies de sesión, o exfiltrar datos hacia dominios externos.

**Impacto:** Ausencia de barrera de defensa en profundidad ante XSS. Si se introduce una vulnerabilidad XSS, el atacante tiene capacidad total de ejecución de scripts en el contexto del usuario.

**Corrección aplicada:**

Añadido `Content-Security-Policy-Report-Only` en `next.config.ts` cubriendo Convex (REST + WebSocket), Clerk, Cloudflare Turnstile (bot detection de Clerk), Sentry y Serwist Service Worker.

**Acción pendiente:** Tras 24-48h de monitoreo en producción sin falsos positivos, cambiar la clave de `Content-Security-Policy-Report-Only` a `Content-Security-Policy` para pasar a modo enforcement. Revisar violaciones en consola del navegador y/o Sentry antes de activar.

Nota: `unsafe-inline` en `script-src` es actualmente necesario para Clerk. Evaluar nonces via `next/headers` como mejora futura para eliminarlo.

---

## Riesgos Medios

### M-1: Enumeración de usuarios vía mensajes de error diferenciados en `accountShares.share` ✅ CORREGIDO

**Archivo:** `convex/accountShares.ts`
**Severidad:** MEDIO → Resuelto

**Descripción:**
La mutation `share` retornaba mensajes de error distintos según si el email existe o no en la base de datos, permitiendo enumerar usuarios registrados combinado con el abuso de peticiones en masa.

**Corrección aplicada:**
Mensaje unificado que no revela si el email existe en el sistema:

```typescript
if (!invitedUser) {
  throw new Error("No se pudo completar la invitación. Verifica el correo e intenta de nuevo.");
}
```

**Limitación conocida:** La unificación del mensaje reduce pero no elimina completamente el vector (sigue existiendo un timing diferencial mínimo entre consulta a BD exitosa vs. fallida). Una defensa completa requeriría "always-success-apparent" + invitación por email independiente del registro — se deja como mejora futura por ser un rework significativo.

---

### M-2: Ausencia de rate limiting en endpoints críticos ✅ PARCIALMENTE CORREGIDO

**Archivos:** `convex/accountShares.ts`, `convex/transactions.ts`
**Severidad:** MEDIO → Parcialmente resuelto

**Descripción:**
Ninguna mutation de Convex implementaba rate limiting o throttling, exponiendo a enumeración de usuarios, abuso de operaciones costosas y spam de invitaciones.

**Corrección aplicada:** Rate limiting manual con patrón `.take(N+1)` (O(1) en BD) en las dos mutaciones más críticas:

- `accountShares.share`: máximo 10 invitaciones por minuto por usuario
- `transactions.create`: máximo 30 transacciones por minuto por usuario

```typescript
// Patrón usado en ambas mutaciones:
const recent = await ctx.db
  .query("accountShares")
  .withIndex("by_owner", (q) => q.eq("ownerId", currentUser.clerkId))
  .order("desc")
  .take(11);
const cutoff = Date.now() - 60_000;
if (recent.filter(s => s.invitedAt >= cutoff).length >= 10)
  throw new Error("Demasiadas invitaciones en poco tiempo. Intenta de nuevo en un minuto.");
```

**Remanentes sin rate limit** (riesgo bajo a medio — registrar para siguiente iteración):
- `pushSubscriptions.save` — spam de suscripciones push
- `adminUsers.createByAdmin` — creación masiva de usuarios admin
- Para cobertura completa, instalar `convex-helpers` y usar su `RateLimiter` basado en ventana fija.

---

### M-3: Self-demotion/desactivación del último administrador activo no bloqueada ✅ CORREGIDO

**Archivo:** `convex/users.ts`
**Severidad:** MEDIO → Resuelto

**Descripción:**
La mutation `updateByAdmin` no verificaba si el admin objetivo era el único con rol `"admin"` y `active: true`. Un admin podía quitarse su propio rol o desactivarse, dejando el sistema sin acceso administrativo.

**Corrección aplicada:** Verificación de admins activos antes de cualquier democión o desactivación (cubre ambos vectores: `role: "user"` y `active: false`):

```typescript
const isDemotion = target.role === "admin" && (fields.role === "user" || fields.active === false);
if (isDemotion) {
  const activeAdmins = await ctx.db
    .query("users")
    .withIndex("by_role", q => q.eq("role", "admin"))
    .filter(q => q.eq(q.field("active"), true))
    .collect();
  if (activeAdmins.length <= 1)
    throw new Error("No se puede remover o desactivar el último administrador activo del sistema");
}
```

---

### M-4: Logging de PII (email) en `deleteUserCascade` y `sendWelcomeEmail` ✅ CORREGIDO

**Archivos:** `convex/actions/deleteUserCascade.ts`, `convex/actions/sendWelcomeEmail.ts`
**Severidad:** MEDIO → Resuelto

**Descripción:**
Ambas acciones loggeaban el email del usuario en `console.log`, quedando expuesto en los logs del dashboard de Convex por periodos prolongados.

**Corrección aplicada:** Reemplazado el email por el `clerkId` (identificador no sensible) en ambos `console.log`. El campo `email` en el metadata del audit log de base de datos **no fue modificado** — ese registro es intencional para compliance y forense (permite identificar a qué usuario pertenecía el `clerkId` después de la eliminación).

---

### M-5: `monthlySummary` acepta array de meses sin límite ✅ CORREGIDO

**Archivo:** `convex/transactions.ts`
**Severidad:** MEDIO → Resuelto

**Corrección aplicada:**

```typescript
const safeMonths = months.slice(0, 24); // máximo 24 meses (2 años)
```

---

### M-6: `VAPID_SUBJECT` con email hardcodeado como fallback ✅ CORREGIDO

**Archivo:** `convex/actions/sendPushNotification.ts`
**Severidad:** MEDIO → Resuelto

**Corrección aplicada:** Eliminado el fallback `"mailto:admin@okany.app"`. Si la variable no está configurada, la función loggea un error y retorna tempranamente sin intentar el envío:

```typescript
const subject = process.env.VAPID_SUBJECT;
if (!subject) {
  console.error("sendPushNotification: VAPID_SUBJECT no configurada — define la variable de entorno");
  return null;
}
```

**Acción requerida en infraestructura:** Añadir `VAPID_SUBJECT=mailto:<email-operaciones>@dominio.com` a las variables de entorno de Convex en producción.

---

## Mejoras Recomendadas

### B-1: Middleware en `src/proxy.ts` — Intencional por estándar de Next.js 16 ✅ NO APLICA

**Archivo:** `src/proxy.ts`
**Severidad:** BAJO → Cerrado como intencional

**Descripción original:** El archivo de middleware usa el nombre `proxy.ts` en lugar de `middleware.ts`.

**Resolución:** En Next.js 16 (Turbopack), `proxy.ts` es el nombre de archivo estándar introducido para el middleware de proxy/routing. El nombre `middleware.ts` corresponde a versiones anteriores del framework. El archivo actual sigue la convención correcta para la versión en uso y está confirmado como funcional en el build de producción con Turbopack. **No se realizó ningún cambio.** El próximo auditor que encuentre este archivo debe saber que `proxy.ts` es el estándar de Next.js 16+.

---

### B-2: Sin validación de formato de email en `accountShares.share` ✅ CORREGIDO

**Archivo:** `convex/accountShares.ts`
**Severidad:** BAJO → Resuelto

**Corrección aplicada:** Validación de formato con regex antes de consultar la BD. El email se normaliza una sola vez y se reutiliza en la búsqueda:

```typescript
const normalizedEmail = email.toLowerCase().trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
  throw new Error("El formato del correo electrónico no es válido");
}
```

---

### B-3: Sin validación de cotas en `debts.ts` ✅ CORREGIDO

**Archivos:** `convex/debts.ts` (`create`, `update`, `addPayment`)
**Severidad:** BAJO → Resuelto

*Nota: `convex/cards.ts` ya fue corregido en la remediación A-2.*

**Corrección aplicada** en los tres handlers de `debts.ts`:

- `create`: nombre 1-100 chars, acreedor 1-100, `originalAmount > 0` y ≤ 9.999.999.999, currency `/^[A-Za-z]{3}$/`, interestRate 0-1000, monthlyPayment > 0, description/notes ≤ 500 chars
- `update`: mismas cotas para los campos opcionales editables
- `addPayment`: `amount > 0` y ≤ 9.999.999.999 (previene overflow en `applyAccountDelta`), notes ≤ 500 chars

---

### B-4: Archivos adjuntos (`receiptStorageId`) sin validación de tipo MIME ✅ CORREGIDO

**Archivo:** `convex/transactions.ts`
**Severidad:** BAJO → Resuelto

**Corrección aplicada:** Se consulta el contentType del archivo en Convex Storage antes de insertar la transacción. Lista blanca: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Se excluye `image/svg+xml` por riesgo de XSS si se renderiza inline.

```typescript
if (args.receiptStorageId !== undefined) {
  const meta = await ctx.storage.getMetadata(args.receiptStorageId);
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!meta || !meta.contentType || !allowed.includes(meta.contentType)) {
    throw new Error("El comprobante debe ser una imagen (JPEG, PNG, WebP) o PDF");
  }
}
```

**Limitación conocida y documentada:** El `contentType` es declarado por el cliente en el momento de la subida, no verificado por magic bytes en el servidor. Esta validación es defensa-en-profundidad nominal, no una garantía de integridad del contenido. Para validación real del contenido sería necesario procesar el binario del archivo en una action (magic number sniffing) — se deja como mejora futura.

---

### B-5: La tabla `sessions` no se usa para control de acceso real ℹ️ INFORMATIVO

**Archivo:** `convex/schema.ts`
**Severidad:** INFORMATIVO → Sin acción requerida

La tabla `sessions` es un log de auditoría visual (las sesiones reales las gestiona Clerk). Está correctamente documentada en el schema. No requiere cambio. **Nota para el futuro:** si se integra como fuente de verdad para revocar sesiones activas, debe sincronizarse con la API de Clerk en tiempo real para evitar inconsistencias de autenticación.

---

### B-6: `getByClerkId` era una query pública sin restricción de acceso ✅ CORREGIDO

**Archivo:** `convex/users.ts`
**Severidad:** BAJO → Resuelto

**Investigación previa al cambio:** Búsqueda de call sites confirmó que `getByClerkId` (la versión pública) **no es llamada desde ningún componente del frontend ni desde código backend** — todas las llamadas internas ya usan `getByClerkIdInternal` (que es `internalQuery`). No hay riesgo de romper UI existente.

**Corrección aplicada:** Añadida verificación de identidad. Solo el propio usuario o un admin pueden obtener el documento completo de un usuario por su clerkId:

```typescript
const identity = await ctx.auth.getUserIdentity();
if (!identity) return null;
if (identity.subject !== clerkId) {
  const caller = await ctx.db.query("users")
    .withIndex("by_clerkId", q => q.eq("clerkId", identity.subject))
    .unique();
  if (!caller || caller.role !== "admin") return null;
}
```

---

## Controles Verificados (Correctamente Implementados)

- **Verificación de firma del webhook de Clerk** (`convex/http.ts`): Usa la librería `svix` con los tres headers requeridos (`svix-id`, `svix-timestamp`, `svix-signature`). Implementación correcta.

- **`src/proxy.ts` como middleware de Next.js 16**: Nombre de archivo correcto para Next.js 16 con Turbopack. Protege todas las rutas no públicas con `auth.protect()`. Funciona correctamente en builds de desarrollo y producción.

- **Autenticación en Convex**: La función `getCurrentUser` en `convex/lib/auth.ts` valida que el JWT de Clerk sea válido, que el usuario exista en la BD y que esté activo. Patrón correcto y consistente en todos los módulos auditados.

- **Control de acceso en cuentas compartidas** (`convex/lib/permissions.ts`): El sistema de permisos `owner > admin > editor > viewer` está correctamente implementado y se usa en todas las mutations de cuentas y transferencias.

- **Autorización en admin** (`convex/users.ts`, `convex/auditLogs.ts`, `convex/actions/adminUsers.ts`): Las rutas y mutations de administración verifican rol `"admin"` en el backend antes de ejecutar operaciones privilegiadas.

- **Aislamiento de datos por usuario**: Las queries en `cards.ts`, `categories.ts`, `budgets.ts`, `debts.ts`, `transactions.ts` (excepto C-1) utilizan correctamente el `userId`/`ownerId` del usuario autenticado para filtrar datos.

- **Eliminación en cascada de usuario** (`convex/actions/deleteUserCascade.ts`): El orden de eliminación es correcto: notificaciones → suscripciones → sesiones → cuotas → compras → tarjetas → deudas → transacciones → presupuestos → categorías → shares → cuentas → audit log → usuario.

- **Configuración de .gitignore**: Cubre correctamente `.env.local`, `.env.*`, claves privadas, certificados y el directorio `secrets/`.

- **Variables de entorno sensibles no expuestas al cliente**: `CLERK_SECRET_KEY`, `VAPID_PRIVATE_KEY`, `RESEND_API_KEY` y `CLERK_WEBHOOK_SECRET` no tienen el prefijo `NEXT_PUBLIC_`. La VAPID public key sí es `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, lo cual es correcto por diseño (las claves VAPID públicas están diseñadas para ser públicas).

- **Headers de seguridad HTTP**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `HSTS` con `max-age=63072000; includeSubDomains; preload`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. Configuración correcta.

- **Sentry Session Replay con PII masking**: `maskAllText: true, blockAllMedia: true` en `sentry.client.config.ts`. No filtra datos sensibles en los replays.

- **Validación de payload en webhook**: El cuerpo se lee como texto plano antes de la verificación de firma (correcto — leer como JSON antes invalidaría la firma).

- **No hay inyección SQL**: Convex usa únicamente su SDK con queries tipadas — no hay raw queries ni interpolación de strings en consultas de datos.

- **Ausencia de `dangerouslySetInnerHTML`** en toda la codebase de React.

- **Rotación de suscripciones push expiradas**: Al recibir HTTP 410 de un endpoint, se elimina individualmente la suscripción caducada.

- **Dependencias**: `npm audit` reporta 0 vulnerabilidades críticas o altas. 8 vulnerabilidades moderadas en `@clerk/nextjs`, `@sentry/nextjs`, `@serwist/next`, `next`, `postcss`, `resend`, `svix`, `uuid` — todas en paquetes de terceros y sin exploit conocido en el contexto de uso.

---

## Plan de Remediación

### ✅ Completado el 2026-04-29 (Críticos y Altos)
- **C-1 ✅**: IDOR en `transactions.listByAccountMonth` — corregido con `assertCanRead`.
- **A-1 ✅**: Inyección HTML en `welcomeEmailHtml` — corregido con `escapeHtml`.
- **A-2 ✅**: Validación de límites en handlers `create` y `update` de `transactions`, `accounts`, `cards`, `budgets`.
- **A-3 ✅**: Parámetro `limit` acotado (máx 100) en `transactions.listRecent` y `notifications.listRecent`.
- **A-4 ✅**: `Content-Security-Policy-Report-Only` añadido en `next.config.ts`.

### ✅ Completado el 2026-04-29 (Medios)
- **M-1 ✅**: Mensaje de error unificado en `accountShares.share` — ya no revela si un email existe.
- **M-2 ✅ (parcial)**: Rate limiting manual en `accountShares.share` (máx 10/min) y `transactions.create` (máx 30/min). Pendiente: `pushSubscriptions.save` y `adminUsers.createByAdmin`.
- **M-3 ✅**: Bloqueo de democión y desactivación del último admin activo en `users.updateByAdmin`.
- **M-4 ✅**: PII eliminado de `console.log` en `deleteUserCascade` y `sendWelcomeEmail` (audit log en BD no modificado — es registro forense intencional).
- **M-5 ✅**: `monthlySummary` limita el array de meses a 24 con `.slice(0, 24)`.
- **M-6 ✅**: `VAPID_SUBJECT` ya no tiene fallback hardcodeado — falla explícitamente si no está configurada.

### Pendiente — Infraestructura y hardening de segundo orden
- **A-4 → enforcement**: Cambiar `Content-Security-Policy-Report-Only` a `Content-Security-Policy` en `next.config.ts` tras verificar 24-48h de logs en producción sin falsos positivos.
- **M-2 (completar)**: Instalar `convex-helpers` e implementar `RateLimiter` basado en ventana fija en `pushSubscriptions.save` y `adminUsers.createByAdmin`.
- **M-6 (infraestructura)**: Configurar `VAPID_SUBJECT=mailto:<email-operaciones>@dominio.com` en las variables de entorno de Convex en producción. Sin esto, las notificaciones push no se enviarán.
- **B-4 (mejora futura)**: Añadir validación de contenido por magic numbers en una Convex action para reemplazar la validación nominal de MIME type actual.

---

*Auditoría inicial: 2026-04-29. Remediación críticos/altos: 2026-04-29. Remediación medios: 2026-04-29. Remediación bajos: 2026-04-29. Revisar con cada release de producción.*
