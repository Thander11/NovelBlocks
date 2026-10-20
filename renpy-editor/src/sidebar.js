// ═══════════════════════════════════════════════════════════
// NovelBlocks — Folding sidebar. Folded, it comes out while the
// mouse is at the left edge of the window (or while the keyboard is
// inside it) and hides again when the mouse leaves.
// ═══════════════════════════════════════════════════════════

let sidebarCollapsed = false;
let sidebarHideTimer = null;

function applySidebar() {
  const app = document.getElementById('app');
  app.classList.toggle('sb-collapsed', sidebarCollapsed);
  app.classList.remove('sb-peek');
  const btn = document.getElementById('sb-collapse');
  btn.setAttribute('aria-expanded', String(!sidebarCollapsed));
  const label = t(sidebarCollapsed ? 'sidebar_show' : 'sidebar_hide');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  // Folded, the button pins it back in place, and says so
  document.getElementById('sb-collapse-text').textContent = sidebarCollapsed ? t('sidebar_pin') : '';
}

function toggleSidebar(collapse = !sidebarCollapsed) {
  sidebarCollapsed = collapse;
  applySidebar();
  window.api.saveSettings({ sidebarCollapsed }).catch(() => {});
}

function peekSidebar(show) {
  if (!sidebarCollapsed) return;
  clearTimeout(sidebarHideTimer);
  const app = document.getElementById('app');
  if (show) { app.classList.add('sb-peek'); return; }
  // A short wait, so crossing the edge by accident doesn't make it flicker
  sidebarHideTimer = setTimeout(() => {
    const sidebar = document.getElementById('sidebar');
    // Only the keyboard keeps it out: a click inside leaves focus there, and that shouldn't
    if (sidebar.matches(':hover') || sidebar.querySelector(':focus-visible')) return;
    app.classList.remove('sb-peek');
    if (sidebar.contains(document.activeElement)) document.activeElement.blur();
  }, 300);
}

function initSidebar(collapsed) {
  sidebarCollapsed = !!collapsed;
  applySidebar();
  const sidebar = document.getElementById('sidebar');
  // The mouse at the very left edge of the window brings it out
  document.addEventListener('mousemove', (e) => {
    if (!sidebarCollapsed) return;
    if (e.clientX <= 6) peekSidebar(true);
    // …and moving well away from it hides it, even if no mouseleave arrived
    else if (document.getElementById('app').classList.contains('sb-peek')
      && e.clientX > sidebar.getBoundingClientRect().right + 24) peekSidebar(false);
  });
  document.getElementById('sb-edge').addEventListener('mouseenter', () => peekSidebar(true));
  sidebar.addEventListener('mouseleave', () => peekSidebar(false));
  sidebar.addEventListener('mouseenter', () => peekSidebar(true));
  // Moving through it with the keyboard keeps it out
  sidebar.addEventListener('focusin', () => peekSidebar(true));
  sidebar.addEventListener('focusout', () => peekSidebar(false));
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b'
    && !e.target.closest('input, textarea, [contenteditable="true"]')) {
    e.preventDefault();
    toggleSidebar();
  }
});
