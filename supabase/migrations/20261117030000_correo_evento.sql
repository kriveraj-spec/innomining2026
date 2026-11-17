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
  update configuracion set evento_fecha_texto = public._limpiar(p_fecha), evento_lugar = public._limpiar(p_lugar), actualizado_en = now();
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
