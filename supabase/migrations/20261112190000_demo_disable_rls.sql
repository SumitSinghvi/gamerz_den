-- TEMPORARY (client demo, no login): open all data to the anon key.
-- To restore for field use: re-enable RLS on each table and revoke the anon grants below.
alter table public.profiles disable row level security;
alter table public.stations disable row level security;
alter table public.rate_plans disable row level security;
alter table public.customers disable row level security;
alter table public.sessions disable row level security;
alter table public.payments disable row level security;
alter table public.audit_log disable row level security;

grant update (phone, name) on public.customers to anon;
grant execute on function public.end_session(uuid,int,numeric,numeric,jsonb) to anon;
