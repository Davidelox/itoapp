# ito · Plan de Gastos, fase 1: apuntar y ver

> Estado: **borrador para revisar con David** (17 nov 2026).
> Alcance: pestaña **Gastos** (saldo global y últimos gastos), **Añadir gasto**, **Detalle**, **Editar** e **Historial**, con tiempo real entre los dos.
> **Fuera de esta fase**: saldar y confirmar pagos (fase 2), pedir borrar con aprobación (fase 2), bote común con aportaciones y reembolsos (fase 3), pagos recurrentes (fase 4), foto del ticket, vincular a evento, sitio o plan, y gastos sin conexión (más adelante).
> Mockups: Gastos (`Dinero`), `AnadirGasto`, `DetalleGasto` e `HistorialGastos` en [ito – Mockups](https://claude.ai/artifact/Ld49n1bZM5JJwyw6o4BbJU).

---

## 1. Decisiones clave

1. **La base de datos ya hace las cuentas.** El trigger `expenses_before_write` calcula `share_m1/m2/pot_cents` (lo que mande la app se ignora), pone el 50 % en «a medias», toma el % de los ajustes en «proporcional», exige el bote activado y la moneda de la pareja. El saldo sale de `get_balance()`. La app **nunca** guarda importes calculados: solo los muestra como vista previa.
2. **La vista previa usa la misma regla de redondeo que el servidor**: `m1 = round(total × pct / 100)` (las mitades hacia arriba) y `m2 = total − m1`. En JS, `Math.round(total * pct / 100)` da lo mismo porque `pct` es entero. Vive en un único archivo (`lib/gastos/reparto.ts`) con pruebas.
3. **«Tú» y «tu pareja» en pantalla, `m1` y `m2` en datos.** Todo lo que se guarda va por hueco (`paid_by`, `split_mode`, `split_pct_m1`). La traducción está en un solo sitio: si yo soy `m2`, «tu %» = `100 − split_pct_m1` y «Solo tú» = `only_m2`.
4. **Ids del cliente.** Cada gasto nuevo lleva un `uuid` generado en la app (`expo-crypto`) y se inserta con `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`. Un doble toque o un reintento no duplican el gasto, y deja hecho el camino para los gastos sin conexión.
5. **Editar con control de versión**: `update(...).eq('id', id).eq('version', v)`. Si no toca ninguna fila, la otra persona lo cambió antes: se recarga y se avisa («{Pareja} acaba de cambiar este gasto. Revísalo y vuelve a guardar.»).
6. **Datos con TanStack Query** (`@tanstack/react-query`, una dependencia nueva). Gastos, Calendario y Mapa van a necesitar lo mismo: caché por pantalla, recarga al volver a la app, invalidar tras guardar y estados de carga y error. Hacerlo a mano en cada pantalla repetiría mucho código. **Necesita el visto bueno de David (§10).**
7. **Tiempo real**: un canal por pareja sobre `expenses` (`couple_id=eq.<id>`). Cualquier cambio invalida el saldo, los últimos gastos, el historial y el detalle abierto. La RLS ya impide que lleguen los gastos privados de la otra persona.
8. **Sin bote, sin opciones de bote.** Si `pot_enabled` es falso, no aparecen «Bote común» en «¿Quién pagó?» ni «Del bote» en «¿De quién es?». Si el bote se desactiva con el formulario abierto, el servidor responde `TW012` y se avisa.

---

## 2. Rutas

```
app/
  (tabs)/gastos.tsx           ← pestaña: saldo, últimos gastos y botón +
  gastos/
    nuevo.tsx                 ← Añadir gasto (modal a pantalla completa, cierra con ✕)
    [id].tsx                  ← Detalle
    [id]/editar.tsx           ← mismo formulario que «nuevo», con los datos cargados
    historial.tsx             ← Historial con búsqueda y filtros
```

Todas dentro de la guarda `fase === 'lista'` de `app/_layout.tsx`, junto a `(tabs)`.

---

## 3. Pantallas

### 3.1 Pestaña Gastos (mockup `Dinero`)

- **Tarjeta de saldo** (`get_balance()`), con tres estados (revisión M3):
  - «**{Pareja}** te debe **35,90 €**»;
  - «Debes **12,00 €** a **{Pareja}**»;
  - «**Estáis en paz**» (sin importe).
  - El nombre va en el color de la persona. Si hay pagos pendientes de confirmar (`awaiting_confirmation_cents`), una línea pequeña: «12,00 € pendientes de confirmar». El botón **Saldar** no aparece hasta la fase 2.
- **Bote común**: solo si está activado, una tarjeta de solo lectura con el saldo (`pot_balance_cents`). Sin «Aportar» hasta la fase 3.
- **Pagos recurrentes**: no aparece hasta la fase 4.
- **Últimos gastos**: los 5 más recientes y «Ver todos» → Historial. Cada fila tiene el icono de la categoría, el concepto, «Comer fuera · **Pagaste tú** · a medias» y el importe. Al tocarla se abre el detalle.
- **Botón +** flotante de 52 px, encima de la barra de pestañas → Añadir gasto.
- **Estado vacío** (no está en los mockups): «Aún no hay gastos. Apunta el primero y ito llevará las cuentas por vosotros.» con un botón «Añadir gasto».
- **Sin pareja todavía**: se pueden apuntar gastos. La tarjeta de saldo dice «Cuando **tu pareja** se una, aquí veréis quién debe a quién.»

### 3.2 Añadir gasto (mockup `AnadirGasto`)

De arriba abajo:

1. **Importe** grande (Fraunces 44), teclado decimal. Acepta «12,5», «1.000» y «1.000,50» (`leerEuros`, ya hecho en el paso Dinero). Máximo 1 000 000 €.
2. **Concepto**: obligatorio, hasta 120 caracteres.
3. **Categoría**: 9 chips (Hogar, Súper, Comer fuera, Ocio, Transporte, Suscripciones, Salud, Regalos, Otros).
4. **¿Quién pagó?**: Tú / {Pareja} / Bote común. Cada uno con su avatar; el bote, con un icono.
5. **¿De quién es el gasto?**: A medias · Proporcional 60/40 · Personalizado · Solo tú · Solo {Pareja} · Del bote.
   - «Proporcional» muestra el % guardado en los ajustes (`proportional_pct_m1`, visto desde quien mira).
   - «Personalizado» abre la barra con −/+ de 5 en 5 (del 0 al 100) y los importes de cada uno.
6. **Resultado en vivo** (frase del mockup): «{Pareja} te deberá 31,00 €», «Deberás 9,00 € a {Pareja}», «Gasto solo tuyo. No genera deuda», «Sale del bote común. Sin deudas», «El bote te deberá 54,30 €»…
7. **Visible para {Pareja}**: solo con «Pagaste tú» + «Solo tú», que es lo único que la base de datos deja ser privado. El valor inicial es tu preferencia `share_personal_expenses` (por defecto, no visible). En cualquier otro caso el gasto es visible siempre, porque afecta a los dos.
8. **Fecha**: «Hoy», «Ayer» u «Otro día…», que abre un calendario de un mes en una hoja inferior (componente propio: no hace falta librería y servirá para Calendario). No se aceptan fechas futuras.
9. **Guardar gasto** con el botón con nudo (`BotonNudo`). Al terminar, se cierra y se abre el detalle del gasto nuevo.

**Valores por defecto según el reparto de la pareja** (`couple_settings.default_split`):

| Reparto por defecto | ¿De quién es? | ¿Quién pagó? |
|---|---|---|
| `half` | A medias | Tú |
| `proportional` | Proporcional | Tú |
| `mixed` | «Del bote» si la categoría está en `pot_categories` (Hogar, Súper, Suscripciones); si no, A medias | **Bote común** si es «Del bote»; si no, Tú (§10, decisión 3) |
| `all_pot` | Del bote | Bote común |

Al cambiar la categoría en modo mixto, el reparto cambia con ella **solo mientras la persona no lo haya tocado a mano**.

**Fuera de esta fase** (no se pintan): «Vincular a», «Añadir foto del ticket» y «¿Se repite? Crear pago recurrente».

### 3.3 Detalle (mockup `DetalleGasto`)

- Cabecera: Volver · «Gasto» · **Editar**.
- Icono de la categoría, concepto, importe grande y «Sábado 7 nov · Comer fuera».
- **Reparto**: «Pagaste tú · 62,00 €»; «Tu parte (50 %) 31,00 €» y «Parte de {Pareja} (50 %) 31,00 €» (o «Parte del bote»), con las partes **que devuelve el servidor**. Debajo, el efecto: «{Pareja} te debe 31,00 € · Incluido en vuestro saldo».
- Si es privado: «Solo lo ves tú».
- Si lo apuntó la otra persona: «Apuntado por {Pareja}».
- Sin «Conectado con», ticket ni «Pedir borrar» en esta fase.

### 3.4 Editar

- El mismo formulario, con los datos cargados y el título «Editar gasto».
- **Visible para {Pareja}** solo lo puede cambiar quien creó el gasto (el servidor lo exige con `TW013`).
- Si el gasto ya está saldado (`TW010`, no pasará hasta la fase 2), el importe y el reparto se bloquean con el aviso «Este gasto ya está saldado: el importe y el reparto no se pueden cambiar».

### 3.5 Historial (mockup `HistorialGastos`)

- **Buscador**: concepto o categoría. Busca en el servidor con `ilike` sobre `concept`, que ya tiene índice trigram, y por el nombre de la categoría.
- **Chips**: Todos + las 9 categorías. «Planes» y «Pagos» llegan con sus fases.
- Agrupado por mes («Noviembre 2026»), del más reciente al más antiguo.
- **Carga por páginas** de 50, con scroll infinito.
- **Recuento y total** de lo filtrado, con una RPC pequeña para no descargar todo el historial (§5).
- Sin resultados: «No hay nada que coincida con esa búsqueda.»

---

## 4. Código

| Archivo | Qué hace |
|---|---|
| `lib/gastos/categorias.ts` | Las 9 categorías: valor del enum, nombre en español e icono de Ionicons |
| `lib/gastos/reparto.ts` | Vista previa de las partes, frase del resultado, traducción tú/pareja ↔ m1/m2 y valores por defecto según los ajustes. **Funciones puras con pruebas** |
| `lib/gastos/fechas.ts` | «Hoy», «Ayer», «Sáb 7 nov», «Sábado 7 nov», nombre del mes y `YYYY-MM-DD` en hora local |
| `lib/gastos/consultas.ts` | Lecturas (saldo, últimos, página del historial, uno por id, totales) y escrituras (crear, editar) con sus errores traducidos |
| `lib/gastos/useGastos.ts` | Hooks de TanStack Query y el canal de tiempo real |
| `lib/consultas/QueryProvider.tsx` | `QueryClient` y recarga al volver a primer plano (`AppState`) |
| `components/gastos/*` | Tarjeta de saldo, fila de gasto, chips, selector de quién pagó, selector de reparto, control de %, calendario en hoja inferior |

**Errores que se traducen** (`error.code`):

| Código | Mensaje |
|---|---|
| `TW010` | «Este gasto ya está saldado: el importe y el reparto no se pueden cambiar.» |
| `TW011` | «Un gasto privado tiene que ser solo tuyo y pagado por ti.» (no debería pasar: la pantalla no lo permite) |
| `TW012` | «El bote común ya no está activado. Elige quién pagó.» |
| `TW013` | «Solo quien apuntó el gasto puede cambiar su visibilidad.» |
| `TW014` | «La moneda del gasto no es la de vuestro espacio.» |
| Versión distinta | «{Pareja} acaba de cambiar este gasto. Revísalo y vuelve a guardar.» |
| Red | «No hay conexión. Inténtalo de nuevo.» |

---

## 5. Base de datos

No hace falta cambiar tablas. Una migración pequeña, `supabase/migrations/20261117000000_gastos_totales.sql` (el archivo es la versión buena: también cuenta las categorías cuyo nombre coincide con la búsqueda):

Lo que hace (el SQL está en el archivo):
1. `public.expense_totals(p_category, p_query, p_query_categories)`: recuento y total de lo filtrado, `security invoker`, sin acceso para `anon`. Cuenta también las categorías cuyo nombre coincide con la búsqueda («super» → Súper).
2. Corrige `private.compute_shares`, que se desbordaba con importes de cientos de miles de euros (revisión del arquitecto, I1).


`security invoker`: la RLS de `expenses` se aplica tal cual, así que no cuenta los gastos privados de la otra persona. Los comodines `%` y `_` que escriba la persona se escapan en la app antes de enviarlos.

---

## 6. Accesibilidad y textos

- Todos los controles miden al menos 44 × 44.
- Los grupos de elección son `radiogroup` con `radio` y estado `checked`.
- El resultado en vivo se anuncia (`accessibilityLiveRegion="polite"`).
- Importes con `formatearEuros` en todas partes («31,00 €»; los enteros, sin decimales, solo en ajustes).
- Siempre en segunda persona y con el nombre de la pareja: «Pagaste tú», «Pagó {Pareja}», «Tu parte».
- Los colores de persona solo en nombres, avatares e importes de cada uno; nunca en botones ni estados.

---

## 7. Orden de implementación

Cada paso termina con `npm run typecheck`, `npm run lint` y las pruebas en verde, y con la comprobación indicada.

| Paso | Qué | Cómo se comprueba |
|---|---|---|
| 1 | TanStack Query, `QueryProvider` y pruebas con `jest-expo` | La app arranca igual; `npm test` pasa una prueba vacía |
| 2 | `categorias`, `fechas` y `reparto` con sus pruebas | Casos: 62,00 € a medias → 31,00 / 31,00; 0,01 € a medias → 0,01 / 0,00 (m1 se lleva el céntimo, igual que el servidor); 10 € al 33 % → 3,30 / 6,70; yo soy m2 y elijo «Solo tú» → `only_m2`; modo mixto con Súper → «Del bote» |
| 3 | Lecturas, hooks y canal de tiempo real | En web, la tarjeta de saldo muestra «Estáis en paz» con un espacio nuevo |
| 4 | Pestaña Gastos con estado vacío | Espacio sin gastos → mensaje y botón |
| 5 | Añadir gasto | David apunta «Cena 62 €, pagaste tú, a medias» → saldo «Meri te debe 31,00 €»; en la ventana de Meri, sin recargar: «Debes 31,00 € a David» |
| 6 | Detalle | Las partes coinciden con las de Supabase (`share_m1_cents`, `share_m2_cents`) |
| 7 | Editar | Cambiar a 70/30 → el saldo se mueve; editar a la vez en las dos ventanas → la segunda ve el aviso de versión |
| 8 | Historial y migración de totales | 60 gastos de prueba → carga por páginas; buscar «cena» y filtrar por categoría; el total coincide con la suma en Supabase |
| 9 | Gasto privado | David apunta «Solo tú» sin «Visible para Meri» → Meri no lo ve ni en la lista ni en el historial, y el saldo no cambia |
| 10 | Revisión del arquitecto (si David la pide) | Reparto, signos del saldo, traducción m1/m2 y RLS de la RPC |

---

## 8. Pruebas en web con dos cuentas

Las mismas ventanas que en el onboarding (panel de la app y Chrome). Casos además de los de la tabla:

1. Las dos personas apuntan un gasto a la vez: los dos aparecen en las dos ventanas y el saldo cuadra.
2. Un gasto de 0,01 € a medias y otro de 0,03 € proporcional 60/40: la vista previa coincide con lo que guarda Supabase.
3. Meri (m2) apunta «Pagué yo · Personalizado, tú 70 %»: en la ventana de David sale «Tu parte (30 %)».
4. Con bote: «Pagaste tú · Del bote» → «El bote te deberá X», y el saldo entre los dos no cambia.
5. Desactivar el bote en Supabase con el formulario abierto → al guardar, el aviso de `TW012`.

---

## 9. Riesgos

| Riesgo | Qué pasaría | Medida |
|---|---|---|
| La vista previa y el servidor redondean distinto | La frase dice 31,01 € y se guarda 31,00 € | Una sola función con pruebas; el detalle muestra siempre lo que devuelve el servidor |
| Confundir m1 y m2 al mostrar «tú» | Las partes salen al revés para Meri | Todas las traducciones en `reparto.ts`, con pruebas desde los dos lados |
| `ilike` con `%` o `_` escritos por la persona | Búsquedas raras (no es un riesgo de seguridad) | Escaparlos antes de enviarlos |
| Tiempo real caído | La otra ventana no se entera hasta volver a la app | Recarga al volver a primer plano y al tirar hacia abajo |

---

## 10. Decisiones que solo puede tomar David

1. **TanStack Query** como librería de datos para toda la app. (Recomendado: sí.)
2. **Pruebas con `jest-expo`**, de momento solo para la lógica de dinero. (Recomendado: sí: es donde un error sale caro.)
3. **Modo mixto, ¿quién pagó por defecto en Hogar, Súper y Suscripciones?** «Bote común», si pagáis con una tarjeta del bote, o «Tú», si cada uno paga con la suya y luego el bote os lo devuelve. (Recomendado: «Bote común»; se cambia con un toque.)
4. **La migración de totales del historial** (§5). Sin ella, el historial no muestra el total de lo filtrado. (Recomendado: sí.)
5. **Revisión del arquitecto** al final (paso 10). (Recomendado: sí, por ser dinero.)
