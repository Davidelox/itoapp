# ito: documento de concepto

> Última actualización: 2026-11-12

## Qué es

**ito** es un gestor de vida en pareja: un único sitio donde organizar todo lo que comparten dos personas que viven juntas. No es un "tricount para dos": el dinero es solo una parte.

Su diferencia es que **todo está conectado**. Casi todo lo que hace una pareja tiene una fecha, un coste, un lugar o las tres cosas, y la app los enlaza:

- Una **cena** es un plan en el calendario, en un restaurante del mapa, y al pagarla se convierte en un gasto que entra en el balance.
- Un **viaje** agrupa planes, reservas, gastos, una lista de equipaje y un presupuesto.
- Una **suscripción** o **factura** es un gasto recurrente con fecha de cobro y aviso.
- La **compra del súper** empieza como lista y, al hacer el ticket, pasa a ser un gasto.

Palabras que definen la app: **complicidad, sintonía, compenetración**.

## Nombre

**ito**: "hilo" en japonés, por el *akai ito*, el hilo rojo del destino que une a dos personas. Corto, se pronuncia igual en cualquier idioma y va siempre en minúsculas.

- Uso personal por ahora. "Itō" es también un apellido japonés muy común, así que si algún día se publica habrá que revisar la marca.

## Plataforma y stack

- iOS y Android.
- React Native + Expo (Expo Router).
- Supabase: base de datos Postgres, autenticación, tiempo real y almacenamiento (tickets, fotos).

## Secciones

| Pestaña | Contenido |
|---|---|
| **Inicio** | Resumen de hoy y de la semana: plan de hoy, balance, lo que viene esta semana (planes, eventos, cobros) y el próximo viaje o evento del planificador |
| **Gastos** | Deudas y balance (quién debe a quién, saldar), gastos recurrentes (suscripciones, facturas), gastos del hogar, comer fuera, ocio, transporte… filtrables por categoría |
| **Calendario** | Calendario compartido: planes, citas, cumpleaños, aniversarios y fechas de cobro de los recurrentes |
| **Mapa** | Sitios guardados (restaurantes, bares, escapadas…) con estado *quiero ir / hemos ido*, valoración de cada uno y notas |
| **Planificador** | Viajes, eventos y planes grandes, con fechas, presupuesto, reservas, planes y sitios. También las ideas "algún día" |

El perfil de pareja, los ajustes y el modelo de reparto se acceden desde la cabecera, no ocupan una pestaña.

**Listas** (súper, casa, regalos): fuera por ahora. Se retomarán más adelante.

### Planificador

Cada viaje o evento es un contenedor que agrupa elementos del resto: planes del calendario, gastos, sitios del mapa y presupuesto. Sirve igual para una escapada, un cumpleaños, la Navidad, una mudanza o una boda.

## Modelo de conexiones

```
                ┌──────────── Lugar (mapa) ────────────┐
                │                                       │
Proyecto ──► Plan ──► Evento (calendario)               │
(viaje,         │                                       │
 mudanza…)      ├──► Gastos ──► Balance / Presupuesto   │
                │                                       │
                └──► Lista (equipaje, compra…)          │
                                                        │
Gasto suelto ───────── puede tener Lugar ───────────────┘
Suscripción/Factura ──► Gasto recurrente + Evento de cobro
```

Ejemplos de lo que permite:
- En el **mapa**, al abrir un restaurante: "Fuimos 3 veces · 142 € en total · Próxima reserva: viernes".
- En el **calendario**, la cena del viernes muestra el sitio y, cuando pasa, pregunta "¿Quién pagó?".
- Un **gasto** del súper guarda el ticket, la tienda queda en el mapa y la lista se marca como hecha.

Técnicamente: una tabla por entidad con claves foráneas opcionales entre ellas, todo bajo un `couple_id` protegido con RLS.

## Dinero: modelos de reparto

Las parejas no siempre van al 50/50. La app debería admitir:
- **50/50** clásico.
- **Proporcional a ingresos** (por ejemplo, 60/40).
- **Bote común**: hay una cuenta conjunta y lo que interesa es en qué se gasta, no quién debe a quién.
- **Mixto**: unas categorías van al bote y otras se reparten.

## Mapa

- Mapa en la app con `react-native-maps` (Apple Maps en iOS, Google Maps en Android).
- Buscar y añadir sitios con la API de Google Places (autocompletado, fotos, horario, valoración).
- Google no tiene API para leer las listas guardadas de un usuario. En su lugar:
  1. **Compartir con la app** desde Google Maps, Instagram o TikTok.
  2. Importación única desde Google Takeout (opcional).
- Botón "Cómo llegar" que abre Google Maps, Apple Maps o Waze.

## Ideas sueltas

- **Sunday check-in**: un resumen semanal que la app prepara el domingo (lo que viene esta semana, gastos, planes pendientes) para organizarse juntos.
- Recordatorio antes de cada cobro de suscripción.
- Al pasar un plan, preguntar quién pagó y crear el gasto con un toque.

## Competencia (noviembre de 2026)

- **Cupla**: calendario, tareas, wishlist y planificador de citas; más de 500K parejas. Sin dinero.
- **Tandem: For Couples**, **Toggly**, **Cuppl**, **TwoGether**, **SameWave**, **Koabit**: tareas, calendario y, algunas, gastos. Pequeñas.
- **Splitwise / Tricount**: gastos en grupo, sin planificación.
- **Love Places**, **Pairto**: mapa de sitios para parejas.

Nadie junta bien dinero, calendario, listas y mapa conectados entre sí.

## Decisiones de la primera versión

- **Alcance del MVP**: las cinco pestañas (Inicio, Gastos, Calendario, Mapa, Planificador). Listas, presupuestos mensuales por categoría y estadísticas quedan para después.
- **Reparto por defecto**: mixto y configurable (cada gasto o categoría puede ir al bote común o repartirse).
- **Estilo visual**: cálido y acogedor, formas redondeadas. Tipografía *Fraunces* (títulos) y *DM Sans* (texto).
- **Paleta**:
  - Granate `#7B2433` (principal: acciones, tarjeta destacada, planes), oscuro `#5E1A26`, suave `#F1E1E3`.
  - Amarillo pastel: fondo `#FBF7E9`, destacados y pagos `#F8EDC4` (texto `#5C4A12`), punto de pago `#B8901A`.
  - Azul pastel `#DCEAF4` (eventos, texto `#2C4A5E`); azul medio `#3F7099` para botones secundarios y el color de María.
  - Grises cálidos: texto `#2A2627`, secundario `#625C5A`, bordes `#E6E1D6`, superficies `#EFEBE3`.
- **Tipos de evento en el calendario**: plan (granate), evento (azul), pago (amarillo), viaje (fondo granate suave).
- **Calendario**: vista de mes o semana, filtros por tipo (planes, eventos, pagos, viajes) y lista de próximos debajo.
- **Usuarios**: David (menta) y María (lavanda). Cada uno elige un color **pastel** en el onboarding (menta, lavanda, melocotón, aguamarina, pistacho o malva) y no se puede repetir. Los colores de persona nunca se usan para estados ni botones de la app.
- **Decisiones de la revisión (13 nov)**: saldo global que se puede saldar entero o por partes; quien recibe marca el pago y, si lo marca quien paga, el otro confirma; bote común opcional con saldo acumulado (aportación fija mensual o manual); quién pagó separado de cómo se reparte, con porcentaje personalizado; privacidad elegida por cada uno; los planes del Planificador tienen icono, presupuesto opcional, calendario propio y cuentan como un gasto agrupado; colecciones con icono en el mapa; gastos sin conexión. Detalle completo en `docs/especificacion-correcciones.md`.
- **Redacción**: siempre en segunda persona desde quien usa la app: "María te debe 23,40 €", "Debes 12 € a María", "Pagaste tú", "Tu parte". Los nombres, avatares e importes de cada uno se resaltan con su color.
- **Mockups**: https://claude.ai/artifact/Ld49n1bZM5JJwyw6o4BbJU
- **Primer paso de diseño**: mockups de las pantallas principales.

## Primer uso

1. **Bienvenida**: entrar con Apple, Google o email.
2. **Perfil**: nombre y foto.
3. **Crear o unirse**: el primero crea el espacio de la pareja; el segundo se une con un código.
4. **Invitar / Unirse**: código de invitación (ej. `4K7·Q2X`) que se comparte por enlace y caduca a los 7 días. Se puede seguir sin esperar a la pareja.
5. **Reparto por defecto**: mixto (recomendado), 50/50, proporcional a ingresos o bote común.
6. **Inicio vacío**: checklist de primeros pasos (primer gasto, primer sitio, primer plan, suscripciones).

## Gastos: funcionalidad

- **Añadir gasto**: importe, concepto, categoría, quién pagó (David, María o el bote común), cómo se reparte (50/50, proporcional, solo uno), fecha, vínculo opcional a un plan/evento y a un sitio, foto del ticket y opción de repetir cada mes. Muestra en vivo la deuda que genera.
- **Detalle de gasto**: reparto entre los dos, deuda resultante y conexiones (plan del calendario, sitio del mapa, ticket).
- **Saldar cuentas**: desglose de lo pendiente, método de pago (Bizum, transferencia, efectivo, desde el bote) y confirmación "cuentas a cero".
- **Bote común**: dinero conjunto que se aporta (a medias o proporcional) y del que se pagan los gastos de casa sin generar deudas. Muestra saldo, aportaciones de cada uno, gasto por categoría y lo que el bote debe a quien adelantó un pago con su tarjeta.
- **Recurrentes**: suscripciones y facturas con día de cobro, quién paga (bote, 50/50 o personal), importe fijo o variable y aviso un día antes. Separados en compartidos y personales.

## Calendario y Mapa: funcionalidad

- **Nuevo en el calendario**: tipo (plan, evento, recordatorio de pago), título, fecha y hora o todo el día, repetición (los eventos tipo cumpleaños, cada año), quién va (los dos, solo tú, solo tu pareja), sitio del mapa, presupuesto (planes) o importe y quién paga (pagos), aviso y notas.
- **Detalle de evento**: sitio con "Cómo llegar", y cuando el plan pasa pregunta "¿Quién pagó?" para crear el gasto con un toque.
- **Mapa**: vista de mapa o lista, botón para guardar sitio.
- **Guardar sitio**: buscar o pegar enlace (Google Maps, Instagram, TikTok), quiero ir / hemos ido, categoría, nota y valoración de cada uno.
- **Compartir desde otra app**: hoja de "Guardar en ito" que detecta el sitio del enlace compartido.
- **Ficha de sitio**: notas de cada uno, visitas con lo gastado en cada una, próximo plan, cómo llegar y planear.

## Planificador: funcionalidad

- **Pantalla principal**: Próximos (viajes y eventos con cuenta atrás y presupuesto), Ideas ("algún día", convertibles en plan) y Pasados (con lo gastado).
- **Nuevo plan grande**: tipo (viaje, evento, otro), nombre, destino, fechas, quién va, presupuesto y cómo se paga, plantilla de reservas o tareas, color de portada.
- **Detalle de viaje** (pestañas): Resumen (presupuesto, reservas, próximos pasos), Itinerario por días enlazado al calendario y a sitios, Gastos del viaje con su propio balance, y Sitios en un mapa.
- **Detalle de evento grande**: tareas asignadas a cada uno, presupuesto, gastos del evento con su deuda, plan vinculado y notas.

## Orden de diseño

1. Primer uso (en curso). 2. Gastos (flujos de añadir gasto, saldar). 3. Calendario y Mapa (crear plan, guardar sitio). 4. Planificador (lo último: usa todo lo anterior).

## Decisiones del modelo de datos (13 nov)

- **Borrar requiere la aprobación de los dos**: borrar un gasto, un sitio, un evento, un pago recurrente, un plan completo o una colección en la que la pareja ha añadido sitios queda pendiente hasta que la otra persona lo acepta. No hace falta aprobación para editar el importe de un gasto aún no saldado, quitar un sitio de una colección, mover un plan o un elemento del itinerario de día, ni para borrar algo privado. Una colección sin sitios de la pareja se borra sin permiso; si la pareja añadió sitios, al borrarla se «deja»: la pareja la conserva como suya y privada y puede volver a compartirla. Una colección compartida no puede volver a privada.
- **Colecciones**: un sitio puede estar en varias. Se elige una colección principal, cuyo icono es el del pin; al añadirlo a otra colección, la app ofrece quitarlo de las demás.
- **Eventos secretos**: por defecto eventos y planes los ven los dos, pero se puede crear un evento secreto que solo ve quien lo crea (para sorpresas).
- **Saldar** por gastos concretos (sin pagos libres a cuenta en el MVP). Cambiar reparto o bote cuando ya sois dos va con propuesta que acepta el otro. Código de invitación de 6 caracteres.
- Detalle completo en `docs/modelo-datos.md`.
- **Detalles confirmados**: borrar un movimiento del bote pide aprobación; tareas, ideas y notas se borran sin aprobación; en un evento repetido, borrar una sola fecha pide aprobación y editarla no; las solicitudes de borrado caducan a los 7 días; un evento secreto no puede estar dentro de un plan (MVP).

## Seguridad y datos sensibles

- Las contraseñas las gestiona Supabase Auth (cifradas con hash); la app nunca las guarda ni las ve después del inicio de sesión.
- Ningún email, contraseña, token o clave en el repositorio, en logs, en URLs ni en herramientas de analítica o errores.
- En la app solo va la clave pública (anon/publishable) de Supabase; la clave secreta (service_role) solo se usa en el servidor, nunca en el móvil ni en git.
- Los datos de cada pareja quedan aislados con RLS, y cada persona decide qué ve la otra de lo suyo.
- Cualquier cambio en cuentas, autenticación o datos personales lo revisa el arquitecto antes de darlo por bueno.
