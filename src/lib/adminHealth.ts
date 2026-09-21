/**
 * Reglas del panel de administración que deciden algo.
 *
 * Viven aquí, puras y sin Convex, porque este repositorio no tiene forma de
 * testear funciones de Convex y estas son justo las reglas en las que
 * equivocarse significa pintar de verde algo que está roto.
 */

import { STATS_COUNT_CAP, STATS_COUNT_CAP_LABEL } from "./constants";

/**
 * Cada cuánto se refresca `users.lastSeenAt`.
 *
 * `ensureExists` corre en cada carga de la app tras autenticarse. Sin
 * acelerador habría una escritura por montaje, y como `getMe` está suscrita a
 * esa fila, cada carga empujaría una actualización a todos sus suscriptores.
 */
export const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000; // 1 hora

export function shouldRefreshLastSeen(
  previous: number | undefined,
  now: number,
): boolean {
  if (previous === undefined) return true;
  // Una marca en el futuro solo puede venir de un reloj desajustado; se
  // reescribe para que no bloquee las actualizaciones hasta que el futuro llegue.
  if (previous > now) return true;
  return now - previous > LAST_SEEN_THROTTLE_MS;
}

export type HealthStatus = "ok" | "late" | "failed" | "unknown";

/**
 * Margen FIJO sobre la periodicidad antes de dar un job por atrasado.
 *
 * Antes era un factor multiplicativo (`everyMs * 2`), y eso hacía que el margen
 * creciera con el periodo justo donde más caro sale perder una ejecución: un
 * job mensual no se marcaba atrasado hasta los 62 días. El camino real:
 * `captureNetWorth` falla el 1 de octubre, su transacción revierte y no deja
 * fila; el 2 de octubre la última es del 1 de septiembre (31 días, muy por
 * debajo de 62) y el panel dice «Al día»; el 1 de noviembre corre bien y tapa
 * el hueco. El mes de patrimonio perdido —irrecuperable, porque los snapshots
 * no se recalculan hacia atrás— no aparecía nunca. Vigilar eso es lo único que
 * justificaba construir el latido.
 *
 * Con un margen fijo el umbral real es `everyMs + 48 h`, no 48 h a secas, y lo
 * que se detecta con UNA sola ausencia depende de la periodicidad:
 *
 * - Mensual (`captureNetWorth`, `rolloverBudgets`, `sendMonthlySummary`):
 *   umbral de 33 días. Una sola falta —el caso irrecuperable de
 *   `captureNetWorth` que motivó este cambio— se marca atrasada entre dos y
 *   cinco días después de la fecha en que debía correr (varía porque
 *   `everyMs` está fijo en 31 días y los meses reales van de 28 a 31), mucho
 *   antes de que la ejecución del mes siguiente tape el hueco.
 * - Semanal (`sendWeeklySummary`): umbral de 9 días. Una sola falta también
 *   se detecta, con el mismo margen de dos días de retraso.
 * - Diaria (los cinco jobs con `everyMs` de 24 h): umbral de 72 h. Una falta
 *   AISLADA nunca se detecta por este camino —la ejecución del día siguiente
 *   escribe fila nueva y resetea el reloj antes de cruzar el umbral (a lo
 *   sumo 48 h de hueco)— y hacen falta TRES faltas seguidas para que el hueco
 *   supere las 72 h y el estado pase a "atrasado".
 *
 * Este aflojamiento del caso diario frente al factor multiplicativo anterior
 * se aceptó a conciencia: los siete jobs que pasan por el despachador de
 * `convex/cronRuns.ts` registran su fila con `ok: false` en el momento mismo
 * en que fallan, así que para ellos el camino "atrasado" nunca es la primera
 * señal, solo la red de seguridad para cuando no queda fila en absoluto (el
 * proceso murió antes de poder registrar nada). En la práctica esa red de
 * seguridad solo importa para los dos únicos jobs que no pasan por el
 * despachador y registran su propio latido —`captureNetWorth` y
 * `rolloverBudgets`, los dos mensuales de `JOBS_CON_LATIDO_PROPIO` en
 * `convex/lib/cronJobs.ts`— que es justo donde el margen fijo mejora la
 * detección respecto al factor multiplicativo que reemplazó.
 */
export const CRON_GRACE_MS = 48 * 60 * 60 * 1000;

export interface CronRunSummary {
  finishedAt?: number;
  ok: boolean;
}

/**
 * Acepta `null` además de `undefined` a propósito: `api.admin.getOverview`
 * devuelve `crons[job.id] ?? null` porque Convex descarta las propiedades
 * `undefined` al serializar el resultado de una query.
 */
export function cronHealth(
  last: CronRunSummary | null | undefined,
  everyMs: number,
  now: number,
): HealthStatus {
  // `unknown` es un estado de primera clase: recién desplegado ningún job ha
  // corrido, y decirlo es más honesto que pintarlo todo en verde.
  if (!last || last.finishedAt === undefined) return "unknown";
  if (!last.ok) return "failed";
  // El límite es inclusivo hacia "ok": justo en `everyMs + CRON_GRACE_MS`
  // todavía no es una incidencia, solo pasado ese punto se considera atrasado.
  return now - last.finishedAt > everyMs + CRON_GRACE_MS ? "late" : "ok";
}

/**
 * El cron de tasas corre cada 24 h; 26 deja margen sin tapar un fallo real.
 *
 * Exportada porque `RatesHealthCard` la reutiliza para contar cuántos pares
 * están rancios: es el mismo corte de "al día" que aplica `rateFreshness`,
 * pero por par individual en vez de sobre el peor caso. Ese conteo se hace en
 * el cliente a propósito —`convex/admin.ts::getOverview` devuelve los pares
 * crudos— porque una query de Convex no se reevalúa con el paso del tiempo y
 * el número se congelaría justo cuando el cron muere.
 *
 * MATIZ sobre "el reloj del cliente": las tarjetas del panel congelan
 * `Date.now()` AL MONTAR (`useState(() => Date.now())`, porque llamarlo en el
 * render rompería la pureza del componente). Ese reloj congelado no avanza
 * solo. Lo que garantiza es coherencia interna: el punto de estado y las
 * cifras derivadas de él salen del mismo instante, así que no pueden
 * contradecirse entre sí. Lo que NO garantiza es frescura: `formatRelative`
 * usa un `Date.now()` vivo, así que las fechas relativas y el estado pueden
 * separarse con el tiempo, y el panel envejece hasta que se recarga la página.
 */
export const RATE_OK_MS = 26 * 60 * 60 * 1000;
const RATE_LATE_MS = 48 * 60 * 60 * 1000;

export function rateFreshness(updatedAt: number | undefined, now: number): HealthStatus {
  if (updatedAt === undefined) return "unknown";
  const age = now - updatedAt;
  // Ambos límites son inclusivos hacia el estado mejor: exactamente 26 h
  // sigue siendo "ok" y exactamente 48 h sigue siendo "late", no "failed".
  if (age <= RATE_OK_MS) return "ok";
  if (age <= RATE_LATE_MS) return "late";
  return "failed";
}

/** Sin entrar durante este tiempo, la cuenta se considera dormida. */
export const DORMANT_MS = 30 * 24 * 60 * 60 * 1000;

export type ActivityStatus = "active" | "dormant" | "unknown";

/**
 * Actividad de una cuenta, en TRES estados y no en un booleano.
 *
 * El booleano anterior (`isDormant`) obligaba a decidir entre "dormida" y "en
 * uso" incluso cuando no había con qué: `listForAdmin` proyectaba
 * `transactionCount: s?.counts.transactions ?? 0`, así que un usuario sin fila
 * en `userStats` —entre el despliegue y el primer recálculo, TODOS— entraba
 * aquí con un 0 que el propio panel declaraba no haber calculado, y salía
 * clasificado como "dormido". Afirmar algo a partir de un dato que se sabe
 * inexistente es exactamente lo que este panel no puede hacer.
 *
 * Por eso `transactionCount` ahora puede ser `undefined` y hay un tercer
 * estado en vez de un valor por defecto: la ignorancia se propaga hasta la
 * interfaz, que la dice, en lugar de disfrazarse de cero por el camino.
 *
 * - `active`  — entró dentro del umbral, o nunca entró pero dejó movimientos
 *               (prueba de que usó la app antes de que existiera `lastSeenAt`).
 * - `dormant` — entró hace más del umbral, o nunca entró y tiene 0 movimientos
 *               CONTADOS.
 * - `unknown` — nunca entró y no hay contadores calculados: no se sabe.
 *
 * Con `lastSeenAt` definido el conteo es irrelevante: la fecha de acceso ya
 * responde la pregunta sola, así que ahí nunca sale `unknown`.
 */
export function activityStatus(
  lastSeenAt: number | undefined,
  transactionCount: number | undefined,
  now: number,
): ActivityStatus {
  if (lastSeenAt === undefined) {
    if (transactionCount === undefined) return "unknown";
    return transactionCount === 0 ? "dormant" : "active";
  }
  // El límite es inclusivo hacia "activo": justo en `DORMANT_MS` todavía no
  // se considera dormida, solo al superarlo.
  return now - lastSeenAt > DORMANT_MS ? "dormant" : "active";
}

/**
 * Formatea un conteo de `userStats` sin mentir en ninguno de los dos sentidos.
 *
 * Estaba copiado tres veces (`UserRow`, `UserUsageCard`, `VolumeCard`), dos de
 * ellas correctas y una no: `UserRow` miraba solo `capped` y escribía
 * «10.000+ movimientos» para un usuario con 3 movimientos y 10.000 cuotas,
 * porque `capped` se enciende si CUALQUIERA de las quince tablas del usuario
 * topó, no la que se está mostrando.
 *
 * El `&& n >= STATS_COUNT_CAP` es lo que lo arregla: una cifra topada queda
 * clavada exactamente en el tope, así que `n >= cap` es condición NECESARIA
 * (nunca suficiente) para que esa tabla esté afectada. Por debajo del tope el
 * número es siempre exacto; en el tope o por encima se marca como topado solo
 * si además hubo algún tope real. Conservador, nunca al revés.
 */
export function formatStatCount(n: number, capped: boolean): string {
  if (capped && n >= STATS_COUNT_CAP) return STATS_COUNT_CAP_LABEL;
  return n.toLocaleString("es-CO");
}
