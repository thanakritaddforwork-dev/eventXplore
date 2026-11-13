-- Excerpt from the private EventXplore codebase (supabase/migrations/0075_confirm_checkout_group.sql), comments stripped.


create or replace function public.confirm_exhibitor_checkout_group(p_order_ids uuid[])
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ids uuid[];
  v_count int;
  v_found int;
  v_groups int;
  v_owners int;
  v_events int;
  v_non_self int;
  v_null_group int;
  v_marked uuid[];
  v_unaligned uuid[];
  v_written int;
  r record;
begin
  select coalesce(array_agg(distinct id order by id), '{}') into v_ids from unnest(p_order_ids) as id where id is not null;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count < 2 or v_count > 20 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_group');
  end if;

  perform 1 from exhibitor_commercial_orders where id = any(v_ids) order by id for update;

  select count(*),
         count(distinct checkout_group_id),
         count(distinct exhibitor_id),
         count(distinct coalesce(event_id::text, '')),
         count(*) filter (where purchase_mode <> 'self_checkout'),
         count(*) filter (where checkout_group_id is null)
    into v_found, v_groups, v_owners, v_events, v_non_self, v_null_group
    from exhibitor_commercial_orders where id = any(v_ids);
  if v_found <> v_count then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_groups <> 1 or v_owners <> 1 or v_events <> 1 or v_non_self > 0 or v_null_group > 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_group');
  end if;

  for r in select id, granting_state from exhibitor_commercial_orders where id = any(v_ids) order by id loop
    if r.granting_state in ('confirmed', 'rejected', 'expired') then
      return jsonb_build_object('ok', false, 'reason', 'already_processed', 'order_id', r.id, 'state', r.granting_state);
    end if;
    if r.granting_state not in ('pending_payment', 'paid_awaiting_confirmation') then
      return jsonb_build_object('ok', false, 'reason', 'not_allowed', 'order_id', r.id, 'state', r.granting_state);
    end if;
  end loop;

  perform 1 from booth_bookings
    where id in (select booth_booking_id from exhibitor_commercial_orders where id = any(v_ids) and booth_booking_id is not null)
    order by id for update;

  for r in
    select o.id as order_id, o.booth_booking_id, b.id as booking_id, b.status
      from exhibitor_commercial_orders o
      left join booth_bookings b on b.id = o.booth_booking_id
     where o.id = any(v_ids)
     order by o.id
  loop
    if r.booth_booking_id is not null and (r.booking_id is null or r.status not in ('pending_payment', 'confirmed')) then
      return jsonb_build_object('ok', false, 'reason', 'booth_released', 'order_id', r.order_id, 'state', r.status);
    end if;
  end loop;

  with moved as (
    update exhibitor_commercial_orders set granting_state = 'paid_awaiting_confirmation'
     where id = any(v_ids) and granting_state = 'pending_payment'
     returning id
  )
  select coalesce(array_agg(id order by id), '{}') into v_marked from moved;

  update booth_bookings set status = 'confirmed', confirmed_at = now()
   where id in (select booth_booking_id from exhibitor_commercial_orders where id = any(v_ids) and booth_booking_id is not null)
     and status = 'pending_payment';

  update exhibitor_commercial_orders set granting_state = 'confirmed'
   where id = any(v_ids) and granting_state = 'paid_awaiting_confirmation';
  get diagnostics v_written = row_count;
  if v_written <> v_count then
    raise exception 'confirm_exhibitor_checkout_group: confirmed % of % orders', v_written, v_count;
  end if;

  with targets as (
    select b.booth_id from booth_bookings b
     where b.id in (select booth_booking_id from exhibitor_commercial_orders where id = any(v_ids) and booth_booking_id is not null)
  ), aligned as (
    update booths set status = 'booked'
     where id in (select booth_id from targets) and status = 'pending_payment'
     returning id
  )
  select coalesce(array_agg(t.booth_id), '{}') into v_unaligned
    from targets t where t.booth_id not in (select id from aligned);

  return jsonb_build_object('ok', true, 'order_ids', to_jsonb(v_ids), 'marked_paid_order_ids', to_jsonb(v_marked), 'unaligned_booth_ids', to_jsonb(v_unaligned));
end;
$$;

revoke all on function public.confirm_exhibitor_checkout_group(uuid[]) from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.confirm_exhibitor_checkout_group(uuid[]) from %I', v_role);
    end if;
  end loop;
  foreach v_role in array array['service_role', 'app_service'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('grant execute on function public.confirm_exhibitor_checkout_group(uuid[]) to %I', v_role);
    end if;
  end loop;
end
$$;
