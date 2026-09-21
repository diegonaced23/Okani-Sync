# Módulo admin: rediseño del panel y del módulo de usuarios

**Fecha:** 2026-09-20
**Estado:** diseño aprobado, pendiente de plan de implementación

## Problema

El panel de administración (`src/app/(app)/admin/`) tiene hoy dos pantallas
cortas y ninguna responde a la pregunta con la que un administrador entra:
*¿está todo bien?*

El dashboard (`admin/page.tsx`, 142 líneas) muestra cuatro números
—usuarios, activos, admins, transacciones— y los últimos diez registros de
auditoría. La lista de usuarios (`admin/users/page.tsx`) es una tabla plana con
un filtro de texto en cliente.

Lo que falta no es decoración. Son cinco huecos concretos:

1. **No hay señal de si los procesos automáticos corrieron.** `convex/crons.ts`
   define ocho jobs y no existe ninguna tabla de ejecuciones. Si el job diario de
   tasas de cambio falla, `currentExchangeRates` se queda rancio y **toda la
   consolidación multi-moneda del dashboard de cada usuario miente en silencio**.
   Nadie se entera.
2. **El administrador no puede ver ninguna invitación.** `convex/invitations.ts`
   solo exporta `createFromAdmin` (internal). No hay query pública, así que no
   hay forma de saber a quién se invitó y nunca entró, ni de revocar o reenviar.
   Duele porque, según `CLAUDE.md`, quien nunca inició sesión bajo Better Auth
   **no puede usar «¿olvidaste tu contraseña?»** y depende de que el admin le
   reenvíe el acceso a mano.
3. **La tarjeta «Activos» no mide actividad.** Cuenta el booleano `users.active`,
   que solo dice si la cuenta está habilitada. No existe `lastSeenAt`, y la tabla
   `sessions` es un resto muerto de la era Clerk: 0 filas y ninguna referencia en
   el código fuera del esquema.
4. **No hay uso por usuario.** Ni cuántos movimientos registra cada uno, ni
   cuándo entró por última vez, ni quién se dio de alta y nunca hizo nada.
5. **La lista de usuarios no escala ni protege.** Filtra en cliente sobre el
   array completo, devuelve el documento entero sin proyección —expone `authId`,
   `notificationPrefs`, `imageStorageId`— y la ficha de detalle pide **la lista
   completa de usuarios** para mostrar uno solo (`users/[id]/page.tsx:48`).

Además, al inventariar el módulo aparecieron cinco defectos que no formaban
parte del encargo pero que viven en el código que se va a tocar. Se detallan en
«Defectos a corregir».

## Alcance

Dentro:

- A. Esquema: `users.lastSeenAt`, tabla `cronRuns`, tabla `userStats`
- B. Contadores materializados por recálculo (no write-through)
- C. Latido de los ocho crons
- D. Dashboard admin rehecho: ocho tarjetas en cuatro bloques
- E. Módulo de usuarios: búsqueda, filtros, proyección y ficha con uso
- F. Los cinco defectos encontrados

Fuera, con motivo:

- **Métricas financieras agregadas.** Decisión explícita del usuario: el panel
  muestra agregados y metadatos, nunca importes, saldos ni descripciones. El
  administrador administra, no fisgonea.
- **Series temporales y gráficas de tendencia.** El panel se consulta de forma
  ocasional para responder «¿está todo bien?», no a diario como tablero de
  analítica. Una gráfica de altas por semana con dos usuarios es ruido.
- **Contadores write-through.** Ver «Decisión: recompute frente a write-through».
- **Paginación de la lista de usuarios.** A la escala real (unidades o decenas
  de personas, app por invitación) es maquinaria sin problema que resolver. Los
  topes de lectura quedan documentados para cuando haga falta.

## Restricciones

- **Privacidad:** ninguna superficie del panel expone importes, saldos,
  descripciones ni categorías de ningún usuario. Solo conteos y fechas.
- **Lenguaje visual:** el mismo del resto de la app. `PageContainer` en variante
  `wide`, tarjetas `GLASS_SURFACE` con `rounded-[24px]`, chips de icono teñidos
  con `tint()` sobre los tokens `--os-*`, secciones encabezadas con
  `FIELD_LABEL`, entrada escalonada con `EASE_OUT_EXPO` y `useReducedMotion`
  respetado. Ver `src/lib/ios.ts` y `src/components/perfil/SettingsCard.tsx`.
- **Color semántico separado del acento.** El estado (bien / atención / fallo)
  usa su propia escala, no el lima de marca, para que un problema se lea sin
  necesidad de leer.
- **Escala:** el despliegue de desarrollo tiene 2 usuarios y 4 movimientos. La
  producción es una app por invitación para un círculo pequeño. Todo agregado
  lleva tope de lectura explícito y declara cuándo lo alcanzó, en vez de mentir.

## Decisión: recompute frente a write-through

Los contadores viven materializados en `userStats` y el dashboard los lee en
O(1). Lo que se decidió es **cómo se mantienen**.

*Write-through* —incrementar el contador en cada mutation que crea o borra—
da exactitud al instante, pero obliga a tocar todas las rutas de escritura
(movimientos, cuentas, tarjetas, deudas, metas, el reset de fábrica, la cascada
del admin). Si una sola ruta se olvida, los números mienten en silencio. Este
repositorio ya tuvo ese fallo dos veces: la cascada de borrado cubría 12 de las
15 tablas del usuario, y el glifo de la marca vivía en 8 sitios de los que 2 se
escapaban al cambiarlo.

*Recompute* recalcula desde los índices `by_user`, con un cron diario y bajo
demanda cuando el dato está rancio. No toca ninguna mutation existente, no puede
desincronizarse, y cualquier desviación se corrige sola en la siguiente pasada.

**Se elige recompute.** Para un panel de consulta ocasional, cambiar «exacto
ahora mismo» por «exacto hasta hace unas horas, y la interfaz dice cuándo» es un
intercambio claramente favorable.

## A. Esquema

Tres añadidos, todos aditivos.

### `users.lastSeenAt: v.optional(v.number())`

Escrito desde `convex/users.ts::ensureExists`, que ya se ejecuta en cada carga
de la app tras autenticarse (lo llama `AuthGuard.tsx:58`).

**Se escribe con acelerador de una hora.** Sin él habría un `patch` sobre la
fila de `users` en cada montaje del guard, y como `getMe` está suscrita a ese
documento, cada carga empujaría una actualización a todos los suscriptores. Con
el acelerador, como mucho una escritura por usuario y hora.

`undefined` significa «nunca ha entrado desde que existe el campo», y la interfaz
lo dice así en vez de inventarse una fecha.

### `cronRuns`

```
job: v.string()              // identificador estable del job
startedAt: v.number()
finishedAt: v.optional(v.number())
ok: v.boolean()
error: v.optional(v.string())
durationMs: v.optional(v.number())
```

Índice `by_job: ["job"]`. La última ejecución de un job es el primer resultado de
`by_job` en orden descendente.

**Retención:** cada registro poda las ejecuciones del mismo job más allá de las
20 últimas. Sin poda la tabla crece sin techo, y el panel solo necesita la última
y un poco de historia para distinguir «falló una vez» de «lleva fallando días».

### `userStats`

```
userId: v.string()
counts: v.record(v.string(), v.number())   // clave = nombre de tabla
capped: v.boolean()                        // algún conteo alcanzó el tope
computedAt: v.number()
```

Índice `by_user: ["userId"]`. Una fila por usuario.

Las claves de `counts` son exactamente los nombres de `USER_DATA_TABLES`, no una
lista escrita aparte. Se usa `v.record` y no `v.object` con claves fijas
precisamente para que añadir una tabla al inventario no obligue a migrar el
esquema.

`capped` es `true` cuando algún conteo alcanzó `STATS_COUNT_CAP`, fijado en
**10 000** por tabla y usuario. Cuando es `true` la interfaz muestra «10 000+» en
lugar de un número exacto: un tope que se presenta como cifra exacta es peor que
no tener el dato.

## B. Contadores

### Fuente de las tablas a contar

`convex/lib/userData.ts` ya es el inventario único de las tablas de datos de un
usuario, con `collectUserDocs` haciendo consultas indexadas por usuario y un test
que lo mantiene alineado con lo que entrega la exportación. Se reutiliza: se
añade `countUserDocs(ctx, table, userId, cap)`, y el recálculo recorre
`USER_DATA_TABLES`.

Esto encadena el panel al mismo invariante ya probado: si mañana alguien añade
una tabla de datos al esquema, el `switch` exhaustivo no compila hasta que la
maneje, y el test falla si diverge de la exportación.

### Recálculo

- `internal.adminStats.recomputeForUser({ userId })` — cuenta con tope
  `STATS_COUNT_CAP` (10 000) por tabla y hace upsert en `userStats`.
- `internal.adminStats.recomputeAll()` — recorre `users` y encola el anterior por
  usuario. Precedente en el repositorio: `internal.netWorthSnapshots.captureForAllUsers`.
- Cron diario que llama a `recomputeAll`.
- `api.adminStats.recomputeNow()` (con `assertAdmin`) para el botón «recalcular»
  de la interfaz cuando el dato se ve rancio.

El dashboard lee `userStats` y **siempre muestra `computedAt`** en lenguaje
humano («actualizado hace 3 horas»). Un número sin su antigüedad al lado es un
número en el que no se puede confiar.

## C. Latido de los crons

Un helper, `convex/lib/cronRuns.ts`, envuelve el cuerpo de cada job:

```
withCronRun(ctx, "fetchExchangeRates", async () => { ... })
```

Registra inicio, fin, resultado y error, y poda el histórico. Va en un helper y
no copiado en los ocho archivos por el mismo motivo que todo lo demás en este
repositorio: ocho copias divergen.

**Los ocho jobs** (`convex/crons.ts`): tasas de cambio, transacciones
recurrentes, alertas, recordatorio diario, resumen semanal, snapshot de
patrimonio, rollover de presupuestos y resumen mensual.

**Salud de un job** = función pura, testeable, que dado el nombre del job, su
última ejecución y su periodicidad esperada devuelve `ok | atrasado | fallido |
sin datos`. Vive en `src/lib/adminHealth.ts` para poder testearla con Vitest sin
levantar Convex.

`sin datos` es un estado de primera clase: recién desplegado, ningún job ha
corrido todavía, y decirlo es más honesto que pintar todo en verde.

## D. Dashboard

`src/app/(app)/admin/page.tsx` se reescribe. Las cuatro tarjetas actuales
desaparecen. Cuatro bloques encabezados con `FIELD_LABEL`:

### Bloque 1 — Estado del sistema

Va primero porque es la pregunta con la que se entra al panel.

1. **Tasas de cambio.** Semáforo sobre `currentExchangeRates.updatedAt`: al día
   si el dato tiene menos de 26 h (el cron corre cada 24, con margen), atención
   hasta 48 h, fallo por encima. Es la tarjeta más importante del panel: es el
   único aviso de que las cifras multi-moneda de todos los usuarios dejaron de
   ser ciertas.
2. **Procesos automáticos.** Los ocho jobs con su última ejecución y resultado,
   y un veredicto agregado arriba («8 de 8 al día», «1 falló hace 2 días»).

### Bloque 2 — Personas

3. **Usuarios.** Total, con sesión en los últimos 30 días, desactivados y
   administradores. Separa por fin «habilitado» de «lo usa de verdad».
4. **Invitaciones pendientes.** Quién fue invitado, por quién y hace cuánto, con
   acciones de reenviar acceso y revocar. Es información que hoy no existe en
   ninguna pantalla.
5. **Cuentas dormidas.** Quien se dio de alta y nunca registró nada, o lleva más
   de 30 días sin entrar. Se apoya en `lastSeenAt` y en `userStats`.

### Bloque 3 — Uso

6. **Volumen.** Movimientos, cuentas y tarjetas en total, desde `userStats`, con
   su `computedAt` visible.
7. **Actividad reciente.** Registro de auditoría con filtro por tipo de acción.

### Bloque 4 — Operación

8. **Tasas manuales.** Fijar a mano una tasa cuando la API falla. Convierte el
   defecto de `setManualRate` en una función legítima del panel en lugar de solo
   cerrarla: la capacidad existía y era útil, lo que estaba mal era quién podía
   usarla.

## E. Módulo de usuarios

### Lista (`admin/users/page.tsx`)

- Nueva query `api.users.listForAdmin` con **proyección explícita**: `clerkId`,
  `name`, `email`, `role`, `active`, `createdAt`, `lastSeenAt` y los conteos de
  `userStats` (`transactionCount`, `accountCount`, `statsComputedAt`,
  `statsCapped`). Nunca `authId` ni `notificationPrefs`.
  **NO devuelve `avatarUrl`**, a diferencia de lo que decía una versión anterior
  de este documento: las filas se pintan con la inicial del nombre. Es mejor
  así — resolver la URL de `_storage` obliga a un `ctx.storage.getUrl` por
  usuario dentro de la query, y esas URL son temporales, así que la lista
  entera se volvería a leer solo para refrescar avatares que nadie mira.
- `transactionCount` puede ser `undefined`: significa que ese usuario no tiene
  fila en `userStats` todavía. No se sustituye por `0`, porque un cero afirmaría
  un conteo que nunca se calculó.
- Filtros por rol, estado y actividad, más búsqueda por nombre y correo. A esta
  escala el filtrado sigue siendo en cliente sobre la proyección. El corte para
  mover el filtro y la paginación al servidor es **500 usuarios**: por debajo, la
  proyección completa pesa menos que la complejidad de paginar.
- Cada fila muestra último acceso y número de movimientos.

### Ficha (`admin/users/[id]/page.tsx`)

- Dejar de llamar a `listAll` y buscar con `.find()`; usar `api.users.getByClerkId`,
  que pasa por `assertAdmin` (valida rol **y** cuenta activa) salvo cuando alguien
  se consulta a sí mismo, y devuelve una proyección explícita: sin `authId`,
  `notificationPrefs`, `imageStorageId` ni `lastAvatarUploadAt`.
- Panel de uso con los agregados de `userStats`: cuántas cuentas, movimientos,
  tarjetas, deudas y metas; alta y último acceso. Sin una sola cifra de dinero.
- Se conservan rol, estado, envío de acceso, borrado e historial de auditoría.

## F. Defectos a corregir

| # | Defecto | Dónde | Corrección |
|---|---|---|---|
| 1 | `setManualRate` usa `getCurrentUser`, no `assertAdmin`: cualquier usuario autenticado puede sobrescribir `currentExchangeRates`, tabla **global** de la que depende el dashboard de todos | `convex/exchangeRates.ts:76` | `assertAdmin` + interfaz en la tarjeta 8 |
| 2 | `adminStats` hace `transactions.take(100000)`: escaneo completo sin índice, por encima del límite de documentos por función | `convex/users.ts:468` | Sustituida por `userStats` |
| 3 | Un admin desactivado sigue recibiendo datos: `listAll` y `adminStats` usan comprobación de rol en línea en vez de `assertAdmin`, y el layout no mira `me.active` | `convex/users.ts:450,460`; `admin/layout.tsx:12` | `assertAdmin` en ambas y comprobar `active` en el layout |
| 4 | Ocho acciones de auditoría se pintan como texto crudo, y la tabla de etiquetas está duplicada en dos archivos | `admin/page.tsx:12`; `users/[id]/page.tsx:25` | Tabla única en `src/lib/constants.ts`, completa |
| 5 | La invitación se busca con el email **sin normalizar** mientras el enlace legacy usa el normalizado: una invitación cuyo correo difiera en mayúsculas queda `pending` para siempre y su titular no puede entrar nunca | `convex/users.ts:122` | Normalizar el email también en esa búsqueda |

El defecto 1 es de seguridad y el 5 deja a una persona invitada sin poder
acceder jamás. Los dos merecen ir primero en el plan de implementación.

## Estrategia de pruebas

El repositorio prueba funciones puras con Vitest en `src/lib/__tests__/` y
`convex/lib/__tests__/`; no hay infraestructura para probar funciones de Convex.
El diseño se apoya en eso: **la lógica que decide se extrae a funciones puras**.

- `src/lib/adminHealth.ts` — salud de un cron a partir de su última ejecución y
  periodicidad; frescura de las tasas de cambio; predicado de «cuenta dormida».
  Son las reglas donde un error significa pintar verde algo roto, así que son
  exactamente las que merecen test.
- `convex/lib/__tests__/userData.test.ts` — el test existente sigue cubriendo que
  el inventario de tablas no derive; el recálculo lo hereda por reutilizarlo.
- Verificación manual del resto contra el despliegue de desarrollo, con las
  queries de solo lectura ejecutadas por `npx convex run`.

## Riesgos

- **Escritura en cada carga.** `lastSeenAt` sin acelerador provocaría una
  escritura por montaje del guard y una invalidación de `getMe` en todos los
  suscriptores. Mitigado con el umbral de una hora; es la parte del diseño que
  más conviene comprobar a mano.
- **El recorrido global de usuarios del recálculo** es O(usuarios). A la escala
  actual es intrascendente; el cron lo hace una vez al día y fuera de hora punta.
- **Contadores rancios.** Es el precio aceptado de recompute. Se compensa
  mostrando siempre `computedAt` y ofreciendo recálculo manual.
- **La poda de `cronRuns`** se ejecuta en la misma escritura que registra el job.
  Si fallara, la tabla crecería; el tope de 20 por job la mantiene trivial.

## Preguntas abiertas

Ninguna. Las decisiones de alcance (privacidad, recompute, rehacer el dashboard
completo) están tomadas y registradas arriba.
