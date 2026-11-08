-- Erzeugt SQL für alles, was `supabase db dump` auslässt, weil es in den von Supabase verwalteten
-- Schemas auth und storage liegt (migrate.sh dump schreibt die Ausgabe nach extras.sql):
--   • eigene Trigger auf auth-Tabellen (z. B. on_auth_user_created: Profil bei Registrierung anlegen)
--   • Zugriffsregeln (RLS-Policies) auf storage.objects / storage.buckets (Banner, Profilbilder, Anhänge)
-- Ausgabe ist idempotent (DROP … IF EXISTS vor jedem CREATE).
\pset format unaligned
\pset tuples_only on

select format('drop trigger if exists %I on %I.%I;', t.tgname, n.nspname, c.relname) || E'\n' || pg_get_triggerdef(t.oid) || ';'
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal and n.nspname = 'auth' and pn.nspname not in ('auth', 'storage', 'extensions', 'pg_catalog')
order by c.relname, t.tgname;

select format('drop policy if exists %I on %I.%I;', policyname, schemaname, tablename) || E'\n'
  || format('create policy %I on %I.%I as %s for %s to %s', policyname, schemaname, tablename, permissive, cmd,
            (select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ') from unnest(roles) r))
  || coalesce(' using (' || qual || ')', '')
  || coalesce(' with check (' || with_check || ')', '') || ';'
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;
