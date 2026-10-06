// Pantone C codes on a tech pack: matched from each colour's own hex, never guessed by a model.
import './pantone-c.js';

const P = () => globalThis.FBPantone;
const hexOf = s => { const m = /#([0-9a-f]{6})\b/i.exec(String(s || '')); return m ? '#' + m[1].toLowerCase() : ''; };

// A BOM colour string ("Navy #1d2a4a") with the Pantone C chip for its hex after it: "Navy #1d2a4a · PANTONE 533 C". A code already there is replaced, so it follows the hex.
export function colourWithCode(text) {
  const hex = hexOf(text); if (!hex) return String(text || '');
  const base = String(text).replace(/\s*·\s*PANTONE\s+.+?\sC\b/i, '').trim(), c = P().code(hex, { hint: base });
  return c ? `${base} · ${c}` : base;
}

// Fills the Pantone C code on every colourway that has a colour. keep: leave a Pantone C code that is already there (the default); with keep false every code is recomputed.
export function codeColourways(pack, { keep = true } = {}) {
  let changed = 0;
  const colorways = (pack.colorways || []).map(c => {
    if (!hexOf(c.swatch)) return c;
    if (keep && P().isC(c.code)) return c;
    const code = P().code(c.swatch, { hint: `${c.name || ''} ${c.notes || ''}` });
    if (!code || code === c.code) return c;
    changed++; return { ...c, code };
  });
  return { pack: { ...pack, colorways }, changed };
}
