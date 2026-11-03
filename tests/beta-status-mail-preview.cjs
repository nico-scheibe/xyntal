// Schreibt die fünf Status-Mails als HTML-Dateien in einen Ordner, zum Anschauen im Browser.
const fs=require('fs'),vm=require('vm'),path=require('path');
const out=process.argv[2]||path.join(__dirname,'..','.mail-preview');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(__dirname,'../hosting/daki/server.cjs'),'utf8');
const ctx={String,Date,Math,Buffer};vm.runInNewContext(source.slice(source.indexOf('const STATUS_MAILS ='),source.indexOf('// Supabase-Adresse'))+';globalThis.mailText=statusMailText;globalThis.statuses=Object.keys(STATUS_MAILS)',ctx);
for(const status of ctx.statuses){const m=ctx.mailText('Marvin',status);fs.writeFileSync(path.join(out,status+'.html'),m.html);fs.writeFileSync(path.join(out,status+'.txt'),m.subject+'\n\n'+m.text);}
console.log('Vorschau geschrieben nach '+out+': '+ctx.statuses.join(', '));
