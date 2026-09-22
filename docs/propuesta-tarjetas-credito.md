# Propuesta: rediseño de tarjetas de crédito

Estado (2026-09-22, v4): **fases 1, 2 y 3 implementadas (sin commitear). La migración de la fase 3 está escrita pero NO se ha corrido.** Modelo objetivo: **Money Manager**, más lo que nos diferencia, que son **los intereses calculados automáticamente**. Decisiones tomadas: D1-B, y D3, D4 y D5 según la recomendación (D3 y D4 quedan para la fase 4). Lo hecho está en la sección 11.

## Resumen

- **La tarjeta pasa a ser una cuenta para el usuario:** aparece en la misma lista, con saldo negativo, y se paga solo desde el botón «Pagar» de la tarjeta. Por dentro sigue en su propia tabla (D5): funciona igual que una cuenta sin mover las tarjetas a la tabla de cuentas.
- **El saldo se muestra como en Money Manager**, en tres cifras: **por pagar** (el extracto ya cerrado), **en curso** (lo que va del ciclo abierto) y **cuotas por facturar**. El cupo disponible descuenta las tres.
- **Okany ya tiene cerca del 70 % del modelo de Money Manager:** corte y día de pago, cuotas repartidas mes a mes, y la deuda de la tarjeta dentro del patrimonio neto. Además tiene algo que Money Manager no tiene: el calendario de cuotas separado en capital e interés.
- **Cuánto hay que cambiar:** unos 25 archivos, en 4 fases, de las cuales solo la migración de datos es de riesgo alto. Mover las tarjetas a la tabla de cuentas tocaría más de 55 archivos, y el usuario no vería la diferencia.

## 1. Por qué

Las dos categorías de sistema («Pago de tarjeta» y «Gastos financieros») nacieron para tapar huecos del modelo de tarjetas, y los huecos siguen ahí:

- **«Pago de tarjeta»** solo sirve de etiqueta en la lista de movimientos: `pago_tarjeta` no suma a gasto ni a presupuesto (`convex/lib/txClassification.ts`). Pero los selectores de categoría no la filtran, así que un usuario puede registrar un `gasto` normal con ella y contar su tarjeta dos veces.
- **«Gastos financieros»** nunca se asigna a una transacción: solo acumula en el presupuesto el interés de cada cuota. Los reportes, en cambio, cargan la cuota entera (capital + interés) en la categoría de la compra. El presupuesto y los reportes dan cifras distintas para el mismo mes.

Y en el modelo de tarjetas en sí:

| # | Problema | Dónde |
|---|---|---|
| P0 | **La tarjeta no se presenta como una cuenta.** Pestaña aparte en Productos y deuda en positivo. En todas las apps del mercado la tarjeta es una cuenta más. | `productos/page.tsx`, `CardRow`, `CardHero` |
| P1 | Los intereses de todo el plazo se suman a la deuda el día de la compra. Adelantar el pago no ahorra nada. | `cardPurchases.createPurchase` → `currentBalance += totalWithInterest` |
| P2 | Las fechas de las cuotas no dependen del corte ni del día de pago: son la primera fecha que elige el usuario más N meses. | `addMonths(firstInstallmentDate, n)` |
| P3 | El «pago mínimo» significa dos cosas distintas: cuotas del ciclo en curso en un sitio y cuotas del ciclo cerrado en otro. | `cards.getPaymentSummary` vs `cards.getCardDetailData` |
| P4 | Un abono que no cubre una cuota entera no queda en ninguna cuota: `paid` es booleano. | `recomputeInstallmentsPaid` |
| P5 | No hay forma de registrar cuota de manejo, seguros ni otros cargos del banco. En Colombia son casi universales. | — |
| P6 | Presupuesto (capital/interés por separado) y reportes (cuota completa) no cuadran. | `applyBudgetDelta` vs `spendingByCategory` |
| P7 | El saldo es una sola cifra. No distingue lo que hay que pagar en este extracto de lo que va del ciclo abierto ni de lo que queda en cuotas. | `cards.currentBalance` |

## 2. Cómo lo hacen otras apps

**Sobre las fuentes:** esto sale de la documentación pública indexada (centros de ayuda y fichas de las tiendas). Los artículos de ayuda de Realbyte y BudgetBakers devolvieron 403 al abrirlos, así que solo tengo los extractos que muestra el buscador. Lo que no pude confirmar aparece como «no confirmado».

| Aspecto | **Okany hoy** | **Money Manager** (Realbyte) | **Wallet** (BudgetBakers) | **YNAB** | **Money Lover** |
|---|---|---|---|---|---|
| Qué es la tarjeta | Entidad aparte (`cards`), no es una cuenta | **Cuenta** de tipo *Card*, con cuenta de cobro asociada | **Cuenta** de crédito | **Cuenta** de crédito | *Credit wallet* (una **cuenta**) |
| Saldo | Una cifra: deuda en positivo + cupo disponible | **Dos cifras:** por pagar (*payable*, el extracto cerrado) y en curso (*outstanding*, el ciclo abierto) | Se elige: cupo disponible (positivo) o deuda (negativo) | Deuda (negativo) | Deuda (negativo) |
| Ciclo | `cutoffDay` + `paymentDay`, pero las cuotas no los usan | **Día de corte + día de pago**: separa lo del extracto de lo que va al siguiente | Fecha límite de pago | No modela el ciclo | Día del extracto + día límite de pago; aviso 5 días antes |
| Compra | Una `gasto_tarjeta` **por cuota**, con fecha futura | Gasto en la cuenta de la tarjeta | Gasto en la cuenta de crédito | Gasto el día de la compra, en su categoría | Gasto en la *credit wallet* |
| Cuotas | Sí: calendario con capital e interés | **Sí: el total se reparte en cuotas iguales**, una por mes (300 en 3 → 100 cada mes), según el ciclo | No confirmado | No (modelo EE. UU.) | No confirmado |
| Intereses | Calculados al comprar y sumados a la deuda de una vez | No confirmado | No confirmado (en la práctica se registran a mano) | Se registran a mano como gasto | No confirmado |
| Pago | Tipo propio `pago_tarjeta` + categoría de sistema | **Automático:** el día de pago se descuenta de la cuenta de cobro | Transferencia cuenta → tarjeta (la recomendación sale de un blog de terceros, no de la documentación oficial) | Transferencia cuenta → tarjeta | Transferencia a la *credit wallet* |
| ¿El pago es gasto? | No (bien), pero lleva categoría | No | No | No | No |
| Categoría para el pago | «Pago de tarjeta» (sistema) | Ninguna: es transferencia | Ninguna: es transferencia | Categoría automática *Credit Card Payment* por tarjeta (es un **sobre de presupuesto**, no un gasto) | Ninguna |

**Qué se saca de la comparación:**

1. **Todas presentan la tarjeta como una cuenta.** Okany es la excepción (P0). Es lo que más se nota al usar la app.
2. **Nadie trata el pago como gasto ni le pone una categoría de gasto.** Es un movimiento de dinero entre dos cuentas tuyas. Okany ya acierta en que no es gasto; lo que sobra es la categoría.
3. **Money Manager es el modelo más parecido a lo que necesitamos:** viene de Corea, donde comprar a cuotas es tan común como en Colombia. Reparte la compra en gastos mensuales (igual que Okany), ata las cuotas al corte y al día de pago (Okany no) y separa el saldo en por pagar y en curso (Okany no).
4. **Ninguna app confirma que calcule intereses sola.** Lo habitual es registrarlos a mano desde el extracto. **Ese es el plus de Okany**, siempre que se calculen bien (P1). Ninguna de las comparadas deja ver, por ejemplo, cuánto interés se ahorra abonando a capital.

## 3. Lo que Okany ya tiene del modelo de Money Manager

| Pieza de Money Manager | Okany | Estado |
|---|---|---|
| Día de corte y día de pago | `cards.cutoffDay`, `cards.paymentDay` | ✅ Existe (falta usarlo en las cuotas) |
| Cuotas repartidas por mes | `cardInstallments` + una `gasto_tarjeta` por cuota | ✅ Existe |
| Deuda de la tarjeta en el patrimonio neto | `accounts.overview`, `netWorthSnapshots` | ✅ Existe |
| Recordatorio antes del vencimiento | notificación `cuota_proxima` (3 días antes, por cuota; el tipo `pago_tarjeta_proximo` existe pero nadie lo envía) | 🟡 Existe por cuota, no por extracto |
| Incluir o excluir del saldo total | `cards.includeInBalance` | ✅ Existe |
| La tarjeta se ve como una cuenta | — | ❌ Falta (P0) |
| Saldo por pagar / en curso | — | ❌ Falta (P7) |
| Cuotas atadas al ciclo | — | ❌ Falta (P2) |
| Cuenta de cobro + pago automático | — | ❌ Falta |
| El pago no es gasto (movimiento entre cuentas) | `pago_tarjeta` con categoría | 🟡 Casi: sobra la categoría |
| **Capital e interés por cuota** | `principalAmount`, `interestAmount` | ⭐ **Okany lo tiene y Money Manager no.** Es la base de los intereses automáticos. |

## 4. Principios del nuevo modelo

1. **La tarjeta se ve y se comporta como una cuenta**: misma lista y saldo con signo. El pago mueve dinero entre dos cuentas, pero solo se hace desde la tarjeta.
2. **La deuda de la tarjeta es solo lo que se debe hoy:** capital pendiente más intereses y cargos ya cobrados. Nunca intereses futuros.
3. **Cada peso tiene un solo sitio en los reportes.** El capital va en la categoría de la compra y el interés en «Gastos financieros», como transacciones reales. Presupuesto y reportes leen de las mismas filas.
4. **El pago mueve dinero, no es gasto.** Sin categoría.
5. **Las fechas salen del ciclo de la tarjeta**, no de lo que el usuario escriba.
6. **El saldo, el pago mínimo, el pago total y el extracto se calculan en una sola función con tests** (`convex/lib/cardStatement.ts`), como ya se hizo con `adminHealth.ts`.

## 5. El modelo propuesto

### 5.1 La tarjeta como cuenta

- **Productos:** tarjetas y cuentas en una sola lista, agrupadas por tipo (Efectivo, Bancos, Ahorros, Inversión, **Tarjetas de crédito**), como en Money Manager. Se quitan las pestañas «Cuentas / Tarjetas».
- **Saldo con signo:** la deuda se muestra en negativo (−1.224.000), como en todas las apps comparadas. El cupo disponible va como dato secundario. Opción por tarjeta, al estilo de Wallet, para ver primero el cupo disponible.
- **Cuenta de cobro:** campo nuevo `cards.billingAccountId` (opcional). Es la cuenta que sale preseleccionada al pagar, y la necesaria para el pago automático (D3).
- **Las tarjetas NO aparecen en el formulario de transferencia.** Aunque por dentro pagar una tarjeta sea mover dinero entre dos cuentas, la única forma de hacerlo es el botón «Pagar» de la tarjeta (5.5). Así el pago pasa siempre por el mismo sitio, que aplica el tope de la deuda, el orden de aplicación y el reparto entre cuotas, y nadie confunde «transferir» con «pagar».
- **Por dentro:** `cards` sigue siendo su propia tabla. Ver D5.

### 5.2 El saldo, en tres cifras

| Cifra | Qué es | Cómo se calcula |
|---|---|---|
| **Por pagar** | Lo del extracto ya cerrado que falta pagar (el *payable* de Money Manager) | Cuotas, intereses y cargos facturados en el último corte − pagos hechos desde ese corte |
| **En curso** | Lo que va del ciclo abierto y entra en el próximo extracto (el *outstanding*) | Compras de 1 cuota y cargos registrados desde el último corte |
| **Cuotas por facturar** | Capital de las cuotas futuras de compras a plazos. Money Manager no lo muestra aparte; Okany sí puede. | Σ `principalAmount` de las cuotas cuyo ciclo aún no ha cerrado |
| **Deuda total** | Lo que habría que pagar para dejar la tarjeta en cero hoy | Por pagar + en curso + cuotas por facturar. Es `cards.currentBalance`. |
| **Cupo disponible** | Lo que todavía se puede gastar | `creditLimit` − deuda total (el banco descuenta del cupo la compra entera, no solo la cuota) |

La tarjeta muestra en grande la deuda total en negativo, y debajo «Por pagar $X antes del 10 oct».

### 5.3 Compras y cuotas

- **Primera cuota** = la que se factura en el corte del ciclo en el que cae la compra. Ejemplo: corte el 25, pago el 10, compra el 22 de septiembre → se factura el 25 de septiembre → vence el 10 de octubre. Si la compra es del 27 de septiembre, va al ciclo siguiente y vence el 10 de noviembre.
- Se puede corregir la fecha a mano (algunos bancos corren un ciclo las compras a cuotas), pero por defecto la calcula la app.
- **La deuda sube solo por el capital** (`totalAmount`), no por `totalWithInterest`.
- **Cuándo aparece cada cuota como gasto** (D1-B): una compra de **1 cuota** es un gasto normal el día de la compra. En una compra **a varias cuotas**, la compra aparece enseguida en movimientos como registro padre (ya existe: `cardPurchases.listByPurchaseMonth`), y **cada cuota se registra como gasto en el corte en que se factura**, con su capital en la categoría de la compra. Es lo que hace Money Manager, y se acaban las transacciones con fecha futura.

### 5.4 Intereses automáticos (lo que nos diferencia)

Se sigue usando `gasto_tarjeta`, con un campo nuevo `cardChargeKind: "cuota" | "interes"`.

- **Interés:** en cada **corte**, un cron diario (o el mismo que ya corre a las 12:00 UTC) crea, por cada cuota que entra en ese extracto, una `gasto_tarjeta` con `cardChargeKind: "interes"`, en la categoría de intereses de la tarjeta («Gastos financieros») y con el `interestAmount` de esa cuota. El interés se suma a la deuda en ese momento. Se hace en el corte porque es cuando lo factura el banco, así que ya está incluido cuando el usuario va a pagar el extracto.
- **Ajustar al extracto:** el interés generado es una estimación. El usuario puede editar el monto para que cuadre con su extracto, y la diferencia ajusta la deuda. Ninguna de las apps comparadas lo tiene.
- **Cargos del banco** (cuota de manejo, seguro): no llevan tipo propio. Se registran como una compra de contado en «Gastos financieros», o como recurrente de la tarjeta.
- **Abono a capital** (fase 4): el usuario abona al capital de una compra, el calendario se recalcula y la app muestra el interés que se ahorra. La ley colombiana permite prepagar sin penalidad (Ley 1555 de 2012). Es la función que más aprovecha los intereses automáticos, y el modelo actual no la permite (P1).

### 5.5 Pago

- **Solo desde la tarjeta:** el botón «Pagar» de la tarjeta (en su detalle, en la lista de Productos y en el recordatorio del extracto) abre la hoja de pago con la cuenta de cobro preseleccionada y tres atajos: **mínimo**, **total** u **otro monto**. El formulario de transferencia no ofrece tarjetas.
- **En movimientos** se muestra como «Pago de Visa ····1234 desde Ahorros», con el icono de pago (`tx-type-config.ts`), no como una transferencia genérica.
- **Por dentro sigue siendo una sola fila `pago_tarjeta`, sin `categoryId`.** Convertirla en una transferencia de verdad (dos filas enlazadas) obligaría a tocar `createTransfer`, el borrado en cascada de transferencias y todas las lecturas de transferencias, para que el usuario vea lo mismo. Ver D5.
- **Orden en que se aplica el pago** (el mismo que suelen usar los bancos): (1) intereses y cargos cobrados, (2) cuotas vencidas, de la más antigua a la más nueva, (3) cuotas del extracto actual, (4) lo que sobre, a cuotas futuras.
- **Pagos parciales:** `cardInstallments.paid: boolean` pasa a `paidAmount: number`, y `paid` se deriva (`paidAmount >= amount`).
- **Pago automático** (D3): si la tarjeta tiene cuenta de cobro y el usuario lo activó, el cron del día de pago registra el pago del mínimo o del total, según lo que haya elegido.

### 5.6 Extracto (una sola definición)

Una función pura `computeStatement(card, installments, charges, payments, today)` en `convex/lib/cardStatement.ts`, con tests. Devuelve las cifras de 5.2 más:

| Cifra | Definición |
|---|---|
| **Pago mínimo** | Cuotas, intereses y cargos facturados en el último corte − lo pagado desde ese corte (es decir, «por pagar») |
| **Pago total** | La deuda total |
| **Vencido** | Pago mínimo sin cubrir cuando ya pasó el día de pago |

`getPaymentSummary` y `getCardDetailData` la usan las dos. P3 desaparece.

### 5.7 Categorías

- **«Pago de tarjeta» deja de existir como categoría.** No hace falta: el tipo `pago_tarjeta` ya da la etiqueta.
- **«Gastos financieros» pasa a ser una categoría normal** en `DEFAULT_CATEGORIES`: editable, archivable y con presupuesto propio. La tarjeta guarda su id en `cards.interestCategoryId`, así que nunca se busca por nombre, y si el usuario la renombra, la tarjeta sigue apuntando a la misma.
- El concepto `SYSTEM_CATEGORIES` y el campo `categories.isSystem` desaparecen al final de la migración.

## 6. Cuánto hay que cambiar

Estimación sobre el código actual. «Archivos» cuenta los que hay que editar, no los que solo se leen.

| Bloque | Qué cambia | Dónde (principal) | Archivos | Coste | Riesgo |
|---|---|---|---|---|---|
| **A. Arreglos inmediatos** | Sección 8 | `cards.ts`, 6 selectores de categoría, `cardPurchases.ts` | ~8 | Bajo | Bajo |
| **B. La tarjeta como cuenta (UI)** | Una lista en Productos, saldo con signo, botón «Pagar» en la fila y el detalle, hoja de pago con mínimo / total / otro monto | `productos/page.tsx`, `CardRow`, `CardHero`, `ProductsCarousel`, `CardsOverviewCard`, `PayCardSheet` | ~7 | Medio | Bajo |
| **C. Cuenta de cobro** | `billingAccountId` + selector | `schema.ts`, `cards.ts`, `CardSheet` | 3 | Bajo | Bajo |
| **D. Extracto único y saldo en tres cifras** | `computeStatement` + tests, conectado a `getCardDetailData` (`getPaymentSummary` se borró en la fase 1) y al detalle | `lib/cardStatement.ts` (nuevo), `cards.ts`, `tarjetas/[id]`, `CardCycleTabs`, `CardStatementDocument` | ~6 | Medio | Bajo |
| **E. Cuotas atadas al ciclo** | Primera cuota calculada desde el corte | `cardHelpers.ts`, `cardPurchases.ts`, `PurchaseSheet`, `CardPurchaseFields` | 4 | Medio | Medio |
| **F. Intereses automáticos** ⭐ | Deuda solo con capital; cuotas e intereses generados en el corte; `cardChargeKind`; ajustar al extracto | `cardPurchases.ts`, `crons.ts`, `cronRuns.ts`/`lib/cronJobs.ts`, `transactionEffects.ts`, `transactions.ts`, `TransactionDetail` | ~8 | **Alto** | Medio |
| **G. Pagos parciales y orden de aplicación** | `paidAmount` en vez de `paid` | `cardHelpers.ts`, `cardInstallments.ts`, detalle de cuotas | ~4 | Medio | Medio |
| **H. Categorías de sistema fuera** | «Gastos financieros» normal, «Pago de tarjeta» eliminada | `constants.ts`, `lib/utils.ts`, `seedUserData.ts`, `categories.ts`, `CategoryRow` | ~6 | Bajo | Bajo |
| **I. Migración de datos** | Sección 7 | `migrations.ts` | 1–2 | Medio | **Alto** |
| **J. Pago automático** (D3) | Paso nuevo en el cron del día de pago | `crons`, `cards.ts`, `CardSheet` | 3 | Bajo | Medio |
| **K. Abono a capital** (D4) | Recalcular el calendario de una compra | `cardPurchases.ts`, `money.ts`, nueva hoja | ~4 | Medio | Medio |

**Total sin J y K: unos 25 archivos distintos** (varios se repiten entre bloques). El único bloque de riesgo alto es la migración, porque toca saldos reales.

**Lo que NO se cambia:** la tabla `cards` y su relación con compras y cuotas; `calculateInstallment` y el cálculo capital/interés del calendario; el tipo `gasto_tarjeta` como marca interna; el modelo de cuentas compartidas.

**Orden propuesto:**

1. **A** — ya, independiente de todo.
2. **B + C + D** — la tarjeta se ve como cuenta, con el saldo de Money Manager. No toca datos, así que se puede publicar sin migrar.
3. **E + F + G + H + I** — el cambio de modelo y su migración, juntos en un solo despliegue.
4. **J + K** — cuando lo anterior lleve un tiempo estable.

## 7. Migración (fase 3 del orden)

Implementada en `convex/migrations.ts` (`migrateCardInterestModel`, que al terminar encadena `migrateLegacySystemCategories`). Idempotente y por lotes de tarjetas, con modo de ensayo (`dryRun`) que no escribe nada.

**Qué hace, por cada cuota sin migrar** (sin `interestBilling`):
- **Ya facturada** (su fecha pasó) **o ya pagada:** su `gasto_tarjeta` se queda con el capital (`cardChargeKind: "cuota"`) y se crea el movimiento de interés. La deuda no cambia: ese interés ya estaba en ella. Queda con `billedAt`.
- **Pendiente:** se borra su `gasto_tarjeta` con fecha futura (lo creará el cron en su corte), se devuelve lo que había sumado al presupuesto y **se resta su interés de la deuda**, porque el banco aún no lo cobra.
- Luego se reparten los pagos (`paidAmount`) y los pagos de la tarjeta quedan sin categoría.
- Los presupuestos se corrigen con deltas exactos (lo mismo que se sumó, en la misma categoría y mes), no recalculando desde cero.
- **Categorías:** «Gastos financieros» deja de ser de sistema y queda como `cards.interestCategoryId`. «Pago de tarjeta» se borra, junto con sus presupuestos, que nunca podían sumar nada; si algún gasto normal la usaba, se conserva como categoría normal.

**Cómo correrla** (primero en desarrollo con una copia de datos reales):
1. Respaldo con `exportMyData` de los usuarios con tarjetas.
2. Ensayo: `npx convex run migrations:migrateCardInterestModel '{"dryRun": true}'`. Revisar `reports` de cada tarjeta, sobre todo `inconsistent`.
3. De verdad: `npx convex run migrations:migrateCardInterestModel`. Se encadena sola hasta terminar.
4. Revisar a mano las tarjetas de `inconsistent`: son las que tenían pagado más que capital + intereses cobrados (se adelantó el interés de cuotas futuras). Su saldo se recorta a 0 y el excedente no queda registrado.

**Límites conocidos:** las cuotas de compras antiguas conservan sus fechas (la que se eligió + N meses), no las del corte, así que las tres cifras del saldo son aproximadas hasta que se terminen de pagar. Solo las compras nuevas quedan atadas al corte.

## 8. Arreglar ya, sin esperar al rediseño

1. **Seguridad — `cards.payCard`:** no comprueba que la cuenta de origen sea del usuario (`ctx.db.get(args.fromAccountId)` sin `assertCanWrite`), y cambia el saldo directamente en vez de usar `applyAccountDelta`. Cualquiera que conozca un `accountId` ajeno puede descontarle dinero.
2. **Filtrar `isSystem`** en los selectores de categoría: `AccountTransactionFields.tsx`, `CardPurchaseFields.tsx`, `TransactionEditForm.tsx`, `CardPurchaseEditForm.tsx`, `PurchaseSheet.tsx` y `BudgetSheet.tsx`. Hoy solo lo hace `RecurringSheet.tsx`.
3. **Interés perdido al quitar la categoría:** en `updatePurchase`, rama de cambio de categoría, el interés se resta de «Gastos financieros» y solo se vuelve a sumar si hay categoría nueva (`if (rotateCatInterestsCatId && newCatId …)`). Esa condición sobra.
4. **Unificar el pago mínimo** (P3): se puede adelantar como primer paso de `computeStatement`.

## 9. Ejemplo de principio a fin

TV de **$1.200.000 a 3 cuotas, 2 % mensual**. Tarjeta con corte el 25, pago el 10 y cupo de $5.000.000. Compra el 22 de septiembre.

| Fecha | Qué pasa | Por pagar | Cuotas por facturar | Saldo de la tarjeta | Reportes |
|---|---|---|---|---|---|
| 22 sep | Compra a 3 cuotas. Aparece en movimientos como registro padre. | 0 | 1.200.000 | −1.200.000 | Nada todavía |
| 25 sep | Corte. Se factura la cuota 1: capital 392.106 + interés 24.000 | 416.106 | 807.894 | −1.224.000 | +392.106 Entretenimiento, +24.000 Gastos financieros |
| 8 oct | Transferencia de Ahorros a la Visa por 416.106 → interés primero, luego capital | 0 | 807.894 | −807.894 | Nada: no es gasto |
| 20 oct | Abono a capital de 407.947 (fase 4) → se recalculan las 2 cuotas restantes | 0 | 399.947 | −399.947 | Nada |
| 25 oct | Corte. Cuota 2 recalculada: capital 197.995 + interés 7.999 (antes eran 16.158) | 205.994 | 201.952 | −407.946 | +197.995 Entretenimiento, +7.999 Gastos financieros |

El cupo disponible el 22 de septiembre es 3.800.000: el banco descuenta la compra entera, no solo la cuota. Con el modelo actual, la deuda habría sido 1.248.318 desde el primer día y el abono del 20 de octubre no habría cambiado los intereses.

## 10. Decisiones

**Ya decidido**
- **Intereses automáticos** (antes D2): calculados por la app a partir del calendario, con opción de ajustarlos al extracto. Es lo que nos diferencia.
- **Modelo de referencia: Money Manager.**

**D1 — ¿Cuándo cuenta como gasto una compra a cuotas?** *Alineada con Money Manager; falta que la confirmes.*
- **A. Todo el día de la compra** (YNAB, Wallet). La TV es de septiembre; una compra grande a 12 cuotas se come el presupuesto de ese mes.
- **B. Por cuota, en cada corte** (Money Manager; Okany hoy, aunque con fechas futuras). El presupuesto refleja lo que pagas cada mes, que es como piensa la mayoría en Colombia.
- **Mi recomendación: B.** Es lo que hace Money Manager, lo que ya entienden tus usuarios y lo que deja la migración más pequeña.

**D3 — ¿Pago automático el día de pago?** (lo hace Money Manager)
- **Mi recomendación: sí, pero activado por el usuario en cada tarjeta y apagado por defecto**, eligiendo si paga el mínimo o el total. En Colombia mucha gente paga a mano y con montos variables. Hasta que se construya, basta un recordatorio del extracto (el tipo `pago_tarjeta_proximo` ya existe en el esquema, sin usar) con un botón «Pagar» que abra la hoja de pago ya llena.

**D4 — ¿Abono a capital desde el principio o en una fase posterior?**
- **Mi recomendación: fase 4.** Es donde más lucen los intereses automáticos, pero primero hay que dejar cuadrados la deuda y el extracto.

**D5 — ¿La tarjeta se convierte en cuenta de verdad, o solo se ve y se comporta como una?**
- **A. Unir las tablas:** las tarjetas pasan a `accounts` con `type: "credito"`. Cada `cardId` pasa a `accountId`, `gasto_tarjeta` pasa a `gasto` y `pago_tarjeta` pasa a `transferencia` de dos filas. Pero `accounts` arrastra cosas que la tarjeta no necesita y que habría que bloquear o adaptar una por una: cuentas compartidas y sus permisos (`ownerId`, `isShared`, `assertCanWrite`), metas vinculadas a cuenta, pagos de deudas y préstamos desde una cuenta, cada suma de `accounts.balance` (que tendría que excluir los saldos negativos del «dinero disponible») y el inventario de 15 tablas de export, restablecer datos y estadísticas del panel admin. **Más de 55 archivos**, y el usuario ve exactamente lo mismo que con B.
- **B. Mismo comportamiento, tablas separadas:** `cards` sigue siendo su propia tabla, pero en la app es una cuenta: misma lista, saldo negativo y pago desde el botón «Pagar» (sección 5.1 y 5.5). **Unos 25 archivos.**
- **Mi recomendación: B.** Es lo que el usuario percibe en Money Manager, a menos de la mitad de coste y sin meter las tarjetas en el sistema de permisos de cuentas compartidas. Si algún día hace falta compartir una tarjeta, se puede unir después: B no lo impide.

## 11. Lo implementado

**Fase 1 — arreglos inmediatos (bloque A)**
- `cards.payCard` comprueba el permiso sobre la cuenta de origen (`assertCanWrite`) antes de leerla y descuenta con `applyAccountDelta`.
- `src/lib/categories.ts::selectableCategories` (con tests) filtra por tipo y quita las de sistema en los 7 selectores de categoría.
- `convex/lib/cardBudget.ts::categoryRotationDeltas` (con tests): al cambiar la categoría de una compra solo se mueve el capital; el interés ya no desaparece de «Gastos financieros» al quitar la categoría.
- `cards.getPaymentSummary` se borró: no lo usaba nadie y definía el pago mínimo de otra forma.

**Fase 2 — la tarjeta como cuenta (bloques B, C y D)**
- **D:** `convex/lib/cardStatement.ts::computeStatement` (con tests) reparte el saldo en por pagar / en curso / cuotas por facturar, más «sin detalle» para la deuda que no viene de compras (la deuda inicial). Las cuatro cifras suman `currentBalance`. `getCardDetailData` la usa: el pago mínimo es «por pagar» y ya descuenta los abonos parciales. Se mantiene la convención actual de `dueDate` (fecha en que la cuota se carga al ciclo) y el atajo «Pagar total» sin cambios; ambos cambian en la fase 3.
- **C:** `cards.billingAccountId` (opcional), validada con `assertCanWrite`, misma moneda y no archivada. Se elige en `CardSheet` («La pagas desde») y sale preseleccionada en `PayCardSheet`.
- **B:** Productos sin pestañas: cuentas agrupadas por tipo y un grupo «Tarjetas de crédito»; un solo buscador; «+» con menú Cuenta / Tarjeta de crédito; archivadas juntas. `?tab=tarjetas` lleva a la sección de tarjetas. `CardRow` muestra la deuda en negativo (`formatCardBalance`, con tests) y añade al deslizar «Pagar» y «Excluir/Sumar». `CardHero` muestra el saldo en negativo y las tres cifras. El carrusel del dashboard muestra el saldo en vez del disponible. `CardsOverviewCard` y el `EmptyState` de tarjetas se borraron: su cifra pasó a `AccountsOverviewCard` como «Debes en tarjetas / Te queda si las pagas».
- **Fuera a propósito:** `CardCycleTabs`, `CardStatementDocument` (PDF), `dueOf`, `AccountCardSelect`, la opción de ver primero el cupo disponible, y el formulario de transferencia (no ofrece tarjetas, por decisión).

**Fase 3 — el cambio de modelo (bloques E, F, G, H e I)**
- **E — cuotas atadas al ciclo:** `convex/lib/cardSchedule.ts::cuotaChargeDates` (con tests). De contado, la cuota se carga el día de la compra; a cuotas, la primera en el corte del ciclo de la compra y las demás en los cortes siguientes. El usuario ya no elige la fecha de la primera cuota (`firstInstallmentDate` se acepta pero se ignora, para no romper clientes viejos).
- **F — intereses automáticos:** la compra sube la deuda solo por el capital. Cada cuota se factura cuando llega su corte (`convex/lib/cardBilling.ts`, cron diario `billCardInstallments` a las 5:30 UTC y al comprar si ya tocaba): se crean dos movimientos, capital (`cardChargeKind: "cuota"`, en la categoría de la compra) e interés (`"interes"`, en `cards.interestCategoryId`), y el interés se suma a la deuda. El interés se puede **ajustar al extracto** editando su movimiento: la diferencia va a la deuda y al presupuesto. Ya no se crean movimientos con fecha futura.
- **G — pagos parciales:** `cardInstallments.paidAmount`. El reparto (de la cuota más antigua a la más nueva) vive en `src/lib/cardPayments.ts` (con tests) y lo usan tanto `recomputeInstallmentsPaid` como la vista previa de la hoja de pago. El atajo «Pagar total» es ahora la deuda real.
- **H — sin categorías de sistema:** «Gastos financieros» entra en `DEFAULT_CATEGORIES` y cada tarjeta guarda su id; los pagos no llevan categoría. Se borraron `getSystemPaymentCategoryId` y la creación de categorías de sistema al dar de alta.
- **I — migración:** `migrations:migrateCardInterestModel` (con `dryRun`), que encadena `migrateLegacySystemCategories`. Se quitaron las tres migraciones de tarjetas antiguas: volver a correrlas sobre el modelo nuevo recrearía cuotas con el interés incluido.
- **UI:** los formularios de compra ya no mandan la fecha de la primera cuota; la fila de un interés abre su propio detalle (donde se ajusta) en vez de la compra; una cuota o su interés no se pueden borrar sueltos.
- **Diferencias con lo planeado:**
  - Se quitó el tipo «cargo»: una cuota de manejo se registra como compra de contado en «Gastos financieros».
  - El cron va por el despachador (no con latido propio): es idempotente, así que un día perdido se factura al siguiente.
  - Los presupuestos se corrigen con deltas exactos en vez de recalcularse desde cero.
- **Pendiente:** las etiquetas «Vence» de los cronogramas muestran la fecha de cargo, no la de pago; la alerta `cuota_proxima` avisa 3 días antes del cargo. Pago automático y abono a capital son la fase 4.

## Fuentes

- Money Manager — [Cómo liquidar los pagos de tarjeta](https://help.realbyteapps.com/hc/en-us/articles/360015963554-How-to-settle-credit-card-payments), [Cuentas de tarjeta de débito y crédito](https://help.realbyteapps.com/hc/en-us/articles/360042892294-How-to-add-debit-credit-card-accounts), [Repeticiones y cuotas](https://help.realbyteapps.com/hc/en-us/articles/360046668993-How-to-set-up-a-repeat-schedule-installment)
- Wallet — [Añadir una tarjeta de crédito](https://support.budgetbakers.com/hc/en-us/articles/6950259945362-Adding-a-Credit-Card), [Transferencias bancarias](https://support.budgetbakers.com/hc/en-us/articles/7148334559762-Bank-Transfers), [Guía de inicio de terceros](https://ak33m.com/posts/budgetbakers-gettingstarted/)
- YNAB — [Tarjetas de crédito en YNAB](https://support.ynab.com/en_us/handling-credit-cards-overview-ry7cNub1s), [Pagos de tarjeta](https://support.ynab.com/en_us/credit-card-payments-a-guide-r1_506Q1j)
- Money Lover — [Gestionar tarjetas de crédito](https://moneylover.zendesk.com/hc/en-us/articles/37006112179609-How-to-manage-your-credit-cards-in-MoneyLover), [Credit wallet](https://note.moneylover.me/feature_creditwallet_en/)
