// Prüft den Status-Mail-Endpunkt ohne IONOS und ohne Supabase: beides wird nachgestellt.
const fs=require('fs'),vm=require('vm'),http=require('http'),assert=require('assert/strict');
const source=fs.readFileSync(require('path').join(__dirname,'../hosting/daki/server.cjs'),'utf8');
let secrets={'.ionos-user':'nico@xyntal.de','.ionos-pass':'geheim'},application={id:7,name:'Marvin',email:'marvin@example.com',status:'angenommen'},marked=[],lookups=[];
const ctx={Buffer,Date,Math,Number,String,AbortSignal,console,setTimeout,clearTimeout,process:{env:{SUPABASE_URL:'https://supa.test',SUPABASE_ANON_KEY:'anon'}},fs:{readFileSync:()=>{throw new Error('nope')}},path:require('path'),__dirname:'/nope',tls:{},root:'/nope',
  readSecret:(file)=>secrets[file]||'',
  fetch:async(url,opts={})=>{ if(opts.method==='PATCH'){marked.push({url,headers:opts.headers,body:JSON.parse(opts.body)});return {ok:true};}
    lookups.push({url,headers:opts.headers}); if(opts.headers.Authorization!=='Bearer '+'a'.repeat(40)) return {ok:true,status:200,json:async()=>[]};
    return {ok:true,status:200,json:async()=>application?[application]:[]}; }};
vm.runInNewContext(source.slice(source.indexOf('// Beta feedback:'),source.indexOf('const types ='))+'\nglobalThis.handle=handleBetaStatusMail;globalThis.transport=statusMailTransport;globalThis.mailText=statusMailText;',ctx);
const sent=[];let smtpOk=true;ctx.transport.send=async(m)=>{if(!smtpOk)throw new Error('SMTP 535 auth failed');sent.push(m);};
(async()=>{const server=http.createServer(ctx.handle);server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{
 const url='http://127.0.0.1:'+server.address().port, admin='a'.repeat(40);
 const post=(body,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://xyntal.de',Authorization:'Bearer '+admin,...headers},body:JSON.stringify(body)});
 assert.equal((await fetch(url)).status,405);
 assert.equal((await post({id:'7'},{Origin:'https://evil.example'})).status,403);
 assert.equal((await post({id:'x'},{Origin:'https://admin.xyntal.de'})).status,400,'Admin-Adresse darf die Route aufrufen');
 assert.equal((await post({id:'7'},{Authorization:''})).status,401);
 assert.equal((await post({id:'x'})).status,400);
 assert.equal((await post({id:'7'},{Authorization:'Bearer '+'b'.repeat(40)})).status,403,'Nicht-Admin bekommt keine Bewerbung und keine Mail');
 assert.equal(sent.length,0);
 const res=await post({id:'7',to:'attacker@example.com'});assert.equal(res.status,200);const body=await res.json();assert.equal(body.ok,true);assert.equal(body.status,'angenommen');
 assert.equal(sent.length,1);assert.equal(sent[0].to,'marvin@example.com');assert.equal(sent[0].from,'nico@xyntal.de');assert.equal(sent[0].user,'nico@xyntal.de');assert.equal(sent[0].host,'smtp.ionos.de');assert.equal(sent[0].port,465);assert.equal(sent[0].fromName,'Nico von Xyntal');
 assert.match(sent[0].subject,/Willkommen/);assert.match(sent[0].text,/^Hallo Marvin,/);assert.match(sent[0].text,/xyntal\.de\/profil/);assert.match(sent[0].html,/<h1[^>]*>Du bist dabei/);assert.match(sent[0].html,/Hallo Marvin,/);assert.match(sent[0].html,/email\/logo\.png/);
 assert.equal(marked.length,1);assert.equal(marked[0].body.mailed_status,'angenommen');assert.equal(marked[0].headers.Authorization,'Bearer '+admin);
 assert.ok(lookups.every(l=>l.headers.apikey==='anon'));
 application={...application,status:'neu'};const skip=await (await post({id:'7'})).json();assert.equal(skip.skipped,true);assert.equal(sent.length,1);
 application={...application,status:'abgelehnt',name:'Böse\r\nBcc: x@y.z'};assert.equal((await post({id:'7'})).status,400,'Kopfzeilen-Injektion über den Namen abgelehnt');
 application={...application,name:'Alex'};smtpOk=false;assert.equal((await post({id:'7'})).status,502);smtpOk=true;
 secrets={};assert.equal((await post({id:'7'})).status,503);secrets={'.ionos-user':'nico@xyntal.de','.ionos-pass':'geheim'};
 ctx.process.env={...ctx.process.env,SMTP_HOST:'smtp.ionos.de',SMTP_PORT:'465',SMTP_USER:'admin@xyntal.com',SMTP_PASS:'pw',SMTP_FROM:'Xyntal <admin@xyntal.com>'};secrets={};
 assert.equal((await post({id:'7'})).status,200);const last=sent[sent.length-1];assert.equal(last.user,'admin@xyntal.com');assert.equal(last.pass,'pw');assert.equal(last.from,'admin@xyntal.com');assert.equal(last.fromName,'Xyntal');assert.equal(last.port,465);
 for(const status of ['in_pruefung','eingeladen','warteliste','angenommen','abgelehnt']){const m=ctx.mailText('<Kim>',status);assert.ok(m.subject&&m.text.includes('Stand deiner Bewerbung'));assert.ok(m.html.includes('Hallo &lt;Kim&gt;,')&&!m.html.includes('<Kim>'));assert.ok(m.html.includes(m.subject.replace(/&/g,'&amp;')));}
 console.log('PASS: admin-only via Supabase RLS, IONOS transport parameters, UTF-8 text, skip for new, header injection, SMTP failure, missing config, all status texts with distinct HTML');
}finally{await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
