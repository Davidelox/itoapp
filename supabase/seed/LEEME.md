# Limpieza total antes de las pruebas conjuntas

`limpiar_todo.sql` deja vuestro espacio vacío de contenido, con las cuentas, la pareja y los ajustes intactos. **No es una migración**: no la muevas a `supabase/migrations/`.

**Se borra** (solo en vuestro espacio, sin papelera):

- eventos, cumpleaños y excepciones de eventos;
- pagos recurrentes y únicos, con sus cobros;
- **todos los gastos** y todas las liquidaciones;
- **todo el bote**: aportaciones, reembolsos y ajustes. El bote queda a 0 €;
- sitios, con sus notas y visitas, colecciones y sus sitios;
- planes, con sus tareas, e ideas;
- las solicitudes de borrado, pendientes e historial;
- los avisos push en cola o ya enviados (`push_outbox`) y sus tickets.

**Se conserva**:

- usuarios, perfiles y colores;
- la pareja y los miembros, con sus ajustes de avisos y de «Visible para…»;
- `couple_settings`, con la configuración del bote (activado, aportación, %, categorías);
- las propuestas de ajustes, las invitaciones y los tokens de push.

**Por qué se vacía el bote**: sin gastos, las aportaciones de prueba serían dinero inventado (hoy hay 100 € de una aportación manual) y los reembolsos dejarían el saldo en negativo. Así empezáis a 0 € con la misma configuración. `pot_generated_through` no se toca, así que el job diario no vuelve a crear aportaciones automáticas ya pasadas.

Si un gasto tenía foto del ticket, el archivo se queda en Storage sin gasto. El resumen lo avisa; hoy no hay ninguno.

## Cómo ejecutarlo

1. Cerrad la app en los dos móviles: un gasto creado mientras se ejecuta hace que la comprobación final falle y no se guarde nada.
2. **Ensayo** (`c_modo := 'ensayo'`, como viene):
   ```
   supabase db query --remote -f supabase/seed/limpiar_todo.sql
   ```
   También vale pegarlo entero en el **SQL Editor**. Termina con un **error a propósito** que lo deshace todo. El mensaje del error es el resumen:
   - filas antes → después de cada tabla que se vacía;
   - lo que se conserva;
   - el saldo del bote.
3. Si el resumen está bien, cambia arriba `c_modo` a `'aplicar'` y ejecuta otra vez. Al final sale el mismo resumen. Vuelve a dejar `'ensayo'` después.

El script comprueba al final que:

- lo vaciado tiene 0 filas;
- lo conservado no ha cambiado (filas y contenido);
- no se ha creado ningún aviso en `push_outbox`.

Si algo no cuadra, se para y no guarda nada. Se puede ejecutar dos veces seguidas sin problema. Si hay más de un espacio, se para: pon el id del vuestro en `v_couple`.

# Limpiar y crear ejemplos (Calendario y Gastos)

`limpiar_y_ejemplos.sql` vacía el Calendario y los Gastos de vuestro espacio y crea ejemplos para ver todas las posibilidades visuales. **No es una migración**: no la muevas a `supabase/migrations/`.

## Lo que se borra (no se puede deshacer)

Solo en vuestro espacio:

- eventos, cumpleaños y excepciones de eventos;
- pagos recurrentes y únicos, con sus cobros;
- **todos los gastos**: los manuales, los de cobros y los de «¿Quién pagó?»;
- todas las liquidaciones;
- los **reembolsos del bote**: devolvían gastos que ya no existen y, si se quedaran, «el bote te debe» saldría negativo;
- las solicitudes de borrado de todo lo anterior.

**No se toca**:

- el espacio, los miembros, sus colores y ajustes;
- `couple_settings`;
- las **aportaciones y ajustes del bote**;
- las propuestas de ajustes;
- planes, sitios y colecciones.

No hay papelera: lo borrado no se recupera.

## Cómo ejecutarlo

1. Supabase, **SQL Editor**, pega el archivo entero y pulsa **Run**.
2. **Primero, en ensayo** (`c_modo := 'ensayo'`, como viene):
   - lo hace todo y termina con un **error a propósito** que lo deshace;
   - el mensaje del error es el resumen: lo que se borraría, lo que se crearía, el saldo resultante y la lista de eventos, pagos y gastos;
   - no se guarda nada.
3. Si el resumen está bien, cambia arriba `c_modo` a `'aplicar'` y ejecuta otra vez. Al final sale una tabla con el mismo resumen.

Si hay más de un espacio en la base de datos, el script se para. Pon entonces el id del vuestro en `v_couple`, arriba.

Necesita las dos personas en el espacio y las migraciones hasta `20261121000000_calendario_v2.sql` aplicadas.

## Qué veréis

Las fechas son relativas a la semana en que se ejecuta. Las de abajo son para la semana del lunes 16 nov 2026.

**Calendario**

| Día | Qué |
|---|---|
| Martes 17 nov | **3 iconos**: Pádel, Cena japonesa y el cobro de Gas pendiente. En Gastos, tarjetas «¿Quién pagó?» y «pon el importe» del Gas |
| Jueves 19 nov | **4 iconos**: Yoga, Revisión dental, Llamar al seguro y el pago Matrícula |
| Viernes 20 nov | **5 iconos** (4 y «+1»): Médico, Afterwork, Cena en casa de Marta y los pagos Regalo de boda y Reserva casa rural |
| Sábado 21 nov | Brunch y **2 cumpleaños** (Carmen, de m2, cumple 60; Laura, de m1, sin año) |
| Domingo 22 nov | Cumpleaños del Abuelo Paco (de los dos) y un **secreto**: cada uno ve solo el suyo, con candado |
| 23 – 25 nov | Barra de «Visita a Zaragoza» (m2, 3 días, se repite cada mes) |
| Martes 24 nov | **1 icono**: Pádel |
| Miércoles 25 nov | **2 iconos**: Peluquería y el pago Revisión ITV |
| Jueves 26 nov | El Yoga **no sale**: está anulado «solo este día» |
| 27 nov – 2 dic | **Tres viajes solapados**: Congreso en Valencia (m1, cruza de semana y de mes), Casa de los abuelos (m2) y Curso intensivo (los dos). En el Mes, 2 carriles y «+1»; en la Semana, 3 carriles |
| 3 dic / 4 dic | 3 y 4 iconos |
| 8 – 11 dic | Escapada a Lisboa (los dos, 4 días) |
| 12 dic | Aniversario (cada año) |
| Martes 15 dic | **6 iconos** (4 y «+2»): Pádel, Concierto y 4 pagos |
| 24 – 25 dic | Nochebuena y Navidad, solapada con Zaragoza |
| Enero | «Finde de surf» (vie – dom) cada semana, 4 veces |

Además:

- Pádel (m1) cada martes; Yoga (m2) cada jueves hasta fin de año; Reunión de vecinos el 13 de cada mes.
- Cumpleaños de Lucía (17 dic) y Javi (20 ene).
- Leo, nacido un 29 de febrero, sale el 28 feb de 2027.

**Pagos**

- **Recurrentes**: Alquiler (proporcional), Netflix (a medias), Spotify (personalizado 60/40), Luz (del bote si está activo; variable), Gas (variable), Comunidad, Gimnasio (solo de m2), Seguro del coche (anual, solo de m1) y Dominio web (anual).
- **Psicóloga**: privado de m1. Solo lo ve m1.
- **Revista de cocina**, en pausa: sale cobrada en septiembre y octubre, y a partir de ahora ya no.
- **Únicos**: Matrícula, Regalo de boda, Reserva casa rural, ITV y Entradas del concierto (todos futuros), y Reparación de la lavadora (ya pagada).

**Gastos**

- Este mes, unos 15 gastos con todas las categorías y repartos:
  - a medias, proporcional, personalizado;
  - solo de m1 o de m2, pagado por el otro;
  - personales, y dos privados: uno de cada persona;
  - del bote, si está activo.
- Los cobros de los recurrentes de septiembre a noviembre.
- El gasto del Cine, enlazado a su evento.
- **Pendiente de confirmar**: m2 dice que pagó a m1 la Compra semanal y la Ferretería (48,19 €). m1 ve «Confirmar».
- **Saldado**: todo lo de meses anteriores, en una liquidación confirmada.
- **Saldo**: m2 debe a m1 unos 600 €, sobre todo por el alquiler de noviembre. El resumen da la cifra exacta.
- **Bote**:
  - si está activo y tiene al menos 250 €, paga la Luz y los Productos de limpieza;
  - si está activo y no llega, esos gastos los adelanta una persona para el bote;
  - si no está activo, se hacen a medias.

## Después

El job diario (`run_daily_jobs`) seguirá su curso:

- cuando llegue la fecha de un pago, creará su cobro;
- en los de importe fijo, creará también el gasto. Por ejemplo, la Matrícula el día 19;
- si el bote tiene aportación mensual, también se generará.

Así que saldrán filas nuevas sin que nadie haga nada.
