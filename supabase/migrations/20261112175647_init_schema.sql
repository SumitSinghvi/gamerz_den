-- Staff profiles. New signups are 'pending' until owner approves; first user becomes owner.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  role text not null default 'pending' check (role in ('owner','manager','cashier','pending')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email,
    case when exists (select 1 from public.profiles where role = 'owner') then 'pending' else 'owner' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('owner','manager','cashier'))
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
$$;

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  console_type text not null default 'PS5',
  status text not null default 'active' check (status in ('active','maintenance')),
  created_at timestamptz not null default now()
);

create table public.rate_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  console_type text not null default 'PS5',
  players int not null default 1 check (players between 1 and 8),
  rate_per_hour numeric(10,2) not null check (rate_per_hour >= 0),
  peak_rate_per_hour numeric(10,2) check (peak_rate_per_hour >= 0),
  peak_start time,
  peak_end time,
  block_minutes int not null default 30 check (block_minutes > 0),
  grace_minutes int not null default 5 check (grace_minutes >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  wallet_balance numeric(10,2) not null default 0 check (wallet_balance >= 0),
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations,
  customer_id uuid references public.customers,
  rate_plan_id uuid not null references public.rate_plans,
  players int not null default 1,
  mode text not null default 'postpaid' check (mode in ('prepaid','postpaid')),
  status text not null default 'running' check (status in ('running','paused','ended')),
  booked_minutes int check (booked_minutes > 0),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  paused_seconds int not null default 0,
  ended_at timestamptz,
  billed_minutes int,
  amount numeric(10,2),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  note text,
  created_by uuid default auth.uid() references public.profiles,
  created_at timestamptz not null default now()
);
-- One open session per station.
create unique index sessions_one_open_per_station on public.sessions (station_id) where status <> 'ended';
create index sessions_started_at_idx on public.sessions (started_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions,
  customer_id uuid references public.customers,
  kind text not null default 'session' check (kind in ('session','wallet_topup')),
  method text not null check (method in ('cash','upi','card','wallet')),
  amount numeric(10,2) not null check (amount > 0),
  created_by uuid default auth.uid() references public.profiles,
  created_at timestamptz not null default now(),
  check (not (kind = 'wallet_topup' and method = 'wallet')),
  check (method <> 'wallet' or customer_id is not null),
  check (kind <> 'wallet_topup' or customer_id is not null)
);
create index payments_created_at_idx on public.payments (created_at);

-- Wallet balance follows payments; check constraint blocks overdraft.
create or replace function public.apply_wallet() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'wallet_topup' then
    update public.customers set wallet_balance = wallet_balance + new.amount where id = new.customer_id;
  elsif new.method = 'wallet' then
    update public.customers set wallet_balance = wallet_balance - new.amount where id = new.customer_id;
  end if;
  return new;
end $$;
create trigger payments_wallet after insert on public.payments
  for each row execute function public.apply_wallet();

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid default auth.uid(),
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (action, entity, entity_id, details)
  values (lower(tg_op), tg_table_name,
    coalesce(new.id, old.id)::text,
    case tg_op when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
               when 'DELETE' then to_jsonb(old) else to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_sessions after insert or update or delete on public.sessions for each row execute function public.audit();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function public.audit();
create trigger audit_rate_plans after insert or update or delete on public.rate_plans for each row execute function public.audit();
create trigger audit_profiles after update on public.profiles for each row execute function public.audit();

-- RLS
alter table public.profiles enable row level security;
alter table public.stations enable row level security;
alter table public.rate_plans enable row level security;
alter table public.customers enable row level security;
alter table public.sessions enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;

create policy "own or staff read profiles" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
create policy "owner updates profiles" on public.profiles for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create policy "staff read stations" on public.stations for select to authenticated using ((select public.is_staff()));
create policy "owner writes stations" on public.stations for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create policy "staff read rates" on public.rate_plans for select to authenticated using ((select public.is_staff()));
create policy "owner writes rates" on public.rate_plans for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create policy "staff read customers" on public.customers for select to authenticated using ((select public.is_staff()));
create policy "staff add customers" on public.customers for insert to authenticated with check ((select public.is_staff()));
create policy "staff edit customers" on public.customers for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create policy "staff read sessions" on public.sessions for select to authenticated using ((select public.is_staff()));
create policy "staff add sessions" on public.sessions for insert to authenticated with check ((select public.is_staff()));
create policy "staff edit sessions" on public.sessions for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create policy "staff read payments" on public.payments for select to authenticated using ((select public.is_staff()));
create policy "staff add payments" on public.payments for insert to authenticated with check ((select public.is_staff()));

create policy "owner reads audit" on public.audit_log for select to authenticated using ((select public.is_owner()));

-- Wallet balance must only change through payments trigger: block direct client edits of the column.
revoke update (wallet_balance) on public.customers from authenticated, anon;

alter publication supabase_realtime add table public.sessions, public.stations;

-- Seed
insert into public.stations (name) values ('PS5-1'),('PS5-2'),('PS5-3'),('PS5-4');
insert into public.rate_plans (name, players, rate_per_hour) values
  ('Solo', 1, 100), ('Duo', 2, 120), ('Squad', 4, 150);
