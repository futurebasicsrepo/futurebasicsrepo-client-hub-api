// Electronic products: what a factory needs on top of a normal tech pack. The words, the rules and the starting rows live here, in one
// plain script that both the server (src/techpack.js) and the page (/elec.js) read, so the editor, the checks and the assistant agree.
//   - specs: the electrical facts, in fixed fields (battery, power, radios, environment, firmware)
//   - components: the electronic parts list (reference designator, part, manufacturer part number, maker)
//   - certifications: what the product must pass to be sold and shipped, suggested from the specs
//   - tests: what is checked on the line and in the lab
//   - stages: EVT, DVT, PVT and mass production, each with what it must prove before the next
(function (root) {
  'use strict';
  const SPEC_GROUPS = [
    { key: 'physical', title: 'Physical', fields: [['weight', 'Weight (g)', '82 g with battery'], ['enclosure', 'Enclosure material and finish', 'ABS, matte soft-touch, PC lens']] },
    { key: 'power', title: 'Power', fields: [['inputPower', 'Input (port, volts, amps)', 'USB-C, 5 V / 2 A'], ['ratedPower', 'Rated power or output', '5 V / 1 A out'], ['chargeTime', 'Charge time', '2 h from empty'], ['runtime', 'Run time on a charge', '8 h at medium volume'], ['standby', 'Standby current', '< 50 µA']] },
    { key: 'battery', title: 'Battery', fields: [['batteryChemistry', 'Chemistry (or "none")', 'Li-ion / LiFePO4 / NiMH / alkaline / none'], ['batteryCapacity', 'Capacity (mAh)', '1200'], ['batteryVoltage', 'Nominal voltage (V)', '3.7'], ['batteryCells', 'Cells and layout', '1S1P, one 18650 cell'], ['batteryCell', 'Cell make and model', 'Samsung INR18650-26J'], ['batteryProtection', 'Protection', 'PCM with over-charge, over-discharge, short-circuit; NTC']] },
    { key: 'connect', title: 'Connectivity', fields: [['radios', 'Radios (or "none")', 'Bluetooth LE 5.3 / Wi-Fi / NFC / none'], ['protocol', 'Protocols and profiles', 'A2DP, HFP, GATT'], ['antenna', 'Antenna', 'PCB trace, 2.4 GHz']] },
    { key: 'environment', title: 'Environment', fields: [['operatingTemp', 'Operating temperature', '0 to 40 °C'], ['ingress', 'Water and dust rating', 'IPX4'], ['drop', 'Drop requirement', '1.2 m onto concrete'], ['lifespan', 'Design life', '500 charge cycles']] },
    { key: 'firmware', title: 'Firmware', fields: [['mcu', 'Main chip', 'Nordic nRF52832'], ['firmware', 'Firmware version and source', 'v1.0.3, supplied by Future Basics'], ['update', 'Update method', 'OTA over BLE / USB / none'], ['serial', 'Serial number and MAC scheme', 'FB + YYWW + 5 digits, printed on the label'], ['flash', 'Flashing and test jig', 'Pogo-pin jig, factory builds and owns it']] }
  ];
  const SPEC_KEYS = SPEC_GROUPS.flatMap(g => g.fields.map(f => f[0]));
  const CERT_STATUS = ['needed', 'testing', 'passed', 'not required'];
  const STAGE_NAMES = ['EVT', 'DVT', 'PVT', 'MP'];
  const STAGE_STATUS = ['planned', 'building', 'passed'];

  // Words that say a product has electronics in it. Strict on purpose: a hoodie with a "smart" fit is not electronic.
  const ELECTRONIC = /\b(electronics?|electronic|battery|batteries|rechargeable|charger|charging|power ?bank|magsafe|speaker|soundbar|headphones?|earbuds?|earphones?|tws|bluetooth|wireless|wi-?fi|usb|led (strip|light|lamp)|lamp|light[- ]?up|smart ?(watch|ring|band|home|plug|bulb|speaker|glasses|tag|lock|scale|display)|sensor|pcba?|circuit|gadget|wearable|fitness tracker|tracker|airtag|beacon|camera|webcam|dash ?cam|drone|keyboard|mouse(?! ?pad)|microphone|dongle|e-?bike|e-?scooter|hair ?dryer|trimmer|shaver|electric toothbrush|massager|humidifier|projector|game controller|controller|joystick|robot|remote control|rc car|e-?ink|power supply|adapter|power strip|extension cord|thermostat|alarm|doorbell|vape|walkie|radio)\b/i;
  // A case, strap, stand or sleeve for an electronic thing, or a garment that merely has a word like "sensor" in its name, is not electronic, unless it says it has a battery, a cable or a light.
  const ACCESSORY = /\b(bag|case|cover|sleeve|strap|pouch|holder|mount|stand|skin|protector|sticker|backpack|tote|lanyard|pad|tees?|t-?shirts?|shirts?|hoodies?|sweatshirts?|jackets?|coats?|pants?|shorts|dress(es)?|socks?|beanies?|caps?|hats?|gloves?|shoes?|sneakers?|boots?|towels?|blankets?|plush)\b/i;
  const STRONG = /\b(battery|batteries|rechargeable|usb|bluetooth|wireless charg\w*|led|powered|electronic|circuit|pcba?)\b/i;
  const isElectronics = (...texts) => { const t = texts.filter(Boolean).join(' '); return ELECTRONIC.test(t) && (!ACCESSORY.test(t) || STRONG.test(t)); };

  const has = (v, re) => re.test(String(v || ''));
  // The facts the certification rules read from the specs.
  function facts(specs = {}, text = '') {
    const all = `${text} ${Object.values(specs).join(' ')}`;
    const chem = String(specs.batteryChemistry || '');
    const radios = String(specs.radios || '');
    return {
      radio: has(radios, /\b(bluetooth|ble|bt\b|wi-?fi|nfc|lte|4g|5g|zigbee|thread|lora|rf\b|uwb|gps|gnss|wireless|2\.4 ?g|sub-?ghz)\b/i) || (!radios && has(text, /\b(bluetooth|wi-?fi|wireless|nfc|tws)\b/i)),
      bluetooth: has(radios, /\b(bluetooth|ble|bt\b)\b/i) || (!radios && has(text, /bluetooth/i)),
      battery: Boolean(chem) && !has(chem, /^\s*(none|no|n\/a|nil|-)\s*$/i),
      lithium: has(chem, /\b(li|lithium|lipo|li-?ion|li-?po|lifepo4|18650|21700)\b/i) || (!chem && has(text, /\b(power ?bank|rechargeable|lithium|li-?ion)\b/i)),
      mains: has(specs.inputPower, /\b(ac|mains|100[-–]240|110|120|220|230|240) ?v\b|wall (adapter|plug)|plug\b|mains/i) || has(text, /\b(mains|wall adapter|power supply|extension cord|power strip)\b/i),
      usb: has(specs.inputPower, /usb|type-?c|lightning/i) || has(text, /\b(usb|type-?c|magsafe|power ?bank|charger)\b/i),
      ip: /^\s*ip[0-9x]{2}/i.test(String(specs.ingress || '')) ? String(specs.ingress).trim().toUpperCase().slice(0, 6) : '',
      all
    };
  }
  // Certifications the specs point to: [{ name, market, why }]. Not advice from a lab: a starting list for the person who books the testing.
  function certSuggestions(specs = {}, text = '') {
    const f = facts(specs, text), out = [], add = (name, market, why) => { if (!out.some(x => x.name === name)) out.push({ name, market, why }); };
    add('RoHS (2011/65/EU and 2015/863)', 'EU, UK', 'Every electronic product: limits on lead, mercury, cadmium and other substances.');
    add('REACH SVHC declaration', 'EU', 'Every product: a statement on substances of very high concern.');
    add('WEEE marking and registration', 'EU', 'Electronics are sold with the crossed-out bin mark and a producer registration.');
    if (f.radio) {
      add('CE-RED (2014/53/EU)', 'EU', 'It has a radio: the Radio Equipment Directive covers safety, EMC and the radio together.');
      add('FCC Part 15C (with FCC ID)', 'US', 'It has a radio: an intentional radiator needs a lab report and an FCC ID.');
      add('ISED (IC) radio certification', 'Canada', 'It has a radio: needed to sell in Canada.');
      add('UKCA radio equipment', 'UK', 'It has a radio: the UK mark for radio equipment.');
      if (f.bluetooth) add('Bluetooth SIG listing (Declaration ID)', 'All markets', 'It uses Bluetooth: the name and logo need a paid listing.');
      add('SRRC radio type approval', 'China', 'Only if it will be sold in mainland China.');
    } else {
      add('CE-EMC (2014/30/EU)', 'EU', 'No radio: electromagnetic compatibility is the main CE test.');
      add('FCC Part 15B', 'US', 'No radio: an unintentional radiator still needs an FCC supplier declaration or test.');
    }
    if (f.lithium) {
      add('UN 38.3 transport test summary', 'Worldwide shipping', 'It has a lithium battery: air, sea and road carriers will not move it without the test summary.');
      add('IEC 62133-2 battery safety', 'EU, US, Asia', 'It has a lithium battery: the cell and pack safety standard buyers and platforms ask for.');
      add('Battery watt-hour label and dangerous goods declaration', 'Worldwide shipping', 'Lithium batteries ship as UN3481 (packed with equipment) or UN3091 (inside); the Wh figure goes on the label.');
      add('EU Battery Regulation (2023/1542) marking', 'EU', 'Batteries carry capacity and collection markings; replaceable-battery rules apply from 2027.');
    } else if (f.battery) {
      add('Battery safety and marking', 'EU, US', 'Non-lithium batteries still need the chemistry and collection markings.');
    }
    if (f.mains) {
      add('CE-LVD (2014/35/EU)', 'EU', 'It runs from mains power: the Low Voltage Directive applies.');
      add('UL or ETL listing', 'US, Canada', 'It runs from mains power: US retailers expect a recognised safety listing.');
      add('IEC 62368-1 safety', 'EU, US, Asia', 'Audio, video and IT equipment on mains power.');
      add('External power supply efficiency (DOE VI / ErP)', 'US, EU', 'A wall adapter has to meet efficiency and no-load limits.');
    } else if (f.usb) {
      add('IEC 62368-1 safety', 'EU, US, Asia', 'It charges or runs from USB: the audio, video and IT safety standard.');
    }
    if (f.ip) add(`IEC 60529 ingress test (${f.ip})`, 'All markets', `It claims ${f.ip}: the claim has to be tested, not assumed.`);
    return out;
  }

  const STAGES = [
    { stage: 'EVT', qty: '5 to 20', goal: 'Prove the design works: it powers up, every function runs, the radio connects, the firmware boots.', exit: 'Every function works on the bench; no safety problem; parts list frozen for DVT.', status: 'planned' },
    { stage: 'DVT', qty: '50 to 200', goal: 'Prove it can be built and can pass: final enclosure and parts, pre-scan for radio and EMC, reliability tests, certification samples sent.', exit: 'Passes the reliability and drop tests; certification samples with the lab; yield and cycle time measured.', status: 'planned' },
    { stage: 'PVT', qty: '200 to 1000', goal: 'Prove the production line: production tooling, test jigs, operators, packaging and shipping.', exit: 'First-pass yield on target; golden sample approved in writing; packaging passes drop test.', status: 'planned' },
    { stage: 'MP', qty: 'Order quantity', goal: 'Build to the approved golden sample and the tested process.', exit: 'Every unit functionally tested; cosmetics to AQL; shipping marks and documents correct.', status: 'planned' }
  ];
  const TESTS = [
    { name: 'Functional test, every unit', method: 'Test jig: power on, buttons, ports, radio, firmware version, battery gauge. Result logged against the serial number.', accept: 'All checks pass; the log is kept.', stage: 'All' },
    { name: 'Charge and discharge cycles', method: 'Full charge and discharge at room temperature, repeated.', accept: 'At least 80% of rated capacity after 300 cycles.', stage: 'DVT' },
    { name: 'Burn-in', method: '4 hours at rated load, 40 °C.', accept: 'No failures; case temperature under the limit.', stage: 'DVT, PVT' },
    { name: 'Drop test', method: '1.2 m onto concrete, all six faces.', accept: 'Still works; no cracks; battery stays secure.', stage: 'DVT' },
    { name: 'Electrostatic discharge', method: 'IEC 61000-4-2, 4 kV contact and 8 kV air.', accept: 'No damage; any reset recovers by itself.', stage: 'DVT' },
    { name: 'Cosmetic inspection', method: 'Against the approved golden sample, under daylight lamps.', accept: 'AQL 0.65 critical, 1.0 major, 2.5 minor.', stage: 'MP' },
    { name: 'Packed carton drop', method: 'ISTA 1A.', accept: 'No damage to the product or the box.', stage: 'PVT' }
  ];
  // What an electronic product is made of, as a starting materials list; the electronic parts themselves go in the components table.
  const BOM = [
    ['Enclosure', 'Injection-moulded plastic', 'Material, wall thickness, finish and tooling per the drawings', 'Housing'],
    ['Main board (PCBA)', 'FR-4, 1.0 mm', 'Layers, finish and the electronic parts listed in the components table', 'Inside'],
    ['Battery', '', 'Chemistry, capacity and protection per the Battery fields', 'Inside, secured'],
    ['Charging port', '', 'Connector type and rating per the Power fields', 'Housing edge'],
    ['Button or switch', '', 'Travel, force and life cycles', 'Housing'],
    ['Seal or gasket', '', 'Needed only if a water or dust rating is claimed', 'Housing seam'],
    ['Rating label', 'Printed label', 'Model, ratings, certification marks, serial number, country of origin', 'Underside'],
    ['Retail box and insert', 'Paperboard', 'Size, print and what is inside the box (cable, manual)', 'Packaging']
  ].map(([component, material, spec, placement]) => ({ component, material, spec, supplier: '', ref: '', color: '', placement, qty: '1', unit: 'pc', notes: '' }));
  const POM = [
    ['A', 'Overall length', 'Longest edge of the product, with no cable', '±0.04'],
    ['B', 'Overall width', 'Widest point at right angles to the length', '±0.04'],
    ['C', 'Thickness', 'Thickest point, buttons and feet included', '±0.02'],
    ['D', 'Cable length', 'Connector tip to connector tip, if a cable comes with it', '±0.4']
  ];

  const defaults = (text = '') => ({
    enabled: true, specs: {}, components: [],
    certifications: certSuggestions({}, text).map(c => ({ name: c.name, market: c.market, required: true, status: 'needed', lab: '', report: '', notes: '' })),
    tests: TESTS.map(t => ({ ...t })), stages: STAGES.map(s => ({ ...s }))
  });

  // What the pack still lacks before a factory can quote or build it. Each is a short phrase for the list shown to the person editing.
  function missing(e) {
    if (!e || !e.enabled) return [];
    const s = e.specs || {}, f = facts(s), out = [];
    if (!String(s.batteryChemistry || '').trim()) out.push('Battery chemistry (write "none" if there is no battery)');
    else if (f.lithium && (!String(s.batteryCapacity || '').trim() || !String(s.batteryVoltage || '').trim())) out.push('Battery capacity and voltage');
    if (!String(s.radios || '').trim()) out.push('Radios (write "none" if there are none)');
    if (!String(s.inputPower || '').trim()) out.push('Power input');
    if (!(e.components || []).length) out.push('Electronic components (at least the main chip)');
    if (!(e.certifications || []).length) out.push('Certifications');
    if (!(e.stages || []).length) out.push('Build stages');
    return out;
  }
  // Watt-hours from volts and milliamp-hours, for the dangerous-goods line; null when the numbers are not there.
  function wattHours(specs = {}) {
    const mah = parseFloat(String(specs.batteryCapacity || '').replace(/,/g, '')), v = parseFloat(String(specs.batteryVoltage || '').replace(/,/g, ''));
    return Number.isFinite(mah) && Number.isFinite(v) && mah > 0 && v > 0 ? Math.round(mah * v / 10) / 100 : null;
  }

  const api = { SPEC_GROUPS, SPEC_KEYS, CERT_STATUS, STAGE_NAMES, STAGE_STATUS, ELECTRONIC, isElectronics, certSuggestions, facts, defaults, missing, wattHours, STAGES, TESTS, BOM, POM };
  root.FBElec = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
