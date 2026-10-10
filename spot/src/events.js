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
//   receipt          payer      email          Spot's receipt (Spot is the seller), with a
//                                              cancel-for-a-refund link until it's ordered
//   refunded         payer      email          a full refund (canceled, couldn't be ordered…)
//                    requester  email
//   refunded_part    payer      email          unused money or a store return, sent back
//   thanks           payer      email          the requester's thank-you, with a link to
//                                              the payer's receipt (where it shows too)
//
// Each (cart, event, person) is told once: sends are recorded in the
// notices table. Texts go only to numbers that haven't replied STOP (notify.js).
// Sending never blocks or breaks the flow that triggered it.
import { usd } from './cart.js';
import { emailLayout, finishMessage } from './notify.js';
import { agentLabel } from './approvals.js';

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
    // Provenance: which AI built it, and the signed approval, if any.
    const approval = db.approvals?.ofCart(cart.id).at(-1);
    const approvalLink = approval ? `${base}/approvals/${approval.id}` : null;
    const builtBy = cart.agent ? agentLabel(cart.agent) : null;
    const trail = [builtBy ? `🤖 Put together by ${esc(builtBy)}` : '', approvalLink ? `✅ <a href="${esc(approvalLink)}">Signed approval</a>` : ''].filter(Boolean).join(' · ');
    const direct = cart.settle === 'direct';
    // A multi-store ask: one receipt and one "covered" for all its stores.
    const bundle = extra?.bundle && db.bundles ? db.bundles.byId(extra.bundle) : null;
    if (bundle && (kind === 'receipt' || kind === 'covered')) {
      const carts = db.bundles.carts(bundle.id);
      const total = carts.reduce((n, c) => n + c.total_cents, 0);
      const stores = carts.map((c) => c.merchant.name).join(', ');
      if (kind === 'covered') {
        const blink = `${base}${spot.bundlePrivatePath(bundle)}`;
        return [{
          key: 'covered',
          to: requesterContact(cart),
          subject: `🎉 ${payer} spotted you!`,
          text: `${payer} covered your cart from ${stores}. Tell Spot where to ship it: ${blink}`,
          html: mail({ preheader: `${carts.length} stores, covered`, title: `🎉 ${payer} spotted you!`, lines: [`Your cart from <b>${esc(stores)}</b> is covered.`, 'Spot orders from each store for you, and you tap once per store to confirm.'], cta: { label: 'Get it ordered →', url: blink } }),
          sms: `Spot: ${payer} paid for your order from ${carts.length} stores. Confirm your shipping address so we can place it: ${blink}`,
        }];
      }
      const email = cart.payer_contact?.email;
      if (!email) return [];
      const receipt = `${base}${spot.bundlePayerPath(bundle)}`;
      return [{
        key: 'receipt',
        to: { email },
        subject: `Your Spot receipt: ${carts.length} stores for ${who}`,
        text: `Receipt from Spot. ${stores}, shipped to ${who}. Total ${usd(total)}. Cancel anything not ordered yet: ${receipt}`,
        html: mail({
          preheader: `Total ${usd(total)}`,
          title: '🧾 Your Spot receipt',
          lines: [
            ...carts.map((c) => `<b>${esc(c.merchant.name)}</b>: ${esc(c.items[0]?.title)}${c.items.length > 1 ? ` +${c.items.length - 1} more` : ''} · ${usd(c.total_cents)}`),
            `<b>Total ${usd(total)}</b>, shipped to ${esc(who)}.`,
            'You bought these from Spot. Spot orders each store’s items and ships them; returns go through Spot. If a store can’t be ordered, you get its share back automatically.',
            trail ? `<span style="font-size:13px;color:#8a8175">${trail}</span>` : '',
          ].filter(Boolean),
          cta: { label: 'View receipt or cancel', url: receipt },
          note: `Questions or returns: ${esc(process.env.SPOT_CONTACT_EMAIL || 'hello@spotmeplease.com')}`,
        }),
      }];
    }
    switch (kind) {
      case 'declined': {
        const by = extra?.name || 'They';
        return [{
          key: `declined:${extra?.n ?? 0}`,
          to: requesterContact(cart),
          subject: `${by} can’t spot this one`,
          text: `${by} passed on your ${item} from ${store}, no hard feelings. Pay it yourself or send it to someone else: ${link}`,
          html: mail({ preheader: `${by} passed on ${item}`, title: `${esc(by)} can’t spot this one`, lines: [`${esc(by)} passed on <b>${esc(item)}</b> from ${esc(store)}. No hard feelings.`, 'The link still works: pay it yourself, or send it to someone else.'], cta: { label: 'Pay it or send it on →', url: link } }),
          sms: `Spot: ${by} passed on your ${store} order (${item}). Pay it yourself or send it to someone else: ${link}`,
        }];
      }
      case 'covered':
        return [{
          key: 'covered',
          to: requesterContact(cart),
          subject: `🎉 ${payer} spotted you!`,
          text: `${payer} covered your ${item} from ${store} (${usd(cart.cart_cents)}). Tell Spot where to ship it: ${link}`,
          html: mail({ preheader: `${item} is covered`, title: `🎉 ${payer} spotted you!`, lines: [`<b>${esc(item)}</b> from ${esc(store)} is covered: ${usd(cart.cart_cents)}.`, `Tell Spot where to ship it. Spot buys it from ${esc(store)} for you, and you tap once to confirm.`], cta: { label: 'Get it ordered →', url: link } }),
          sms: `Spot: ${payer} paid for your ${store} order (${item}). Confirm your shipping address so we can place it: ${link}`,
        }];
      case 'confirm_needed':
        return [{
          key: `confirm_${f.started_at || ''}`,
          to: requesterContact(cart),
          subject: `👆 One tap to order your ${item}`,
          text: `Spot filled in ${store}'s checkout: ${usd(f.total_cents || 0)}. Tap Place order within 10 minutes: ${link}`,
          html: mail({ preheader: 'Your checkout is ready', title: 'One tap to order 👆', lines: [`Spot filled in ${esc(store)}’s checkout for <b>${esc(item)}</b>. Total: <b>${usd(f.total_cents || 0)}</b>.`, 'Nothing is ordered until you tap Place order. It waits for 10 minutes.'], cta: { label: 'Review and place order →', url: link } }),
          sms: `Spot: Your ${store} order total is ${usd(f.total_cents || 0)}. Confirm within 10 minutes to place it: ${link}`,
        }];
      case 'needs_you':
        return [{
          key: `needs_you_${f.started_at || ''}`,
          to: { email: requesterContact(cart).email },
          subject: `Your ${store} order needs a nudge`,
          text: `Spot couldn't place your ${store} order automatically (${f.reason || 'the store needs a person'}). Try again from your Spot. If it can't be ordered within 3 days, the payer is refunded in full. ${link}`,
          html: mail({ preheader: 'Try again, or we refund', title: `Your ${store} order needs a nudge`, lines: [`Spot couldn’t place the order automatically: ${esc(f.reason || 'the store needs a person')}.`, 'Try again from your Spot page. If it can’t be ordered within 3 days, the payer is refunded in full.'], cta: { label: 'Open your Spot →', url: link } }),
        }];
      case 'ordered': {
        const out = [{
          key: 'ordered',
          to: { email: requesterContact(cart).email },
          subject: cart.kind === 'train' ? `🚆 Booked: ${item}` : `📦 Ordered: ${item}`,
          text: `${store} confirmed your ${cart.kind === 'train' ? 'ticket' : 'order'}${f.order_number ? ` #${f.order_number}` : ''}. ${cart.kind === 'train' ? `${store} emails your e-ticket.` : 'Watch your email for tracking.'} ${link}`,
          html: mail({ preheader: `${store} confirmed your ${cart.kind === 'train' ? 'ticket' : 'order'}`, title: cart.kind === 'train' ? '🚆 Booked!' : '📦 Ordered!', lines: [`${esc(store)} confirmed your ${cart.kind === 'train' ? 'ticket' : 'order'}${f.order_number ? ` <b>#${esc(f.order_number)}</b>` : ''} for <b>${esc(item)}</b>.`, cart.kind === 'train' ? `${esc(store)} emails your e-ticket. Show it on your phone when you board.` : 'Watch your email for tracking from the store.', trail ? `<span style="font-size:13px;color:#8a8175">${trail}</span>` : ''].filter(Boolean), cta: { label: f.order_url ? 'View your order →' : 'Open your Spot →', url: f.order_url || link } }),
        }];
        if (cart.for !== 'self' && cart.payer_contact?.email) {
          out.push({
            key: 'ordered_payer',
            to: { email: cart.payer_contact.email },
            subject: `🎁 Your gift for ${who} was ordered`,
            text: `Thanks for spotting ${who}! ${item} from ${store} was ordered. Want someone to spot you? ${base}/new`,
            html: mail({ preheader: `${item} is on its way to ${who}`, title: `🎁 Your gift for ${who} was ordered`, lines: [`Thanks for spotting ${esc(who)}! <b>${esc(item)}</b> from ${esc(store)} is on its way.`, direct ? `You paid ${esc(store)} directly, so its receipt and returns apply. It ships straight to ${esc(who)}.` : `Spot bought it from ${esc(store)} with your payment, and it ships straight to ${esc(who)}.`, trail ? `<span style="font-size:13px;color:#8a8175">${trail}</span>` : ''].filter(Boolean), cta: { label: 'Make your own Spot →', url: `${base}/new` }, note: 'Anything you want someone to cover? Turn any cart into a link.' }),
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
          sms: `Spot: Your flight is booked. Confirmation ${ref}, ${route}. Details: ${link}`,
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
        const tap = cart.saved_card;
        return [{
          key: 'ready',
          // An Approve button goes by text too: it's the moment the AI waits on.
          to: tap ? requesterContact(cart) : { email: extra?.email || requesterContact(cart).email },
          subject: tap ? `🤖 Approve ${usd(cart.total_cents)} at ${store}?` : `🤖 ${msg.subject}`,
          text: tap ? `Your AI wants ${item} from ${store}, ${usd(cart.total_cents)}. Tap Approve and your ${tap.label} pays: ${link}` : msg.text,
          ...(tap ? { sms: `Spot: Your AI assistant requested ${item} from ${store}, ${usd(cart.total_cents)}. Review and approve it here: ${link}` } : {}),
          html: cart.saved_card
            ? mail({ preheader: `One tap pays with your ${cart.saved_card.label}`, title: 'Approve what your AI picked? 🤖', lines: [`<b>${esc(item)}</b><br>${esc(store)} · ${usd(cart.total_cents)}`, `Tap Approve and your ${esc(cart.saved_card.label)} pays. Spot gets a card just for this order, capped at this amount and locked to ${esc(store)}, and orders it for you.`, 'Nothing is charged unless you tap.'], cta: { label: `Approve ${usd(cart.total_cents)} →`, url: link } })
            : mail({ preheader: 'Your AI put this together for you', title: cart.kind === 'flight' ? 'Your AI found a flight ✈️' : cart.kind === 'train' ? 'Your AI found a train 🚆' : 'Your AI has a cart ready 🛒', lines: [`<b>${esc(item)}</b><br>${esc(store)} · ${usd(cart.total_cents)}`, cart.kind === 'flight' ? 'The fare only holds for a little while.' : 'Check it, tap pay, and Spot handles the rest.'], cta: { label: 'Finish →', url: link } }),
        }];
      }
      case 'receipt': {
        const email = cart.payer_contact?.email;
        if (!email) return [];
        const receipt = `${base}${spot.payerPath(cart)}`;
        const rows = [
          `<b>${esc(item)}</b>${cart.items.length > 1 ? ` +${cart.items.length - 1} more` : ''} from ${esc(store)}${cart.kind === 'flight' ? '' : `, shipped to ${esc(who)}`}`,
          `Goods ${usd(cart.cart_cents)}${cart.cushion_cents ? ` · up to ${usd(cart.cushion_cents)} for tax and price changes (unused comes back)` : ''} · Spot fee ${usd(cart.fee_cents)} · <b>Total ${usd(cart.total_cents)}</b>`,
          cart.kind === 'flight' ? 'Spot bought this ticket from the airline for the traveler.' : 'You bought this from Spot. Spot orders it from the store and ships it; returns go through Spot.',
          cart.kind === 'flight' ? '' : 'Changed your mind? Cancel for a full refund any time before Spot places the order.',
          trail ? `<span style="font-size:13px;color:#8a8175">${trail}</span>` : '',
        ].filter(Boolean);
        return [{
          key: 'receipt',
          to: { email },
          subject: `Your Spot receipt: ${item}`,
          text: `Receipt from Spot. ${item} from ${store}${cart.kind === 'flight' ? '' : ` for ${who}`}. Total ${usd(cart.total_cents)}. ${cart.kind === 'flight' ? '' : 'Cancel for a full refund until it’s ordered: '}${receipt}`,
          html: mail({ preheader: `Total ${usd(cart.total_cents)}`, title: '🧾 Your Spot receipt', lines: rows, cta: { label: cart.kind === 'flight' ? 'View receipt' : 'View receipt or cancel', url: receipt }, note: `Questions or returns: ${esc(process.env.SPOT_CONTACT_EMAIL || 'hello@spotmeplease.com')}` }),
        }];
      }
      case 'refunded': {
        const why = {
          payer_canceled: 'You canceled it before it was ordered.',
          requester_canceled: `${who} canceled it before it was ordered.`,
          not_ordered: `Spot couldn’t order it from ${store} in time.`,
          store_reversed: `${store} canceled the charge.`,
          store_released: `${store} didn’t charge for it.`,
          store_never_charged: `${store} never charged for it.`,
          admin: 'Spot refunded it.',
        }[cart.refund_reason] || 'It was refunded.';
        // What this refund returned: the rest, after any earlier partial refunds.
        const back = Math.max(0, cart.total_cents - (cart.refunded_before_cents ?? 0));
        const out = [];
        if (cart.payer_contact?.email) {
          out.push({
            key: 'refunded_payer',
            to: { email: cart.payer_contact.email },
            subject: `Refunded: ${item}`,
            text: `${why} We refunded ${usd(back)} to your card; it usually shows in 5–10 business days.`,
            html: mail({ preheader: `${usd(back)} back to your card`, title: 'You’ve been refunded', lines: [esc(why), `We refunded <b>${usd(back)}</b> to your card, Spot fee included. It usually shows in 5–10 business days.`] }),
          });
        }
        const to = requesterContact(cart).email;
        // The requester didn't cancel it, the payer did: say so in their words.
        const whyFor = cart.refund_reason === 'payer_canceled' ? `${payer} canceled it before it was ordered.` : why;
        if (to && !['requester_canceled'].includes(cart.refund_reason) && cart.for !== 'self') {
          out.push({
            key: 'refunded_requester',
            to: { email: to },
            subject: `Your ${store} Spot was refunded`,
            text: `${whyFor} ${payer} got their money back. ${link}`,
            html: mail({ preheader: `${payer} was refunded`, title: 'This one was refunded', lines: [esc(whyFor), `${esc(payer)} got their money back, so nothing was ordered.`], cta: { label: 'Open your Spot', url: link } }),
          });
        }
        return out;
      }
      case 'refunded_part': {
        const email = cart.payer_contact?.email || (cart.for === 'self' ? requesterContact(cart).email : null);
        if (!email || !extra?.key) return [];
        const what = extra.reason === 'store_refund' ? `${store} refunded a return` : `${store} charged less than expected`;
        return [{
          key: `refund_${extra.key}`,
          to: { email },
          subject: `${usd(extra.amount_cents)} back from Spot`,
          text: `${what}, so we sent ${usd(extra.amount_cents)} back to your card.`,
          html: mail({ preheader: `${usd(extra.amount_cents)} back to your card`, title: `${usd(extra.amount_cents)} back to your card`, lines: [`${esc(what)} for <b>${esc(item)}</b>, so we sent the difference back to your card. It usually shows in 5–10 business days.`] }),
        }];
      }
      case 'thanks': {
        const t = cart.thanks;
        const c = cart.payer_contact || {};
        if (!t || cart.for === 'self' || (!c.email && !c.phone)) return [];
        const from = String(cart.requester?.name || 'Your friend').trim().split(/\s+/)[0];
        const says = `${from} says thanks${t.emoji ? ` ${t.emoji}` : ''}`;
        const receipt = `${base}${spot.payerPath(cart)}`;
        return [{
          key: 'thanks',
          // Only the channel the payer gave Spot. Texts still follow STOP and
          // the confirmed-number rule in notify.js.
          to: { email: c.email || null, phone: c.phone || null },
          subject: `${says}: ${[...t.message].length > 60 ? `${[...t.message].slice(0, 57).join('').trimEnd()}…` : t.message}`,
          text: `${says}: “${t.message}” See it on your receipt: ${receipt}`,
          html: mail({
            preheader: t.message,
            title: `${says}`,
            lines: [
              `<span style="display:block;padding:14px 16px;border-radius:16px;background:#fff1ec;font-size:18px;line-height:1.45">“${esc(t.message)}”</span>`,
              `For <b>${esc(item)}</b> from ${esc(store)}. You made it happen.`,
            ],
            cta: { label: 'See your receipt →', url: receipt },
            note: `Want someone to spot you next? <a href="${esc(base)}/new" style="color:#6f675c">Make your own Spot</a>.`,
          }),
          sms: `Spot: ${says}: “${t.message}” Your receipt: ${receipt}`,
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
