// Daki: serve public/ and atomically publish new commits from the public main branch.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const state = path.join(__dirname, '.deploy');
const repository = 'https://github.com/nico-scheibe/xyntal.git';
const cache = path.join(state, 'repo.git');
fs.mkdirSync(state, { recursive: true });
let root, commit, updating = false;
const activeFile = path.join(state, 'active.json');
if (fs.existsSync(activeFile)) {
  const active = JSON.parse(fs.readFileSync(activeFile));
  if (/^[a-f0-9]{40}$/.test(active.commit)) {
    commit = active.commit;
    root = path.join(state, commit, 'public');
  }
}
async function update() {
  if (updating) return;
  updating = true;
  try {
    const { stdout } = await exec('git', ['ls-remote', repository, 'refs/heads/main'], { timeout: 30000 });
    const next = stdout.split(/\s+/)[0];
    if (!/^[a-f0-9]{40}$/.test(next)) throw new Error('Invalid GitHub revision');
    if (next === commit) return;
    if (!fs.existsSync(cache)) execFileSync('git', ['init', '--bare', cache], { stdio: 'ignore' });
    await exec('git', ['--git-dir=' + cache, 'fetch', '--depth=1', repository, next], { timeout: 120000 });
    const release = path.join(state, next);
    fs.mkdirSync(release, { recursive: true });
    const archive = path.join(release, 'site.tar');
    await exec('git', ['--git-dir=' + cache, 'archive', '--format=tar', '--output=' + archive, next, 'public'], { timeout: 30000 });
    await exec('tar', ['-xf', archive, '-C', release], { timeout: 30000 });
    fs.unlinkSync(archive);
    const nextRoot = path.join(release, 'public');
    for (const file of ['index.html', 'login.html', '404.html']) {
      if (!fs.statSync(path.join(nextRoot, file)).isFile()) throw new Error('Missing page: ' + file);
    }
    fs.writeFileSync(activeFile + '.tmp', JSON.stringify({ commit: next }));
    fs.renameSync(activeFile + '.tmp', activeFile);
    root = nextRoot;
    commit = next;
    console.log('Published GitHub main ' + commit);
    // Keep one previous release for rollback; remove only generated release directories.
    const releases = fs.readdirSync(state).filter(x => /^[a-f0-9]{40}$/.test(x))
      .sort((a,b) => fs.statSync(path.join(state,b)).mtimeMs - fs.statSync(path.join(state,a)).mtimeMs);
    for (const name of releases.slice(2)) if (name !== commit) fs.rmSync(path.join(state,name), {recursive:true,force:true});
  } catch (error) { console.error('Deployment failed; keeping previous website:', error.message); }
  finally { updating = false; }
}
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2', '.woff':'font/woff', '.ico':'image/x-icon' };
http.createServer((req,res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (pathname === '/__deployment') {
    res.writeHead(root ? 200 : 503, {'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify({commit, branch:'main', updating}));
  }
  if (!root) { res.writeHead(503, {'Retry-After':'10'}); return res.end('Website is starting'); }
  const currentRoot = root;
  let file = path.resolve(currentRoot, '.' + pathname);
  if (file !== currentRoot && !file.startsWith(currentRoot + path.sep)) { res.writeHead(403); return res.end(); }
  if (file === currentRoot || pathname.endsWith('/')) file = path.join(file, 'index.html');
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'});
    return res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(currentRoot,'404.html')));
  }
  if (!fs.realpathSync(file).startsWith(fs.realpathSync(currentRoot) + path.sep)) { res.writeHead(403); return res.end(); }
  res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', 'X-Xyntal-Commit':commit});
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}).listen(Number(process.env.SERVER_PORT || process.env.PORT || 4129), '0.0.0.0', () => console.log('Xyntal Daki server ready'));
update();
setInterval(update, 30000);
