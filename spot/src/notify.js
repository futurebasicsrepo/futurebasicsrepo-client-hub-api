// Sending a Spot link to someone's phone or inbox.
//
//   email → Resend    (RESEND_API_KEY, SPOT_FROM_EMAIL)
//   text  → Twilio    (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)
//
// Without credentials a channel reports "not_configured" and the caller
// still has the link to hand over itself; nothing throws.
//
// Texts follow US carrier rules (A2P 10DLC): they start with the brand,
// say how to opt out, and are never sent to a number that replied STOP
// (optouts, fed by the Twilio inbound webhook in server.js). Apart from
// the sign-in code that proves a number, texts only go to numbers someone
// confirmed with a code on Spot's website (`verified`): a number an AI
// passes along gets email until its owner confirms it.
import { usd } from './cart.js';
import { assetUrl } from './assets.js';

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
      text: `Spot: Your flight is ready to book. ${trip}, ${cart.merchant.name}, ${usd(cart.total_cents)}. The fare only holds for a short time. Finish here: ${link}`,
    };
  }
  if (cart.kind === 'train') {
    const trip = cart.train ? `${cart.train.from} to ${cart.train.to}` : cart.items[0]?.title || 'your train';
    return {
      subject: `Your train is ready: ${trip}`,
      text: `Spot: Your train is ready to book. ${cart.items[0]?.variant || trip}, ${cart.merchant.name}, ${usd(cart.total_cents)}. Add who's riding and finish here: ${link}`,
    };
  }
  const first = cart.items[0]?.title || 'your cart';
  const more = cart.items.length > 1 ? ` + ${cart.items.length - 1} more` : '';
  return {
    subject: `Your cart is ready: ${first}${more}`,
    text: `Spot: Your cart is ready. ${first}${more} from ${cart.merchant.name}, ${usd(cart.total_cents)}. Review and finish here: ${link}`,
  };
}

export const SMS_FOOTER = ' Reply STOP to opt out.';

// Shown next to every phone field on the website: the opt-in carriers ask for.
export const SMS_CONSENT = 'By entering your number you agree to receive texts from Spot: sign-in codes and updates about your orders. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.';

// Spot's email look: warm paper, the orange dot, one big button. Tables
// and inline styles only, because that's what email clients render.
export function emailLayout({ preheader = '', title, lines = [], cta = null, note = '', base = '', hero = true, heroWidth = 104, footer = 'You’re getting this because of a Spot you’re part of.' }) {
  const p = (html) => `<p style="margin:0 0 14px;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b1712">${html}</p>`;
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px"><tr><td style="border-radius:999px;background:#ff5a36"><a href="${esc(cta.url)}" style="display:inline-block;padding:14px 24px;font:700 16px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:999px">${esc(cta.label)}</a></td></tr></table>`
    : '';
  const home = base || 'https://spotmeplease.com';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;background:#fbf7f1">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf7f1"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 16px"><a href="${esc(home)}" style="text-decoration:none;font:800 20px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b1712"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#ff5a36;vertical-align:-1px;margin-right:6px"></span>Spot</a></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e8e0d4;border-radius:20px;padding:28px 26px">
${hero ? `<img src="${esc(typeof hero === 'string' ? hero : `${home}${assetUrl('email-spot.gif')}`)}" width="${heroWidth}" height="${Math.round(heroWidth * 1.118)}" alt="Spot waving" style="display:block;margin:-6px 0 8px;border:0;outline:none">` : ''}<h1 style="margin:0 0 14px;font:800 26px/1.15 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b1712;letter-spacing:-.02em">${esc(title)}</h1>
${lines.map(p).join('')}${button}
${note ? `<p style="margin:16px 0 0;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#6f675c">${note}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 4px;font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#8a8175">${esc(footer)} <a href="${esc(home)}/privacy" style="color:#8a8175">Privacy</a> · <a href="${esc(home)}/terms" style="color:#8a8175">Terms</a></td></tr>
</table></td></tr></table></body></html>`;
}

// A text, as a phone notification: "Spot: " and the link come off the
// words, and the link is what a tap opens.
// An email-only message uses its subject line.
export function pushFrom(msg) {
  const link = (s) => (String(s || '').match(/https?:\/\/[^\s"'<>)]+/) || [])[0] || null;
  const url = msg.url || link(msg.sms) || link(msg.text) || link(msg.html) || '/account';
  const body = msg.sms ? String(msg.sms).replace(/^Spot:\s*/, '').replace(/https?:\/\/\S+/g, '').replace(/[\s:]+$/, '').trim() : String(msg.subject || '');
  return { title: msg.push_title || 'Spot', body: body || String(msg.subject || ''), url, tag: msg.tag };
}

export function createNotifier({ env = process.env, fetchImpl = fetch, log = console, optouts = null, verified = null, metrics = null, push = null } = {}) {
  // Every text but a sign-in code: only to a confirmed number.
  const textTo = async (phone, body) => {
    const e164 = normalizePhone(phone);
    if (!e164) return 'bad_number';
    if (verified && !verified(e164)) return 'not_verified';
    return sms(e164, body).catch(() => 'failed');
  };
  async function email(to, { subject, text, html }) {
    if (!env.RESEND_API_KEY) return 'not_configured';
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.SPOT_FROM_EMAIL || 'Spot <spot@resend.dev>', to: [to], subject, text, html }),
    });
    if (!res.ok) {
      log.warn?.({ status: res.status }, 'email send failed');
      metrics?.fail('resend', `HTTP ${res.status}`);
      return 'failed';
    }
    metrics?.ok('resend');
    metrics?.count('email:sent');
    return 'sent';
  }

  async function sms(to, body) {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = env;
    if (!sid || !token || !from) return 'not_configured';
    if (optouts?.has(to)) return 'opted_out';
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) {
      log.warn?.({ status: res.status }, 'sms send failed');
      metrics?.fail('twilio', `HTTP ${res.status}`);
      return 'failed';
    }
    metrics?.ok('twilio');
    metrics?.count('sms:sent', Math.max(1, Math.ceil(String(body).length / 153)));
    return 'sent';
  }

  return {
    // An early-access invite: a personal link that lets them in (invites.js).
    async sendInvite(to, { link, base = env.PUBLIC_URL }) {
      return email(to, {
        subject: 'You’re in: your Spot early access 🧡',
        text: `You signed up for early access to Spot, the yes button for AI shopping. You're in.\n\nOpen Spot: ${link}\n\nAdd Spot to Claude or ChatGPT, ask for the thing, and tap yes when it's right. Spot buys it with a card made for that one order.\n\nOn another phone or computer? Sign in at spotmeplease.com with ${to}, the email your invite was approved for, and you're in.`,
        html: emailLayout({
          preheader: 'Your spot is open. Here’s your link.',
          title: 'Your spot is open 🧡',
          lines: ['You signed up for early access to Spot, the yes button for AI shopping. You’re in.', 'Add Spot to Claude or ChatGPT, ask for the thing, and tap yes when it’s right. Spot buys it with a card made for that one order, and it shows up.'],
          cta: { url: link, label: 'Open Spot' },
          note: `<b>On another phone or computer?</b> Sign in at spotmeplease.com with <b>${esc(to)}</b>, the email your invite was approved for, and you’re in.`,
          base,
          heroWidth: 132,
          footer: 'You’re getting this because you signed up for Spot early access.',
        }),
      }).catch(() => 'failed');
    },

    // Sign-in code for an account. Returns the email status.
    async sendSignInCode(to, code) {
      return email(to, {
        subject: `${code} is your Spot sign-in code`,
        text: `Your Spot sign-in code is ${code}. It works for 10 minutes. If you didn't ask for it, ignore this email.`,
        html: emailLayout({
          preheader: `${code} is your sign-in code`,
          title: 'Your sign-in code',
          lines: [`<span style="font:800 36px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em">${esc(code)}</span>`],
          note: 'It works for 10 minutes. If you didn’t ask for it, ignore this email.',
          base: env.PUBLIC_URL,
        }),
      }).catch(() => 'failed');
    },

    // Sign-in code by text. The last line lets phones offer the code as
    // autofill (WebOTP, iOS one-time-code) bound to Spot's own domain.
    async sendSignInText(phone, code, host) {
      const bound = host ? `\n\n@${host} #${code}` : '';
      return sms(phone, `Spot: ${code} is your sign-in code. It works for 10 minutes. Don't share it.${SMS_FOOTER}${bound}`).catch(() => 'failed');
    },

    // Any message to a person: { email?, phone?, userId? } × { subject, text, html, sms }.
    // With an account, it also goes to every device that turned on
    // notifications (no texting service needed). Returns { email?, text?,
    // push? } statuses for the channels used.
    async send({ email: to, phone, userId } = {}, msg) {
      const out = {};
      if (to && msg.html) out.email = await email(to, { subject: msg.subject, text: msg.text, html: msg.html }).catch(() => 'failed');
      if (phone && msg.sms) out.text = await textTo(phone, msg.sms + SMS_FOOTER);
      if (userId && push && (msg.sms || msg.subject || msg.push_body)) {
        const p = await push.toUser(userId, msg.push_body ? { title: msg.push_title || 'Spot', body: msg.push_body, url: msg.url, tag: msg.tag } : pushFrom(msg)).catch(() => 'failed');
        if (p !== 'none') out.push = p;
      }
      return out;
    },

    // Returns { email?: status, text?: status, push? } for the channels asked
    // for. fallbackEmail (the account's) is used when the text didn't go:
    // while texting is down or not approved yet, the link still arrives.
    async sendFinishLink(cart, link, { email: to, phone, userId, fallbackEmail } = {}) {
      const msg = finishMessage(cart, link);
      const out = {};
      if (to) {
        out.email = await email(to, {
          subject: msg.subject,
          text: msg.text,
          html: emailLayout({
            preheader: msg.subject,
            title: cart.kind === 'flight' ? 'Your flight is ready ✈️' : cart.kind === 'train' ? 'Your train is ready 🚆' : 'Your cart is ready 🛒',
            lines: [`<b>${esc(cart.items[0]?.title)}</b><br>${esc(cart.merchant.name)} · ${usd(cart.total_cents)}`],
            cta: { label: 'Finish on your phone →', url: link },
            note: cart.kind === 'flight' ? 'The fare only holds for a little while.' : cart.kind === 'train' ? 'Add who’s riding, pay, and Spot buys the ticket. The operator emails your e-ticket.' : '',
            base: env.PUBLIC_URL,
          }),
        }).catch(() => 'failed');
      }
      if (phone) out.text = await textTo(phone, msg.text + SMS_FOOTER);
      if (!to && fallbackEmail && out.text !== 'sent') return { ...out, ...(await this.sendFinishLink(cart, link, { email: fallbackEmail })) };
      if (userId && push) {
        const p = await push.toUser(userId, { title: 'Spot', body: msg.subject, url: link }).catch(() => 'failed');
        if (p !== 'none') out.push = p;
      }
      return out;
    },
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
