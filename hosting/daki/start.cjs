const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const version = '2026.10.3';
const checksum = '053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0';
const binary = path.join(__dirname, 'cloudflared');
const tokenFile = path.join(__dirname, '.cloudflared-token');
async function start() {
  const commandFile = path.join(__dirname, '.tunnel-command');
  if (fs.existsSync(commandFile)) {
    const token = fs.readFileSync(commandFile, 'utf8').match(/eyJ[A-Za-z0-9_=./+-]+/);
    if (!token) throw new Error('Tunnel token missing');
    fs.writeFileSync(tokenFile, token[0], {mode:0o600});
    fs.chmodSync(tokenFile, 0o600);
    fs.unlinkSync(commandFile);
  }
  if (!fs.existsSync(tokenFile)) throw new Error('Tunnel token file missing');
  let valid = fs.existsSync(binary) && crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex') === checksum;
  if (!valid) {
    const response = await fetch(`https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared-linux-amd64`, {signal:AbortSignal.timeout(120000)});
    if (!response.ok) throw new Error('Cloudflared download failed');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Cloudflared checksum mismatch');
    fs.writeFileSync(binary + '.next', bytes, {mode:0o700});
    fs.renameSync(binary + '.next',binary);
  }
  fs.chmodSync(binary,0o700);
  const serverResponse = await fetch('https://raw.githubusercontent.com/nico-scheibe/xyntal/main/hosting/daki/server.cjs', {signal:AbortSignal.timeout(30000)});
  if (!serverResponse.ok) throw new Error('Website server download failed');
  fs.writeFileSync(path.join(__dirname,'auto-server.cjs.next'), await serverResponse.text());
  fs.renameSync(path.join(__dirname,'auto-server.cjs.next'), path.join(__dirname,'auto-server.cjs'));
  require('./auto-server.cjs');
  // The app backend is optional: a failed download never blocks the website.
  try {
    const backendResponse = await fetch('https://raw.githubusercontent.com/nico-scheibe/xyntal/main/hosting/daki/app-backend.cjs', {signal:AbortSignal.timeout(30000)});
    if (!backendResponse.ok) throw new Error('HTTP ' + backendResponse.status);
    fs.writeFileSync(path.join(__dirname,'auto-app-backend.cjs.next'), await backendResponse.text());
    fs.renameSync(path.join(__dirname,'auto-app-backend.cjs.next'), path.join(__dirname,'auto-app-backend.cjs'));
  } catch (error) { console.error('App backend download failed:', error.message); }
  if (fs.existsSync(path.join(__dirname,'auto-app-backend.cjs'))) require('./auto-app-backend.cjs');
  let tunnel;
  let shuttingDown = false;
  function connect() {
    tunnel = spawn(binary, ['tunnel','--no-autoupdate','run','--token-file',tokenFile], {stdio:'inherit'});
    tunnel.on('error', (error) => console.error('Tunnel startup failed:',error.message));
    tunnel.on('close', () => { if (!shuttingDown) setTimeout(connect,5000); });
  }
  connect();
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => {
    shuttingDown = true;
    if (tunnel) tunnel.kill(signal);
    setTimeout(() => process.exit(0),1000);
  });
}
start().catch(error => {console.error(error.message);process.exit(1);});
