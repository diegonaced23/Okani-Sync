# Plan de implementación — Registro por solicitud

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

> **REGLA QUE ANULA A LA SKILL — NO HACER COMMITS.** `CLAUDE.md` del proyecto y las reglas globales del usuario prohíben a Claude ejecutar `git commit` o `git push` bajo cualquier circunstancia salvo petición explícita en ese mismo mensaje. Este plan sustituye el paso «Commit» habitual por un paso de **verificación**. Al terminar cada tarea, informa al usuario de que está lista para commitear; el commit lo hace él.

**Objetivo:** abrir un camino de alta por solicitud — un formulario público que un admin revisa y aprueba — y obligar a todo usuario nuevo a definir su contraseña la primera vez que entra.

**Arquitectura:** una tabla nueva `registrationRequests` guarda las solicitudes; aprobar **emite una invitación** en la tabla `invitations` que ya existe, así que el gate de acceso (`convex/users.ts::ensureExists`) no cambia su lógica de autorización. El alta sigue ocurriendo por magic link. La contraseña obligatoria es un flag en `users` que un guard en `AuthGuard` traduce en un redirect a una pantalla de paso fuera de `(app)`. La única lógica testeables en este repositorio —validación y normalización de los campos del formulario— se extrae pura a `src/lib/`.

**Stack:** Next.js 16 (App Router, React 19), Convex, Better Auth (`better-auth` 1.6.33 + `@convex-dev/better-auth` 0.12.5), Resend, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-registro-por-solicitud-design.md`

## Restricciones globales

- **Gestor de paquetes:** `pnpm`. Nunca `npm install` ni `bun install` — generan un segundo lockfile y pueden resolver otras versiones.
- **Verificación estándar de cada tarea:** `pnpm typecheck && pnpm lint && pnpm test`. Las tareas que tocan `convex/schema.ts` o añaden funciones de Convex añaden `npx convex codegen` **antes** del typecheck.
- **Convex — carpeta `actions/` deprecada:** una función nueva va en un módulo normal de `convex/`. La excepción es el envío de correos, que se queda en `convex/actions/` junto a los tres que ya hay, porque comparten el SDK de Resend y el runtime de Node (ver Tarea 4).
- **Frontera de runtime de Convex:** un módulo sin directiva (runtime V8) **no puede importar** un módulo con `"use node"`. Convex los empaqueta por separado. Esto es lo que motiva la Tarea 1.
- **Correos siempre normalizados:** todo correo que se guarde o se busque pasa por `normalizeEmail()` de `src/lib/email.ts` (`toLowerCase().trim()`). Escribirlo y leerlo con criterios distintos deja invitaciones pendientes para siempre.
- **Montos y fechas:** no aplican a este trabajo; no se toca dinero.
- **Idioma:** todo el texto de interfaz y de los correos va en español de Colombia, tuteando, como el resto de la app.
- **Cruce de frontera de imports:** `convex/` importa de `src/lib/` con rutas relativas (`../src/lib/constants`, `../../src/lib/email`), nunca con el alias `@/`. **Y eso vale en cadena:** un archivo de `src/lib/` que `convex/` importe tampoco puede usar `@/` en sus propios imports, porque el empaquetador de Convex no resuelve ese alias. Se cumple hoy — los únicos dos archivos de `src/lib/` con `@/` (`banks.ts`, `reports.ts`) no los importa `convex/`.
- **Provider de Convex y `<Toaster>` son globales:** los dos se montan en `src/app/layout.tsx:56-57`, la raíz. Por eso los formularios nuevos de `(auth)` y `(setup)` pueden usar `useMutation`/`useAction` y `toast` aunque queden fuera de `(app)`.
- **Tests:** entorno `node`, Vitest. Este repositorio **no puede testear funciones de Convex** (no hay `convex-test` instalado). Solo las tareas con lógica pura llevan tests; las demás se verifican con `typecheck`/`lint` y con los pasos manuales que cada tarea describe.

## Mapa de archivos

**Crear**

| Archivo | Responsabilidad |
|---|---|
| `convex/lib/accessLink.ts` | `sendAccessMagicLink`, extraída de `actions/adminUsers.ts` para que la puedan importar módulos V8 |
| `src/lib/registrationRequest.ts` | Validación y normalización puras de los campos del formulario, y la regla de qué se puede revisar |
| `src/lib/__tests__/registrationRequest.test.ts` | Tests de lo anterior |
| `convex/registrationRequests.ts` | `submit`, `listPending`, `approve`, `reject`, `markReviewed` |
| `convex/actions/sendRegistrationEmails.ts` | Los tres envíos con Resend (`"use node"`) |
| `src/app/(auth)/solicitar-acceso/page.tsx` | Página pública del formulario |
| `src/components/auth/RequestAccessForm.tsx` | El formulario |
| `src/app/(setup)/layout.tsx` | Marco mínimo para pantallas de paso: solo comprueba sesión |
| `src/app/(setup)/definir-password/page.tsx` | Pantalla de contraseña obligatoria |
| `src/components/auth/SetInitialPasswordForm.tsx` | El formulario de esa pantalla |
| `src/components/admin/PendingRequestsCard.tsx` | Tarjeta de revisión en `/admin` |

**Modificar**

| Archivo | Cambio |
|---|---|
| `convex/schema.ts` | Tabla `registrationRequests`; campo `users.mustSetPassword` |
| `convex/migrations.ts` | `normalizeUserEmails` |
| `convex/actions/adminUsers.ts` | Importa `sendAccessMagicLink` de `lib/accessLink` en vez de definirla |
| `convex/actions/seedAdmin.ts` | Mismo cambio de import |
| `convex/users.ts` | `ensureExists` marca `mustSetPassword`; `setInitialPassword` y `clearMustSetPassword` |
| `convex/lib/emailTemplates.ts` | Tres plantillas nuevas |
| `src/lib/constants.ts` | `REGISTRATION_SOURCES`, `REGISTRATION_FIELD_LIMITS`, `REGISTRATION_REQUESTS_PER_HOUR`, dos `AUDIT_ACTIONS` y sus etiquetas |
| `src/proxy.ts` | `/solicitar-acceso` en `PUBLIC_PREFIXES` |
| `src/components/layout/AuthGuard.tsx` | Guard de `mustSetPassword` |
| `src/components/auth/SignInForm.tsx` | Enlace «Solicita acceso» |
| `src/app/(app)/admin/page.tsx` | Monta `PendingRequestsCard` |

## Orden y por qué

La Tarea 1 va primero porque sin ella la Tarea 6 no compila (frontera de runtime) y la Tarea 6 tiene un agujero de seguridad (correos sin normalizar). Las Tareas 2–3 construyen el camino de entrada de datos; la 4 le añade los correos; la 5 la interfaz pública. Las 6–7 son la revisión. Las 8–9 son la contraseña obligatoria, independientes del resto y desplegables por separado.

---

### Tarea 1: Preparativos — normalizar correos y extraer `sendAccessMagicLink`

Dos cambios sin comportamiento nuevo que el resto del plan necesita. Van juntos porque ninguno se sostiene solo como entrega revisable.

El primero tapa un agujero real: `users.email` se guardó históricamente **sin normalizar** (lo advierte el comentario de `convex/users.ts::ensureExists`). El chequeo anti-secuestro de la Tarea 6 busca por el índice `by_email` con el correo en minúsculas, así que con un usuario guardado como `Ana@Correo.com` ese chequeo **no lo encontraría** y se aprobaría una solicitud que le entrega su cuenta a un tercero.

El segundo es mecánico: `sendAccessMagicLink` vive en `convex/actions/adminUsers.ts`, que lleva `"use node"`. `convex/registrationRequests.ts` será un módulo V8 y no puede importar de ahí.

**Archivos:**
- Crear: `convex/lib/accessLink.ts`
- Modificar: `convex/migrations.ts` (añadir al final)
- Modificar: `convex/actions/adminUsers.ts:18-26` (quitar la función, importarla)
- Modificar: `convex/actions/seedAdmin.ts` (cambiar el import)

**Interfaces:**
- Produce: `sendAccessMagicLink(ctx, email: string): Promise<void>` en `convex/lib/accessLink.ts`
- Produce: `internal.migrations.normalizeUserEmails` — `internalMutation` sin argumentos

- [ ] **Paso 1: Crear `convex/lib/accessLink.ts`**

Es un corta y pega literal de `convex/actions/adminUsers.ts:18-26`, con su comentario. **Sin `"use node"`**: solo necesita `createAuth`, y sabemos que Better Auth corre en el runtime V8 porque `convex/http.ts` registra sus rutas y tampoco lleva la directiva.

```ts
import { createAuth } from "../auth";

/**
 * Envía un magic link de acceso al email dado. Mismo mecanismo que usa
 * cualquier login normal (auth.api.signInMagicLink) — llamado server-side, sin
 * un Request real, así que el chequeo de origen/CSRF de Better Auth (que solo
 * corre cuando hay ctx.request) no aplica; ver originCheckMiddleware.
 *
 * Vive en `lib/` y NO en `actions/adminUsers.ts` porque ese archivo lleva
 * "use node": Convex empaqueta los módulos de Node y los de V8 por separado, y
 * un módulo V8 (convex/registrationRequests.ts) no puede importar de uno de
 * Node. Acá no hace falta la directiva — `convex/http.ts` monta las rutas de
 * Better Auth sin ella.
 */
export async function sendAccessMagicLink(
  ctx: Parameters<typeof createAuth>[0],
  email: string
) {
  await createAuth(ctx).api.signInMagicLink({
    body: { email, callbackURL: "/" },
    headers: new Headers(),
  });
}
```

- [ ] **Paso 2: Quitar la función de `adminUsers.ts` e importarla**

En `convex/actions/adminUsers.ts`: borrar el bloque `export async function sendAccessMagicLink(...)` completo (líneas 18-26, con su comentario), borrar el import ahora huérfano `import { createAuth } from "../auth";` y añadir:

```ts
import { sendAccessMagicLink } from "../lib/accessLink";
```

Las dos llamadas del archivo (`createByAdmin` y `sendAccessEmail`) no cambian.

- [ ] **Paso 3: Arreglar el import en `seedAdmin.ts`**

Buscar en `convex/actions/seedAdmin.ts` el import de `sendAccessMagicLink` desde `./adminUsers` y apuntarlo a `../lib/accessLink`.

```bash
grep -n "sendAccessMagicLink" convex/actions/seedAdmin.ts
```

- [ ] **Paso 4: Comprobar que no queda ningún import viejo**

Run: `grep -rn "sendAccessMagicLink" convex/`
Esperado: la definición en `convex/lib/accessLink.ts` y **solo imports desde `lib/accessLink`**. Ninguno desde `adminUsers`.

- [ ] **Paso 5: Añadir la migración `normalizeUserEmails`**

Al final de `convex/migrations.ts`. Está calcada de `normalizeInvitationEmails` (`convex/migrations.ts:410`), que ya hace lo mismo sobre la otra tabla — léela antes para copiar su forma exacta de reporte.

```ts
/**
 * Pone en forma canónica los correos de `users`.
 *
 * `users.email` se guardó históricamente tal cual llegaba del webhook de Clerk,
 * sin normalizar. Cualquier búsqueda por el índice `by_email` con un correo en
 * minúsculas se pierde a esos usuarios — y una de esas búsquedas es el chequeo
 * de `registrationRequests.approve` que impide aprobar una solicitud hecha con
 * el correo de alguien que ya tiene cuenta. Sin esta migración, ese chequeo
 * tiene un agujero.
 *
 * Idempotente: correr dos veces no cambia nada.
 */
export const normalizeUserEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let actualizados = 0;
    for (const user of users) {
      const normalized = normalizeEmail(user.email);
      if (normalized !== user.email) {
        await ctx.db.patch(user._id, { email: normalized });
        actualizados++;
      }
    }
    return { revisados: users.length, actualizados };
  },
});
```

`normalizeEmail` e `internalMutation` ya están importados en ese archivo (`convex/migrations.ts:22`); no dupliques los imports.

- [ ] **Paso 6: Detectar colisiones antes de correr nada**

La migración asume que no hay dos usuarios cuyos correos colapsen al mismo valor normalizado (`Ana@x.com` y `ana@x.com` como filas distintas). Si los hubiera, normalizar crearía dos filas con el mismo correo y el `unique()` de `ensureExists` empezaría a lanzar.

Comprobarlo **antes** en el dashboard de Convex, pestaña Data → tabla `users`, o con una lectura rápida. Si aparecen colisiones, **detente y avisa al usuario**: hay que decidir a mano qué fila sobrevive, y eso no es parte de este plan.

- [ ] **Paso 7: Correr la migración**

Run: `npx convex run migrations:normalizeUserEmails`
Esperado: `{ revisados: N, actualizados: M }`. Correrla otra vez debe devolver `actualizados: 0`.

- [ ] **Paso 8: Verificación**

Run: `npx convex codegen && pnpm typecheck && pnpm lint && pnpm test`
Esperado: todo pasa. No hay cambio de comportamiento que testear; lo que se verifica es que la extracción no rompió ningún import.

Avisa al usuario de que la Tarea 1 está lista para commitear.

---

### Tarea 2: Reglas puras del formulario y constantes

Toda la validación del formulario vive acá, pura y testeada, porque la usan **dos** sitios: el formulario del navegador y la mutation del servidor. Si cada uno aplicara su criterio, el usuario vería «enviado» y el servidor rechazaría, o al revés.

**Archivos:**
- Crear: `src/lib/registrationRequest.ts`
- Crear: `src/lib/__tests__/registrationRequest.test.ts`
- Modificar: `src/lib/constants.ts`

**Interfaces:**
- Produce: `REGISTRATION_SOURCES`, `REGISTRATION_FIELD_LIMITS`, `REGISTRATION_REQUESTS_PER_HOUR` en `src/lib/constants.ts`
- Produce: `AUDIT_ACTIONS.REGISTRATION_APPROVED` (`"registration.approved"`) y `AUDIT_ACTIONS.REGISTRATION_REJECTED` (`"registration.rejected"`), con etiqueta en `AUDIT_ACTION_LABELS`
- Produce, en `src/lib/registrationRequest.ts`:
  - `type RegistrationSource = "amigo" | "redes" | "busqueda" | "trabajo" | "otro"`
  - `type RegistrationRequestInput = { email: string; name: string; city: string; source: string; referredBy?: string; note: string }`
  - `type RegistrationRequestFields = { email: string; name: string; city: string; source: RegistrationSource; referredBy?: string; note: string }`
  - `type RegistrationValidation = { ok: true; value: RegistrationRequestFields } | { ok: false; error: string }`
  - `validateRegistrationRequest(input: RegistrationRequestInput): RegistrationValidation`
  - `canReview(status: "pending" | "approved" | "rejected"): boolean`

- [ ] **Paso 1: Añadir las constantes**

En `src/lib/constants.ts`, cerca del resto de constantes de dominio:

```ts
/**
 * De dónde dice la gente que conoció la app. Lista cerrada y no texto libre
 * para que las respuestas se puedan contar; quien elija "otro" lo explica en
 * la nota, así que no hay campo extra.
 */
export const REGISTRATION_SOURCES = [
  { value: "amigo", label: "Un amigo o familiar" },
  { value: "redes", label: "Redes sociales" },
  { value: "busqueda", label: "Buscando en internet" },
  { value: "trabajo", label: "En el trabajo" },
  { value: "otro", label: "Otro" },
] as const;

/**
 * Topes de longitud del formulario público. Se aplican en el SERVIDOR: la
 * mutation no tiene sesión, así que sin ellos es un buzón abierto para escribir
 * megabytes en la base. El `maxLength` del navegador es solo comodidad.
 */
export const REGISTRATION_FIELD_LIMITS = {
  email: 254,
  name: 80,
  city: 80,
  referredBy: 80,
  note: 1000,
} as const;

/**
 * Tope GLOBAL de solicitudes por hora. El tope por correo ya lo cubre la regla
 * de "una pendiente por correo"; esto frena una ráfaga desde el mismo sitio con
 * correos distintos. 20/h es holgado para el uso real y corta en seco un script.
 */
export const REGISTRATION_REQUESTS_PER_HOUR = 20;
```

- [ ] **Paso 2: Añadir las dos acciones de auditoría y sus etiquetas**

En `AUDIT_ACTIONS` (`src/lib/constants.ts:154`), dentro del bloque «Usuarios»:

```ts
  /** Un admin aprobó una solicitud de registro del formulario público. */
  REGISTRATION_APPROVED: "registration.approved",
  /** Un admin rechazó una solicitud de registro. El solicitante no se entera. */
  REGISTRATION_REJECTED: "registration.rejected",
```

Y en `AUDIT_ACTION_LABELS` (`src/lib/constants.ts:206`):

```ts
  "registration.approved": "Solicitud de registro aprobada",
  "registration.rejected": "Solicitud de registro rechazada",
```

Son **dos** y no tres: el envío del formulario no se audita, porque `auditLogs.userId` es obligatorio y ahí no hay actor que registrar. La fila de `registrationRequests` es el registro.

- [ ] **Paso 3: Escribir los tests, que deben fallar**

Crear `src/lib/__tests__/registrationRequest.test.ts`. El estilo es el de los tests que ya hay (describe/it en español, `import ... from "@/lib/..."`):

```ts
import { describe, it, expect } from "vitest";
import {
  validateRegistrationRequest,
  canReview,
} from "@/lib/registrationRequest";
import { REGISTRATION_FIELD_LIMITS } from "@/lib/constants";

const valido = {
  email: "  Ana@Correo.COM ",
  name: "  Ana Pérez ",
  city: " Medellín ",
  source: "amigo",
  referredBy: "  Juan ",
  note: "  Quiero ordenar mis gastos del mes. ",
};

describe("validateRegistrationRequest", () => {
  it("normaliza el correo y recorta el resto", () => {
    const r = validateRegistrationRequest(valido);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.email).toBe("ana@correo.com");
    expect(r.value.name).toBe("Ana Pérez");
    expect(r.value.city).toBe("Medellín");
    expect(r.value.referredBy).toBe("Juan");
    expect(r.value.note).toBe("Quiero ordenar mis gastos del mes.");
  });

  it("deja referredBy en undefined cuando viene vacío o solo con espacios", () => {
    const r = validateRegistrationRequest({ ...valido, referredBy: "   " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.referredBy).toBeUndefined();
  });

  it("acepta que referredBy no venga", () => {
    // Se construye sin el campo en vez de desestructurarlo fuera: así el test
    // no depende de cómo esté configurada la regla de variables sin usar.
    const r = validateRegistrationRequest({
      email: valido.email,
      name: valido.name,
      city: valido.city,
      source: valido.source,
      note: valido.note,
    });
    expect(r.ok).toBe(true);
  });

  it.each(["name", "city", "note"] as const)(
    "rechaza %s vacío",
    (campo) => {
      const r = validateRegistrationRequest({ ...valido, [campo]: "   " });
      expect(r.ok).toBe(false);
    }
  );

  it("rechaza un correo sin arroba", () => {
    const r = validateRegistrationRequest({ ...valido, email: "ana" });
    expect(r.ok).toBe(false);
  });

  it("rechaza un correo vacío", () => {
    const r = validateRegistrationRequest({ ...valido, email: "  " });
    expect(r.ok).toBe(false);
  });

  it("rechaza un source que no está en la lista", () => {
    const r = validateRegistrationRequest({ ...valido, source: "telepatía" });
    expect(r.ok).toBe(false);
  });

  it("rechaza una nota por encima del tope", () => {
    const r = validateRegistrationRequest({
      ...valido,
      note: "x".repeat(REGISTRATION_FIELD_LIMITS.note + 1),
    });
    expect(r.ok).toBe(false);
  });

  it("acepta una nota exactamente en el tope", () => {
    const r = validateRegistrationRequest({
      ...valido,
      note: "x".repeat(REGISTRATION_FIELD_LIMITS.note),
    });
    expect(r.ok).toBe(true);
  });

  it("mide el tope DESPUÉS de recortar", () => {
    const r = validateRegistrationRequest({
      ...valido,
      name: "  " + "x".repeat(REGISTRATION_FIELD_LIMITS.name) + "  ",
    });
    expect(r.ok).toBe(true);
  });

  it("rechaza un nombre por encima del tope", () => {
    const r = validateRegistrationRequest({
      ...valido,
      name: "x".repeat(REGISTRATION_FIELD_LIMITS.name + 1),
    });
    expect(r.ok).toBe(false);
  });

  it("devuelve un error legible, no un código", () => {
    const r = validateRegistrationRequest({ ...valido, name: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.length).toBeGreaterThan(10);
  });
});

describe("canReview", () => {
  it("solo se puede revisar una solicitud pendiente", () => {
    expect(canReview("pending")).toBe(true);
    expect(canReview("approved")).toBe(false);
    expect(canReview("rejected")).toBe(false);
  });
});
```

- [ ] **Paso 4: Correr los tests y comprobar que fallan**

Run: `pnpm vitest run src/lib/__tests__/registrationRequest.test.ts`
Esperado: FALLA, porque `src/lib/registrationRequest.ts` no existe todavía.

- [ ] **Paso 5: Escribir la implementación mínima**

Crear `src/lib/registrationRequest.ts`:

```ts
// Imports RELATIVOS y no con el alias `@/`: este archivo lo importa
// convex/registrationRequests.ts, y el empaquetador de Convex no resuelve el
// alias. Los dos destinos son hermanos en src/lib/.
import { normalizeEmail } from "./email";
import { REGISTRATION_FIELD_LIMITS, REGISTRATION_SOURCES } from "./constants";

export type RegistrationSource = (typeof REGISTRATION_SOURCES)[number]["value"];

export type RegistrationRequestInput = {
  email: string;
  name: string;
  city: string;
  source: string;
  referredBy?: string;
  note: string;
};

export type RegistrationRequestFields = {
  email: string;
  name: string;
  city: string;
  source: RegistrationSource;
  referredBy?: string;
  note: string;
};

export type RegistrationValidation =
  | { ok: true; value: RegistrationRequestFields }
  | { ok: false; error: string };

function esSourceValido(value: string): value is RegistrationSource {
  return REGISTRATION_SOURCES.some((s) => s.value === value);
}

/**
 * Valida y normaliza los campos del formulario público.
 *
 * La usan el formulario del navegador y la mutation de Convex. Es a propósito:
 * si cada uno aplicara su propio criterio, alguien vería "enviado" y el
 * servidor lo rechazaría, o al revés.
 *
 * Todo se recorta ANTES de medirlo, para que un campo de espacios no cuente
 * como lleno ni un texto con espacios de sobra se pase del tope por nada.
 */
export function validateRegistrationRequest(
  input: RegistrationRequestInput
): RegistrationValidation {
  const email = normalizeEmail(input.email ?? "");
  const name = (input.name ?? "").trim();
  const city = (input.city ?? "").trim();
  const note = (input.note ?? "").trim();
  const referredByRaw = (input.referredBy ?? "").trim();
  const referredBy = referredByRaw === "" ? undefined : referredByRaw;

  if (email === "") return { ok: false, error: "Escribe tu correo." };
  // Comprobación deliberadamente laxa: la posesión real del correo la prueba
  // el magic link. Acá solo se atajan errores de dedo evidentes.
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return { ok: false, error: "Ese correo no parece válido." };
  }
  if (email.length > REGISTRATION_FIELD_LIMITS.email) {
    return { ok: false, error: "Ese correo es demasiado largo." };
  }

  if (name === "") return { ok: false, error: "Escribe tu nombre." };
  if (name.length > REGISTRATION_FIELD_LIMITS.name) {
    return { ok: false, error: `El nombre no puede pasar de ${REGISTRATION_FIELD_LIMITS.name} caracteres.` };
  }

  if (city === "") return { ok: false, error: "Escribe tu ciudad." };
  if (city.length > REGISTRATION_FIELD_LIMITS.city) {
    return { ok: false, error: `La ciudad no puede pasar de ${REGISTRATION_FIELD_LIMITS.city} caracteres.` };
  }

  if (!esSourceValido(input.source ?? "")) {
    return { ok: false, error: "Cuéntanos cómo conociste la app." };
  }

  if (referredBy !== undefined && referredBy.length > REGISTRATION_FIELD_LIMITS.referredBy) {
    return { ok: false, error: `Ese nombre no puede pasar de ${REGISTRATION_FIELD_LIMITS.referredBy} caracteres.` };
  }

  if (note === "") return { ok: false, error: "Cuéntanos por qué quieres usar la app." };
  if (note.length > REGISTRATION_FIELD_LIMITS.note) {
    return { ok: false, error: `La nota no puede pasar de ${REGISTRATION_FIELD_LIMITS.note} caracteres.` };
  }

  return {
    ok: true,
    value: { email, name, city, source: input.source as RegistrationSource, referredBy, note },
  };
}

/** Una solicitud solo se puede aprobar o rechazar mientras siga pendiente. */
export function canReview(status: "pending" | "approved" | "rejected"): boolean {
  return status === "pending";
}
```

- [ ] **Paso 6: Correr los tests y comprobar que pasan**

Run: `pnpm vitest run src/lib/__tests__/registrationRequest.test.ts`
Esperado: PASA, los 15 casos.

- [ ] **Paso 7: Verificación**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Esperado: todo pasa. En particular `src/lib/__tests__/auditLabels.test.ts`, que falla si alguna de las dos acciones nuevas quedó sin etiqueta o si se etiquetó una acción que no existe.

Avisa al usuario de que la Tarea 2 está lista para commitear.

---

### Tarea 3: Esquema y mutation `submit`

El esquema completo de la funcionalidad —incluido el campo de la Tarea 8— se añade de una vez, porque un cambio de esquema de Convex se despliega entero y partirlo en dos no aporta nada.

`submit` es el **primer endpoint de la app sin sesión**. Todas las defensas van en el servidor.

**Archivos:**
- Modificar: `convex/schema.ts`
- Crear: `convex/registrationRequests.ts`

**Interfaces:**
- Consume: `validateRegistrationRequest` de `src/lib/registrationRequest.ts` (Tarea 2)
- Consume: `REGISTRATION_REQUESTS_PER_HOUR` de `src/lib/constants.ts` (Tarea 2)
- Produce: tabla `registrationRequests` con índices `by_email`, `by_status`, `by_createdAt`
- Produce: campo `users.mustSetPassword?: boolean`
- Produce: `api.registrationRequests.submit` — args `{ email, name, city, source, referredBy?, note }` (todos `v.string()`, `referredBy` opcional); devuelve `null`

- [ ] **Paso 1: Añadir la tabla al esquema**

En `convex/schema.ts`, justo antes de la tabla `invitations` (`convex/schema.ts:574`), para que queden vecinas:

```ts
  // ============================================================
  // SOLICITUDES DE REGISTRO — formulario público de /solicitar-acceso.
  // NO es el gate de acceso: aprobar una solicitud EMITE una fila en
  // `invitations`, que es lo que lee users.ensureExists. Son tablas separadas
  // porque son cosas distintas: esto lo escribe un desconocido y puede
  // rechazarse; una invitación la emite un admin y da acceso.
  // ============================================================
  registrationRequests: defineTable({
    email: v.string(),        // SIEMPRE normalizado (normalizeEmail)
    name: v.string(),
    city: v.string(),
    source: v.string(),       // clave de REGISTRATION_SOURCES
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
    // by_createdAt es para el limitador por ventana de tiempo, no para la UI.
    .index("by_email", ["email"])
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),
```

- [ ] **Paso 2: Añadir el campo a `users`**

En la tabla `users` de `convex/schema.ts`, junto a los demás opcionales:

```ts
    // Obliga a definir contraseña antes de usar la app (ver AuthGuard y
    // /definir-password). Opcional a propósito: `undefined` significa "no
    // aplica", así que ningún usuario existente queda atrapado en el guard al
    // desplegar el campo.
    mustSetPassword: v.optional(v.boolean()),
```

- [ ] **Paso 3: Regenerar tipos y comprobar que el esquema es válido**

Run: `npx convex codegen && pnpm typecheck`
Esperado: pasa. Con `pnpm dev:convex` corriendo, el despliegue del esquema no debe dar errores de validación.

- [ ] **Paso 4: Escribir `convex/registrationRequests.ts` con `submit`**

Módulo normal, **sin `"use node"`**.

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { validateRegistrationRequest } from "../src/lib/registrationRequest";
import { REGISTRATION_REQUESTS_PER_HOUR } from "../src/lib/constants";

const UNA_HORA_MS = 60 * 60 * 1000;

/**
 * Formulario público de solicitud de acceso. ES EL ÚNICO ENDPOINT DE LA APP
 * SIN SESIÓN: no llama getCurrentUser y cualquiera en internet puede invocarlo.
 * Por eso toda la validación va acá y no se confía en nada del navegador.
 *
 * Devuelve SIEMPRE lo mismo —éxito— haya sido una solicitud nueva, una
 * repetida, o una hecha con el correo de alguien que ya tiene cuenta. Si la
 * respuesta cambiara según el caso, el formulario se convertiría en un oráculo
 * para averiguar quién tiene cuenta en la app.
 */
export const submit = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    city: v.string(),
    source: v.string(),
    referredBy: v.optional(v.string()),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const validation = validateRegistrationRequest(args);
    if (!validation.ok) throw new Error(validation.error);
    const fields = validation.value;

    // Tope global por ventana. `assertRateLimit` de lib/rateLimit.ts NO sirve
    // acá: cuenta filas de `transactions` por usuario, y en este flujo no hay
    // usuario. Se cuenta sobre esta misma tabla.
    const cutoff = Date.now() - UNA_HORA_MS;
    const recientes = await ctx.db
      .query("registrationRequests")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", cutoff))
      .take(REGISTRATION_REQUESTS_PER_HOUR + 1);
    if (recientes.length >= REGISTRATION_REQUESTS_PER_HOUR) {
      throw new Error(
        "Estamos recibiendo muchas solicitudes. Inténtalo de nuevo en un rato."
      );
    }

    // Una pendiente por correo. Se sale SIN insertar y SIN programar correos:
    // lo segundo importa tanto como lo primero, porque si no, pulsar "enviar"
    // diez veces bombardea el buzón del solicitante y el de todos los admins.
    const yaPendiente = await ctx.db
      .query("registrationRequests")
      .withIndex("by_email", (q) => q.eq("email", fields.email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (yaPendiente) return null;

    await ctx.db.insert("registrationRequests", {
      ...fields,
      status: "pending",
      createdAt: Date.now(),
    });

    // Los correos se enganchan en la Tarea 4.
    return null;
  },
});
```

- [ ] **Paso 5: Comprobar a mano que inserta**

Con `pnpm dev:convex` corriendo:

```bash
npx convex run registrationRequests:submit '{"email":"Prueba@Correo.COM","name":"Prueba","city":"Bogotá","source":"amigo","note":"Quiero probar la app"}'
```

Esperado: devuelve `null`. En el dashboard de Convex, tabla `registrationRequests`, hay una fila con `email: "prueba@correo.com"` (en minúsculas) y `status: "pending"`.

- [ ] **Paso 6: Comprobar que la segunda vez no duplica**

Run: el mismo comando otra vez.
Esperado: devuelve `null` y **sigue habiendo una sola fila**.

- [ ] **Paso 7: Comprobar que rechaza basura**

```bash
npx convex run registrationRequests:submit '{"email":"x","name":"","city":"","source":"nope","note":""}'
```

Esperado: falla con «Ese correo no parece válido.»

- [ ] **Paso 8: Borrar la fila de prueba**

En el dashboard de Convex, tabla `registrationRequests`, borrar la fila de `prueba@correo.com`. No dejes basura para las tareas siguientes.

- [ ] **Paso 9: Verificación**

Run: `npx convex codegen && pnpm typecheck && pnpm lint && pnpm test`
Esperado: todo pasa.

Avisa al usuario de que la Tarea 3 está lista para commitear.

---

### Tarea 4: Correos — plantillas, envíos y enganche en `submit`

Tres correos: acuse al solicitante, aviso a cada admin, y aprobación (que se usa en la Tarea 6). Se escriben los tres juntos porque comparten el marco HTML.

**Archivos:**
- Modificar: `convex/lib/emailTemplates.ts` (añadir al final)
- Modificar: `convex/users.ts` (añadir `listAdminEmailsInternal`)
- Crear: `convex/actions/sendRegistrationEmails.ts`
- Modificar: `convex/registrationRequests.ts` (enganchar en `submit`)

**Interfaces:**
- Produce: `registrationReceivedEmailHtml(name: string): string`
- Produce: `newRegistrationRequestEmailHtml(req: { name: string; email: string; city: string; sourceLabel: string; referredBy?: string; note: string }, adminUrl: string): string`
- Produce: `registrationApprovedEmailHtml(name: string, signInUrl: string): string`
- Produce: `internal.users.listAdminEmailsInternal` — sin args, devuelve `string[]`
- Produce: `internal.actions.sendRegistrationEmails.sendReceived` — args `{ email, name }`
- Produce: `internal.actions.sendRegistrationEmails.notifyAdmins` — args `{ name, email, city, source, referredBy?, note }`
- Produce: `internal.actions.sendRegistrationEmails.sendApproved` — args `{ email, name }`; **lanza** si falta `RESEND_API_KEY`

- [ ] **Paso 1: Añadir un marco compartido y las tres plantillas**

Al final de `convex/lib/emailTemplates.ts`. `escapeHtml` ya está definido en ese archivo (línea 3): reutilízalo, no lo dupliques.

Las tres comparten un marco para no triplicar 40 líneas de tabla HTML. Las tres existentes se dejan como están: reescribirlas no es parte de este trabajo.

```ts
/**
 * Marco común de los correos de registro. Las tres plantillas de abajo lo
 * comparten para no repetir la misma tabla HTML tres veces; las plantillas
 * anteriores de este archivo se quedan como están — reescribirlas no es parte
 * de este trabajo.
 *
 * `bodyHtml` se inserta CRUDO: quien la llama es responsable de haber pasado
 * por `escapeHtml` todo dato que venga de fuera.
 */
function registrationEmailShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#1F262A;font-family:system-ui,sans-serif;color:#F5F5F5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1F262A;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#343434;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px;border-bottom:1px solid #3D4448;">
              <span style="font-size:24px;font-weight:700;color:#4ADE80;">Okany</span>
              <span style="font-size:24px;font-weight:300;color:#F5F5F5;"> Sync</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">${bodyHtml}</td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #3D4448;font-size:11px;color:#A3A8AB;">
              Okany Sync · Gestión de finanzas personales
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Acuse de recibo al solicitante. No promete plazo ni resultado. */
export function registrationReceivedEmailHtml(name: string): string {
  return registrationEmailShell(
    "Recibimos tu solicitud",
    `<h1 style="margin:0 0 16px;font-size:20px;color:#F5F5F5;">Recibimos tu solicitud 📬</h1>
     <p style="margin:0 0 16px;font-size:14px;color:#A3A8AB;line-height:1.6;">
       Hola ${escapeHtml(name)}, gracias por escribirnos. El acceso a
       <strong style="color:#F5F5F5;">Okany Sync</strong> es por invitación, así que
       vamos a revisar tu solicitud a mano.
     </p>
     <p style="margin:0;font-size:14px;color:#A3A8AB;line-height:1.6;">
       Si la aprobamos, te llegará otro correo a esta misma dirección con tu enlace
       de acceso. No tienes que hacer nada más por ahora.
     </p>`
  );
}

/**
 * Aviso a los administradores. Todo dato viene de un desconocido y va dentro de
 * un HTML: pasa por escapeHtml sin excepción.
 */
export function newRegistrationRequestEmailHtml(
  req: {
    name: string;
    email: string;
    city: string;
    sourceLabel: string;
    referredBy?: string;
    note: string;
  },
  adminUrl: string
): string {
  const safeAdminUrl =
    adminUrl.startsWith("https://") || adminUrl.startsWith("http://localhost")
      ? escapeHtml(adminUrl)
      : "#";

  const fila = (etiqueta: string, valor: string) =>
    `<tr>
       <td style="padding:6px 12px 6px 0;font-size:13px;color:#A3A8AB;white-space:nowrap;vertical-align:top;">${escapeHtml(etiqueta)}</td>
       <td style="padding:6px 0;font-size:13px;color:#F5F5F5;">${escapeHtml(valor)}</td>
     </tr>`;

  return registrationEmailShell(
    "Nueva solicitud de acceso",
    `<h1 style="margin:0 0 16px;font-size:20px;color:#F5F5F5;">Nueva solicitud de acceso</h1>
     <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
       ${fila("Nombre", req.name)}
       ${fila("Correo", req.email)}
       ${fila("Ciudad", req.city)}
       ${fila("Nos conoció por", req.sourceLabel)}
       ${req.referredBy ? fila("Lo refirió", req.referredBy) : ""}
       ${fila("Motivo", req.note)}
     </table>
     <a href="${safeAdminUrl}"
        style="display:inline-block;background:#4ADE80;color:#052e16;font-weight:700;
               font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
       Revisar en el panel →
     </a>`
  );
}

/**
 * Aprobación. No lleva el enlace de acceso: ese va en su propio correo, el
 * magic link que manda Better Auth. Este avisa y explica qué va a pasar, para
 * que el magic link no llegue sin contexto.
 */
export function registrationApprovedEmailHtml(name: string, signInUrl: string): string {
  const safeUrl =
    signInUrl.startsWith("https://") || signInUrl.startsWith("http://localhost")
      ? escapeHtml(signInUrl)
      : "#";

  return registrationEmailShell(
    "Tu solicitud fue aprobada",
    `<h1 style="margin:0 0 16px;font-size:20px;color:#F5F5F5;">Tu solicitud fue aprobada 🎉</h1>
     <p style="margin:0 0 16px;font-size:14px;color:#A3A8AB;line-height:1.6;">
       Hola ${escapeHtml(name)}, ya tienes acceso a
       <strong style="color:#F5F5F5;">Okany Sync</strong>.
     </p>
     <p style="margin:0 0 24px;font-size:14px;color:#A3A8AB;line-height:1.6;">
       Te enviamos aparte un correo con tu <strong style="color:#F5F5F5;">enlace de
       acceso</strong>. Ábrelo y entra con él: lo primero que te pediremos es definir
       tu contraseña, y a partir de ahí entras con tu correo y esa contraseña.
     </p>
     <a href="${safeUrl}"
        style="display:inline-block;background:#4ADE80;color:#052e16;font-weight:700;
               font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
       Ir a Okany Sync →
     </a>`
  );
}
```

- [ ] **Paso 2: Añadir `listAdminEmailsInternal` a `convex/users.ts`**

Al final del archivo. Es `internalQuery` porque solo la llaman actions internas; no hay motivo para exponerla.

```ts
/**
 * Correos de los administradores activos. La usa el aviso de nueva solicitud
 * de registro: así, un admin que se añada mañana se entera sin tocar ninguna
 * variable de entorno.
 */
export const listAdminEmailsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
    return admins.filter((u) => u.active).map((u) => u.email);
  },
});
```

Comprueba que `internalQuery` esté en el import de `./_generated/server` al principio del archivo; si no está, añádelo.

- [ ] **Paso 3: Crear `convex/actions/sendRegistrationEmails.ts`**

```ts
"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Resend } from "resend";
import { REGISTRATION_SOURCES } from "../../src/lib/constants";
import {
  newRegistrationRequestEmailHtml,
  registrationApprovedEmailHtml,
  registrationReceivedEmailHtml,
} from "../lib/emailTemplates";

const FROM_FALLBACK = "Okany Sync <onboarding@resend.dev>";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Acuse al solicitante. Informativo: si falla, no rompe nada. */
export const sendReceived = internalAction({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, { email, name }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("sendRegistrationEmails.sendReceived: RESEND_API_KEY no configurada");
      return;
    }
    try {
      const { error } = await new Resend(apiKey).emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? FROM_FALLBACK,
        to: email,
        subject: "Recibimos tu solicitud — Okany Sync",
        html: registrationReceivedEmailHtml(name),
      });
      if (error) console.error("sendReceived: Resend error →", error);
    } catch (err) {
      console.error("sendReceived: error inesperado →", err);
    }
  },
});

/**
 * Aviso a todos los administradores activos.
 *
 * `allSettled` y no `all`: un correo que rebote no puede impedir que los demás
 * admins se enteren. El estado real está en la tabla `registrationRequests`,
 * así que estos correos son un empujón, no la fuente de verdad.
 */
export const notifyAdmins = internalAction({
  args: {
    name: v.string(),
    email: v.string(),
    city: v.string(),
    source: v.string(),
    referredBy: v.optional(v.string()),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("sendRegistrationEmails.notifyAdmins: RESEND_API_KEY no configurada");
      return;
    }

    const destinatarios = await ctx.runQuery(internal.users.listAdminEmailsInternal, {});
    if (destinatarios.length === 0) {
      console.warn("notifyAdmins: no hay administradores activos a quien avisar");
      return;
    }

    const sourceLabel =
      REGISTRATION_SOURCES.find((s) => s.value === args.source)?.label ?? args.source;
    // Los campos se enumeran en vez de esparcir `args`: la plantilla recibe
    // `sourceLabel` y NO `source`, y colar un campo de más en un literal de
    // objeto es un error de tipos.
    const html = newRegistrationRequestEmailHtml(
      {
        name: args.name,
        email: args.email,
        city: args.city,
        sourceLabel,
        referredBy: args.referredBy,
        note: args.note,
      },
      `${appUrl()}/admin`
    );

    const resend = new Resend(apiKey);
    const resultados = await Promise.allSettled(
      destinatarios.map((to) =>
        resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? FROM_FALLBACK,
          to,
          subject: "Nueva solicitud de acceso a Okany Sync",
          html,
        })
      )
    );
    for (const r of resultados) {
      if (r.status === "rejected") console.error("notifyAdmins: envío fallido →", r.reason);
    }
  },
});

/**
 * Aprobación. A DIFERENCIA de los otros dos, LANZA si no puede enviar.
 *
 * Quien la llama (registrationRequests.approve) solo marca la solicitud como
 * aprobada si esto no lanzó. Tragarse el fallo dejaría una solicitud
 * "aprobada" cuya persona no se entera nunca, y sin forma de detectarlo.
 */
export const sendApproved = internalAction({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, { email, name }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "No se puede aprobar: falta RESEND_API_KEY, así que el solicitante no recibiría el aviso."
      );
    }
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? FROM_FALLBACK,
      to: email,
      subject: "Tu solicitud fue aprobada 🎉",
      html: registrationApprovedEmailHtml(name, `${appUrl()}/login`),
    });
    if (error) throw new Error(`No se pudo enviar el correo de aprobación: ${error.message}`);
  },
});
```

- [ ] **Paso 4: Enganchar los dos primeros en `submit`**

En `convex/registrationRequests.ts`, sustituir el comentario `// Los correos se enganchan en la Tarea 4.` por:

```ts
    // Se programan DESPUÉS del insert y solo en este camino: la salida
    // temprana de "ya hay una pendiente" no llega hasta acá, que es lo que
    // impide que reenviar el formulario bombardee buzones.
    await ctx.scheduler.runAfter(0, internal.actions.sendRegistrationEmails.sendReceived, {
      email: fields.email,
      name: fields.name,
    });
    await ctx.scheduler.runAfter(0, internal.actions.sendRegistrationEmails.notifyAdmins, {
      name: fields.name,
      email: fields.email,
      city: fields.city,
      source: fields.source,
      referredBy: fields.referredBy,
      note: fields.note,
    });
```

Y añadir el import al principio del archivo:

```ts
import { internal } from "./_generated/api";
```

- [ ] **Paso 5: Comprobar el envío de punta a punta**

Con `pnpm dev:convex` corriendo y `RESEND_API_KEY` configurada en Convex:

```bash
npx convex run registrationRequests:submit '{"email":"TU_CORREO_REAL@ejemplo.com","name":"Prueba Correo","city":"Bogotá","source":"redes","note":"Probando los correos del formulario"}'
```

Esperado: llegan **dos** correos — el acuse a ese correo y el aviso a los admins (si tu usuario es admin, te llegan los dos a ti). El aviso muestra «Redes sociales», no `redes`, y su botón lleva a `/admin`.

- [ ] **Paso 6: Comprobar que el reenvío NO manda nada**

Run: el mismo comando otra vez.
Esperado: no llega ningún correo nuevo. Este es el paso importante de la tarea.

- [ ] **Paso 7: Comprobar el escapado**

```bash
npx convex run registrationRequests:submit '{"email":"otro@ejemplo.com","name":"<script>alert(1)</script>","city":"X","source":"otro","note":"<b>negrita</b>"}'
```

Esperado: en el correo de aviso se **lee el texto literal** `<script>alert(1)</script>` y `<b>negrita</b>`; no se ejecuta nada ni se ve en negrita.

- [ ] **Paso 8: Limpiar**

Borrar en el dashboard de Convex las filas de prueba de `registrationRequests`.

- [ ] **Paso 9: Verificación**

Run: `npx convex codegen && pnpm typecheck && pnpm lint && pnpm test`

Avisa al usuario de que la Tarea 4 está lista para commitear.

---

### Tarea 5: Formulario público `/solicitar-acceso`

**Archivos:**
- Crear: `src/app/(auth)/solicitar-acceso/page.tsx`
- Crear: `src/components/auth/RequestAccessForm.tsx`
- Modificar: `src/proxy.ts:8`
- Modificar: `src/app/(auth)/login/page.tsx` (el `footer` del `AuthShell`)

**Interfaces:**
- Consume: `api.registrationRequests.submit` (Tarea 3)
- Consume: `validateRegistrationRequest`, `REGISTRATION_SOURCES`, `REGISTRATION_FIELD_LIMITS` (Tarea 2)

- [ ] **Paso 1: Abrir la ruta en el proxy**

En `src/proxy.ts:8`, añadir `"/solicitar-acceso"` a `PUBLIC_PREFIXES`:

```ts
const PUBLIC_PREFIXES = ["/login", "/sign-in", "/forgot-password", "/reset-password", "/solicitar-acceso", "/api/auth", "/sw.js"];
```

Sin esto, el proxy redirige a `/login` a quien no tiene cookie — es decir, a todo el que quiera solicitar acceso.

- [ ] **Paso 2: Crear la página**

`src/app/(auth)/solicitar-acceso/page.tsx`. Sigue el molde de `src/app/(auth)/login/page.tsx`, incluido el redirect de quien ya tiene sesión.

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authNextJs } from "@/lib/auth-server";
import { AuthShell } from "@/components/auth/AuthShell";
import { RequestAccessForm } from "@/components/auth/RequestAccessForm";

export const metadata: Metadata = { title: "Solicitar acceso" };

export default async function RequestAccessPage() {
  // Mismo predicado que /login y que (app)/layout.tsx: quien ya entró no tiene
  // nada que solicitar.
  if (await authNextJs.isAuthenticated()) redirect("/dashboard");

  return (
    <AuthShell
      title="Solicitar acceso"
      subtitle="Cuéntanos quién eres y por qué quieres usar la app"
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <a href="/login" className="font-medium text-lime-text hover:underline">
            Inicia sesión
          </a>
        </>
      }
    >
      <RequestAccessForm />
    </AuthShell>
  );
}
```

- [ ] **Paso 3: Crear el formulario**

`src/components/auth/RequestAccessForm.tsx`. Patrón de `ForgotPasswordForm`: `useState` + validación nativa + `AuthAlert`, sin react-hook-form ni zod. Igual que él, al enviar con éxito **sustituye el formulario** por la confirmación.

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Mail, MailCheck, MapPin, Send, User, UserPlus } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AUTH_INPUT_CLASS, AuthAlert, FieldIcon } from "./AuthFields";
import { errorMessage } from "@/lib/errorMessage";
import { REGISTRATION_FIELD_LIMITS, REGISTRATION_SOURCES } from "@/lib/constants";
import { validateRegistrationRequest } from "@/lib/registrationRequest";

export function RequestAccessForm() {
  const reduceMotion = useReducedMotion();
  const submit = useMutation(api.registrationRequests.submit);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [source, setSource] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    // La MISMA validación que corre el servidor (src/lib/registrationRequest.ts).
    // Se ejecuta acá solo para dar el error al instante; la que manda es la del
    // servidor, porque esta mutation es pública y nadie puede confiar en lo que
    // diga el navegador.
    const validation = validateRegistrationRequest({
      email, name, city, source, referredBy, note,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await submit(validation.value);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "No pudimos enviar tu solicitud. Inténtalo de nuevo."));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-5 text-center">
        <motion.span
          className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime/15 text-lime-text"
          initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.45, duration: 0.6 }}
          aria-hidden="true"
        >
          <MailCheck className="size-7" />
        </motion.span>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Recibimos tu solicitud</h2>
          {/* Mismo texto pase lo que pase: si dijera algo distinto cuando el
              correo ya tiene cuenta, esta pantalla serviría para averiguar
              quién está registrado. */}
          <p className="text-sm text-muted-foreground">
            Te enviamos un correo de confirmación. Vamos a revisar tu solicitud a mano
            y, si la aprobamos, te llegará tu enlace de acceso.
          </p>
        </div>

        <Link
          href="/login"
          className="touch-hit inline-flex rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre completo</Label>
        <div className="relative">
          <FieldIcon icon={User} />
          <Input
            id="name" autoComplete="name" autoFocus required disabled={loading}
            maxLength={REGISTRATION_FIELD_LIMITS.name}
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ana Pérez" className={AUTH_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Correo electrónico</Label>
        <div className="relative">
          <FieldIcon icon={Mail} />
          <Input
            id="email" type="email" autoComplete="email" required disabled={loading}
            maxLength={REGISTRATION_FIELD_LIMITS.email}
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com" className={AUTH_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="city">Ciudad</Label>
        <div className="relative">
          <FieldIcon icon={MapPin} />
          <Input
            id="city" autoComplete="address-level2" required disabled={loading}
            maxLength={REGISTRATION_FIELD_LIMITS.city}
            value={city} onChange={(e) => setCity(e.target.value)}
            placeholder="Medellín" className={AUTH_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="source">¿Cómo conociste la app?</Label>
        <Select value={source} onValueChange={setSource} disabled={loading}>
          <SelectTrigger id="source" className="h-11 w-full rounded-xl">
            <SelectValue placeholder="Elige una opción" />
          </SelectTrigger>
          <SelectContent>
            {REGISTRATION_SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="referredBy">
          ¿Quién te refirió? <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <div className="relative">
          <FieldIcon icon={UserPlus} />
          <Input
            id="referredBy" disabled={loading}
            maxLength={REGISTRATION_FIELD_LIMITS.referredBy}
            value={referredBy} onChange={(e) => setReferredBy(e.target.value)}
            placeholder="Nombre de quien te habló de la app"
            className={AUTH_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">¿Por qué quieres usar la app?</Label>
        <Textarea
          id="note" required disabled={loading} rows={4}
          maxLength={REGISTRATION_FIELD_LIMITS.note}
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Cuéntanos brevemente en qué te gustaría que te ayude."
          className="rounded-xl"
        />
        <p className="text-right text-xs text-muted-foreground">
          {note.length} / {REGISTRATION_FIELD_LIMITS.note}
        </p>
      </div>

      {error && <AuthAlert>{error}</AuthAlert>}

      <Button
        type="submit" size="lg" disabled={loading}
        className="h-11 w-full gap-2 rounded-xl font-semibold"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        {loading ? "Enviando…" : "Enviar solicitud"}
      </Button>
    </form>
  );
}
```

Comprueba que `src/components/ui/textarea.tsx` y `src/components/ui/select.tsx` existen:

```bash
ls src/components/ui/textarea.tsx src/components/ui/select.tsx
```

Si falta `textarea`, añádelo con `pnpm dlx shadcn@latest add textarea`. **No lo escribas a mano.**

- [ ] **Paso 4: Enlazar desde `/login`**

En `src/app/(auth)/login/page.tsx`, sustituir el `footer` actual del `AuthShell`:

```tsx
      footer={
        <>
          El acceso es solo por invitación.{" "}
          <a href="/solicitar-acceso" className="font-medium text-lime-text hover:underline">
            Solicita acceso
          </a>
          .
        </>
      }
```

- [ ] **Paso 5: Probarlo en el navegador**

Con `pnpm dev` y `pnpm dev:convex` corriendo, en una ventana **de incógnito** (sin sesión):

1. Abre `http://localhost:3000/solicitar-acceso`. Debe cargar, no redirigir a `/login`.
2. Envía el formulario con todo relleno. Debe aparecer «Recibimos tu solicitud».
3. Mándalo otra vez con el mismo correo: **también** debe decir «Recibimos tu solicitud». Ese es el comportamiento correcto; el servidor no filtra que ya había una.
4. Intenta enviarlo sin elegir «¿Cómo conociste la app?»: debe salir el error en el formulario, sin llamar al servidor.
5. Comprueba que se ve bien a 375 px de ancho (móvil) sin scroll horizontal.
6. Desde `/login`, el enlace «Solicita acceso» debe llevar ahí.

- [ ] **Paso 6: Limpiar y verificar**

Borra las filas de prueba en el dashboard de Convex.

Run: `pnpm typecheck && pnpm lint && pnpm test`

Avisa al usuario de que la Tarea 5 está lista para commitear.

---

### Tarea 6: Backend de revisión — `listPending`, `reject`, `approve`

El corazón de la funcionalidad. Aquí está el chequeo de seguridad del que depende todo lo demás.

**Archivos:**
- Modificar: `convex/registrationRequests.ts` (añadir cuatro funciones)

**Interfaces:**
- Consume: `sendAccessMagicLink` de `convex/lib/accessLink.ts` (Tarea 1)
- Consume: `internal.actions.sendRegistrationEmails.sendApproved` (Tarea 4)
- Consume: `canReview` de `src/lib/registrationRequest.ts` (Tarea 2)
- Produce: `api.registrationRequests.listPending` — sin args; devuelve `Array<{ id, email, name, city, source, referredBy?, note, createdAt, alreadyRegistered: boolean }>`
- Produce: `api.registrationRequests.reject` — args `{ requestId: Id<"registrationRequests"> }`
- Produce: `api.registrationRequests.approve` — **action**, args `{ requestId: Id<"registrationRequests"> }`
- Produce: `internal.registrationRequests.getInternal` — args `{ requestId }`
- Produce: `internal.registrationRequests.markApproved` — args `{ requestId, adminClerkId }`
- Produce: `internal.users.getByEmailInternal` — args `{ email: v.string() }`; devuelve la fila de `users` o `null` (se crea en el Paso 6 de esta misma tarea)

- [ ] **Paso 1: Añadir los imports que faltan**

Al principio de `convex/registrationRequests.ts`:

```ts
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { assertAdmin, assertAdminFromAction } from "./lib/auth";
import { sendAccessMagicLink } from "./lib/accessLink";
import { canReview } from "../src/lib/registrationRequest";
import { AUDIT_ACTIONS } from "../src/lib/constants";
```

Deja un solo import de `./_generated/server` con todo lo que se usa; no dupliques la línea que ya está.

- [ ] **Paso 2: `listPending`**

```ts
/**
 * Solicitudes pendientes para el panel admin.
 *
 * `alreadyRegistered` se resuelve acá y no en el cliente porque la tarjeta no
 * tiene —ni debe tener— la lista de correos de todos los usuarios. Sirve para
 * que el admin no apruebe por inercia una solicitud hecha con el correo de
 * alguien que ya tiene cuenta; el rechazo duro está en `approve`.
 */
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    const pending = await ctx.db
      .query("registrationRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return Promise.all(
      pending.map(async (r) => {
        const existente = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", r.email))
          .first();
        return {
          id: r._id,
          email: r.email,
          name: r.name,
          city: r.city,
          source: r.source,
          referredBy: r.referredBy,
          note: r.note,
          createdAt: r.createdAt,
          alreadyRegistered: existente !== null,
        };
      })
    );
  },
});
```

- [ ] **Paso 3: `reject`**

```ts
/**
 * Rechazo SILENCIOSO: no se envía ningún correo al solicitante, por decisión
 * de producto. La fila no se borra — es el registro de que la decisión se tomó
 * y de quién la tomó.
 */
export const reject = mutation({
  args: { requestId: v.id("registrationRequests") },
  handler: async (ctx, { requestId }) => {
    const admin = await assertAdmin(ctx);
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Esa solicitud ya no existe");
    if (!canReview(request.status)) {
      throw new Error("Esa solicitud ya se revisó");
    }

    const now = Date.now();
    await ctx.db.patch(requestId, {
      status: "rejected",
      reviewedAt: now,
      reviewedBy: admin.clerkId,
    });

    // Insert directo, mismo patrón que invitations.revoke: esta es una mutation
    // pública con el contexto de admin ya resuelto, e internal.users.logAuditAction
    // es una internalMutation.
    await ctx.db.insert("auditLogs", {
      userId: admin.clerkId,
      action: AUDIT_ACTIONS.REGISTRATION_REJECTED,
      entity: "registrationRequests",
      entityId: requestId,
      metadata: { email: request.email },
      createdAt: now,
    });
  },
});
```

- [ ] **Paso 4: Los dos ayudantes internos de `approve`**

```ts
/** Lectura de la solicitud desde la action de aprobación. */
export const getInternal = internalQuery({
  args: { requestId: v.id("registrationRequests") },
  handler: async (ctx, { requestId }) => ctx.db.get(requestId),
});

/**
 * Cierra la aprobación. CONDICIONADA a que la solicitud siga pendiente, y no
 * un patch a secas: los pasos previos corren en una action y sus lecturas no
 * son transaccionales, así que dos admins pulsando a la vez pueden llegar los
 * dos hasta aquí. Que uno de los dos falle es exactamente lo que se quiere —
 * garantiza un solo `reviewedBy` y una sola fila de auditoría.
 */
export const markApproved = internalMutation({
  args: {
    requestId: v.id("registrationRequests"),
    adminClerkId: v.string(),
  },
  handler: async (ctx, { requestId, adminClerkId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Esa solicitud ya no existe");
    if (!canReview(request.status)) {
      throw new Error("Esa solicitud ya se revisó");
    }

    const now = Date.now();
    await ctx.db.patch(requestId, {
      status: "approved",
      reviewedAt: now,
      reviewedBy: adminClerkId,
    });
    await ctx.db.insert("auditLogs", {
      userId: adminClerkId,
      action: AUDIT_ACTIONS.REGISTRATION_APPROVED,
      entity: "registrationRequests",
      entityId: requestId,
      metadata: { email: request.email },
      createdAt: now,
    });
  },
});
```

- [ ] **Paso 5: `approve`**

Es una **action** —manda correos y habla con Better Auth— pero va en este módulo normal, **sin `"use node"`**: `sendAccessMagicLink` ya no lo necesita (Tarea 1).

El orden de los pasos es lo importante de esta función. Léelo entero antes de escribirlo.

```ts
/**
 * Aprueba una solicitud: emite la invitación y manda el acceso.
 *
 * NO crea el usuario. Aprobar = insertar una fila en `invitations`, que es el
 * gate que lee users.ensureExists. La fila de `users` la crea esa función
 * cuando la persona hace clic en el magic link.
 *
 * El marcado como "aprobada" va AL FINAL, a propósito: si el envío falla, la
 * solicitud sigue pendiente y el botón se puede volver a pulsar. Al reintentar,
 * invitations.createFromAdmin es idempotente, así que no se duplica nada.
 */
export const approve = action({
  args: { requestId: v.id("registrationRequests") },
  handler: async (ctx, { requestId }) => {
    const admin = await assertAdminFromAction(ctx);

    // 1. Releer: entre que se pintó la tarjeta y se pulsó el botón, otro admin
    //    pudo resolverla.
    const request = await ctx.runQuery(internal.registrationRequests.getInternal, {
      requestId,
    });
    if (!request) throw new Error("Esa solicitud ya no existe");
    if (!canReview(request.status)) throw new Error("Esa solicitud ya se revisó");

    // 2. EL CHEQUEO DE SEGURIDAD. No es cosmético: el trigger onCreate de
    //    convex/auth.ts vincula por email cualquier usuario nuevo de Better
    //    Auth que llegue con emailVerified true, y eso es justo lo que crea un
    //    magic link. Aprobar una solicitud hecha con el correo de un usuario
    //    existente le entregaría a un tercero el acceso a esa cuenta.
    //
    //    Depende de que `users.email` esté normalizado — por eso la Tarea 1
    //    corre migrations:normalizeUserEmails.
    const existente = await ctx.runQuery(internal.users.getByEmailInternal, {
      email: request.email,
    });
    if (existente) {
      throw new Error(
        "Ese correo ya tiene una cuenta en la app. No se puede aprobar esta solicitud."
      );
    }

    // 3. Emitir la invitación: el gate real de acceso. Siempre rol "user";
    //    para crear un admin está «Invitar usuario» en el panel.
    await ctx.runMutation(internal.invitations.createFromAdmin, {
      email: request.email,
      role: "user",
      invitedBy: admin.clerkId,
    });

    // 4. Mandar el acceso. sendApproved LANZA si no pudo enviar, y eso corta
    //    la función antes del paso 5.
    await sendAccessMagicLink(ctx, request.email);
    await ctx.runAction(internal.actions.sendRegistrationEmails.sendApproved, {
      email: request.email,
      name: request.name,
    });

    // 5. Solo ahora.
    await ctx.runMutation(internal.registrationRequests.markApproved, {
      requestId,
      adminClerkId: admin.clerkId,
    });
  },
});
```

- [ ] **Paso 6: Añadir `getByEmailInternal` a `convex/users.ts`**

`approve` la necesita y no existe. Al final de `convex/users.ts`:

```ts
/**
 * Busca un usuario por correo. La usa el chequeo de
 * registrationRequests.approve que impide aprobar una solicitud hecha con el
 * correo de alguien que ya tiene cuenta.
 *
 * El correo se normaliza acá también, aunque quien llama ya lo tenga
 * normalizado: es la clase de detalle que se pierde en el próximo cambio.
 */
export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) =>
    ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
      .first(),
});
```

`normalizeEmail` ya está importado en `convex/users.ts`; comprueba `internalQuery` en el import de `./_generated/server`.

- [ ] **Paso 7: Probar el rechazo**

Crea una solicitud de prueba y, con el `_id` que te dé el dashboard:

```bash
npx convex run registrationRequests:reject '{"requestId":"<ID>"}'
```

Esperado: la fila pasa a `rejected` con `reviewedBy` puesto, aparece una fila en `auditLogs` con `registration.rejected`, y **no llega ningún correo**. Correrlo otra vez falla con «Esa solicitud ya se revisó».

Nota: `npx convex run` corre sin identidad, así que `assertAdmin` lanzará «No autenticado». Prueba estas dos desde la interfaz en la Tarea 7, o desde el dashboard de Convex con un usuario impersonado. Si `npx convex run` falla por auth, es la respuesta correcta — apúntalo y sigue.

- [ ] **Paso 8: Probar el chequeo de seguridad**

Este es el paso que no te puedes saltar. Crea una solicitud **con el correo de un usuario que ya existe** y apruébala desde la interfaz en la Tarea 7.

Esperado: falla con «Ese correo ya tiene una cuenta en la app». Si se aprueba, **detente**: hay un agujero de seguridad, probablemente que `migrations:normalizeUserEmails` no se corrió.

- [ ] **Paso 9: Verificación**

Run: `npx convex codegen && pnpm typecheck && pnpm lint && pnpm test`

Avisa al usuario de que la Tarea 6 está lista para commitear.

---

### Tarea 7: `PendingRequestsCard` en el panel

**Archivos:**
- Crear: `src/components/admin/PendingRequestsCard.tsx`
- Modificar: `src/app/(app)/admin/page.tsx`

**Interfaces:**
- Consume: `api.registrationRequests.listPending`, `reject`, `approve` (Tarea 6)

- [ ] **Paso 1: Leer el molde**

Lee `src/components/admin/PendingInvitationsCard.tsx` entero antes de escribir nada. La tarjeta nueva es su hermana: mismo `AdminCard`, mismo patrón de `ocupada`/`toast`/`AlertDialog`, mismo estilo de lista.

- [ ] **Paso 2: Crear la tarjeta**

```tsx
"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { ClipboardList, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AdminCard } from "./AdminCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { formatRelative } from "@/lib/utils";
import { errorMessage } from "@/lib/errorMessage";
import { REGISTRATION_SOURCES } from "@/lib/constants";

function sourceLabel(value: string) {
  return REGISTRATION_SOURCES.find((s) => s.value === value)?.label ?? value;
}

/**
 * Solicitudes del formulario público, a la espera de decisión.
 *
 * Aprobar NO crea el usuario: emite una invitación y manda el acceso. Rechazar
 * es silencioso —el solicitante no recibe nada— y solo deja el registro de la
 * decisión.
 */
export function PendingRequestsCard({ index = 0 }: { index?: number }) {
  const requests = useQuery(api.registrationRequests.listPending);
  const reject = useMutation(api.registrationRequests.reject);
  const approve = useAction(api.registrationRequests.approve);

  const [ocupada, setOcupada] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [porRechazar, setPorRechazar] = useState<
    { id: Id<"registrationRequests">; email: string } | null
  >(null);

  async function aprobar(id: Id<"registrationRequests">, email: string) {
    setOcupada(id);
    try {
      await approve({ requestId: id });
      toast.success(`Acceso enviado a ${email}`);
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo aprobar la solicitud"));
    } finally {
      setOcupada(null);
    }
  }

  async function confirmarRechazo() {
    if (!porRechazar) return;
    const { id } = porRechazar;
    setPorRechazar(null);
    setOcupada(id);
    try {
      await reject({ requestId: id });
      toast.success("Solicitud rechazada");
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo rechazar"));
    } finally {
      setOcupada(null);
    }
  }

  if (requests === undefined) {
    return (
      <AdminCard icon={ClipboardList} tone="var(--os-cyan)" title="Solicitudes de registro" index={index}>
        <Skeleton className="h-20 rounded-2xl" />
      </AdminCard>
    );
  }

  return (
    <AdminCard
      icon={ClipboardList}
      tone="var(--os-cyan)"
      title="Solicitudes de registro"
      badge={
        <span
          className="text-[13px] font-bold text-foreground"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {requests.length}
        </span>
      }
      index={index}
      footnote={
        requests.length > 0
          ? "Aprobar emite una invitación y envía el enlace de acceso. Rechazar no le avisa a nadie."
          : null
      }
    >
      {requests.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No hay solicitudes pendientes de revisar.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {requests.map((r) => {
            const desplegada = abierta === r.id;
            return (
              <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    type="button"
                    onClick={() => setAbierta(desplegada ? null : r.id)}
                    aria-expanded={desplegada}
                    className="min-w-0 flex-1 rounded-sm text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {/* <span className="block"> y no <p>: un <p> dentro de un
                        <button> es anidado invalido — un button solo admite
                        contenido de frase. */}
                    <span className="block truncate text-[13px] font-semibold text-foreground">
                      {r.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {r.email} · {formatRelative(r.createdAt)}
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      disabled={ocupada === r.id || r.alreadyRegistered}
                      onClick={() => aprobar(r.id, r.email)}
                    >
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={ocupada === r.id}
                      onClick={() => setPorRechazar({ id: r.id, email: r.email })}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>

                {r.alreadyRegistered && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] text-warning-text">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    Ese correo ya tiene una cuenta. No se puede aprobar: hazlo desde el
                    usuario existente si hace falta.
                  </p>
                )}

                {desplegada && (
                  <dl className="os-enter mt-2.5 space-y-1 text-[12px]">
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">Ciudad</dt>
                      <dd className="text-foreground">{r.city}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">Nos conoció por</dt>
                      <dd className="text-foreground">{sourceLabel(r.source)}</dd>
                    </div>
                    {r.referredBy && (
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">Lo refirió</dt>
                        <dd className="text-foreground">{r.referredBy}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-muted-foreground">Motivo</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{r.note}</dd>
                    </div>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={porRechazar !== null} onOpenChange={(o) => !o && setPorRechazar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar la solicitud?</AlertDialogTitle>
            <AlertDialogDescription>
              {porRechazar?.email} no recibirá ningún aviso: el rechazo es silencioso.
              La solicitud se queda en el historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarRechazo}>Rechazar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminCard>
  );
}
```

- [ ] **Paso 3: Montarla en `/admin` y renumerar**

En `src/app/(app)/admin/page.tsx`, en la sección «Personas», debajo de la rejilla de `PendingInvitationsCard`/`DormantUsersCard`.

Los `index` son una numeración **continua** que ordena la entrada escalonada de las tarjetas. Insertar una obliga a renumerar las siguientes:

```tsx
      <section className="space-y-2.5">
        <h2 className={FIELD_LABEL}>Personas</h2>
        <div className="grid grid-cols-1 gap-3">
          <UsersSummaryCard index={2} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <PendingInvitationsCard index={3} />
            <DormantUsersCard index={4} />
          </div>
          <PendingRequestsCard index={5} />
        </div>
      </section>
```

Y en las secciones siguientes: `VolumeCard` pasa de `5` a `6`, `RecentActivityCard` de `6` a `7`, `ManualRateCard` de `7` a `8`.

Añade el import:

```tsx
import { PendingRequestsCard } from "@/components/admin/PendingRequestsCard";
```

- [ ] **Paso 4: Probar el camino feliz completo**

Con `pnpm dev` y `pnpm dev:convex`:

1. En incógnito, manda una solicitud desde `/solicitar-acceso` con un correo tuyo real **que no tenga cuenta**.
2. Como admin, entra a `/admin`. La tarjeta «Solicitudes de registro» muestra la solicitud. Despliégala: se ven ciudad, fuente, refirente y motivo.
3. Pulsa **Aprobar**. Sale el toast, la solicitud desaparece de la lista y llegan **dos** correos: el de aprobación y el magic link.
4. En el dashboard de Convex: la fila está `approved` con `reviewedBy`; hay una invitación `pending` para ese correo; hay una fila en `auditLogs` con `registration.approved`.

- [ ] **Paso 5: Probar el chequeo de seguridad de la Tarea 6**

1. Manda una solicitud con el correo de un usuario **que ya existe**.
2. En `/admin` debe aparecer el aviso ámbar «Ese correo ya tiene una cuenta» y el botón **Aprobar deshabilitado**.
3. Ese botón deshabilitado es comodidad, no la defensa. Comprueba la defensa real desde la consola del navegador, estando como admin:

```js
await window.convex.action("registrationRequests:approve", { requestId: "<ID>" })
```

Esperado: rechaza con «Ese correo ya tiene una cuenta en la app». Si se aprueba, **detente y avisa**.

Si `window.convex` no está expuesto, prueba equivalente: quita temporalmente `r.alreadyRegistered` de la condición `disabled` del botón, pulsa Aprobar, comprueba que sale el error en un toast, y **devuelve el código como estaba**.

- [ ] **Paso 6: Probar el rechazo**

Manda otra solicitud y pulsa **Rechazar**. Confirma el diálogo. Esperado: desaparece de la lista, la fila queda `rejected`, hay fila en `auditLogs`, y **no llega ningún correo**.

- [ ] **Paso 7: Comprobar la lista vacía y el móvil**

Sin solicitudes pendientes, la tarjeta debe decir «No hay solicitudes pendientes de revisar» y no mostrar la nota al pie. Comprueba también que a 375 px la fila no desborda.

- [ ] **Paso 8: Verificación**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Avisa al usuario de que la Tarea 7 está lista para commitear.

---

### Tarea 8: Backend de la contraseña obligatoria

Marca a todo usuario nuevo y da la función que define su primera contraseña. Va antes que la interfaz a propósito: marcar el flag cuando todavía nadie lo lee es inofensivo, mientras que un guard sin pantalla a la que redirigir es un bucle.

Esto **no es solo para quien llega por el formulario**. Hoy un invitado por el admin entra con magic link y nada le obliga a definir contraseña; como la pestaña de enlace mágico ya no está en la interfaz, la próxima vez se queda fuera, y «¿Olvidaste tu contraseña?» no le manda nada porque no tiene cuenta `credential` en Better Auth. Esta tarea cierra ese hueco.

**Archivos:**
- Modificar: `convex/users.ts` (`ensureExists`, más dos funciones nuevas)

**Interfaces:**
- Produce: `api.users.setInitialPassword` — **action**, args `{ newPassword: v.string() }`; devuelve `{ alreadyHadPassword: boolean }`
- Produce: `internal.users.clearMustSetPassword` — args `{ clerkId: v.string(); logAudit: v.boolean() }`

- [ ] **Paso 1: Marcar al usuario nuevo en `ensureExists`**

En `convex/users.ts`, en el `ctx.db.insert("users", {...})` del final de `ensureExists` (la rama que consume la invitación), añadir el campo junto a `lastSeenAt`:

```ts
      // Obliga a definir contraseña antes de usar la app (ver AuthGuard y
      // /definir-password). Se marca a TODO usuario nuevo, no solo a los que
      // llegan por el formulario público: quien entra por magic link no tiene
      // cuenta `credential` en Better Auth, así que sin esto no puede volver a
      // entrar nunca —ni siquiera con «¿olvidaste tu contraseña?», que no le
      // enviaría nada.
      mustSetPassword: true,
```

**No lo añadas a ninguna otra rama.** Las otras tres devuelven usuarios que ya existían y que ya tienen su acceso resuelto; marcarlos los encerraría en el guard.

- [ ] **Paso 1b: En ese mismo insert, guardar el correo NORMALIZADO**

En el mismo `ctx.db.insert("users", {...})`, cambiar `email,` por:

```ts
      // Normalizado, no crudo. El comentario que había aquí justificaba
      // guardarlo tal cual "para no alterar el flujo de Clerk que ya está en
      // producción" — Clerk ya no existe. Guardarlo crudo reabre el agujero
      // que tapó migrations:normalizeUserEmails: si el proveedor devolviera el
      // correo con mayúsculas distintas, el chequeo anti-secuestro de
      // registrationRequests.approve (que busca por by_email en minúsculas) no
      // encontraría a ese usuario. El trigger onCreate de convex/auth.ts ya
      // asume que esta columna está en minúsculas.
      email: normalizedEmail,
```

`normalizedEmail` ya está calculado más arriba en ese mismo handler; no lo recalcules. La variable `email` sin normalizar se sigue usando para `name` (`identity.name ?? (email || "Usuario")`) — eso no cambia.

- [ ] **Paso 1c: Lo mismo en `users.createFromAdmin`**

`convex/users.ts:681` inserta `email: args.email` crudo, con el mismo problema. Cambiar a `email: normalizeEmail(args.email)`.

Comprueba después que no queda ningún insert en `users` con el correo sin normalizar:

```bash
grep -n "email: args.email\|email," convex/users.ts
```

- [ ] **Paso 2: Añadir `clearMustSetPassword`**

Al final de `convex/users.ts`:

```ts
/**
 * Quita el flag de contraseña obligatoria. La llama users.setInitialPassword.
 *
 * `logAudit` es false cuando el flag se limpia porque la persona YA tenía
 * contraseña (la definió por /forgot-password): ahí no se cambió ninguna
 * contraseña y registrarlo sería mentir en el log.
 */
export const clearMustSetPassword = internalMutation({
  args: { clerkId: v.string(), logAudit: v.boolean() },
  handler: async (ctx, { clerkId, logAudit }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) throw new Error("Usuario no encontrado");

    const now = Date.now();
    await ctx.db.patch(user._id, { mustSetPassword: false, updatedAt: now });

    if (logAudit) {
      await ctx.db.insert("auditLogs", {
        userId: clerkId,
        action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
        createdAt: now,
      });
    }
  },
});
```

Comprueba que `AUDIT_ACTIONS` esté importado en `convex/users.ts` (lo está, líneas 5-10).

- [ ] **Paso 3: Añadir `setInitialPassword`**

También en `convex/users.ts`. Es una **action** y este módulo no lleva `"use node"` — no hace falta: Better Auth corre en el runtime V8, como demuestra `convex/http.ts`.

```ts
/**
 * Define la PRIMERA contraseña del usuario que ya tiene sesión.
 *
 * `auth.api.setPassword` es `serverOnly` en Better Auth: no está expuesto por
 * HTTP, así que no existe `authClient.setPassword` y tiene que llamarse desde
 * acá. `authComponent.getAuth` arma los headers de la sesión actual a partir de
 * `identity.sessionId` — es la forma soportada de llamar a un endpoint con
 * sesión desde una función de Convex.
 *
 * Nota para quien mantenga convex/auth.ts: `getHeaders` depende de que
 * `sessionId` esté en el payload del JWT. Lo inyecta el plugin de Convex
 * DESPUÉS de esparcir nuestro `definePayload`, así que sobrevive aunque ese
 * callback no lo mencione. No lo quites.
 *
 * `setPassword` lanza PASSWORD_ALREADY_SET si la cuenta ya tiene contraseña, y
 * ese error SE CAPTURA. Si se dejara propagar sería un bloqueo permanente:
 * alguien con el flag puesto puede abrir /forgot-password en otra pestaña (es
 * ruta pública), definir su contraseña por ahí, volver, y quedar rebotando
 * para siempre contra una pantalla que no puede completar.
 */
export const setInitialPassword = action({
  args: { newPassword: v.string() },
  handler: async (ctx, { newPassword }): Promise<{ alreadyHadPassword: boolean }> => {
    const user = await getCurrentUserFromAction(ctx);

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

    let alreadyHadPassword = false;
    try {
      await auth.api.setPassword({ body: { newPassword }, headers });
    } catch (err) {
      // El APIError de Better Auth lleva el código en `body.code`; esa es la
      // vía buena. El texto del mensaje es el respaldo por si el error llega
      // envuelto y pierde el cuerpo. Cualquier otro fallo (contraseña corta,
      // sesión inválida) se vuelve a lanzar para que el usuario lo vea.
      const codigo = (err as { body?: { code?: string } })?.body?.code;
      const mensaje = err instanceof Error ? err.message : String(err);
      const yaTenia =
        codigo === "PASSWORD_ALREADY_SET" ||
        /PASSWORD_ALREADY_SET/.test(mensaje) ||
        /already\s*set/i.test(mensaje);
      if (!yaTenia) throw err;
      alreadyHadPassword = true;
    }

    await ctx.runMutation(internal.users.clearMustSetPassword, {
      clerkId: user.clerkId,
      logAudit: !alreadyHadPassword,
    });

    return { alreadyHadPassword };
  },
});
```

Comprueba los imports de `convex/users.ts` y añade lo que falte: `action` de `./_generated/server`, `internal` de `./_generated/api`, `getCurrentUserFromAction` de `./lib/auth`, y `authComponent` + `createAuth` de `./auth`.

Si importar `./auth` desde `./users` crea un ciclo (`auth.ts` importa `internal.auth`, no `users`), no debería. Si `npx convex codegen` se queja de dependencia circular, **detente y avisa**: la salida sería mover `setInitialPassword` a su propio módulo `convex/password.ts`.

- [ ] **Paso 4: Verificación**

Run: `npx convex codegen && pnpm typecheck && pnpm lint && pnpm test`

No hay prueba manual útil todavía: la pantalla que llama a `setInitialPassword` llega en la Tarea 9, y el flag no lo lee nadie aún. Eso es intencional — desplegar esta tarea sola no cambia nada para ningún usuario.

Avisa al usuario de que la Tarea 8 está lista para commitear.

---

### Tarea 9: Pantalla `/definir-password` y guard

Cierra el círculo. **Después de esta tarea, todo usuario nuevo pasa por aquí obligatoriamente**, así que las pruebas manuales del final no son opcionales.

**Archivos:**
- Crear: `src/app/(setup)/layout.tsx`
- Crear: `src/app/(setup)/definir-password/page.tsx`
- Crear: `src/components/auth/SetInitialPasswordForm.tsx`
- Modificar: `src/components/layout/AuthGuard.tsx`

**Interfaces:**
- Consume: `api.users.setInitialPassword` (Tarea 8)
- Consume: `me.mustSetPassword` de `api.users.getMe`, al que llega solo por ser un campo de la fila (Tarea 3)

- [ ] **Paso 1: Crear el grupo `(setup)` con su layout**

`src/app/(setup)/layout.tsx`. Un grupo propio y no `(app)`: esta pantalla no debe tener Sidebar, BottomNav, Header ni `AppDataProvider` — es una pantalla de paso, no parte de la app. Que esté fuera de `(app)` también evita dos bucles: `AuthGuard` no la envuelve, así que no hay que exceptuarla de su redirect ni añadirla a las rutas que ese guard le permite a un admin.

```tsx
import { redirect } from "next/navigation";
import { authNextJs } from "@/lib/auth-server";

/**
 * Marco de las pantallas de paso: con sesión, pero fuera de la app.
 *
 * Solo comprueba la sesión. El marco visual lo pone AuthShell en cada página,
 * igual que en el grupo (auth). No se valida nada más acá —si el usuario está
 * activo, si existe su fila— porque esta pantalla tiene que ser alcanzable
 * justo cuando AuthGuard está mandando a alguien hacia ella.
 */
export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await authNextJs.isAuthenticated())) redirect("/login");
  return <>{children}</>;
}
```

- [ ] **Paso 2: Crear la página**

`src/app/(setup)/definir-password/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { SetInitialPasswordForm } from "@/components/auth/SetInitialPasswordForm";

export const metadata: Metadata = { title: "Define tu contraseña" };

export default function SetInitialPasswordPage() {
  return (
    <AuthShell
      title="Define tu contraseña"
      subtitle="Un último paso antes de entrar"
    >
      <SetInitialPasswordForm />
    </AuthShell>
  );
}
```

- [ ] **Paso 3: Crear el formulario**

`src/components/auth/SetInitialPasswordForm.tsx`. Sigue a `ResetPasswordForm`: `PasswordInput`, `PasswordStrengthMeter`, y el envío bloqueado hasta que `passwordStrength().valid`.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AuthAlert, PasswordInput } from "./AuthFields";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { passwordStrength } from "@/lib/passwordStrength";
import { errorMessage } from "@/lib/errorMessage";

export function SetInitialPasswordForm() {
  const router = useRouter();
  const setInitialPassword = useAction(api.users.setInitialPassword);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordStrength(password);
  const coinciden = confirm === "" || password === confirm;
  const puedeEnviar = strength.valid && password === confirm && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeEnviar) return;

    setError(null);
    setLoading(true);
    try {
      const { alreadyHadPassword } = await setInitialPassword({ newPassword: password });
      if (alreadyHadPassword) {
        // No es un fallo: esta persona ya había definido su contraseña por
        // «¿olvidaste tu contraseña?». El flag ya se limpió, así que puede
        // pasar — pero la que vale es la otra, y hay que decírselo.
        toast.info("Ya tenías una contraseña definida. Entra con esa.");
      } else {
        toast.success("Contraseña definida");
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "No se pudo definir la contraseña. Inténtalo de nuevo."));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
      <p className="text-sm text-muted-foreground">
        Entraste con un enlace de acceso. Define una contraseña para poder entrar
        con tu correo a partir de ahora.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña nueva</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          autoFocus
          required
          disabled={loading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="fuerza"
        />
        <PasswordStrengthMeter id="fuerza" strength={strength} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Repite la contraseña</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          required
          disabled={loading}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {!coinciden && (
          <p className="text-xs text-danger" role="alert">
            Las contraseñas no coinciden.
          </p>
        )}
      </div>

      {error && <AuthAlert>{error}</AuthAlert>}

      <Button
        type="submit"
        size="lg"
        disabled={!puedeEnviar}
        className="h-11 w-full gap-2 rounded-xl font-semibold"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound className="size-4" aria-hidden="true" />
        )}
        {loading ? "Guardando…" : "Guardar y entrar"}
      </Button>
    </form>
  );
}
```

- [ ] **Paso 4: Añadir el guard a `AuthGuard`**

En `src/components/layout/AuthGuard.tsx`, copiando el patrón de `isAdminOnRestrictedRoute` que ya está ahí.

Debajo de la declaración de `isAdminOnRestrictedRoute`:

```ts
  // Contraseña obligatoria. Va acá y NO en un guard de servidor en
  // (app)/layout.tsx por un problema de orden: en el primer login de alguien,
  // su fila de `users` todavía no existe cuando el layout renderiza —la crea
  // ensureExists, desde este mismo componente—, así que un getMe de servidor
  // leería null y no redirigiría. Este componente está suscrito a getMe, así
  // que ve el flag en cuanto la fila se crea.
  const mustSetPassword = me != null && me.active === true && me.mustSetPassword === true;
```

Junto al `useEffect` que ya existe para el guard de rol:

```ts
  useEffect(() => {
    if (mustSetPassword) router.replace("/definir-password");
  }, [mustSetPassword, router]);
```

Y en el render, **antes** de `if (isAdminOnRestrictedRoute) return <AppShellSkeleton />;`:

```ts
  if (mustSetPassword) return <AppShellSkeleton />;
```

**Y —esto es lo importante— hay que desactivar el guard de rol mientras el flag esté puesto.** Ordenar los `return` no basta: los dos `useEffect` se disparan en el mismo commit, así que un admin nuevo en `/dashboard` cumple las dos condiciones y lanza `replace("/admin")` y `replace("/definir-password")` a la vez, con el ganador decidido por el orden de los efectos. Modifica la condición que ya existe:

```ts
  const isAdminOnRestrictedRoute =
    me != null &&
    me.active === true &&
    me.role === "admin" &&
    // La contraseña obligatoria manda sobre el guard de rol: sin esto, los dos
    // efectos compiten por el redirect y un admin nuevo rebota entre /admin y
    // /definir-password.
    me.mustSetPassword !== true &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/perfil");
```

No hace falta exceptuar `/definir-password` del redirect: esa ruta vive en el grupo `(setup)`, que `AuthGuard` no envuelve.

- [ ] **Paso 5: Probar el camino completo, de punta a punta**

Este es el momento en que la funcionalidad existe entera. Con `pnpm dev` y `pnpm dev:convex`:

1. En incógnito, solicita acceso desde `/solicitar-acceso` con un correo tuyo real sin cuenta.
2. Como admin, apruébala en `/admin`.
3. Abre el magic link del correo (en incógnito).
4. Esperado: entras y **te lleva solo** a `/definir-password`. No se ve Sidebar, ni BottomNav, ni Header.
5. Intenta navegar a mano a `http://localhost:3000/dashboard`. Esperado: te devuelve a `/definir-password`.
6. Define una contraseña. Esperado: toast de éxito y aterrizas en `/dashboard`, ya con la app completa.
7. Cierra sesión y entra con correo + esa contraseña. Esperado: entra directo al dashboard, **sin** pasar por `/definir-password`.

- [ ] **Paso 6: Probar el caso de bloqueo**

El que motivó capturar `PASSWORD_ALREADY_SET`:

1. Repite los pasos 1-3 con otro correo, hasta quedar parado en `/definir-password`.
2. En **otra pestaña**, ve a `/forgot-password` y pide el enlace para ese mismo correo.
3. Define la contraseña desde el correo de restablecimiento.
4. Vuelve a la primera pestaña y define una contraseña ahí también.
5. Esperado: **no** se queda atascado. Sale el aviso «Ya tenías una contraseña definida. Entra con esa.» y entra al dashboard.
6. Comprueba cuál contraseña vale: la del paso 3. Cierra sesión y entra con ella.

Si en el paso 5 se queda en la pantalla con un error, el `catch` de `setInitialPassword` no está reconociendo el mensaje de Better Auth. Registra el mensaje real con un `console.error` y ajusta la expresión regular.

- [ ] **Paso 7: Comprobar que no atrapó a nadie más**

El riesgo de esta tarea es encerrar a usuarios que ya existían.

1. Entra con tu propia cuenta de siempre. Esperado: entra normal, **sin** pasar por `/definir-password`.
2. En el dashboard de Convex, tabla `users`: los usuarios anteriores tienen `mustSetPassword` en `undefined`, no en `true`.
3. Comprueba que un **admin** nuevo también pasa por la pantalla, y que al terminar aterriza donde le corresponde y no rebotando entre `/admin` y `/definir-password`.

- [ ] **Paso 8: Verificación**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Avisa al usuario de que la Tarea 9 está lista para commitear y de que la funcionalidad está completa.

---

## Después del plan

- `docs/` no se actualiza en ninguna tarea a propósito: `CLAUDE.md` describe el sistema de invitaciones y habrá que añadirle el camino de solicitud. Hazlo en un cambio aparte, cuando las nueve tareas estén commiteadas, para que refleje lo que quedó y no lo que se planeó.
- `migrations:normalizeUserEmails` se corre **una vez en cada entorno**, incluido producción, antes de desplegar la Tarea 6. Es idempotente, así que repetirla no hace daño.
- La tabla `registrationRequests` crece sin podarse. Si algún día molesta, una limpieza de solicitudes resueltas con más de un año es un cron aparte; hoy no hace falta.
