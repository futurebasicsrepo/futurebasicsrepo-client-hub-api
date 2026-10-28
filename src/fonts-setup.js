// Fonts for pictures the server draws (flats, spec sheets, the decoration sheet's flats): sharp draws SVG text with fontconfig, and the
// production container has no fonts installed, so every label came out as a row of empty boxes. This points fontconfig at the same
// Space Grotesk and IBM Plex Mono cuts the PDFs embed (src/fonts/pdf), keeping any system fonts too. Imported first by the server.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function setupFonts(env = process.env) {
  if (env.FONTCONFIG_FILE) return env.FONTCONFIG_FILE;
  const fonts = fileURLToPath(new URL('./fonts/pdf/', import.meta.url)), dir = join(tmpdir(), 'fb-fontconfig');
  mkdirSync(join(dir, 'cache'), { recursive: true });
  const file = join(dir, 'fonts.conf'), prefer = (generic, family) => `<alias><family>${generic}</family><prefer><family>${family}</family></prefer></alias>`;
  writeFileSync(file, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><dir>${fonts}</dir><include ignore_missing="yes">/etc/fonts/fonts.conf</include><cachedir>${join(dir, 'cache')}</cachedir>`
    + ['Space Grotesk', 'sans-serif', 'Helvetica', 'Arial'].map(f => prefer(f, 'Space Grotesk Light')).join('') + prefer('monospace', 'IBM Plex Mono') + '</fontconfig>\n'); // the static cuts name themselves "Space Grotesk Light"
  env.FONTCONFIG_FILE = file;
  return file;
}
setupFonts();
