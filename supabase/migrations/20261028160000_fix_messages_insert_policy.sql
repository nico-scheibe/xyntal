-- Reparatur: Senden schlug mit „infinite recursion detected in policy for relation messages“ (HTTP 500) fehl.
-- Die Regel „Nachrichten senden“ aus 20261028140000_message_features fragte für reply_to die Tabelle messages
-- selbst ab und löste dabei ihre eigenen Leseregeln erneut aus. Dass eine Antwort zur selben Unterhaltung gehört,
-- prüft bereits der Trigger messages_validate_reply (security definer) – die Regel braucht das nicht.
-- Einmal im Supabase SQL Editor ausführen. Läuft als Transaktion. Darf mehrfach laufen.
begin;

drop policy if exists "Nachrichten senden" on public.messages;
create policy "Nachrichten senden" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and (select public.is_active_member())
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.status <> 'rejected')
  );

commit;
