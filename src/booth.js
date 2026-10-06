// Fair notes: a factory met at a booth, captured in under a minute on a phone. The rules here are shared by the server and tested on their own.
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const MAKES = ['Apparel', 'Footwear', 'Bags', 'Accessories', 'Electronics', 'Packaging', 'Printing', 'Other'];
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// → { p } clean, or { error }. Only the company is required: at a booth there is no time for more, and a card is often only a WeChat QR.
export function cleanPartner(b = {}) {
  const company = clip(b.company, 160); if (!company) return { error: 'Enter the company name' };
  const email = clip(b.email, 254).toLowerCase() || null; if (email && !emailOk(email)) return { error: 'Check the email address' };
  let rating = b.rating === '' || b.rating == null ? null : Math.round(Number(b.rating)); if (rating != null && !(rating >= 1 && rating <= 5)) rating = null;
  const makes = [...new Set((Array.isArray(b.makes) ? b.makes : String(b.makes || '').split(',')).map(x => clip(x, 40)).filter(Boolean))].slice(0, 12).join(', ') || null;
  let website = clip(b.website, 200) || null; if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website.replace(/^\/+/, '');
  return { p: { company, contactName: clip(b.contactName, 140) || null, jobTitle: clip(b.jobTitle, 100) || null, email, wechat: clip(b.wechat, 80) || null, phone: clip(b.phone, 60) || null,
    city: clip(b.city, 80) || null, website, makes, moqNote: clip(b.moqNote, 300) || null, rating, notes: clip(b.notes, 2000) || null, source: clip(b.source, 60) || null,
    lang: ['en', 'zh', 'zh-hk'].includes(b.lang) ? b.lang : 'en' } };
}

// What a business card photo is asked for. Nothing is stored from the photo; only what staff confirm and save.
export const CARD_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['company', 'contactName', 'jobTitle', 'email', 'phone', 'wechat', 'city', 'website', 'makes', 'language'],
  properties: {
    company: { type: 'string', description: 'The company name, in English if the card gives one, else as printed' }, contactName: { type: 'string', description: 'The person\'s name as printed (the English name if both are given)' },
    jobTitle: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string', description: 'The mobile or main phone, with the country code if printed' },
    wechat: { type: 'string', description: 'A WeChat ID if the card prints one; empty if there is only a QR code' }, city: { type: 'string', description: 'The city of the factory or office' },
    website: { type: 'string' }, makes: { type: 'string', description: 'What the company makes if the card says (e.g. "sneakers, EVA soles"), else empty' }, language: { type: 'string', enum: ['en', 'zh', 'zh-hk'], description: 'The language the card is mainly in: en, zh (Simplified Chinese) or zh-hk (Traditional Chinese)' }
  }
};
export const CARD_SYSTEM = `You read a photo of a business card handed over at a trade fair, often from a Chinese factory, and copy its printed details into fields.
Copy exactly what is printed. Never guess or invent a field the card does not show: leave it empty. Cards are bilingual (Chinese and English): give the English company and person name when both are printed. Keep phone numbers as printed, with the country code if shown. A QR code is not a WeChat ID.`;
export const FIXTURE_CARD = { company: 'Fixture Mill Co., Ltd', contactName: 'Li Wei', jobTitle: 'Sales Manager', email: 'li.wei@fixturemill.cn', phone: '+86 20 8888 1234', wechat: 'liwei_fx', city: 'Guangzhou', website: 'www.fixturemill.cn', makes: 'sneakers, EVA soles', language: 'zh' };
