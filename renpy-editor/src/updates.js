// ═══════════════════════════════════════════════════════════
// NovelBlocks — The editor's own updates: the version and a
// button in Settings, and a notice when a new version is ready.
// ═══════════════════════════════════════════════════════════

let updateState = null;
let updateBannerDismissed = false;

async function initUpdates() {
  updateState = await window.api.updateStatus();
  renderUpdates();
}

function updateStatusText(s) {
  if (!s.enabled) return t('update_dev');
  switch (s.state) {
    case 'checking': return t('update_checking');
    case 'latest': return t('update_latest');
    case 'downloading': return t('update_downloading', s.newVersion || '', s.percent || 0);
    case 'ready': return t('update_ready', s.newVersion || '');
    case 'error': return t('update_error');
    default: return '';
  }
}

function renderUpdates() {
  const s = updateState;
  if (!s) return;
  document.getElementById('update-version').textContent = t('update_version', s.version);
  const status = document.getElementById('update-status');
  status.textContent = updateStatusText(s);
  status.classList.toggle('error', s.state === 'error');
  const check = document.getElementById('update-check-btn');
  check.disabled = !s.enabled || s.state === 'checking' || s.state === 'downloading' || s.state === 'ready';
  document.getElementById('update-install-btn').hidden = s.state !== 'ready';

  const banner = document.getElementById('update-banner');
  banner.hidden = s.state !== 'ready' || updateBannerDismissed;
  if (!banner.hidden) document.getElementById('update-banner-text').textContent = t('update_banner', s.newVersion || '');
}

function checkForUpdates() {
  window.api.updateCheck().then(s => { updateState = { ...updateState, ...s }; renderUpdates(); });
}

// The editor closes as usual (asking about unsaved editors) and the update installs
function installUpdate() {
  window.api.updateInstall();
}

function dismissUpdateBanner() {
  updateBannerDismissed = true;
  renderUpdates();
}

window.api.onUpdateStatus(s => {
  updateState = { ...updateState, ...s };
  renderUpdates();
});
