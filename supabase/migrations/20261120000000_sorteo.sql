-- SORTEO (ruleta) del día 3.
-- Asistencia por día: Día 1 y Día 2 → entrada + salida = día completo; solo una de las dos = medio día.
--                     Día 3 → con entrada o salida = día completo.
-- Porcentaje = (suma de los 3 días) / 3 × 100. El umbral (p. ej. 60 %) se elige en la página.

create table if not exists public.sorteo_ganadores (
  id               uuid primary key default gen_random_uuid(),
  participante_id  uuid not null references public.participantes (id) on delete restrict,
  premio           text not null default '',
  estado           text not null check (estado in ('ganador', 'ausente')),
  creado_en        timestamptz not null default now(),
  operador_id      uuid references public.operadores (id) on delete set null
);
create unique index if not exists sorteo_un_premio_por_persona on public.sorteo_ganadores (participante_id) where estado = 'ganador';
alter table public.sorteo_ganadores enable row level security;
revoke all on table public.sorteo_ganadores from anon, authenticated;

create or replace function public.sorteo_datos() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin();
  return json_build_object(
    'actualizado', public._hora_lima(now()),
    'participantes', (select coalesce(json_agg(x order by x.pct desc, x.nombre), '[]') from (
      select p.id, p.codigo, coalesce(nullif(p.nombre, ''), '(sin nombre)') as nombre, p.institucion, p.origen,
             d.d1, d.d2, d.d3, round((d.d1 + d.d2 + d.d3) * 100.0 / 3, 1) as pct,
             (select g.estado from sorteo_ganadores g where g.participante_id = p.id order by (g.estado = 'ganador') desc, g.creado_en desc limit 1) as sorteo
        from participantes p
        cross join lateral (
          select
            (case when e1 and s1 then 1.0 when e1 or s1 then 0.5 else 0 end) as d1,
            (case when e2 and s2 then 1.0 when e2 or s2 then 0.5 else 0 end) as d2,
            (case when e3 or s3 then 1.0 else 0 end) as d3
          from (select
            exists (select 1 from asistencias a where a.participante_id = p.id and a.dia = 1) as e1,
            exists (select 1 from salidas s where s.participante_id = p.id and s.dia = 1) as s1,
            exists (select 1 from asistencias a where a.participante_id = p.id and a.dia = 2) as e2,
            exists (select 1 from salidas s where s.participante_id = p.id and s.dia = 2) as s2,
            exists (select 1 from asistencias a where a.participante_id = p.id and a.dia = 3) as e3,
            exists (select 1 from salidas s where s.participante_id = p.id and s.dia = 3) as s3) f
        ) d
       where d.d1 + d.d2 + d.d3 > 0) x),
    'ganadores', (select coalesce(json_agg(x order by x.creado_en desc), '[]') from (
      select g.id, g.participante_id, g.premio, g.estado, g.creado_en, public._hora_lima(g.creado_en) as hora,
             p.codigo, coalesce(nullif(p.nombre, ''), '(sin nombre)') as nombre, p.email, p.institucion
        from sorteo_ganadores g join participantes p on p.id = g.participante_id) x));
end $$;

create or replace function public.sorteo_guardar(p_participante uuid, p_premio text, p_estado text) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin(); g public.sorteo_ganadores;
begin
  if p_estado not in ('ganador', 'ausente') then raise exception 'Estado no válido.'; end if;
  if not exists (select 1 from participantes where id = p_participante) then raise exception 'Participante no encontrado.'; end if;
  if p_estado = 'ganador' and exists (select 1 from sorteo_ganadores where participante_id = p_participante and estado = 'ganador') then
    raise exception 'Esta persona ya ganó un premio.';
  end if;
  insert into sorteo_ganadores (participante_id, premio, estado, operador_id)
  values (p_participante, left(btrim(coalesce(p_premio, '')), 120), p_estado, o.id) returning * into g;
  return json_build_object('id', g.id, 'estado', g.estado);
end $$;

create or replace function public.sorteo_quitar(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin();
begin
  delete from sorteo_ganadores where id = p_id;
  return json_build_object('ok', true);
end $$;

revoke all on function public.sorteo_datos(), public.sorteo_guardar(uuid, text, text), public.sorteo_quitar(uuid) from public, anon;
grant execute on function public.sorteo_datos(), public.sorteo_guardar(uuid, text, text), public.sorteo_quitar(uuid) to authenticated;
