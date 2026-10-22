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
  require('./auto-server.cjs');
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
