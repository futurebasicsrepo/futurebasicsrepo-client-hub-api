// Sending a Spot link to someone's phone or inbox.
//
//   email → Resend    (RESEND_API_KEY, SPOT_FROM_EMAIL)
//   text  → Twilio    (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)
//
// Without credentials a channel reports "not_configured" and the caller
// still has the link to hand over itself; nothing throws.
import { usd } from './cart.js';

export function normalizePhone(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`; // US default
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export function finishMessage(cart, link) {
  if (cart.kind === 'flight') {
    const trip = cart.items[0]?.title || 'your flight';
    return {
      subject: `Your flight is ready: ${trip}`,
      text: `Your flight is ready ✈️ ${trip}, ${cart.merchant.name}, ${usd(cart.total_cents)}. The fare only holds for a bit. Finish on your phone: ${link}`,
    };
  }
  const first = cart.items[0]?.title || 'your cart';
  const more = cart.items.length > 1 ? ` + ${cart.items.length - 1} more` : '';
  return {
    subject: `Your cart is ready: ${first}${more}`,
    text: `Your cart is ready 🛒 ${first}${more} from ${cart.merchant.name}, ${usd(cart.total_cents)}. Finish on your phone: ${link}`,
  };
}

export function createNotifier({ env = process.env, fetchImpl = fetch, log = console } = {}) {
  async function email(to, { subject, text, html }) {
    if (!env.RESEND_API_KEY) return 'not_configured';
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.SPOT_FROM_EMAIL || 'Spot <spot@resend.dev>', to: [to], subject, text, html }),
    });
    if (!res.ok) {
      log.warn?.({ status: res.status }, 'email send failed');
      return 'failed';
    }
    return 'sent';
  }

  async function sms(to, body) {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = env;
    if (!sid || !token || !from) return 'not_configured';
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) {
      log.warn?.({ status: res.status }, 'sms send failed');
      return 'failed';
    }
    return 'sent';
  }

  return {
    // Returns { email?: status, text?: status } for the channels asked for.
    async sendFinishLink(cart, link, { email: to, phone } = {}) {
      const msg = finishMessage(cart, link);
      const out = {};
      if (to) {
        out.email = await email(to, {
          subject: msg.subject,
          text: msg.text,
          html: `<p style="font:16px/1.5 system-ui,sans-serif">${cart.kind === 'flight' ? 'Your flight is ready ✈️' : 'Your cart is ready 🛒'}<br><b>${esc(cart.items[0]?.title)}</b> from ${esc(cart.merchant.name)} · ${usd(cart.total_cents)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#ff5a36;color:#fff;padding:12px 18px;border-radius:10px;font:700 16px system-ui,sans-serif;text-decoration:none">Finish on your phone →</a></p>`,
        }).catch(() => 'failed');
      }
      if (phone) {
        const e164 = normalizePhone(phone);
        out.text = e164 ? await sms(e164, msg.text).catch(() => 'failed') : 'bad_number';
      }
      return out;
    },
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
