// The assistant's electronics pass: for an electronic product it fills the electrical facts a factory needs (battery, power, radios,
// environment, firmware) and a first parts list, from the product's description. Certifications, tests and build stages are not asked
// of the model: they come from the rules in elec.js, so they are the same every time and follow from the facts.
import { callJsonSchema } from './studio.js';
import { timed } from './telemetry.js';
import './elec.js';
const E = globalThis.FBElec;

const str = { type: 'string' };
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['specs', 'components', 'notes'],
  properties: {
    specs: { type: 'object', additionalProperties: false, required: E.SPEC_KEYS, properties: Object.fromEntries(E.SPEC_KEYS.map(k => [k, str])) },
    components: { type: 'array', maxItems: 14, items: { type: 'object', additionalProperties: false, required: ['ref', 'part', 'mpn', 'maker', 'qty', 'notes'], properties: { ref: str, part: str, mpn: str, maker: str, qty: str, notes: str } } },
    notes: { type: 'string', description: 'Assumptions made, what the customer must decide, and what needs a test lab or an engineer to confirm' }
  }
};
const SYSTEM = `You are the electronics engineer at Future Basics, a studio that turns a customer's idea into a factory-ready tech pack. Given a product's name and description, fill in the electrical facts a factory needs to quote and build it.
Rules:
- Use typical, conservative values for this kind of product (capacity, voltage, charge time, radio, chip family). Say "TBC" where the answer depends on a choice only the customer can make, rather than guessing.
- "batteryChemistry" and "radios" must always be answered: write "none" when the product has no battery or no radio.
- Never invent a manufacturer part number. Give "mpn" only when you are sure of a real, common part (for example TP4056 for a simple lithium charger); otherwise leave it empty and describe the part in "part" ("Bluetooth LE SoC", "USB-C connector, 16-pin").
- Components: the 6 to 12 parts that matter (main chip, power management or charging IC, battery or cell, connector, sensors, radio module, LED, button, speaker or driver). Reference designators like U1, J1, BT1, SW1.
- Units: millimetres, grams, volts, milliamp-hours, hours. Terse and specific, written for a factory.
- Notes: say what you assumed, what the customer still has to decide, and what a test lab or an engineer must confirm. Do not claim anything is certified.`;

const FIXTURE = {
  specs: { weight: '58 g with battery', enclosure: 'ABS, matte soft-touch', inputPower: 'USB-C, 5 V / 1 A', ratedPower: '5 V / 0.5 A', chargeTime: '1.5 h', runtime: '8 h', standby: '< 50 µA', batteryChemistry: 'Li-ion', batteryCapacity: '1200', batteryVoltage: '3.7', batteryCells: '1S1P pouch cell', batteryCell: 'TBC', batteryProtection: 'PCM: over-charge, over-discharge, short-circuit; NTC', radios: 'Bluetooth LE 5.3', protocol: 'GATT', antenna: 'PCB trace, 2.4 GHz', operatingTemp: '0 to 40 °C', ingress: 'IPX4', drop: '1.2 m onto concrete', lifespan: '500 charge cycles', mcu: 'Bluetooth LE SoC (family TBC)', firmware: 'v0.1, supplied by Future Basics', update: 'USB', serial: 'FB + YYWW + 5 digits', flash: 'Pogo-pin jig, factory builds it' },
  components: [{ ref: 'U1', part: 'Bluetooth LE SoC', mpn: '', maker: '', qty: '1', notes: 'Family to be confirmed with the factory' }, { ref: 'U2', part: 'Lithium charger IC', mpn: 'TP4056', maker: '', qty: '1', notes: '' }, { ref: 'BT1', part: 'Li-ion pouch cell, 1200 mAh', mpn: '', maker: '', qty: '1', notes: 'Cell vendor must supply the UN 38.3 summary' }, { ref: 'J1', part: 'USB-C receptacle, 16-pin', mpn: '', maker: '', qty: '1', notes: '' }],
  notes: 'Assumed a small rechargeable Bluetooth device. The customer decides the battery capacity and the chip; a test lab confirms which certifications apply.'
};

export async function draftElectronics({ title = '', category = '', description = '', fabricSummary = '' } = {}) {
  if (process.env.AI_FIXTURE) return structuredClone(FIXTURE);
  const text = `Product: ${title}\nCategory: ${category}\nDescription: ${description}\nMaterials: ${fabricSummary}`;
  const out = await timed('anthropic', () => callJsonSchema(SYSTEM, [{ type: 'text', text }], SCHEMA, { maxTokens: 2500 }));
  if (!out || typeof out !== 'object' || !out.specs) throw new Error('The electronics draft was not in the expected shape');
  return out;
}

// Merge the draft into a pack: only blank specs are filled (never over what a person typed), the parts list only if empty, and the
// certifications follow from the specs now that they are known. The assumptions go into the notes to the factory.
export function applyElectronicsDraft(pack, draft, { text = '' } = {}) {
  const e = pack.electronics = pack.electronics?.enabled ? pack.electronics : E.defaults(text);
  e.enabled = true;
  for (const k of E.SPEC_KEYS) if (!String(e.specs?.[k] || '').trim() && String(draft?.specs?.[k] || '').trim()) (e.specs ||= {})[k] = String(draft.specs[k]).slice(0, 200);
  if (!(e.components || []).length && Array.isArray(draft?.components)) e.components = draft.components.slice(0, 14).map(r => ({ ref: String(r.ref || '').slice(0, 40), part: String(r.part || '').slice(0, 160), mpn: String(r.mpn || '').slice(0, 80), maker: String(r.maker || '').slice(0, 80), qty: String(r.qty || '').slice(0, 12), notes: String(r.notes || '').slice(0, 300) })).filter(r => r.part || r.mpn);
  const done = (e.certifications || []).filter(c => c.status !== 'needed' || c.lab || c.report || c.notes), keep = new Set(done.map(c => c.name));
  e.certifications = [...done, ...E.certSuggestions(e.specs, text).filter(c => !keep.has(c.name)).map(c => ({ name: c.name, market: c.market, required: true, status: 'needed', lab: '', report: '', notes: '' }))];
  if (draft?.notes) pack.notes = [pack.notes, `ELECTRONICS (assistant draft: typical values, to be confirmed)\n${String(draft.notes).slice(0, 1200)}`].filter(Boolean).join('\n\n').slice(0, 7000);
  return pack;
}
