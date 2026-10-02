-- Mi Gestor · gastos en común
-- Pega todo este archivo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
--
-- El servidor solo guarda datos CIFRADOS en el teléfono (AES-GCM 256): no puede leer montos,
-- descripciones ni nombres. Nadie puede leer la tabla directamente: solo estas dos funciones,
-- y solo para un grupo cuyo identificador secreto (64 caracteres al azar) ya conozcas.

create table if not exists public.shared_entries (
  id uuid primary key,
  group_id text not null check (group_id ~ '^[0-9a-f]{64}$'),
  iv text not null check (length(iv) <= 32),
  data text not null check (length(data) <= 20000),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists shared_entries_group_updated on public.shared_entries (group_id, updated_at);

-- Seguridad a nivel de fila activada y SIN políticas: acceso directo a la tabla denegado.
alter table public.shared_entries enable row level security;
revoke all on table public.shared_entries from anon, authenticated;

-- Lee los cambios de un grupo desde una fecha.
create or replace function public.mg_pull(p_group text, p_since timestamptz)
returns table (id uuid, iv text, data text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.iv, e.data, e.updated_at
  from public.shared_entries e
  where e.group_id = p_group
    and p_group ~ '^[0-9a-f]{64}$'
    and e.updated_at > p_since
  order by e.updated_at
  limit 2000;
$$;

-- Crea o actualiza una entrada cifrada. No puede tocar entradas de otro grupo.
create or replace function public.mg_push(p_id uuid, p_group text, p_iv text, p_data text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz := clock_timestamp();
begin
  if p_group !~ '^[0-9a-f]{64}$' then
    raise exception 'grupo inválido';
  end if;
  insert into public.shared_entries (id, group_id, iv, data, updated_at)
  values (p_id, p_group, p_iv, p_data, ts)
  on conflict (id) do update
    set iv = excluded.iv, data = excluded.data, updated_at = ts
    where public.shared_entries.group_id = excluded.group_id;
  if not found then
    raise exception 'entrada de otro grupo';
  end if;
  return ts;
end;
$$;

revoke all on function public.mg_pull(text, timestamptz) from public;
revoke all on function public.mg_push(uuid, text, text, text) from public;
grant execute on function public.mg_pull(text, timestamptz) to anon, authenticated;
grant execute on function public.mg_push(uuid, text, text, text) to anon, authenticated;
