-- ACTUALIZACIÓN 4: toma de SALIDA (segunda asistencia al final del día).
-- Pegue TODO en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez sin problema.

-- Toma de SALIDA (segunda toma de asistencia, al final de cada día).
-- Es un registro aparte de la entrada: una salida por participante y día. La entrada no cambia.

create table if not exists public.salidas (
  id               uuid primary key default gen_random_uuid(),
  participante_id  uuid not null references public.participantes (id) on delete restrict,
  dia              smallint not null check (dia between 1 and 3),
  hora             timestamptz not null default now(),
  metodo           text not null check (metodo in ('escaneo', 'presencial')),
  operador_id      uuid references public.operadores (id) on delete set null,
  unique (participante_id, dia)
);
create index if not exists salidas_dia_idx on public.salidas (dia, hora desc);
alter table public.salidas enable row level security;
revoke all on table public.salidas from anon, authenticated;

create or replace function public._salida_json(p public.participantes, s public.salidas, p_estado text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'estado', p_estado, 'id', p.id, 'codigo', p.codigo, 'nombre', coalesce(nullif(p.nombre, ''), '(sin nombre)'),
    'institucion', p.institucion, 'origen', p.origen, 'dia', s.dia,
    'fecha', to_char(s.hora at time zone 'America/Lima', 'DD/MM/YYYY'), 'hora', public._hora_lima(s.hora), 'metodo', s.metodo,
    'entrada', (select public._hora_lima(a.hora) from public.asistencias a where a.participante_id = p.id and a.dia = s.dia))
$$;

create or replace function public.registrar_salida_qr(p_qr text, p_dia integer) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._operador(); d smallint := public._dia(p_dia); v_tok text;
        p public.participantes; s public.salidas; an public.qr_anulados;
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
                               '). Busque al participante por nombre en la laptop.');
    end if;
    return json_build_object('estado', 'invalido', 'msg', 'QR no registrado en el sistema.');
  end if;
  insert into salidas (participante_id, dia, metodo, operador_id) values (p.id, d, 'escaneo', o.id)
  on conflict (participante_id, dia) do nothing returning * into s;
  if s.id is not null then return public._salida_json(p, s, 'ok'); end if;
  select * into s from salidas where participante_id = p.id and dia = d;
  return public._salida_json(p, s, 'ya');
end $$;

create or replace function public.registrar_salida_id(p_id uuid, p_dia integer) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._operador(); d smallint := public._dia(p_dia); p public.participantes; s public.salidas;
begin
  select * into p from participantes where id = p_id;
  if p.id is null then raise exception 'Participante no encontrado.'; end if;
  insert into salidas (participante_id, dia, metodo, operador_id) values (p.id, d, 'presencial', o.id)
  on conflict (participante_id, dia) do nothing returning * into s;
  if s.id is not null then return public._salida_json(p, s, 'ok'); end if;
  select * into s from salidas where participante_id = p.id and dia = d;
  return public._salida_json(p, s, 'ya');
end $$;

create or replace function public.ultimas_salidas(p_dia integer) returns json
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador(); d smallint := public._dia(p_dia);
begin
  return json_build_object(
    'dia', d,
    'salidas', (select count(*) from salidas where dia = d),
    'entradas', (select count(*) from asistencias where dia = d));
end $$;

-- Búsqueda en la laptop: ahora también indica si ya marcó salida.
create or replace function public.buscar_participantes(p_q text, p_dia integer) returns json
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador(); d smallint := public._dia(p_dia); q text := lower(btrim(coalesce(p_q, '')));
begin
  if length(q) < 3 then return '[]'::json; end if;
  return (select coalesce(json_agg(x), '[]') from (
    select p.id, p.codigo, coalesce(nullif(p.nombre, ''), '(sin nombre)') as nombre, p.institucion, p.origen,
           case when o.rol = 'admin' then p.email
                else left(split_part(p.email, '@', 1), 2) || '•••@' || split_part(p.email, '@', 2) end as email,
           (select public._hora_lima(a.hora) from asistencias a where a.participante_id = p.id and a.dia = d) as ingreso_dia,
           (select public._hora_lima(s.hora) from salidas s where s.participante_id = p.id and s.dia = d) as salida_dia
      from participantes p
     where position(q in lower(p.nombre || ' ' || p.email || ' ' || p.codigo)) > 0
        or position(q in lower(translate(p.nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))) > 0
     order by p.nombre limit 15) x);
end $$;

-- Asistencia del día: entrada y salida de cada persona (aparece si tiene al menos una de las dos).
create or replace function public.listar_asistencia(p_dia integer) returns json
language plpgsql stable security definer set search_path = public as $$
declare d smallint := public._dia(p_dia);
begin
  perform public._admin();
  return json_build_object(
    'dia', d,
    'total_inscritos', (select count(*) from participantes),
    'filas', (select coalesce(json_agg(x), '[]') from (
      select public._hora_lima(a.hora) as hora, public._hora_lima(s.hora) as salida,
             to_char(coalesce(a.hora, s.hora) at time zone 'America/Lima', 'DD/MM/YYYY') as fecha,
             p.id, p.codigo, coalesce(nullif(p.nombre, ''), '(sin nombre)') as nombre, p.email, p.institucion, p.origen, a.metodo,
             s.metodo as salida_metodo,
             (select coalesce(nullif(o.nombre, ''), o.email) from operadores o where o.id = a.operador_id) as operador
        from participantes p
        left join asistencias a on a.participante_id = p.id and a.dia = d
        left join salidas s on s.participante_id = p.id and s.dia = d
       where a.id is not null or s.id is not null
       order by coalesce(s.hora, a.hora) desc) x));
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
           (select coalesce(json_agg(json_build_object('dia', a.dia, 'fecha', to_char(a.hora at time zone 'America/Lima', 'DD/MM/YYYY'), 'hora', public._hora_lima(a.hora), 'metodo', a.metodo,
                     'salida', (select public._hora_lima(s.hora) from salidas s where s.participante_id = p.id and s.dia = a.dia)) order by a.dia), '[]')
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
              from asistencias a where a.participante_id = p.id) as asistencias,
           (select json_object_agg('dia' || s.dia, to_char(s.hora at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI:SS') || ' (' || s.metodo || ')')
              from salidas s where s.participante_id = p.id) as salidas
      from participantes p) x));
end $$;

-- Resumen: agrega las salidas por día.
create or replace function public.resumen_salidas() returns json
language plpgsql stable security definer set search_path = public as $$
declare o public.operadores := public._operador();
begin
  return json_build_object('salidas_dia', json_build_array(
    (select count(*) from salidas where dia = 1), (select count(*) from salidas where dia = 2), (select count(*) from salidas where dia = 3)));
end $$;

revoke all on function public._salida_json(public.participantes, public.salidas, text) from public, anon, authenticated;
revoke all on function public.registrar_salida_qr(text, integer), public.registrar_salida_id(uuid, integer),
  public.ultimas_salidas(integer), public.resumen_salidas() from public, anon;
grant execute on function public.registrar_salida_qr(text, integer), public.registrar_salida_id(uuid, integer),
  public.ultimas_salidas(integer), public.resumen_salidas() to authenticated;
