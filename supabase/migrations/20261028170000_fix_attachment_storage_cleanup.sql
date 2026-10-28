-- Reparatur: Löschen einer Nachricht mit Anhang (und Kontolöschung) schlug fehl mit
-- „Direct deletion from storage tables is not allowed. Use the Storage API instead.“
-- Der Trigger message_attachments_cleanup_storage löschte direkt in storage.objects – das verbietet Supabase.
-- Die Dateien entfernt jetzt der Browser über die Storage-API (public/messages.js, deleteMessage).
-- Einmal im Supabase SQL Editor ausführen. Läuft als Transaktion. Darf mehrfach laufen.
begin;

drop trigger if exists message_attachments_cleanup_storage on public.message_attachments;
drop function if exists public.cleanup_message_attachment_storage();

commit;
