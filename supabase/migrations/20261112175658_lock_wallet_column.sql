revoke update on public.customers from authenticated, anon;
grant update (phone, name) on public.customers to authenticated;
revoke execute on function public.handle_new_user(), public.apply_wallet(), public.audit() from public, anon, authenticated;
