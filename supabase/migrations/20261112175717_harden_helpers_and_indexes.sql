create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_staff() set schema private;
alter function public.is_owner() set schema private;
revoke execute on function private.is_staff(), private.is_owner() from public, anon;
grant execute on function private.is_staff(), private.is_owner() to authenticated;

drop policy "owner writes stations" on public.stations;
create policy "owner adds stations" on public.stations for insert to authenticated with check ((select private.is_owner()));
create policy "owner edits stations" on public.stations for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "owner deletes stations" on public.stations for delete to authenticated using ((select private.is_owner()));

drop policy "owner writes rates" on public.rate_plans;
create policy "owner adds rates" on public.rate_plans for insert to authenticated with check ((select private.is_owner()));
create policy "owner edits rates" on public.rate_plans for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "owner deletes rates" on public.rate_plans for delete to authenticated using ((select private.is_owner()));

create index on public.payments (session_id);
create index on public.payments (customer_id);
create index on public.payments (created_by);
create index on public.sessions (customer_id);
create index on public.sessions (rate_plan_id);
create index on public.sessions (created_by);
