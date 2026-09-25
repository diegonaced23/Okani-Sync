# Registro por solicitud — diseño

Fecha: 2026-09-22
Estado: aprobado, pendiente de plan de implementación

## Problema

Hoy la app solo permite iniciar sesión. El alta es cerrada: `emailAndPassword.disableSignUp`
está activo (`convex/auth.ts:77`) y el único camino de entrada es que un admin invite a
alguien desde el panel (`CreateUserDialog` → `actions/adminUsers.ts::createByAdmin`), lo que
crea una fila `pending` en `invitations` —el gate real, en `convex/users.ts::ensureExists`— y
le manda un magic link.

Falta el camino inverso: que una persona interesada pueda **pedir** acceso. Debe poder llenar
un formulario público con sus datos y su motivo, el admin recibe un aviso, revisa y decide. Si
aprueba, el solicitante recibe acceso por correo y el sistema lo obliga a definir su contraseña
antes de usar la app.

## Decisiones tomadas

| Decisión | Elección |
|---|---|
| Rechazo | Silencioso: se marca `rejected` para el histórico, no se envía correo al solicitante |
| Primera entrada | Magic link (lo que ya hace la app) + contraseña obligatoria al entrar. **No** contraseña temporal por correo |
| Aviso de nueva solicitud | A todos los usuarios con `role: "admin"` y `active: true` |
| Acuse al solicitante | Sí, correo de «recibimos tu solicitud» |
| Rol al aprobar | Siempre `"user"`. Un admin nuevo se sigue creando desde «Invitar usuario» |
| Campos obligatorios | Correo, nombre, ciudad, de dónde conoció la app y la nota. Solo el refirente es opcional |

### Por qué no hay contraseña temporal

El pedido original era enviar una contraseña temporal por correo y forzar el cambio. Se
descartó por dos motivos concretos:

1. **Hoy nadie tiene fila en Better Auth hasta que hace clic en el magic link.**
   `signInMagicLink` solo guarda un token de verificación; el usuario se crea en
   `/magic-link/verify` (`node_modules/better-auth/dist/plugins/magic-link/index.mjs:160`).
   Fijar una contraseña al aprobar obligaría a crear esa fila a mano, con
   `$context.internalAdapter.createUser` + `password.hash` + `createAccount` — API interna de
   Better Auth, sin garantía de estabilidad entre versiones. (La alternativa pública, el plugin
   `admin`, añade columnas al esquema del componente de Convex y su middleware exige una
   sesión de admin real: dos incógnitas de integración.)
2. **El resultado observable es el mismo y la contraseña temporal es peor**: queda en el buzón
   del solicitante para siempre. El magic link caduca.

El flujo elegido consigue lo que se pedía —la persona entra y lo primero que hace es definir su
contraseña— reutilizando lo que ya existe.

### Por qué una tabla nueva y no extender `invitations`

Una solicitud y una invitación son cosas distintas: la primera la escribe un desconocido y
puede rechazarse; la segunda la emite un admin y **es el gate de acceso** que lee
`ensureExists`. Meterlas en la misma tabla obligaría a añadir campos opcionales que no aplican
a una invitación (ciudad, nota, refirente) y a revisar `by_status`,
`admin.listPendingInvitations` y `PendingInvitationsCard` para que no empiecen a mostrar
solicitudes como si fueran invitaciones enviadas.

Con tabla aparte, **aprobar = emitir una invitación**, o sea el camino que ya está en
producción y probado. `ensureExists` no cambia su lógica de autorización.

## Arquitectura

```
/solicitar-acceso (público)
      │  registrationRequests.submit  (mutation pública, sin sesión)
      ▼
  registrationRequests { status: "pending" }
      │  ├─ correo «recibimos tu solicitud» → solicitante
      │  └─ correo «nueva solicitud»        → cada admin activo
      ▼
  /admin → PendingRequestsCard
      │
      ├─ rechazar → status: "rejected"   (silencioso, sin correo)
      │
      └─ aprobar  → registrationRequests.approve (action)
                      ├─ invitations.createFromAdmin(email, "user")
                      ├─ sendAccessMagicLink(email)
                      ├─ correo «tu solicitud fue aprobada»
                      └─ status: "approved"
                           ▼
                    clic en el magic link
                           ▼
                    ensureExists → users { mustSetPassword: true }
                           ▼
                    AuthGuard → /definir-password
                           ▼
                    auth.api.setPassword → flag limpiado → /dashboard
```

## 1. Modelo de datos

### Tabla nueva `registrationRequests` (`convex/schema.ts`)

```ts
registrationRequests: defineTable({
  email: v.string(),        // SIEMPRE normalizado con normalizeEmail()
  name: v.string(),
  city: v.string(),
  source: v.string(),       // de dónde conoció la app — clave de REGISTRATION_SOURCES
  referredBy: v.optional(v.string()),
  note: v.string(),         // por qué quiere usar la app
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected")
  ),
  createdAt: v.number(),
  reviewedAt: v.optional(v.number()),
  reviewedBy: v.optional(v.string()),   // clerkId del admin que decidió
})
  .index("by_email", ["email"])
  .index("by_status", ["status"])
  .index("by_createdAt", ["createdAt"])
```

`by_createdAt` existe para el limitador por ventana de tiempo (§2), no para la UI.

El correo se normaliza igual que en `invitations.createFromAdmin`: se guarda y se busca
siempre en minúsculas y sin espacios. Si difiriera, la solicitud y la invitación que se emite
al aprobar apuntarían a correos distintos.

### Campo nuevo en `users`

```ts
mustSetPassword: v.optional(v.boolean()),
```

Opcional a propósito: `undefined` significa «no aplica». Sin eso, al desplegar el campo todos
los usuarios existentes quedarían atrapados en el guard de §5.

### Constante nueva (`src/lib/constants.ts`)

```ts
export const REGISTRATION_SOURCES = [
  { value: "amigo",     label: "Un amigo o familiar" },
  { value: "redes",     label: "Redes sociales" },
  { value: "busqueda",  label: "Buscando en internet" },
  { value: "trabajo",   label: "En el trabajo" },
  { value: "otro",      label: "Otro" },
] as const;
```

Es un `Select` con opciones fijas y no texto libre para que mañana se pueda contar de dónde
llega la gente. Si la respuesta es «Otro», el contexto lo da la nota; no hay campo extra.

## 2. Camino público

### Ruta `/solicitar-acceso`

En el grupo `(auth)`, con `AuthShell` (el grupo no tiene `layout.tsx`; el marco visual lo pone
ese componente). Sigue el patrón de los formularios de auth que ya existen: `useState` +
`<form onSubmit>` + validación nativa HTML, sin react-hook-form ni zod — es como están
`SignInForm`, `ForgotPasswordForm` y `ResetPasswordForm`, y reutiliza `AUTH_INPUT_CLASS`,
`AuthAlert` y `FieldIcon` de `AuthFields.tsx`.

Al enviar con éxito, la página **sustituye el formulario por un mensaje de confirmación** (no
lo deja en pantalla); así no se reenvía por inercia.

`/login` gana un enlace al pie: «¿No tienes cuenta? Solicita acceso».

`/solicitar-acceso` se añade a `PUBLIC_PREFIXES` en `src/proxy.ts`.

### Mutation `registrationRequests.submit`

Es el **primer endpoint de la app sin sesión** (no llama `getCurrentUser`). Todas las defensas
van en el servidor; la validación del navegador no cuenta.

1. **Normalizar y recortar** cada campo (`normalizeEmail` para el correo, `trim()` para el resto).
2. **Topes de longitud**, y se rechaza por encima:

   | Campo | Tope |
   |---|---|
   | `email` | 254 |
   | `name` | 80 |
   | `city` | 80 |
   | `referredBy` | 80 |
   | `note` | 1000 |

   `source` debe ser una de las claves de `REGISTRATION_SOURCES`.
   Sin topes, una mutation pública es un buzón abierto para escribir megabytes en la base.
3. **Obligatorios**: todos menos `referredBy`.
4. **Una `pending` por correo**: si ya existe, no inserta, **no programa ningún correo** y
   devuelve éxito igual. Lo segundo importa tanto como lo primero: sin eso, pulsar «enviar»
   diez veces bombardea el buzón del solicitante y el de todos los admins.
5. **Tope por ventana**: contar con `by_createdAt` las solicitudes de la última hora; por
   encima de `REGISTRATION_REQUESTS_PER_HOUR` (**20**) se rechaza. Es un tope global, no por
   correo: el del correo ya lo cubre el punto 4, y lo que este frena es una ráfaga desde el
   mismo sitio con correos distintos. 20 por hora es holgado para el uso real de una app de
   uso personal y corta en seco un script.

   `assertRateLimit` **no sirve acá**: cuenta filas de la tabla `transactions` por `by_user`
   (ver CLAUDE.md), o sea limitaría en función de cuántos movimientos registró un usuario que
   en este flujo ni siquiera existe. Va un limitador propio sobre esta tabla, mismo patrón que
   `assertAuditRateLimit` sobre `auditLogs`.
6. **Respuesta siempre idéntica** — el mismo «recibimos tu solicitud» tanto si es nueva, como
   si ya había una pendiente, como si el correo ya tiene cuenta. Si el mensaje cambiara según
   el caso, el formulario se convierte en un oráculo para averiguar quién tiene cuenta en la
   app.
7. Programar los dos correos (§6).

**No se escribe nada en `auditLogs` al enviar el formulario.** `auditLogs.userId` es
obligatorio y aquí no hay usuario: meter un `"public"` inventado ensuciaría
`RecentActivityCard`, que resuelve ese campo contra `users`, con un actor que no existe. La
fila de `registrationRequests` ya tiene `createdAt` y todos los datos: **es** el registro. La
auditoría empieza cuando hay un admin de verdad detrás (§7).

## 3. Revisión en el panel

### `PendingRequestsCard`

Nueva tarjeta en la sección «Personas» de `/admin` (`src/app/(app)/admin/page.tsx`), junto a
`PendingInvitationsCard`. Consulta `api.registrationRequests.listPending`.

Cada fila muestra correo y nombre, y despliega el resto: ciudad, de dónde conoció la app,
refirente y la nota completa. Dos acciones: **Aprobar** y **Rechazar**.

La query marca cada fila con `alreadyRegistered: boolean` (lookup de `users` por `by_email`) y
la UI lo destaca, para que el admin no apruebe por inercia una solicitud hecha con el correo de
alguien que ya tiene cuenta.

### `registrationRequests.reject`

Mutation con `assertAdmin`. Marca `rejected` + `reviewedAt` + `reviewedBy`, registra
`REGISTRATION_REJECTED` y **no envía nada**. La fila no se borra: es el histórico de la
decisión.

Solo se puede rechazar una `pending`; una ya resuelta lanza.

## 4. Aprobación

Action `registrationRequests.approve({ requestId })`.

Va en un **módulo normal de `convex/`, no en `convex/actions/`**: esa carpeta está deprecada y
obliga a `"use node"`. No hace falta: `convex/http.ts` registra las rutas de Better Auth con
`createAuth` y no lleva `"use node"`, así que BA —y por tanto `sendAccessMagicLink`— funciona
en el runtime por defecto de Convex.

El envío de los correos sí queda como `internalAction` con `"use node"` en `convex/actions/`,
junto a los tres que ya hay (`sendMagicLinkEmail`, `sendResetPasswordEmail`,
`sendWelcomeEmail`): comparten el SDK de Resend y el mismo runtime, y partir esa familia en dos
por una regla de organización no compra nada. `approve` los dispara con `ctx.scheduler` /
`runAction`, igual que hoy.

**`sendAccessMagicLink` hay que moverla primero.** Hoy vive en `convex/actions/adminUsers.ts`,
que lleva `"use node"`; Convex empaqueta los módulos de Node y los de V8 por separado, así que
un módulo V8 —como será `registrationRequests.ts`— **no puede importarla de ahí**. Se extrae
tal cual a `convex/lib/accessLink.ts`, sin directiva (solo necesita `createAuth`, que ya
sabemos que corre en V8), y `adminUsers.ts`, `seedAdmin.ts` y `approve` la importan de ese
sitio. Es un movimiento mecánico, sin cambio de comportamiento.

Orden, que importa:

1. `assertAdminFromAction`.
2. Releer la solicitud. Si no está `pending`, abortar — dos admins con la pestaña abierta no
   pueden aprobar dos veces.
3. **Rechazar si el correo ya existe en `users`.** Esto no es cosmético: el trigger `onCreate`
   de `convex/auth.ts` vincula por email cualquier usuario nuevo de Better Auth que llegue con
   `emailVerified: true`, y el magic link crea exactamente eso. Aprobar una solicitud hecha con
   el correo de un usuario existente le entregaría a un tercero el acceso a esa cuenta.

   **Requisito previo, no opcional**: `users.email` se guardó históricamente **sin
   normalizar** (lo advierte el propio `ensureExists`), así que un lookup por `by_email` con el
   correo en minúsculas puede no encontrar a un usuario guardado con mayúsculas — justo el
   agujero que este paso debe tapar. Hay que añadir y correr
   `migrations.normalizeUserEmails`, calcada de la `normalizeInvitationEmails` que ya existe
   (`convex/migrations.ts:410`), **antes** de desplegar esta función.
4. `internal.invitations.createFromAdmin({ email, role: "user", invitedBy: admin.clerkId })`.
5. `sendAccessMagicLink(ctx, email)` — la función ya exportada en `actions/adminUsers.ts`.
6. Correo «tu solicitud fue aprobada» (§6).
7. **Solo ahora**: una mutation que marca `approved` + `reviewedAt` + `reviewedBy` y registra
   `REGISTRATION_APPROVED` en `auditLogs` — **pero solo si la fila sigue en `pending`**; si no,
   lanza.

Que el paso 7 vaya al final es deliberado: si el envío falla, la solicitud sigue `pending` y el
botón se puede volver a pulsar. Al reintentar, `invitations.createFromAdmin` es idempotente, así
que no se duplica nada.

Que sea una mutation condicionada, y no un `patch` a secas, es lo que sostiene el caso de dos
admins aprobando a la vez. Los pasos 2–6 corren en una action y sus lecturas **no** son
transaccionales: ambos pueden pasar el paso 2 y ambos pueden mandar un magic link. Eso es
inofensivo (el segundo enlace simplemente sustituye al primero) y es el costo que se acepta.
Lo que no puede duplicarse es la decisión: la mutation atómica del paso 7 garantiza un solo
`reviewedBy` y una sola fila de auditoría.

Las actions de correo actuales hacen `console.warn` y `return` cuando falta `RESEND_API_KEY`.
**Para el correo de aprobación eso está mal**: dejaría la solicitud marcada como aprobada sin
que la persona se entere nunca. Ese envío tiene que lanzar si no hay API key.

## 5. Primera entrada y contraseña obligatoria

### `ensureExists` marca al usuario nuevo

En la rama que inserta una fila nueva (la que consume la invitación), añadir
`mustSetPassword: true`.

Aplica a **todo invitado nuevo**, no solo a los que vienen del formulario. Es a propósito: hoy
un invitado por el admin entra con el magic link y nada le obliga a definir contraseña, y como
la pestaña de enlace mágico ya no está en la UI, la próxima vez se queda afuera y «¿olvidaste
tu contraseña?» no le manda nada (no tiene cuenta `credential`). Esto cierra ese hueco de paso.

Ninguna de las otras ramas de `ensureExists` toca el flag: quien se vincula por email es un
usuario preexistente que ya tiene su acceso resuelto.

### Guard en `AuthGuard`

`src/components/layout/AuthGuard.tsx` ya tiene el patrón exacto, con
`isAdminOnRestrictedRoute`: calcula la condición, un `useEffect` hace `router.replace`, y el
render devuelve el skeleton mientras tanto. Se replica:

```ts
const mustSetPassword =
  me != null && me.active === true && me.mustSetPassword === true &&
  pathname !== "/definir-password";
```

Va en `AuthGuard` y **no** en `(app)/layout.tsx` por un problema de orden: el layout solo hace
`isAuthenticated()`, y en el primer login de alguien la fila de `users` todavía no existe
cuando el layout renderiza — `ensureExists` corre después, dentro de `AuthGuard`. Un guard
server-side leería `getMe === null` y no redirigiría. `AuthGuard` en cambio está suscrito a
`getMe`, así que ve el flag en cuanto la fila se crea.

### Ruta `/definir-password`

Va en un **grupo nuevo `(setup)`**, con su propio `layout.tsx` mínimo: comprueba
`isAuthenticated()` y monta el marco de `AuthShell`. No entra en `(app)` porque esa pantalla no
debe tener Sidebar, BottomNav, Header ni `AppDataProvider` — es una pantalla de paso, no parte
de la app. El proxy ya la protege: al no estar en `PUBLIC_PREFIXES`, exige cookie de sesión.

Ponerla fuera de `(app)` resuelve de paso los dos bucles que habría habido: como `AuthGuard`
no la envuelve, no hace falta exceptuarla de su propio redirect, ni añadirla a las rutas que el
guard de rol le permite a un admin (`/admin` y `/perfil`) — ese guard tampoco corre allí.

Formulario de contraseña nueva + confirmación, reutilizando `PasswordStrengthMeter` y
`passwordStrength()` de `@/lib/passwordStrength`, igual que `ResetPasswordForm`.

Al enviar, llama a la action `users.setInitialPassword({ newPassword })`:

```ts
const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
await auth.api.setPassword({ body: { newPassword }, headers });
```

`authComponent.getAuth` (`@convex-dev/better-auth/dist/client/create-client.d.ts:99`) arma los
headers de la sesión actual a partir de `identity.sessionId`, que es la forma soportada de
llamar endpoints de Better Auth con sesión desde una función de Convex.

`setPassword` es `serverOnly` —no está expuesto por HTTP, así que no hay `authClient.setPassword`—
y **lanza `PASSWORD_ALREADY_SET` si la cuenta ya tiene contraseña**
(`better-auth/dist/api/routes/update-user.mjs:227`). Eso impide que esta ruta se use para pisar
la contraseña de nadie. Su `sensitiveSessionMiddleware` exige sesión fresca, que se cumple
porque `convex/auth.ts` fija `session: { freshAge: 0 }`.

Verificado que `getHeaders` funciona con la configuración actual: lee `identity.sessionId`, y
aunque `convex/auth.ts` define un `jwt.definePayload` propio, el plugin de Convex inyecta
`sessionId: session.id` **después** de esparcirlo
(`@convex-dev/better-auth/dist/plugins/convex/index.js:63`), así que siempre llega. No quitar
ese `sessionId` del payload al «limpiarlo» en el futuro.

**`PASSWORD_ALREADY_SET` hay que capturarlo, no dejarlo propagar.** Si no, es un bloqueo
permanente: alguien con el flag puesto abre `/forgot-password` en otra pestaña (es ruta
pública), completa el `resetPassword` —que sí crea la cuenta `credential`—, vuelve, el guard lo
manda a `/definir-password`, `setPassword` lanza, el flag nunca se limpia y esa persona no
puede entrar a la app nunca más. Al capturarlo, `setInitialPassword` **limpia el flag
igualmente** y devuelve un resultado distinto para que la pantalla diga «ya tenías una
contraseña definida, entra con esa» y siga a `/dashboard`.

En el camino normal, una mutation limpia `mustSetPassword` y registra `USER_PASSWORD_CHANGED`
(la constante ya existe). Luego `router.replace("/dashboard")`.

## 6. Correos

Tres plantillas nuevas en `convex/lib/emailTemplates.ts`, con el estilo que ya usa el archivo:
template literals de HTML con tablas y estilos inline, sin JSX, y `escapeHtml()` en **todo**
dato que venga del solicitante — es texto que escribió un desconocido y va dentro de un HTML.

| Plantilla | Destinatario | Disparador | Asunto |
|---|---|---|---|
| `registrationReceivedEmailHtml(name)` | solicitante | al enviar el formulario | «Recibimos tu solicitud — Okany Sync» |
| `newRegistrationRequestEmailHtml(request, adminUrl)` | cada admin activo | al enviar el formulario | «Nueva solicitud de acceso a Okany Sync» |
| `registrationApprovedEmailHtml(name, signInUrl)` | solicitante | al aprobar | «Tu solicitud fue aprobada 🎉» |

El aviso a admins consulta `users` por `role: "admin"` y `active: true`, e incluye los datos de
la solicitud y un enlace a `/admin`. Un envío por admin, con un `Promise.allSettled` para que
un correo que falle no tumbe los demás — esos correos son informativos y el estado real vive en
la tabla.

Las tres actions siguen el patrón de las existentes: `internalAction`, `new Resend(apiKey)`,
`RESEND_FROM_EMAIL` con el mismo fallback. Solo la de aprobación lanza cuando falta la API key
(§4).

## 7. Auditoría

Dos acciones nuevas en `AUDIT_ACTIONS` (`src/lib/constants.ts`):

```ts
REGISTRATION_APPROVED: "registration.approved",
REGISTRATION_REJECTED: "registration.rejected",
```

Solo dos, no tres: el envío del formulario no se audita (§2), porque no hay un actor que
registrar.

**Hay que añadirlas también a `AUDIT_ACTION_LABELS`**, en el mismo archivo: existe un test que
verifica que ese record cubre exactamente las acciones declaradas, y si falta una, falla.

Con eso, las dos aparecen solas en `RecentActivityCard` del panel.

## 8. Errores y casos borde

| Caso | Comportamiento |
|---|---|
| Correo ya tiene cuenta en `users` | `submit` acepta y responde igual que siempre (no filtra información). La tarjeta del panel lo marca y `approve` lo rechaza |
| Ya hay una solicitud `pending` con ese correo | No se inserta otra; misma respuesta de éxito |
| Solicitud ya `approved` o `rejected` | `approve` y `reject` lanzan; la UI recarga la lista |
| Dos admins aprueban a la vez | Ambos pueden mandar magic link (inofensivo, el segundo sustituye al primero); la mutation condicionada del paso 7 garantiza un solo `reviewedBy` y una sola fila de auditoría |
| Usuario con el flag que definió contraseña por `/forgot-password` | `setPassword` lanza `PASSWORD_ALREADY_SET`; se captura, se limpia el flag igual y la pantalla le dice que entre con la que ya definió |
| Resend caído al aprobar | La solicitud queda `pending`, el botón se puede volver a pulsar; `createFromAdmin` es idempotente |
| Falta `RESEND_API_KEY` | Acuse y aviso a admins: `console.warn` y siguen (patrón actual). Aprobación: lanza |
| Campo por encima del tope | `submit` rechaza con mensaje claro; el `maxLength` del navegador es solo comodidad |
| Ráfaga de solicitudes | Limitador por ventana sobre `by_createdAt` |
| Usuario con el flag que cierra sesión a medias | El flag sigue en `users`; al volver a entrar, el guard lo lleva otra vez a `/definir-password` |
| Admin nuevo con el flag | `/definir-password` vive fuera de `(app)`, así que el guard de rol no la toca |

## 9. Tests

El entorno es `node` con Vitest, y la cobertura mide `src/lib/**` y `convex/lib/money.ts`. No
existe infraestructura de tests de funciones de Convex y este trabajo no la introduce.

La lógica que se puede probar de verdad se extrae a **`src/lib/registrationRequest.ts`**, puro,
con sus tests en `src/lib/__tests__/registrationRequest.test.ts`:

- `validateRegistrationRequest(input)` — obligatorios, topes de longitud, `source` válido,
  normalización y recorte. La usan el formulario y la mutation, así que cliente y servidor no
  pueden discrepar.
- `canReview(status)` — qué puede hacer el admin con una solicitud según su estado.

El test existente de `AUDIT_ACTION_LABELS` ya cubre esto sin tocarlo: falla solo si las dos
constantes nuevas se añaden sin su etiqueta.

## 10. Archivos

**Nuevos**

```
convex/registrationRequests.ts              submit / listPending / approve / reject
convex/actions/sendRegistrationEmails.ts    los tres envíos ("use node" + Resend, §4)
src/lib/registrationRequest.ts              validación pura
src/lib/__tests__/registrationRequest.test.ts
convex/lib/accessLink.ts                    sendAccessMagicLink, extraída de adminUsers (§4)
src/app/(auth)/solicitar-acceso/page.tsx
src/components/auth/RequestAccessForm.tsx
src/app/(setup)/layout.tsx                  marco mínimo, solo isAuthenticated (§5)
src/app/(setup)/definir-password/page.tsx
src/components/auth/SetInitialPasswordForm.tsx
src/components/admin/PendingRequestsCard.tsx
```

**Modificados**

```
convex/schema.ts                  tabla registrationRequests + users.mustSetPassword
convex/users.ts                   ensureExists marca mustSetPassword; setInitialPassword
convex/migrations.ts              normalizeUserEmails (requisito previo, §4 paso 3)
convex/actions/adminUsers.ts      importa sendAccessMagicLink de lib/accessLink
convex/actions/seedAdmin.ts       ídem
convex/lib/emailTemplates.ts      tres plantillas
src/lib/constants.ts              AUDIT_ACTIONS + AUDIT_ACTION_LABELS + REGISTRATION_SOURCES
                                  + REGISTRATION_REQUESTS_PER_HOUR
src/proxy.ts                      /solicitar-acceso en PUBLIC_PREFIXES
src/components/layout/AuthGuard.tsx   guard de mustSetPassword
src/components/auth/SignInForm.tsx    enlace «Solicita acceso»
src/app/(app)/admin/page.tsx          monta PendingRequestsCard
```

## Fuera de alcance

- «Invitar usuario» sigue igual y sigue pudiendo crear admins. La única diferencia es que a
  sus invitados también se les pedirá definir contraseña al entrar, como a todo usuario nuevo
  (§5) — que es el hueco que ese apartado cierra a propósito.
- No se reabre el registro con contraseña: `disableSignUp` sigue en `true`.
- No hay correo de rechazo, ni motivo de rechazo.
- No hay CAPTCHA. Las defensas son las de §2; si aparece abuso real, el plugin `captcha` de
  Better Auth está disponible y es una adición aislada.
- No se borran solicitudes viejas. Si la tabla crece, una poda es un cron aparte.
