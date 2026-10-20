// ═══════════════════════════════════════════════════════════
// NovelBlocks — About and credits in Settings: the editor is
// an unofficial tool, and the software it uses or downloads.
// ═══════════════════════════════════════════════════════════

// The app's name in the credits (one place, in case it changes)
const CREDITS_APP_NAME = "NovelBlocks";

// Names, authors and licenses stay as they are in every language
const CREDITS = [
  { name: "Ren'Py", by: 'Tom Rothamel', license: 'MIT', url: 'https://www.renpy.org', text: 'credits_renpy' },
  { name: 'Electron', by: 'OpenJS Foundation', license: 'MIT', url: 'https://www.electronjs.org', text: 'credits_electron' },
  { name: 'electron-updater', by: 'electron-userland', license: 'MIT', url: 'https://www.electron.build', text: 'credits_updater' },
  { name: 'Manrope, DM Mono', by: 'Mikhail Sharanda, Colophon Foundry', license: 'SIL OFL 1.1', url: 'https://fontsource.org', text: 'credits_fonts' },
  { name: 'Eclipse Temurin (Java)', by: 'Eclipse Adoptium', license: 'GPLv2 + Classpath Exception', url: 'https://adoptium.net', text: 'credits_jdk' },
  { name: 'Android SDK', by: 'Google', license: 'Android SDK License', url: 'https://developer.android.com/studio/terms', text: 'credits_android' }
];

function renderCredits() {
  const el = document.getElementById('credits');
  if (!el) return;
  el.innerHTML = `
    <p class="settings-hint">${escHtml(t('credits_disclaimer', CREDITS_APP_NAME))}</p>
    <p class="settings-hint">${escHtml(t('credits_license', CREDITS_APP_NAME))}</p>
    <details class="credits-list">
      <summary>${escHtml(t('credits_show'))}</summary>
      <ul>${CREDITS.map(c => `
        <li>
          <a href="${c.url}" target="_blank" rel="noopener">${escHtml(c.name)}</a>
          <span class="credits-meta">${escHtml(c.by)} · ${escHtml(c.license)}</span>
          <span class="credits-text">${escHtml(t(c.text))}</span>
        </li>`).join('')}
      </ul>
    </details>`;
}
