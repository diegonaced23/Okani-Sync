# Módulo Perfil: cambio de contraseña y configuraciones

**Fecha:** 2026-09-17
**Estado:** diseño aprobado, pendiente de plan de implementación

## Problema

El módulo perfil (`src/app/(app)/perfil/page.tsx`) es un único archivo cliente de
~300 líneas que hoy ofrece: editar nombre, moneda preferida, tema, toggle global de
push, lista de sesiones y cerrar sesión.

Faltan cosas que la migración a Better Auth (ver `docs/migracion-better-auth.md`)
dejó sin cubrir o que el backend soporta pero nadie expone:

1. **No hay forma de cambiar la contraseña.** Better Auth tiene `emailAndPassword`
   habilitado y `/reset-password` funcionando, pero desde la app autenticada no
   existe el camino.
2. **Los crons de push mandan a todo el mundo.** Los 4 jobs de notificación
   recorren `pushSubscriptions.listDistinctUserIds` y empujan sin ningún filtro
   por tipo. El único control es el toggle global "todo o nada".
3. **La lista de sesiones no dice nada útil.** Muestra `Sesión 2` aunque Better
   Auth ya guarda `userAgent` e `ipAddress` en cada fila.
4. **`users.imageUrl` está en el schema y no se lee en ninguna UI.** El avatar es
   la inicial del nombre. No existe ningún flujo de subida en el proyecto.
5. **No hay export completo de la cuenta.** `/reportes` exporta CSV/PDF por rango
   de fechas; no hay respaldo íntegro.

## Alcance

Dentro:

- A. Cambiar / crear contraseña
- B. Preferencias de notificación por familia
- C. Sesiones con dispositivo real
- D. Avatar y datos de la cuenta
- E. Exportar mis datos
- F. División del módulo en `src/components/perfil/`

Fuera, con motivo:

| Descartado | Motivo |
|---|---|
| Cambiar email | `users.email` es fuente de verdad propia y el trigger `onCreate` de `convex/auth.ts` vincula `authId` por email. Cambiarlo rompe el puente de migración. |
| Eliminar mi cuenta | `deleteUserCascade.run` es `internalAction` de uso admin, destructivo e irreversible. Merece diseño propio con confirmación fuerte. |
| 2FA | Plugin nuevo de Better Auth, alcance propio. |
| Idioma / zona horaria | `users.locale` no se lee en ningún punto del código; los crons tienen Colombia UTC-5 hardcodeado. Un selector sería decorativo o exigiría rehacer los 7 crons. |
| Modo discreto, umbral de alerta por defecto | No entraron en la selección del usuario. Añadibles después sin tocar nada de lo aquí descrito. |

## F. Estructura del módulo

Se extrae la página a componentes en `src/components/perfil/`, siguiendo la
convención del resto del proyecto (`src/components/<módulo>/`):

```
src/components/perfil/
  AvatarCard.tsx            # foto + nombre editable
  AccountInfoCard.tsx       # email, rol, alta, última actualización
  CurrencyCard.tsx
  ThemeCard.tsx
  PasswordCard.tsx          # sección A
  NotificationPrefsCard.tsx # sección B
  PushCard.tsx              # toggle global existente
  SessionsCard.tsx          # sección C
  ExportDataCard.tsx        # sección E
  SignOutButton.tsx
```

`src/app/(app)/perfil/page.tsx` queda como composición: carga `api.users.getMe`,
resuelve el estado de sesión y renderiza las tarjetas. Cada componente es
responsable de sus propias mutations y su propio estado de carga.

Esto no es refactor gratuito: sin la división, sumar cuatro secciones sobre el
archivo actual lo deja en ~700 líneas con nueve responsabilidades.

## A. Cambiar / crear contraseña

### El caso que hay que resolver bien

Los usuarios que vienen de la migración entraron por magic link y **no tienen
cuenta `credential`**. Para ellos `authClient.changePassword` falla con
`CREDENTIAL_ACCOUNT_NOT_FOUND`. `PasswordCard` decide qué mostrar consultando
`authClient.listAccounts()` y buscando `providerId === "credential"`.

### Rama 1 — ya tiene contraseña

Formulario con tres campos (`autoComplete="current-password"` / `"new-password"`,
`minLength={8}` igual que `src/components/auth/ResetPasswordForm.tsx`):

```ts
await authClient.changePassword({ currentPassword, newPassword });
// NO pasar revokeOtherSessions: true — ver abajo
await authClient.revokeOtherSessions();
```

Validación en cliente antes de llamar: nueva ≠ actual, nueva === confirmación,
longitud ≥ 8. Los errores del servidor se muestran con `toast.error` usando
`error.message`, con copy propio para `INVALID_PASSWORD`.

**Por qué no se usa la bandera `revokeOtherSessions` de `changePassword`:** pese
al nombre, su implementación llama a `deleteUserSessions(userId)` — que borra
**todas** las sesiones, incluida la actual — y a continuación crea una sesión
nueva con token nuevo
(`node_modules/better-auth/dist/api/routes/update-user.mjs`, rama
`if (revokeOtherSessions)`). El token que `authClient.useSession()` tiene en
memoria queda obsoleto: el badge "Actual" se colgaría de un token inexistente, la
sesión real aparecería como "Sesión N" con botón "Cerrar", y pulsarlo desconectaría
al usuario de su propio dispositivo.

El endpoint dedicado `/revoke-other-sessions` sí filtra la sesión actual por token
antes de borrar (`node_modules/better-auth/dist/api/routes/session.mjs`, el
`.filter((session) => session.token !== ctx.context.session.session.token)`), y es
el que la página ya usa en `handleRevokeAllOther`. Se reutiliza ese.

Al terminar hay que recargar la lista de sesiones de `SessionsCard`.

**No hace falta manejar sesión no fresca:** `convex/auth.ts` ya define
`session: { freshAge: 0 }`. Se deja un comentario en `PasswordCard` explicándolo
para que nadie re-añada un prompt de reautenticación.

### Rama 2 — no tiene contraseña

Tarjeta explicativa ("Entras con enlace mágico; puedes definir una contraseña
para iniciar sesión sin correo") y un botón que dispara el flujo ya cableado:

```ts
await authClient.requestPasswordReset({ email: me.email, redirectTo: "/reset-password" });
```

Es el mismo camino que usa `src/components/auth/SignInForm.tsx`, y el correo sale
por `sendResetPassword` → `internal.actions.sendResetPasswordEmail.run`.

Detalle a arreglar de paso: `ResetPasswordForm` termina con
`router.push("/sign-in")`, y no hay middleware que rebote a los autenticados, así
que quien llegue desde perfil (con sesión viva) acabaría mirando un formulario de
login. El form debe redirigir a `/` cuando ya hay sesión activa.

**Por qué no `setPassword`:** el endpoint es `serverOnly` con
`sensitiveSessionMiddleware` (`node_modules/better-auth/dist/api/routes/update-user.mjs:195`).
Llamarlo desde una action de Convex obligaría a reenviar la sesión HTTP, que no
está disponible en ese contexto. El paso por correo, además, vuelve a probar
posesión del email — coherente con el resto de defensas de la migración.

### Auditoría

CLAUDE.md exige registrar cambios sensibles en `auditLogs`, pero
`users.logAuditAction` es `internalMutation` y el cambio de contraseña ocurre
íntegramente en Better Auth, sin pasar por Convex.

Se añade:

- `AUDIT_ACTIONS.USER_PASSWORD_CHANGED = "user.password.changed"` en
  `src/lib/constants.ts`.
- `users.logSelfAudit` (mutation pública) que solo acepta acciones de una
  whitelist de eventos propios del usuario (`USER_PASSWORD_CHANGED`,
  `USER_DATA_EXPORTED`) y siempre escribe `userId: user.clerkId`. No acepta
  `targetUserId` ni metadata arbitraria: un cliente no puede inyectar entradas
  falsas de otro usuario ni acciones administrativas. Lleva un límite propio de
  10/min — es una escritura a `auditLogs` invocable desde el cliente, o sea un
  vector de spam del log.

  **Ojo:** `convex/lib/rateLimit.ts::assertRateLimit` **no** sirve aquí. Pese al
  nombre genérico, cuenta filas de la tabla `transactions` por `by_user`: aplicado
  a otra operación limitaría en función de cuántos movimientos registró el
  usuario, que no tiene nada que ver. Se añade `assertAuditRateLimit` en ese
  mismo archivo, con la misma forma pero leyendo `auditLogs` por su índice
  `by_user`.

Se llama tras un `changePassword` exitoso. Es best-effort: si falla, no se
revierte nada ni se molesta al usuario.

## B. Preferencias de notificación

### Schema

En `users`:

```ts
notificationPrefs: v.optional(
  v.object({
    presupuestos:       v.boolean(),
    tarjetas:           v.boolean(),
    deudasPrestamos:    v.boolean(),
    recurrentes:        v.boolean(),
    recordatorioDiario: v.boolean(),
    resumenes:          v.boolean(),
  })
),
```

Campo opcional y objeto completo cuando existe. `undefined` significa **todo
activo**: ningún usuario existente pierde notificaciones al desplegar.

### Mapeo tipo → familia

En `src/lib/notifications.ts` (nuevo). Convex ya importa de `src/lib/` — ver
`convex/users.ts` importando `../src/lib/constants` — así que el mapeo es único
para front y backend.

| Familia | Tipos de `notifications.type` |
|---|---|
| `presupuestos` | `presupuesto_alerta`, `presupuesto_excedido` |
| `tarjetas` | `cuota_proxima`, `pago_tarjeta_proximo` |
| `deudasPrestamos` | `deuda_vencida`, `deuda_proxima`, `prestamo_vencido`, `prestamo_proximo` |
| `recurrentes` | `transaccion_recurrente` |
| `recordatorioDiario` | `recordatorio_registro` |
| `resumenes` | `resumen_semanal`, `resumen_mensual` |

`cuenta_compartida`, `share_aceptado` y `sistema` **no son configurables**: son
interactivas o críticas (alguien te compartió una cuenta, tu acceso cambió). La
función de mapeo devuelve `null` para ellas y el gate las deja pasar siempre.

### Punto de control

`sendAlerts.ts` no itera por usuario sino por entidad (presupuesto, deuda,
cuota…), así que el filtro no puede ir en un bucle externo: va por notificación.

Nuevo `convex/lib/notify.ts`:

```ts
export async function notify(ctx: ActionCtx, args: {
  userId: string;
  type: NotificationType;
  title: string; message: string;
  actionUrl?: string; relatedEntityId?: string;
  push: { title: string; body: string };
}): Promise<Id<"notifications"> | null>
```

Consulta `internal.users.isNotificationEnabled({ userId, type })` (nueva
`internalQuery` que resuelve el usuario por `by_clerkId` y aplica el mapeo y el
default "todo activo"); si está apagada devuelve `null` sin crear nada. Si está
activa, crea la notificación in-app y dispara el push, que es exactamente el par
de llamadas que hoy está duplicado en nueve sitios.

Call sites a migrar:

- `convex/actions/sendAlerts.ts` — `cuota_proxima`, `deuda_vencida`,
  `deuda_proxima`, `prestamo_vencido`, `prestamo_proximo`
- `convex/actions/sendDailyReminder.ts` — `recordatorio_registro`
- `convex/actions/sendWeeklySummary.ts` — `resumen_semanal`
- `convex/actions/sendMonthlySummary.ts` — `resumen_mensual`
- `convex/actions/processRecurringTransactions.ts` — `transaccion_recurrente`

**Excepción documentada:** las alertas de presupuesto usan
`notifications.createAndMarkBudgetAlert`, que crea la notificación y marca el
presupuesto como notificado en una sola transacción a propósito (un crash entre
ambas reenviaría la alerta al día siguiente). Ese call site **no** pasa por
`notify`; en su lugar el bucle de `checkBudgetAlerts` consulta
`isNotificationEnabled` y hace `continue` antes de la mutation. El presupuesto
queda sin marcar, que es lo correcto: si el usuario reactiva la familia, la
alerta vuelve a evaluarse.

### UI

`NotificationPrefsCard` con un `Switch` por familia. Los switches **nunca se
deshabilitan**: las preferencias gobiernan también la notificación in-app, así
que siguen teniendo efecto aunque el push global esté apagado. Cuando ese es el
caso se muestra una nota explicativa ("El push está desactivado en este
dispositivo; estas preferencias aplican a las notificaciones dentro de la app").
Mutation `users.updateNotificationPrefs` que acepta el objeto parcial y hace
merge sobre el actual (o sobre el default "todo true").

## C. Sesiones con dispositivo real

`SessionRow` (el tipo derivado de `authClient.listSessions`) ya incluye
`userAgent` e `ipAddress`.

Nuevo `src/lib/userAgent.ts`:

```ts
export function parseUserAgent(ua: string | null | undefined): {
  browser: string;   // "Chrome", "Safari", "Firefox", "Edge", "Desconocido"
  os: string;        // "Windows", "macOS", "iOS", "Android", "Linux", "Desconocido"
  isMobile: boolean;
}
```

Regex sobre el UA, sin dependencia nueva. Orden de detección importante: Edge
antes que Chrome, Chrome antes que Safari (todos mienten en su UA).

`SessionsCard` muestra `Chrome · macOS`, icono `Smartphone` o `Monitor` según
`isMobile`, la IP en texto secundario y la fecha relativa que ya existe. La
sesión actual conserva el badge "Actual".

`ipAddress` puede venir vacío: Better Auth lo deriva de cabeceras tipo
`x-forwarded-for` y no está verificado que Convex las reenvíe a través del route
handler. Cuando falte no se renderiza nada (no un "IP desconocida"); hay que
confirmarlo contra una sesión real antes de maquetar alrededor de ese dato.

De paso se corrige el comparador de orden actual, que ignora el segundo
argumento y por tanto no ordena de forma estable:

```ts
// antes: [...sessions].sort((a) => (a.token === currentToken ? -1 : 1))
[...sessions].sort((a, b) =>
  Number(b.token === currentToken) - Number(a.token === currentToken)
);
```

## D. Avatar y datos de la cuenta

### Subida

El proyecto no tiene ningún flujo de subida: `transactions.ts` acepta
`receiptStorageId` pero ninguna UI genera URLs de subida. Hay que crear el
camino completo.

- `users.generateAvatarUploadUrl` — mutation autenticada, `ctx.storage.generateUploadUrl()`,
  con un estrangulador simple para que no sea un vector de llenado de storage:
  campo nuevo `users.lastAvatarUploadAt` y rechazo si la última llamada fue hace
  menos de 10 s. Un solo campo, sin tabla nueva (y sin usar `assertRateLimit`,
  que cuenta transacciones).
- `users.updateAvatar({ storageId })` — valida con `ctx.storage.getMetadata`:
  - `contentType` en `["image/jpeg", "image/png", "image/webp"]`
  - `size` ≤ `MAX_AVATAR_SIZE_BYTES` (2 MB, nueva constante junto a
    `MAX_RECEIPT_SIZE_BYTES`)

  Es la misma defensa nominal en profundidad que `convex/transactions.ts` ya
  aplica a los comprobantes: el `contentType` lo declara el cliente, no se
  verifica por magic bytes. Si la validación falla, se borra el archivo subido
  antes de lanzar el error para no dejar basura.
- `users.removeAvatar` — borra el archivo y limpia el campo.

Al reemplazar o quitar la foto se borra el archivo anterior con
`ctx.storage.delete`. Sin eso, cada cambio de avatar deja un huérfano permanente.

Por el mismo motivo, `convex/actions/deleteUserCascade.ts` debe borrar
`imageStorageId` del usuario antes de eliminar su fila: la cascada actual barre
12 entidades pero no conoce `_storage`, así que cada usuario eliminado dejaría su
avatar huérfano para siempre.

### Schema y lectura

Campo nuevo `imageStorageId: v.optional(v.id("_storage"))`. `users.getMe`
resuelve la URL con `ctx.storage.getUrl(imageStorageId)` y la devuelve como campo
derivado (`avatarUrl`), sin persistir la URL, que es temporal.

`imageUrl` (el campo viejo que venía de Clerk) se conserva como fallback de
lectura: si no hay `imageStorageId` pero sí `imageUrl`, se usa ese. No se escribe
nunca más.

`AvatarCard` mantiene la inicial del nombre como estado vacío, con un botón de
cámara superpuesto que abre el selector de archivo; recorte/redimensionado quedan
fuera (la validación de tamaño alcanza).

### Datos de la cuenta

`AccountInfoCard`, solo lectura: email, rol (badge "Administrador" si aplica),
fecha de alta (`createdAt`) y última actualización (`updatedAt`). No añade
queries: todo está en `getMe`.

## E. Exportar mis datos

Nuevo `convex/actions/exportMyData.ts` (`action` autenticada) que agrega, vía
`internalQuery`s por tabla:

`accounts`, `accountShares`, `cards`, `cardPurchases`, `cardInstallments`,
`transactions`, `categories`, `budgets`, `recurringTransactions`, `debts`,
`debtPayments`, `loans`, `loanRepayments`, `goals`, `netWorthSnapshots`.

Se excluyen `notifications`, `pushSubscriptions`, `sessions`, `auditLogs` e
`invitations`: no son datos financieros del usuario.

### Cotas

Las guidelines de Convex (`convex/_generated/ai/guidelines.md`, regla de
colecciones acotadas) prohíben `.collect()` sin límite. Cada tabla se lee con
`.take(EXPORT_MAX_ROWS_PER_TABLE)` (10 000). El payload incluye por tabla:

```jsonc
{
  "transactions": { "rows": [...], "count": 8421, "truncated": false }
}
```

`truncated: true` cuando se alcanzó el tope, y la UI lo muestra como advertencia
explícita en vez de entregar un respaldo silenciosamente incompleto.

### Entrega

La action **no devuelve el JSON**. Lo serializa, lo guarda con
`ctx.storage.store(new Blob([json], { type: "application/json" }))` y devuelve
`{ url, sizeBytes, truncatedTables }`; el cliente descarga desde esa URL con un
`<a download>`.

El motivo es que un retorno directo de 15 tablas queda expuesto al límite de
tamaño del valor de retorno de una función de Convex, y ese límite no se puede
verificar desde el repo. Pasar por storage elimina esa clase de riesgo entera por
unas pocas líneas en una action de node, y además da una URL real de descarga.

El archivo es temporal: la misma action programa su borrado con
`ctx.scheduler.runAfter(EXPORT_TTL_MS, internal.actions.exportMyData.cleanup, { storageId })`
(1 hora). Sin eso, cada export acumula un archivo permanente por usuario.

Nombre sugerido al descargar: `okany-sync-<YYYY-MM-DD>.json`. Cabecera con
`exportedAt`, `appVersion` y una nota de que los montos vienen en dos formas:

- `amount` — el entero en centavos tal cual está en la BD (fidelidad exacta)
- `amountValue` — el valor humano vía `fromCents` (legibilidad)

Sin CSV: `/reportes` ya cubre ese caso con `src/lib/reports.ts`. Sin ZIP: no hay
dependencia de compresión y un JSON basta.

Al terminar se registra `AUDIT_ACTIONS.USER_DATA_EXPORTED = "user.data.exported"`
vía `users.logSelfAudit`.

`ExportDataCard` muestra el botón, un estado de carga (la agregación de 15 tablas
no es instantánea) y la advertencia de truncado si la hubo.

## Testing

Unidades puras con Vitest, que es donde la cobertura del proyecto apunta
(`src/lib/**`). TDD: test primero.

- `src/lib/__tests__/userAgent.test.ts` — `parseUserAgent` con UAs reales de
  Chrome/Safari/Firefox/Edge en Windows/macOS/iOS/Android, más `null`, cadena
  vacía y un UA basura. Casos de orden: Edge no debe reportarse como Chrome,
  Chrome no debe reportarse como Safari.
- `src/lib/__tests__/notifications.test.ts` — mapeo tipo → familia para los 15
  tipos del schema, `null` para los tres no configurables, y el resolutor de
  "activo" con `notificationPrefs` `undefined` (todo activo), parcial y completo.
- Armado del payload de export: la función pura que convierte filas a
  `{ amount, amountValue }` y arma `{ rows, count, truncated }`.

No son unit-testeables aquí y se verifican a mano: los flujos de Better Auth
(`changePassword`, `requestPasswordReset`, `listAccounts`), la subida a storage y
el gate real dentro de los crons.

Verificación obligatoria antes de dar por cerrado: `npm test`, `npm run lint`,
`npm run typecheck`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El refactor a `notify()` toca cinco actions de cron; un error silencia notificaciones en producción | Migrar un call site a la vez con el default "todo activo", y revisar los logs de cada cron tras el despliegue |
| El export podría chocar con el límite de tamaño del valor de retorno de una action de Convex (no verificable desde el repo) | Se elimina la clase de riesgo: el JSON va a `_storage` y la action devuelve una URL. El tope de 10 000 filas por tabla se mantiene igualmente, porque protege el límite de lectura de las queries, que es una restricción distinta |
| Subir avatar abre un vector de llenado de storage | Estrangulador de 10 s vía `lastAvatarUploadAt`, tope de 2 MB, validación de `contentType` y borrado del archivo cuando la validación falla |
| La migración Clerk → Better Auth sigue en curso | Nada de lo aquí descrito toca `clerkId`, `authId` ni el trigger `onCreate`. `logSelfAudit` escribe `user.clerkId`, coherente con el resto de `auditLogs` |
