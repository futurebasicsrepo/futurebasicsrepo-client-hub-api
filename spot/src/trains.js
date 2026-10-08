// Train tickets: an ask for one specific train (Amtrak and the like). The AI
// finds the train and fare on the operator's site; the rider adds who's
// riding instead of a shipping address, pays, and Spot's browser checkout
// buys that train on the operator's site with a card capped at the order.
// The e-ticket goes to the rider's email. Spot shows the operator's real
// total before anything is bought, like any store order.
import { CartError } from './cart.js';

const str = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Times are local to the station, as printed on the ticket ("2026-10-09T05:58").
export function validateTrain(t = {}) {
  const out = {
    from: str(t.from, 60),
    to: str(t.to, 60),
    depart_at: str(t.depart_at, 16),
    arrive_at: str(t.arrive_at, 16) || null,
    service: str(t.service, 60) || null,
    number: str(t.number, 12) || null,
    fare_class: str(t.fare_class, 40) || 'Coach',
    passengers: Math.round(Number(t.passengers) || 1),
    booking_url: null,
  };
  if (!out.from || !out.to) throw new CartError('Say which stations: from and to');
  if (!LOCAL.test(out.depart_at)) throw new CartError('depart_at must look like 2026-10-09T05:58 (local time at the station)');
  if (out.arrive_at && !LOCAL.test(out.arrive_at)) throw new CartError('arrive_at must look like 2026-10-09T07:26');
  if (out.passengers < 1 || out.passengers > 6) throw new CartError('1 to 6 passengers');
  if (t.booking_url) {
    try {
      const u = new URL(String(t.booking_url));
      if (u.protocol === 'https:') out.booking_url = u.toString();
    } catch {
      // Not a link: start from the operator's home page.
    }
  }
  return out;
}

// Minutes the ask can stay open: until 45 minutes before the train leaves.
// Station time is read as US Eastern daylight time (UTC−4), the earliest a
// US departure can be, so elsewhere the cut-off only comes sooner, never late.
export function minutesUntilCutoff(train, now = Date.now(), tzOffsetHours = -4) {
  const leave = Date.parse(`${train.depart_at}:00Z`) - tzOffsetHours * 3600_000;
  return Math.floor((leave - now) / 60_000) - 45;
}

export function validateRiders(riders, contact, passengers) {
  const list = (Array.isArray(riders) ? riders : []).map((r) => ({ given_name: str(r?.given_name, 40), family_name: str(r?.family_name, 40) }));
  if (list.length !== passengers || list.some((r) => !r.given_name || !r.family_name)) {
    throw new CartError(passengers > 1 ? `Add all ${passengers} riders’ first and last names` : 'Add the rider’s first and last name');
  }
  const email = str(contact?.email, 200).toLowerCase();
  if (!EMAIL.test(email)) throw new CartError('Add an email for the e-ticket');
  return { riders: list, contact: { email, phone: str(contact?.phone, 30) || null } };
}

const day = (t) => new Date(`${t.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const time = (t) => {
  const h = Number(t.slice(11, 13));
  return `${h % 12 || 12}:${t.slice(14, 16)} ${h < 12 ? 'AM' : 'PM'}`;
};

export const trainTitle = (op, t) => `${[op, t.service].filter(Boolean).join(' ')}${t.number ? ` ${t.number}` : ''}: ${t.from} → ${t.to}`;
export const trainVariant = (t) =>
  [`${day(t.depart_at)}, ${time(t.depart_at)}${t.arrive_at ? `–${time(t.arrive_at)}` : ''}`, t.fare_class, `${t.passengers} ${t.passengers > 1 ? 'passengers' : 'passenger'}`].join(' · ');
export const trainWhen = (t) => ({ day: day(t.depart_at), depart: time(t.depart_at), arrive: t.arrive_at ? time(t.arrive_at) : null });
