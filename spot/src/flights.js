// Flights through Duffel (duffel.com): search real fares, hold one, and
// book it once the traveler has paid Spot.
//
//   DUFFEL_ACCESS_TOKEN   duffel_test_… (test mode, fake airline "Duffel
//                         Airways") or duffel_live_… (real tickets)
//
// Money: the traveler pays Spot through the normal pay flow; Spot pays the
// airline from its Duffel balance (payments: [{ type: 'balance' }]), so no
// one-time card is involved. Keep the balance topped up in the Duffel
// dashboard. Fares are USD only for now, since carts are priced in USD.
//
// With no token, a demo provider returns made-up fares so the whole flow can
// be tried (and tested) without an account.
import { randomBytes } from 'node:crypto';
import { CartError } from './cart.js';
import { normalizePhone } from './notify.js';

const API = 'https://api.duffel.com';
const CABINS = ['economy', 'premium_economy', 'business', 'first'];
const IATA = /^[A-Z]{3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function createFlights({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  return env.DUFFEL_ACCESS_TOKEN ? duffel(env.DUFFEL_ACCESS_TOKEN, fetchImpl) : demo(now);
}

// ─── Search input ───────────────────────────────────────────────────────────
export function validateSearch(b = {}) {
  const origin = String(b.origin || '').trim().toUpperCase();
  const destination = String(b.destination || '').trim().toUpperCase();
  if (!IATA.test(origin) || !IATA.test(destination)) throw new CartError('origin and destination must be 3-letter airport or city codes, e.g. AUS, SFO, NYC');
  if (origin === destination) throw new CartError('origin and destination are the same');
  const depart = String(b.departure_date || '');
  const ret = b.return_date ? String(b.return_date) : null;
  const today = new Date().toISOString().slice(0, 10);
  if (!DAY.test(depart) || depart < today) throw new CartError('departure_date must be YYYY-MM-DD, today or later');
  if (ret && (!DAY.test(ret) || ret < depart)) throw new CartError('return_date must be YYYY-MM-DD, on or after departure_date');
  const adults = b.adults == null ? 1 : Number(b.adults);
  if (!Number.isInteger(adults) || adults < 1 || adults > 6) throw new CartError('adults must be 1–6');
  const cabin = b.cabin_class ? String(b.cabin_class) : 'economy';
  if (!CABINS.includes(cabin)) throw new CartError(`cabin_class must be one of ${CABINS.join(', ')}`);
  const maxStops = b.max_connections == null ? null : Number(b.max_connections);
  if (maxStops !== null && (!Number.isInteger(maxStops) || maxStops < 0 || maxStops > 2)) throw new CartError('max_connections must be 0, 1 or 2');
  const slices = [{ origin, destination, departure_date: depart }];
  if (ret) slices.push({ origin: destination, destination: origin, departure_date: ret });
  return { slices, adults, cabin_class: cabin, max_connections: maxStops };
}

// ─── Travelers ──────────────────────────────────────────────────────────────
// One entry per passenger on the offer, in order. Contact details are shared
// (airlines want an email and phone on every passenger).
export function validateTravelers(offerPassengers, travelers, contact) {
  const list = Array.isArray(travelers) ? travelers : [];
  if (list.length !== offerPassengers.length) throw new CartError(`Add details for all ${offerPassengers.length} traveler${offerPassengers.length > 1 ? 's' : ''}`);
  const email = String(contact?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CartError('Add an email for the booking confirmation');
  const phone = normalizePhone(contact?.phone);
  if (!phone) throw new CartError('Add a phone number the airline can reach you on');
  const today = new Date().toISOString().slice(0, 10);
  const out = list.map((t, i) => {
    const n = i + 1;
    const given = name(t?.given_name);
    const family = name(t?.family_name);
    if (!given || !family) throw new CartError(`Traveler ${n}: first and last name, as on their ID`);
    const born = String(t?.born_on || '');
    if (!DAY.test(born) || born >= today || born < '1900-01-01') throw new CartError(`Traveler ${n}: date of birth looks wrong`);
    const gender = t?.gender === 'm' || t?.gender === 'f' ? t.gender : null;
    if (!gender) throw new CartError(`Traveler ${n}: gender as shown on their ID`);
    return { id: offerPassengers[i].id, type: offerPassengers[i].type || 'adult', given_name: given, family_name: family, born_on: born, gender, title: gender === 'f' ? 'ms' : 'mr' };
  });
  return { travelers: out, contact: { email, phone } };
}

function name(v) {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return s.length >= 1 && s.length <= 40 && /^[\p{L}' -]+$/u.test(s) ? s : '';
}

// ─── Presentation ───────────────────────────────────────────────────────────
// "AUS → SFO · Sun, Oct 12 · Delta" (round trips: "AUS ⇄ SFO · Oct 12 – Oct 19")
export function flightTitle(offer) {
  const [a, b] = offer.slices;
  const d = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const route = b ? `${a.from} ⇄ ${a.to}` : `${a.from} → ${a.to}`;
  const when = b ? `${d(a.departing_at)} – ${d(b.departing_at)}` : d(a.departing_at);
  return `${route} · ${when}`;
}

export function flightVariant(offer) {
  const stops = offer.slices.map((s) => (s.stops ? `${s.stops} stop${s.stops > 1 ? 's' : ''}` : 'nonstop'));
  return [offer.airline.name, [...new Set(stops)].join(' / '), offer.passengers.length > 1 ? `${offer.passengers.length} travelers` : null, offer.cabin && offer.cabin !== 'economy' ? offer.cabin.replace('_', ' ') : null]
    .filter(Boolean)
    .join(' · ');
}

// What's safe to show on any page: the itinerary, never traveler details.
export function publicFlight(f) {
  if (!f) return null;
  const o = f.offer;
  return {
    airline: o.airline,
    cabin: o.cabin,
    slices: o.slices,
    passengers: o.passengers.length,
    conditions: o.conditions,
    booking_reference: f.booking?.booking_reference || null,
    error: f.error || null,
  };
}

// ─── Duffel ─────────────────────────────────────────────────────────────────
function duffel(token, fetchImpl) {
  async function call(method, path, body) {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'duffel-version': 'v2',
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify({ data: body }) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = json.errors?.[0];
      const code = e?.code || `http_${res.status}`;
      const gone = ['offer_no_longer_available', 'offer_expired', 'not_found', 'price_changed'].includes(code) || res.status === 404;
      const err = new CartError(gone ? 'That fare is no longer available. Ask your assistant to search again.' : e?.message || `Duffel error ${res.status}`, gone ? 410 : 502);
      err.code = code;
      throw err;
    }
    return json.data;
  }

  return {
    mode: token.startsWith('duffel_live_') ? 'live' : 'test',
    async places(query) {
      const q = String(query || '').trim();
      if (q.length < 2) return [];
      const data = await call('GET', `/places/suggestions?query=${encodeURIComponent(q)}`);
      return (data || []).slice(0, 8).map((p) => ({ code: p.iata_code, name: p.name, type: p.type, city: p.city_name || p.city?.name || null }));
    },
    async search(input, { limit = 5 } = {}) {
      const s = validateSearch(input);
      const body = {
        slices: s.slices,
        passengers: Array.from({ length: s.adults }, () => ({ type: 'adult' })),
        cabin_class: s.cabin_class,
        ...(s.max_connections !== null ? { max_connections: s.max_connections } : {}),
      };
      const data = await call('POST', '/air/offer_requests?return_offers=true&supplier_timeout=20000', body);
      return rank((data.offers || []).map(normalize).filter(Boolean), limit);
    },
    async offer(id) {
      const o = normalize(await call('GET', `/air/offers/${encodeURIComponent(id)}`));
      if (!o) throw new CartError('Only USD fares are supported for now', 422);
      return o;
    },
    async book({ offer, travelers, contact }) {
      const data = await call('POST', '/air/orders', {
        type: 'instant',
        selected_offers: [offer.id],
        payments: [{ type: 'balance', amount: offer.total_amount, currency: offer.currency }],
        passengers: travelers.map((t) => ({
          id: t.id,
          title: t.title,
          given_name: t.given_name,
          family_name: t.family_name,
          gender: t.gender,
          born_on: t.born_on,
          email: contact.email,
          phone_number: contact.phone,
        })),
      });
      return { order_id: data.id, booking_reference: data.booking_reference };
    },
  };
}

function normalize(o) {
  if (!o || o.total_currency !== 'USD') return null;
  return {
    id: o.id,
    total_amount: o.total_amount,
    total_cents: Math.round(Number(o.total_amount) * 100),
    currency: o.total_currency,
    expires_at: o.expires_at || null,
    airline: { name: o.owner?.name || 'Airline', code: o.owner?.iata_code || null, logo: o.owner?.logo_symbol_url || null },
    cabin: o.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class || null,
    passengers: (o.passengers || []).map((p) => ({ id: p.id, type: p.type || 'adult' })),
    conditions: {
      refundable: Boolean(o.conditions?.refund_before_departure?.allowed),
      changeable: Boolean(o.conditions?.change_before_departure?.allowed),
    },
    slices: (o.slices || []).map((s) => {
      const segs = s.segments || [];
      return {
        from: s.origin?.iata_code,
        to: s.destination?.iata_code,
        from_city: s.origin?.city_name || s.origin?.name || null,
        to_city: s.destination?.city_name || s.destination?.name || null,
        departing_at: segs[0]?.departing_at,
        arriving_at: segs.at(-1)?.arriving_at,
        duration: s.duration || null,
        stops: Math.max(0, segs.length - 1),
        segments: segs.map((g) => ({
          flight: `${g.marketing_carrier?.iata_code || ''}${g.marketing_carrier_flight_number || ''}`,
          carrier: g.marketing_carrier?.name || null,
          from: g.origin?.iata_code,
          to: g.destination?.iata_code,
          departing_at: g.departing_at,
          arriving_at: g.arriving_at,
        })),
      };
    }),
  };
}

// Cheapest first, but never hide the best nonstop.
function rank(offers, limit) {
  const byPrice = [...offers].sort((a, b) => a.total_cents - b.total_cents);
  const out = byPrice.slice(0, limit);
  const nonstop = byPrice.find((o) => o.slices.every((s) => s.stops === 0));
  if (nonstop && !out.includes(nonstop)) out[out.length - 1] = nonstop;
  return out;
}

// ─── Demo (no token) ────────────────────────────────────────────────────────
function demo(now) {
  const offers = new Map();
  const id = (p) => `${p}_demo_${randomBytes(6).toString('hex')}`;
  const at = (day, hh, mm, plusMin = 0) => new Date(Date.parse(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`) + plusMin * 60_000).toISOString().slice(0, 19);
  const seg = (from, to, day, hh, mm, mins, flight) => ({ flight, carrier: 'Spot Air (demo)', from, to, departing_at: at(day, hh, mm), arriving_at: at(day, hh, mm, mins) });
  const slice = (from, to, day, hh, mm, via) => {
    const segments = via ? [seg(from, via, day, hh, mm, 110, 'SP' + (100 + hh)), seg(via, to, day, hh + 3, mm, 130, 'SP' + (400 + hh))] : [seg(from, to, day, hh, mm, 215, 'SP' + (200 + hh))];
    return { from, to, from_city: null, to_city: null, departing_at: segments[0].departing_at, arriving_at: segments.at(-1).arriving_at, duration: null, stops: segments.length - 1, segments };
  };
  return {
    mode: 'demo',
    async places(query) {
      const q = String(query || '').trim().toUpperCase();
      return q.length >= 3 && IATA.test(q.slice(0, 3)) ? [{ code: q.slice(0, 3), name: `${q.slice(0, 3)} (demo airport)`, type: 'airport', city: null }] : [];
    },
    async search(input, { limit = 5 } = {}) {
      const s = validateSearch(input);
      const plans = [
        { price: 18900, hh: 6, mm: 5, via: 'DEN', refundable: false },
        { price: 24900, hh: 9, mm: 40, via: null, refundable: false },
        { price: 31200, hh: 17, mm: 15, via: null, refundable: true },
      ];
      const list = plans.map((p) => {
        const total = p.price * s.adults * s.slices.length;
        const o = {
          id: id('off'),
          total_amount: (total / 100).toFixed(2),
          total_cents: total,
          currency: 'USD',
          expires_at: new Date(now() + 30 * 60_000).toISOString(),
          airline: { name: 'Spot Air (demo)', code: 'SP', logo: null },
          cabin: s.cabin_class,
          passengers: Array.from({ length: s.adults }, () => ({ id: id('pas'), type: 'adult' })),
          conditions: { refundable: p.refundable, changeable: true },
          slices: s.slices.map((sl) => slice(sl.origin, sl.destination, sl.departure_date, p.hh, p.mm, p.via)),
        };
        offers.set(o.id, o);
        return o;
      });
      return rank(list.filter((o) => s.max_connections === null || o.slices.every((x) => x.stops <= s.max_connections)), limit);
    },
    async offer(offerId) {
      const o = offers.get(offerId);
      if (!o || Date.parse(o.expires_at) < now()) throw Object.assign(new CartError('That fare is no longer available. Ask your assistant to search again.', 410), { code: 'offer_no_longer_available' });
      return o;
    },
    async book({ offer }) {
      await this.offer(offer.id);
      return { order_id: id('ord'), booking_reference: randomBytes(3).toString('hex').toUpperCase() };
    },
  };
}
