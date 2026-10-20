import subprocess,time
base=['psql','-h','127.0.0.1','-p','55439','-d','events_test','-v','ON_ERROR_STOP=1']
a=subprocess.Popen(base+['-c',"begin; update public.events set cancelled=true where id=20; select pg_sleep(2); commit;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
time.sleep(.3)
b=subprocess.run(base+['-c',"set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); select public.set_event_attendance(20,true);"],capture_output=True,text=True)
aout,aerr=a.communicate()
assert a.returncode==0,aerr
assert b.returncode!=0 and 'abgesagt' in b.stderr,b.stdout+b.stderr
r=subprocess.run(base+['-Atc','select count(*) from public.event_rsvps where event_id=20;'],capture_output=True,text=True,check=True)
assert r.stdout.strip()=='0',r.stdout
print('PASS: gleichzeitig abgesagtes Treffen weist wartende Zusage ab')
