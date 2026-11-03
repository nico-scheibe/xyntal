-- Beta-Programm: Status-Mails über IONOS. Der Daki-Server merkt hier, welcher Status zuletzt gemailt wurde.
begin;

alter table public.beta_applications
  add column if not exists mailed_status text check (mailed_status is null or mailed_status in ('in_pruefung','eingeladen','warteliste','angenommen','abgelehnt')),
  add column if not exists mailed_at timestamptz;

-- Admins (per RLS) dürfen zusätzlich die Mail-Spalten setzen; alles andere bleibt wie gehabt.
grant update (status, admin_note, mailed_status, mailed_at) on public.beta_applications to authenticated;

notify pgrst, 'reload schema';
commit;
