// Reads the Design Lab shares between its routes: the brand code, the library as rows for the trend read, and the trend read itself.
import { cleanBrandCode } from './lab.js';
import { trendRead } from './lab-plan.js';

export function createLabData(pool, getSetting) {
  const loadCode = async () => cleanBrandCode(await getSetting('labBrandCode').catch(() => null) || {});
  const library = async days => (await pool.query(`select i.id, i.title, i.category, i.price_cents, i.heat, i.first_seen_at, i.attrs, b.name brand, b.role from lab_items i left join lab_brands b on b.id=i.brand_id
    where i.status<>'hidden' and i.last_seen_at > now() - ($1 || ' days')::interval order by i.last_seen_at desc limit 6000`, [String(days)])).rows.map(r => ({ id: r.id, title: r.title, category: r.category, price: r.price_cents == null ? null : r.price_cents / 100, heat: r.heat, firstSeenAt: r.first_seen_at, attrs: r.attrs || {}, brand: r.brand || '', role: r.role || 'reference' }));
  const trendsFor = async days => trendRead(await library(days));
  return { loadCode, library, trendsFor };
}
