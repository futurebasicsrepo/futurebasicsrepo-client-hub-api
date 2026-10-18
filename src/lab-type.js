// Lettering for the Design Lab's graphics, turned into outlines from our own font files (Space Grotesk and IBM Plex Mono) so a graphic looks the same everywhere and
// never depends on a font being installed. Text becomes plain path shapes: nothing in a graphic can run, fetch or change with the machine that draws it.
import * as fontkit from 'fontkit';
const fk = fontkit.default || fontkit;

export const TYPE_FONTS = { 'grotesk-bold': 'SpaceGrotesk-Bold.ttf', grotesk: 'SpaceGrotesk-Medium.ttf', 'grotesk-light': 'SpaceGrotesk-Regular.ttf', mono: 'IBMPlexMono-Medium.ttf' };
const cache = new Map();
const font = key => { const k = TYPE_FONTS[key] ? key : 'grotesk-bold'; if (!cache.has(k)) cache.set(k, fk.openSync(new URL(`./fonts/pdf/${TYPE_FONTS[k]}`, import.meta.url).pathname)); return cache.get(k); };

// → { d, width }: the outline of `text` as an SVG path, its baseline at y, aligned at x ('start', 'middle' or 'end'), `size` units tall (em), `tracking` extra units between letters.
export function textPath({ text, font: key = 'grotesk-bold', size = 24, x = 0, y = 0, anchor = 'start', tracking = 0 } = {}) {
  const f = font(key), s = size / f.unitsPerEm, run = f.layout(String(text ?? '')), n = run.glyphs.length;
  const total = run.positions.reduce((w, p) => w + p.xAdvance * s, 0) + tracking * Math.max(0, n - 1), start = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;
  let pen = start, d = '';
  run.glyphs.forEach((g, i) => { const p = run.positions[i]; if (g.path && g.path.commands.length) d += g.path.transform(s, 0, 0, -s, pen + p.xOffset * s, y - p.yOffset * s).toSVG(); pen += p.xAdvance * s + tracking; });
  return { d, width: total };
}
