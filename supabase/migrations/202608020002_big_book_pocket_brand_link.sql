-- Link each Big Book actor pocket to at most one brand so that brand's
-- Web Spending net can fold into the pocket amount.

alter table public.big_book_actor_pockets
  add column if not exists linked_brand_id uuid null
    references public.brands(id) on delete set null;

-- One pocket per brand (partial unique index allows many unlinked pockets).
create unique index if not exists uq_big_book_actor_pockets_linked_brand
  on public.big_book_actor_pockets(linked_brand_id)
  where linked_brand_id is not null;

-- SECURITY DEFINER: expenses RLS requires has_brand_role, but Big Book is
-- gated on global is_admin(). Without definer, an admin without a brand
-- membership would silently read net = 0. The is_admin() guard replaces RLS.
create or replace function public.get_big_book_pocket_web_spending()
returns table (
  pocket_id uuid,
  brand_id uuid,
  brand_name text,
  net numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as pocket_id,
    b.id as brand_id,
    b.name as brand_name,
    coalesce((
      select sum(
        case
          when e.entry_direction = 'spending' then -abs(e.amount)
          else abs(e.amount)
        end
      )
      from public.expenses e
      where e.brand_id = b.id
    ), 0)::numeric as net
  from public.big_book_actor_pockets p
  join public.brands b on b.id = p.linked_brand_id
  where public.is_admin();
$$;

revoke all on function public.get_big_book_pocket_web_spending() from public;
grant execute on function public.get_big_book_pocket_web_spending() to authenticated, service_role;
