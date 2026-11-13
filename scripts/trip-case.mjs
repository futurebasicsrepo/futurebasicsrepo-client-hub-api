// A real miss as a test case. A picture drawn from the flats that left a detail out, or a picture read into flats that had to be corrected by
// hand, becomes a file in test/fixtures/trip-cases: test/lab-trip.test.js checks on every change that each detail missed is still asked for and
// checked, and scripts/flats-roundtrip.mjs draws it again (--live) and reports whether it now comes back.
//
//   node scripts/trip-case.mjs --file ~/Downloads/hoodie-1a2b3c4d.json      a file saved with Save as a test case on the Flats ↔ picture page
//   BASE=https://… ADMIN_TOKEN=… node scripts/trip-case.mjs <concept id> …  fetched from the app (the token inline, never committed)
//
// A case carries the garment's flats and its picture, not the concept's name or its client. Look at it before committing it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { STYLES } from '../src/lab-flats.js';
import { flatDetails } from '../src/lab-trip.js';

const DIR = new URL('../test/fixtures/trip-cases/', import.meta.url);
export function checkCase(k) {
  if (!k || typeof k !== 'object' || !/^[a-z0-9-]{3,60}$/.test(String(k.id || ''))) return 'not a case: no id';
  if (!STYLES[k.flat?.style]) return 'not a case: its flats name no garment the app knows';
  if (!k.missed?.keys?.length && !k.readRemoved?.keys?.length) return 'nothing was missed on it: a case is a miss';
  const keys = new Set(flatDetails(k.flat, { placements: k.placements || [] }).map(d => d.key)), gone = (k.missed?.keys || []).filter(x => !keys.has(x));
  if (gone.length) return `its flats no longer have ${gone.join(', ')}: save it again from the page`;
  if (k.picture && !/^data:image\/jpeg;base64,/.test(k.picture)) return 'its picture is not a JPEG data URL';
  return null;
}
const keep = k => { const why = checkCase(k); if (why) throw new Error(`${k?.id || 'case'}: ${why}`); mkdirSync(DIR, { recursive: true }); const f = new URL(`${k.id}.json`, DIR); writeFileSync(f, JSON.stringify(k, null, 2) + '\n'); console.log(`✓ ${f.pathname}  (${[...(k.missed?.keys || []), ...(k.readRemoved?.keys || [])].join(', ')})`); };

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--file') for (const f of args.slice(1)) keep(JSON.parse(readFileSync(f, 'utf8')));
    else {
      const base = String(process.env.BASE || '').replace(/\/$/, ''), token = process.env.ADMIN_TOKEN;
      if (!base || !token || !args.length) throw new Error('usage: BASE=https://… ADMIN_TOKEN=… node scripts/trip-case.mjs <concept id> …, or --file <saved case>');
      for (const id of args) { const r = await fetch(`${base}/v1/lab/trip/cases/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } }); const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`${id}: ${j.error || r.status}`); keep(j); }
    }
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
