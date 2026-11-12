-- Ends a session and records its payments in one transaction (wallet overdraft rolls back everything).
create or replace function public.end_session(
  p_session_id uuid, p_billed_minutes int, p_amount numeric, p_discount numeric, p_payments jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_customer uuid; v_paid numeric;
begin
  select coalesce(sum((x->>'amount')::numeric), 0) into v_paid from jsonb_array_elements(p_payments) x;
  if v_paid <> p_amount - p_discount then
    raise exception 'Payments (%) must equal amount minus discount (%)', v_paid, p_amount - p_discount;
  end if;

  update public.sessions
     set status = 'ended', ended_at = now(), billed_minutes = p_billed_minutes,
         amount = p_amount, discount = p_discount,
         paused_seconds = paused_seconds + case when paused_at is null then 0
                          else extract(epoch from now() - paused_at)::int end,
         paused_at = null
   where id = p_session_id and status <> 'ended'
  returning customer_id into v_customer;
  if not found then raise exception 'Session not open'; end if;

  insert into public.payments (session_id, customer_id, method, amount)
  select p_session_id, v_customer, x->>'method', (x->>'amount')::numeric
    from jsonb_array_elements(p_payments) x where (x->>'amount')::numeric > 0;
end $$;
revoke execute on function public.end_session(uuid,int,numeric,numeric,jsonb) from public, anon;
grant execute on function public.end_session(uuid,int,numeric,numeric,jsonb) to authenticated;
