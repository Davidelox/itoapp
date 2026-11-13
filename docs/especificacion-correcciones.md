# ito: especificación de correcciones del diseño (ronda 2)

> 2026-11-13. Referencia común para corregir los mockups tras la auditoría (`docs/revision-diseno.md`) y las decisiones de David. Si algo aquí contradice a la auditoría o al concepto antiguo, manda este documento.

## 1. Decisiones de producto

1. **Saldar**: hay un único saldo global, pero se puede saldar todo de una vez o por partes (un gasto suelto, varios, o un plan entero).
2. **Quién marca un pago como saldado**: quien recibe el dinero lo marca directamente; si lo marca quien paga, la otra persona tiene que confirmarlo en su app ("María dice que te ha pagado 12,00 € · Confirmar / No lo he recibido").
3. **Bote común**: es **opcional** (hay parejas sin bote o que aún no viven juntas). Si existe, es un **saldo que se acumula**. La pareja elige si se rellena con una **aportación fija mensual** (importe, día y cuánto pone cada uno) o **a mano**. Nunca se salda una deuda "desde el bote".
4. **Quién pagó ≠ de quién es el gasto**: al apuntar un gasto se elige quién pagó (tú, tu pareja o el bote) y de quién es (a medias, proporcional, **personalizado en %**, solo tú, solo tu pareja, o del bote). Si alguien paga con su dinero un gasto del bote, "el bote le debe X €" y se reembolsa desde el bote.
5. **Reparto personalizado**: en cualquier gasto se puede poner el porcentaje de cada uno (p. ej. tú 70 % · María 30 %), con los importes calculados.
6. **Privacidad**: cada persona elige qué ve la otra de lo suyo (gastos personales, pagos recurrentes personales). Por elemento hay un interruptor "Visible para María".
7. **Borrar** un sitio, evento o plan con gastos: los gastos se conservan y guardan la información del sitio/plan como texto.
8. **Sin conexión**: se pueden apuntar gastos; se suben al volver la conexión ("pendiente de subir"). Si eso no es posible, solo se pueden apuntar gastos personales que solo ve uno mismo.

### Planificador
- Cada elemento del Planificador es un **plan** (tipos: **Viaje**, **Celebración**, **Otro**). Tiene un **icono** (cualquier emoji del teclado del móvil; en la app siempre se llama "icono") que lo representa: es el símbolo que sale en el mapa en sus sitios y en el calendario.
- El **presupuesto es opcional**.
- Un plan cuenta como **un gasto único** en Gastos: agrupa todos sus gastos internos (fila "✈️ Escapada a Lisboa · 2 gastos · 312,00 €" que abre el plan). Su balance forma parte del saldo global.
- El plan tiene **su propio calendario** con el itinerario por día, que se puede cambiar sobre la marcha. En el calendario global el viaje sale como una banda de varios días con su icono; al pulsarlo se abre el calendario del plan.

### Mapa
- **Colecciones**: listas de sitios con nombre e icono (p. ej. "🍣 Restaurantes de TikTok"). Los sitios de un plan forman automáticamente una colección con el icono del plan. En el mapa, cada pin muestra el icono de su colección/plan, o el icono de su categoría si no tiene.

## 2. Terminología (usar exactamente)
- **Plan**: solo lo que se crea en el Planificador (viaje, celebración, otro). El cumpleaños de Marta es un plan de tipo Celebración 🎂 y existe una sola vez.
- **Evento**: algo con fecha en el calendario (cena, cine, cita, aniversario). Tipos en el calendario: **Evento** y **Pago**; los planes aparecen con su icono.
- **Pago**: cobros, suscripciones y facturas. La sección se llama **Pagos recurrentes**.
- **Bote común** en títulos y etiquetas.
- Categorías de gasto (las mismas en todas partes): Hogar, Súper, Comer fuera, Ocio, Transporte, Suscripciones, Salud, Regalos, Otros. Los planes no son una categoría: van agrupados.

## 3. Colores
Los colores de persona son **pastel** y **nunca** se usan para estados, botones ni textos de la app.

| Color | Fondo (avatar, chips) | Tinta (inicial, nombre en texto) |
|---|---|---|
| Menta (David por defecto) | `#C5E7D3` | `#23604A` |
| Lavanda (María por defecto) | `#D7CDF2` | `#4F3D8C` |
| Melocotón | `#F8CBB4` | `#8A4325` |
| Aguamarina | `#BFE3E3` | `#1F5E60` |
| Pistacho | `#DCE8B5` | `#4A5E14` |
| Malva | `#EBCBEA` | `#74306F` |

- Avatar: círculo con fondo pastel e inicial en su tinta (D en menta, M en lavanda).
- El nombre de una persona en un texto ("María", "Tú", "Pagaste tú", "Tu parte") va en su tinta y peso 700.
- Colores de la app (marca y estados; la marca podrá cambiar más adelante): acento granate `#7B2433` (oscuro `#5E1A26`, suave `#F1E1E3`) para botones principales, pestaña activa, enlaces, checks de tareas hechas y planes. Eventos: punto `#3F7099`, chip `#DCEAF4` con texto `#2C4A5E`. Pagos: punto `#B8901A`, chip `#F8EDC4` con texto `#5C4A12`. Fondo `#FBF7E9`, texto `#2A2627`, secundario `#625C5A`, bordes `#E6E1D6`, divisores `#EEEAE1`, superficie `#EFEBE3`, borde de inputs y chips `#DED8CC`.
- Botón secundario: fondo `#EFEBE3`, texto `#2A2627` (o borde 1.5px `#2A2627` sobre blanco). Nunca azul ni del color de una persona.
- Pines del mapa: círculo blanco con el icono de la colección/plan (o icono de categoría). **Hemos ido** = borde sólido `#2A2627` 2px + insignia de check granate. **Quiero ir** = borde discontinuo `#625C5A`. La leyenda de los filtros usa esas mismas formas.
- Iconos de categoría: tile 40px, radio 13, fondo `#EFEBE3`, icono `#4F4946`.

## 4. Patrones comunes (iguales en todas las pantallas)
- **Cabecera de pantalla secundaria**: fila de 44px. Izquierda: botón circular 44px, fondo blanco, borde `#E6E1D6`, con chevron (volver) o X (cerrar, en formularios), con `aria-label`. Centro: título 17px DM Sans 700. Derecha: acción de texto ("Editar") o nada.
- **Formularios**: X arriba a la izquierda; botón principal fijo abajo en un pie blanco con borde superior `#E6E1D6`: granate, alto 52px, ancho completo, texto blanco 16px 700. El contenido central hace scroll.
- **Segmentado**: contenedor `#ECE7DD`, radio 999px, padding 3px; opción seleccionada fondo blanco, texto `#2A2627` 700.
- **Chips de filtro**: alto 36px, radio 999px. Seleccionado: fondo `#2A2627`, texto blanco. No seleccionado: fondo blanco, borde `#DED8CC`.
- **Tarjeta de saldo** (Inicio, Gastos, plan): avatar de la persona + frase ("María te debe" / "Debes … a María") + importe en Fraunces + acción. Mismo componente en todas partes.
- **Enlaces**: todo lo que representa un elemento (evento, gasto, sitio, plan, pago) abre **su detalle**, nunca solo la pestaña. Los botones "Editar" abren el formulario del elemento.

## 5. Datos de ejemplo (coherentes en todas las pantallas)
Hoy: jueves 12 de noviembre de 2026. Quien mira es David.

**Saldo global: María te debe 35,90 €.** Pendiente de saldar:
| Elemento | Quién pagó | Reparto | Efecto |
|---|---|---|---|
| Taberna El Olivo (sáb 7 nov, 62,00 €) | Pagaste tú | A medias | +31,00 |
| Gasolina (vie 6 nov, 45,00 €) | Pagaste tú | A medias | +22,50 |
| Cine (18,00 €) | Pagó María | A medias | −9,00 |
| Farmacia (42,20 €) | Pagó María | A medias | −21,10 |
| ✈️ Escapada a Lisboa (2 gastos, 312,00 €) | — | — | +30,00 |
| 🎂 Cumpleaños de Marta (1 gasto, 35,00 €) | Pagó María | A medias | −17,50 |
| **Total** | | | **+35,90** |

Ejemplo de confirmación pendiente (Inicio): "María dice que te ha pagado 12,00 € por Bizum" (Confirmar / No lo he recibido).
Ejemplo de "¿quién pagó?" pendiente (Inicio): "Brunch en Café Brisa · domingo 8".

**Bote común** (activado): saldo acumulado **412,00 €**. Aportación automática **1.000 €/mes el día 1**: tú 60 % (600 €), María 40 % (400 €). Gastado en noviembre 588,00 €: Súper 214,30 · Hogar 183,72 · Suscripciones 30,98 · Otros 159,00. "El bote debe 54,30 € a María" (súper pagado con su tarjeta) → "Reembolsar desde el bote".
Reparto por defecto: **mixto** (Hogar, Súper y Suscripciones van al bote; el resto a medias).

**Pagos recurrentes** compartidos (113,98 €/mes): Internet 35,00 (día 1, bote), Netflix 12,99 (día 16, bote), Spotify 17,99 (día 19, bote), Luz ~48,00 (día 25, a medias, variable). Personal: Tu gimnasio 39,90 (día 3, solo tú, visible para María: no).

**Planes**: ✈️ Escapada a Lisboa (sáb 5 – mar 8 dic, en 23 días, presupuesto 900 € opcional puesto; 312 € gastado: vuelos 186,00 pagaste tú a medias, señal del hotel 126,00 pagó María a medias → María te debe 30,00). 🎂 Cumpleaños de Marta (dom 15 nov, en 3 días, presupuesto 120 €; regalo 35,00 pagó María a medias → debes 17,50; tareas: regalo ✓ María, reservar cena — tú, comprar tarta — María). 🎄 Navidad con la familia (24 dic, en 42 días, **sin presupuesto**).

**Calendario**: hoy 21:30 Cena en Taberna El Olivo (evento); sáb 14 19:00 Cine en Cines Aurora (evento); dom 15 🎂 Cumpleaños de Marta (plan); lun 16 Netflix (pago); jue 19 Spotify (pago); mié 25 Luz (pago); 5–8 dic ✈️ Escapada a Lisboa (plan, banda de varios días).

**Mapa / colecciones**: 🍣 Restaurantes de TikTok (Ramen Kaze, Shibuya Ramen), ☕ Cafés bonitos (Café Brisa), ✈️ Escapada a Lisboa (6 sitios del plan). Sin colección: Taberna El Olivo (hemos ido, 3 visitas, 142 €), Mirador del Parque (hemos ido), Librería Nube (hemos ido).

## 6. Flujo de primer uso (nuevo orden)
- Quien crea (David): Bienvenida → Crear o unirse → Tu perfil (nombre, foto, color) → Cómo os organizáis el dinero (bote sí/no, aportación, reparto por defecto) → Invitar → Inicio vacío ("María aún no se ha unido · Reenviar invitación").
- Quien se une (María): Bienvenida → Crear o unirse → Unirse (código) → Tu perfil (el color de David aparece desactivado: "Lo usa David") → Inicio. **No** vuelve a elegir el reparto: ve "David ha configurado: mixto, bote común con 1.000 €/mes" y puede proponer cambios en Ajustes.
