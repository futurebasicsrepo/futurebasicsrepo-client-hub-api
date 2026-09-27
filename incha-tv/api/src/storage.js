// Local-disk media storage. On Railway this is a persistent volume mounted at /data.
// Kept behind this small interface so an S3/R2 bucket can replace it later.
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const root = process.env.MEDIA_DIR || './media';
mkdirSync(root, { recursive: true });

export const pathFor = key => join(root, key);

export async function save(key, stream) {
  await pipeline(stream, createWriteStream(pathFor(key), { flags: 'wx' }));
  return (await stat(pathFor(key))).size;
}

export async function size(key) {
  try { return (await stat(pathFor(key))).size; } catch { return null; }
}

export const read = (key, range) => createReadStream(pathFor(key), range || undefined);

export async function remove(key) {
  if (!key) return;
  try { await unlink(pathFor(key)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
