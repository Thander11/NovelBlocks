// ═══════════════════════════════════════════════════════════
// Ren'Py EDITOR — Keeps characters.rpy in its usual order:
//
//   # Unknown                      ← characters without sprites, first,
//   define Alumna = Character(…)      in the order they were added
//
//   # Ryu                          ← one block per character:
//   define Ryu = Character(…)         header, define, and its sprites
//   ## Ryu hunter                     grouped by type
//   image Ryu_hunter_sonrisa = "…"
//
// Blocks are separated by a blank line. The last run of blocks in
// alphabetical order is where new characters go, so a main cast kept
// first by hand stays first. Shared by the declarations window and
// the Claude connection (mcp-tools.js).
// ═══════════════════════════════════════════════════════════

(function (exports) {
  const DEFINE_RE = /^define\s+(\w+)\s*=\s*Character\s*\(/;
  const isBlank = (l) => !l.trim();
  const isHeader = (l) => /^#(?!#)/.test(l.trim());
  const headerName = (l) => l.trim().replace(/^#\s*/, '');
  const isUnknownHeader = (l) => isHeader(l) && headerName(l).toLowerCase() === 'unknown';
  const compare = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

  function splitLines(text) {
    const eol = /\r\n/.test(text) ? '\r\n' : '\n';
    // A file that ended with a line break keeps it, and one that didn't stays so
    const last = !text || /\n$/.test(text) ? eol : '';
    return { eol, last, lines: (text || '').split(/\r?\n/) };
  }

  // The "# Unknown" section: its header and the define lines right under it
  function unknownSection(lines) {
    const header = lines.findIndex(isUnknownHeader);
    if (header < 0) return null;
    let end = header;
    while (end + 1 < lines.length && DEFINE_RE.test(lines[end + 1].trim())) end++;
    return { header, end };
  }

  // Every character block outside "# Unknown": { id, start } in file order.
  // A block starts at its "# Name" header when it has one, else at the define.
  function characterBlocks(lines) {
    const unknown = unknownSection(lines);
    const blocks = [];
    lines.forEach((line, i) => {
      const m = line.trim().match(DEFINE_RE);
      if (!m || (unknown && i > unknown.header && i <= unknown.end)) return;
      const start = i > 0 && isHeader(lines[i - 1]) && !isUnknownHeader(lines[i - 1]) ? i - 1 : i;
      blocks.push({ id: m[1], start });
    });
    return blocks;
  }

  function trimTrailingBlanks(lines) {
    while (lines.length && isBlank(lines[lines.length - 1])) lines.pop();
  }

  // Adds "define …" where it belongs and returns the new text
  function insertCharacter(text, id, defineLine, unknown) {
    const { eol, last, lines } = splitLines(text);
    if (unknown) {
      const section = unknownSection(lines);
      if (section) {
        lines.splice(section.end + 1, 0, defineLine);
      } else {
        // A new "# Unknown" section goes before the first character
        const first = characterBlocks(lines)[0];
        const at = first ? first.start : lines.length;
        const add = ['# Unknown', defineLine, ''];
        if (!first) { trimTrailingBlanks(lines); if (lines.length) add.unshift(''); }
        lines.splice(at, 0, ...add);
      }
    } else {
      const blocks = characterBlocks(lines);
      // The alphabetical run at the end of the file
      let tail = blocks.length - 1;
      while (tail > 0 && compare(blocks[tail - 1].id, blocks[tail].id) <= 0) tail--;
      const next = blocks.slice(Math.max(tail, 0)).find(b => compare(id, b.id) < 0);
      const block = ['# ' + id, defineLine];
      if (next) {
        lines.splice(next.start, 0, ...block, '');
      } else {
        trimTrailingBlanks(lines);
        lines.push(...(lines.length ? [''] : []), ...block);
      }
    }
    trimTrailingBlanks(lines);
    return lines.join(eol) + last;
  }

  // ── Sprites: image <id>_<type>_<name> = "…", grouped under "## <id> <type>" ──
  const IMAGE_RE = /^image\s+(\w+)\s*=/;
  const typeHeaderRe = (id, type) => new RegExp(`^##\\s*${id}\\s+${type}\\s*$`, 'i');

  // Character that owns a sprite key: the longest id it starts with
  function spriteOwner(ids, key) {
    let best = null;
    for (const id of ids) {
      if ((key.startsWith(id + '_') || key.startsWith(id.toLowerCase() + '_')) && (!best || id.length > best.length)) best = id;
    }
    return best;
  }

  function spriteType(id, key) {
    const rest = key.slice(id.length + 1);
    const i = rest.indexOf('_');
    return i <= 0 || i === rest.length - 1 ? '' : rest.slice(0, i);
  }

  const definedIds = (lines) => lines.map(l => (l.trim().match(DEFINE_RE) || [])[1]).filter(Boolean);

  // Adds image lines after the last sprite of the same type; a new type gets
  // its "## <id> <type>" header after the character's last sprite (or its define)
  function insertSprites(text, id, type, imageLines) {
    const { eol, last, lines } = splitLines(text);
    const ids = definedIds(lines);
    let lastSameType = -1, lastOfChar = -1, defineIdx = -1;
    lines.forEach((line, i) => {
      const t = line.trim();
      const img = t.match(IMAGE_RE);
      if (img && spriteOwner(ids, img[1]) === id) {
        lastOfChar = i;
        if (spriteType(id, img[1]) === type) lastSameType = i;
      } else if ((t.match(DEFINE_RE) || [])[1] === id) defineIdx = i;
    });
    const add = lastSameType < 0 && type ? [`## ${id} ${type}`, ...imageLines] : imageLines;
    // The "# Unknown" section stays a plain list of defines: its sprites go right after it
    const unknown = unknownSection(lines);
    if (unknown && defineIdx > unknown.header && defineIdx <= unknown.end) defineIdx = unknown.end;
    const at = lastSameType >= 0 ? lastSameType : lastOfChar >= 0 ? lastOfChar : defineIdx;
    if (at >= 0) {
      lines.splice(at + 1, 0, ...add);
    } else {
      trimTrailingBlanks(lines);
      lines.push(...(lines.length ? [''] : []), ...add);
    }
    trimTrailingBlanks(lines);
    return lines.join(eol) + last;
  }

  // The same, for one "image <key> = …" line whose owner is worked out from the key
  function insertSpriteLine(text, key, imageLine) {
    const id = spriteOwner(definedIds(splitLines(text).lines), key);
    if (!id) {
      const { eol, last, lines } = splitLines(text);
      trimTrailingBlanks(lines);
      lines.push(imageLine);
      return lines.join(eol) + last;
    }
    return insertSprites(text, id, spriteType(id, key), [imageLine]);
  }

  // Removes image lines by key, and the "## <id> <type>" headers left with no sprites
  function removeSprites(text, keys) {
    const { eol, last, lines } = splitLines(text);
    const ids = definedIds(lines);
    const emptied = new Set();
    let out = lines.filter(line => {
      const img = line.trim().match(IMAGE_RE);
      if (!img || !keys.includes(img[1])) return true;
      const id = spriteOwner(ids, img[1]);
      if (id) emptied.add(id + '\0' + spriteType(id, img[1]));
      return false;
    });
    for (const k of emptied) {
      const [id, type] = k.split('\0');
      if (!type) continue;
      const stillThere = out.some(l => { const m = l.trim().match(IMAGE_RE); return m && spriteOwner(ids, m[1]) === id && spriteType(id, m[1]) === type; });
      if (!stillThere) out = out.filter(l => !typeHeaderRe(id, type).test(l.trim()));
    }
    trimTrailingBlanks(out);
    return out.join(eol) + last;
  }

  // Removes a character's block: header, define, type headers and sprites
  function removeCharacter(text, id) {
    const { eol, last, lines } = splitLines(text);
    const defineIdx = lines.findIndex(l => (l.trim().match(DEFINE_RE) || [])[1] === id);
    const out = [];
    let removed = false;
    lines.forEach((line, i) => {
      const t = line.trim();
      const gone = i === defineIdx
        || (i === defineIdx - 1 && isHeader(line) && headerName(line) === id)
        || new RegExp(`^image\\s+${id}_`).test(t)
        || new RegExp(`^##\\s*${id}\\s`).test(t + ' ');
      if (gone) { removed = true; return; }
      // No double blank line where the block was
      if (isBlank(line) && removed && out.length && isBlank(out[out.length - 1])) return;
      if (!isBlank(line)) removed = false;
      out.push(line);
    });
    trimTrailingBlanks(out);
    return out.join(eol) + last;
  }

  // A new id for a character: its define, its headers and its sprite keys
  function renameCharacter(text, oldId, newId, defineLine) {
    const { eol, lines } = splitLines(text);
    const out = lines.map((line, i) => {
      const t = line.trim();
      if ((t.match(DEFINE_RE) || [])[1] === oldId) return defineLine;
      if (isHeader(line) && headerName(line) === oldId && DEFINE_RE.test((lines[i + 1] || '').trim())) return '# ' + newId;
      if (new RegExp(`^##\\s*${oldId}\\s`).test(t + ' ')) return line.replace(new RegExp(`^(\\s*##\\s*)${oldId}`), `$1${newId}`);
      return line.replace(new RegExp(`^(image\\s+)${oldId}_`), `$1${newId}_`);
    });
    return out.join(eol);
  }

  Object.assign(exports, { insertCharacter, removeCharacter, renameCharacter, insertSprites, insertSpriteLine, removeSprites });
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.CharactersFile = {}));
