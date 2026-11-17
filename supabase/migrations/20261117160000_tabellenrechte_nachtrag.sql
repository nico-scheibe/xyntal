-- Nachtrag zu 20261117140000 und 20261117150000: die zwei Stellen, an denen die
-- Rechte-Rücksetzung nicht gegriffen hat.
--
-- 1) business_contracts gehört supabase_admin, und alle Rechte darauf hat ebenfalls
--    supabase_admin erteilt (relacl: authenticated=arwdDxtm/supabase_admin). PostgreSQL
--    lässt nur den Geber selbst ein Recht zurücknehmen, deshalb ist das revoke aus
--    20261117150000 als postgres wirkungslos durchgelaufen -- erkennbar nur an der
--    Warnung "no privileges could be revoked". authenticated behielt damit INSERT,
--    UPDATE, DELETE, TRUNCATE, REFERENCES und TRIGGER auf allen Spalten.
--    RLS schützt die Tabelle (die Policy verlangt is_admin()), aber TRUNCATE prüft
--    überhaupt keine Row-Level-Security: es hängt allein am Tabellenrecht. Also weg damit.
--    Der Soll-Zustand bleibt der aus 20261109150000_business_contracts.sql:63-64.
--
-- 2) MAINTAIN auf profiles. 20261117140000 hat die Rechte einzeln aufgezählt
--    (insert, update, delete, truncate, references, trigger) und dabei MAINTAIN
--    übersehen, das PostgreSQL 17 neu eingeführt hat. MAINTAIN erlaubt VACUUM, ANALYZE,
--    CLUSTER und REINDEX. Daten ändern kann man damit nicht, aber VACUUM FULL und CLUSTER
--    nehmen eine ACCESS-EXCLUSIVE-Sperre: die Tabelle stünde für die Dauer still.
--    Über die REST-Schnittstelle ist das nicht aufrufbar, es gehört aber nicht dorthin.
--    Die Blöcke in 20261117150000 verwenden "revoke all" und sind deshalb nicht betroffen.

-- ACHTUNG, diese Migration muss als supabase_admin laufen, nicht als postgres --
-- anders als alle anderen. Grund: PostgreSQL lässt ein Recht nur vom Geber selbst oder
-- von einem Mitglied seiner Rolle zurücknehmen. Geber ist hier supabase_admin, und
-- postgres ist kein Mitglied davon (umgekehrt schon). Als postgres läuft diese Datei
-- ohne Fehler durch und ändert nichts. Aufruf:
--   psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f <diese Datei>
-- Das ist unbedenklich, weil hier nur Rechte vergeben und entzogen werden. Sobald eine
-- Migration Funktionen anlegt (create or replace function), gehört sie wieder zu
-- postgres, sonst wechselt die Funktion den Eigentümer und die Security-Definer-Wege
-- brechen.

begin;

revoke all on public.business_contracts from anon, authenticated;
grant select, insert, update, delete on public.business_contracts to authenticated;

revoke maintain on public.profiles from anon, authenticated;

commit;
