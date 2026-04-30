# Informe de Seguridad — Okany Sync v0.1.0

**Fecha:** 2026-04-29
**Alcance:** Revisión completa del código fuente (backend Convex, frontend Next.js 16, configuración de infraestructura)
**Auditor:** Security Auditor Agent

---

## Resumen Ejecutivo

**Estado general: Necesita atención 🟡**

Okany Sync tiene una base de seguridad sólida: la autenticación está correctamente delegada a Clerk (un proveedor dedicado), el webhook de Clerk usa verificación de firma svix en todos sus campos, y la autorización en los endpoints de backend es consistente para la gran mayoría de los módulos. Sin embargo, se identificaron vulnerabilidades que requieren corrección antes de un lanzamiento de producción:

- Una **vulnerabilidad de acceso a datos ajenos (IDOR)** que permite leer transacciones de cuentas sin permiso.
- Una **inyección HTML en el template de email de bienvenida** que permite a usuarios con nombres maliciosos inyectar contenido en emails enviados a administradores.
- **Ausencia de validación de límites y formatos en el backend Convex**, lo que expone a abusos con valores extremos.
- **Ausencia de Content Security Policy (CSP)**, dejando el navegador sin la capa de defensa más efectiva contra XSS.
- **No hay rate limiting** en ningún endpoint, abriendo la puerta a enumeración de usuarios y abuso de operaciones costosas.

---

## Vulnerabilidades Críticas

### C-1: IDOR — Lectura de transacciones de cuentas ajenas

**Archivo:** `convex/transactions.ts`, líneas 60–75
**Severidad:** CRÍTICO

**Descripción:**
La query `listByAccountMonth` primero busca todas las transacciones de una cuenta usando el índice `by_account_month`, y luego intenta filtrar por el usuario autenticado con:

```typescript
return direct.filter((t) => t.userId === clerkId || t.accountId === accountId);
```

La condición `t.accountId === accountId` siempre es verdadera para todos los registros retornados del índice (que usa exactamente ese campo como clave). El filtro es por tanto una no-operación — retorna el 100% de las filas sin importar quién sea `clerkId`. Cualquier usuario autenticado que conozca un `Id<"accounts">` puede leer todas las transacciones de esa cuenta.

El ID de una cuenta puede filtrarse de múltiples formas: un share previamente revocado, una URL guardada de `/cuentas/[id]`, o fuerza bruta de IDs de Convex (que son secuenciales o predecibles en algunas versiones).

**Impacto:** Un usuario puede leer el historial financiero completo de otro usuario, incluyendo montos, descripciones, fechas y categorías de todas sus transacciones.

**Remediación:**

```typescript
export const listByAccountMonth = query({
  args: { accountId: v.id("accounts"), month: v.string() },
  handler: async (ctx, { accountId, month }) => {
    // Verificar primero que el usuario tiene acceso a esta cuenta
    await assertCanRead(ctx, accountId);

    return await ctx.db
      .query("transactions")
      .withIndex("by_account_month", (q) =>
        q.eq("accountId", accountId).eq("month", month)
      )
      .order("desc")
      .collect();
  },
});
```

---

## Vulnerabilidades Altas

### A-1: Inyección HTML en template de email de bienvenida

**Archivo:** `convex/lib/emailTemplates.ts`, líneas 26 y 35
**Severidad:** ALTO

**Descripción:**
La función `welcomeEmailHtml` interpola directamente los parámetros `name` y `signInUrl` en HTML sin escapado:

```typescript
¡Bienvenido, ${name}! 👋
...
<a href="${signInUrl}" ...>
```

El campo `name` proviene del perfil de Clerk, que el usuario controla. Un admin que crea un usuario con nombre `<img src=x onerror=alert(1)>` inyecta ese HTML en el email enviado al nuevo usuario. El campo `signInUrl` proviene de `process.env.NEXT_PUBLIC_APP_URL`, que si es manipulada en entornos comprometidos puede resultar en un enlace de phishing en el email.

**Impacto:** Inyección de contenido en emails enviados desde el dominio de la aplicación. Posible phishing o exfiltración de datos si el cliente de email renderiza el HTML inyectado.

**Remediación:**

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function welcomeEmailHtml(name: string, signInUrl: string): string {
  const safeName    = escapeHtml(name);
  const safeSignInUrl = encodeURI(signInUrl); // o validar que sea una URL propia
  // usar safeName y safeSignInUrl en el template
}
```

---

### A-2: Ausencia generalizada de validación de límites en el backend Convex

**Archivos:** `convex/transactions.ts`, `convex/accounts.ts`, `convex/cards.ts`, `convex/categories.ts`, `convex/budgets.ts`, `convex/accountShares.ts`
**Severidad:** ALTO

**Descripción:**
Los schemas de Convex (`v.string()`, `v.number()`) sólo validan el tipo de dato, no los límites. Los schemas Zod en `src/lib/validators.ts` son exclusivamente frontend y nunca se aplican en el backend. Ejemplos concretos:

1. `transactions.create`: `amount: v.number()` acepta valores negativos, cero, `Infinity` o `Number.MAX_SAFE_INTEGER`. Un monto negativo pasado como gasto aumentaría el saldo de la cuenta indefinidamente.
2. `transactions.create`: `description: v.string()` y `notes: v.optional(v.string())` aceptan cadenas de longitud arbitraria — posible ataque de amplificación de almacenamiento.
3. `transactions.create`: `currency: v.string()` acepta cualquier cadena como código de moneda.
4. `accountShares.share`: El email del invitado no tiene validación de formato; sólo se hace `.toLowerCase().trim()`.
5. `accounts.create`: `accountNumber: v.optional(v.string())` puede recibir cadenas de longitud arbitraria.

**Impacto:** Corrupción de datos, ataques de amplificación de almacenamiento, comportamiento inesperado en cálculos de saldos.

**Remediación:**
Implementar validación de límites directamente en los args de Convex usando el patrón `v.number()` combinado con validación manual al inicio del handler, o bien usar un helper de validación Zod compartido:

```typescript
// En convex/transactions.ts → create
handler: async (ctx, args) => {
  if (args.amount <= 0)                    throw new Error("El monto debe ser mayor que cero");
  if (args.amount > 999_999_999_99)        throw new Error("Monto fuera de rango");
  if (args.description.length > 200)       throw new Error("Descripción demasiado larga");
  if (args.currency.length !== 3)          throw new Error("Código de moneda inválido");
  // ...
}
```

---

### A-3: Parámetros `limit` no acotados exponen escaneos completos de tabla

**Archivos:** `convex/transactions.ts` línea 78, `convex/notifications.ts` línea 8
**Severidad:** ALTO

**Descripción:**
Las queries `listRecent` y `listRecent` (notificaciones) aceptan un parámetro `limit` opcional de tipo `v.optional(v.number())` sin cota superior. Un cliente malicioso puede pasar `Number.MAX_SAFE_INTEGER`, forzando a Convex a iterar toda la tabla.

```typescript
// Convex permite esto sin restricción alguna:
transactions.listRecent({ limit: 9007199254740991 })
```

**Impacto:** DoS de la función, posible exceso del límite de datos de Convex (4MB por respuesta), costo computacional innecesario.

**Remediación:**

```typescript
args: { limit: v.optional(v.number()) },
handler: async (ctx, { limit = 10 }) => {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
  // ...
  .take(safeLimit);
```

---

### A-4: Ausencia de Content Security Policy (CSP)

**Archivo:** `next.config.ts`
**Severidad:** ALTO

**Descripción:**
El archivo `next.config.ts` define varios headers de seguridad correctos (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `HSTS`, `Referrer-Policy`, `Permissions-Policy`) pero omite completamente `Content-Security-Policy`. CSP es la defensa más efectiva del navegador contra XSS. Sin ella, cualquier XSS inyectado puede ejecutar scripts arbitrarios, robar cookies de sesión, o exfiltrar datos hacia dominios externos.

**Impacto:** Ausencia de barrera de defensa en profundidad ante XSS. Si se introduce una vulnerabilidad XSS, el atacante tiene capacidad total de ejecución de scripts en el contexto del usuario.

**Remediación:**

Añadir a `securityHeaders` en `next.config.ts`:

```typescript
{
  key: "Content-Security-Policy",
  value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev",  // Clerk requiere unsafe-inline — evaluar nonces
    "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.clerk.accounts.dev https://api.resend.com https://*.sentry.io",
    "img-src 'self' data: https://img.clerk.com https://images.clerk.dev",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
},
```

Nota: Clerk y muchas bibliotecas requieren `unsafe-inline`. Evaluar el uso de nonces via `next/headers` para eliminar `unsafe-inline` en scripts.

---

## Riesgos Medios

### M-1: Enumeración de usuarios vía mensajes de error diferenciados en `accountShares.share`

**Archivo:** `convex/accountShares.ts`, línea 114
**Severidad:** MEDIO

**Descripción:**
La mutation `share` retorna mensajes de error distintos según si el email existe o no en la base de datos:
- Email no registrado: `"No se encontró un usuario con ese correo. Solo puedes compartir con usuarios registrados en Okany Sync."`
- Email ya propietario: `"Este usuario ya es el dueño de la cuenta"`

Combinado con la ausencia de rate limiting, esto permite a un atacante autenticado enumerar todos los emails registrados en la plataforma enviando peticiones en masa.

**Impacto:** Divulgación de qué emails están registrados en la plataforma; puede usarse para phishing dirigido o para identificar usuarios de alto valor.

**Remediación:**
Unificar el mensaje de error externo y aplicar rate limiting:

```typescript
if (!invitedUser) {
  throw new Error("No se pudo completar la invitación. Verifica el correo e intenta de nuevo.");
}
```

---

### M-2: Ausencia de rate limiting en cualquier endpoint

**Archivos:** Todos los endpoints de Convex
**Severidad:** MEDIO

**Descripción:**
Ninguna query ni mutation de Convex implementa rate limiting o throttling. Esto expone a:
1. Enumeración de usuarios (ver M-1).
2. Fuerza bruta en la búsqueda de IDs de cuentas para el IDOR (C-1).
3. Abuso de operaciones costosas: `monthlySummary` acepta un array de meses sin límite de longitud.
4. Spam de notificaciones push: `pushSubscriptions.save` puede ser llamado repetidamente para registrar suscripciones.

**Remediación:**
Convex ofrece el paquete `convex-helpers` con un helper de rate limiting. Implementar en mutaciones críticas:

```typescript
import { RateLimiter } from "convex-helpers/server/rateLimit";

const rateLimiter = new RateLimiter(ctx, {
  shareAccount: { kind: "fixed window", rate: 10, period: 60_000 },
});
await rateLimiter.limit("shareAccount", { key: user.clerkId, throws: true });
```

---

### M-3: Self-demotion del último administrador no bloqueada

**Archivo:** `convex/users.ts`, línea 234
**Severidad:** MEDIO

**Descripción:**
La mutation `updateByAdmin` no verifica si el admin que está siendo modificado es el único administrador del sistema. Un admin puede cambiarse a sí mismo el rol a `"user"`, quedando el sistema sin ningún admin y sin forma de recuperar el acceso administrativo desde la interfaz.

**Remediación:**

```typescript
if (fields.role === "user" && target.role === "admin") {
  const adminCount = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();
  if (adminCount.length <= 1) {
    throw new Error("No puedes remover el último administrador del sistema");
  }
}
```

---

### M-4: Logging de email de usuario en `deleteUserCascade` y `sendWelcomeEmail`

**Archivos:** `convex/actions/deleteUserCascade.ts` línea 143, `convex/actions/sendWelcomeEmail.ts` línea 47
**Severidad:** MEDIO

**Descripción:**
Ambas acciones loggean el email del usuario en los logs de Convex:

```typescript
// deleteUserCascade.ts
console.log(`deleteUserCascade: ${user.email} eliminado. Conteos:`, counts);

// sendWelcomeEmail.ts
console.log(`sendWelcomeEmail: enviado a ${user.email}`);
```

Los logs de Convex son accesibles desde el dashboard de Convex y pueden ser retenidos por periodos prolongados. El email es PII sensible.

**Remediación:**
Reemplazar el email por un identificador no sensible como el `clerkId`:

```typescript
console.log(`deleteUserCascade: usuario ${user._id} eliminado. Conteos:`, counts);
console.log(`sendWelcomeEmail: email enviado al usuario ${clerkId}`);
```

---

### M-5: `monthlySummary` acepta array de meses sin límite

**Archivo:** `convex/transactions.ts`, línea 140
**Severidad:** MEDIO

**Descripción:**
La query `monthlySummary` acepta `months: v.array(v.string())` sin límite de longitud. Para cada mes, realiza una query completa a la base de datos. Un cliente malicioso puede enviar 1000 meses y forzar 1000 queries en paralelo.

**Remediación:**

```typescript
args: { months: v.array(v.string()) },
handler: async (ctx, { months }) => {
  const clerkId = await getCurrentUserId(ctx);
  const safeMonths = months.slice(0, 24); // máximo 24 meses (2 años)
  // ...
```

---

### M-6: `VAPID_SUBJECT` con email hardcodeado como fallback

**Archivo:** `convex/actions/sendPushNotification.ts`, línea 10
**Severidad:** MEDIO

**Descripción:**
```typescript
const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@okany.app";
```

Si `VAPID_SUBJECT` no está configurada, las notificaciones push se envían con un email de contacto hardcodeado que puede no existir o no ser el correcto para el entorno de despliegue. Los proveedores de push pueden contactar este email ante problemas.

**Remediación:**
Quitar el fallback y hacer la variable obligatoria, o al menos loggear un warning prominente:

```typescript
const subject = process.env.VAPID_SUBJECT;
if (!subject) {
  console.error("sendPushNotification: VAPID_SUBJECT no configurada");
  return;
}
```

---

## Mejoras Recomendadas

### B-1: Middleware está en `src/proxy.ts` en lugar de `src/middleware.ts`

**Archivo:** `src/proxy.ts`
**Severidad:** BAJO / Riesgo operativo

**Descripción:**
La convención estándar de Next.js es que el middleware resida en `src/middleware.ts` (o `middleware.ts` en la raíz). El archivo actual se llama `src/proxy.ts`. Si bien la compilación Turbopack actual lo carga correctamente (verificado en el build de desarrollo), esto es contrario a la documentación oficial y puede dejar de funcionar en futuras versiones de Next.js, builds de producción con webpack, o al desplegar en plataformas que no usen la misma heurística de resolución.

**Recomendación:**
Renombrar `src/proxy.ts` a `src/middleware.ts`.

---

### B-2: Sin validación de formato de email en `accountShares.share`

**Archivo:** `convex/accountShares.ts`, línea 111
**Severidad:** BAJO

La mutation hace `.toLowerCase().trim()` sobre el email pero no valida que sea un formato de email válido. Una búsqueda con un string no-email retornará "no encontrado" sin error semántico claro.

**Recomendación:**
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email.toLowerCase().trim())) {
  throw new Error("El formato del correo electrónico no es válido");
}
```

---

### B-3: Sin validación de cotas de monto en schemas de Convex para tarjetas y deudas

**Archivos:** `convex/cards.ts`, `convex/debts.ts`
**Severidad:** BAJO

`creditLimit`, `totalAmount`, `originalAmount` sólo están validados como `v.number()`. Un cliente puede enviar valores negativos, cero o extremadamente grandes.

---

### B-4: Archivos adjuntos (`receiptStorageId`) sin validación de tipo MIME

**Archivo:** `convex/transactions.ts`, línea 184
**Severidad:** BAJO

Se acepta cualquier `v.id("_storage")` como `receiptStorageId` sin validar que corresponda a un archivo de imagen. Convex Storage no restringe tipos por defecto.

---

### B-5: La tabla `sessions` no se usa para control de acceso real

**Archivo:** `convex/schema.ts`, líneas 452-464
**Severidad:** INFORMATIVO

La tabla `sessions` es sólo un log visual (las sesiones reales las maneja Clerk). Está bien documentado en el schema, pero si en el futuro se usa como fuente de verdad para revocar acceso, habría que sincronizarla con Clerk en tiempo real.

---

### B-6: `getByClerkId` es una query pública que expone datos de usuario por clerkId

**Archivo:** `convex/users.ts`, línea 125
**Severidad:** BAJO

La query `getByClerkId` es pública (no `internalQuery`) y retorna el documento completo del usuario incluyendo email, rol e `imageUrl` dado cualquier `clerkId`. No hay verificación de autenticación. Cualquier cliente autenticado puede consultar datos de cualquier otro usuario si conoce su clerkId.

**Remediación:** Cambiar a `internalQuery` o agregar verificación de que el solicitante sea el mismo usuario o un admin:

```typescript
export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    // Solo el propio usuario o un admin puede ver este dato
    if (identity.subject !== clerkId) {
      const caller = await ctx.db.query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
        .unique();
      if (!caller || caller.role !== "admin") return null;
    }
    return await ctx.db.query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});
```

---

## Controles Verificados (Correctamente Implementados)

- **Verificación de firma del webhook de Clerk** (`convex/http.ts`): Usa la librería `svix` con los tres headers requeridos (`svix-id`, `svix-timestamp`, `svix-signature`). Implementación correcta.

- **`src/proxy.ts` como middleware de Next.js**: Confirmado via el build de Turbopack que `src/proxy.ts` es cargado como middleware. Protege todas las rutas no públicas con `auth.protect()`. El nombre inusual del archivo es un riesgo operativo (ver B-1) pero funciona correctamente en el estado actual.

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

### Inmediato (0-24h)
- **C-1**: Corregir IDOR en `transactions.listByAccountMonth` — agregar `assertCanRead(ctx, accountId)` y eliminar el filtro inefectivo.
- **A-1**: Escapar HTML en `welcomeEmailHtml` antes de interpolar `name` y `signInUrl`.

### Corto plazo (1-7 días)
- **A-2**: Agregar validación de límites (monto > 0, longitud de strings, formato de currency) en los handlers de Convex para `transactions`, `accounts`, `cards`, `budgets`, `debts`.
- **A-3**: Acotar el parámetro `limit` en `listRecent` de transacciones y notificaciones (máximo 100).
- **A-4**: Implementar `Content-Security-Policy` en `next.config.ts`.
- **M-1**: Unificar mensajes de error en `accountShares.share`.
- **M-3**: Bloquear self-demotion del último administrador.
- **B-1**: Renombrar `src/proxy.ts` a `src/middleware.ts`.
- **B-6**: Restringir `getByClerkId` a uso interno o agregar verificación de identidad.

### Mediano plazo (1-4 semanas)
- **M-2**: Implementar rate limiting en mutaciones críticas: `share`, `create` (transacciones), `save` (push subscriptions), `createByAdmin`.
- **M-4**: Eliminar emails de usuario de los logs de Convex.
- **M-5**: Limitar longitud del array `months` en `monthlySummary` a 24.
- **M-6**: Hacer `VAPID_SUBJECT` obligatoria o remover el fallback hardcodeado.
- **B-2**: Agregar validación de formato de email en `accountShares.share`.
- **B-3**: Agregar cotas de monto en `cards.ts` y `debts.ts`.

---

*Informe generado el 2026-04-29. Revisar con cada release de producción.*
