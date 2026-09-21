/**
 * Lecturas del panel de administración.
 *
 * Todo pasa por `assertAdmin`, que además de comprobar el rol valida que la
 * cuenta esté activa. Ninguna de estas queries devuelve importes, saldos ni
 * descripciones: el panel muestra agregados y metadatos, nunca datos
 * financieros de nadie.
 */

import { query } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertAdmin } from "./lib/auth";
import { CRON_JOBS, JOBS_CON_LATIDO_PROPIO } from "./lib/cronJobs";

/** Forma de una fila de `cronRuns`, tal como la devuelve `latestByJob`. */
type UltimaEjecucion = { finishedAt: number; ok: boolean; error?: string };

export const getOverview = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    rates: {
      pairs: Array<{ fromCurrency: string; toCurrency: string; updatedAt: number }>;
    };
    crons: Array<{ id: string; label: string; everyMs: number; last: UltimaEjecucion | null; selfReported: boolean }>;
  }> => {
    await assertAdmin(ctx);

    // `fetchExchangeRates` nunca lanza: cada rama de fallo (par sin datos,
    // guardia de anomalía) hace `console.error` y sigue con el resto, así
    // que su fila de `cronRuns` siempre queda con `ok: true` — el latido del
    // job no sirve para detectar un par roto. El `updatedAt` de cada par es
    // la única señal real, y por eso se devuelve CRUDO, sin agregar ni
    // clasificar nada acá.
    //
    // No es una cuestión de gusto: una query de Convex se reevalúa cuando
    // cambian los documentos que leyó, NO cuando pasa el tiempo. Si acá se
    // calculara "cuántos pares están rancios" con `Date.now()`, ese número
    // se congelaría en el momento exacto en que hace falta — si el cron de
    // tasas muere, ninguna fila de `currentExchangeRates` cambia, esta query
    // no se vuelve a ejecutar y el conteo se queda clavado (en 0, seguramente)
    // mientras el reloj del cliente sí avanza. El panel acabaría mostrando un
    // estado en rojo junto a "6 de 6 pares al día".
    //
    // Con los datos crudos, la tarjeta deriva TODO con un único reloj del
    // cliente, que congela al montar (`useState(() => Date.now())`, porque
    // llamar a `Date.now()` en el render rompería la pureza del componente).
    // Lo que eso garantiza es COHERENCIA INTERNA: el punto de estado y las
    // cifras derivadas salen del mismo instante y no pueden contradecirse
    // entre sí. Lo que NO garantiza es frescura —ese reloj no avanza solo, y
    // `formatRelative` sí usa un `Date.now()` vivo—, así que las fechas
    // relativas envejecen respecto del estado hasta que se recarga la página.
    // Los umbrales siguen viviendo en un solo sitio (`rateFreshness` /
    // `RATE_OK_MS` en src/lib/adminHealth.ts), aplicados solo del lado del
    // cliente.
    const rates = await ctx.db.query("currentExchangeRates").collect();

    // `ctx.runQuery` sí existe en el QueryCtx de esta versión de Convex
    // (1.46.0) y sí puede invocar una `internalQuery`, pero sin anotar el
    // tipo de retorno de este `handler` (y el de esta constante) TypeScript
    // cae en el ciclo clásico de Convex: el tipo de `internal.cronRuns.*`
    // viene de `api.d.ts`, que a su vez declara el tipo de este módulo, y
    // sin una anotación explícita en algún punto del ciclo no hay por dónde
    // cortarlo (TS7022/TS7023). Con las anotaciones de arriba y de abajo
    // compila limpio — mismo patrón que `adminStats.ts::recomputeNow` ya usa
    // para `ctx.runMutation`. Así se reutiliza `latestByJob` como única
    // fuente de verdad en vez de duplicar su consulta acá, y no se toca
    // ningún archivo de crons.
    const crons: Record<string, UltimaEjecucion> = await ctx.runQuery(
      internal.cronRuns.latestByJob,
      {},
    );

    // NO se leen aquí ni `users` ni `invitations`. Esta query solo alimenta
    // las tarjetas de tasas y de crons: `UsersSummaryCard` toma sus cifras de
    // `users.listForAdmin` y `PendingInvitationsCard` de
    // `listPendingInvitations`, así que devolver además esos agregados era
    // payload muerto — y caro: una query de Convex se reevalúa cuando cambian
    // los documentos que LEYÓ, de modo que leer la tabla `users` entera
    // suscribía las dos tarjetas a cada `patch` de `lastSeenAt` de cualquier
    // usuario. Con esto, solo las despiertan las tasas y los latidos de cron.

    return {
      rates: {
        pairs: rates.map((r) => ({
          fromCurrency: r.fromCurrency,
          toCurrency: r.toCurrency,
          updatedAt: r.updatedAt,
        })),
      },
      crons: CRON_JOBS.map((job) => ({
        ...job,
        last: crons[job.id] ?? null,
        // `captureNetWorth` y `rolloverBudgets` nunca escriben una fila con
        // `ok: false`: son mutations directas del cron (no pasan por el
        // despachador), así que si fallan su transacción entera revierte y
        // la fila de `cronRuns` desaparece con ella. Solo se pueden vigilar
        // por caducidad (última fila vs. `everyMs`), nunca por un booleano
        // en false — el panel necesita saber cuáles son estos para no
        // interpretar "sin fila reciente" igual que "hay una fila en false".
        selfReported: (JOBS_CON_LATIDO_PROPIO as readonly string[]).includes(job.id),
      })),
    };
  },
});

export const listPendingInvitations = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    const pending = await ctx.db
      .query("invitations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending.map((i) => ({
      id: i._id,
      email: i.email,
      role: i.role,
      invitedBy: i.invitedBy,
      createdAt: i.createdAt,
    }));
  },
});
