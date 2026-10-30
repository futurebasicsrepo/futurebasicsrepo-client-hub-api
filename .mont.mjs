import sharp from 'sharp';
const SP = process.env.SP, [out, cols0, ...files] = process.argv.slice(2), W = 420, H = 320, cols = +cols0;
const tiles = await Promise.all(files.map(f => sharp(`${SP}/${f}`).resize(W, H).toBuffer()));
const rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: '#ffffff' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * W, top: Math.floor(i / cols) * H }))).png().toFile(`${SP}/${out}`);
