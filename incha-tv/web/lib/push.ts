'use client';

import { API_URL, api, getToken } from './api';

/** Where this device stands on match alerts. */
export type PushState = 'unsupported' | 'needs-install' | 'unconfigured' | 'denied' | 'off' | 'on';

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let keyPromise: Promise<string | null> | null = null;
const serverKey = () => (keyPromise ??= api<{ publicKey: string | null }>('/v1/push/key').then(d => d.publicKey, () => null));

function keyBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  // iPhone only allows web push from an installed (Home Screen) app.
  if (isIOS() && !installed()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (!(await serverKey())) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Asks permission (must run from a tap), subscribes this device and links it to the signed-in account. */
export async function enablePush(): Promise<PushState> {
  const state = await pushState();
  if (state === 'on' || state === 'unsupported' || state === 'needs-install' || state === 'unconfigured' || state === 'denied') {
    if (state === 'on') await linkPush();
    return state;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const key = await serverKey();
  const subscription = (await registration.pushManager.getSubscription())
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key!) });
  await api('/v1/push/subscriptions', { method: 'POST', body: subscription.toJSON() });
  return 'on';
}

export async function disablePush() {
  const subscription = supported() ? await currentSubscription() : null;
  if (!subscription) return;
  await api('/v1/push/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

/** Re-links an existing subscription to whoever is signed in on this device (quiet; no prompts). */
export async function linkPush() {
  if (!supported() || Notification.permission !== 'granted' || !getToken()) return;
  const subscription = await currentSubscription();
  if (subscription) await api('/v1/push/subscriptions', { method: 'POST', body: subscription.toJSON() }).catch(() => {});
}

/** On sign-out, stop this device getting the previous account's alerts. Uses the token before it's cleared. */
export function unlinkPush(token: string | null) {
  if (!token || typeof window === 'undefined' || !supported()) return;
  currentSubscription().then(subscription => {
    if (!subscription) return;
    fetch(`${API_URL}/v1/push/subscriptions`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      keepalive: true
    }).catch(() => {});
  }).catch(() => {});
}

export const PUSH_HELP: Record<PushState, string> = {
  unsupported: 'This browser can’t show match alerts.',
  'needs-install': 'On iPhone, add incha.tv to your Home Screen (Share → Add to Home Screen), then open it from there to turn on alerts.',
  unconfigured: 'Alerts aren’t switched on for incha.tv yet.',
  denied: 'Notifications are blocked for incha.tv. Allow them in your browser or phone settings.',
  off: 'Turn on alerts to hear about goals as they happen.',
  on: 'Alerts are on for this device.'
};
