import Link from 'next/link';
import Feed from '@/components/Feed';
import FandomChips from '@/components/FandomChips';
import LiveStrip from '@/components/LiveStrip';

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="wrap">
      {!q && (
        <section className="hero">
          <div className="stripe" aria-hidden="true">HINCHAS · HINCHAS · HINCHAS · HINCHAS</div>
          <h1 className="display">For the fans.<br /><span className="flare">By the fans.</span></h1>
          <p>Goals from the stands, tifos, away days, pickup games, and the madness in between. Upload your moments, trim them, and share them with your fandom.</p>
          <div className="row">
            <Link href="/watch" className="btn btn-primary watch-cta">▶ Start watching</Link>
            <Link href="/upload" className="btn">Upload a moment</Link>
          </div>
        </section>
      )}
      {!q && <LiveStrip />}
      {!q && <FandomChips />}
      <Feed q={q} />
    </div>
  );
}
