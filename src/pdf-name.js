// What a PDF is called when it is downloaded or emailed: the client's name, then what it is and its number, e.g.
// "Comet over Delphi - Receipt R-1043.pdf" or "Comet over Delphi - Agreement FB-C-2026-004.pdf". A phone that saves or shares it keeps that name.
const clean = s => String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
export function pdfName(client, what) {
  const name = [clean(client), clean(what)].filter(Boolean).join(' - ').slice(0, 150).trim() || 'Future Basics';
  return `${name}.pdf`;
}
// The Content-Disposition header for it: a plain-ASCII name for old browsers, and the exact name (accents and all) for the rest.
export function disposition(name, { inline = true } = {}) {
  const ascii = String(name).normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '').replace(/\s+/g, ' ').trim() || 'document.pdf';
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
