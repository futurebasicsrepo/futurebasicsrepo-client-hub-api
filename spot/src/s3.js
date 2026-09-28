// A tiny S3 client (put, get, list, delete) with AWS Signature V4, enough for
// backups to a Railway bucket or any S3-compatible store, with no SDK.
import { createHash, createHmac } from 'node:crypto';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const hmac = (key, s) => createHmac('sha256', key).update(s).digest();
// RFC 3986 encoding, as SigV4 wants it.
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// Signs a request. Returns the headers to send (including Authorization).
export function signV4({ method, url, headers = {}, bodyHash, accessKeyId, secretAccessKey, region = 'auto', service = 's3', date = new Date() }) {
  const u = new URL(url);
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const all = { ...headers, host: u.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': bodyHash };
  const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const path = u.pathname.split('/').map((p) => enc(decodeURIComponent(p))).join('/') || '/';
  const query = [...u.searchParams].map(([k, v]) => [enc(k), enc(v)]).sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&');
  const signed = names.join(';');
  const canonical = [method, path, query, names.map((n) => `${n}:${lower[n]}\n`).join(''), signed, bodyHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...lower, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}` };
}

// { endpoint, bucket, region, accessKeyId, secretAccessKey, pathStyle }
export function createS3({ endpoint, bucket, region = 'auto', accessKeyId, secretAccessKey, pathStyle = false, fetchImpl = fetch }) {
  const base = new URL(endpoint);
  const urlFor = (key = '', params) => {
    const u = new URL(base);
    if (pathStyle) u.pathname = `/${bucket}/${key}`;
    else {
      u.hostname = `${bucket}.${base.hostname}`;
      u.pathname = `/${key}`;
    }
    for (const [k, v] of Object.entries(params || {})) if (v !== undefined) u.searchParams.set(k, v);
    return u.toString();
  };
  async function call(method, key, { body, params, headers = {} } = {}) {
    const url = urlFor(key, params);
    const bodyHash = sha(body || '');
    const h = signV4({ method, url, headers, bodyHash, accessKeyId, secretAccessKey, region });
    delete h.host;
    const res = await fetchImpl(url, { method, headers: h, body });
    if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
      const text = await res.text().catch(() => '');
      const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
      throw new Error(`S3 ${method} ${key || '/'} failed: ${res.status}${code ? ` ${code}` : ''}`);
    }
    return res;
  }
  const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return {
    put: (key, body, contentType = 'application/octet-stream') => call('PUT', key, { body, headers: { 'content-type': contentType } }),
    get: async (key) => Buffer.from(await (await call('GET', key)).arrayBuffer()),
    del: (key) => call('DELETE', key),
    async list(prefix) {
      const out = [];
      let token;
      do {
        const xml = await (await call('GET', '', { params: { 'list-type': '2', prefix, 'continuation-token': token } })).text();
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const key = unxml(/<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1] || '');
          out.push({ key, size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] || 0), modified: /<LastModified>([^<]+)</.exec(m[1])?.[1] || null });
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? unxml(/<NextContinuationToken>([^<]+)</.exec(xml)?.[1] || '') || undefined : undefined;
      } while (token);
      return out;
    },
  };
}
