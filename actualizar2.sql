-- INNOMINING 2026 · ACTUALIZACIÓN 2: enviar correos directo desde la página (pegar todo en SQL Editor → Run). Se puede ejecutar más de una vez.

-- Envío de correos DIRECTO desde la página, sin Edge Functions:
--  * la base llama a la API de Brevo con pg_net (extensión incluida en Supabase); la clave sigue en Vault;
--  * la imagen del QR se guarda en Storage (bucket público "qr", nombre = token aleatorio, sin datos personales);
--  * el navegador del administrador arma el correo con la plantilla y la base lo despacha y registra el resultado.

create extension if not exists pg_net;

alter table public.configuracion add column if not exists brevo_api_base text not null default 'https://api.brevo.com/v3';
alter table public.envios_correo add column if not exists net_request_id bigint;
alter table public.envios_correo add column if not exists canal text not null default 'servidor';  -- 'pagina' = enviado desde la página (pg_net)

-- ------------------------------------------------------------------ Storage: imágenes del QR para el correo
insert into storage.buckets (id, name, public) values ('qr', 'qr', true) on conflict (id) do update set public = true;
drop policy if exists im26_qr_insertar on storage.objects;
create policy im26_qr_insertar on storage.objects for insert to authenticated with check (bucket_id = 'qr' and public._es_admin());
drop policy if exists im26_qr_actualizar on storage.objects;
create policy im26_qr_actualizar on storage.objects for update to authenticated using (bucket_id = 'qr' and public._es_admin());
drop policy if exists im26_qr_leer on storage.objects;
create policy im26_qr_leer on storage.objects for select to authenticated using (bucket_id = 'qr' and public._es_admin());

-- ------------------------------------------------------------------ Envío
create or replace function public._brevo_listo() returns json
language plpgsql stable security definer set search_path = public as $$
declare c public.configuracion; k text;
begin
  select * into c from configuracion;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'brevo_api_key' limit 1;
  if coalesce(k, '') = '' then raise exception 'Falta la clave de Brevo: péguela en Configuración → Correo (Brevo).'; end if;
  if c.brevo_remitente = '' then raise exception 'Falta el correo remitente en Configuración → Correo (Brevo).'; end if;
  -- Acepta también la clave en formato "MCP" de Brevo (base64 de {"api_key": "..."})
  if k !~ '^xkeysib-' then
    begin k := convert_from(decode(k, 'base64'), 'UTF8')::json ->> 'api_key'; exception when others then null; end;
  end if;
  return json_build_object('clave', k, 'remitente', c.brevo_remitente, 'nombre', c.brevo_nombre, 'base', c.brevo_api_base);
end $$;

-- Paso 1: reserva un lote (evita duplicados aunque haya dos administradores enviando).
create or replace function public.preparar_envios(p_modo text, p_ids uuid[] default null, p_forzar boolean default false, p_limite integer default 5)
returns json language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin(); r json;
begin
  perform public._brevo_listo();
  perform public.srv_liberar_colgados(5);
  r := public.srv_reservar_envios(o.id, p_modo, p_ids, p_forzar, least(greatest(p_limite, 1), 10));
  update envios_correo set canal = 'pagina'
   where id in (select (x->>'envio_id')::uuid from json_array_elements(r->'lote') x);
  return r;
end $$;

create or replace function public._despachar(p_envio uuid, p_para text, p_nombre text, p_asunto text, p_html text, p_texto text, p_png_b64 text, p_adjunto text)
returns bigint language plpgsql security definer set search_path = public as $$
declare b json := public._brevo_listo(); cuerpo jsonb; req bigint;
begin
  cuerpo := jsonb_build_object(
    'sender', jsonb_build_object('email', b->>'remitente', 'name', b->>'nombre'),
    'to', jsonb_build_array(case when coalesce(p_nombre, '') = '' then jsonb_build_object('email', p_para)
                                 else jsonb_build_object('email', p_para, 'name', p_nombre) end),
    'subject', p_asunto, 'htmlContent', p_html, 'textContent', p_texto,
    'tags', jsonb_build_array('innomining2026', 'envio-' || p_envio),
    'headers', jsonb_build_object('X-Mailin-custom', 'envio:' || p_envio));
  if coalesce(p_png_b64, '') <> '' then
    cuerpo := cuerpo || jsonb_build_object('attachment', jsonb_build_array(jsonb_build_object('content', p_png_b64, 'name', p_adjunto)));
  end if;
  select net.http_post(
    url := (b->>'base') || '/smtp/email',
    body := cuerpo,
    headers := jsonb_build_object('api-key', b->>'clave', 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000) into req;
  update envios_correo set net_request_id = req where id = p_envio;
  return req;
end $$;

-- Paso 2: despacha un envío reservado (el navegador aporta el HTML de la plantilla y el PNG del QR).
create or replace function public.despachar_envio(p_envio uuid, p_html text, p_texto text, p_png_b64 text)
returns json language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin(); e public.envios_correo; p public.participantes;
begin
  select * into e from envios_correo where id = p_envio for update;
  if e.id is null or e.estado <> 'procesando' or e.net_request_id is not null then
    return json_build_object('ok', false, 'msg', 'Envío ya despachado o no reservado.');
  end if;
  select * into p from participantes where id = e.participante_id;
  perform public._despachar(e.id, e.destinatario, p.nombre, 'INNOMINING 2026 | Tu código QR de acreditación', p_html, p_texto, p_png_b64,
                            p.codigo || '_INNOMINING2026.png');
  return json_build_object('ok', true);
end $$;

create or replace function public.enviar_prueba(p_destinatario text, p_html text, p_texto text, p_png_b64 text)
returns json language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin(); v text := public._norm_email(p_destinatario); v_id uuid;
begin
  if not public._email_valido(v) then raise exception 'Correo de prueba no válido.'; end if;
  perform public._brevo_listo();
  insert into envios_correo (destinatario, tipo, estado, solicitado_por, canal) values (v, 'prueba', 'procesando', o.id, 'pagina') returning id into v_id;
  perform public._despachar(v_id, v, 'Participante de prueba', '[PRUEBA] INNOMINING 2026 | Tu código QR de acreditación', p_html, p_texto, p_png_b64, 'IM26-PRUEBA.png');
  return json_build_object('envio_id', v_id);
end $$;

-- Paso 3: lee las respuestas de Brevo (llegan unos segundos después) y actualiza los estados.
create or replace function public.procesar_envios() returns json
language plpgsql security definer set search_path = public as $$
declare o public.operadores := public._admin(); e record; res text; msg text; mid text; js jsonb;
        n_ok int := 0; n_fail int := 0; n_inc int := 0; n_tmp int := 0; detener text := null; errores json[] := '{}'; prueba json := null;
begin
  for e in
    select ev.id, ev.tipo, ev.destinatario, ev.creado_en, p.codigo, r.status_code, r.content, r.timed_out, r.error_msg, r.id as rid
      from envios_correo ev
      left join participantes p on p.id = ev.participante_id
      left join net._http_response r on r.id = ev.net_request_id
     where ev.estado = 'procesando' and ev.net_request_id is not null
     for update of ev skip locked
  loop
    res := null; msg := null; mid := null;
    if e.rid is null then
      if e.creado_en < now() - interval '3 minutes' then res := 'incierto'; msg := 'Sin respuesta de Brevo. Verifique en Brevo antes de reenviar.'; end if;
    elsif coalesce(e.timed_out, false) then res := 'incierto'; msg := 'Brevo no respondió a tiempo (pudo haberse enviado).';
    elsif e.error_msg is not null then res := 'temporal'; msg := 'No se pudo conectar con Brevo: ' || e.error_msg;
    else
      begin js := e.content::jsonb; exception when others then js := '{}'::jsonb; end;
      msg := 'Brevo ' || e.status_code || ': ' || coalesce(js->>'message', js->>'code', '');
      if e.status_code between 200 and 299 then res := 'aceptado'; mid := js->>'messageId'; msg := null;
      elsif e.status_code in (401, 403) then res := 'temporal';
        detener := msg || '. Revise la clave de Brevo. Si Brevo le envió un correo de «IP no reconocida», autorícela (o desactive el bloqueo en Brevo → Seguridad → IP autorizadas).';
      elsif e.status_code in (402, 429) then res := 'temporal'; detener := msg || '. Cuota o créditos de Brevo agotados.';
      elsif e.status_code >= 500 then res := 'temporal'; detener := msg || '. Brevo no está disponible ahora.';
      elsif msg ~* 'sender|from' then res := 'temporal'; detener := msg || '. El correo remitente no está verificado en Brevo.';
      else res := 'fallido';
      end if;
    end if;
    continue when res is null;
    perform public.srv_finalizar_envio(e.id, res, mid, msg);
    if e.tipo = 'prueba' then prueba := json_build_object('resultado', res, 'error', coalesce(detener, msg)); end if;
    if res = 'aceptado' then n_ok := n_ok + 1;
    elsif res = 'fallido' then n_fail := n_fail + 1; errores := errores || json_build_object('codigo', e.codigo, 'email', e.destinatario, 'error', msg);
    elsif res = 'incierto' then n_inc := n_inc + 1; errores := errores || json_build_object('codigo', e.codigo, 'email', e.destinatario, 'error', msg);
    else n_tmp := n_tmp + 1; end if;
  end loop;
  return json_build_object('aceptados', n_ok, 'fallidos', n_fail, 'inciertos', n_inc, 'devueltos', n_tmp, 'detenido', detener,
    'errores', array_to_json(errores), 'prueba', prueba,
    'en_curso', (select count(*) from envios_correo where estado = 'procesando'));
end $$;

-- Un envío reservado que nunca llegó a despacharse (se cerró la página) vuelve a pendiente; uno despachado sin respuesta queda "incierto".
create or replace function public.srv_liberar_colgados(p_minutos integer default 5) returns integer
language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  with e as (update envios_correo set estado = 'fallido', error = 'No se llegó a enviar (se interrumpió).', finalizado_en = now()
              where estado = 'procesando' and canal = 'pagina' and net_request_id is null and creado_en < now() - make_interval(mins => p_minutos) returning participante_id)
  update participantes p set correo_estado = 'pendiente', correo_actualizado_en = now() from e where p.id = e.participante_id and p.correo_estado = 'procesando';
  get diagnostics n = row_count;
  with e as (update envios_correo set estado = 'incierto', error = 'Sin respuesta del proveedor. Verifique antes de reenviar.', finalizado_en = now()
              where estado = 'procesando' and creado_en < now() - make_interval(mins => p_minutos) returning participante_id)
  update participantes p set correo_estado = 'incierto', correo_actualizado_en = now() from e where p.id = e.participante_id;
  get diagnostics m = row_count;
  return n + m;
end $$;

revoke all on function public._brevo_listo(), public._despachar(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.preparar_envios(text, uuid[], boolean, integer), public.despachar_envio(uuid, text, text, text),
  public.enviar_prueba(text, text, text, text), public.procesar_envios() from public, anon;
grant execute on function public.preparar_envios(text, uuid[], boolean, integer), public.despachar_envio(uuid, text, text, text),
  public.enviar_prueba(text, text, text, text), public.procesar_envios() to authenticated;

select 'ACTUALIZACIÓN 2 COMPLETA' as resultado;
