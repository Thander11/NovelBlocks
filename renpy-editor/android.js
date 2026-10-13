// ═════════════════════════════════════════════════════════════════════
// ANDROID — everything Ren'Py needs to build Android packages, set up
// from the editor: RAPT (Ren'Py's Android tool, inside the Ren'Py SDK),
// a JDK 21 (in the editor's data folder), the Android SDK (inside RAPT),
// the signing keys and android.json (in the game's project folder).
// Builds run Ren'Py's own "android_build" command.
// ═════════════════════════════════════════════════════════════════════
const { app, ipcMain, net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const JDK_VERSION = 21;
const SDK_PLATFORM = 'android-35';
const exe = (name) => process.platform === 'win32' ? name + '.exe' : name;

function setupAndroid({ getWindow, getProjectRoot, getRenpyExecutable, renpyBuildCommand, readGameInfo }) {
  let job = null;   // { kind, child?, abort? } of what is running now

  const send = (msg) => { const w = getWindow(); if (w) w.webContents.send('android-progress', msg); };
  const jdkBase = () => path.join(app.getPath('userData'), 'jdk');
  const helperPath = () => path.join(__dirname.replace(/app\.asar$/, 'app.asar.unpacked'), 'android-helper.py');

  function sdkInfo() {
    const renpyExe = getRenpyExecutable();
    if (!renpyExe || !fs.existsSync(renpyExe)) return null;
    const sdk = path.dirname(renpyExe);
    let version = '';
    try { version = (/^version\s*=\s*'([\d.]+)'/m.exec(fs.readFileSync(path.join(sdk, 'renpy', 'vc_version.py'), 'utf8')) || [])[1] || ''; } catch (e) { /* unknown */ }
    return { sdk, version: version.split('.').slice(0, 3).join('.'), rapt: path.join(sdk, 'rapt') };
  }

  // A JDK the editor installed, or the one JAVA_HOME points at
  function findJdk() {
    const homes = [];
    try {
      for (const d of fs.readdirSync(jdkBase())) {
        const home = path.join(jdkBase(), d);
        homes.push(fs.existsSync(path.join(home, 'Contents', 'Home')) ? path.join(home, 'Contents', 'Home') : home);
      }
    } catch (e) { /* none installed yet */ }
    if (process.env.JAVA_HOME) homes.push(process.env.JAVA_HOME);
    for (const home of homes) {
      if (!fs.existsSync(path.join(home, 'bin', exe('javac')))) continue;
      let major = 0;
      try { major = parseInt((/JAVA_VERSION="(\d+)/.exec(fs.readFileSync(path.join(home, 'release'), 'utf8')) || [])[1], 10) || 0; } catch (e) { /* no release file */ }
      if (major >= JDK_VERSION) return { home, major };
    }
    return null;
  }

  function sdkDir(rapt) {
    try { return fs.readFileSync(path.join(rapt, 'sdk.txt'), 'utf8').trim(); } catch (e) { return path.join(rapt, 'Sdk'); }
  }

  function readConfig(root) {
    for (const f of ['android.json', '.android.json']) {
      try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) { /* next */ }
    }
    return null;
  }

  function status() {
    const info = sdkInfo();
    const root = getProjectRoot();
    const rapt = !!info && fs.existsSync(path.join(info.rapt, 'buildlib', 'rapt', 'plat.py'));
    const jdk = findJdk();
    const sdk = rapt && fs.existsSync(path.join(sdkDir(info.rapt), 'platform-tools', exe('adb')))
      && fs.existsSync(path.join(sdkDir(info.rapt), 'platforms', SDK_PLATFORM));
    const keys = !!root && fs.existsSync(path.join(root, 'android.keystore')) && fs.existsSync(path.join(root, 'bundle.keystore'));
    const game = readGameInfo() || {};
    return {
      renpy: !!info, renpyVersion: info && info.version, rapt, jdk: !!jdk, jdkVersion: jdk && jdk.major,
      sdk, keys, config: root ? readConfig(root) : null, project: !!root, root,
      defaults: {
        name: game.name || '', version: game.version || '1.0',
        package: 'com.' + (game.buildName || 'mygame').toLowerCase().replace(/[^a-z0-9_]/g, '') + '.app'
      },
      busy: job && job.kind
    };
  }

  // ── Small helpers ──

  function run(cmd, args, opts = {}) {
    return new Promise((resolve) => {
      let child;
      try { child = spawn(cmd, args, { windowsHide: true, ...opts }); } catch (e) { resolve({ code: -1, error: e.message }); return; }
      if (job) job.child = child;
      let pending = '';
      const lines = [];
      const onData = (chunk) => {
        pending += chunk.toString('utf8');
        const parts = pending.split(/\r\n|\r|\n/);
        pending = parts.pop();
        for (const line of parts) if (line.trim()) { lines.push(line); if (opts.onLine) opts.onLine(line); }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('error', (e) => resolve({ code: -1, error: e.message, lines }));
      child.on('close', (code, signal) => resolve({ code, signal, lines }));
    });
  }

  async function download(url, dest, step, expectedSha256) {
    const controller = new AbortController();
    if (job) job.abort = () => controller.abort();
    const res = await net.fetch(url, { signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = parseInt(res.headers.get('content-length') || '0', 10);
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(dest);
    let done = 0, last = 0;
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        done += value.length;
        hash.update(value);
        if (!out.write(value)) await new Promise(r => out.once('drain', r));
        if (Date.now() - last > 200) { last = Date.now(); send({ step, type: 'progress', done, total }); }
      }
    } finally {
      await new Promise(r => out.end(r));
    }
    if (expectedSha256 && hash.digest('hex') !== expectedSha256.toLowerCase()) throw new Error('checksum');
  }

  async function extract(archive, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    const r = await run(tar, ['-xf', archive, '-C', dest]);
    if (r.code !== 0) throw new Error('extract');
  }

  // ── Steps ──

  // RAPT of the same version as the Ren'Py SDK, checked against renpy.org's checksums
  async function installRapt() {
    const info = sdkInfo();
    if (!info || !info.version) throw new Error('no-renpy');
    const file = `renpy-${info.version}-rapt.zip`;
    const base = `https://www.renpy.org/dl/${info.version}/`;
    send({ step: 'rapt', type: 'info', text: file });
    let sha = null;
    try {
      const sums = await (await net.fetch(base + 'checksums.txt')).text();
      let section = '';
      for (const line of sums.split('\n')) {
        const sec = /^#\s*(\w+)/.exec(line);
        if (sec) { section = sec[1].toLowerCase(); continue; }
        const m = /^([0-9a-f]+)\s+(\S+)$/i.exec(line.trim());
        if (m && m[2] === file && section === 'sha256') sha = m[1];
      }
    } catch (e) { /* checked by size only */ }
    const tmp = path.join(app.getPath('temp'), file);
    await download(base + file, tmp, 'rapt', sha);
    send({ step: 'rapt', type: 'info', text: 'extract' });
    await extract(tmp, info.sdk);
    fs.rmSync(tmp, { force: true });
  }

  // Eclipse Temurin JDK 21 from Adoptium, in the editor's data folder
  async function installJdk() {
    const os = { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform];
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
    const api = `https://api.adoptium.net/v3/assets/latest/${JDK_VERSION}/hotspot?architecture=${arch}&image_type=jdk&os=${os}&vendor=eclipse`;
    const assets = await (await net.fetch(api)).json();
    const pkg = assets && assets[0] && assets[0].binary && assets[0].binary.package;
    if (!pkg) throw new Error('jdk-not-found');
    send({ step: 'jdk', type: 'info', text: pkg.name });
    const tmp = path.join(app.getPath('temp'), pkg.name);
    await download(pkg.link, tmp, 'jdk', pkg.checksum);
    send({ step: 'jdk', type: 'info', text: 'extract' });
    fs.rmSync(jdkBase(), { recursive: true, force: true });
    await extract(tmp, jdkBase());
    fs.rmSync(tmp, { force: true });
    if (!findJdk()) throw new Error('jdk-broken');
  }

  function javaEnv(jdk) {
    const env = { ...process.env, JAVA_HOME: jdk.home };
    env.PATH = path.join(jdk.home, 'bin') + path.delimiter + (process.env.PATH || process.env.Path || '');
    return env;
  }

  // The Android SDK, through RAPT (the user accepted Google's terms in the editor)
  async function installSdk() {
    const info = sdkInfo();
    const jdk = findJdk();
    if (!info || !jdk) throw new Error('missing-prerequisites');
    const { cmd } = renpyBuildCommand(getRenpyExecutable());
    const r = await run(cmd, ['-u', helperPath(), 'install_sdk', info.rapt], {
      cwd: info.rapt, env: { ...javaEnv(jdk), RAPT_NO_TERMS: '1' },
      onLine: (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch (e) { msg = { type: 'log', text: line }; }
        send({ step: 'sdk', ...msg });
      }
    });
    if (r.signal) throw new Error('cancelled');
    if (r.code !== 0) throw new Error((r.lines.map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(m => m && m.type === 'fail').pop() || {}).text || 'sdk');
  }

  // android.keystore and bundle.keystore, as RAPT makes them
  async function generateKeys(owner) {
    const root = getProjectRoot();
    const jdk = findJdk();
    if (!root || !jdk) throw new Error('missing-prerequisites');
    const keystore = path.join(root, 'android.keystore');
    if (!fs.existsSync(keystore)) {
      const dname = 'CN=' + String(owner || "A Ren'Py Creator").replace(/[,=+<>#;"\\]/g, ' ').trim();
      const r = await run(path.join(jdk.home, 'bin', exe('keytool')), ['-genkey', '-keystore', keystore, '-alias', 'android',
        '-keyalg', 'RSA', '-keysize', '2048', '-keypass', 'android', '-storepass', 'android', '-dname', dname, '-validity', '20000']);
      if (r.code !== 0) throw new Error((r.lines || []).slice(-1)[0] || 'keytool');
    }
    const bundle = path.join(root, 'bundle.keystore');
    if (!fs.existsSync(bundle)) fs.copyFileSync(keystore, bundle);
  }

  function saveConfig(cfg) {
    const root = getProjectRoot();
    if (!root) return { ok: false, error: 'no-project' };
    const pkg = String(cfg.package || '').trim().toLowerCase();
    const parts = pkg.split('.');
    if (parts.length < 2 || parts.some(p => !/^[a-z_][a-z0-9_]*$/.test(p))) return { ok: false, error: 'package' };
    const numeric = parseInt(cfg.numeric_version, 10);
    if (!(numeric >= 1)) return { ok: false, error: 'numeric' };
    const current = readConfig(root) || {
      layout: null, source: false, expansion: false, include_pil: false, include_sqlite: false,
      google_play_key: null, google_play_salt: null, store: 'none', update_icons: true, update_always: true,
      heap_size: null, update_keystores: true, permissions: ['VIBRATE', 'INTERNET']
    };
    const next = {
      ...current,
      name: String(cfg.name || '').trim() || 'Game',
      icon_name: String(cfg.icon_name || cfg.name || '').trim() || 'Game',
      package: pkg,
      version: String(cfg.version || '1.0').trim(),
      numeric_version: numeric,
      orientation: ['sensorLandscape', 'portrait', 'sensor'].includes(cfg.orientation) ? cfg.orientation : 'sensorLandscape'
    };
    fs.writeFileSync(path.join(root, 'android.json'), JSON.stringify(next, null, 4), 'utf8');
    return { ok: true, config: next };
  }

  // One package with Ren'Py's own android_build command
  async function buildOne(bundle, destination) {
    const jdk = findJdk();
    const { cmd, args, sdk } = renpyBuildCommand(getRenpyExecutable());
    const step = bundle ? 'aab' : 'apk';
    const before = new Set(fs.existsSync(destination) ? fs.readdirSync(destination) : []);
    const r = await run(cmd, [...args, path.join(sdk, 'launcher'), 'android_build', getProjectRoot(),
      ...(bundle ? ['--bundle'] : []), '--destination', destination], {
      cwd: sdk, env: javaEnv(jdk),
      onLine: (line) => send({ step, type: 'log', text: line })
    });
    if (r.signal) throw new Error('cancelled');
    const files = fs.existsSync(destination) ? fs.readdirSync(destination).filter(f => !before.has(f) && /\.(apk|aab)$/i.test(f)) : [];
    if (r.code !== 0 || !files.length) {
      const err = new Error('build');
      err.log = (r.lines || []).slice(-40);
      throw err;
    }
    return files;
  }

  // ── IPC ──

  ipcMain.handle('android-status', () => status());

  ipcMain.handle('android-setup', async (_, step, options = {}) => {
    if (job) return { ok: false, error: 'busy' };
    job = { kind: step };
    try {
      if (step === 'rapt') await installRapt();
      else if (step === 'jdk') await installJdk();
      else if (step === 'sdk') await installSdk();
      else if (step === 'keys') await generateKeys(options.owner);
      else throw new Error('unknown-step');
      return { ok: true, status: (job = null, status()) };
    } catch (e) {
      job = null;
      return { ok: false, error: e.message === 'This operation was aborted' ? 'cancelled' : e.message, status: status() };
    }
  });

  ipcMain.handle('android-save-config', (_, cfg) => saveConfig(cfg));
  ipcMain.handle('android-open-terms', () => require('electron').shell.openExternal('https://developer.android.com/studio/terms'));

  ipcMain.handle('android-build', async (_, opts) => {
    if (job) return { ok: false, error: 'busy' };
    const s = status();
    if (!(s.rapt && s.jdk && s.sdk && s.keys && s.config)) return { ok: false, error: 'not-ready' };
    job = { kind: 'build' };
    const files = [];
    try {
      fs.mkdirSync(opts.destination, { recursive: true });
      if (opts.apk) files.push(...await buildOne(false, opts.destination));
      if (opts.aab) files.push(...await buildOne(true, opts.destination));
      return { ok: true, files, destination: opts.destination };
    } catch (e) {
      return { ok: false, error: e.message, log: e.log, files, destination: opts.destination };
    } finally {
      job = null;
    }
  });

  ipcMain.handle('android-cancel', () => {
    if (!job) return false;
    if (job.abort) job.abort();
    if (job.child) job.child.kill();
    return true;
  });
}

module.exports = { setupAndroid };
