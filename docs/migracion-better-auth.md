# Plan de migración: Clerk → Better Auth

Estado: **Fases 2 y 3 completas. Fase 4 preparada en el repo, pendiente de ejecución real contra producción** (checklist abajo — requiere acciones del usuario: env vars de prod, `git push`, `npx convex deploy` a prod, y disparar el envío masivo de magic links). `convex/auth.config.ts` está swapeado a Better Auth (Clerk queda desconectado del flujo de validación de JWT en dev); el backend ya no depende de la API de Clerk para nada (`convex/lib/clerkApi.ts` se borró, el webhook `/api/webhooks/clerk` se eliminó de `convex/http.ts`). Todo el código está en el repo (sin commitear — commits son responsabilidad del usuario). La producción real sigue 100% en Clerk hoy — nada de esto le ha llegado todavía. Falta ejecutar la Fase 4 y la Fase 5 (limpieza de `package.json`/CSP/tabla `sessions` vestigial).

## Fase 3 — Resumen de lo realmente hecho (difiere del plan original de este documento)

El plan original de este documento (ver sección "Fase 3" más abajo) proponía reescribir contra el plugin `admin` de Better Auth (`createUser`, `setRole`, `banUser`, `removeUser`). Ese plugin **ya había sido descartado explícitamente en la Fase 1** (`users.role`/`users.active` de la app quedan como única fuente de verdad de autorización, agnóstica del proveedor de auth) — el texto de esta sección quedó desactualizado y nunca se corrigió hasta ahora. Lo que realmente se hizo:

- **`convex/http.ts`**: se eliminó por completo la ruta `/api/webhooks/clerk` (verificación Svix, `upsertFromClerk`, disparo de `deleteUserCascade` en `user.deleted`). Solo queda `authComponent.registerRoutes(http, createAuth)`. No hace falta reemplazo: el ciclo de vida de usuarios ya lo cubren el trigger `onCreate` de `convex/auth.ts` + `users.ensureExists` (primer login) y `users.createFromAdmin` (alta por un admin) — el webhook era redundante desde que Better Auth corre embebido en el mismo deployment.
- **`convex/lib/clerkApi.ts`**: borrado entero (no reescrito). Tras quitarle sus 3 llamadores (`adminUsers.ts`, `deleteUserCascade.ts`, `seedAdmin.ts`) no quedó ningún caller — las otras 2 funciones (`clerkCreateInvitation`, `clerkCreateSignInToken`) ya estaban huérfanas desde la Fase 2.
- **`convex/actions/adminUsers.ts`**: se eliminaron `updateRoleByAdmin` (sincronizaba `publicMetadata` de Clerk) y `syncRoleToClerk` (sin callers desde que `AuthGuard` dejó de invocarla en la Fase 2). El cambio de rol ahora llama directo a la mutation `users.updateByAdmin` desde el frontend (`admin/users/[id]/page.tsx`) — mismo mutation que ya usaba el toggle de "activo/inactivo", con el mismo guard de "no dejar el sistema sin ningún admin activo".
- **`convex/actions/seedAdmin.ts`**: reescrito sin ninguna dependencia de Clerk. Ya no genera contraseña (`ADMIN_PASSWORD` en texto plano quedó eliminado del repo) — el único camino de acceso es el magic link, igual que cualquier otro login. Sin un id externo estable de Clerk que consultar, la idempotencia ahora se resuelve buscando por email (nueva internalQuery `users.getByEmailInternal`); si el admin no existe se crea con `clerkId: crypto.randomUUID()` — ese id queda como identificador de negocio de siempre, y `authId` se vincula solo en el primer login real (mismo mecanismo `onCreate`/`ensureExists` que usa cualquier usuario legacy).
- **`convex/actions/seedTestInvitation.ts`**: confirmado sin cambios — nunca tuvo dependencia de Clerk.
- **`convex/actions/deleteUserCascade.ts`**: el paso 11 (antes `clerkDeleteUser`) ahora borra el registro de Better Auth del usuario directamente contra el adapter genérico del componente (`components.betterAuth.adapter.deleteMany`/`deleteOne`, modelos `session` → `account` → `user`, filtrando por `userId`/`_id` = `authId`). No existe un endpoint de `auth.api` para "borrar a cualquier usuario por id" — `/delete-user` es de autoservicio (exige la sesión del propio usuario) — así que este es el único camino disponible sin el plugin `admin`. Se salta por completo si el usuario nunca tuvo `authId` (no llegó a loguearse bajo Better Auth), y cualquier error ahí se captura y loguea sin abortar la cascada: el resto del borrado (incluido el paso 12, borrar la fila de `users`) debe completarse igual. **Verificado empíricamente** (no solo por los tipos generados) con un usuario y registro de Better Auth desechables creados a propósito, confirmando después de correr la cascada que las filas `user`/`session`/`account` del componente y la fila de `users` de la app quedaron eliminadas.
- **`convex/users.ts`**: `upsertFromClerk` (única llamadora era el webhook borrado) eliminada.
- Dos hallazgos menores corregidos de paso: el email de bienvenida (`convex/lib/emailTemplates.ts`) mencionaba "el enlace mágico que Clerk te enviará" — corregido a los métodos de login reales (enlace mágico o contraseña); el comentario de cabecera de `convex/schema.ts` decía "USUARIOS — Sincronizados desde Clerk vía webhook" — corregido a como se crean ahora.

Con esto, `CLERK_SECRET_KEY` y `CLERK_WEBHOOK_SECRET` quedan sin ningún uso en el código (el riesgo conocido del `sk_live_` en dev pierde toda relevancia práctica, aunque el env var siga configurado). El `svix` de `package.json` y los 2 paquetes `@clerk/*` quedan pendientes de quitar en la Fase 5 (siguen instalados pero sin imports vivos en `convex/`).

## Fase 2 — Resumen de lo realmente hecho (difiere del plan original de este documento)

El plan original de este documento describía la Fase 2 como ~6 archivos de frontend. En la ejecución real, una segunda validación de diseño encontró que el alcance era mayor en dos frentes — ver el detalle en cada sub-sección:

1. **Alcance de frontend real: 16 archivos, no 6.** `admin/layout.tsx`, `app/page.tsx` y `cuentas/[id]/page.tsx` (comparación `isOwner`) también dependían de Clerk y se habrían roto en cuanto Clerk dejara de validar JWTs.
2. **Hallazgo de seguridad crítico, cerrado antes del swap** (ver más abajo): `convex/http.ts` expone las rutas de Better Auth sin condicionarlas a `auth.config.ts` — ya estaban montadas en dev antes de este swap. Con `emailAndPassword` habilitado sin `disableSignUp` y sin gate de `emailVerified` en el enlace por email, cualquiera podía registrarse con el email de un usuario real y robarle el vínculo `authId`.
3. **Bug crítico de permisos, no relacionado con Clerk directamente**: `convex/lib/permissions.ts::getPermission` (usada por `accounts`, `transactions`, `accountShares`, `loans`) resolvía identidad con `identity.subject` crudo. Bajo Better Auth eso es el `authId`, no el `clerkId` que guardan esas tablas — sin el fix, **todas las cuentas y transacciones de cualquier usuario vinculado por email habrían devuelto "Sin acceso"**. Corregido junto con 3 funciones más de `convex/users.ts` (`listAll`, `adminStats`, `updateByAdmin`) que tenían el mismo problema.

### Hardening de seguridad (Sección 0 del plan de la Fase 2)

- `convex/auth.ts`: `emailAndPassword.disableSignUp: true` (bloquea `/sign-up/email` — nadie puede crear un usuario de Better Auth sin pasar por el magic link, que sí prueba posesión del correo), `session.freshAge: 0` (si no, `authClient.listSessions()` falla a las 24h con `SESSION_NOT_FRESH`), `convexPlugin({ jwksRotateOnTokenGenerationError: true })` (autosana un mismatch de algoritmo JWKS entre swaps).
- Gate `doc.emailVerified === true` en el trigger `onCreate` (`convex/auth.ts`) y en el enlace de reparación de `convex/users.ts::ensureExists` — el enlace por email nunca vincula `authId` a una cuenta existente sin verificación de correo.
- **Consecuencia real de `disableSignUp: true`**: nadie tiene contraseña hasta que la define vía reset. Por eso se implementó `emailAndPassword.sendResetPassword` (`convex/actions/sendResetPasswordEmail.ts`, siguiendo el patrón exacto de `sendMagicLinkEmail.ts`) — sin esto, el login por contraseña habría sido UI muerta e imposible de probar.
- `convex/actions/adminUsers.ts` y `deleteUserCascade.ts`: usaban `identity.subject` crudo contra `getByClerkIdInternal`. Nuevo helper `getCurrentUserFromAction`/`assertAdminFromAction` en `convex/lib/auth.ts`, respaldado por la internalQuery `getByIdentitySubjectInternal` (prueba `by_clerkId` y `by_authId`, igual que `getCurrentUserOrNull` ya hace para queries/mutations).
- **Dos botones de admin que habrían quedado como callejón sin salida silencioso** (pasaban el chequeo de admin pero llamaban a una API de Clerk que ya no controla el login): `createByAdmin` ahora envía el magic link de Better Auth en vez de una invitación de Clerk; `generateResetLink` se renombró a `sendAccessEmail` y envía el magic link directo al usuario en vez de generar un link que el admin tenía que copiar y compartir manualmente.

### Decisión de login permanente: magic link + contraseña

No solo passwordless: el formulario de sign-in (`src/components/auth/SignInForm.tsx`) tiene dos modos — enlace mágico (primario) y contraseña. "¿Olvidaste tu contraseña?" dispara `authClient.requestPasswordReset`, que también es el único camino para que alguien **defina** su contraseña por primera vez (`setPassword` de Better Auth es `serverOnly`, verificado en el código instalado). La página `src/app/(auth)/reset-password/page.tsx` lee el token de un **query param** (`?token=...`), no de un segmento de ruta — el endpoint de Better Auth que arma ese enlace (`/api/auth/reset-password/:token`) redirige a `callbackURL` agregando `?token=...`, verificado empíricamente contra la deployment real (el diseño original asumía un segmento `[token]` en la ruta, corregido durante la validación en el navegador).

### Otros hallazgos de la validación en vivo

- `admin/layout.tsx` distingue `me === null` (→ `/sign-in`) de `me.role !== "admin"` (→ `/dashboard`) — colapsar ambos casos habría dejado a un usuario sin fila en Convex en un loop de redirects.
- `src/components/providers/ConvexClientProvider.tsx` necesitó un cast documentado (`as unknown as AuthClient`) para el prop `authClient` de `ConvexBetterAuthProvider` — el tipo `AuthClient` exportado por `@convex-dev/better-auth@0.12.5` se reconstruye vía un genérico sintético que no unifica limpiamente con un cliente real creado con plugins concretos; verificado que el objeto expone `.useSession`/`.convex.token` correctamente en runtime.
- `convex/lib/clerkApi.ts::clerkCreateInvitation` y `clerkCreateSignInToken` quedaron sin ningún caller tras el punto anterior — no se borraron porque el archivo completo está en el alcance de la Fase 3 (reescritura contra la API de Better Auth).
- La deployment de dev tiene `CLERK_SECRET_KEY` con una clave `sk_live_` (de producción de Clerk), no `sk_test_` — riesgo conocido, documentado, sin resolver; desaparece solo cuando la Fase 5 elimina Clerk del proyecto.

**Verificado en vivo en el navegador** (no solo typecheck): login por magic link (usuario existente y admin), login por contraseña tras un reset real, `authId` vinculado sin tocar `clerkId`, gate de admin (`/admin` para admin, `/dashboard` para user), panel admin completo (`listAll`, `adminStats`, `sendAccessEmail` con su audit log), sesiones activas (`listSessions`/`revokeSession` revocando una sesión real), cierre de sesión, y — el más importante — datos de negocio reales (cuentas, transacciones, patrimonio neto) visibles para un usuario vinculado por email, con los botones de propietario (`isOwner`) apareciendo correctamente.

## Bloqueo encontrado y resuelto: no se puede convivir con Clerk en el mismo `auth.config.ts`

El diseño original de la Fase 1 (agregar el proveedor de Better Auth junto al de Clerk en `convex/auth.config.ts`, dejando que ambos convivan mientras se prueba) **no es viable**: el propio plugin `convex` de `@convex-dev/better-auth` valida en tiempo de carga que exista **exactamente un** proveedor con `applicationID: "convex"` en el arreglo `providers` (`node_modules/@convex-dev/better-auth/src/plugins/convex/index.ts`, función `parseAuthConfig`) y lanza un error si encuentra más de uno. El proveedor de Clerk de este proyecto también usa `applicationID: "convex"` — es la convención estándar de cualquier integración de Convex (así lo pide `convex/_generated/ai/guidelines.md`), no algo propio de este proyecto que se pueda renombrar sin más: el JWT que emite Clerk trae ese valor fijo en el claim `aud`, configurado en el "JWT Template" del dashboard de Clerk.

Confirmado empíricamente: `npx convex dev --once` contra la deployment de dev (`dev:determined-woodpecker-55`) falló con:
```
Failed to analyze http.js: Uncaught Error: Multiple auth providers with applicationID 'convex' detected. Please use only one.
```

Se le preguntó al usuario cómo proceder (la deployment de dev es la misma que usa el desarrollo normal de la app, y en ese momento había cambios sin commitear de otro trabajo en curso que probablemente dependen de loguearse con Clerk ahí). Eligió: swap temporal — cambiar `auth.config.ts` de la deployment de dev a solo Better Auth mientras dura la validación, y revertirlo a Clerk apenas termine. Así se hizo, y ya quedó revertido (ver `convex/auth.config.ts` actual: Clerk es el único proveedor). El wiring de Better Auth entero (schema, `convex/auth.ts`, `convex/http.ts`, `convex/lib/auth.ts`) queda en el código de todas formas, simplemente inactivo hasta la Fase 2/4.

## Gate de identidad: CERRADO, con prueba real contra la deployment de dev (no solo lectura de código)

Primero por código fuente: se instalaron `better-auth@1.6.26` y `@convex-dev/better-auth@0.12.5` y se leyó `node_modules/better-auth/dist/plugins/jwt/sign.mjs`, función `getJwtToken`:
```js
sub: await options?.jwt?.getSubject?.(ctx.context.session) ?? ctx.context.session.user.id
```
`sub` (= `identity.subject` en Convex) es por defecto `session.user.id`.

Después, con la deployment de dev temporalmente en modo "solo Better Auth", se hizo la prueba real de punta a punta:
1. `POST {SITE_URL}/api/auth/sign-up/email` con un email de prueba → Better Auth devolvió `user.id = "k17dp0e1tk9cnk0aper8phc2sd8btnmg"`.
2. Se decodificó el JWT (`convex_jwt`) que vino en la cookie de la respuesta → `sub` = el mismo `"k17dp0e1tk9cnk0aper8phc2sd8btnmg"`.
3. Se llamó una query de Convex real (`/api/query` de la deployment) con ese JWT como Bearer token → `ctx.auth.getUserIdentity().subject` = el mismo valor, exacto.
4. **Prueba del enlace por email** (el mecanismo central de toda la Fase 0): se insertó una fila de prueba en `users` simulando un usuario legacy (`clerkId: "fake_clerk_id_test_fase1"`, sin `authId`), y se hizo sign-up en Better Auth con el mismo email. El trigger `onCreate` de `convex/auth.ts` corrió automáticamente y dejó `authId` seteado al nuevo id de Better Auth **sin tocar el `clerkId` original**. Verificado leyendo la fila directamente después: `clerkId: "fake_clerk_id_test_fase1"` (intacto), `authId: "k17dh1awxffq3pb7v55x214w3s8bvpky"` (recién vinculado).

Los usuarios y filas de prueba se borraron después de la verificación (la fila de `users` se eliminó explícitamente; los registros internos de Better Auth para esos dos emails de prueba quedaron en las tablas aisladas del componente en la deployment de dev — inertes, sin acceso a la app porque nunca tuvieron una fila de `users` propia real).

### Dos bugs reales encontrados en una revisión posterior (ya corregidos)

1. **`getCurrentUser` y `getCurrentUserId` resolvían identidad en orden distinto** (uno probaba `clerkId` primero, el otro `authId` primero). Con los datos de hoy coincidían, pero eran dos resoluciones de identidad ligeramente distintas para la misma pregunta — la receta para un bug que aparece meses después. Corregido: `getCurrentUserId` ahora delega en `getCurrentUser` (mismo orden, un solo lugar con la lógica).
2. **`ensureExists` seteaba `authId: identity.subject` también al crear un usuario nuevo bajo una sesión de Clerk** (no solo Better Auth). Esto es un bug real, no cosmético: cualquiera que se registrara *entre ahora y el corte* quedaría con su `authId` "ocupado" por un id de Clerk. En su primer login real bajo Better Auth después del corte, el trigger de vinculación lo saltaría (`legacy.authId === undefined` sería falso) y `ensureExists` caería al chequeo de invitación, que ya estaría consumida → **esa persona quedaría bloqueada permanentemente** con el mensaage "usuario no invitado", con sus datos intactos pero inalcanzables. Corregido: `authId` se deja sin definir al crear un usuario nuevo — para un usuario genuinamente nuevo `clerkId` ya es su `identity.subject` real (sea de Clerk hoy o de Better Auth después del corte), así que el lookup por `by_clerkId` alcanza solo, sin necesitar el puente.

Decisiones ya tomadas con el usuario:
- **Passwords**: reset forzado — no se migran hashes de Clerk. A cada usuario existente se le manda un magic link para autenticarse por primera vez / definir acceso nuevo.
- **Corte**: big-bang — ventana de mantenimiento corta, se apaga Clerk y se enciende Better Auth de una vez (no hay período de convivencia de ambos sistemas para el usuario final).
- **Componente**: `@convex-dev/better-auth` (el componente oficial de Convex), no una instalación estándar de Better Auth sobre Postgres — el stack ya es 100% Convex y así no se agrega infraestructura nueva.
- **Simplificación de arquitectura**: se elimina la doble fuente de verdad del rol admin (`users.role` en Convex + `publicMetadata.role` en Clerk, sincronizados a mano en cada login). Con Better Auth el rol se lee siempre fresco desde la sesión del propio backend de auth.

---

## Fase 0 — Investigación de identidad de usuario (COMPLETADA)

### El riesgo que se investigó

Casi todas las tablas de negocio (`accounts`, `transactions`, `budgets`, `cards`, `debts`, `goals`, `loans`, `categories`, `notifications`, `pushSubscriptions`, `accountShares`, `cardPurchases`, `cardInstallments`, `debtPayments`, `loanRepayments`, `recurringTransactions`, `netWorthSnapshots`, `auditLogs` — unas 20 tablas) guardan el `clerkId` del usuario como string plano en un campo `userId`/`ownerId`/`createdBy`/etc., sin pasar por una referencia a `_id` de Convex. Si el `identity.subject` que produce Better Auth es distinto del `clerkId` actual, todos esos registros quedan "huérfanos" el día del corte.

### Conclusión: NO hace falta preservar el id de Clerk. Se usa el patrón oficial `authId`

Investigando la documentación y el código fuente de `@convex-dev/better-auth` (incluyendo su propia guía interna de migración de versión 0.8→0.9, `migrate-userid`, y la guía "Migrating Existing Users"), el patrón recomendado — y el que se va a usar acá — es:

1. Se agrega un campo nuevo a la tabla `users` de Convex: `authId: v.optional(v.string())`, con un índice `by_authId`. **El campo `clerkId` existente NO se toca ni se renombra** — sigue siendo, para siempre, el identificador que usan las ~20 tablas de negocio.
2. `convex/lib/auth.ts` (`getCurrentUser` / `getCurrentUserId`) deja de usar `identity.subject` directamente. En su lugar:
   `identity.subject` (id que genera Better Auth) → buscar en `users` por índice `by_authId` → tomar el `clerkId` (ya existente, sin cambios) del documento encontrado → ese sigue siendo el "userId" que ya usan `accounts`, `transactions`, etc.
   Esto significa **cero cambios en las ~20 tablas de negocio y en sus queries/mutations** — el único archivo que cambia su lógica de resolución de identidad es `convex/lib/auth.ts`.
3. La vinculación del `authId` a cada usuario existente se hace con el mecanismo de **triggers** del propio componente (`docs/content/docs/features/triggers.mdx`, confirmado leyendo el código fuente oficial en `get-convex/better-auth`, no un mirror de terceros). Se configura `triggers.user.onCreate` al crear el cliente del componente:

   ```ts
   export const authComponent = createClient<DataModel>(components.betterAuth, {
     authFunctions,
     triggers: {
       user: {
         onCreate: async (ctx, doc) => {
           // doc es el registro de usuario que Better Auth acaba de crear; doc._id
           // es el id interno de Convex que (a confirmar en Fase 1) alimenta identity.subject.
           const legacy = await ctx.db
             .query("users")
             .withIndex("by_email", (q) => q.eq("email", doc.email))
             .unique();
           if (legacy) {
             await ctx.db.patch(legacy._id, { authId: doc._id }); // vincula, NO toca clerkId
           } else {
             // usuario genuinamente nuevo (invitado post-migración): crear fila de app normal,
             // con el mismo gate de invitations que hoy tiene ensureExists/upsertFromClerk.
           }
         },
       },
     },
   });
   ```
   Esto corre **en la misma transacción** que la creación del usuario en Better Auth (según la doc oficial), así que no hay ventana de carrera entre "usuario creado en Better Auth" y "usuario vinculado en la tabla de la app".
4. **No hace falta ningún script de migración masiva de usuarios antes del corte.** La vinculación ocurre sola, por usuario, la primera vez que cada quien se autentica después del cutover — que combina perfecto con la decisión de "reset forzado": justo después del corte se les manda a todos un magic link, lo usan, el trigger corre, y en ese mismo acto queda vinculada su cuenta.
5. El proyecto ya tiene, en `convex/users.ts::ensureExists`, una mutation idempotente que hoy sirve de respaldo cliente-side para cuando el webhook de Clerk todavía no llegó (se invoca desde `AuthGuard.tsx` en cada carga de la app). Con el trigger corriendo transaccionalmente, esa condición de carrera desaparece — `ensureExists` se simplifica a "leer la fila ya vinculada por `authId`", en vez de repetir la lógica de invitación que pasa a vivir en el trigger.

**Verificación del caso de cuentas compartidas** (duda planteada explícitamente al revisar el plan): se leyó `convex/accountShares.ts` completo. Todas las operaciones (`share`, `respondToInvitation`, `revoke`, `listForAccount`, etc.) resuelven identidad de dos formas, ninguna de las cuales depende de que un tercero ya haya iniciado sesión post-migración:
- El **llamante actual** siempre se resuelve vía `getCurrentUserId(ctx)` (que pasa a hacer el salto `authId → clerkId` de la Fase 1, solo para la sesión activa).
- Un **usuario objetivo** (el invitado a compartir una cuenta) se busca por `email` contra la tabla `users` y se guarda su `clerkId` histórico — un valor que nunca cambia, esté o no esa persona ya vinculada a Better Auth.
Conclusión: compartir/aceptar/revocar cuentas sigue funcionando igual durante la ventana de migración, incluso si el dueño se logueó bajo Better Auth antes que el invitado, o viceversa. No hace falta popular `authId` para todos los usuarios de antemano.

Fuentes consultadas: guía oficial "Migrating from Clerk to Better Auth" (better-auth.com); código fuente y docs oficiales de `get-convex/better-auth` en GitHub (`docs/content/docs/features/triggers.mdx`, `docs/content/docs/basic-usage/index.mdx`, `docs/content/docs/migrations/migrate-to-0-9/migrate-userid/`); código actual del repo (`convex/accountShares.ts`, `convex/users.ts`, `convex/schema.ts`).

Se descartó como fuente un mirror de terceros (`better-auth.dracodev.me`) que describía un hook `onCreateUser` — al listar el árbol real del repo `get-convex/better-auth` no existe esa página; el mecanismo real y verificado es `triggers.user.onCreate`.

### Único punto abierto: `identity.subject === doc._id` — gate obligatorio al inicio de la Fase 1

Toda la Fase 0 descansa en un solo supuesto: que `identity.subject` (lo que ve `ctx.auth.getUserIdentity()` en una función de Convex) es igual al `doc._id` que Better Auth le pasa al trigger `onCreate`. Si esto no es cierto, `by_authId` nunca hace match, `ensureExists` no encuentra a nadie, y cada usuario existente terminaría con una fila de app nueva mientras su historial queda huérfano — exactamente el escenario que la Fase 0 existe para descartar. **No se puede dar esto por sentado**; es la clave de unión de todo el diseño, no un detalle.

Se investigó a fondo por código fuente (no solo documentación) y la evidencia converge, pero no es 100% concluyente sin una prueba en vivo:
- El plugin de Convex del componente (`src/auth-options.ts`) usa el plugin `jwt()` **core de Better Auth** (no uno propio) — el comportamiento estándar y documentado de ese plugin es emitir `sub` = `user.id` de la sesión autenticada (semántica OIDC estándar).
- El ejemplo oficial de triggers usa `doc._id` (el id de Convex del documento de usuario del componente) como el valor a guardar en la tabla de la app (`authId: doc._id`) — esto solo tiene sentido como patrón si ese mismo valor es el que luego aparece como `identity.subject`; si no lo fuera, el ejemplo oficial de la doc estaría mal.
- No se encontró el código exacto que arma el JWT completo (vive dentro de `better-auth/plugins/jwt`, fuera del repo del componente) para confirmarlo línea por línea.

**Acción obligatoria — primer paso literal de la Fase 1, antes de cualquier otro trabajo de esa fase**: instalar el componente en el deployment de dev, crear un usuario de prueba desechable, y en una function de Convex hacer `console.log(JSON.stringify(await ctx.auth.getUserIdentity()))` comparado contra el `doc._id` que llega al trigger `onCreate`. Si coinciden: se procede tal cual está diseñado. Si no coinciden: hay que ajustar `convex/lib/auth.ts` para usar el campo real que sí lleva ese valor (p. ej. si el JWT expone `session.userId` en vez de `user._id` bajo otro claim) — el resto del diseño (tabla `authId`, trigger, no-bulk-script) no cambia, solo qué campo exacto se compara.

### Nota histórica — idea de usar `tokenIdentifier` en vez de `subject`, descartada al implementar

Al principio se consideró usar `identity.tokenIdentifier` (formato `"<issuer>|<subject>"`) en vez de `identity.subject`, seguiendo al pie de la letra una advertencia general de `convex/_generated/ai/guidelines.md` sobre no usar `subject` solo como clave de identidad global (pensada para apps con múltiples proveedores simultáneos). Se descartó al escribir el código real: reconstruir ese string a mano en el trigger (que no tiene un `ctx.auth.getUserIdentity()` real todavía) exigía duplicar el cálculo del `issuer` que hace `getAuthConfigProvider()`, con riesgo de que no coincidiera — una suposición extra para resolver un problema (colisión entre proveedores) que no existe acá, porque solo hay un proveedor activo a la vez. La decisión final (ver "Fase 1 — decisiones de implementación" más abajo) es guardar `authId = doc._id` (el `subject` crudo) sin reconstruir nada.

---

## Fases siguientes

### Fase 1 — Setup del componente (en paralelo, sin tocar producción)

**Decisiones de implementación tomadas al escribir el código (revisadas con advisor, no estaban en la versión original de este documento):**

- **Se descarta el plugin `admin` de Better Auth.** El schema *default* (sin "Local Install") del componente no incluye los campos que ese plugin necesita en la tabla `user` (`role`, `banned`, etc.) — usarlo exigiría activar "Local Install" y regenerar schema solo para tener un segundo sistema de rol/ban en paralelo al que ya existe (`users.role`, `users.active` en la tabla de la app, ya usados por `assertAdmin`/`getCurrentUser`, agnósticos al proveedor). No vale la complejidad. Plugins finales: `emailAndPassword`, `magicLink`, `convex` (JWT/identity, obligatorio).
  - **Pérdida real, no una simplificación gratis**: se pierde la impersonación de usuarios (`impersonateUser` del plugin admin) — no existe hoy en la app, así que no es una regresión, pero quedó fuera del alcance de esta migración si se quiere en el futuro.
  - **Verificado, no se pierde nada**: `listSessions`/`revokeSession`/`revokeSessions`/`revokeOtherSessions` son endpoints **core** de Better Auth (`node_modules/better-auth/dist/api/routes/session.mjs`, rutas `/list-sessions`, `/revoke-session`, etc.), NO viven bajo `plugins/admin`. La sección "Sesiones activas" de `perfil/page.tsx` (hoy `useSessionList`/`.revoke()` de Clerk) se reconstruye 1:1 contra estos endpoints core, sin necesitar el plugin.
  - Las acciones de admin que sí quedan (crear usuario, desactivar, resetear acceso) se implementan como antes: nuestras propias mutations internas (ya gateadas por `assertAdmin` contra la tabla `users` de la app) llamando directamente a la API server-side de Better Auth (`auth.api.signUpEmail`, envío de magic link, etc.) — no requieren el plugin admin porque la autorización la seguimos haciendo nosotros, como hoy.
- **`authId` guarda `doc._id` crudo (el `subject` real), NO un `tokenIdentifier` reconstruido a mano.** La razón original para preferir `tokenIdentifier` (evitar colisión de `subject` entre múltiples proveedores) no aplica: esta app va a tener un solo proveedor de auth a la vez. Reconstruir `` `${issuer}|${subject}` `` a mano en el trigger reintroducía una suposición sobre el formato exacto que arma Convex, y el string del `issuer` no lo controla el proyecto (lo calcula `getAuthConfigProvider()` de `@convex-dev/better-auth`) — habría sido duplicar ese cálculo y arriesgarse a que no coincida. En vez de eso, `getCurrentUser`/`getCurrentUserId` comparan `identity.subject` contra `authId`, y opcionalmente se valida `identity.issuer` contra el issuer esperado como pin de proveedor (sin necesidad de componer un string).
- **`ensureExists` NO se simplifica — se mantiene como camino de reparación idempotente, en paralelo al trigger, no en su reemplazo.** El trigger `triggers.user.onCreate` recibe los eventos de creación por `model` (`user`, `session`, `account`, `verification` comparten un solo despachador interno) y para el modelo `user` corre **exactamente una vez por persona, para siempre** (el primer signup). Si esa única ejecución falla por lo que sea (emails con distinta capitalización entre lo que quedó guardado desde el webhook de Clerk y lo que ingresa el usuario ahora, un typo, una carrera), no hay reintento automático — y sin un camino de reparación, esa persona queda con una cuenta de Better Auth que autentica bien pero sin fila en `users` de la app, viendo "Usuario no encontrado en la base de datos" para siempre. `AuthGuard.tsx` sigue llamando `ensureExists` en cada carga de la app (como hoy), y esa mutation intenta el mismo enlace por email de forma idempotente si el trigger no lo dejó resuelto. Ambos caminos normalizan el email igual (`toLowerCase().trim()`, como ya hace `accountShares.share()`) para no fallar por diferencias de capitalización entre lo que quedó guardado vía el webhook de Clerk y lo que llega ahora desde Better Auth.

**Pasos — todos hechos y validados contra la deployment de dev:**
- ✅ `npm i better-auth@1.6.26 @convex-dev/better-auth@0.12.5`.
- ✅ `convex/convex.config.ts` — registra el componente (`app.use(betterAuth)`).
- ✅ `convex/schema.ts` — campo `authId: v.optional(v.string())` + `index("by_authId", ["authId"])` en `users`. Desplegado, el índice se creó (`users.by_authId`).
- ✅ `convex/auth.ts` — `authComponent = createClient(...)` con `authFunctions: internal.auth` y `triggers.user.onCreate` (enlace por email, camino rápido); `createAuth = (ctx) => betterAuth({ database: authComponent.adapter(ctx), emailAndPassword: {enabled: true}, plugins: [magicLink({sendMagicLink}), convexPlugin({authConfig})] })`; export de `onCreate`/`onUpdate`/`onDelete` vía `authComponent.triggersApi()`.
  - Pendiente para Fase 2/3, no bloqueante: `emailAndPassword` no tiene `sendResetPassword` configurado todavía (Better Auth tira error solo si alguien de hecho pide reset por esa vía específica; el flujo de reset real de esta migración es el magic link, que sí está completo).
- ✅ `convex/actions/sendMagicLinkEmail.ts` + `magicLinkEmailHtml()` en `convex/lib/emailTemplates.ts` — envío real por Resend, mismo patrón que `sendWelcomeEmail.ts`.
- ✅ `convex/auth.config.ts` — usa `getAuthConfigProvider()` (tipo `customJwt`) sin argumentos: no hace falta ninguna variable de entorno de JWKS — leyendo el código fuente compilado (`auth-config.js`) se confirmó que sin un `jwks` estático, arma la URL de descubrimiento dinámico contra el propio endpoint `/api/auth/convex/jwks` que monta `registerRoutes` en `http.ts`, usando `CONVEX_SITE_URL` (variable automática de Convex). **Por el bloqueo de abajo, hoy este archivo tiene a Clerk como único proveedor activo** — el de Better Auth se prueba haciendo el swap descrito, no conviven en el mismo array.
- ✅ `convex/http.ts` — `authComponent.registerRoutes(http, createAuth)` agregado, conviviendo en el CÓDIGO con el webhook de Clerk (ambos se cargan siempre; cuál JWT se valida de verdad lo decide solo `auth.config.ts`).
- ✅ `convex/lib/auth.ts` — `getCurrentUser`/`getCurrentUserId` ahora prueban `by_clerkId` (camino Clerk, normal hoy) y `by_authId` (camino Better Auth) — ver "decisiones de implementación" para el porqué de mantener ambos caminos en vez de solo uno.
- ✅ `convex/users.ts::ensureExists` — reforzado como camino de reparación idempotente del enlace (no reemplazado, ver más arriba); normaliza email para el nuevo lookup de vinculación sin tocar el comportamiento existente de invitaciones/creación.
- Se evaluó usar la skill `convex-setup-auth` del proyecto — no tiene una referencia específica para Better Auth (cubre Convex Auth, Clerk, WorkOS, Auth0), así que el wiring se hizo leyendo el código fuente real instalado en `node_modules` en vez de la skill.

### Fase 2 — Reescritura del frontend de auth (✅ COMPLETADA — ver resumen al inicio del documento)
- ✅ `src/proxy.ts`: `getSessionCookie` de `better-auth/cookies` (chequeo optimista) + redirect manual. Mismo `matcher` de assets.
- ✅ `ClerkThemeProvider.tsx` eliminado (Better Auth es headless). `@clerk/localizations` quedó sin uso, pendiente de quitar del `package.json` en la Fase 5.
- ✅ Formulario propio de sign-in (magic link + contraseña, sin sign-up — registro sigue cerrado por invitación), `UserMenu.tsx` propio (reemplaza `<UserButton>` en Header/perfil), sección "Sesiones activas" del perfil reescrita contra `authClient.listSessions/revokeSession/revokeOtherSessions`.
- ✅ `AuthGuard.tsx`, `(app)/layout.tsx`, `admin/layout.tsx`, `app/page.tsx`: swap a `authClient.useSession()` / `authNextJs.isAuthenticated()` / `authNextJs.fetchAuthQuery(api.users.getMe)`. Rol admin unificado a `users.role` de Convex en los 5 lugares que antes leían `publicMetadata.role` (Sidebar, BottomNav, mas, dashboard, y los 2 layouts server-side) — desaparece la sincronización bidireccional de roles.
- ✅ `ConvexClientProvider.tsx`: `ConvexProviderWithClerk` → `ConvexBetterAuthProvider`.
- ✅ `cuentas/[id]/page.tsx`: `isOwner` comparaba contra el id de sesión de Clerk — corregido a `me.clerkId` (bug crítico, ver resumen).

### Fase 3 — Backend: invitaciones, admin, webhook (✅ COMPLETADA — ver resumen al inicio del documento)
- ✅ `convex/http.ts`: ruta `/api/webhooks/clerk` eliminada por completo.
- ~~Reescribir `convex/lib/clerkApi.ts` contra la API del plugin `admin`~~ — **texto desactualizado**: el plugin `admin` fue descartado en la Fase 1 (`users.role`/`active` de la app siguen siendo la única fuente de verdad). En la ejecución real, `clerkApi.ts` se borró entero — nada quedó para reescribir contra ninguna API de Better Auth.
- ✅ Los emails de invitación/magic-link/reset ya los envía la app (Resend + `convex/lib/emailTemplates.ts`), implementado en la Fase 2 (`sendMagicLinkEmail.ts`, `sendResetPasswordEmail.ts`) y reusado en la Fase 3 (`sendAccessEmail`, `createByAdmin`, `seedAdmin.ts`).
- ✅ `seedAdmin.ts` reescrito sin Clerk. `seedTestInvitation.ts` no necesitó cambios.

### Fase 4 — Corte a producción (⏳ preparada, no ejecutada todavía)

**Punto de partida real**: las Fases 1-3 solo existen en el repo local, sin commitear ni desplegar. La producción real (deployment de Convex separada de la de dev + Vercel) sigue sirviendo hoy a usuarios reales 100% bajo Clerk. Confirmado que `CONVEX_DEPLOY_KEY` de `.env.local` apunta a dev, no a prod (`npx convex env list --prod` ignoró el flag y devolvió las variables de dev) — no hay acceso de escritura a la deployment de prod desde este entorno, así que todo lo que la toca lo ejecuta el usuario.

**Preparado en el repo (Fase 4, sin ejecutar):**
- `convex/schema.ts`: campo nuevo `users.authMigrationEmailSentAt` (mismo patrón que `welcomeEmailSentAt`).
- `convex/actions/sendMigrationMagicLinks.ts` (nuevo `internalAction`): recorre `users` activos sin `authMigrationEmailSentAt`, les manda el magic link vía `sendAccessMagicLink` (reusada de `adminUsers.ts`), marca a cada uno tras el envío exitoso. Reanudable — un fallo puntual no detiene el lote ni reenvía a quien ya recibió el correo. Solo por CLI (`npx convex run actions/sendMigrationMagicLinks:run`), nunca contra dev con datos reales.
- `convex/users.ts`: `listActiveWithoutMigrationEmailInternal` + `markMigrationEmailSent` (soporte del punto anterior).

**Checklist de ejecución (el usuario, en este orden):**
0. Pre-flight: revisar a mano en el dashboard de Convex que `users.email` en prod esté en minúscula/sin espacios (histórico del webhook de Clerk, nunca normalizado) — con pocos usuarios alcanza sin script.
1. Env vars de Convex en **prod**: setear `SITE_URL` = dominio real (nueva, no existía porque Better Auth nunca se desplegó ahí); confirmar que `RESEND_API_KEY`/`RESEND_FROM_EMAIL`/`NEXT_PUBLIC_APP_URL` ya están bien (muy probable — prod ya manda el email de bienvenida hoy).
1b. Env vars de **Vercel** (Production): agregar `NEXT_PUBLIC_CONVEX_SITE_URL` = URL `.convex.site` de la deployment de prod (la usan `src/lib/auth-server.ts` y la ruta `src/app/api/auth/[...all]/route.ts` para enviar las peticiones de auth a Convex; sin ella el login en prod falla). Confirmar también `NEXT_PUBLIC_CONVEX_URL`. Como es `NEXT_PUBLIC_*`, se incrusta en el build: tiene que estar definida **antes** del deploy del paso 2.
2. `git push` → deploy de Vercel del frontend nuevo. Esperar a que quede en vivo **antes** del paso 3 — minimiza la ventana con el frontend viejo (Clerk) contra un backend que ya no lo valida.
3. `npx convex deploy` contra la deployment real de prod. **Este es el corte real**: al terminar, Convex prod deja de validar JWTs de Clerk y solo acepta Better Auth (el código ya trae `auth.config.ts` así desde la Fase 2).
4. Canario: el admin inicia sesión personalmente en la prod real vía magic link — confirma login, gate de admin, cuentas/transacciones reales — antes de tocarle el acceso a nadie más.
5. Solo si el paso 4 sale bien: `npx convex run actions/sendMigrationMagicLinks:run` contra prod.
6. Verificar que al menos otra cuenta real entra con el correo recibido.
7. Avisar para actualizar esta sección a ✅ COMPLETADA con el resumen real.

Banner de "en mantenimiento": opcional, no construido — la ventana de los pasos 2-3 debería ser de minutos para una app invite-only.

### Fase 5 — Limpieza
- `package.json`: quitar `@clerk/nextjs`, `@clerk/localizations`, `svix` (nada en `convex/` ni `src/` los importa ya — confirmado en la Fase 3).
- `next.config.ts`: quitar dominios de Clerk del CSP (`*.clerk.accounts.dev`, `img.clerk.com`, `challenges.cloudflare.com`) y `images.remotePatterns`; verificar qué dominio necesita Better Auth (probablemente ninguno externo, es same-origin vía Convex).
- Borrar la tabla `sessions` vestigial de `convex/schema.ts` (nunca se escribe hoy; las tablas reales de sesión de Better Auth viven aisladas dentro del componente, no en el schema de la app).
- Actualizar `.env.local.example` y README (quitar `CLERK_*`).
- ✅ ~~Copy del email en `emailTemplates.ts` que menciona "Clerk te enviará..."~~ y ~~comentario de cabecera de `convex/schema.ts` sobre sincronización desde Clerk~~ — corregidos ya en la Fase 3.

---

## Consecuencias y efectos colaterales

- **Todas las sesiones activas se invalidan** el día del corte — todo el mundo re-loguea (esperado con big-bang).
- **Pérdida temporal de protección anti-bot**: Clerk traía Cloudflare Turnstile integrado; Better Auth no incluye eso de fábrica. Bajo riesgo acá porque el registro es invite-only, pero si hay un endpoint de login público hay que evaluar un plugin de captcha.
- **Nuevo código a mantener**: emails transaccionales de invitación/reset (antes los mandaba Clerk automáticamente).
- **UI de auth deja de ser "gratis"**: formularios de sign-in/reset/perfil de sesiones hay que construirlos y mantenerlos (Better Auth es headless).
- **Simplificación real**: desaparece la sincronización bidireccional de roles (menos superficie de bugs, un login ya refleja el rol correcto sin re-loguear dos veces).
- **Sin nueva infraestructura**: al usar el componente de Convex, no se suma Postgres ni un servicio externo.
- **Riesgo de identidad resuelto sin re-keying** (ver Fase 0): gracias al patrón `authId` + vínculo por email en primer login, ninguna de las ~20 tablas de negocio se toca ni se re-escribe.
- **Rollback**: viable mientras no se borre la app de Clerk ni el código viejo (mantenerlo en una rama), pero solo cubre "revertir el deploy" — cualquier dato nuevo creado ya bajo Better Auth después del corte no vuelve mágicamente a Clerk.
