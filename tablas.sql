-- Calibración de detectores — PETROSAR
-- Ejecutar una vez en Supabase → SQL Editor

create table if not exists calib_certificados (
  id            text primary key,
  token         text unique not null,          -- va en el QR (?v=token)
  nro           text not null,                 -- CAL-2026-0001
  serie         text not null,
  id_equipo     text,
  modelo        text,
  fecha         date not null,                 -- fecha de calibración
  proxima       date not null,                 -- vencimiento
  resultado     text,
  tecnico       text,
  ciclo         int  default 1,                -- N° de calibración del equipo (1..4)
  baja          date,                          -- equipo descartado / dado de baja
  data          jsonb not null,                -- certificado completo
  aviso_enviado date,                          -- aviso de vencimiento (lo completa el aviso diario)
  aviso_reposicion date,                       -- aviso de última calibración / reponer equipo
  creado        timestamptz default now()
);
-- si la tabla ya existía de una versión anterior:
alter table calib_certificados add column if not exists ciclo int default 1;
alter table calib_certificados add column if not exists baja date;
alter table calib_certificados add column if not exists aviso_reposicion date;

create index if not exists calib_cert_serie_idx   on calib_certificados (serie);
create index if not exists calib_cert_proxima_idx on calib_certificados (proxima);

create table if not exists calib_config (
  id          text primary key,                -- 'cfg'
  data        jsonb not null,
  actualizado timestamptz default now()
);

-- Asignación de cada equipo a una persona (historial: hasta = null es la actual)
create table if not exists calib_asignaciones (
  id      text primary key,
  serie   text not null,
  persona text,                                -- vacío = sin asignar / pañol
  base    text,                                -- AG, CD, RESERO, VH…
  desde   date not null,
  hasta   date,
  motivo  text,                                -- reasignación / baja / importación
  creado  timestamptz default now()
);
create index if not exists calib_asig_serie_idx on calib_asignaciones (serie);

alter table calib_certificados enable row level security;
alter table calib_config       enable row level security;
alter table calib_asignaciones enable row level security;

-- Acceso de la app (clave anon), mismo criterio que las otras apps internas
create policy "calib_cert_anon" on calib_certificados for all to anon using (true) with check (true);
create policy "calib_cfg_anon"  on calib_config       for all to anon using (true) with check (true);
create policy "calib_asig_anon" on calib_asignaciones for all to anon using (true) with check (true);
