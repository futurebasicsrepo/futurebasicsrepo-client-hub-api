// Telling people when something happens.
//
//   covered          requester  email + text   someone paid for their cart
//   confirm_needed   requester  email + text   checkout is filled in; tap Place order (10 min)
//   needs_you        requester  email          automatic checkout stopped; finish it yourself
//   ordered          requester  email          the store confirmed the order
//                    payer      email          "your gift was ordered" (someone-else carts)
//   booked           requester  email + text   flight booked, with the confirmation code
//   booking_failed   requester  email          couldn't book; refunded
//   ready            account    email          your AI handed you a cart and didn't send it itself
//
// Each (cart, event, person) is told once: sends are recorded in the
// notices table. Texts go only to numbers that haven't replied STOP (notify.js).
// Sending never blocks or breaks the flow that triggered it.
import { usd } from './cart.js';
import { emailLayout, finishMessage } from './notify.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createEvents({ db, spot, notifier, baseUrl, log = console }) {
  // Where the requester can be reached: their account first, then what
  // they (or their AI) gave on this cart.
  function requesterContact(cart) {
    const u = cart.user_id ? db.users.byId(cart.user_id) : null;
    return {
      email: u?.email || cart.requester?.email || cart.requester?.shipping?.email || cart.flight?.contact?.email || cart.notify?.email || null,
      phone: u?.phone || cart.notify?.phone || cart.flight?.contact?.phone || cart.requester?.shipping?.phone || null,
    };
  }

  async function tell(cart, key, to, msg) {
    if ((!to.email || !msg.html) && (!to.phone || !msg.sms)) return null;
    // Claim first, so a duplicate trigger can't double-send.
    if (!db.notices.claim(cart.id, key)) return null;
    const out = await notifier.send(to, msg);
    db.notices.result(cart.id, key, out);
    return out;
  }

  function messages(kind, cart, extra) {
    const base = baseUrl();
    const link = `${base}${spot.privatePath(cart)}`;
    const item = cart.items?.[0]?.title || 'your cart';
    const store = cart.merchant?.name || 'the store';
    const payer = cart.payer?.name || 'Someone';
    const who = cart.requester?.name || 'your friend';
    const f = cart.fulfillment || {};
    const fl = cart.flight;
    const mail = (o) => emailLayout({ base, ...o });
    switch (kind) {
      case 'covered':
        return [{
          key: 'covered',
          to: requesterContact(cart),
          subject: `🎉 ${payer} spotted you!`,
          text: `${payer} covered your ${item} from ${store} (${usd(cart.cart_cents)}). Open your Spot to get it ordered: ${link}`,
          html: mail({ preheader: `${item} is covered`, title: `🎉 ${payer} spotted you!`, lines: [`<b>${esc(item)}</b> from ${esc(store)} is covered: ${usd(cart.cart_cents)}.`, 'Your one-time card is ready. Spot can place the order for you, and you tap once to confirm.'], cta: { label: 'Get it ordered →', url: link } }),
          sms: `Spot: 🎉 ${payer} spotted you! ${item} from ${store} is covered. Get it ordered: ${link}`,
        }];
      case 'confirm_needed':
        return [{
          key: `confirm_${f.started_at || ''}`,
          to: requesterContact(cart),
          subject: `👆 One tap to order your ${item}`,
          text: `Spot filled in ${store}'s checkout: ${usd(f.total_cents || 0)}. Tap Place order within 10 minutes: ${link}`,
          html: mail({ preheader: 'Your checkout is ready', title: 'One tap to order 👆', lines: [`Spot filled in ${esc(store)}’s checkout for <b>${esc(item)}</b>. Total: <b>${usd(f.total_cents || 0)}</b>.`, 'Nothing is ordered until you tap Place order. It waits for 10 minutes.'], cta: { label: 'Review and place order →', url: link } }),
          sms: `Spot: Your ${store} checkout is ready, ${usd(f.total_cents || 0)}. Tap Place order within 10 min: ${link}`,
        }];
      case 'needs_you':
        return [{
          key: `needs_you_${f.started_at || ''}`,
          to: { email: requesterContact(cart).email },
          subject: `Finish your ${store} order`,
          text: `Spot couldn't finish ${store}'s checkout on its own (${f.reason || 'it needs you'}). Your card and a ready checkout link are on your Spot: ${link}`,
          html: mail({ preheader: 'One step left', title: `Finish your ${store} order`, lines: [`Spot couldn’t finish the checkout on its own: ${esc(f.reason || 'the store needs you')}.`, 'Your one-time card and a ready-to-go checkout link are waiting on your Spot page.'], cta: { label: 'Finish the order →', url: link } }),
        }];
      case 'ordered': {
        const out = [{
          key: 'ordered',
          to: { email: requesterContact(cart).email },
          subject: `📦 Ordered: ${item}`,
          text: `${store} confirmed your order${f.order_number ? ` #${f.order_number}` : ''}. Watch your email for tracking. ${link}`,
          html: mail({ preheader: `${store} confirmed your order`, title: '📦 Ordered!', lines: [`${esc(store)} confirmed your order${f.order_number ? ` <b>#${esc(f.order_number)}</b>` : ''} for <b>${esc(item)}</b>.`, 'Watch your email for tracking from the store.'], cta: { label: f.order_url ? 'View your order →' : 'Open your Spot →', url: f.order_url || link } }),
        }];
        if (cart.for !== 'self' && cart.payer_contact?.email) {
          out.push({
            key: 'ordered_payer',
            to: { email: cart.payer_contact.email },
            subject: `🎁 Your gift for ${who} was ordered`,
            text: `Thanks for spotting ${who}! ${item} from ${store} was ordered. Want someone to spot you? ${base}/new`,
            html: mail({ preheader: `${item} is on its way to ${who}`, title: `🎁 Your gift for ${who} was ordered`, lines: [`Thanks for spotting ${esc(who)}! <b>${esc(item)}</b> from ${esc(store)} is on its way.`, 'Your money went onto a one-time card that could only buy this.'], cta: { label: 'Make your own Spot →', url: `${base}/new` }, note: 'Anything you want someone to cover? Turn any cart into a link.' }),
          });
        }
        return out;
      }
      case 'booked': {
        const ref = fl?.booking?.booking_reference || '';
        const route = item;
        return [{
          key: 'booked',
          to: requesterContact(cart),
          subject: `✈️ You're booked: ${route}`,
          text: `You're booked! Confirmation ${ref}. ${route}, ${store}. The airline emails your e-ticket. ${link}`,
          html: mail({ preheader: `Confirmation ${ref}`, title: '✈️ You’re booked!', lines: [`Confirmation code <b style="font:800 20px ui-monospace,Menlo,monospace;letter-spacing:.12em">${esc(ref)}</b>`, `${esc(route)} · ${esc(store)}`, `${esc(store)} emails your e-ticket. Use the code to check in.`], cta: { label: 'See your trip →', url: link } }),
          sms: `Spot: ✈️ You're booked! Confirmation ${ref}. ${route}. Details: ${link}`,
        }];
      }
      case 'booking_failed':
        return [{
          key: 'booking_failed',
          to: { email: requesterContact(cart).email },
          subject: 'We couldn’t book your flight',
          text: `${fl?.error || 'The airline couldn’t book it.'} You've been refunded in full. ${link}`,
          html: mail({ preheader: 'You’ve been refunded in full', title: 'We couldn’t book this one', lines: [esc(fl?.error || 'The airline couldn’t book it.'), 'You’ve been refunded in full. Ask your AI to find another flight.'], cta: { label: 'See details', url: link } }),
        }];
      case 'ready': {
        const msg = finishMessage(cart, link);
        return [{
          key: 'ready',
          to: { email: extra?.email || requesterContact(cart).email },
          subject: `🤖 ${msg.subject}`,
          text: msg.text,
          html: mail({ preheader: 'Your AI put this together for you', title: cart.kind === 'flight' ? 'Your AI found a flight ✈️' : 'Your AI has a cart ready 🛒', lines: [`<b>${esc(item)}</b><br>${esc(store)} · ${usd(cart.total_cents)}`, cart.kind === 'flight' ? 'The fare only holds for a little while.' : 'Check it, tap pay, and Spot handles the rest.'], cta: { label: 'Finish →', url: link } }),
        }];
      }
      default:
        return [];
    }
  }

  return {
    // Fire and forget. Returns a promise for tests; callers don't await it.
    emit(kind, cartOrId, extra) {
      const run = async () => {
        const cart = typeof cartOrId === 'string' ? db.byId(cartOrId) : db.byId(cartOrId.id);
        if (!cart) return;
        for (const m of messages(kind, cart, extra)) await tell(cart, m.key, m.to, m);
      };
      return run().catch((err) => log.warn?.({ err, kind }, 'notification failed'));
    },
  };
}
