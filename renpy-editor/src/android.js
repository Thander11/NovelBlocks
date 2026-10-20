// ═══════════════════════════════════════════════════════════
// NovelBlocks — Android in the Build dialog: APK and AAB,
// the steps to set up the tools the first time, and the app's
// details (android.json). main.js (android.js) does the work.
// ═══════════════════════════════════════════════════════════

let androidSel = { apk: false, aab: false };
let androidState = null;     // from main: what is installed and the app's details
let androidStep = null;      // step running now
let androidStepText = '';
let androidLog = [];

try { androidSel = { ...androidSel, ...JSON.parse(localStorage.getItem('androidSel') || '{}') }; } catch (e) { /* defaults */ }

const ANDROID_STEPS = ['rapt', 'jdk', 'sdk', 'keys'];
const androidWanted = () => androidSel.apk || androidSel.aab;
// The app's details are saved when building, so the defaults count too
const androidReady = () => !!androidState && !!androidState.renpy && ANDROID_STEPS.every(s => androidState[s]);

async function loadAndroidState() {
  androidState = await window.api.androidStatus();
}

function buildAndroidHtml() {
  return `
    <fieldset class="build-pkgs build-android">
      <legend class="form-label">${icon('android', 14)}${t('android_title')}</legend>
      ${['apk', 'aab'].map(k => `
        <label class="build-pkg">
          <input type="checkbox" ${androidSel[k] ? 'checked' : ''} onchange="setAndroidSel('${k}', this.checked)">
          <span class="build-pkg-text"><span class="build-pkg-name">${t('android_' + k)}</span>
          <span class="build-pkg-hint">${t('android_' + k + '_hint')}</span></span>
        </label>`).join('')}
      <div id="android-panel"></div>
    </fieldset>`;
}

function setAndroidSel(kind, on) {
  androidSel[kind] = on;
  try { localStorage.setItem('androidSel', JSON.stringify(androidSel)); } catch (e) { /* only a preference */ }
  renderAndroidPanel();
  onBuildPackageChange();
}

function androidStepRow(step, index) {
  const s = androidState;
  const done = !!s[step];
  const running = androidStep === step;
  // A step can run once the ones it needs are there
  const needs = { rapt: [], jdk: [], sdk: ['rapt', 'jdk'], keys: ['jdk'] }[step];
  const can = s.renpy && needs.every(n => s[n]) && !androidStep;
  let action = '';
  if (done) action = `<span class="android-ok">${icon('check', 14)}${t('android_ready')}</span>`;
  else if (running) action = `<button class="btn btn-secondary btn-sm" onclick="window.api.androidCancel()">${t('android_cancel')}</button>`;
  else if (step === 'keys') action = '';
  else action = `<button class="btn btn-secondary btn-sm" ${can ? '' : 'disabled'} onclick="runAndroidStep('${step}')">${t('android_install')}</button>`;
  return `
    <li class="android-step ${done ? 'done' : ''} ${running ? 'running' : ''}">
      <span class="android-num">${done ? icon('check', 13) : index + 1}</span>
      <span class="android-step-text"><span class="android-step-name">${t('android_step_' + step)}</span>
        <span class="settings-hint">${t('android_step_' + step + '_hint')}${step === 'sdk' && !done ? ` <a href="#" onclick="event.preventDefault(); window.api.androidOpenTerms()">${t('android_terms')}</a>` : ''}</span>
        ${step === 'keys' && !done && !running ? `
          <span class="android-keys">
            <input class="form-input" id="android-owner" placeholder="${escHtml(t('android_owner'))}" aria-label="${escHtml(t('android_owner'))}" ${can ? '' : 'disabled'}>
            <button class="btn btn-secondary btn-sm" ${can ? '' : 'disabled'} onclick="runAndroidStep('keys')">${t('android_create')}</button>
          </span>` : ''}
        ${step === 'keys' && done ? `<span class="android-backup">${icon('alert', 14)}<span>${t('android_keys_backup')}</span>
          <button class="btn btn-secondary btn-sm" onclick="window.api.openFolder(androidState.root)">${t('android_open_folder')}</button></span>` : ''}
        ${running ? `<span class="android-progress" id="android-progress">${escHtml(androidStepText)}</span>` : ''}
      </span>
      <span class="android-action">${action}</span>
    </li>`;
}

function renderAndroidPanel() {
  const panel = document.getElementById('android-panel');
  if (!panel) return;
  if (!androidWanted() || !androidState) { panel.innerHTML = ''; return; }
  const s = androidState;
  if (!s.renpy) { panel.innerHTML = `<p class="patch-steam">${icon('info', 15)}<span>${t('android_no_renpy')}</span></p>`; return; }
  const c = s.config || {};
  const d = s.defaults;
  const v = (k, def) => escHtml(String(c[k] !== undefined && c[k] !== null ? c[k] : def));
  panel.innerHTML = `
    ${ANDROID_STEPS.every(st => s[st]) ? '' : `<p class="settings-hint">${t('android_setup_intro')}</p>`}
    <ol class="android-steps">${ANDROID_STEPS.map(androidStepRow).join('')}</ol>
    ${androidLog.length ? `<details class="build-log"><summary>${t('build_log')}</summary><pre>${escHtml(androidLog.slice(-120).join('\n'))}</pre></details>` : ''}
    <div class="android-config">
      <div class="form-label">${t('android_step_config')}</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label" for="and-name">${t('android_name')}</label>
          <input class="form-input" id="and-name" value="${v('name', d.name)}" onchange="saveAndroidConfig()"></div>
        <div class="form-group"><label class="form-label" for="and-icon">${t('android_icon_name')}</label>
          <input class="form-input" id="and-icon" value="${v('icon_name', d.name)}" onchange="saveAndroidConfig()"></div>
      </div>
      <div class="form-group"><label class="form-label" for="and-package">${t('android_package')}</label>
        <input class="form-input game-mono" id="and-package" value="${v('package', d.package)}" spellcheck="false" onchange="saveAndroidConfig()" aria-describedby="and-package-hint">
        <p class="settings-hint" id="and-package-hint">${t('android_package_hint')}</p></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label" for="and-version">${t('android_version')}</label>
          <input class="form-input" id="and-version" value="${v('version', d.version)}" onchange="saveAndroidConfig()"></div>
        <div class="form-group"><label class="form-label" for="and-numeric">${t('android_numeric')}</label>
          <input class="form-input" id="and-numeric" type="number" min="1" value="${v('numeric_version', 1)}" onchange="saveAndroidConfig()" aria-describedby="and-numeric-hint">
          <p class="settings-hint" id="and-numeric-hint">${t('android_numeric_hint')}</p></div>
      </div>
      <div class="form-group"><label class="form-label" for="and-orientation">${t('android_orientation')}</label>
        <select class="form-select" id="and-orientation" onchange="saveAndroidConfig()">
          ${[['sensorLandscape', 'landscape'], ['portrait', 'portrait'], ['sensor', 'sensor']].map(([val, key]) =>
            `<option value="${val}" ${(c.orientation || 'sensorLandscape') === val ? 'selected' : ''}>${t('android_orient_' + key)}</option>`).join('')}
        </select></div>
      <p class="settings-hint error" id="android-config-error" role="alert"></p>
    </div>
    ${androidReady() ? `<p class="patch-steam">${icon('info', 15)}<span>${t('android_first_build')}</span></p>` : ''}`;
}

// The app's details are saved as they are typed; building saves them too
async function saveAndroidConfig() {
  const g = id => document.getElementById(id)?.value ?? '';
  const r = await window.api.androidSaveConfig({
    name: g('and-name'), icon_name: g('and-icon'), package: g('and-package'), version: g('and-version'),
    numeric_version: g('and-numeric'), orientation: g('and-orientation')
  });
  const err = document.getElementById('android-config-error');
  if (err) err.textContent = r.ok ? '' : t(r.error === 'package' ? 'android_error_package' : 'android_error_numeric');
  if (r.ok) androidState.config = r.config;
  onBuildPackageChange();
  return r.ok;
}

async function runAndroidStep(step) {
  const options = {};
  if (step === 'sdk') {
    // Google's terms are the user's to accept
    const choice = await showDialog({
      title: t('android_terms_title'), message: t('android_terms_message'), detail: 'https://developer.android.com/studio/terms',
      type: 'question', buttons: [t('cancel'), t('android_terms'), t('android_terms_accept')], defaultId: 2, cancelId: 0
    });
    if (choice === 1) { window.api.androidOpenTerms(); return; }
    if (choice !== 2) return;
  }
  if (step === 'keys') options.owner = document.getElementById('android-owner')?.value.trim();
  androidStep = step;
  androidStepText = '';
  renderAndroidPanel();
  const r = await window.api.androidSetup(step, options);
  androidStep = null;
  androidState = r.status || androidState;
  if (!r.ok && r.error !== 'cancelled') notify(t('android_step_failed', r.error), 'err');
  renderAndroidPanel();
  onBuildPackageChange();
}

window.api.onAndroidProgress((msg) => {
  // While building, the lines go to the build's own progress
  if (msg.step === 'apk' || msg.step === 'aab') {
    if (typeof buildState !== 'undefined' && buildState === 'building') {
      buildLog.push(msg.text);
      const step = document.getElementById('build-step');
      if (step) step.textContent = msg.text;
      const log = document.getElementById('build-log');
      if (log) log.textContent = buildLog.slice(-200).join('\n');
    }
    return;
  }
  if (msg.type === 'progress') {
    const mb = n => (n / 1048576).toFixed(0);
    androidStepText = msg.total ? t('android_downloading', mb(msg.done), mb(msg.total)) : t('android_downloading_size', mb(msg.done));
  } else if (msg.text === 'extract') {
    androidStepText = t('android_extracting');
  } else if (msg.text) {
    androidStepText = msg.text.split('\n')[0].slice(0, 160);
    androidLog.push(msg.text);
  }
  const el = document.getElementById('android-progress');
  if (el) el.textContent = androidStepText;
});
