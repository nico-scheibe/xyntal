// Daki: run the Xyntal desktop app backend (server/ of the private repo
// nico-scheibe/xyntal-app-windows) next to the website, and redeploy it when
// master moves. Reachable only on localhost; the Cloudflare tunnel publishes
// it as api.xyntal.de.
//
// Files in this folder (never commit them):
//   .app-github-token  fine-grained GitHub token, read-only on that one repo
//   .app-backend.env   optional KEY=VALUE lines passed to the backend (AI keys, SMTP, ...)
// Without the token this module only logs and the website keeps running.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);

const repository = 'https://github.com/nico-scheibe/xyntal-app-windows.git';
const branch = 'refs/heads/master';
// Not the backend's usual 8787: the Daki host shares localhost with other
// services, and 8787 was already taken there. APP_BACKEND_PORT overrides it.
const defaultPort = '47821';
const state = path.join(__dirname, '.app-deploy');
const cache = path.join(state, 'repo.git');
// Database and uploads live outside every release so updates never lose data.
const data = path.join(__dirname, '.app-data');
const activeFile = path.join(state, 'active.json');

const token = (() => { try { return fs.readFileSync(path.join(__dirname, '.app-github-token'), 'utf8').trim(); } catch { return ''; } })();
// The token travels as a header, never in a URL, so it cannot show up in git output.
const auth = ['-c', 'http.extraHeader=Authorization: Basic ' + Buffer.from('x-access-token:' + token).toString('base64')];

let child, commit, updating = false, stopping = false;

function readEnvFile() {
  const env = {};
  let bytes;
  try { bytes = fs.readFileSync(path.join(__dirname, '.app-backend.env')); } catch { console.log('App backend: no .app-backend.env'); return env; }
  // Windows editors may save with a BOM or as UTF-16 ("Unicode"); both would
  // otherwise silently hide every setting.
  const text = (bytes[0] === 0xFF && bytes[1] === 0xFE ? bytes.toString('utf16le') : bytes.toString('utf8')).replace(/^﻿/, '');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2];
  }
  // Names only, never values: enough to see whether the file arrived intact.
  const set = Object.keys(env).filter(k => env[k].length > 0);
  console.log('App backend: .app-backend.env sets ' + (set.length ? set.join(', ') : 'nothing'));
  return env;
}

function run(serverDir) {
  if (child) { child.removeAllListeners('close'); child.kill('SIGTERM'); }
  // HOST/PORT are fixed here: the backend must stay on localhost behind the tunnel.
  const fileEnv = readEnvFile();
  const port = /^\d{2,5}$/.test(fileEnv.APP_BACKEND_PORT || '') ? fileEnv.APP_BACKEND_PORT : defaultPort;
  const env = { ...process.env, ...fileEnv, HOST: '127.0.0.1', PORT: port, TRUST_PROXY: '1', DB_PATH: path.join(data, 'xyntalnet.db') };
  child = spawn(process.execPath, ['src/index.ts'], { cwd: serverDir, env, stdio: 'inherit' });
  child.on('error', (error) => console.error('App backend start failed:', error.message));
  child.on('close', (code) => {
    if (stopping) return;
    console.error('App backend exited (' + code + '); restarting in 5 s');
    setTimeout(() => run(serverDir), 5000);
  });
}

async function update() {
  if (updating) return;
  updating = true;
  try {
    const { stdout } = await exec('git', [...auth, 'ls-remote', repository, branch], { timeout: 30000 });
    const next = stdout.split(/\s+/)[0];
    if (!/^[a-f0-9]{40}$/.test(next)) throw new Error('Invalid GitHub revision');
    if (next === commit) return;
    if (!fs.existsSync(cache)) await exec('git', ['init', '--bare', cache], { timeout: 30000 });
    await exec('git', ['--git-dir=' + cache, ...auth, 'fetch', '--depth=1', repository, next], { timeout: 180000 });
    const release = path.join(state, next);
    fs.rmSync(release, { recursive: true, force: true });
    fs.mkdirSync(release, { recursive: true });
    const archive = path.join(release, 'server.tar');
    await exec('git', ['--git-dir=' + cache, 'archive', '--format=tar', '--output=' + archive, next, 'server'], { timeout: 60000 });
    await exec('tar', ['-xf', archive, '-C', release], { timeout: 60000 });
    fs.unlinkSync(archive);
    const serverDir = path.join(release, 'server');
    await exec('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: serverDir, timeout: 300000 });
    fs.rmSync(path.join(serverDir, 'data'), { recursive: true, force: true });
    fs.symlinkSync(data, path.join(serverDir, 'data'), 'dir');
    // Only a fully prepared release replaces the running one.
    run(serverDir);
    fs.writeFileSync(activeFile + '.tmp', JSON.stringify({ commit: next }));
    fs.renameSync(activeFile + '.tmp', activeFile);
    const previous = commit;
    commit = next;
    console.log('App backend running ' + commit);
    for (const name of fs.readdirSync(state))
      if (/^[a-f0-9]{40}$/.test(name) && name !== commit && name !== previous)
        fs.rmSync(path.join(state, name), { recursive: true, force: true });
  } catch (error) { console.error('App backend deployment failed; keeping previous version:', error.message); }
  finally { updating = false; }
}

if (!token) {
  console.log('App backend disabled: .app-github-token missing');
} else if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('App backend needs Node 24 or newer (found ' + process.versions.node + ')');
} else {
  fs.mkdirSync(state, { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  if (fs.existsSync(activeFile)) {
    const active = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
    const serverDir = path.join(state, String(active.commit), 'server');
    if (/^[a-f0-9]{40}$/.test(active.commit) && fs.existsSync(path.join(serverDir, 'src', 'index.ts'))) {
      commit = active.commit;
      run(serverDir);
    }
  }
  update();
  setInterval(update, 60000).unref();
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; if (child) child.kill(signal); });
}
