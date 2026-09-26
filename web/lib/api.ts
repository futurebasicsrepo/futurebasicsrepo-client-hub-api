export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
// Vercel exposes the project's production host to Next.js builds, so share links work before a custom domain is set.
const vercelHost = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || (vercelHost ? `https://${vercelHost}` : 'http://localhost:3000')).replace(/\/$/, '');

export type Visibility = 'public' | 'unlisted' | 'private';
export type FilterName = 'none' | 'terrace' | 'matchday' | 'floodlight' | 'vintage' | 'mono';
export type Sort = 'hot' | 'new' | 'top';

export interface User { id: number; handle: string; displayName: string; bio: string; createdAt: string }
export interface Profile extends Omit<User, 'id'> { postCount: number; totalScore: number }
export interface Fandom { slug: string; name: string; postCount?: number }

export interface Post {
  id: string;
  title: string;
  description: string;
  kind: 'video' | 'image';
  mediaUrl: string;
  mediaMime: string;
  coverUrl: string | null;
  duration: number | null;
  trimStart: number | null;
  trimEnd: number | null;
  filter: FilterName;
  status: 'draft' | 'published';
  visibility: Visibility;
  score: number;
  commentCount: number;
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  fandom: Fandom | null;
  creator: { handle: string; displayName: string };
  viewerHasVoted: boolean;
  isOwner: boolean;
}

export interface Comment {
  id: number;
  parentId: number | null;
  body: string | null;
  deleted: boolean;
  createdAt: string;
  author: { handle: string; displayName: string } | null;
  canDelete: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const TOKEN_KEY = 'incha.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable (private mode) */ }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
    cache: 'no-store'
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

// Multipart upload with progress, which fetch() can't report.
export function uploadFile<T>(path: string, file: Blob, filename: string, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    xhr.onload = () => {
      let data: { error?: string } = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* non-JSON body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(data.error || `Upload failed (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('Network error during upload.', 0));
    const form = new FormData();
    form.append('file', file, filename);
    xhr.send(form);
  });
}

// Server-side fetch for metadata; returns null on any failure.
export async function fetchPublicPost(id: string): Promise<Post | null> {
  try {
    const res = await fetch(`${API_URL}/v1/posts/${encodeURIComponent(id)}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()).post as Post;
  } catch {
    return null;
  }
}
