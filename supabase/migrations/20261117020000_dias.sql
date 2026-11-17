-- Asistencia por DÍA del congreso (Día 1, 2 y 3), elegido en la pantalla inicial.
-- Una asistencia por participante y día. La fecha y hora siguen siendo las del servidor (Lima).

alter table public.asistencias add column if not exists dia smallint;
update public.asistencias set dia = 1 where dia is null;
alter table public.asistencias alter column dia set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'asistencias_dia_valido') then
    alter table public.asistencias add constraint asistencias_dia_valido check (dia between 1 and 3);
  end if;
end $$;
alter table public.asistencias drop constraint if exists asistencias_participante_id_fecha_key;
create unique index if not exists asistencias_un_ingreso_por_dia on public.asistencias (participante_id, dia);
create index if not exists asistencias_dia_idx on public.asistencias (dia, hora desc);

drop function if exists public.registrar_ingreso_qr(text);
drop function if exists public.registrar_presencial(text, text, text, boolean);
drop function if exists public.registrar_ingreso_id(uuid);
drop function if exists public.buscar_participantes(text);
drop function if exists public.ultimos_ingresos();

create or replace function public._dia(p integer) returns smallint
language plpgsql immutable as $$
begin
  if p is null or p not between 1 and 3 then raise exception 'Elija el día del congreso (1, 2 o 3).'; end if;
  return p::smallint;
end $$;

create or replace function public._ingreso_json(p public.participantes, a public.asistencias, p_estado text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'estado', p_estado, 'id', p.id, 'codigo', p.codigo, 'nombre', coalesce(nullif(p.nombre, ''), '(sin nombre)'),
    'institucion', p.institucion, 'origen', p.origen, 'dia', a.dia,
    'fecha', to_char(a.hora at time zone 'America/Lima', 'DD/MM/YYYY'), 'hora', public._hora_lima(a.hora), 'metodo', a.metodo,
    'operador', (select coalesce(nullif(o.nombre, ''), o.email) from public.operadores o where o.id = a.operador_id),
    'correo_estado', p.correo_estado)
$$;

create or replace function public.registrar_ingreso_qr(p_qr text, p_dia integer) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._operador(); d smallint := public._dia(p_dia); v_tok text;
        p public.participantes; a public.asistencias; an public.qr_anulados;
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
  insert into asistencias (participante_id, fecha, dia, metodo, operador_id) values (p.id, public._hoy(), d, 'escaneo', o.id)
  on conflict (participante_id, dia) do nothing returning * into a;
  if a.id is not null then return public._ingreso_json(p, a, 'ok'); end if;
  select * into a from asistencias where participante_id = p.id and dia = d;
  return public._ingreso_json(p, a, 'ya');
end $$;

create or replace function public.registrar_presencial(p_nombre text, p_email text, p_institucion text, p_confirmar boolean, p_dia integer)
returns json language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._operador(); d smallint := public._dia(p_dia);
        v_nombre text := public._limpiar(p_nombre); v_email text := public._norm_email(p_email);
        p public.participantes; a public.asistencias; v_nuevo boolean := false;
begin
  if v_nombre = '' then raise exception 'El nombre completo es obligatorio.'; end if;
  if not public._email_valido(v_email) then raise exception 'Correo no válido. Revíselo con el participante.'; end if;

  insert into participantes (codigo, nombre, email, institucion, origen, qr_token, qr_generado_en, creado_por)
  values (public._nuevo_codigo(), v_nombre, v_email, public._limpiar(p_institucion), 'presencial', public._nuevo_token(), now(), o.id)
  on conflict (email) do nothing returning * into p;
  v_nuevo := p.id is not null;

  if not v_nuevo then
    select * into p from participantes where email = v_email for update;
    select * into a from asistencias where participante_id = p.id and dia = d;
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

  insert into asistencias (participante_id, fecha, dia, metodo, operador_id) values (p.id, public._hoy(), d, 'presencial', o.id)
  on conflict (participante_id, dia) do nothing returning * into a;
  if a.id is null then
    select * into a from asistencias where participante_id = p.id and dia = d;
    return public._ingreso_json(p, a, 'ya');
  end if;
  if v_nuevo then perform public._log('registro_presencial', json_build_object('codigo', p.codigo, 'dia', d)::jsonb); end if;
  return public._ingreso_json(p, a, case when v_nuevo then 'nuevo' else 'ok' end);
end $$;

create or replace function public.registrar_ingreso_id(p_id uuid, p_dia integer) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._operador(); d smallint := public._dia(p_dia); p public.participantes; a public.asistencias;
begin
  select * into p from participantes where id = p_id for update;
  if p.id is null then raise exception 'Participante no encontrado.'; end if;
  if p.qr_token is null then
    update participantes set qr_token = public._nuevo_token(), qr_generado_en = now() where id = p.id returning * into p;
  end if;
  insert into asistencias (participante_id, fecha, dia, metodo, operador_id) values (p.id, public._hoy(), d, 'presencial', o.id)
  on conflict (participante_id, dia) do nothing returning * into a;
  if a.id is not null then return public._ingreso_json(p, a, 'ok'); end if;
  select * into a from asistencias where participante_id = p.id and dia = d;
  return public._ingreso_json(p, a, 'ya');
end $$;

create or replace function public.buscar_participantes(p_q text, p_dia integer) returns json
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador(); d smallint := public._dia(p_dia); q text := lower(btrim(coalesce(p_q, '')));
begin
  if length(q) < 3 then return '[]'::json; end if;
  return (select coalesce(json_agg(x), '[]') from (
    select p.id, p.codigo, coalesce(nullif(p.nombre, ''), '(sin nombre)') as nombre, p.institucion, p.origen,
           case when o.rol = 'admin' then p.email
                else left(split_part(p.email, '@', 1), 2) || '•••@' || split_part(p.email, '@', 2) end as email,
           (select public._hora_lima(a.hora) from asistencias a where a.participante_id = p.id and a.dia = d) as ingreso_dia
      from participantes p
     where position(q in lower(p.nombre || ' ' || p.email || ' ' || p.codigo)) > 0
        or position(q in lower(translate(p.nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))) > 0
     order by p.nombre limit 15) x);
end $$;

create or replace function public.ultimos_ingresos(p_dia integer) returns json
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador(); d smallint := public._dia(p_dia);
begin
  return json_build_object(
    'dia', d,
    'ingresos', (select count(*) from asistencias where dia = d),
    'total', (select count(*) from participantes),
    'ultimos', (select coalesce(json_agg(x), '[]') from (
       select coalesce(nullif(p.nombre, ''), '(sin nombre)') as nombre, p.codigo, public._hora_lima(a.hora) as hora, a.metodo,
              (select split_part(coalesce(nullif(op.nombre, ''), op.email), '@', 1) from operadores op where op.id = a.operador_id) as operador
         from asistencias a join participantes p on p.id = a.participante_id
        where a.dia = d order by a.hora desc limit 10) x));
end $$;

create or replace function public.resumen() returns json
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador(); c public.configuracion;
begin
  select * into c from public.configuracion;
  return json_build_object(
    'hoy', to_char(public._hoy(), 'DD/MM/YYYY'),
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
    'ingresos_dia', json_build_array((select count(*) from asistencias where dia = 1), (select count(*) from asistencias where dia = 2),
                                     (select count(*) from asistencias where dia = 3)),
    'nunca_ingresaron', (select count(*) from participantes p where not exists (select 1 from asistencias a where a.participante_id = p.id)),
    'envios_hoy', (select count(*) from envios_correo where (creado_en at time zone 'America/Lima')::date = public._hoy()
                     and estado in ('procesando', 'aceptado', 'entregado', 'incierto')),
    'limite_diario', c.limite_diario_correos,
    'actualizado', public._hora_lima(now()));
end $$;

create or replace function public.listar_participantes() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin();
  return (select coalesce(json_agg(x order by x.creado_en, x.codigo), '[]') from (
    select p.id, p.codigo, p.nombre, p.email, p.institucion, p.origen,
           p.qr_token, to_char(p.qr_generado_en at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI') as qr_generado,
           p.correo_estado, to_char(p.correo_actualizado_en at time zone 'America/Lima', 'DD/MM HH24:MI') as correo_fecha,
           p.creado_en,
           (select coalesce(json_object_agg(a.dia::text, public._hora_lima(a.hora)), '{}') from asistencias a where a.participante_id = p.id) as ingreso_dias,
           (select coalesce(json_agg(json_build_object('dia', a.dia, 'fecha', to_char(a.hora at time zone 'America/Lima', 'DD/MM/YYYY'), 'hora', public._hora_lima(a.hora), 'metodo', a.metodo) order by a.dia), '[]')
              from asistencias a where a.participante_id = p.id) as asistencias,
           (select e.error from envios_correo e where e.participante_id = p.id order by e.creado_en desc limit 1) as correo_error
      from participantes p) x);
end $$;

create or replace function public.exportar_registros() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin();
  return json_build_object('filas', (select coalesce(json_agg(x order by x.codigo), '[]') from (
    select p.id, p.codigo, p.nombre, p.email, p.institucion,
           case p.origen when 'previo' then 'Inscripción previa' else 'Registro presencial' end as origen,
           case when p.qr_token is null then 'pendiente' else 'generado' end as qr, p.correo_estado as correo,
           (select json_object_agg('dia' || a.dia, to_char(a.hora at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI:SS') || ' (' || a.metodo || ')')
              from asistencias a where a.participante_id = p.id) as asistencias
      from participantes p) x));
end $$;

revoke all on function public._dia(integer) from public, anon, authenticated;
revoke all on function public.registrar_ingreso_qr(text, integer), public.registrar_presencial(text, text, text, boolean, integer),
  public.registrar_ingreso_id(uuid, integer), public.buscar_participantes(text, integer), public.ultimos_ingresos(integer) from public, anon;
grant execute on function public.registrar_ingreso_qr(text, integer), public.registrar_presencial(text, text, text, boolean, integer),
  public.registrar_ingreso_id(uuid, integer), public.buscar_participantes(text, integer), public.ultimos_ingresos(integer) to authenticated;
