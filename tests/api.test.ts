import { afterEach, describe, expect, it, vi } from 'vitest';
import { isReminder, isSubscription } from '../api/_lib.js';
import schedule from '../api/schedule.js';
import cancel from '../api/cancel.js';
import send from '../api/send.js';
import config from '../api/config.js';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://app.example/api/x', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } };
const reminder = { id: 'r1', at: Date.now() + 60000, title: 't', body: 'b', tag: 'x' };

afterEach(() => vi.unstubAllEnvs());

describe('validation', () => {
  it('accepts only real push services', () => {
    expect(isSubscription(sub)).toBe(true);
    expect(isSubscription({ ...sub, endpoint: 'https://web.push.apple.com/abc' })).toBe(true);
    expect(isSubscription({ ...sub, endpoint: 'https://evil.example/hook' })).toBe(false);
    expect(isSubscription({ ...sub, endpoint: 'http://fcm.googleapis.com/x' })).toBe(false);
    expect(isSubscription({ ...sub, endpoint: 'https://fcm.googleapis.com.evil.example/x' })).toBe(false);
    expect(isSubscription({ endpoint: sub.endpoint })).toBe(false);
    expect(isSubscription(null)).toBe(false);
  });
  it('validates reminders', () => {
    expect(isReminder(reminder)).toBe(true);
    expect(isReminder({ ...reminder, at: 'soon' })).toBe(false);
    expect(isReminder({ ...reminder, title: 'x'.repeat(201) })).toBe(false);
    expect(isReminder(null)).toBe(false);
  });
});

describe('handlers', () => {
  it('report missing configuration', async () => {
    vi.stubEnv('QSTASH_TOKEN', '');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');
    expect((await schedule.fetch(post({ subscription: sub, reminders: [reminder] }))).status).toBe(501);
    expect((await cancel.fetch(post({ ids: ['a'] }))).status).toBe(501);
    expect((await send.fetch(post({}))).status).toBe(501);
    expect(await (await config.fetch(new Request('https://app.example/api/config'))).json()).toEqual({ push: false });
  });

  it('reject wrong methods', async () => {
    expect((await schedule.fetch(new Request('https://app.example/api/schedule'))).status).toBe(405);
    expect((await config.fetch(post({}))).status).toBe(405);
  });

  it('reject invalid payloads', async () => {
    vi.stubEnv('QSTASH_TOKEN', 'test');
    expect((await schedule.fetch(post('not json'))).status).toBe(400);
    expect((await schedule.fetch(post({ subscription: { ...sub, endpoint: 'https://evil.example/' }, reminders: [reminder] }))).status).toBe(400);
    expect((await schedule.fetch(post({ subscription: sub, reminders: Array(11).fill(reminder) }))).status).toBe(400);
    expect((await cancel.fetch(post({ ids: ['../x'] }))).status).toBe(400);
  });

  it('send rejects unsigned requests', async () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'k1');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'k2');
    vi.stubEnv('VAPID_PUBLIC_KEY', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls');
    expect((await send.fetch(post({ subscription: sub, notification: {} }))).status).toBe(401);
    expect((await send.fetch(post({ subscription: sub, notification: {} }, { 'upstash-signature': 'bogus' }))).status).toBe(401);
  });
});
