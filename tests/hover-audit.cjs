// Prüft alle Hover-Effekte auf allen Elementtypen: Bild mit und ohne Hover vergleichen. Gleich = wirkt dort nicht.
// Einmalige Bewegungen (Shake, Shine, Type) sind nach 0,7 s vorbei und können fälschlich als „wirkt nicht“ erscheinen.
// Start: python3 server.py, dann node tests/hover-audit.cjs
const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1100,height:700}});
await p.goto('http://localhost:4173/404.html');
await p.addStyleTag({url:'/home.css'});await p.addStyleTag({url:'/page-canvas.css?x='+Date.now()});
await p.addStyleTag({url:'/home.css'});
await p.addScriptTag({url:'/link-icons.js'});await p.addScriptTag({url:'/page-canvas.js?x='+Date.now()});
const H=await p.evaluate(()=>Object.keys(window.XyntalPageCanvas.HOVERS));
const types={
 button:{type:'button',text:'Button',w:220,h:60,bg:'#5b8cff',color:'#ffffff',radius:14,url:'https://a.de'},
 link:{type:'link',ref:'11111111-1111-1111-1111-111111111111',w:260,h:60,bg:'#2a2a2a',color:'#eceae4',radius:14},
 text:{type:'text',text:'Plain text',w:260,h:60,size:28,color:'#eceae4'},
 window:{type:'text',text:'Window',w:260,h:90,size:22,bg:'#2a2a2a',color:'#eceae4',radius:16},
 icons:{type:'icons',w:260,h:60,size:22,bg:'#2a2a2a',color:'#eceae4'},
 shape:{type:'shape',kind:'rect',w:220,h:120,bg:'#5b8cff',radius:20},
 block:{type:'block',kind:'about',w:400,h:100},
 card:{type:'block',kind:'card',w:260,h:300},
};
const res={};
for(const [tn,tp] of Object.entries(types)){ res[tn]=[];
 for(const h of H){
  if(!(await p.evaluate(([tp,h])=>window.XyntalPageCanvas.hoverFits(h,tp.type,tp.kind),[tp,h]))) continue;
  await p.evaluate(([tp,h])=>{const C=window.XyntalPageCanvas;
   const links=[{id:'11111111-1111-1111-1111-111111111111',title:'Portfolio',url:'https://a.de',icon:'globe'}];
   const block=(k)=>k==='card'?'<div class="bp-stage"><div class="my-card" style="width:340px;height:420px;border-radius:24px;background:linear-gradient(#b95cff,#1c1c2b)"></div></div>':'<section class="pf-section"><h2>Über mich</h2><p class="pf-prose">Ich baue Xyntal am Wochenende und so weiter.</p></section>';
   document.body.innerHTML='<div id=h style="padding:40px;width:900px">'+C.html({w:1080,h:520,bg:{color:'#111111'},items:[{id:'x',x:300,y:120,hover:h,...tp},{id:'y',type:'text',text:'other',x:40,y:40,w:160,h:40,size:20,color:'#eceae4'}]},{links,block})+'</div>';C.mount(document.body);},[tp,h]);
  await p.waitForTimeout(80);
  const el=p.locator('.pc-item[data-id=x]');const bb=await el.boundingBox();
  const clip={x:Math.max(0,bb.x-60),y:Math.max(0,bb.y-60),width:bb.width+120,height:bb.height+160};
  const a=await p.screenshot({clip});
  await p.evaluate(()=>document.querySelector('.pc-item[data-id=x]').classList.add('is-hover'));
  // real hover too (for :hover-only effects)
  await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);
  await p.waitForTimeout(700);
  const c=await p.screenshot({clip});
  await p.mouse.move(5,5);
  if(Buffer.compare(a,c)===0) res[tn].push(h);
 }}
console.log(JSON.stringify(res,null,0));await b.close()})()
