// ═════════════════════════════════════════════════════════════════════
// Updates: the installed editor looks for new versions on the project's
// GitHub Releases, downloads them in the background and installs them
// when the user restarts (or the next time the editor closes).
// ═════════════════════════════════════════════════════════════════════
const { app, ipcMain } = require('electron');

const CHECK_EVERY = 6 * 60 * 60 * 1000;

function setupUpdates({ getWindow }) {
  let status = { state: 'idle', version: app.getVersion() };
  const send = (next) => {
    status = { ...status, ...next };
    const win = getWindow();
    if (win) win.webContents.send('update-status', status);
  };

  // Only an installed editor updates itself; NOVELBLOCKS_UPDATE_URL points a
  // development copy at a test server
  const testFeed = process.env.NOVELBLOCKS_UPDATE_URL;
  const enabled = app.isPackaged || !!testFeed;
  let autoUpdater = null;
  if (enabled) {
    ({ autoUpdater } = require('electron-updater'));
    if (testFeed) {
      autoUpdater.forceDevUpdateConfig = true;
      autoUpdater.setFeedURL({ provider: 'generic', url: testFeed });
    }
    autoUpdater.autoDownload = true;
    autoUpdater.disableWebInstaller = true;
    // Only the installed editor installs on quit: a development copy pointed at a
    // test server must never run the installer it downloaded
    autoUpdater.autoInstallOnAppQuit = app.isPackaged;
    autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
    autoUpdater.on('update-not-available', () => send({ state: 'latest' }));
    autoUpdater.on('update-available', (info) => send({ state: 'downloading', newVersion: info.version, percent: 0 }));
    autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', newVersion: info.version }));
    autoUpdater.on('error', (e) => send({ state: 'error', message: String(e && e.message || e).split('\n')[0] }));
  }

  const check = () => {
    if (!autoUpdater || status.state === 'downloading' || status.state === 'ready') return;
    autoUpdater.checkForUpdates().catch(() => { /* reported through the error event */ });
  };

  ipcMain.handle('update-status', () => ({ ...status, enabled }));
  ipcMain.handle('update-check', () => { check(); return { ...status, enabled }; });
  // Closing goes through the usual check for unsaved editors; the update installs on quit
  ipcMain.handle('update-install', () => {
    if (!autoUpdater || status.state !== 'ready' || !app.isPackaged) return false;
    autoUpdater.quitAndInstall(false, true);
    return true;
  });

  if (enabled) {
    setTimeout(check, 8000);
    setInterval(check, CHECK_EVERY);
  }
}

module.exports = { setupUpdates };
