import type { FilterName } from './api';

export const FILTERS: { name: FilterName; label: string; css: string }[] = [
  { name: 'none', label: 'Raw', css: 'none' },
  { name: 'terrace', label: 'Terrace', css: 'contrast(1.15) saturate(1.3)' },
  { name: 'matchday', label: 'Matchday', css: 'saturate(1.55) contrast(1.05) brightness(1.05)' },
  { name: 'floodlight', label: 'Floodlight', css: 'brightness(1.1) contrast(1.3) saturate(0.85)' },
  { name: 'vintage', label: 'Vintage', css: 'sepia(0.4) contrast(1.05) saturate(0.85)' },
  { name: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.2)' }
];

export const filterCss = (name: FilterName | undefined) => FILTERS.find(f => f.name === name)?.css ?? 'none';

export function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function timeAgo(iso: string | null) {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const steps: [number, string][] = [[60, 's'], [60, 'm'], [24, 'h'], [7, 'd'], [4.35, 'w'], [12, 'mo']];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (value < size) return unit === 's' ? 'just now' : `${Math.floor(value)}${unit} ago`;
    value /= size;
  }
  return `${Math.floor(value)}y ago`;
}

export function clock(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = (s % 60).toFixed(1).padStart(4, '0');
  return `${m}:${rest}`;
}

export function runtime(post: { duration: number | null; trimStart: number | null; trimEnd: number | null }) {
  if (!post.duration) return null;
  const length = (post.trimEnd ?? post.duration) - (post.trimStart ?? 0);
  const s = Math.round(length);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
