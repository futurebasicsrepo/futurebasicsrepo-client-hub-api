// Follow-up emails for self-serve clients who started a tech pack from a photo at /start.
// Two tracks, both decided here as pure functions so the sweep in server.js only reads rows and sends:
//  - free track: day 1, 3, 6, 10, 16 after the first photo pack, until the client converts (pays, submits,
//    gets a quote, messages us, joins the membership) or unsubscribes.
//  - paid track: a "what happens next" note after the first paid pack, and a membership pitch after the second.
import { createHmac, timingSafeEqual } from 'node:crypto';

const HOUR = 36e5;
export const FREE_STEPS = [
  { key: 'd1', afterHours: 24 },
  { key: 'd3', afterHours: 72 },
  { key: 'd6', afterHours: 144 },
  { key: 'd10', afterHours: 240 },
  { key: 'd16', afterHours: 384 }
];
export const MIN_GAP_HOURS = 20;          // never two follow-ups to one person inside this window
const FREE_TRACK_ENDS_HOURS = 384 + 7 * 24; // a sweep that was down for a week does not send day 16 a week late

const sentKeys = sends => new Set((sends || []).map(s => s.step));
const lastSentAt = sends => (sends || []).filter(s => s.status !== 'skipped').reduce((a, s) => Math.max(a, new Date(s.at || s.sent_at).getTime() || 0), 0);

// Which free-track email is due now. Returns { key, skip } or null; `skip` lists earlier steps that came due while the
// sweep was not running, so they are recorded and never sent late. Only the latest due step is sent.
export function nextFreeStep({ anchorAt, sends = [], now = new Date(), converted = false }) {
  if (converted || !anchorAt) return null;
  const t0 = new Date(anchorAt).getTime(), t = new Date(now).getTime();
  if (t - t0 > FREE_TRACK_ENDS_HOURS * HOUR) return null;
  if (t - lastSentAt(sends) < MIN_GAP_HOURS * HOUR) return null;
  const done = sentKeys(sends);
  const due = FREE_STEPS.filter(s => !done.has(s.key) && t >= t0 + s.afterHours * HOUR);
  if (!due.length) return null;
  const pick = due[due.length - 1];
  return { key: pick.key, skip: due.slice(0, -1).map(s => s.key) };
}

// Paid track. `paid_howto` 30 minutes after the first payment (within a week); `membership_pitch` an hour after the
// second paid pack (within two weeks) for anyone not already a member.
export function nextPaidStep({ firstPaidAt, secondPaidAt, member = false, sends = [], now = new Date() }) {
  const done = sentKeys(sends), t = new Date(now).getTime();
  if (t - lastSentAt(sends) < MIN_GAP_HOURS * HOUR) return null;
  const within = (at, minH, maxH) => at && t - new Date(at).getTime() >= minH * HOUR && t - new Date(at).getTime() <= maxH * HOUR;
  if (!done.has('membership_pitch') && !member && within(secondPaidAt, 1, 14 * 24)) return { key: 'membership_pitch', skip: done.has('paid_howto') ? [] : ['paid_howto'] };
  if (!done.has('paid_howto') && within(firstPaidAt, 0.5, 7 * 24)) return { key: 'paid_howto', skip: [] };
  return null;
}

// Past work shown in the day-6 email, matched to what the client uploaded. Configured as JSON (NURTURE_CASE_STUDIES):
// [{ "keywords": ["hoodie","crewneck"], "title": "...", "summary": "...", "image": "https://...", "link": "https://..." }]
export function parseCaseStudies(raw) {
  try { const list = JSON.parse(raw || '[]'); return Array.isArray(list) ? list.filter(c => c && c.title && c.summary) : []; } catch { return []; }
}
export function pickCaseStudy(productTitle, studies = []) {
  const words = String(productTitle || '').toLowerCase();
  return studies.find(c => (c.keywords || []).some(k => k && words.includes(String(k).toLowerCase()))) || studies.find(c => c.default) || null;
}

export function unsubscribeToken(clientId, secret) {
  return createHmac('sha256', String(secret)).update(`unsubscribe:${clientId}`).digest('base64url').slice(0, 32);
}
export function validUnsubscribeToken(clientId, token, secret) {
  const want = Buffer.from(unsubscribeToken(clientId, secret)), got = Buffer.from(String(token || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const button = (href, label) => `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#141416;color:#fff;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;
const hi = first => `<p>Hi${first ? ' ' + esc(first) : ''},</p>`;

export function marketingFooter({ unsubscribeUrl, address }) {
  return `<p style="margin-top:28px;font-size:12px;color:#717177">You're getting this because you started a tech pack at Future Basics. <a href="${esc(unsubscribeUrl)}" style="color:#717177">Unsubscribe from these emails</a>.${address ? `<br>${esc(address)}` : ''}</p>`;
}

// The copy for each step. Returns { subject, title, html, plain } — `plain` emails skip the branded header so they
// read like a personal note. ctx: { first, productTitle, packLink, startLink, packDollars, membershipUrl, caseStudy, signer }
export function nurtureEmail(key, ctx) {
  const product = esc(ctx.productTitle || 'your product'), pack = ctx.packLink;
  const memberLine = ctx.membershipUrl ? `, or <strong>$100 a month</strong> for unlimited packs, versions and factory links (the studio membership)` : '';
  switch (key) {
    case 'd1': return {
      subject: 'How a factory reads your tech pack', title: 'How a factory reads your tech pack',
      html: `${hi(ctx.first)}<p>Your <strong>${product}</strong> pack is saved. Before it goes anywhere near a factory, here's what they look at first:</p>
<ol><li><strong>Points of measure.</strong> If the chest width or length is off, the sample is off.</li><li><strong>Materials.</strong> Fabric weight and composition decide the price.</li><li><strong>Callouts.</strong> Every detail you pin to the sketch is something the factory has to sign off.</li></ol>
<p>Three callouts take two minutes and save one round of samples.</p>${button(pack, 'Open your tech pack')}`
    };
    case 'd3': return {
      subject: 'Your next tech pack', title: 'Your next one',
      html: `${hi(ctx.first)}<p>Your first pack was on us. If you have more styles to make, the next one is <strong>$${esc(ctx.packDollars)} a pack</strong>${memberLine}.</p>
${ctx.membershipUrl ? '<p>Most brands making a capsule of four or more styles go monthly.</p>' : ''}${button(ctx.startLink, 'Start another pack')}
<p style="color:#717177;font-size:13px">Still working on ${product}? <a href="${esc(pack)}">Pick up where you left off</a>.</p>`
    };
    case 'd6': {
      const c = ctx.caseStudy;
      const story = c ? `<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#717177;margin-top:20px">${esc(c.title)}</p>${c.image ? `<p><img src="${esc(c.image)}" alt="" style="max-width:100%;border-radius:8px"></p>` : ''}<p>${esc(c.summary)}</p>${c.link ? `<p><a href="${esc(c.link)}">See the project</a></p>` : ''}`
        : `<p>Every run we make starts the same way yours did: a reference, a tech pack, then a sample you approve before a single unit is cut. From there it's 50 pieces and up for apparel, with you signing off at each step in the same room your pack lives in.</p>`;
      return {
        subject: c ? `From a screenshot to a real run: ${c.title}` : 'From a screenshot to a real run', title: 'From a screenshot to a real run',
        html: `${hi(ctx.first)}${story}<p>Your <strong>${product}</strong> pack can go the same way. Press <strong>Submit to Future Basics</strong> in the editor and we'll come back with a quote.</p>${button(pack, 'Get a quote')}`
      };
    }
    case 'd10': return {
      subject: `${ctx.productTitle || 'Your tech pack'}: want us to make it?`, title: '', plain: true,
      html: `${hi(ctx.first)}<p>It's ${esc(ctx.signer || 'Kyle')} at Future Basics. I saw your ${product} draft.</p>
<p>If you're thinking about producing it, reply with roughly how many you want and when you need them. I'll tell you honestly whether it makes sense.</p>
<p>For reference: apparel starts at 50 pieces and takes 8–14 weeks. Plush starts at 300.</p><p>${esc(ctx.signer || 'Kyle')}</p>`
    };
    case 'd16': return {
      subject: `Still want to make ${ctx.productTitle || 'this'}?`, title: 'Still want to make it?',
      html: `${hi(ctx.first)}<p>Your ${product} draft is still saved. If the timing's wrong, no problem. It'll be there when you come back.</p>
<p>If something stopped you, I'd like to know what. Reply with one word: <strong>price</strong>, <strong>timing</strong> or <strong>unsure</strong>.</p>${button(pack, 'Open your tech pack')}`
    };
    case 'paid_howto': return {
      subject: `What happens next with ${ctx.productTitle || 'your tech pack'}`, title: 'What happens next',
      html: `${hi(ctx.first)}<p>Thanks, your <strong>${product}</strong> pack is paid for. Here's how it gets to a factory:</p>
<ol><li><strong>Check the draft.</strong> Fix any callout, measurement or material that's off. It's yours to edit any time.</li><li><strong>Submit it to Future Basics.</strong> We review it and publish version 1.</li><li><strong>Approve and sign.</strong> Once you approve, the version locks. Changes after that become version 2.</li><li><strong>Factory sign-off.</strong> The factory gets a private link (in Mandarin if they need it), acknowledges every callout and countersigns.</li></ol>${button(pack, 'Open your tech pack')}`
    };
    case 'membership_pitch': return {
      subject: 'Two packs in: the studio membership', title: 'Two packs in',
      html: `${hi(ctx.first)}<p>You've made two tech packs with us. The studio membership is <strong>$100 a month</strong> for unlimited packs, versions and factory links, so from the third pack on it costs less than paying per pack.</p>
${ctx.membershipUrl ? button(ctx.membershipUrl, 'Join the studio membership') : ''}<p style="color:#717177;font-size:13px">Cancel anytime from your account.</p>`
    };
    default: throw new Error(`Unknown follow-up step: ${key}`);
  }
}
