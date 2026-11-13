-- =============================================================================
-- Twobe · Esquema inicial (borrador de diseño)
-- 2026-11-13 · Ver docs/modelo-datos.md para el porqué de cada decisión.
--
-- Principios:
--   * Todo cuelga de couple_id y se protege con RLS.
--   * Dinero en céntimos (integer). Nunca float.
--   * Cada pareja tiene exactamente dos huecos: 'm1' (quien crea) y 'm2' (quien
--     se une). Los repartos se guardan por hueco (share_m1/share_m2/share_pot),
--     así la suma = total se comprueba con un CHECK de una sola fila.
--   * Los saldos NO se guardan: se calculan (vista expense_effects + get_balance).
--   * Los ids los genera el cliente (uuid) para que reintentar sea idempotente.
--   * Las escrituras delicadas (unirse, saldar, confirmar, aceptar ajustes, borrar)
--     solo se hacen por RPC security definer; las tablas no tienen política para ellas.
--   * Borrar algo compartido (gasto, sitio, evento, pago recurrente, plan, colección con
--     sitios, movimiento del bote) necesita la aprobación de la otra persona:
--     request_deletion → respond_deletion. Lo privado y las colecciones vacías se borran al momento.
--   * Requiere Postgres 15+ (ON DELETE SET NULL (columna), security_invoker en vistas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extensiones y esquemas
-- -----------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;  -- búsqueda en el historial

-- Funciones auxiliares fuera del esquema expuesto por la API (PostgREST solo publica "public").
create schema if not exists private;

-- -----------------------------------------------------------------------------
-- 1. Tipos enumerados
--    Listas cerradas que la app traduce. Añadir valores es fácil (ALTER TYPE ... ADD VALUE);
--    quitarlos no, por eso solo se usan para conjuntos estables.
-- -----------------------------------------------------------------------------
create type public.party            as enum ('m1', 'm2', 'pot');   -- miembro 1, miembro 2, bote común
create type public.attendees        as enum ('both', 'm1', 'm2');  -- quién va
create type public.person_color     as enum ('menta', 'lavanda', 'melocoton', 'aguamarina', 'pistacho', 'malva');
create type public.expense_category as enum ('home', 'groceries', 'eating_out', 'leisure', 'transport',
                                             'subscriptions', 'health', 'gifts', 'other');
-- De quién es el gasto. half/proportional/custom usan split_pct_m1.
create type public.split_mode       as enum ('half', 'proportional', 'custom', 'only_m1', 'only_m2', 'pot');
create type public.default_split    as enum ('mixed', 'all_pot', 'half', 'proportional');
create type public.pot_funding      as enum ('monthly', 'manual');
create type public.pot_movement_kind as enum ('contribution', 'reimbursement', 'adjustment');
create type public.settlement_method as enum ('bizum', 'transfer', 'cash', 'other');
create type public.settlement_status as enum ('pending', 'confirmed', 'rejected');
create type public.payment_frequency as enum ('once', 'monthly', 'yearly');
create type public.occurrence_status as enum ('pending', 'paid', 'skipped');
create type public.recurrence       as enum ('none', 'weekly', 'monthly', 'yearly');
create type public.time_slot        as enum ('morning', 'afternoon', 'evening');
create type public.plan_type        as enum ('trip', 'celebration', 'other');
create type public.plan_cover       as enum ('granate', 'ciruela', 'oliva', 'pizarra');
create type public.task_kind        as enum ('booking', 'task');
create type public.task_status      as enum ('pending', 'done');
create type public.place_status     as enum ('want_to_go', 'been');
create type public.place_category   as enum ('restaurant', 'bar', 'cafe', 'leisure', 'getaway', 'other');
create type public.place_provider   as enum ('google', 'manual');
create type public.proposal_status  as enum ('pending', 'accepted', 'rejected');
-- Borrar algo compartido requiere que la otra persona lo apruebe.
create type public.deletion_target  as enum ('expense', 'place', 'event', 'recurring_payment', 'plan', 'collection', 'pot_movement');
create type public.deletion_status  as enum ('pending', 'approved', 'rejected', 'cancelled', 'expired');

-- -----------------------------------------------------------------------------
-- 2. Personas, pareja, invitaciones y ajustes
-- -----------------------------------------------------------------------------

-- Perfil público mínimo de cada usuario de auth. Se crea solo (trigger en auth.users).
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  avatar_path  text,                                   -- ruta en Storage (bucket avatars)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- El espacio de la pareja.
create table public.couples (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  currency   char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),  -- una moneda por pareja (MVP)
  time_zone  text not null default 'Europe/Madrid',   -- para "hoy", cobros y aportaciones
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index couples_created_by_idx on public.couples (created_by);

-- Membresía. slot fija quién es m1/m2 para siempre (los repartos se guardan por hueco).
-- Aquí viven también las preferencias personales dentro de la pareja: color, privacidad y avisos.
create table public.couple_members (
  couple_id   uuid not null references public.couples (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  slot        public.party not null check (slot <> 'pot'),
  color       public.person_color,                   -- null hasta que lo elige en "Tu perfil"
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,                           -- salió del espacio: pierde el acceso
  -- Privacidad: valor por defecto del interruptor "Visible para tu pareja" al crear cosas propias.
  share_personal_expenses  boolean not null default false,
  share_personal_recurring boolean not null default false,
  share_places             boolean not null default true,
  -- Avisos (push)
  notify_payment_reminder  boolean not null default true,
  notify_who_paid          boolean not null default true,
  notify_partner_expense   boolean not null default true,
  notify_settlements       boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (couple_id, user_id),
  unique (couple_id, slot),
  unique (couple_id, color)                          -- dos personas no repiten color
);
create unique index couple_members_one_active_idx on public.couple_members (user_id) where left_at is null;
create index couple_members_user_idx on public.couple_members (user_id);

-- Códigos de invitación (TWB·XXXXXX). Caducan a los 7 días y son de un solo uso.
create table public.couple_invitations (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  code       text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),  -- sin I, L, O, 0, 1
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by    uuid references public.profiles (id) on delete set null,
  used_at    timestamptz,
  revoked_at timestamptz
);
create index couple_invitations_couple_idx on public.couple_invitations (couple_id);
create index couple_invitations_created_by_idx on public.couple_invitations (created_by);
create index couple_invitations_used_by_idx on public.couple_invitations (used_by);

-- Intentos de unirse (limita la fuerza bruta de códigos). Esquema privado: no se expone.
create table private.join_attempts (
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);
create index join_attempts_user_idx on private.join_attempts (user_id, attempted_at);

-- Ajustes de dinero de la pareja (1 fila por pareja).
create table public.couple_settings (
  couple_id           uuid primary key references public.couples (id) on delete cascade,
  default_split       public.default_split not null default 'half',
  proportional_pct_m1 smallint not null default 50 check (proportional_pct_m1 between 0 and 100),
  -- Bote común (opcional)
  pot_enabled         boolean not null default false,
  pot_categories      public.expense_category[] not null default '{home,groceries,subscriptions}',  -- modo mixto
  pot_funding         public.pot_funding not null default 'manual',
  pot_monthly_cents   integer check (pot_monthly_cents > 0),
  pot_day             smallint check (pot_day between 1 and 31),   -- 29-31 se ajusta al último día del mes
  pot_pct_m1          smallint not null default 50 check (pot_pct_m1 between 0 and 100),
  pot_started_on      date,                                         -- desde cuándo hay aportación automática
  pot_generated_through date,                                       -- último mes (día 1) ya generado por el job
  version             integer not null default 1,
  updated_by          uuid references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now(),
  check (pot_enabled or default_split not in ('mixed', 'all_pot')),
  check (pot_funding <> 'monthly' or (pot_monthly_cents is not null and pot_day is not null and pot_started_on is not null))
);
create index couple_settings_updated_by_idx on public.couple_settings (updated_by);

-- Cambios de ajustes propuestos por un miembro y aceptados por el otro.
create table public.settings_proposals (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  proposed_by uuid references public.profiles (id) on delete set null default auth.uid(),
  changes     jsonb not null check (jsonb_typeof(changes) = 'object'),  -- subconjunto de columnas de couple_settings
  status      public.proposal_status not null default 'pending',
  decided_by  uuid references public.profiles (id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create unique index settings_proposals_one_pending_idx on public.settings_proposals (couple_id) where status = 'pending';
create index settings_proposals_couple_idx on public.settings_proposals (couple_id, created_at desc);
create index settings_proposals_proposed_by_idx on public.settings_proposals (proposed_by);
create index settings_proposals_decided_by_idx on public.settings_proposals (decided_by);

-- -----------------------------------------------------------------------------
-- 3. Planificador, mapa y calendario
--    Todas las tablas enlazables llevan unique (couple_id, id) para que las FK
--    sean compuestas: imposible enlazar un sitio/plan de otra pareja.
-- -----------------------------------------------------------------------------

create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  type          public.plan_type not null,
  name          text not null check (char_length(name) between 1 and 80),
  icon          text not null check (char_length(icon) between 1 and 16),   -- emoji
  cover         public.plan_cover not null default 'granate',
  destination   text,
  start_date    date not null,
  end_date      date not null,
  attendees     public.attendees not null default 'both',
  budget_cents  integer check (budget_cents > 0),                            -- opcional
  -- "¿Cómo se paga?": reparto que se precarga en los gastos del plan
  default_split_mode   public.split_mode not null default 'half'
                       check (default_split_mode in ('half', 'proportional', 'custom', 'pot')),
  default_split_pct_m1 smallint check (default_split_pct_m1 between 0 and 100),
  notes         text,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (couple_id, id),
  check (end_date >= start_date)
);
create index plans_couple_dates_idx on public.plans (couple_id, start_date, end_date);
create index plans_created_by_idx on public.plans (created_by);

-- Colecciones del mapa. Un plan tiene exactamente una colección automática (plan_id).
-- Un sitio puede estar en varias colecciones (collection_places).
create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  icon        text not null check (char_length(icon) between 1 and 16),
  plan_id     uuid unique,
  visible_to_partner boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (couple_id, id),
  -- Si se borra el plan, la colección se conserva como colección normal.
  foreign key (couple_id, plan_id) references public.plans (couple_id, id) on delete set null (plan_id),
  check (plan_id is null or visible_to_partner)
);
create index collections_couple_idx on public.collections (couple_id);
create index collections_created_by_idx on public.collections (created_by);

create table public.places (
  id                uuid primary key default gen_random_uuid(),
  couple_id         uuid not null references public.couples (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 120),
  address           text,
  lat               double precision not null check (lat between -90 and 90),
  lng               double precision not null check (lng between -180 and 180),
  provider          public.place_provider not null default 'google',
  provider_place_id text,                           -- place_id de Google
  source_url        text,                           -- enlace compartido (Instagram, TikTok, Maps)
  category          public.place_category not null default 'other',
  status            public.place_status not null default 'want_to_go',
  -- Colección principal: su icono es el del pin en la vista general del mapa.
  -- La FK (más abajo) apunta a collection_places, así que solo puede ser una colección a la que pertenece.
  -- La mantiene un trigger: al entrar en la primera colección se fija; si se quita, pasa a la más antigua
  -- que le quede; sin colecciones queda null y el pin usa el icono de la categoría.
  primary_collection_id uuid,
  visible_to_partner boolean not null default true,
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (couple_id, id),
  check ((provider = 'google') = (provider_place_id is not null))
);
create unique index places_provider_uidx on public.places (couple_id, provider_place_id) where provider_place_id is not null;
create index places_couple_status_idx on public.places (couple_id, status);
create index places_created_by_idx on public.places (created_by);

-- Sitios de cada colección (muchos a muchos). Quitar un sitio de una colección no necesita aprobación.
create table public.collection_places (
  collection_id uuid not null,
  place_id      uuid not null,
  couple_id     uuid not null,
  added_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  added_at      timestamptz not null default now(),
  primary key (collection_id, place_id),
  foreign key (couple_id, collection_id) references public.collections (couple_id, id) on delete cascade,
  foreign key (couple_id, place_id)      references public.places (couple_id, id) on delete cascade
);
create index collection_places_place_idx on public.collection_places (place_id, added_at);
create index collection_places_couple_idx on public.collection_places (couple_id);
create index collection_places_added_by_idx on public.collection_places (added_by);

alter table public.places
  add foreign key (primary_collection_id, id) references public.collection_places (collection_id, place_id)
  on delete set null (primary_collection_id);

-- Valoración y nota de cada persona sobre un sitio.
create table public.place_notes (
  place_id   uuid not null,
  couple_id  uuid not null,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  rating     numeric(2, 1) check (rating between 0.5 and 5 and rating * 2 = trunc(rating * 2)),  -- medias estrellas
  note       text check (char_length(note) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id),
  foreign key (couple_id, place_id) references public.places (couple_id, id) on delete cascade
);
create index place_notes_user_idx on public.place_notes (user_id);
create index place_notes_couple_idx on public.place_notes (couple_id);

-- Ideas "algún día": sin fecha, con sitio opcional. Al convertirlas se crea el plan/evento y se borra la idea.
create table public.ideas (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  icon       text check (char_length(icon) between 1 and 16),
  type       public.plan_type not null default 'other',
  place_id   uuid,
  notes      text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  version    integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (couple_id, place_id) references public.places (couple_id, id) on delete set null (place_id)
);
create index ideas_couple_idx on public.ideas (couple_id, created_at desc);
create index ideas_place_idx on public.ideas (place_id);
create index ideas_created_by_idx on public.ideas (created_by);

-- Eventos del calendario. El itinerario de un plan son eventos con plan_id.
-- Fechas en hora local (start_date/start_time) + zona; starts_at/ends_at los calcula un trigger.
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  start_date   date not null,
  start_time   time,                               -- null: todo el día o franja
  end_date     date,
  end_time     time,
  all_day      boolean not null default false,
  time_slot    public.time_slot,                   -- itinerario: mañana / tarde / noche
  time_zone    text not null default 'Europe/Madrid',
  starts_at    timestamptz not null,               -- calculado (trigger)
  ends_at      timestamptz not null,               -- calculado (trigger)
  recurrence   public.recurrence not null default 'none',
  recurrence_until date,
  attendees    public.attendees not null default 'both',
  place_id     uuid,
  plan_id      uuid,
  position     integer not null default 0,         -- orden dentro del día en el itinerario
  budget_cents integer check (budget_cents > 0),
  ask_who_paid boolean not null default false,     -- al terminar, preguntar "¿Quién pagó?"
  who_paid_resolved_at timestamptz,                -- gasto creado o pregunta descartada
  reminder_minutes integer check (reminder_minutes >= 0),
  notes        text,
  -- Evento secreto: solo lo ve quien lo crea (preparar una sorpresa). Se decide al crearlo;
  -- después se puede revelar (true → false) pero no volver a ocultar. No puede ir en un plan.
  is_secret    boolean not null default false,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (couple_id, id),
  check (not (is_secret and plan_id is not null)),
  foreign key (couple_id, place_id) references public.places (couple_id, id) on delete set null (place_id),
  -- El itinerario pertenece al plan: si se borra el plan, se borran sus eventos (los gastos se conservan).
  foreign key (couple_id, plan_id) references public.plans (couple_id, id) on delete cascade,
  check (end_date is null or end_date >= start_date),
  check (not all_day or (start_time is null and end_time is null and time_slot is null)),
  check (time_slot is null or start_time is null),
  check (end_time is null or start_time is not null),
  check (recurrence_until is null or recurrence <> 'none'),
  check (recurrence = 'none' or not ask_who_paid)  -- "¿Quién pagó?" solo en eventos únicos
);
create index events_couple_date_idx on public.events (couple_id, start_date);
create index events_plan_idx on public.events (plan_id, start_date, position);
create index events_place_idx on public.events (place_id);
create index events_who_paid_idx on public.events (couple_id, ends_at) where ask_who_paid and who_paid_resolved_at is null;
create index events_created_by_idx on public.events (created_by);

-- Ocurrencias anuladas de un evento que se repite ("eliminar solo este").
create table public.event_exceptions (
  event_id        uuid not null,
  couple_id       uuid not null,
  occurrence_date date not null,
  created_at      timestamptz not null default now(),
  primary key (event_id, occurrence_date),
  foreign key (couple_id, event_id) references public.events (couple_id, id) on delete cascade
);
create index event_exceptions_couple_idx on public.event_exceptions (couple_id);

-- Pagos recurrentes (suscripciones, facturas). Un pago puntual es frequency = 'once'.
create table public.recurring_payments (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  category      public.expense_category not null default 'subscriptions',
  amount_cents  integer not null check (amount_cents > 0),   -- fijo, o aproximado si is_variable
  is_variable   boolean not null default false,
  frequency     public.payment_frequency not null default 'monthly',
  day_of_month  smallint check (day_of_month between 1 and 31),
  month_of_year smallint check (month_of_year between 1 and 12),
  start_date    date not null default current_date,          -- en 'once', es la fecha del cobro
  end_date      date,
  paused        boolean not null default false,
  paid_by       public.party not null,
  split_mode    public.split_mode not null,
  split_pct_m1  smallint check (split_pct_m1 between 0 and 100),
  reminder_days smallint check (reminder_days in (0, 1, 3)), -- null = sin aviso
  visible_to_partner boolean not null default true,
  show_in_calendar   boolean not null default true,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (couple_id, id),
  check (frequency = 'once' or day_of_month is not null),
  check (frequency <> 'yearly' or month_of_year is not null),
  check (end_date is null or end_date >= start_date),
  check ((split_mode in ('half', 'proportional', 'custom')) = (split_pct_m1 is not null)),
  check (visible_to_partner or (paid_by = 'm1' and split_mode = 'only_m1') or (paid_by = 'm2' and split_mode = 'only_m2'))
);
create index recurring_payments_couple_idx on public.recurring_payments (couple_id);
create index recurring_payments_created_by_idx on public.recurring_payments (created_by);

-- Cada cobro concreto de un recurrente. Se materializa cuando vence (job diario);
-- los futuros se calculan al vuelo para el calendario.
create table public.recurring_occurrences (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null,
  recurring_id uuid not null,
  due_date     date not null,
  status       public.occurrence_status not null default 'pending',  -- pending = falta el importe real
  amount_cents integer check (amount_cents > 0),                      -- importe real (copiado del gasto)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (couple_id, id),
  unique (recurring_id, due_date),
  foreign key (couple_id, recurring_id) references public.recurring_payments (couple_id, id) on delete cascade
);
create index recurring_occurrences_couple_idx on public.recurring_occurrences (couple_id, status, due_date);

-- Tareas y reservas de un plan.
create table public.plan_tasks (
  id              uuid primary key default gen_random_uuid(),
  couple_id       uuid not null,
  plan_id         uuid not null,
  kind            public.task_kind not null default 'task',
  title           text not null check (char_length(title) between 1 and 120),
  detail          text,
  assignee        public.party check (assignee <> 'pot'),
  status          public.task_status not null default 'pending',
  done_at         timestamptz,
  done_by         uuid references public.profiles (id) on delete set null,
  due_date        date,
  estimated_cents integer check (estimated_cents > 0),   -- "Estimado pendiente" del viaje
  place_id        uuid,
  event_id        uuid,
  expense_id      uuid,                                   -- FK tras crear expenses
  position        integer not null default 0,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (couple_id, plan_id)  references public.plans  (couple_id, id) on delete cascade,
  foreign key (couple_id, place_id) references public.places (couple_id, id) on delete set null (place_id),
  foreign key (couple_id, event_id) references public.events (couple_id, id) on delete set null (event_id)
);
create index plan_tasks_plan_idx on public.plan_tasks (plan_id, position);
create index plan_tasks_couple_idx on public.plan_tasks (couple_id);
create index plan_tasks_place_idx on public.plan_tasks (place_id);
create index plan_tasks_event_idx on public.plan_tasks (event_id);
create index plan_tasks_expense_idx on public.plan_tasks (expense_id);
create index plan_tasks_done_by_idx on public.plan_tasks (done_by);
create index plan_tasks_created_by_idx on public.plan_tasks (created_by);

-- -----------------------------------------------------------------------------
-- 4. Dinero: liquidaciones, gastos y bote
-- -----------------------------------------------------------------------------

-- Liquidación entre los dos: cubre un conjunto de gastos concretos (expenses.settlement_id).
-- Solo se escribe por RPC (create_settlement / respond_settlement / undo_settlement).
create table public.settlements (
  id           uuid primary key,                    -- generado en el cliente
  couple_id    uuid not null references public.couples (id) on delete cascade,
  from_slot    public.party not null,               -- quien paga
  to_slot      public.party not null,               -- quien recibe
  amount_cents integer not null check (amount_cents >= 0),  -- neto de los gastos cubiertos (informativo)
  method       public.settlement_method not null,
  status       public.settlement_status not null default 'pending',
  note         text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  responded_by uuid references public.profiles (id) on delete set null,
  responded_at timestamptz,
  unique (couple_id, id),
  check (from_slot <> to_slot and from_slot <> 'pot' and to_slot <> 'pot'),
  check ((status = 'pending') = (responded_at is null))
);
create index settlements_couple_idx on public.settlements (couple_id, created_at desc);
create index settlements_pending_idx on public.settlements (couple_id) where status = 'pending';
create index settlements_created_by_idx on public.settlements (created_by);
create index settlements_responded_by_idx on public.settlements (responded_by);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),   -- lo genera el cliente (idempotencia offline)
  couple_id     uuid not null references public.couples (id) on delete cascade,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  concept       text not null check (char_length(concept) between 1 and 120),
  amount_cents  integer not null check (amount_cents > 0),
  currency      char(3) not null default 'EUR',
  category      public.expense_category not null,
  spent_on      date not null,
  -- Quién pagó (tú, tu pareja o el bote) ≠ de quién es (split_mode + shares)
  paid_by       public.party not null,
  split_mode    public.split_mode not null,
  split_pct_m1  smallint check (split_pct_m1 between 0 and 100),  -- % de m1 en half/proportional/custom
  share_m1_cents  integer not null default 0,   -- calculados por trigger a partir de split_mode y split_pct_m1
  share_m2_cents  integer not null default 0,
  share_pot_cents integer not null default 0,
  visible_to_partner boolean not null default true,
  -- Vínculos opcionales + copia en texto por si se borra lo vinculado
  event_id      uuid,
  place_id      uuid,
  plan_id       uuid,
  event_title_snapshot text,
  place_name_snapshot  text,
  plan_name_snapshot   text,
  plan_icon_snapshot   text,
  receipt_path  text,                      -- Storage: receipts/{couple_id}/{expense_id}/{archivo}
  recurring_occurrence_id uuid unique,     -- si viene de un pago recurrente
  settlement_id uuid,                      -- liquidación que lo cubre (solo la cambian las RPC)
  notes         text,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (couple_id, id),
  foreign key (couple_id, event_id) references public.events (couple_id, id) on delete set null (event_id),
  foreign key (couple_id, place_id) references public.places (couple_id, id) on delete set null (place_id),
  foreign key (couple_id, plan_id)  references public.plans  (couple_id, id) on delete set null (plan_id),
  foreign key (couple_id, recurring_occurrence_id) references public.recurring_occurrences (couple_id, id)
    on delete set null (recurring_occurrence_id),
  foreign key (couple_id, settlement_id) references public.settlements (couple_id, id)
    on delete set null (settlement_id),
  -- Las partes suman el total
  check (share_m1_cents >= 0 and share_m2_cents >= 0 and share_pot_cents >= 0
         and share_m1_cents + share_m2_cents + share_pot_cents = amount_cents),
  -- Las partes son coherentes con el modo de reparto
  check (case split_mode
           when 'pot'     then share_pot_cents = amount_cents
           when 'only_m1' then share_m1_cents  = amount_cents
           when 'only_m2' then share_m2_cents  = amount_cents
           else share_pot_cents = 0 end),
  check ((split_mode in ('half', 'proportional', 'custom')) = (split_pct_m1 is not null)),
  check (split_mode <> 'half' or split_pct_m1 = 50),
  -- Solo puede ser privado un gasto 100 % propio y pagado por uno mismo (no afecta al saldo)
  check (visible_to_partner or (paid_by = 'm1' and split_mode = 'only_m1') or (paid_by = 'm2' and split_mode = 'only_m2'))
);
-- Historial (por mes, más reciente primero) y filtros
create index expenses_history_idx  on public.expenses (couple_id, spent_on desc, created_at desc);
create index expenses_category_idx on public.expenses (couple_id, category, spent_on desc);
-- Saldo y "Saldar": solo los gastos sin liquidar
create index expenses_open_idx     on public.expenses (couple_id) where settlement_id is null;
create index expenses_plan_idx     on public.expenses (plan_id);
create index expenses_event_idx    on public.expenses (event_id);
create index expenses_place_idx    on public.expenses (place_id);
create index expenses_settlement_idx on public.expenses (settlement_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index expenses_concept_trgm_idx on public.expenses using gin (concept extensions.gin_trgm_ops);

alter table public.plan_tasks
  add foreign key (couple_id, expense_id) references public.expenses (couple_id, id) on delete set null (expense_id);

-- Movimientos del bote: aportaciones (persona → bote), reembolsos (bote → persona) y ajustes.
create table public.pot_movements (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  kind         public.pot_movement_kind not null,
  member_slot  public.party check (member_slot <> 'pot'),
  amount_cents integer not null,
  occurred_on  date not null default current_date,
  is_auto      boolean not null default false,     -- generada por la aportación automática
  period       date,                               -- mes (día 1) de la aportación automática
  note         text,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (case kind
           when 'adjustment' then amount_cents <> 0 and member_slot is null   -- con signo: cuadrar con el banco
           else amount_cents > 0 and member_slot is not null end),
  check (is_auto = (period is not null)),
  check (not is_auto or kind = 'contribution')
);
create unique index pot_movements_auto_uidx on public.pot_movements (couple_id, member_slot, period) where is_auto;
create index pot_movements_couple_idx on public.pot_movements (couple_id, occurred_on desc);
create index pot_movements_created_by_idx on public.pot_movements (created_by);

-- Solicitudes de borrado: lo compartido solo se borra si la otra persona lo aprueba.
-- Mientras está pendiente, la app muestra el elemento como "Pendiente de borrar".
-- Solo se escribe por RPC (request_deletion / respond_deletion / cancel_deletion).
create table public.deletion_requests (
  id              uuid primary key default gen_random_uuid(),   -- generado en el cliente
  couple_id       uuid not null references public.couples (id) on delete cascade,
  target_type     public.deletion_target not null,
  target_id       uuid not null,
  occurrence_date date,             -- eventos que se repiten: borrar solo esa fecha
  target_label    text not null,    -- "David quiere borrar «Cena en Taberna El Olivo»"
  requested_by    uuid references public.profiles (id) on delete set null,
  status          public.deletion_status not null default 'pending',
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  decided_by      uuid references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  check (occurrence_date is null or target_type = 'event'),
  check ((status = 'pending') = (decided_at is null))
);
-- Una sola solicitud pendiente por elemento (y fecha, si es una ocurrencia).
create unique index deletion_requests_pending_uidx
  on public.deletion_requests (target_type, target_id, coalesce(occurrence_date, '-infinity'::date))
  where status = 'pending';
create index deletion_requests_target_idx on public.deletion_requests (target_id) where status = 'pending';
create index deletion_requests_couple_idx on public.deletion_requests (couple_id, created_at desc);
create index deletion_requests_requested_by_idx on public.deletion_requests (requested_by);
create index deletion_requests_decided_by_idx on public.deletion_requests (decided_by);

-- Tokens de Expo Push de cada dispositivo.
create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- -----------------------------------------------------------------------------
-- 5. Funciones auxiliares (esquema private)
-- -----------------------------------------------------------------------------

-- Pareja activa de quien llama. security definer: evita la recursión de RLS en couple_members.
create function private.my_couple_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.couple_id from public.couple_members m
  where m.user_id = auth.uid() and m.left_at is null
$$;

create function private.my_slot() returns public.party
language sql stable security definer set search_path = '' as $$
  select m.slot from public.couple_members m
  where m.user_id = auth.uid() and m.left_at is null
$$;

create function private.slot_of(p_couple uuid, p_user uuid) returns public.party
language sql stable security definer set search_path = '' as $$
  select m.slot from public.couple_members m where m.couple_id = p_couple and m.user_id = p_user
$$;

create function private.active_member_count(p_couple uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.couple_members m where m.couple_id = p_couple and m.left_at is null
$$;

-- Reparto en céntimos. Regla de redondeo única (cliente y servidor):
--   m1 = round(total * pct / 100) (mitades hacia arriba), m2 = total - m1.
-- En JS: Math.round(amountCents * pct / 100) da lo mismo porque pct es entero.
create function private.compute_shares(p_amount integer, p_mode public.split_mode, p_pct smallint,
                                       out m1 integer, out m2 integer, out pot integer)
language plpgsql immutable set search_path = '' as $$
begin
  m1 := 0; m2 := 0; pot := 0;
  case p_mode
    when 'pot'     then pot := p_amount;
    when 'only_m1' then m1 := p_amount;
    when 'only_m2' then m2 := p_amount;
    else
      m1 := round(p_amount * p_pct / 100.0)::integer;
      m2 := p_amount - m1;
  end case;
end $$;

-- Día p_day del mes de p_month, ajustado al último día si el mes es más corto (31 → 30/28).
create function private.clamp_day(p_month date, p_day integer) returns date
language sql immutable set search_path = '' as $$
  select date_trunc('month', p_month::timestamp)::date
         + (least(p_day, extract(day from date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::integer) - 1)
$$;

-- Fechas en que ocurre un evento repetido dentro de [p_from, p_to].
-- Se calcula siempre desde la fecha original (31 ene → 28 feb → 31 mar), sin deriva.
create function private.occurrence_dates(p_start date, p_rec public.recurrence, p_until date, p_from date, p_to date)
returns setof date
language sql immutable set search_path = '' as $$
  select d from (
    select case p_rec
             when 'weekly'  then p_start + 7 * n
             when 'monthly' then (p_start::timestamp + make_interval(months => n))::date
             when 'yearly'  then (p_start::timestamp + make_interval(years => n))::date
             else p_start end as d
    from generate_series(0, case p_rec
             when 'none'    then 0
             when 'weekly'  then greatest(0, (p_to - p_start) / 7)
             when 'monthly' then greatest(0, (extract(year from p_to)::integer - extract(year from p_start)::integer) * 12
                                            + extract(month from p_to)::integer - extract(month from p_start)::integer)
             when 'yearly'  then greatest(0, extract(year from p_to)::integer - extract(year from p_start)::integer)
           end) as n
  ) s
  where d between p_from and p_to and (p_until is null or d <= p_until)
$$;

-- Fechas de cobro de un pago recurrente dentro de [p_from, p_to].
create function private.payment_due_dates(p_freq public.payment_frequency, p_day smallint, p_month smallint,
                                          p_start date, p_end date, p_from date, p_to date)
returns setof date
language sql immutable set search_path = '' as $$
  select d from (
    select p_start as d where p_freq = 'once'
    union all
    select private.clamp_day(m::date, p_day)
    from generate_series(date_trunc('month', greatest(p_from, p_start)::timestamp), p_to::timestamp, interval '1 month') m
    where p_freq = 'monthly'
    union all
    select private.clamp_day(make_date(y, p_month, 1), p_day)
    from generate_series(extract(year from greatest(p_from, p_start))::integer, extract(year from p_to)::integer) y
    where p_freq = 'yearly'
  ) s
  where d between greatest(p_from, p_start) and least(p_to, coalesce(p_end, p_to))
$$;

-- Código de invitación aleatorio (31 símbolos sin ambigüedad, 6 caracteres ≈ 887 millones).
create function private.generate_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());  -- bytes 0-5 del uuid v4 son aleatorios
  v_code  text := '';
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, 1 + get_byte(v_bytes, i) % length(v_alphabet), 1);
  end loop;
  return v_code;
end $$;

-- ¿La escritura viene directamente de la API (rol del cliente) o de una RPC/trigger/job?
-- Dentro de una función security definer, current_user es el propietario (postgres).
create function private.is_client_write() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('authenticated', 'anon')
$$;

-- -----------------------------------------------------------------------------
-- 6. Triggers
-- -----------------------------------------------------------------------------

-- updated_at + version (control de concurrencia optimista: UPDATE ... WHERE version = n)
create function private.touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.version := old.version + 1; else new.version := 1; end if;
  return new;
end $$;

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- created_by siempre es quien llama (no se puede suplantar).
create function private.force_created_by() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if private.is_client_write() then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

-- Para tablas con visible_to_partner: además, solo quien lo creó cambia la visibilidad.
create function private.guard_owned_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if private.is_client_write() then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
    if private.is_client_write()
       and new.visible_to_partner is distinct from old.visible_to_partner
       and old.created_by is distinct from auth.uid() then
      raise exception 'Solo quien lo creó puede cambiar su visibilidad' using errcode = 'TW013';
    end if;
  end if;
  return new;
end $$;

-- Perfil automático al registrarse.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 40))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function private.handle_new_user();

-- Miembros: los campos estructurales no se tocan desde el cliente.
create function private.members_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.couple_id <> old.couple_id or new.user_id <> old.user_id or new.slot <> old.slot
     or new.joined_at <> old.joined_at then
    raise exception 'No se puede cambiar la membresía' using errcode = 'TW040';
  end if;
  if private.is_client_write() and new.left_at is distinct from old.left_at then
    raise exception 'Usa leave_couple() para salir del espacio' using errcode = 'TW040';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Ajustes: quién cambió por última vez.
create function private.settings_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.couple_id <> old.couple_id then
    raise exception 'No se puede cambiar la pareja' using errcode = 'TW040';
  end if;
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end $$;

-- Gastos: reglas de negocio que no caben en un CHECK.
create function private.expenses_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_client   boolean := private.is_client_write();
  v_pot      boolean;
  v_pct      smallint;
  v_currency char(3);
  v_slot     public.party;
begin
  if tg_op = 'INSERT' then
    if v_client then
      new.created_by := auth.uid();
      if new.settlement_id is not null then
        raise exception 'settlement_id solo lo asignan las RPC de liquidación' using errcode = 'TW015';
      end if;
    end if;
  else
    new.created_by := old.created_by;
    if v_client and new.settlement_id is distinct from old.settlement_id then
      raise exception 'settlement_id solo lo asignan las RPC de liquidación' using errcode = 'TW015';
    end if;
    if v_client and new.visible_to_partner is distinct from old.visible_to_partner
       and old.created_by is distinct from auth.uid() then
      raise exception 'Solo quien lo creó puede cambiar su visibilidad' using errcode = 'TW013';
    end if;
  end if;

  -- Porcentaje: a medias = 50; proporcional sin % = el de los ajustes; el resto no lleva %.
  if new.split_mode = 'half' then
    new.split_pct_m1 := 50;
  elsif new.split_mode = 'proportional' and new.split_pct_m1 is null then
    select s.proportional_pct_m1 into new.split_pct_m1 from public.couple_settings s where s.couple_id = new.couple_id;
  elsif new.split_mode not in ('proportional', 'custom') then
    new.split_pct_m1 := null;
  end if;

  -- Las partes las calcula siempre el servidor (lo que mande el cliente se ignora).
  select c.m1, c.m2, c.pot into new.share_m1_cents, new.share_m2_cents, new.share_pot_cents
  from private.compute_shares(new.amount_cents, new.split_mode, new.split_pct_m1) c;

  -- Un gasto saldado (o pendiente de confirmar) no cambia de importe ni de reparto.
  if tg_op = 'UPDATE' and old.settlement_id is not null and new.settlement_id is not null and (
       new.amount_cents <> old.amount_cents or new.paid_by <> old.paid_by or new.split_mode <> old.split_mode
       or new.split_pct_m1 is distinct from old.split_pct_m1 or new.currency <> old.currency) then
    raise exception 'Este gasto ya está saldado: deshaz la liquidación para cambiar el importe o el reparto'
      using errcode = 'TW010';
  end if;

  -- Moneda única por pareja (los saldos suman céntimos sin convertir).
  if tg_op = 'INSERT' or new.currency <> old.currency then
    select c.currency into v_currency from public.couples c where c.id = new.couple_id;
    if new.currency <> v_currency then
      raise exception 'La moneda del gasto debe ser %', v_currency using errcode = 'TW014';
    end if;
  end if;

  -- El bote solo se puede usar si está activado (se comprueba al crearlo o cambiarlo).
  if (new.paid_by = 'pot' or new.split_mode = 'pot')
     and (tg_op = 'INSERT' or new.paid_by <> old.paid_by or new.split_mode <> old.split_mode) then
    select s.pot_enabled into v_pot from public.couple_settings s where s.couple_id = new.couple_id;
    if not coalesce(v_pot, false) then
      raise exception 'El bote común no está activado' using errcode = 'TW012';
    end if;
  end if;

  -- Un gasto privado tiene que ser de quien lo creó (el CHECK ya exige paid_by = dueño).
  if not new.visible_to_partner then
    v_slot := private.slot_of(new.couple_id, new.created_by);
    if v_slot is null or new.paid_by <> v_slot then
      raise exception 'Un gasto privado tiene que ser solo tuyo y pagado por ti' using errcode = 'TW011';
    end if;
  end if;

  -- Solo se puede enlazar un evento que quien escribe puede ver (no el evento secreto de la pareja).
  if v_client and new.event_id is not null and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id)
     and not exists (select 1 from public.events e where e.id = new.event_id) then
    raise exception 'Evento no encontrado' using errcode = 'TW060';
  end if;

  -- Si va a un evento de un plan, cuenta también en el plan.
  if new.event_id is not null and new.plan_id is null
     and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id) then
    select e.plan_id into new.plan_id from public.events e where e.id = new.event_id;
  end if;

  return new;
end $$;

create function private.expenses_before_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.settlement_id is not null and private.is_client_write() then
    raise exception 'Este gasto ya está saldado: deshaz la liquidación para borrarlo' using errcode = 'TW010';
  end if;
  return old;
end $$;

-- Efectos secundarios de un gasto: cierra el "¿Quién pagó?" del evento y marca el cobro recurrente.
create function private.expenses_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if new.event_id is not null and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id) then
      update public.events set who_paid_resolved_at = now()
      where id = new.event_id and who_paid_resolved_at is null;
    end if;
    if new.recurring_occurrence_id is not null then
      update public.recurring_occurrences set status = 'paid', amount_cents = new.amount_cents, updated_at = now()
      where id = new.recurring_occurrence_id
        and (status <> 'paid' or amount_cents is distinct from new.amount_cents);
    end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.recurring_occurrence_id is not null
     and (tg_op = 'DELETE' or new.recurring_occurrence_id is distinct from old.recurring_occurrence_id) then
    update public.recurring_occurrences set status = 'pending', amount_cents = null, updated_at = now()
    where id = old.recurring_occurrence_id and status = 'paid';
  end if;
  return null;
end $$;

-- Recurrentes: % por defecto, privado solo si es propio, bote activado.
create function private.recurring_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare v_pot boolean;
begin
  if new.split_mode = 'half' then
    new.split_pct_m1 := 50;
  elsif new.split_mode = 'proportional' and new.split_pct_m1 is null then
    select s.proportional_pct_m1 into new.split_pct_m1 from public.couple_settings s where s.couple_id = new.couple_id;
  elsif new.split_mode not in ('proportional', 'custom') then
    new.split_pct_m1 := null;
  end if;
  if not new.visible_to_partner and new.paid_by is distinct from private.slot_of(new.couple_id, new.created_by) then
    raise exception 'Un pago privado tiene que ser solo tuyo y pagado por ti' using errcode = 'TW011';
  end if;
  if (new.paid_by = 'pot' or new.split_mode = 'pot')
     and (tg_op = 'INSERT' or new.paid_by <> old.paid_by or new.split_mode <> old.split_mode) then
    select s.pot_enabled into v_pot from public.couple_settings s where s.couple_id = new.couple_id;
    if not coalesce(v_pot, false) then
      raise exception 'El bote común no está activado' using errcode = 'TW012';
    end if;
  end if;
  return new;
end $$;

-- Eventos: instantes absolutos para avisos y para saber cuándo preguntar "¿Quién pagó?".
create function private.events_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.starts_at := (new.start_date + coalesce(new.start_time, time '00:00')) at time zone new.time_zone;
  new.ends_at := case
    when new.end_time is not null
      then (coalesce(new.end_date, new.start_date) + new.end_time) at time zone new.time_zone
    when new.start_time is not null and new.end_date is null
      then new.starts_at + interval '90 minutes'          -- cena a las 21:30 → pregunta a las 23:00
    else (coalesce(new.end_date, new.start_date) + 1)::timestamp at time zone new.time_zone
  end;
  if new.ends_at < new.starts_at then
    raise exception 'El evento termina antes de empezar' using errcode = 'TW050';
  end if;
  -- Un evento compartido no se puede volver secreto: la pareja ya lo tiene en su caché y
  -- Realtime no le avisaría (la fila deja de pasar su RLS). Revelarlo sí se puede.
  if tg_op = 'UPDATE' and new.is_secret and not old.is_secret then
    raise exception 'Un evento compartido no se puede volver secreto' using errcode = 'TW051';
  end if;
  return new;
end $$;

-- Tareas: marca de hecho coherente.
create function private.plan_tasks_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.done_at := now();
    new.done_by := auth.uid();
  elsif new.status = 'pending' then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end $$;

-- Antes de borrar un sitio/evento/plan, sus gastos guardan el nombre como texto.
-- security definer: también actualiza gastos privados de la pareja (que RLS no deja ver).
create function private.snapshot_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'places' then
    update public.expenses set place_name_snapshot = old.name where place_id = old.id;
  elsif tg_table_name = 'events' then
    -- El título de un evento secreto solo se copia en gastos que la pareja no ve.
    update public.expenses set event_title_snapshot = old.title
    where event_id = old.id and (not old.is_secret or not visible_to_partner);
  elsif tg_table_name = 'plans' then
    update public.expenses set plan_name_snapshot = old.name, plan_icon_snapshot = old.icon where plan_id = old.id;
  end if;
  return old;
end $$;

-- Cada plan tiene su colección automática con su nombre e icono.
create function private.plans_sync_collection() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.collections (couple_id, name, icon, plan_id, visible_to_partner, created_by)
    values (new.couple_id, left(new.name, 60), new.icon, new.id, true, new.created_by);
  elsif new.name is distinct from old.name or new.icon is distinct from old.icon then
    update public.collections set name = left(new.name, 60), icon = new.icon where plan_id = new.id;
  end if;
  return null;
end $$;

-- Colección principal de un sitio: se fija al entrar en su primera colección y, si se quita la
-- principal, pasa a la colección más antigua que le quede (o null: icono de la categoría).
-- La FK de places pone null antes (los triggers RI_* se disparan antes que y_*).
create function private.collection_places_sync_primary() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.places set primary_collection_id = new.collection_id
    where id = new.place_id and primary_collection_id is null;
  else
    update public.places p set primary_collection_id = (
      select cp.collection_id from public.collection_places cp
      where cp.place_id = p.id order by cp.added_at, cp.collection_id limit 1)
    where p.id = old.place_id and p.primary_collection_id is null;
  end if;
  return null;
end $$;

-- Si un elemento desaparece por otra vía (cascada de un plan, salida de la pareja…),
-- sus solicitudes de borrado pendientes se cancelan.
create function private.cancel_deletion_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.deletion_requests set status = 'cancelled', decided_at = now()
  where target_id = old.id and status = 'pending';
  return null;
end $$;

-- Asignación de triggers (se disparan por orden alfabético: a_ → b_ → z_).
create trigger z_touch before update on public.profiles        for each row execute function private.set_updated_at();
create trigger z_touch before update on public.couples         for each row execute function private.set_updated_at();
create trigger a_guard before update on public.couple_members  for each row execute function private.members_before_update();
create trigger a_guard before update on public.couple_settings for each row execute function private.settings_before_update();
create trigger z_touch before insert or update on public.couple_settings for each row execute function private.touch();

create trigger a_guard before insert or update on public.plans       for each row execute function private.force_created_by();
create trigger z_touch before insert or update on public.plans       for each row execute function private.touch();
create trigger y_collection after insert or update on public.plans   for each row execute function private.plans_sync_collection();
create trigger y_snapshot before delete on public.plans              for each row execute function private.snapshot_before_delete();

create trigger a_guard before insert or update on public.collections for each row execute function private.guard_owned_row();
create trigger z_touch before insert or update on public.collections for each row execute function private.touch();

create trigger a_guard before insert or update on public.places      for each row execute function private.guard_owned_row();
create trigger z_touch before insert or update on public.places      for each row execute function private.touch();
create trigger y_snapshot before delete on public.places             for each row execute function private.snapshot_before_delete();

create trigger z_touch before insert or update on public.place_notes for each row execute function private.set_updated_at();

create trigger a_guard before insert or update on public.ideas       for each row execute function private.force_created_by();
create trigger z_touch before insert or update on public.ideas       for each row execute function private.touch();

create trigger a_guard before insert or update on public.events      for each row execute function private.force_created_by();
create trigger b_rules before insert or update on public.events      for each row execute function private.events_before_write();
create trigger z_touch before insert or update on public.events      for each row execute function private.touch();
create trigger y_snapshot before delete on public.events             for each row execute function private.snapshot_before_delete();

create trigger a_guard before insert or update on public.recurring_payments for each row execute function private.guard_owned_row();
create trigger b_rules before insert or update on public.recurring_payments for each row execute function private.recurring_before_write();
create trigger z_touch before insert or update on public.recurring_payments for each row execute function private.touch();
create trigger z_touch before update on public.recurring_occurrences        for each row execute function private.set_updated_at();

create trigger a_guard before insert or update on public.plan_tasks  for each row execute function private.force_created_by();
create trigger b_rules before insert or update on public.plan_tasks  for each row execute function private.plan_tasks_before_write();
create trigger z_touch before insert or update on public.plan_tasks  for each row execute function private.touch();

create trigger b_rules before insert or update on public.expenses    for each row execute function private.expenses_before_write();
create trigger z_touch before insert or update on public.expenses    for each row execute function private.touch();
create trigger b_rules_delete before delete on public.expenses       for each row execute function private.expenses_before_delete();
create trigger y_effects after insert or update or delete on public.expenses for each row execute function private.expenses_after_write();

create trigger a_guard before insert or update on public.pot_movements for each row execute function private.force_created_by();
create trigger z_touch before insert or update on public.pot_movements for each row execute function private.touch();

create trigger y_primary after insert or delete on public.collection_places for each row execute function private.collection_places_sync_primary();

create trigger y_cancel_requests after delete on public.expenses           for each row execute function private.cancel_deletion_requests();
create trigger y_cancel_requests after delete on public.places             for each row execute function private.cancel_deletion_requests();
create trigger y_cancel_requests after delete on public.events             for each row execute function private.cancel_deletion_requests();
create trigger y_cancel_requests after delete on public.recurring_payments for each row execute function private.cancel_deletion_requests();
create trigger y_cancel_requests after delete on public.plans              for each row execute function private.cancel_deletion_requests();
create trigger y_cancel_requests after delete on public.collections        for each row execute function private.cancel_deletion_requests();
create trigger y_cancel_requests after delete on public.pot_movements      for each row execute function private.cancel_deletion_requests();

create trigger z_touch before insert or update on public.push_tokens for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. Vistas de lectura (security_invoker: respetan la RLS de quien consulta)
-- -----------------------------------------------------------------------------

-- Efecto de cada gasto en las deudas. Convención: positivo = m2 debe a m1.
create view public.expense_effects with (security_invoker = true) as
select
  e.id, e.couple_id, e.plan_id, e.spent_on, e.paid_by, e.amount_cents, e.settlement_id,
  case e.paid_by when 'm1' then e.share_m2_cents
                 when 'm2' then -e.share_m1_cents
                 else 0 end                                         as m2_owes_m1_cents,
  case when e.paid_by = 'm1' then e.share_pot_cents else 0 end      as pot_owes_m1_cents,
  case when e.paid_by = 'm2' then e.share_pot_cents else 0 end      as pot_owes_m2_cents,
  coalesce(s.status = 'confirmed', false)                           as is_settled,
  coalesce(s.status = 'pending', false)                             as awaiting_confirmation
from public.expenses e
left join public.settlements s on s.id = e.settlement_id;

-- Resumen de cada plan: lo gastado, su aportación al saldo y lo estimado pendiente.
create view public.plan_summaries with (security_invoker = true) as
select
  p.id as plan_id, p.couple_id, p.budget_cents,
  count(x.id)::integer                                                       as expense_count,
  coalesce(sum(x.amount_cents), 0)::bigint                                   as spent_cents,
  coalesce(sum(x.m2_owes_m1_cents) filter (where not x.is_settled), 0)::bigint as open_m2_owes_m1_cents,
  (select coalesce(sum(t.estimated_cents), 0) from public.plan_tasks t
    where t.plan_id = p.id and t.status = 'pending' and t.expense_id is null)::bigint as pending_estimate_cents
from public.plans p
left join public.expense_effects x on x.plan_id = p.id
group by p.id;

-- Ficha de sitio: visitas, total gastado y próximo evento.
create view public.place_stats with (security_invoker = true) as
select
  p.id as place_id, p.couple_id,
  (select count(*) from (
     select e.spent_on from public.expenses e where e.place_id = p.id
     union
     select ev.start_date from public.events ev
      where ev.place_id = p.id and ev.recurrence = 'none' and ev.ends_at < now()) v)::integer as visit_count,
  (select coalesce(sum(e.amount_cents), 0) from public.expenses e where e.place_id = p.id)::bigint as total_spent_cents,
  (select min(ev.start_date) from public.events ev
    where ev.place_id = p.id and ev.starts_at >= now())                    as next_event_on
from public.places p;

-- Lo que espera una acción de quien mira (tarjetas de Inicio).
create view public.pending_actions with (security_invoker = true) as
select 'confirm_settlement'::text as kind, s.id as item_id, s.couple_id, s.created_at as since,
       s.amount_cents, null::text as title
from public.settlements s
where s.status = 'pending' and s.to_slot = (select private.my_slot())
  and s.couple_id = (select private.my_couple_id())
union all
select 'who_paid', e.id, e.couple_id, e.ends_at, e.budget_cents, e.title
from public.events e
where e.ask_who_paid and e.who_paid_resolved_at is null and e.ends_at <= now()
  and e.couple_id = (select private.my_couple_id())
union all
select 'variable_amount', o.id, o.couple_id, o.created_at, r.amount_cents, r.name
from public.recurring_occurrences o
join public.recurring_payments r on r.id = o.recurring_id
where o.status = 'pending' and o.couple_id = (select private.my_couple_id())
union all
select 'settings_proposal', p.id, p.couple_id, p.created_at, null::integer, null::text
from public.settings_proposals p
where p.status = 'pending' and p.proposed_by is distinct from (select auth.uid())
  and p.couple_id = (select private.my_couple_id())
union all
select 'approve_deletion', d.id, d.couple_id, d.created_at, null::integer, d.target_label
from public.deletion_requests d
where d.status = 'pending' and d.expires_at > now() and d.requested_by is distinct from (select auth.uid())
  and d.couple_id = (select private.my_couple_id());

-- -----------------------------------------------------------------------------
-- 8. RPC de lectura
-- -----------------------------------------------------------------------------

-- Saldo global desde el punto de vista de quien llama.
--   partner_owes_me_cents > 0: "María te debe"; < 0: "Debes … a María".
--   Incluye lo pendiente de confirmar (awaiting_confirmation_cents, mismo signo) para poder mostrarlo aparte.
create function public.get_balance()
returns table (
  partner_owes_me_cents       bigint,
  awaiting_confirmation_cents bigint,
  open_items                  integer,
  pot_enabled                 boolean,
  pot_balance_cents           bigint,
  pot_owes_me_cents           bigint,
  pot_owes_partner_cents      bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_couple uuid := private.my_couple_id();
  v_slot   public.party := private.my_slot();
  k        integer;
  v_net bigint; v_wait bigint; v_open integer;
  v_pot_m1 bigint; v_pot_m2 bigint; v_pot_spent bigint;
  v_pot_in bigint; v_reimb_m1 bigint; v_reimb_m2 bigint;
begin
  if v_couple is null then return; end if;
  k := case when v_slot = 'm1' then 1 else -1 end;

  select coalesce(sum(x.m2_owes_m1_cents) filter (where not x.is_settled), 0),
         coalesce(sum(x.m2_owes_m1_cents) filter (where x.awaiting_confirmation), 0),
         (count(*) filter (where x.settlement_id is null and x.m2_owes_m1_cents <> 0))::integer,
         coalesce(sum(x.pot_owes_m1_cents), 0),
         coalesce(sum(x.pot_owes_m2_cents), 0),
         coalesce(sum(x.amount_cents) filter (where x.paid_by = 'pot'), 0)
    into v_net, v_wait, v_open, v_pot_m1, v_pot_m2, v_pot_spent
  from public.expense_effects x
  where x.couple_id = v_couple;

  select coalesce(sum(case m.kind when 'reimbursement' then -m.amount_cents else m.amount_cents end), 0),
         coalesce(sum(m.amount_cents) filter (where m.kind = 'reimbursement' and m.member_slot = 'm1'), 0),
         coalesce(sum(m.amount_cents) filter (where m.kind = 'reimbursement' and m.member_slot = 'm2'), 0)
    into v_pot_in, v_reimb_m1, v_reimb_m2
  from public.pot_movements m
  where m.couple_id = v_couple;

  return query
  select k * v_net, k * v_wait, v_open, cs.pot_enabled,
         v_pot_in - v_pot_spent,
         case when v_slot = 'm1' then v_pot_m1 - v_reimb_m1 else v_pot_m2 - v_reimb_m2 end,
         case when v_slot = 'm1' then v_pot_m2 - v_reimb_m2 else v_pot_m1 - v_reimb_m1 end
  from public.couple_settings cs
  where cs.couple_id = v_couple;
end $$;

-- Calendario global de un rango: eventos (con repeticiones expandidas), cobros y planes (bandas).
-- Los eventos de un plan no salen sueltos: los representa la banda del plan.
create function public.calendar_range(p_from date, p_to date)
returns table (
  kind         text,      -- 'event' | 'payment' | 'plan'
  source_id    uuid,
  occurs_on    date,
  ends_on      date,
  title        text,
  icon         text,
  start_time   time,
  all_day      boolean,
  place_id     uuid,
  plan_id      uuid,
  amount_cents integer,
  is_estimate  boolean,   -- importe aproximado (pago variable aún sin importe real)
  status       text       -- pagos: scheduled | pending | paid
)
language sql stable security invoker set search_path = '' as $$
  select 'event', e.id, d.d, d.d + (coalesce(e.end_date, e.start_date) - e.start_date),
         e.title, null::text, e.start_time, e.all_day, e.place_id, e.plan_id,
         e.budget_cents, false, null::text
  from public.events e
  cross join lateral private.occurrence_dates(
      e.start_date, e.recurrence, e.recurrence_until,
      p_from - (coalesce(e.end_date, e.start_date) - e.start_date), p_to) as d(d)
  where e.couple_id = (select private.my_couple_id())
    and e.plan_id is null
    and not exists (select 1 from public.event_exceptions x where x.event_id = e.id and x.occurrence_date = d.d)
  union all
  select 'payment', r.id, d.d, d.d, r.name, null::text, null::time, true, null::uuid, null::uuid,
         coalesce(o.amount_cents, r.amount_cents), r.is_variable and o.amount_cents is null,
         coalesce(o.status::text, 'scheduled')
  from public.recurring_payments r
  cross join lateral private.payment_due_dates(
      r.frequency, r.day_of_month, r.month_of_year, r.start_date, r.end_date, p_from, p_to) as d(d)
  left join public.recurring_occurrences o on o.recurring_id = r.id and o.due_date = d.d
  where r.couple_id = (select private.my_couple_id())
    and r.show_in_calendar and not r.paused
    and o.status is distinct from 'skipped'
  union all
  select 'plan', p.id, p.start_date, p.end_date, p.name, p.icon, null::time, true, null::uuid, p.id,
         p.budget_cents, false, null::text
  from public.plans p
  where p.couple_id = (select private.my_couple_id())
    and p.start_date <= p_to and p.end_date >= p_from
  order by 3, 7 nulls first, 5
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC de escritura (security definer: validan todo a mano)
-- -----------------------------------------------------------------------------

-- Nuevo código de invitación (anula los anteriores sin usar).
create function public.create_invitation() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid := private.my_couple_id();
  v_code   text;
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;
  if exists (select 1 from public.couple_members m where m.couple_id = v_couple and m.slot = 'm2') then
    raise exception 'La pareja ya está completa' using errcode = 'TW003';
  end if;
  update public.couple_invitations set revoked_at = now()
  where couple_id = v_couple and used_at is null and revoked_at is null;
  loop
    v_code := private.generate_invite_code();
    begin
      insert into public.couple_invitations (couple_id, code, created_by) values (v_couple, v_code, auth.uid());
      exit;
    exception when unique_violation then
      -- colisión de código: probar otro
    end;
  end loop;
  return v_code;
end $$;

-- Crear el espacio de la pareja (quien empieza queda como m1).
create function public.create_couple() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'TW001';
  end if;
  if private.my_couple_id() is not null then
    raise exception 'Ya perteneces a una pareja' using errcode = 'TW002';
  end if;
  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.couples (created_by) values (v_uid) returning id into v_couple;
  insert into public.couple_members (couple_id, user_id, slot) values (v_couple, v_uid, 'm1');
  insert into public.couple_settings (couple_id) values (v_couple);
  perform public.create_invitation();
  return v_couple;
end $$;

-- Unirse con un código. Devuelve {ok, couple_id} o {ok:false, error}. No lanza excepción en los
-- errores de código para que el intento quede registrado (límite: 10 por hora).
create function public.join_couple(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  v_inv  public.couple_invitations;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'TW001';
  end if;
  if private.my_couple_id() is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_couple');
  end if;
  if (select count(*) from private.join_attempts a
       where a.user_id = v_uid and a.attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  insert into private.join_attempts (user_id) values (v_uid);

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_code) = 9 and left(v_code, 3) = 'TWB' then v_code := substr(v_code, 4); end if;

  select * into v_inv from public.couple_invitations i where i.code = v_code for update;
  if not found or v_inv.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  elsif v_inv.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'code_used');
  elsif v_inv.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'code_expired');
  end if;

  perform 1 from public.couples c where c.id = v_inv.couple_id for update;  -- serializa uniones
  if exists (select 1 from public.couple_members m where m.couple_id = v_inv.couple_id and m.slot = 'm2') then
    return jsonb_build_object('ok', false, 'error', 'couple_full');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.couple_members (couple_id, user_id, slot) values (v_inv.couple_id, v_uid, 'm2');
  update public.couple_invitations set used_by = v_uid, used_at = now() where id = v_inv.id;
  return jsonb_build_object('ok', true, 'couple_id', v_inv.couple_id);
end $$;

-- Salir del espacio: se borra lo privado de quien sale; lo compartido se queda para la otra persona.
create function public.leave_couple() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid := private.my_couple_id();
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;
  delete from public.expenses           where couple_id = v_couple and created_by = v_uid and not visible_to_partner;
  delete from public.recurring_payments where couple_id = v_couple and created_by = v_uid and not visible_to_partner;
  delete from public.places             where couple_id = v_couple and created_by = v_uid and not visible_to_partner;
  delete from public.collections        where couple_id = v_couple and created_by = v_uid and not visible_to_partner;
  delete from public.events             where couple_id = v_couple and created_by = v_uid and is_secret;
  delete from public.push_tokens        where user_id = v_uid;
  -- Las solicitudes pendientes se cancelan: quien se queda podrá borrar sin aprobación.
  update public.deletion_requests set status = 'cancelled', decided_at = now()
  where couple_id = v_couple and status = 'pending';
  update public.couple_members set left_at = now() where couple_id = v_couple and user_id = v_uid;
  update public.couple_invitations set revoked_at = now()
  where couple_id = v_couple and used_at is null and revoked_at is null;
  if private.active_member_count(v_couple) = 0 then
    delete from public.couples where id = v_couple;
  end if;
end $$;

-- Saldar: liquida exactamente los gastos elegidos (uno, varios, un plan entero o todos).
-- La dirección y el importe salen del servidor. Si lo marca quien recibe, queda confirmada;
-- si lo marca quien paga, queda pendiente hasta que la otra persona confirme.
-- Idempotente por p_id (el cliente genera el uuid).
create function public.create_settlement(p_id uuid, p_expense_ids uuid[], p_method public.settlement_method,
                                         p_note text default null)
returns public.settlements
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid := private.my_couple_id();
  v_slot   public.party := private.my_slot();
  v_ids    uuid[];
  v_n      integer;
  v_net    bigint;
  v_from   public.party;
  v_to     public.party;
  v_row    public.settlements;
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;

  select * into v_row from public.settlements s where s.id = p_id;
  if found then
    if v_row.couple_id <> v_couple then
      raise exception 'Liquidación no válida' using errcode = 'TW020';
    end if;
    return v_row;  -- reintento: misma respuesta
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_expense_ids) as x where x is not null;
  if v_ids is null then
    raise exception 'Elige al menos un gasto' using errcode = 'TW020';
  end if;

  -- Bloquea los gastos: dos liquidaciones simultáneas no pueden cubrir el mismo gasto.
  perform 1 from public.expenses e where e.id = any (v_ids) and e.couple_id = v_couple order by e.id for update;

  select count(*),
         coalesce(sum(case e.paid_by when 'm1' then e.share_m2_cents when 'm2' then -e.share_m1_cents else 0 end), 0)
    into v_n, v_net
  from public.expenses e
  where e.id = any (v_ids) and e.couple_id = v_couple and e.settlement_id is null and e.visible_to_partner
    and (case e.paid_by when 'm1' then e.share_m2_cents when 'm2' then e.share_m1_cents else 0 end) <> 0
    -- un gasto con una solicitud de borrado pendiente no se puede saldar hasta que se resuelva
    and not exists (select 1 from public.deletion_requests d
                    where d.target_id = e.id and d.status = 'pending' and d.expires_at > now());

  if v_n <> cardinality(v_ids) then
    raise exception 'Algún gasto no existe, ya está saldado, no genera deuda o está pendiente de borrar'
      using errcode = 'TW020';
  end if;

  if v_net >= 0 then v_from := 'm2'; v_to := 'm1'; else v_from := 'm1'; v_to := 'm2'; end if;

  insert into public.settlements (id, couple_id, from_slot, to_slot, amount_cents, method, status, note,
                                  created_by, responded_by, responded_at)
  values (p_id, v_couple, v_from, v_to, abs(v_net)::integer, p_method,
          case when v_net = 0 or v_to = v_slot then 'confirmed' else 'pending' end::public.settlement_status,
          p_note, v_uid,
          case when v_net = 0 or v_to = v_slot then v_uid end,
          case when v_net = 0 or v_to = v_slot then now() end)
  returning * into v_row;

  update public.expenses set settlement_id = p_id where id = any (v_ids);
  return v_row;
end $$;

-- Confirmar ("Confirmar") o rechazar ("No lo he recibido"). Solo quien recibe el dinero.
create function public.respond_settlement(p_id uuid, p_accept boolean)
returns public.settlements
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid := private.my_couple_id();
  v_row    public.settlements;
begin
  select * into v_row from public.settlements s where s.id = p_id and s.couple_id = v_couple for update;
  if not found then
    raise exception 'Liquidación no encontrada' using errcode = 'TW021';
  elsif v_row.status <> 'pending' then
    raise exception 'Esta liquidación ya está respondida' using errcode = 'TW021';
  elsif v_row.to_slot <> private.my_slot() or v_row.created_by = v_uid then
    raise exception 'Solo quien recibe el dinero puede confirmarlo' using errcode = 'TW021';
  end if;

  update public.settlements
     set status = case when p_accept then 'confirmed' else 'rejected' end::public.settlement_status,
         responded_by = v_uid, responded_at = now()
   where id = p_id
  returning * into v_row;

  if not p_accept then
    update public.expenses set settlement_id = null where settlement_id = p_id;  -- vuelven a estar pendientes
  end if;
  return v_row;
end $$;

-- Deshacer: quien la registró, mientras esté pendiente o hasta 10 minutos después de confirmarla.
create function public.undo_settlement(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.settlements;
begin
  select * into v_row from public.settlements s
  where s.id = p_id and s.couple_id = private.my_couple_id() for update;
  if not found then
    raise exception 'Liquidación no encontrada' using errcode = 'TW022';
  elsif v_row.created_by is distinct from auth.uid() then
    raise exception 'Solo quien la registró puede deshacerla' using errcode = 'TW022';
  elsif v_row.status = 'confirmed' and v_row.created_at < now() - interval '10 minutes' then
    raise exception 'Ya no se puede deshacer' using errcode = 'TW022';
  end if;
  delete from public.settlements where id = p_id;  -- ON DELETE SET NULL libera los gastos
end $$;

-- Aceptar o rechazar un cambio de ajustes propuesto por la otra persona.
create function public.respond_settings_proposal(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid := private.my_couple_id();
  v_prop   public.settings_proposals;
  v_old    public.couple_settings;
  v_new    public.couple_settings;
begin
  select * into v_prop from public.settings_proposals p where p.id = p_id and p.couple_id = v_couple for update;
  if not found or v_prop.status <> 'pending' then
    raise exception 'Propuesta no encontrada o ya respondida' using errcode = 'TW030';
  elsif v_prop.proposed_by = v_uid then
    raise exception 'No puedes aceptar tu propia propuesta' using errcode = 'TW030';
  end if;

  if p_accept then
    select * into v_old from public.couple_settings s where s.couple_id = v_couple for update;
    v_new := jsonb_populate_record(v_old, v_prop.changes
               - array['couple_id', 'version', 'updated_at', 'updated_by', 'pot_generated_through']);
    update public.couple_settings set
      default_split       = v_new.default_split,
      proportional_pct_m1 = v_new.proportional_pct_m1,
      pot_enabled         = v_new.pot_enabled,
      pot_categories      = v_new.pot_categories,
      pot_funding         = v_new.pot_funding,
      pot_monthly_cents   = v_new.pot_monthly_cents,
      pot_day             = v_new.pot_day,
      pot_pct_m1          = v_new.pot_pct_m1,
      pot_started_on      = v_new.pot_started_on
    where couple_id = v_couple;
  end if;

  update public.settings_proposals
     set status = case when p_accept then 'accepted' else 'rejected' end::public.proposal_status,
         decided_by = v_uid, decided_at = now()
   where id = p_id;
end $$;

-- -----------------------------------------------------------------------------
-- 9b. Borrados con aprobación de los dos
--     El cliente no tiene política DELETE en expenses, places, events, recurring_payments,
--     plans, collections ni pot_movements: todo borrado pasa por request_deletion.
-- -----------------------------------------------------------------------------

-- Ejecuta el borrado (sin comprobar permisos: lo llaman las RPC después de validar).
create function private.execute_deletion(p_type public.deletion_target, p_id uuid, p_occurrence_date date)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  case p_type
    when 'expense' then
      if exists (select 1 from public.expenses e where e.id = p_id and e.settlement_id is not null) then
        raise exception 'Este gasto ya está saldado: deshaz la liquidación para borrarlo' using errcode = 'TW010';
      end if;
      delete from public.expenses where id = p_id;
    when 'place' then
      delete from public.places where id = p_id;
    when 'event' then
      if p_occurrence_date is null then
        delete from public.events where id = p_id;
      else
        insert into public.event_exceptions (event_id, couple_id, occurrence_date)
        select e.id, e.couple_id, p_occurrence_date from public.events e where e.id = p_id
        on conflict do nothing;
      end if;
    when 'recurring_payment' then
      delete from public.recurring_payments where id = p_id;
    when 'plan' then
      delete from public.plans where id = p_id;          -- itinerario y tareas en cascada; gastos y sitios se quedan
    when 'collection' then
      delete from public.collections where id = p_id;    -- los sitios se quedan (solo se quita la pertenencia)
    when 'pot_movement' then
      delete from public.pot_movements where id = p_id;
  end case;
end $$;

-- Pedir borrar algo. Devuelve {status: 'deleted'} si se borra al momento o {status: 'pending', request_id}.
-- Se borra al momento si: es privado y tuyo (gasto/pago/sitio/colección no visible, evento secreto),
-- es una colección sin sitios, aún no hay pareja (o ya se fue), o la otra persona ya había pedido lo mismo.
-- Idempotente por p_id.
create function public.request_deletion(p_id uuid, p_type public.deletion_target, p_target_id uuid,
                                        p_occurrence_date date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := auth.uid();
  v_couple    uuid := private.my_couple_id();
  v_found     boolean := false;
  v_label     text;
  v_free      boolean := false;   -- no necesita aprobación
  v_settled   boolean := false;
  v_plan_coll boolean := false;
  v_req       public.deletion_requests;
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;

  select * into v_req from public.deletion_requests d where d.id = p_id;
  if found then
    if v_req.couple_id <> v_couple then
      raise exception 'Solicitud no válida' using errcode = 'TW060';
    end if;
    return jsonb_build_object('status', v_req.status, 'request_id', v_req.id);
  end if;

  if p_occurrence_date is not null and p_type <> 'event' then
    raise exception 'Solo los eventos admiten borrar una fecha concreta' using errcode = 'TW060';
  end if;

  -- El elemento existe, es de mi pareja y lo puedo ver (mismas reglas que la RLS).
  case p_type
    when 'expense' then
      select true, e.concept, not e.visible_to_partner, e.settlement_id is not null
        into v_found, v_label, v_free, v_settled
      from public.expenses e
      where e.id = p_target_id and e.couple_id = v_couple and (e.visible_to_partner or e.created_by = v_uid);
    when 'place' then
      select true, p.name, not p.visible_to_partner into v_found, v_label, v_free
      from public.places p
      where p.id = p_target_id and p.couple_id = v_couple and (p.visible_to_partner or p.created_by = v_uid);
    when 'event' then
      select true, e.title, e.is_secret into v_found, v_label, v_free
      from public.events e
      where e.id = p_target_id and e.couple_id = v_couple and (not e.is_secret or e.created_by = v_uid);
    when 'recurring_payment' then
      select true, r.name, not r.visible_to_partner into v_found, v_label, v_free
      from public.recurring_payments r
      where r.id = p_target_id and r.couple_id = v_couple and (r.visible_to_partner or r.created_by = v_uid);
    when 'plan' then
      select true, p.icon || ' ' || p.name, false into v_found, v_label, v_free
      from public.plans p where p.id = p_target_id and p.couple_id = v_couple;
    when 'collection' then
      select true, c.icon || ' ' || c.name,
             not c.visible_to_partner or not exists (select 1 from public.collection_places cp where cp.collection_id = c.id),
             c.plan_id is not null
        into v_found, v_label, v_free, v_plan_coll
      from public.collections c
      where c.id = p_target_id and c.couple_id = v_couple and (c.visible_to_partner or c.created_by = v_uid);
    when 'pot_movement' then
      select true,
             case m.kind when 'contribution' then 'Aportación al bote' when 'reimbursement' then 'Reembolso del bote'
                         else 'Ajuste del bote' end || ' · ' || to_char(m.occurred_on, 'DD/MM/YYYY'),
             false
        into v_found, v_label, v_free
      from public.pot_movements m where m.id = p_target_id and m.couple_id = v_couple;
  end case;

  if not coalesce(v_found, false) then
    raise exception 'No encontrado' using errcode = 'TW060';
  elsif v_settled then
    raise exception 'Este gasto ya está saldado: deshaz la liquidación para borrarlo' using errcode = 'TW010';
  elsif v_plan_coll then
    raise exception 'La colección de un plan se borra con el plan' using errcode = 'TW061';
  end if;
  if p_occurrence_date is not null then
    v_label := v_label || ' · ' || to_char(p_occurrence_date, 'DD/MM/YYYY');
  end if;

  -- Sin aprobación: se borra ya.
  if v_free or private.active_member_count(v_couple) = 1 then
    perform private.execute_deletion(p_type, p_target_id, p_occurrence_date);
    return jsonb_build_object('status', 'deleted');
  end if;

  -- Las solicitudes caducadas dejan de contar.
  update public.deletion_requests set status = 'expired', decided_at = now()
  where target_id = p_target_id and status = 'pending' and expires_at <= now();

  -- ¿Ya hay una solicitud pendiente para lo mismo?
  select * into v_req from public.deletion_requests d
  where d.target_type = p_type and d.target_id = p_target_id
    and d.occurrence_date is not distinct from p_occurrence_date and d.status = 'pending'
  for update;
  if found then
    if v_req.requested_by = v_uid then
      return jsonb_build_object('status', 'pending', 'request_id', v_req.id);
    end if;
    -- La pidió la otra persona: los dos estáis de acuerdo.
    update public.deletion_requests set status = 'approved', decided_by = v_uid, decided_at = now() where id = v_req.id;
    perform private.execute_deletion(p_type, p_target_id, p_occurrence_date);
    return jsonb_build_object('status', 'deleted', 'request_id', v_req.id);
  end if;

  insert into public.deletion_requests (id, couple_id, target_type, target_id, occurrence_date, target_label, requested_by)
  values (p_id, v_couple, p_type, p_target_id, p_occurrence_date, left(v_label, 140), v_uid)
  returning * into v_req;
  return jsonb_build_object('status', 'pending', 'request_id', v_req.id);
end $$;

-- Aprobar (se borra) o rechazar (se queda). Solo la otra persona.
create function public.respond_deletion(p_id uuid, p_accept boolean)
returns public.deletion_requests
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_req public.deletion_requests;
begin
  select * into v_req from public.deletion_requests d
  where d.id = p_id and d.couple_id = private.my_couple_id() for update;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'TW060';
  elsif v_req.status <> 'pending' or v_req.expires_at <= now() then
    raise exception 'Esta solicitud ya no está pendiente' using errcode = 'TW062';
  elsif v_req.requested_by is not distinct from v_uid then
    raise exception 'La tiene que aprobar la otra persona' using errcode = 'TW063';
  end if;

  update public.deletion_requests
     set status = case when p_accept then 'approved' else 'rejected' end::public.deletion_status,
         decided_by = v_uid, decided_at = now()
   where id = p_id
  returning * into v_req;

  if p_accept then
    perform private.execute_deletion(v_req.target_type, v_req.target_id, v_req.occurrence_date);
  end if;
  return v_req;
end $$;

-- Retirar una solicitud propia.
create function public.cancel_deletion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.deletion_requests set status = 'cancelled', decided_by = auth.uid(), decided_at = now()
  where id = p_id and couple_id = private.my_couple_id() and requested_by = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Solicitud no encontrada o ya resuelta' using errcode = 'TW062';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 10. Job diario (pg_cron): aportaciones automáticas al bote y cobros recurrentes vencidos
--     Idempotente: se puede ejecutar varias veces al día.
-- -----------------------------------------------------------------------------
create function private.run_daily_jobs() returns void
language plpgsql security definer set search_path = '' as $$
declare
  s       record;
  r       record;
  v_today date;
  v_month date;
  v_due   date;
  v_m1    integer;
  v_d     date;
  v_occ   uuid;
begin
  -- 0) Solicitudes de borrado caducadas (7 días sin respuesta): el elemento se queda.
  update public.deletion_requests set status = 'expired', decided_at = now()
  where status = 'pending' and expires_at <= now();

  -- 1) Aportación automática al bote: un movimiento por persona y mes, desde pot_started_on.
  for s in
    select cs.*, c.time_zone
    from public.couple_settings cs join public.couples c on c.id = cs.couple_id
    where cs.pot_enabled and cs.pot_funding = 'monthly'
  loop
    v_today := (now() at time zone s.time_zone)::date;
    v_month := coalesce((s.pot_generated_through + interval '1 month')::date,
                        date_trunc('month', s.pot_started_on::timestamp)::date);
    while v_month <= date_trunc('month', v_today::timestamp)::date loop
      v_due := private.clamp_day(v_month, s.pot_day);
      exit when v_due > v_today;
      if v_due >= s.pot_started_on then
        v_m1 := round(s.pot_monthly_cents * s.pot_pct_m1 / 100.0);
        insert into public.pot_movements (couple_id, kind, member_slot, amount_cents, occurred_on, is_auto, period)
        select s.couple_id, 'contribution', x.slot, x.amount, v_due, true, v_month
        from (values ('m1'::public.party, v_m1), ('m2'::public.party, s.pot_monthly_cents - v_m1)) as x(slot, amount)
        where x.amount > 0
        on conflict do nothing;
      end if;
      update public.couple_settings set pot_generated_through = v_month where couple_id = s.couple_id;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end loop;

  -- 2) Cobros recurrentes vencidos (ventana de 31 días para recuperar días sin ejecutar).
  --    Importe fijo → se crea el gasto. Importe variable → queda pendiente de que alguien ponga el importe.
  for r in
    select rp.*, c.time_zone, c.currency
    from public.recurring_payments rp join public.couples c on c.id = rp.couple_id
    where not rp.paused
  loop
    v_today := (now() at time zone r.time_zone)::date;
    for v_d in
      select * from private.payment_due_dates(r.frequency, r.day_of_month, r.month_of_year, r.start_date, r.end_date,
                                              greatest(v_today - 31, (r.created_at at time zone r.time_zone)::date),
                                              v_today)
    loop
      begin
        v_occ := null;
        insert into public.recurring_occurrences (couple_id, recurring_id, due_date)
        values (r.couple_id, r.id, v_d)
        on conflict (recurring_id, due_date) do nothing
        returning id into v_occ;

        if v_occ is not null and not r.is_variable then
          insert into public.expenses (couple_id, created_by, concept, amount_cents, currency, category, spent_on,
                                       paid_by, split_mode, split_pct_m1, visible_to_partner, recurring_occurrence_id)
          values (r.couple_id, r.created_by, r.name, r.amount_cents, r.currency, r.category, v_d,
                  r.paid_by, r.split_mode, r.split_pct_m1, r.visible_to_partner, v_occ);
        end if;
      exception when others then
        raise warning 'run_daily_jobs: recurrente % (%): %', r.id, v_d, sqlerrm;
      end;
    end loop;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 11. Seguridad: RLS
--     Patrón: couple_id = (select private.my_couple_id()). El (select …) hace que Postgres
--     lo evalúe una vez por consulta y no una vez por fila.
-- -----------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.couples               enable row level security;
alter table public.couple_members        enable row level security;
alter table public.couple_invitations    enable row level security;
alter table public.couple_settings       enable row level security;
alter table public.settings_proposals    enable row level security;
alter table public.plans                 enable row level security;
alter table public.collections           enable row level security;
alter table public.places                enable row level security;
alter table public.place_notes           enable row level security;
alter table public.ideas                 enable row level security;
alter table public.events                enable row level security;
alter table public.event_exceptions      enable row level security;
alter table public.recurring_payments    enable row level security;
alter table public.recurring_occurrences enable row level security;
alter table public.plan_tasks            enable row level security;
alter table public.settlements           enable row level security;
alter table public.expenses              enable row level security;
alter table public.pot_movements         enable row level security;
alter table public.push_tokens           enable row level security;
alter table public.collection_places     enable row level security;
alter table public.deletion_requests     enable row level security;

-- Perfiles: el mío y el de mi pareja (también si ya salió, para el historial).
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid())
         or exists (select 1 from public.couple_members m
                    where m.user_id = profiles.id and m.couple_id = (select private.my_couple_id())));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Pareja: solo lectura y zona horaria/moneda. Se crea por RPC.
create policy couples_select on public.couples for select to authenticated
  using (id = (select private.my_couple_id()));
create policy couples_update on public.couples for update to authenticated
  using (id = (select private.my_couple_id())) with check (id = (select private.my_couple_id()));

-- Miembros: veo a los dos; solo edito mi fila (color, privacidad, avisos). Alta y baja por RPC.
create policy couple_members_select on public.couple_members for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy couple_members_update on public.couple_members for update to authenticated
  using (couple_id = (select private.my_couple_id()) and user_id = (select auth.uid()))
  with check (couple_id = (select private.my_couple_id()) and user_id = (select auth.uid()));

-- Invitaciones: los miembros ven el código vigente. Crear y canjear, por RPC.
create policy couple_invitations_select on public.couple_invitations for select to authenticated
  using (couple_id = (select private.my_couple_id()));

-- Ajustes: los dos los ven. Se editan directamente solo mientras no se ha unido la pareja;
-- después, mediante propuesta que acepta la otra persona.
create policy couple_settings_select on public.couple_settings for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy couple_settings_update on public.couple_settings for update to authenticated
  using (couple_id = (select private.my_couple_id()) and private.active_member_count(couple_id) = 1)
  with check (couple_id = (select private.my_couple_id()));

create policy settings_proposals_select on public.settings_proposals for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy settings_proposals_insert on public.settings_proposals for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and proposed_by = (select auth.uid())
              and status = 'pending' and private.active_member_count(couple_id) = 2);
create policy settings_proposals_delete on public.settings_proposals for delete to authenticated
  using (couple_id = (select private.my_couple_id()) and proposed_by = (select auth.uid()) and status = 'pending');

-- BORRADOS: expenses, places, events, recurring_payments, plans, collections y pot_movements
-- NO tienen política DELETE. Se borran con request_deletion (aprobación de la otra persona,
-- salvo lo privado y las colecciones vacías). Ideas, tareas, notas, excepciones de eventos y
-- pertenencias a colecciones sí se borran directamente.

-- Tablas compartidas sin privacidad por elemento: cualquier miembro lee y escribe.
create policy plans_select on public.plans for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy plans_insert on public.plans for insert to authenticated
  with check (couple_id = (select private.my_couple_id()));
create policy plans_update on public.plans for update to authenticated
  using (couple_id = (select private.my_couple_id())) with check (couple_id = (select private.my_couple_id()));
create policy ideas_all on public.ideas for all to authenticated
  using (couple_id = (select private.my_couple_id())) with check (couple_id = (select private.my_couple_id()));
create policy plan_tasks_all on public.plan_tasks for all to authenticated
  using (couple_id = (select private.my_couple_id())) with check (couple_id = (select private.my_couple_id()));
create policy pot_movements_select on public.pot_movements for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy pot_movements_insert on public.pot_movements for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and not is_auto);
create policy pot_movements_update on public.pot_movements for update to authenticated
  using (couple_id = (select private.my_couple_id())) with check (couple_id = (select private.my_couple_id()));

-- Eventos: compartidos salvo los secretos, que solo ve (y edita) quien los creó.
create policy events_select on public.events for select to authenticated
  using (couple_id = (select private.my_couple_id()) and (not is_secret or created_by = (select auth.uid())));
create policy events_insert on public.events for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and created_by = (select auth.uid()));
create policy events_update on public.events for update to authenticated
  using (couple_id = (select private.my_couple_id()) and (not is_secret or created_by = (select auth.uid())))
  with check (couple_id = (select private.my_couple_id()) and (not is_secret or created_by = (select auth.uid())));
-- Las excepciones heredan la visibilidad del evento.
create policy event_exceptions_all on public.event_exceptions for all to authenticated
  using (couple_id = (select private.my_couple_id())
         and exists (select 1 from public.events e where e.id = event_exceptions.event_id))
  with check (couple_id = (select private.my_couple_id())
              and exists (select 1 from public.events e where e.id = event_exceptions.event_id));

-- Tablas con "Visible para tu pareja": lo mío siempre; lo de la pareja, si lo marcó visible.
create policy expenses_select on public.expenses for select to authenticated
  using (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and created_by = (select auth.uid()));
create policy expenses_update on public.expenses for update to authenticated
  using (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())))
  with check (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())));

create policy recurring_payments_select on public.recurring_payments for select to authenticated
  using (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())));
create policy recurring_payments_insert on public.recurring_payments for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and created_by = (select auth.uid()));
create policy recurring_payments_update on public.recurring_payments for update to authenticated
  using (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())))
  with check (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())));

create policy places_select on public.places for select to authenticated
  using (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())));
create policy places_insert on public.places for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and created_by = (select auth.uid()));
create policy places_update on public.places for update to authenticated
  using (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())))
  with check (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())));

create policy collections_select on public.collections for select to authenticated
  using (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())));
create policy collections_insert on public.collections for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and created_by = (select auth.uid()));
create policy collections_update on public.collections for update to authenticated
  using (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())))
  with check (couple_id = (select private.my_couple_id()) and (visible_to_partner or created_by = (select auth.uid())));

-- Hijas: heredan la visibilidad del padre (la subconsulta pasa por la RLS del padre).
-- Pertenencia a colecciones: hay que ver el sitio y la colección. Quitar un sitio de una colección es directo.
create policy collection_places_select on public.collection_places for select to authenticated
  using (couple_id = (select private.my_couple_id())
         and exists (select 1 from public.places p where p.id = collection_places.place_id)
         and exists (select 1 from public.collections c where c.id = collection_places.collection_id));
create policy collection_places_insert on public.collection_places for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and added_by = (select auth.uid())
              and exists (select 1 from public.places p where p.id = collection_places.place_id)
              and exists (select 1 from public.collections c where c.id = collection_places.collection_id));
create policy collection_places_delete on public.collection_places for delete to authenticated
  using (couple_id = (select private.my_couple_id())
         and exists (select 1 from public.places p where p.id = collection_places.place_id)
         and exists (select 1 from public.collections c where c.id = collection_places.collection_id));

-- Solicitudes de borrado: los dos las ven; se escriben por RPC.
create policy deletion_requests_select on public.deletion_requests for select to authenticated
  using (couple_id = (select private.my_couple_id()));

create policy place_notes_select on public.place_notes for select to authenticated
  using (couple_id = (select private.my_couple_id())
         and exists (select 1 from public.places p where p.id = place_notes.place_id));
create policy place_notes_write on public.place_notes for all to authenticated
  using (couple_id = (select private.my_couple_id()) and user_id = (select auth.uid()))
  with check (couple_id = (select private.my_couple_id()) and user_id = (select auth.uid())
              and exists (select 1 from public.places p where p.id = place_notes.place_id));

create policy recurring_occurrences_select on public.recurring_occurrences for select to authenticated
  using (couple_id = (select private.my_couple_id())
         and exists (select 1 from public.recurring_payments r where r.id = recurring_occurrences.recurring_id));
create policy recurring_occurrences_insert on public.recurring_occurrences for insert to authenticated
  with check (couple_id = (select private.my_couple_id())
              and exists (select 1 from public.recurring_payments r where r.id = recurring_occurrences.recurring_id));
create policy recurring_occurrences_update on public.recurring_occurrences for update to authenticated
  using (couple_id = (select private.my_couple_id())
         and exists (select 1 from public.recurring_payments r where r.id = recurring_occurrences.recurring_id))
  with check (couple_id = (select private.my_couple_id()));

-- Liquidaciones: solo lectura; se escriben por RPC (así solo la otra persona puede confirmar).
create policy settlements_select on public.settlements for select to authenticated
  using (couple_id = (select private.my_couple_id()));

create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 12. Permisos
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

revoke all on all functions in schema public from public, anon;
grant execute on function public.get_balance()                                   to authenticated;
grant execute on function public.calendar_range(date, date)                      to authenticated;
grant execute on function public.create_couple()                                 to authenticated;
grant execute on function public.create_invitation()                             to authenticated;
grant execute on function public.join_couple(text)                               to authenticated;
grant execute on function public.leave_couple()                                  to authenticated;
grant execute on function public.create_settlement(uuid, uuid[], public.settlement_method, text) to authenticated;
grant execute on function public.respond_settlement(uuid, boolean)               to authenticated;
grant execute on function public.undo_settlement(uuid)                           to authenticated;
grant execute on function public.respond_settings_proposal(uuid, boolean)        to authenticated;
grant execute on function public.request_deletion(uuid, public.deletion_target, uuid, date) to authenticated;
grant execute on function public.respond_deletion(uuid, boolean)                 to authenticated;
grant execute on function public.cancel_deletion(uuid)                           to authenticated;

-- El esquema private no se expone por la API, pero las políticas y las vistas lo usan como el rol del cliente.
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.my_couple_id()                 to authenticated;
grant execute on function private.my_slot()                      to authenticated;
grant execute on function private.slot_of(uuid, uuid)            to authenticated;
grant execute on function private.active_member_count(uuid)      to authenticated;
grant execute on function private.is_client_write()              to authenticated;
grant execute on function private.compute_shares(integer, public.split_mode, smallint) to authenticated;
grant execute on function private.clamp_day(date, integer)       to authenticated;
grant execute on function private.occurrence_dates(date, public.recurrence, date, date, date) to authenticated;
grant execute on function private.payment_due_dates(public.payment_frequency, smallint, smallint, date, date, date, date) to authenticated;
-- private.run_daily_jobs, execute_deletion, generate_invite_code y los triggers no se conceden a nadie.

-- -----------------------------------------------------------------------------
-- 13. Tiempo real (Postgres Changes; la RLS filtra qué recibe cada uno)
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.expenses, public.settlements, public.pot_movements,
  public.recurring_payments, public.recurring_occurrences,
  public.events, public.event_exceptions, public.plans, public.plan_tasks,
  public.places, public.place_notes, public.collections, public.collection_places, public.ideas,
  public.deletion_requests,
  public.couple_members, public.couple_settings, public.settings_proposals;

-- -----------------------------------------------------------------------------
-- 14. Storage: tickets y avatares (buckets privados)
--     receipts/{couple_id}/{expense_id}/{archivo}  ·  avatars/{user_id}/{archivo}
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false), ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Ver o borrar un ticket = poder ver su gasto (la subconsulta aplica la RLS de expenses).
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and exists (select 1 from public.expenses e
                     where e.couple_id::text = (storage.foldername(name))[1]
                       and e.id::text        = (storage.foldername(name))[2]));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
              and (storage.foldername(name))[1] = (select private.my_couple_id())::text
              and exists (select 1 from public.expenses e
                          where e.couple_id::text = (storage.foldername(name))[1]
                            and e.id::text        = (storage.foldername(name))[2]));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts'
         and exists (select 1 from public.expenses e
                     where e.couple_id::text = (storage.foldername(name))[1]
                       and e.id::text        = (storage.foldername(name))[2]));

create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars'
         and exists (select 1 from public.profiles p where p.id::text = (storage.foldername(name))[1]));
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- 15. Programación del job (solo si pg_cron está activado en el proyecto)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('twobe-daily', '15 4 * * *', 'select private.run_daily_jobs()');  -- 05:15/06:15 en Madrid
  end if;
end $$;
