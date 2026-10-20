// ═══════════════════════════════════════════════════════════
// NovelBlocks — Putting a new block exactly where it goes:
// dragging it from the palette into the list, or with the "+"
// that shows between two blocks.
// ═══════════════════════════════════════════════════════════

let insertAt = null;          // index for the next new block (null: below the selected one)
let paletteDragType = null;   // block type being dragged from the palette

// Opens the form of a new block that will go at `index`
function addBlockAt(type, index) {
  closeInsertMenu();
  insertAt = Math.max(0, Math.min(index, blocks.length));
  if (type === 'patch') { addPatchBlock(); return; }
  editingIndex = -1;
  openModal(type, null);
}

// The slot before block `at` (at = blocks.length: after the last one)
function blockGapHtml(at) {
  return `<div class="block-gap" data-at="${at}"
      ondragover="onGapDragOver(event, ${at})" ondragleave="this.classList.remove('drop-target')" ondrop="onGapDrop(event, ${at})">
    <button class="block-gap-btn" type="button" onclick="openInsertMenu(${at}, this)" title="${escHtml(t('insert_block_here'))}" aria-label="${escHtml(t('insert_block_here'))}">${icon('plus', 13)}</button>
  </div>`;
}

// ── Menu of block types ──

// The same groups and order as the palette (a hidden group, like Patch when it's off, is left out)
function insertMenuGroups() {
  return [...document.querySelectorAll('#block-palette .palette-group:not([hidden])')].map(group => ({
    cat: [...group.classList].find(c => c.startsWith('cat-')).slice(4),
    types: [...group.querySelectorAll('.palette-btn')].map(btn => /'(\w+)'/.exec(btn.getAttribute('ondragstart') || '')?.[1]).filter(Boolean)
  }));
}

function openInsertMenu(at, anchor) {
  closeInsertMenu();
  const menu = document.createElement('div');
  menu.id = 'insert-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', t('insert_block_here'));
  menu.innerHTML = insertMenuGroups().map(g => `
    <div class="insert-group cat-${g.cat}">
      <div class="insert-group-title"><span class="palette-swatch"></span>${escHtml(t('block_group_' + g.cat))}</div>
      ${g.types.map(type => {
        const meta = type === 'patch' ? PATCH_META : BLOCK_META[type];
        return `<button type="button" role="menuitem" class="palette-btn" onclick="addBlockAt('${type}', ${at})">${meta.icon}<span>${escHtml(t(meta.labelKey))}</span></button>`;
      }).join('')}
    </div>`).join('');
  document.body.appendChild(menu);
  // Next to the "+", inside the window
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
  menu.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  menu.querySelector('button')?.focus();
}

function closeInsertMenu() {
  document.getElementById('insert-menu')?.remove();
}

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#insert-menu, .block-gap-btn')) closeInsertMenu();
});
document.addEventListener('keydown', (e) => {
  const menu = document.getElementById('insert-menu');
  if (!menu) return;
  if (e.key === 'Escape') { e.stopPropagation(); closeInsertMenu(); return; }
  // Arrows move through the menu
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  }
}, true);

// ── Dragging from the palette ──

function onPaletteDragStart(e, type) {
  paletteDragType = type;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('text/plain', type);
  document.getElementById('block-list').classList.add('palette-dragging');
}

function onPaletteDragEnd() {
  paletteDragType = null;
  clearDropMarks();
  document.getElementById('block-list').classList.remove('palette-dragging');
}

function clearDropMarks() {
  document.querySelectorAll('.drop-target, .drag-over, .drag-over-after').forEach(el => el.classList.remove('drop-target', 'drag-over', 'drag-over-after'));
}

function onGapDragOver(e, at) {
  if (paletteDragType === null && dragSrcIndex === null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = paletteDragType ? 'copy' : 'move';
  clearDropMarks();
  e.currentTarget.classList.add('drop-target');
}

function onGapDrop(e, at) {
  e.preventDefault();
  e.stopPropagation();
  clearDropMarks();
  if (paletteDragType) { const type = paletteDragType; onPaletteDragEnd(); addBlockAt(type, at); return; }
  if (dragSrcIndex === null) return;
  // A block moved to a slot: the slot's index counts the block itself while it is still there
  const to = dragSrcIndex < at ? at - 1 : at;
  if (to !== dragSrcIndex) {
    const [moved] = blocks.splice(dragSrcIndex, 1);
    blocks.splice(to, 0, moved);
    previewIndex = to;
  }
  dragSrcIndex = null;
  renderBlocks(); updateCodePreview();
}

// Over a block, the palette drops above or below it depending on the half
function paletteDropIndex(e, idx) {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2 ? idx : idx + 1;
}

// An empty list (or the space under the last block) takes the block at the end
function onListDragOver(e) {
  if (!paletteDragType || e.target.closest('.block, .block-gap')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

function onListDrop(e) {
  if (!paletteDragType || e.target.closest('.block, .block-gap')) return;
  e.preventDefault();
  const type = paletteDragType;
  onPaletteDragEnd();
  // Before the label's closing return, as the palette's buttons do
  const last = blocks[blocks.length - 1];
  const endsWithReturn = last && last.type === 'custom' && (last.code || '').trim() === 'return';
  addBlockAt(type, endsWithReturn ? blocks.length - 1 : blocks.length);
}
