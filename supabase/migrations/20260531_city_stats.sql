-- 1️⃣ агрегирующее VIEW
create or replace view public.city_stats_v as
select
  c.id                                   as city_id,
  c.slug,
  c.name,
  count(h.*)                             as houses_total,
  count(*) filter (where h.owner_id is null)  as houses_free,
  count(b.*)                             as biz_total,
  count(*) filter (where b.owner_id is null)  as biz_free
from public.cities          c
left join public.houses     h on h.city_id = c.id
left join public.businesses b on b.city_id = c.id
group by c.id;

-- 2️⃣ RPC-обёртка под фронт
create or replace function public.city_stats(city_slug text)
returns table (
  city_id       int,
  city_name     text,
  houses_total  int,
  houses_free   int,
  biz_total     int,
  biz_free      int
)
language sql
stable
security definer
as $$
  select city_id, name,
         houses_total, houses_free,
         biz_total,    biz_free
  from public.city_stats_v
  where slug = city_slug
$$;

grant execute on function public.city_stats(text) to anon, authenticated;
