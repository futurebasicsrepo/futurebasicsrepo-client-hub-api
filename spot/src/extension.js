// The "Spot this" browser extension (Chrome, Edge, Brave, Arc: any
// Chromium browser). Built on request with this server's address baked in,
// and served as a zip from /downloads/spot-extension.zip.
//
//   toolbar button / Alt+Shift+S   Spot the page you're on
//   right-click a page or link     "Spot this page" / "Spot this link"
//   right-click selected text      "Spot “…”" (a description, looked up)
//
// It asks for no host permissions and reads nothing on the page: it only
// hands the tab's URL (or the selection) to Spot's composer at /new.
import { crc32 } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';
import { mascotSvg } from './sharecard.js';

export const EXTENSION_VERSION = '0.1.0';

export function extensionFiles(origin) {
  const manifest = {
    manifest_version: 3,
    name: 'Spot this',
    version: EXTENSION_VERSION,
    description: 'Turn the page you’re on into a Spot: a link someone else can pay in one tap.',
    action: { default_title: 'Spot this page (Alt+Shift+S)', default_icon: icons() },
    icons: icons(),
    background: { service_worker: 'background.js' },
    permissions: ['contextMenus', 'activeTab'],
    commands: { _execute_action: { suggested_key: { default: 'Alt+Shift+S' }, description: 'Spot this page' } },
  };
  const background = `// Spot this: sends the page (or link, or selected text) to Spot.
const SPOT = ${JSON.stringify(origin)};
const web = (u) => /^https?:\\/\\//i.test(u || '');
const spotUrl = (u) => chrome.tabs.create({ url: SPOT + '/new?url=' + encodeURIComponent(u) });
const spotText = (t) => chrome.tabs.create({ url: SPOT + '/new?text=' + encodeURIComponent(t.slice(0, 500)) });

chrome.action.onClicked.addListener((tab) => {
  if (web(tab.url)) spotUrl(tab.url);
  else chrome.tabs.create({ url: SPOT + '/new' });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'page', title: 'Spot this page', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'link', title: 'Spot this link', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'text', title: 'Spot “%s”', contexts: ['selection'] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'link' && web(info.linkUrl)) return spotUrl(info.linkUrl);
  if (info.menuItemId === 'text' && info.selectionText) return spotText(info.selectionText);
  if (tab && web(tab.url)) spotUrl(tab.url);
});
`;
  const readme = `Spot this: browser extension ${EXTENSION_VERSION}

Install (Chrome, Edge, Brave, Arc):
1. Unzip this folder somewhere you'll keep it.
2. Open chrome://extensions and turn on "Developer mode" (top right).
3. Click "Load unpacked" and choose the unzipped folder.
4. Pin "Spot this" to your toolbar.

Use it: on any product or cart page, click the Spot button or press Alt+Shift+S.
You can also right-click a link or selected text and choose "Spot this".

It sends only the page address (or what you selected) to ${origin}.
`;
  const files = { 'manifest.json': JSON.stringify(manifest, null, 2), 'background.js': background, 'README.txt': readme };
  for (const size of [16, 32, 48, 128]) files[`icons/icon${size}.png`] = iconPng(size);
  return files;
}

function icons() {
  return Object.fromEntries([16, 32, 48, 128].map((s) => [String(s), `icons/icon${s}.png`]));
}

const iconCache = new Map();
function iconPng(size) {
  if (!iconCache.has(size)) {
    // Crop the mascot's shadow out so the face fills the icon.
    const svg = mascotSvg({ look: [0.3, 0.2], size }).replace('viewBox="0 0 200 200"', 'viewBox="18 18 164 164"').replace(/<ellipse cx="100" cy="186"[^>]*\/>/, '');
    iconCache.set(size, new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
  }
  return iconCache.get(size);
}

export function extensionZip(origin) {
  return zip(extensionFiles(origin));
}

// Minimal zip writer (stored, no compression): enough for a handful of small
// files, and keeps the server free of a zip dependency.
export function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const time = dosTime(new Date());
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time.time, 10);
    local.writeUInt16LE(time.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time.time, 12);
    central.writeUInt16LE(time.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // unix file mode
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}
