-- Mi Gestor · avisos con la app cerrada (Web Push). OPCIONAL.
-- Requisitos: haber ejecutado antes setup.sql. Pega este archivo en Supabase → SQL Editor → Run.
-- Se puede ejecutar más de una vez.
--
-- Privacidad: los avisos NO llevan datos (solo "Hay novedades" o "Tienes un pago por vencer").
-- El servidor guarda la dirección de envío de cada teléfono (endpoint) y la HORA de cada aviso, nada más.

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text,
  private_key text,
  project_url text check (project_url ~ '^https://[a-z0-9-]+\.supabase\.co$' or project_url ~ '^http://localhost:[0-9]+$'),
  api_key text check (length(api_key) <= 400),
  cron_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into public.push_config (id) values (1) on conflict (id) do nothing;
alter table public.push_config add column if not exists api_key text check (length(api_key) <= 400);

create table if not exists public.push_subscriptions (
  endpoint text not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  group_id text not null check (group_id ~ '^[0-9a-f]{64}$'),
  tag text not null check (tag ~ '^[0-9a-f]{32}$'),
  p256dh text not null check (length(p256dh) between 80 and 100),
  auth text not null check (length(auth) between 16 and 30),
  updated_at timestamptz not null default now(),
  primary key (endpoint, group_id)
);
create index if not exists push_subscriptions_group on public.push_subscriptions (group_id);

create table if not exists public.push_groups (
  group_id text primary key,
  last_notified timestamptz not null
);

create table if not exists public.push_schedule (
  id bigserial primary key,
  endpoint text not null,
  send_at timestamptz not null
);
create index if not exists push_schedule_send_at on public.push_schedule (send_at);

-- Nadie accede a estas tablas directamente: solo mediante las funciones de abajo.
alter table public.push_config enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_groups enable row level security;
alter table public.push_schedule enable row level security;
revoke all on table public.push_config, public.push_subscriptions, public.push_groups, public.push_schedule from anon, authenticated;

-- ===== Funciones que usa la app (clave publishable) =====

-- Registra este teléfono para recibir avisos de un grupo (hay que conocer el id secreto del grupo).
create or replace function public.mg_push_register(p_group text, p_endpoint text, p_p256dh text, p_auth text, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_subscriptions (endpoint, group_id, tag, p256dh, auth, updated_at)
  values (p_endpoint, p_group, p_tag, p_p256dh, p_auth, now())
  on conflict (endpoint, group_id) do update set tag = excluded.tag, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
end $$;

create or replace function public.mg_push_unregister(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
  delete from public.push_schedule where endpoint = p_endpoint;
$$;

-- Reemplaza las horas de aviso de este teléfono (máximo 60, dentro de los próximos 90 días).
create or replace function public.mg_push_schedule(p_endpoint text, p_times timestamptz[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from public.push_subscriptions where endpoint = p_endpoint) then
    raise exception 'teléfono no registrado';
  end if;
  delete from public.push_schedule where endpoint = p_endpoint;
  insert into public.push_schedule (endpoint, send_at)
  select distinct p_endpoint, t from unnest(p_times[1:60]) as t
  where t > now() - interval '1 hour' and t < now() + interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- La dirección del proyecto y la clave publishable (para la tarea programada). Solo se fijan una vez.
drop function if exists public.mg_push_set_url(text);
create or replace function public.mg_push_set_url(p_url text, p_key text)
returns void language sql security definer set search_path = public as $$
  update public.push_config set project_url = p_url, api_key = p_key where id = 1 and project_url is null;
$$;

-- ===== Funciones que usa solo la función del servidor (clave de servicio) =====

create or replace function public.mg_push_config()
returns public.push_config language sql stable security definer set search_path = public as $$
  select * from public.push_config where id = 1;
$$;

create or replace function public.mg_push_set_vapid(p_public text, p_private text)
returns void language sql security definer set search_path = public as $$
  update public.push_config set public_key = p_public, private_key = p_private where id = 1 and public_key is null;
$$;

-- Teléfonos del grupo a los que avisar (excepto el que hizo el cambio). Como máximo un aviso cada 20 s por grupo.
create or replace function public.mg_push_targets(p_group text, p_exclude_tag text)
returns table (endpoint text, p256dh text, auth text) language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.push_groups g where g.group_id = p_group and g.last_notified > now() - interval '20 seconds') then
    return;
  end if;
  if not exists (select 1 from public.push_subscriptions s where s.group_id = p_group) then
    return;
  end if;
  insert into public.push_groups (group_id, last_notified) values (p_group, now())
  on conflict (group_id) do update set last_notified = now();
  return query select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s
    where s.group_id = p_group and s.tag <> p_exclude_tag;
end $$;

-- Avisos programados que ya tocan (se borran al entregarlos).
create or replace function public.mg_push_due()
returns table (endpoint text, p256dh text, auth text) language sql security definer set search_path = public as $$
  with due as (
    delete from public.push_schedule where send_at <= now() returning endpoint
  )
  select distinct on (s.endpoint) s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s where s.endpoint in (select endpoint from due);
$$;

create or replace function public.mg_push_remove(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
  delete from public.push_schedule where endpoint = p_endpoint;
$$;

revoke all on function public.mg_push_register(text, text, text, text, text), public.mg_push_unregister(text),
  public.mg_push_schedule(text, timestamptz[]), public.mg_push_set_url(text, text), public.mg_push_config(),
  public.mg_push_set_vapid(text, text), public.mg_push_targets(text, text), public.mg_push_due(), public.mg_push_remove(text) from public;
grant execute on function public.mg_push_register(text, text, text, text, text), public.mg_push_unregister(text),
  public.mg_push_schedule(text, timestamptz[]), public.mg_push_set_url(text, text) to anon, authenticated;
grant execute on function public.mg_push_config(), public.mg_push_set_vapid(text, text), public.mg_push_targets(text, text),
  public.mg_push_due(), public.mg_push_remove(text) to service_role;

-- ===== Tarea programada: cada 10 minutos envía los recordatorios que tocan =====
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'mi-gestor-avisos';
    perform cron.schedule('mi-gestor-avisos', '*/10 * * * *', $job$
      select net.http_post(
        url := c.project_url || '/functions/v1/mg-push',
        body := jsonb_build_object('action', 'cron', 'secret', c.cron_secret),
        headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', coalesce(c.api_key, ''))
      )
      from public.push_config c where c.id = 1 and c.project_url is not null
    $job$);
  else
    raise notice 'pg_cron/pg_net no disponibles: los recordatorios programados no se enviarán solos.';
  end if;
end
$do$;
