-- =====================================================================================
-- INNOMINING 2026 · Acreditación y control de ingreso
-- Base de datos central (Supabase / PostgreSQL 15+)
--
-- Principios:
--  * Toda escritura pasa por funciones SQL (RPC) transaccionales que verifican el rol.
--  * Las tablas tienen RLS activado: el navegador no puede leer ni escribir directamente.
--  * Restricciones únicas impiden duplicados aunque dos dispositivos operen a la vez:
--      - un participante por correo            (participantes.email)
--      - un QR activo por participante, único  (participantes.qr_token)
--      - una asistencia por participante y día (asistencias.participante_id, fecha)
--      - un envío en curso por participante    (índice parcial en envios_correo)
--  * Hora oficial: servidor, zona America/Lima.
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------ Tablas

create table if not exists public.configuracion (
  id                       boolean primary key default true check (id),
  nombre_evento            text    not null default 'INNOMINING 2026',
  fechas_evento            date[]  not null default '{}',
  permitir_fuera_de_fecha  boolean not null default true,   -- desactivar el día del evento
  limite_diario_correos    integer not null default 300 check (limite_diario_correos between 1 and 100000),
  actualizado_en           timestamptz not null default now()
);
insert into public.configuracion (id) values (true) on conflict do nothing;

create table if not exists public.operadores (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  nombre     text not null default '',
  rol        text not null check (rol in ('admin', 'operador')),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create table if not exists public.participantes (
  id                     uuid primary key default gen_random_uuid(),
  codigo                 text not null unique,                       -- visible: IM26-XXXXX (no va en el QR)
  nombre                 text not null default '',
  email                  text not null unique check (email = lower(email) and email !~ '\s'),
  institucion            text not null default '',
  origen                 text not null check (origen in ('previo', 'presencial')),
  qr_token               text unique check (qr_token ~ '^[0-9a-f]{32}$'),  -- null = QR pendiente
  qr_generado_en         timestamptz,
  correo_estado          text not null default 'pendiente'
                           check (correo_estado in ('pendiente', 'procesando', 'aceptado', 'entregado', 'fallido', 'incierto')),
  correo_actualizado_en  timestamptz,
  creado_por             uuid references public.operadores (id) on delete set null,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);

create table if not exists public.qr_anulados (
  token            text primary key,
  participante_id  uuid not null references public.participantes (id) on delete cascade,
  anulado_en       timestamptz not null default now(),
  anulado_por      uuid references public.operadores (id) on delete set null,
  motivo           text not null default ''
);

create table if not exists public.asistencias (
  id               uuid primary key default gen_random_uuid(),
  participante_id  uuid not null references public.participantes (id) on delete restrict,
  fecha            date not null,
  hora             timestamptz not null default now(),
  metodo           text not null check (metodo in ('escaneo', 'presencial')),
  operador_id      uuid references public.operadores (id) on delete set null,
  unique (participante_id, fecha)
);
create index if not exists asistencias_fecha_idx on public.asistencias (fecha, hora desc);

create table if not exists public.envios_correo (
  id                uuid primary key default gen_random_uuid(),
  participante_id   uuid references public.participantes (id) on delete set null,
  destinatario      text not null,
  tipo              text not null default 'acreditacion' check (tipo in ('acreditacion', 'prueba')),
  estado            text not null default 'procesando'
                      check (estado in ('procesando', 'aceptado', 'entregado', 'fallido', 'incierto', 'devuelto')),
  brevo_message_id  text unique,
  error             text,
  solicitado_por    uuid references public.operadores (id) on delete set null,
  creado_en         timestamptz not null default now(),
  finalizado_en     timestamptz
);
-- Idempotencia: como máximo un envío en curso por participante.
create unique index if not exists envios_un_solo_en_curso
  on public.envios_correo (participante_id) where estado = 'procesando';
create index if not exists envios_creado_idx on public.envios_correo (creado_en desc);

create table if not exists public.bitacora (
  id         bigserial primary key,
  en         timestamptz not null default now(),
  operador   uuid,
  accion     text not null,
  detalle    jsonb not null default '{}'
);

-- RLS: sin políticas de escritura. Lectura directa solo para administradores (y nada para anónimos).
alter table public.configuracion  enable row level security;
alter table public.operadores     enable row level security;
alter table public.participantes  enable row level security;
alter table public.qr_anulados    enable row level security;
alter table public.asistencias    enable row level security;
alter table public.envios_correo  enable row level security;
alter table public.bitacora       enable row level security;

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;

-- ------------------------------------------------------------------ Utilidades internas

create or replace function public._operador() returns public.operadores
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores;
begin
  select * into o from public.operadores where id = auth.uid() and activo;
  if o.id is null then
    raise exception 'No autorizado. Inicie sesión con una cuenta de organizador activa.' using errcode = '42501';
  end if;
  return o;
end $$;

create or replace function public._admin() returns public.operadores
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador();
begin
  if o.rol <> 'admin' then
    raise exception 'Esta acción requiere una cuenta de administrador.' using errcode = '42501';
  end if;
  return o;
end $$;

create or replace function public._es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.operadores where id = auth.uid() and activo and rol = 'admin');
$$;

create or replace function public._hoy() returns date
language sql stable as $$ select (now() at time zone 'America/Lima')::date $$;

create or replace function public._hora_lima(t timestamptz) returns text
language sql immutable as $$ select to_char(t at time zone 'America/Lima', 'HH24:MI:SS') $$;

create or replace function public._norm_email(x text) returns text
language sql immutable as $$
  select lower(regexp_replace(regexp_replace(coalesce(x, ''), '[\s ​-‍﻿]', '', 'g'), '^mailto:', '', 'i'))
$$;

create or replace function public._email_valido(x text) returns boolean
language sql immutable as $$
  select x is not null and length(x) <= 254 and position('..' in x) = 0
     and x ~ '^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9_-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$'
$$;

-- Texto limpio: sin controles, espacios colapsados, sin "=+@-" al inicio (evita fórmulas al exportar).
create or replace function public._limpiar(x text) returns text
language sql immutable as $$
  select left(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(x, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'), '^[\s=+@-]+', '')), 150)
$$;

create or replace function public._nuevo_token() returns text
language sql volatile as $$ select encode(extensions.gen_random_bytes(16), 'hex') $$;  -- 128 bits, CSPRNG

create or replace function public._nuevo_codigo() returns text
language plpgsql volatile as $$
declare abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; c text; i int;
begin
  loop
    b := extensions.gen_random_bytes(5); c := 'IM26-';
    for i in 0..4 loop c := c || substr(abc, (get_byte(b, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.participantes where codigo = c);
  end loop;
  return c;
end $$;

create or replace function public._log(p_accion text, p_detalle jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into public.bitacora (operador, accion, detalle) values (auth.uid(), p_accion, coalesce(p_detalle, '{}'));
$$;

create or replace function public._ingreso_json(p public.participantes, a public.asistencias, p_estado text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'estado', p_estado, 'id', p.id, 'codigo', p.codigo, 'nombre', coalesce(nullif(p.nombre, ''), '(sin nombre)'),
    'institucion', p.institucion, 'origen', p.origen,
    'fecha', to_char(a.fecha, 'DD/MM/YYYY'), 'hora', public._hora_lima(a.hora), 'metodo', a.metodo,
    'operador', (select coalesce(nullif(o.nombre, ''), o.email) from public.operadores o where o.id = a.operador_id),
    'correo_estado', p.correo_estado)
$$;

create or replace function public._fecha_permitida() returns void
language plpgsql stable security definer set search_path = public as $$
declare c public.configuracion;
begin
  select * into c from public.configuracion;
  if not c.permitir_fuera_de_fecha and not (public._hoy() = any (c.fechas_evento)) then
    raise exception 'Hoy (%) no es una fecha configurada del congreso. Revise Configuración.', to_char(public._hoy(), 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
end $$;

-- ------------------------------------------------------------------ Sesión y resumen

create or replace function public.mi_perfil() returns json
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador();
begin
  return json_build_object('id', o.id, 'email', o.email, 'nombre', coalesce(nullif(o.nombre, ''), o.email), 'rol', o.rol);
end $$;

create or replace function public.resumen() returns json
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador(); c public.configuracion; r json;
begin
  select * into c from public.configuracion;
  select json_build_object(
    'hoy', to_char(public._hoy(), 'DD/MM/YYYY'),
    'hoy_iso', public._hoy(),
    'es_fecha_evento', public._hoy() = any (c.fechas_evento),
    'permitir_fuera_de_fecha', c.permitir_fuera_de_fecha,
    'fechas_evento', (select coalesce(json_agg(to_char(f, 'DD/MM/YYYY') order by f), '[]') from unnest(c.fechas_evento) f),
    'total', (select count(*) from participantes),
    'previos', (select count(*) from participantes where origen = 'previo'),
    'presenciales', (select count(*) from participantes where origen = 'presencial'),
    'qr_generados', (select count(*) from participantes where qr_token is not null),
    'qr_pendientes', (select count(*) from participantes where qr_token is null),
    'correo_pendiente', (select count(*) from participantes where correo_estado = 'pendiente'),
    'correo_procesando', (select count(*) from participantes where correo_estado = 'procesando'),
    'correo_aceptado', (select count(*) from participantes where correo_estado in ('aceptado', 'entregado')),
    'correo_entregado', (select count(*) from participantes where correo_estado = 'entregado'),
    'correo_fallido', (select count(*) from participantes where correo_estado = 'fallido'),
    'correo_incierto', (select count(*) from participantes where correo_estado = 'incierto'),
    'ingresos_hoy', (select count(*) from asistencias where fecha = public._hoy()),
    'sin_ingreso_hoy', (select count(*) from participantes p where not exists
                          (select 1 from asistencias a where a.participante_id = p.id and a.fecha = public._hoy())),
    'nunca_ingresaron', (select count(*) from participantes p where not exists
                          (select 1 from asistencias a where a.participante_id = p.id)),
    'envios_hoy', (select count(*) from envios_correo where (creado_en at time zone 'America/Lima')::date = public._hoy()
                     and estado in ('procesando', 'aceptado', 'entregado', 'incierto')),
    'limite_diario', c.limite_diario_correos,
    'actualizado', public._hora_lima(now())
  ) into r;
  return r;
end $$;

-- ------------------------------------------------------------------ Participantes (admin)

create or replace function public.listar_participantes() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin();
  return (select coalesce(json_agg(x order by x.creado_en, x.codigo), '[]') from (
    select p.id, p.codigo, p.nombre, p.email, p.institucion, p.origen,
           p.qr_token, to_char(p.qr_generado_en at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI') as qr_generado,
           p.correo_estado, to_char(p.correo_actualizado_en at time zone 'America/Lima', 'DD/MM HH24:MI') as correo_fecha,
           p.creado_en,
           (select public._hora_lima(a.hora) from asistencias a where a.participante_id = p.id and a.fecha = public._hoy()) as ingreso_hoy,
           (select coalesce(json_agg(json_build_object('fecha', to_char(a.fecha, 'DD/MM/YYYY'), 'hora', public._hora_lima(a.hora), 'metodo', a.metodo) order by a.fecha), '[]')
              from asistencias a where a.participante_id = p.id) as asistencias,
           (select e.error from envios_correo e where e.participante_id = p.id order by e.creado_en desc limit 1) as correo_error
      from participantes p) x);
end $$;

-- Clasifica filas de importación sin escribir. Estados: nuevo | existente | diferencia | duplicado | invalido
create or replace function public.previsualizar_importacion(p_filas jsonb) returns json
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; i int := 0; out jsonb := '[]'; vistos jsonb := '{}';
        v_nombre text; v_email text; v_inst text; v_estado text; v_msg text; ex public.participantes;
begin
  perform public._admin();
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 5000 then
    raise exception 'El archivo debe tener como máximo 5000 filas.';
  end if;
  for r in select * from jsonb_array_elements(p_filas) loop
    i := i + 1;
    v_nombre := public._limpiar(r->>'nombre'); v_email := public._norm_email(r->>'email'); v_inst := public._limpiar(r->>'institucion');
    v_msg := '';
    if v_email = '' then v_estado := 'invalido'; v_msg := 'Falta el correo';
    elsif not public._email_valido(v_email) then v_estado := 'invalido'; v_msg := 'Correo no válido';
    elsif vistos ? v_email then v_estado := 'duplicado'; v_msg := 'Repetido en el archivo (fila ' || (vistos->>v_email) || ')';
    else
      select * into ex from participantes where email = v_email;
      if ex.id is not null then
        if ex.nombre <> '' and v_nombre <> '' and lower(ex.nombre) <> lower(v_nombre) then
          v_estado := 'diferencia'; v_msg := 'Ya registrado como «' || ex.nombre || '». Se conserva el nombre registrado.';
        else
          v_estado := 'existente';
          v_msg := case when ex.nombre = '' and v_nombre <> '' then 'Ya registrado · se completará el nombre'
                        when ex.institucion = '' and v_inst <> '' then 'Ya registrado · se completará la institución'
                        else 'Ya registrado · sin cambios' end;
        end if;
      else
        v_estado := 'nuevo'; if v_nombre = '' then v_msg := 'Sin nombre (puede completarse luego)'; end if;
      end if;
    end if;
    if v_email <> '' and not vistos ? v_email then vistos := vistos || jsonb_build_object(v_email, i); end if;
    out := out || jsonb_build_object('n', i, 'nombre', v_nombre, 'email', v_email, 'institucion', v_inst, 'estado', v_estado, 'msg', v_msg);
  end loop;
  return json_build_object('filas', out, 'resumen', (
    select json_build_object('total', count(*),
      'nuevo', count(*) filter (where e->>'estado' = 'nuevo'), 'existente', count(*) filter (where e->>'estado' = 'existente'),
      'diferencia', count(*) filter (where e->>'estado' = 'diferencia'), 'duplicado', count(*) filter (where e->>'estado' = 'duplicado'),
      'invalido', count(*) filter (where e->>'estado' = 'invalido'))
    from jsonb_array_elements(out) e));
end $$;

-- Inserta nuevos y completa datos vacíos de existentes. Nunca crea duplicados ni cambia QR.
create or replace function public.confirmar_importacion(p_filas jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin(); pv json; f jsonb; ins int := 0; upd int := 0; v_id uuid;
begin
  pv := public.previsualizar_importacion(p_filas);
  for f in select * from jsonb_array_elements((pv->'filas')::jsonb) loop
    if f->>'estado' = 'nuevo' then
      insert into participantes (codigo, nombre, email, institucion, origen, creado_por)
      values (public._nuevo_codigo(), f->>'nombre', f->>'email', f->>'institucion', 'previo', o.id)
      on conflict (email) do nothing returning id into v_id;
      if v_id is not null then ins := ins + 1; end if;
      v_id := null;
    elsif f->>'estado' in ('existente', 'diferencia') then
      update participantes set
        nombre = case when nombre = '' then f->>'nombre' else nombre end,
        institucion = case when institucion = '' then f->>'institucion' else institucion end,
        actualizado_en = now()
      where email = f->>'email' and ((nombre = '' and f->>'nombre' <> '') or (institucion = '' and f->>'institucion' <> ''));
      if found then upd := upd + 1; end if;
    end if;
  end loop;
  perform public._log('importacion', json_build_object('insertados', ins, 'actualizados', upd)::jsonb);
  return json_build_object('insertados', ins, 'actualizados', upd, 'resumen', pv->'resumen');
end $$;

create or replace function public.agregar_participante(p_nombre text, p_email text, p_institucion text default '')
returns json language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin(); v_email text := public._norm_email(p_email); p public.participantes;
begin
  if not public._email_valido(v_email) then raise exception 'Correo no válido.'; end if;
  insert into participantes (codigo, nombre, email, institucion, origen, creado_por)
  values (public._nuevo_codigo(), public._limpiar(p_nombre), v_email, public._limpiar(p_institucion), 'previo', o.id)
  on conflict (email) do nothing returning * into p;
  if p.id is null then
    select * into p from participantes where email = v_email;
    raise exception 'Ese correo ya está registrado (%).', p.codigo;
  end if;
  perform public._log('agregar', json_build_object('codigo', p.codigo)::jsonb);
  return json_build_object('id', p.id, 'codigo', p.codigo);
end $$;

-- Edita datos. El id y el QR NO cambian. Si cambia el correo, el envío vuelve a "pendiente".
create or replace function public.actualizar_participante(p_id uuid, p_nombre text, p_email text, p_institucion text)
returns json language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._operador(); v_email text := public._norm_email(p_email); p public.participantes;
begin
  select * into p from participantes where id = p_id for update;
  if p.id is null then raise exception 'Participante no encontrado.'; end if;
  if o.rol <> 'admin' and not (p.origen = 'presencial' and p.creado_por = o.id) then
    raise exception 'Solo puede corregir los participantes que usted registró presencialmente.' using errcode = '42501';
  end if;
  if not public._email_valido(v_email) then raise exception 'Correo no válido.'; end if;
  if v_email <> p.email and exists (select 1 from participantes where email = v_email) then
    raise exception 'Ese correo ya pertenece a otro participante (%).', (select codigo from participantes where email = v_email);
  end if;
  if v_email <> p.email and p.correo_estado = 'procesando' then
    raise exception 'Hay un envío de correo en curso para este participante. Intente en un minuto.';
  end if;
  update participantes set nombre = public._limpiar(p_nombre), institucion = public._limpiar(p_institucion), email = v_email,
         correo_estado = case when v_email <> p.email then 'pendiente' else correo_estado end,
         correo_actualizado_en = case when v_email <> p.email then now() else correo_actualizado_en end,
         actualizado_en = now()
   where id = p_id returning * into p;
  perform public._log('editar', json_build_object('codigo', p.codigo)::jsonb);
  return json_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'email', p.email, 'institucion', p.institucion,
                           'correo_estado', p.correo_estado, 'qr_token', case when o.rol = 'admin' then p.qr_token end);
end $$;

create or replace function public.eliminar_participante(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin(); p public.participantes;
begin
  select * into p from participantes where id = p_id for update;
  if p.id is null then raise exception 'Participante no encontrado.'; end if;
  if exists (select 1 from asistencias where participante_id = p_id) then
    raise exception 'No se puede eliminar: tiene asistencias registradas.';
  end if;
  if p.correo_estado = 'procesando' then raise exception 'Hay un envío de correo en curso.'; end if;
  delete from participantes where id = p_id;
  perform public._log('eliminar', json_build_object('codigo', p.codigo, 'email', p.email)::jsonb);
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ QR (admin)

create or replace function public.generar_qr_pendientes(p_limite integer default 500) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin(); n int;
begin
  with c as (select id from participantes where qr_token is null order by creado_en limit greatest(1, least(p_limite, 2000)) for update skip locked)
  update participantes p set qr_token = public._nuevo_token(), qr_generado_en = now(), actualizado_en = now()
    from c where p.id = c.id and p.qr_token is null;
  get diagnostics n = row_count;
  if n > 0 then perform public._log('generar_qr', json_build_object('cantidad', n)::jsonb); end if;
  return json_build_object('generados', n, 'pendientes', (select count(*) from participantes where qr_token is null),
                           'total', (select count(*) from participantes));
end $$;

create or replace function public.anular_qr(p_id uuid, p_motivo text default '') returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin(); p public.participantes;
begin
  select * into p from participantes where id = p_id for update;
  if p.id is null then raise exception 'Participante no encontrado.'; end if;
  if p.correo_estado = 'procesando' then raise exception 'Hay un envío de correo en curso. Intente en un minuto.'; end if;
  if p.qr_token is not null then
    insert into qr_anulados (token, participante_id, anulado_por, motivo) values (p.qr_token, p.id, o.id, public._limpiar(p_motivo));
  end if;
  update participantes set qr_token = public._nuevo_token(), qr_generado_en = now(),
         correo_estado = 'pendiente', correo_actualizado_en = now(), actualizado_en = now()
   where id = p_id returning * into p;
  perform public._log('anular_qr', json_build_object('codigo', p.codigo, 'motivo', p_motivo)::jsonb);
  return json_build_object('id', p.id, 'codigo', p.codigo, 'qr_token', p.qr_token);
end $$;

-- ------------------------------------------------------------------ Ingreso (admin y operador)

-- Puesto celular: escaneo. Una asistencia por persona y día; la segunda lectura devuelve la hora original.
create or replace function public.registrar_ingreso_qr(p_qr text) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._operador(); v_tok text; p public.participantes; a public.asistencias; an public.qr_anulados;
begin
  v_tok := substring(btrim(coalesce(p_qr, '')) from '^IM26:([0-9a-f]{32})$');
  if v_tok is null then
    return json_build_object('estado', 'invalido', 'msg', 'Este código no es una acreditación de INNOMINING 2026.');
  end if;
  select * into p from participantes where qr_token = v_tok;
  if p.id is null then
    select * into an from qr_anulados where token = v_tok;
    if an.token is not null then
      return json_build_object('estado', 'anulado', 'msg', 'QR anulado (' || (select codigo from participantes where id = an.participante_id) ||
                               '). No registre el ingreso; busque al participante por nombre.');
    end if;
    return json_build_object('estado', 'invalido', 'msg', 'QR no registrado en el sistema.');
  end if;
  perform public._fecha_permitida();
  insert into asistencias (participante_id, fecha, metodo, operador_id)
  values (p.id, public._hoy(), 'escaneo', o.id)
  on conflict (participante_id, fecha) do nothing returning * into a;
  if a.id is not null then return public._ingreso_json(p, a, 'ok'); end if;
  select * into a from asistencias where participante_id = p.id and fecha = public._hoy();
  return public._ingreso_json(p, a, 'ya');
end $$;

-- Puesto laptop: «Registrar e ingresar» en una sola transacción.
--  * correo nuevo   → crea participante (presencial) + QR + asistencia. Correo queda PENDIENTE de envío.
--  * correo existe  → no duplica: devuelve 'existe'; con p_confirmar registra la asistencia.
--  * ya ingresó hoy → 'ya' con la hora original.
create or replace function public.registrar_presencial(p_nombre text, p_email text, p_institucion text default '', p_confirmar boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._operador(); v_nombre text := public._limpiar(p_nombre); v_email text := public._norm_email(p_email);
        p public.participantes; a public.asistencias; v_nuevo boolean := false;
begin
  if v_nombre = '' then raise exception 'El nombre completo es obligatorio.'; end if;
  if not public._email_valido(v_email) then raise exception 'Correo no válido. Revíselo con el participante.'; end if;
  perform public._fecha_permitida();

  insert into participantes (codigo, nombre, email, institucion, origen, qr_token, qr_generado_en, creado_por)
  values (public._nuevo_codigo(), v_nombre, v_email, public._limpiar(p_institucion), 'presencial', public._nuevo_token(), now(), o.id)
  on conflict (email) do nothing returning * into p;
  v_nuevo := p.id is not null;

  if not v_nuevo then
    select * into p from participantes where email = v_email for update;
    select * into a from asistencias where participante_id = p.id and fecha = public._hoy();
    if a.id is not null then return public._ingreso_json(p, a, 'ya'); end if;
    if not p_confirmar then
      return json_build_object('estado', 'existe', 'id', p.id, 'codigo', p.codigo, 'nombre', coalesce(nullif(p.nombre, ''), '(sin nombre)'),
                               'institucion', p.institucion, 'origen', p.origen);
    end if;
    if p.qr_token is null then
      update participantes set qr_token = public._nuevo_token(), qr_generado_en = now() where id = p.id returning * into p;
    end if;
    if p.nombre = '' then update participantes set nombre = v_nombre where id = p.id returning * into p; end if;
  end if;

  insert into asistencias (participante_id, fecha, metodo, operador_id)
  values (p.id, public._hoy(), 'presencial', o.id)
  on conflict (participante_id, fecha) do nothing returning * into a;
  if a.id is null then
    select * into a from asistencias where participante_id = p.id and fecha = public._hoy();
    return public._ingreso_json(p, a, 'ya');
  end if;
  if v_nuevo then perform public._log('registro_presencial', json_build_object('codigo', p.codigo)::jsonb); end if;
  return public._ingreso_json(p, a, case when v_nuevo then 'nuevo' else 'ok' end);
end $$;

-- Situación C: inscrito sin QR a mano → se busca y se registra por id.
create or replace function public.registrar_ingreso_id(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._operador(); p public.participantes; a public.asistencias;
begin
  select * into p from participantes where id = p_id for update;
  if p.id is null then raise exception 'Participante no encontrado.'; end if;
  perform public._fecha_permitida();
  if p.qr_token is null then
    update participantes set qr_token = public._nuevo_token(), qr_generado_en = now() where id = p.id returning * into p;
  end if;
  insert into asistencias (participante_id, fecha, metodo, operador_id)
  values (p.id, public._hoy(), 'presencial', o.id)
  on conflict (participante_id, fecha) do nothing returning * into a;
  if a.id is not null then return public._ingreso_json(p, a, 'ok'); end if;
  select * into a from asistencias where participante_id = p.id and fecha = public._hoy();
  return public._ingreso_json(p, a, 'ya');
end $$;

-- Búsqueda para el puesto de registro. Operadores ven el correo enmascarado.
create or replace function public.buscar_participantes(p_q text) returns json
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador(); q text := lower(btrim(coalesce(p_q, '')));
begin
  if length(q) < 3 then return '[]'::json; end if;
  return (select coalesce(json_agg(x), '[]') from (
    select p.id, p.codigo, coalesce(nullif(p.nombre, ''), '(sin nombre)') as nombre, p.institucion, p.origen,
           case when o.rol = 'admin' then p.email
                else left(split_part(p.email, '@', 1), 2) || '•••@' || split_part(p.email, '@', 2) end as email,
           (select public._hora_lima(a.hora) from asistencias a where a.participante_id = p.id and a.fecha = public._hoy()) as ingreso_hoy
      from participantes p
     where position(q in lower(p.nombre || ' ' || p.email || ' ' || p.codigo)) > 0
        or position(q in lower(translate(p.nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))) > 0
     order by p.nombre limit 15) x);
end $$;

create or replace function public.ultimos_ingresos() returns json
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador();
begin
  return json_build_object(
    'hoy', to_char(public._hoy(), 'DD/MM/YYYY'),
    'ingresos_hoy', (select count(*) from asistencias where fecha = public._hoy()),
    'total', (select count(*) from participantes),
    'ultimos', (select coalesce(json_agg(x), '[]') from (
       select coalesce(nullif(p.nombre, ''), '(sin nombre)') as nombre, p.codigo, public._hora_lima(a.hora) as hora, a.metodo,
              (select split_part(coalesce(nullif(op.nombre, ''), op.email), '@', 1) from operadores op where op.id = a.operador_id) as operador
         from asistencias a join participantes p on p.id = a.participante_id
        where a.fecha = public._hoy() order by a.hora desc limit 10) x));
end $$;

-- ------------------------------------------------------------------ Exportación y configuración (admin)

create or replace function public.exportar_registros() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin();
  return json_build_object(
    'fechas', (select coalesce(json_agg(to_char(f, 'DD/MM/YYYY') order by f), '[]') from (
                 select unnest(fechas_evento) f from configuracion union select distinct fecha from asistencias) d),
    'filas', (select coalesce(json_agg(x order by x.codigo), '[]') from (
      select p.id, p.codigo, p.nombre, p.email, p.institucion,
             case p.origen when 'previo' then 'Inscripción previa' else 'Registro presencial' end as origen,
             case when p.qr_token is null then 'pendiente' else 'generado' end as qr,
             p.correo_estado as correo,
             (select json_object_agg(to_char(a.fecha, 'DD/MM/YYYY'), public._hora_lima(a.hora) || ' (' || a.metodo || ')') from asistencias a where a.participante_id = p.id) as asistencias,
             (select to_char(min(a.hora) at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI:SS') from asistencias a where a.participante_id = p.id) as primer_ingreso
        from participantes p) x));
end $$;

create or replace function public.obtener_configuracion() returns json
language plpgsql stable security definer set search_path = public as $$
declare c public.configuracion;
begin
  perform public._admin();
  select * into c from configuracion;
  return json_build_object('fechas_evento', (select coalesce(json_agg(f order by f), '[]') from unnest(c.fechas_evento) f),
    'permitir_fuera_de_fecha', c.permitir_fuera_de_fecha, 'limite_diario_correos', c.limite_diario_correos,
    'operadores', (select coalesce(json_agg(json_build_object('email', email, 'nombre', nombre, 'rol', rol, 'activo', activo) order by rol, email), '[]') from operadores));
end $$;

create or replace function public.guardar_configuracion(p_fechas date[], p_permitir_fuera_de_fecha boolean, p_limite integer)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update configuracion set fechas_evento = (select coalesce(array_agg(distinct f order by f), '{}') from unnest(p_fechas) f),
         permitir_fuera_de_fecha = p_permitir_fuera_de_fecha, limite_diario_correos = p_limite, actualizado_en = now();
  perform public._log('configuracion', json_build_object('fechas', p_fechas, 'fuera', p_permitir_fuera_de_fecha, 'limite', p_limite)::jsonb);
  return public.obtener_configuracion();
end $$;

create or replace function public.historial_envios(p_limite integer default 100) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin();
  return (select coalesce(json_agg(x), '[]') from (
    select e.id, e.destinatario, e.tipo, e.estado, e.brevo_message_id, e.error,
           to_char(e.creado_en at time zone 'America/Lima', 'DD/MM HH24:MI:SS') as fecha, p.codigo, p.nombre, p.id as participante_id
      from envios_correo e left join participantes p on p.id = e.participante_id
     order by e.creado_en desc limit least(p_limite, 500)) x);
end $$;

-- Para la vista previa del correo en el panel (datos del primer participante con QR o del indicado).
create or replace function public.datos_vista_previa(p_id uuid default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare p public.participantes;
begin
  perform public._admin();
  if p_id is not null then select * into p from participantes where id = p_id; end if;
  if p.id is null then select * into p from participantes where qr_token is not null order by creado_en limit 1; end if;
  return json_build_object('nombre', coalesce(nullif(p.nombre, ''), 'Nombre del participante'), 'email', coalesce(p.email, 'participante@ejemplo.com'),
                           'codigo', coalesce(p.codigo, 'IM26-XXXXX'), 'qr_token', coalesce(p.qr_token, repeat('0', 32)));
end $$;

-- ------------------------------------------------------------------ Envíos (solo backend: service_role)

-- Libera envíos que quedaron "procesando" por un corte: pasan a "incierto" (requieren verificación, no se reintentan solos).
create or replace function public.srv_liberar_colgados(p_minutos integer default 5) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with e as (update envios_correo set estado = 'incierto', error = 'Sin respuesta del proveedor. Verifique antes de reenviar.', finalizado_en = now()
              where estado = 'procesando' and creado_en < now() - make_interval(mins => p_minutos) returning participante_id)
  update participantes p set correo_estado = 'incierto', correo_actualizado_en = now() from e where p.id = e.participante_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Reserva un lote. Bloquea filas (SKIP LOCKED) y deja cada una en "procesando" con su registro de envío.
-- Modos: pendientes | fallidos | ids (p_forzar permite reenviar a aceptados/entregados/inciertos).
create or replace function public.srv_reservar_envios(p_operador uuid, p_modo text, p_ids uuid[], p_forzar boolean, p_limite integer)
returns json language plpgsql security definer set search_path = public as $$
declare c public.configuracion; usados int; cupo int; r record; lote json[] := '{}'; v_envio uuid;
begin
  if not exists (select 1 from operadores where id = p_operador and activo and rol = 'admin') then
    raise exception 'Esta acción requiere una cuenta de administrador.' using errcode = '42501';
  end if;
  select * into c from configuracion;
  select count(*) into usados from envios_correo
   where (creado_en at time zone 'America/Lima')::date = public._hoy() and estado in ('procesando', 'aceptado', 'entregado', 'incierto');
  cupo := greatest(0, c.limite_diario_correos - usados);
  for r in
    select p.* from participantes p
     where case p_modo
             when 'pendientes' then p.correo_estado = 'pendiente'
             when 'fallidos'   then p.correo_estado = 'fallido'
             when 'ids'        then p.id = any (p_ids) and (p.correo_estado in ('pendiente', 'fallido')
                                      or (p_forzar and p.correo_estado in ('aceptado', 'entregado', 'incierto')))
             else false end
     order by p.creado_en
     limit least(greatest(p_limite, 0), cupo)
     for update skip locked
  loop
    if r.qr_token is null then
      update participantes set qr_token = public._nuevo_token(), qr_generado_en = now() where id = r.id returning qr_token into r.qr_token;
    end if;
    begin
      insert into envios_correo (participante_id, destinatario, solicitado_por) values (r.id, r.email, p_operador) returning id into v_envio;
    exception when unique_violation then continue;  -- otro proceso ya lo está enviando
    end;
    update participantes set correo_estado = 'procesando', correo_actualizado_en = now() where id = r.id;
    lote := lote || json_build_object('envio_id', v_envio, 'participante_id', r.id, 'nombre', r.nombre, 'email', r.email,
                                      'codigo', r.codigo, 'qr_token', r.qr_token);
  end loop;
  return json_build_object('lote', array_to_json(lote), 'cupo', cupo - coalesce(array_length(lote, 1), 0), 'limite', c.limite_diario_correos);
end $$;

-- Cierra un envío. p_resultado: aceptado | fallido | temporal (vuelve a pendiente) | incierto
create or replace function public.srv_finalizar_envio(p_envio uuid, p_resultado text, p_message_id text default null, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e public.envios_correo;
begin
  update envios_correo set
    estado = case p_resultado when 'aceptado' then 'aceptado' when 'incierto' then 'incierto' else 'fallido' end,
    brevo_message_id = coalesce(p_message_id, brevo_message_id), error = left(p_error, 500), finalizado_en = now()
  where id = p_envio and estado in ('procesando', 'incierto') returning * into e;
  if e.id is null or e.participante_id is null then return; end if;
  update participantes set correo_estado = case p_resultado when 'aceptado' then 'aceptado' when 'incierto' then 'incierto'
                                                            when 'temporal' then 'pendiente' else 'fallido' end,
         correo_actualizado_en = now()
   where id = e.participante_id and correo_estado in ('procesando', 'incierto');
end $$;

create or replace function public.srv_registrar_prueba(p_operador uuid, p_destinatario text, p_resultado text, p_message_id text, p_error text)
returns void language sql security definer set search_path = public as $$
  insert into envios_correo (destinatario, tipo, estado, brevo_message_id, error, solicitado_por, finalizado_en)
  values (p_destinatario, 'prueba', case when p_resultado = 'aceptado' then 'aceptado' else 'fallido' end, p_message_id, left(p_error, 500), p_operador, now());
$$;

-- Envíos "inciertos" del participante (para verificar en Brevo).
create or replace function public.srv_envio_incierto(p_participante uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('envio_id', e.id, 'email', e.destinatario, 'creado_en', e.creado_en)
    from envios_correo e where e.participante_id = p_participante and e.estado = 'incierto' order by e.creado_en desc limit 1;
$$;

-- Webhook de Brevo: "delivered" confirma entrega; rebotes/bloqueos marcan fallido.
create or replace function public.srv_evento_brevo(p_message_id text, p_evento text, p_detalle text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e public.envios_correo; v_estado text;
begin
  v_estado := case when p_evento = 'delivered' then 'entregado'
                   when p_evento in ('hard_bounce', 'invalid_email', 'blocked', 'error', 'spam') then 'devuelto' end;
  if v_estado is null then return; end if;
  update envios_correo set estado = v_estado, error = case when v_estado = 'devuelto' then left(coalesce(p_detalle, p_evento), 500) else error end
   where brevo_message_id = p_message_id and estado in ('aceptado', 'entregado') returning * into e;
  if e.id is null or e.participante_id is null then return; end if;
  -- Solo afecta al participante si es su envío más reciente.
  if e.id = (select id from envios_correo where participante_id = e.participante_id order by creado_en desc limit 1) then
    update participantes set correo_estado = case v_estado when 'entregado' then 'entregado' else 'fallido' end, correo_actualizado_en = now()
     where id = e.participante_id and correo_estado in ('aceptado', 'entregado');
  end if;
end $$;

-- Rol del usuario autenticado que llama a una Edge Function.
create or replace function public.srv_rol(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select rol from public.operadores where id = p_id and activo;
$$;

-- Imagen pública del QR: solo para tokens activos (el QR no contiene datos personales).
create or replace function public.srv_qr_activo(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from participantes where qr_token = p_token);
$$;

-- Alta de operadores (ejecutar en el SQL Editor de Supabase tras crear el usuario en Authentication).
create or replace function public.registrar_operador(p_email text, p_rol text, p_nombre text default '')
returns text language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  select id into u from auth.users where lower(email) = lower(btrim(p_email));
  if u is null then raise exception 'No existe un usuario con correo % en Authentication → Users.', p_email; end if;
  insert into operadores (id, email, nombre, rol) values (u, lower(btrim(p_email)), coalesce(p_nombre, ''), p_rol)
  on conflict (id) do update set rol = excluded.rol, nombre = excluded.nombre, activo = true;
  return 'Operador listo: ' || p_email || ' (' || p_rol || ')';
end $$;

-- ------------------------------------------------------------------ Permisos de ejecución

do $$
declare f record;
begin
  -- Nadie ejecuta funciones por defecto.
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Funciones para la interfaz (cada una verifica operador/admin internamente).
grant execute on function public.mi_perfil(), public.resumen(), public.listar_participantes(),
  public.previsualizar_importacion(jsonb), public.confirmar_importacion(jsonb),
  public.agregar_participante(text, text, text), public.actualizar_participante(uuid, text, text, text),
  public.eliminar_participante(uuid), public.generar_qr_pendientes(integer), public.anular_qr(uuid, text),
  public.registrar_ingreso_qr(text), public.registrar_presencial(text, text, text, boolean), public.registrar_ingreso_id(uuid),
  public.buscar_participantes(text), public.ultimos_ingresos(), public.exportar_registros(),
  public.obtener_configuracion(), public.guardar_configuracion(date[], boolean, integer),
  public.historial_envios(integer), public.datos_vista_previa(uuid)
to authenticated;

-- Funciones del backend (Edge Functions con service_role).
grant execute on function public.srv_liberar_colgados(integer), public.srv_reservar_envios(uuid, text, uuid[], boolean, integer),
  public.srv_finalizar_envio(uuid, text, text, text), public.srv_registrar_prueba(uuid, text, text, text, text),
  public.srv_envio_incierto(uuid), public.srv_evento_brevo(text, text, text), public.srv_qr_activo(text), public.srv_rol(uuid)
to service_role;

-- Lectura directa (solo administradores) por si se usa el editor de tablas o Realtime.
drop policy if exists admin_lee on public.participantes;
create policy admin_lee on public.participantes for select to authenticated using (public._es_admin());
drop policy if exists admin_lee on public.asistencias;
create policy admin_lee on public.asistencias for select to authenticated using (public._es_admin());
drop policy if exists admin_lee on public.envios_correo;
create policy admin_lee on public.envios_correo for select to authenticated using (public._es_admin());
drop policy if exists propio on public.operadores;
create policy propio on public.operadores for select to authenticated using (id = auth.uid());
grant execute on function public._es_admin() to authenticated;
