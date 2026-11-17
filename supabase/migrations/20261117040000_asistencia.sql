-- Lista de asistencia por día (sección "Asistencia"), separada de la lista de inscritos.
create or replace function public.listar_asistencia(p_dia integer) returns json
language plpgsql stable security definer set search_path = public as $$
declare d smallint := public._dia(p_dia);
begin
  perform public._admin();
  return json_build_object(
    'dia', d,
    'total_inscritos', (select count(*) from participantes),
    'filas', (select coalesce(json_agg(x), '[]') from (
      select public._hora_lima(a.hora) as hora, to_char(a.hora at time zone 'America/Lima', 'DD/MM/YYYY') as fecha,
             p.id, p.codigo, coalesce(nullif(p.nombre, ''), '(sin nombre)') as nombre, p.email, p.institucion, p.origen, a.metodo,
             (select coalesce(nullif(o.nombre, ''), o.email) from operadores o where o.id = a.operador_id) as operador
        from asistencias a join participantes p on p.id = a.participante_id
       where a.dia = d order by a.hora desc) x));
end $$;
revoke all on function public.listar_asistencia(integer) from public, anon;
grant execute on function public.listar_asistencia(integer) to authenticated;
