-- Links auf xyntal.de/name: statt einer Adresse darf auch reiner Text stehen
-- (z. B. „Discord · Username: nico“). Die Seite zeigt solche Einträge als Text zum Kopieren,
-- nur echte http/https-Adressen werden zu Links (public/u.js, safeUrl).
-- Hebt die Prüfung „nur https/http“ aus 20261107250000_link_page.sql auf; Länge bleibt 1–500 Zeichen.
-- Nach 20261108090000_link_limits_by_plan.sql. Darf mehrfach laufen.
begin;

alter table public.profile_links drop constraint if exists profile_links_url_check;
alter table public.profile_links add constraint profile_links_url_check
  check (char_length(btrim(url)) between 1 and 500);

commit;
