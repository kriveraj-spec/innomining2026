-- INNOMINING 2026 · ACTUALIZACIÓN 3: corrige el guardado de la configuración (Supabase exige WHERE en UPDATE). Pegar todo → Run.

-- Configuración de Brevo desde el panel (sin terminal). La clave se guarda CIFRADA en Supabase Vault,
-- nunca se devuelve al navegador y solo la lee el backend (service_role).
alter table public.configuracion add column if not exists brevo_remitente text not null default '';
alter table public.configuracion add column if not exists brevo_nombre text not null default 'INNOMINING 2026';
alter table public.configuracion add column if not exists brevo_clave_fin text not null default '';  -- últimos 4 caracteres, solo para mostrar

create or replace function public.guardar_brevo(p_clave text, p_remitente text, p_nombre text)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_clave text := btrim(coalesce(p_clave, '')); v_rem text := lower(btrim(coalesce(p_remitente, '')));
begin
  perform public._admin();
  if v_rem <> '' and not public._email_valido(v_rem) then raise exception 'El correo remitente no es válido.'; end if;
  if v_clave <> '' then
    if length(v_clave) < 20 then raise exception 'La clave de Brevo parece incompleta.'; end if;
    select id into v_id from vault.secrets where name = 'brevo_api_key';
    if v_id is null then perform vault.create_secret(v_clave, 'brevo_api_key', 'Clave API de Brevo (INNOMINING 2026)');
    else perform vault.update_secret(v_id, v_clave, 'brevo_api_key', 'Clave API de Brevo (INNOMINING 2026)'); end if;
    update configuracion set brevo_clave_fin = right(v_clave, 4) where id;
  end if;
  update configuracion set brevo_remitente = v_rem, brevo_nombre = coalesce(nullif(public._limpiar(p_nombre), ''), 'INNOMINING 2026'), actualizado_en = now() where id;
  perform public._log('config_brevo', json_build_object('remitente', v_rem, 'clave_nueva', v_clave <> '')::jsonb);
  return public.estado_brevo();
end $$;

create or replace function public.estado_brevo() returns json
language plpgsql stable security definer set search_path = public as $$
declare c public.configuracion;
begin
  perform public._admin();
  select * into c from configuracion;
  return json_build_object('clave_configurada', exists (select 1 from vault.secrets where name = 'brevo_api_key'),
                           'clave_fin', c.brevo_clave_fin, 'remitente', c.brevo_remitente, 'nombre', c.brevo_nombre);
end $$;

create or replace function public.srv_config_brevo() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('clave', (select decrypted_secret from vault.decrypted_secrets where name = 'brevo_api_key' limit 1),
                           'remitente', brevo_remitente, 'nombre', brevo_nombre)
    from public.configuracion;
$$;

revoke all on function public.guardar_brevo(text, text, text), public.estado_brevo(), public.srv_config_brevo() from public, anon, authenticated;
grant execute on function public.guardar_brevo(text, text, text), public.estado_brevo() to authenticated;
grant execute on function public.srv_config_brevo() to service_role;

-- Datos del evento que aparecen en el correo (opcionales) + vista previa con esos datos.
alter table public.configuracion add column if not exists evento_fecha_texto text not null default '';
alter table public.configuracion add column if not exists evento_lugar text not null default '';

create or replace function public.estado_brevo() returns json
language plpgsql stable security definer set search_path = public as $$
declare c public.configuracion;
begin
  perform public._admin();
  select * into c from configuracion;
  return json_build_object('clave_configurada', exists (select 1 from vault.secrets where name = 'brevo_api_key'),
                           'clave_fin', c.brevo_clave_fin, 'remitente', c.brevo_remitente, 'nombre', c.brevo_nombre,
                           'evento_fecha', c.evento_fecha_texto, 'evento_lugar', c.evento_lugar);
end $$;

create or replace function public.guardar_info_evento(p_fecha text, p_lugar text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update configuracion set evento_fecha_texto = public._limpiar(p_fecha), evento_lugar = public._limpiar(p_lugar), actualizado_en = now() where id;
  return public.estado_brevo();
end $$;

create or replace function public.srv_config_brevo() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('clave', (select decrypted_secret from vault.decrypted_secrets where name = 'brevo_api_key' limit 1),
                           'remitente', brevo_remitente, 'nombre', brevo_nombre, 'evento_fecha', evento_fecha_texto, 'evento_lugar', evento_lugar)
    from public.configuracion;
$$;

create or replace function public.datos_vista_previa(p_id uuid default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare p public.participantes; c public.configuracion;
begin
  perform public._admin();
  select * into c from configuracion;
  if p_id is not null then select * into p from participantes where id = p_id; end if;
  if p.id is null then select * into p from participantes where qr_token is not null order by creado_en limit 1; end if;
  return json_build_object('nombre', coalesce(nullif(p.nombre, ''), 'Nombre del participante'), 'email', coalesce(p.email, 'participante@ejemplo.com'),
                           'codigo', coalesce(p.codigo, 'IM26-XXXXX'), 'qr_token', coalesce(p.qr_token, repeat('0', 32)),
                           'evento_fecha', c.evento_fecha_texto, 'evento_lugar', c.evento_lugar);
end $$;

revoke all on function public.guardar_info_evento(text, text) from public, anon;
grant execute on function public.guardar_info_evento(text, text) to authenticated;
revoke all on function public.srv_config_brevo() from public, anon, authenticated;
grant execute on function public.srv_config_brevo() to service_role;

create or replace function public.guardar_configuracion(p_fechas date[], p_permitir_fuera_de_fecha boolean, p_limite integer)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._admin();
  update configuracion set fechas_evento = (select coalesce(array_agg(distinct f order by f), '{}') from unnest(p_fechas) f),
         permitir_fuera_de_fecha = p_permitir_fuera_de_fecha, limite_diario_correos = p_limite, actualizado_en = now() where id;
  perform public._log('configuracion', json_build_object('fechas', p_fechas, 'fuera', p_permitir_fuera_de_fecha, 'limite', p_limite)::jsonb);
  return public.obtener_configuracion();
end $$;


select 'ACTUALIZACIÓN 3 COMPLETA' as resultado;
