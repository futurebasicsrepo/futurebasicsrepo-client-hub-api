import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap">
      <div className="empty" style={{ marginTop: 48 }}>
        <div className="display">Offside.</div>
        <p>That page isn’t on the pitch.</p>
        <Link href="/" className="btn btn-primary">Back to the feed</Link>
      </div>
    </div>
  );
}
