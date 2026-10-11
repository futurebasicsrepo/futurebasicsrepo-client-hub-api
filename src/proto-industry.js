// What a high-standard site looks like for each trade. A playbook is what the rebuild is held to: the sections a visitor in that trade expects, the proof
// that earns their trust, the one interactive feature that makes the site feel like Future Basics' work and not a template, and how it should move.
// Plain data and two plain functions (test/proto.test.js).

// Features that are in every prototype, whatever the trade.
export const SIGNATURE_COMMON = [
  { id: 'hero-motion', title: 'A hero that moves', text: 'An animated hero (CSS or inline SVG: drifting shapes, a drawn line, a slow gradient) with the headline revealing line by line. No video, no libraries.' },
  { id: 'call-bar', title: 'Sticky tap-to-call bar on phones', text: 'A bottom bar on small screens with one big Call button (tel: link) and a secondary Get a quote.' },
  { id: 'reveal', title: 'Scroll reveals', text: 'Sections and cards ease in as they enter the screen (IntersectionObserver), staggered, never blocking the content if scripting is off.' },
  { id: 'count-up', title: 'Numbers that count up', text: 'Years in business, jobs done, response time: count up once when seen (only figures that are on their site, or marked illustrative).' },
  { id: 'magnetic', title: 'Buttons that respond', text: 'Primary buttons lean toward the pointer and press down; a tap-friendly ripple on touch.' }
];

// The one or two interactive pieces that suit a trade. The builder picks from these.
export const FEATURES = {
  'emergency-dispatch': { title: 'Emergency dispatch panel', text: 'A pulsing "We are answering now" panel that reads the business hours and says Open now / After hours (we still answer emergencies) with a giant Call button.' },
  'problem-picker': { title: 'What is wrong? picker', text: 'Big tappable cards (for example "Leak", "No hot water", "Clogged drain"): choosing one shows what usually causes it, how fast it is fixed, and a Call or Request button that already names the problem.' },
  'service-area-checker': { title: 'Do you serve me? checker', text: 'A town or ZIP box: it answers instantly from the list of towns the business serves, with chips for each.' },
  'instant-estimate': { title: 'Instant estimate range', text: 'A few taps (job type, size, urgency) show a ballpark range, clearly marked as a rough guide, then a request for an exact quote. Ranges are illustrative.' },
  'before-after': { title: 'Before and after slider', text: 'A draggable comparison of two images (their photos if they have them, otherwise a drawn illustration), keyboard operable.' },
  'maintenance-planner': { title: 'Seasonal maintenance planner', text: 'Pick the season and the home: get a short checklist with a one-tap request for a visit.' },
  'financing-calc': { title: 'Monthly payment calculator', text: 'A slider for the job cost and term that shows a monthly figure, marked illustrative, for big-ticket work.' },
  'care-needs-quiz': { title: 'Care needs quiz', text: 'Four gentle questions (who needs care, what help, how often, when to start) end in a suggested care plan and a "Talk to a care coordinator" request. It collects no health details.' },
  'project-gallery': { title: 'Project gallery with lightbox', text: 'A masonry gallery of their work (their pictures if they have any, otherwise drawn illustrations) with a keyboard-friendly lightbox.' },
  'roof-visualizer': { title: 'Roof colour visualizer', text: 'Swatches that recolour an inline SVG house in real time.' },
  'paint-visualizer': { title: 'Colour visualizer', text: 'Swatches that recolour an inline SVG room in real time.' },
  'cleaning-checklist': { title: 'Build your clean', text: 'Tick rooms and extras to build a visit; the total time and a starting price update live (illustrative).' }
};

export const INDUSTRIES = [
  { key: 'plumbing', label: 'Plumbing', schema: 'Plumber', words: ['plumb', 'drain', 'sewer', 'water heater', 'pipe', 'leak', 'rooter'], accent: ['#0b5fff', '#00c2ff'], features: ['emergency-dispatch', 'problem-picker', 'service-area-checker'],
    audience: 'Homeowners with a problem right now, usually on a phone, often stressed.', tone: 'Calm, fast, plain-spoken. Reassuring, never salesy.', cta: ['Call now', 'Request service'],
    sections: ['Hero with the phone number and an emergency promise', 'Trust strip (licensed, insured, years, rating)', 'Services as large cards with what is included', 'Problem picker', 'How it works in three steps (call, arrive, fixed right)', 'Why us (upfront pricing, on-time, clean)', 'Reviews', 'Service area', 'FAQ (cost, same day, warranty)', 'Final call to action and contact form'],
    services: ['Emergency plumbing', 'Drain cleaning', 'Water heaters', 'Leak detection and repair', 'Sewer line repair', 'Fixture installation', 'Repiping'], faqs: ['Do you offer same-day or emergency service?', 'How much does a plumber cost?', 'Are you licensed and insured?', 'Do you guarantee your work?'] },
  { key: 'electrician', label: 'Electrician', schema: 'Electrician', words: ['electric', 'wiring', 'panel upgrade', 'rewire', 'circuit', 'generator', 'ev charger', 'lighting'], accent: ['#ffb400', '#ff6a00'], features: ['emergency-dispatch', 'problem-picker', 'instant-estimate'],
    audience: 'Homeowners and small businesses who need safe, code-compliant work and a straight price.', tone: 'Confident and safety-first. Precise.', cta: ['Call an electrician', 'Get a free quote'],
    sections: ['Hero with phone and licence number', 'Trust strip', 'Services as cards (panel upgrades, EV chargers, lighting, generators, troubleshooting)', 'Problem picker (breaker keeps tripping, flickering lights, no power)', 'Safety promise', 'Process', 'Projects', 'Reviews', 'Service area', 'FAQ', 'Quote form'],
    services: ['Troubleshooting and repair', 'Panel upgrades', 'EV charger installation', 'Lighting', 'Whole-home generators', 'Rewiring', 'Smoke and CO detectors'], faqs: ['Is your work permitted and inspected?', 'Why does my breaker keep tripping?', 'Do you handle emergencies?', 'How much does a panel upgrade cost?'] },
  { key: 'hvac', label: 'HVAC (heating and cooling)', schema: 'HVACBusiness', words: ['hvac', 'heating', 'cooling', 'air conditioning', 'furnace', 'boiler', 'heat pump', 'ductwork'], accent: ['#ff4d2e', '#2e9bff'], features: ['emergency-dispatch', 'maintenance-planner', 'financing-calc'],
    audience: 'Homeowners whose heat or air has failed, or who are planning a replacement.', tone: 'Comforting and practical, with clear seasonal urgency.', cta: ['Call for service', 'Book a tune-up'],
    sections: ['Hero with seasonal message', 'Trust strip', 'Services (repair, install, maintenance plans)', 'Maintenance planner', 'Financing', 'Process', 'Brands serviced', 'Reviews', 'Service area', 'FAQ', 'Request form'],
    services: ['Heating repair', 'AC repair', 'New system installation', 'Maintenance plans', 'Heat pumps', 'Duct cleaning and repair', 'Indoor air quality'], faqs: ['How do I know whether to repair or replace?', 'Do you offer financing?', 'How often should I service my system?', 'Do you work on all brands?'] },
  { key: 'roofing', label: 'Roofing', schema: 'RoofingContractor', words: ['roof', 'shingle', 'gutter', 'siding', 'storm damage', 'soffit'], accent: ['#c1272d', '#1f2a44'], features: ['roof-visualizer', 'before-after', 'instant-estimate'],
    audience: 'Homeowners after a storm or a leak, comparing a few contractors.', tone: 'Solid and trustworthy, proof-heavy.', cta: ['Get a free inspection', 'Call us'],
    sections: ['Hero with free inspection offer', 'Trust strip (licensed, insured, warranties, manufacturer certifications)', 'Services', 'Before and after', 'Roof colour visualizer', 'Process (inspection, estimate, install, cleanup)', 'Insurance claim help', 'Reviews', 'Service area', 'FAQ', 'Inspection form'],
    services: ['Roof replacement', 'Roof repair', 'Storm damage', 'Gutters', 'Siding', 'Free roof inspections'], faqs: ['Do you help with insurance claims?', 'How long does a roof replacement take?', 'What warranties do you offer?', 'Do you offer free inspections?'] },
  { key: 'carpentry', label: 'Carpentry, remodeling and general contracting', schema: 'HomeAndConstructionBusiness', words: ['carpent', 'remodel', 'renovat', 'contractor', 'deck', 'cabinet', 'custom woodwork', 'framing', 'finish carpentry', 'handyman'], accent: ['#8a5a2b', '#2b2b2b'], features: ['project-gallery', 'before-after', 'instant-estimate'],
    audience: 'Homeowners planning a project who need to trust the craftsperson.', tone: 'Craft-proud and straightforward.', cta: ['Start your project', 'Call us'],
    sections: ['Hero with a signature project', 'Trust strip', 'What we build', 'Project gallery', 'Before and after', 'Process (visit, design, quote, build)', 'About the owner', 'Reviews', 'Service area', 'FAQ', 'Project request form'],
    services: ['Kitchen remodeling', 'Bathroom remodeling', 'Decks and porches', 'Custom cabinetry', 'Finish carpentry', 'Repairs and handyman work'], faqs: ['Are you licensed and insured?', 'How do you price a project?', 'How long will my project take?', 'Do you handle permits?'] },
  { key: 'home-health', label: 'Home health care and senior care', schema: 'MedicalBusiness', words: ['home health', 'home care', 'caregiver', 'senior care', 'nursing', 'elder care', 'personal care', 'companion', 'hospice', 'respite', 'dementia', 'alzheimer'], accent: ['#1f8a70', '#f2b950'], features: ['care-needs-quiz', 'service-area-checker', 'emergency-dispatch'],
    audience: 'Adult children and families, often worried and short of time, choosing care for someone they love. Also caregivers looking for work.', tone: 'Warm, human, unhurried, dignified. Plain words, no jargon, no fear tactics.', cta: ['Talk to a care coordinator', 'Call us'],
    sections: ['Hero with a human promise and the phone number', 'Trust strip (licensed, background-checked, insured, years)', 'Care services as gentle cards', 'Care needs quiz', 'How getting started works (call, free assessment, care plan, caregiver match)', 'Caregiver stories', 'Who we serve (areas)', 'Join our team (caregiver recruiting)', 'FAQ (cost, insurance, Medicaid, schedules)', 'Contact form'],
    services: ['Personal care', 'Companion care', 'Dementia and memory care', 'Respite care', 'Post-hospital care', 'Live-in and overnight care'], faqs: ['How much does home care cost?', 'Do you accept long-term care insurance or Medicaid?', 'Are your caregivers background-checked?', 'Can we change caregivers if it is not a fit?'],
    notes: 'Never ask for health details in a form. Do not invent licence numbers or certifications.' },
  { key: 'landscaping', label: 'Landscaping and lawn care', schema: 'HomeAndConstructionBusiness', words: ['landscap', 'lawn', 'mowing', 'tree service', 'tree removal', 'irrigation', 'hardscape', 'snow removal', 'mulch'], accent: ['#2f9e44', '#f08c00'], features: ['maintenance-planner', 'project-gallery', 'instant-estimate'],
    audience: 'Homeowners who want a yard to be proud of without the work.', tone: 'Fresh and friendly.', cta: ['Get a free estimate', 'Call us'],
    sections: ['Hero', 'Trust strip', 'Services by season', 'Seasonal planner', 'Project gallery', 'Process', 'Reviews', 'Service area', 'FAQ', 'Estimate form'],
    services: ['Lawn maintenance', 'Landscape design', 'Tree service', 'Irrigation', 'Hardscapes and patios', 'Seasonal cleanups', 'Snow removal'], faqs: ['Do you offer recurring service?', 'How do you price a yard?', 'Are you insured?', 'Do you do snow removal?'] },
  { key: 'painting', label: 'Painting', schema: 'HomeAndConstructionBusiness', words: ['paint', 'drywall', 'staining', 'pressure wash', 'wallpaper'], accent: ['#7c3aed', '#f43f5e'], features: ['paint-visualizer', 'before-after', 'instant-estimate'],
    audience: 'Homeowners and landlords who want it done neatly and on time.', tone: 'Clean, bright, detail-oriented.', cta: ['Get a free estimate', 'Call us'],
    sections: ['Hero', 'Trust strip', 'Services (interior, exterior, cabinets, commercial)', 'Colour visualizer', 'Before and after', 'Process', 'Reviews', 'Service area', 'FAQ', 'Estimate form'],
    services: ['Interior painting', 'Exterior painting', 'Cabinet refinishing', 'Drywall repair', 'Deck staining', 'Commercial painting'], faqs: ['How long does a paint job take?', 'Do you move furniture?', 'What paint do you use?', 'Do you offer a warranty?'] },
  { key: 'cleaning', label: 'Cleaning services', schema: 'HomeAndConstructionBusiness', words: ['cleaning', 'maid', 'janitorial', 'carpet clean', 'window clean', 'pressure wash', 'junk removal'], accent: ['#06b6d4', '#a3e635'], features: ['cleaning-checklist', 'service-area-checker', 'before-after'],
    audience: 'Busy households and small offices.', tone: 'Bright, trustworthy, effortless.', cta: ['Book a clean', 'Call us'],
    sections: ['Hero', 'Trust strip', 'Services', 'Build your clean', 'Process', 'Reviews', 'Service area', 'FAQ', 'Booking form'],
    services: ['Regular house cleaning', 'Deep cleaning', 'Move-in and move-out', 'Office cleaning', 'Carpet cleaning', 'Windows'], faqs: ['Do I need to be home?', 'Do you bring supplies?', 'Are your cleaners insured?', 'What if I am not happy?'] },
  { key: 'trade', label: 'Other trade or home service', schema: 'LocalBusiness', words: [], accent: ['#2563eb', '#f59e0b'], features: ['problem-picker', 'service-area-checker', 'instant-estimate'],
    audience: 'Local customers who need the job done and want to trust who they call.', tone: 'Friendly, direct and professional.', cta: ['Call now', 'Get a free quote'],
    sections: ['Hero with the phone number', 'Trust strip', 'Services', 'How it works', 'Why us', 'Reviews', 'Service area', 'FAQ', 'Contact form'],
    services: ['Our services'], faqs: ['Are you licensed and insured?', 'Do you offer free estimates?', 'What areas do you serve?', 'How quickly can you start?'] }
];

export const industryByKey = key => INDUSTRIES.find(i => i.key === key) || INDUSTRIES.find(i => i.key === 'trade');

// Which trade is this? An override from the rep wins; otherwise the words the site uses, with the title and domain counted double.
export function detectIndustry(facts, override = '') {
  if (override && INDUSTRIES.some(i => i.key === override)) return { key: override, confidence: 1, from: 'chosen' };
  const hay = `${facts.title} ${facts.host || ''} ${facts.h1?.join(' ')} ${facts.description}`.toLowerCase(), body = `${facts.text || ''} ${facts.extraText || ''} ${(facts.services || []).join(' ')} ${(facts.h2 || []).join(' ')}`.toLowerCase();
  const scores = INDUSTRIES.filter(i => i.words.length).map(i => ({ key: i.key, score: i.words.reduce((a, w) => a + (hay.includes(w) ? 3 : 0) + Math.min(4, body.split(w).length - 1), 0) })).sort((a, b) => b.score - a.score);
  const best = scores[0]; if (!best || best.score < 3) return { key: 'trade', confidence: 0.3, from: 'default' };
  const second = scores[1]?.score || 0; return { key: best.key, confidence: Math.min(0.95, 0.5 + (best.score - second) / (best.score + 4)), from: 'words' };
}
