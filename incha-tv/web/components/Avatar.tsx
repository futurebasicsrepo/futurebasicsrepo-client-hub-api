export default function Avatar({ name, size }: { name: string; size?: 'sm' | 'lg' }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return <span className={`avatar${size ? ` ${size}` : ''}`} aria-hidden="true">{initial}</span>;
}
