// The API: /api/public (website), /api/staff (dashboard), /api/webhooks.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config';
import { HttpError } from './lib/util';
import { calendarRoutes, publicRoutes } from './routes/public';
import { staffRoutes } from './routes/staff';
import { webhookRoutes } from './routes/webhooks';
import { hashPassword, seed, upgrade } from './seed';
import { DynamoStore } from './store/dynamo';
import { FileStore } from './store/file';
import type { Store } from './store/store';
import type { Settings, Staff } from './types';

export async function makeStore(): Promise<Store> {
  const store: Store = config.tableName ? new DynamoStore(config.tableName) : new FileStore(config.dataFile);
  if (!(await store.get<Settings>('settings', 'settings'))) await seed(store);
  await upgrade(store);
  // owner password added to the keys after the first deploy: set it once
  if (config.owner.password) {
    const owner = (await store.list<Staff>('staff')).find((s) => s.role === 'owner' && !s.passwordHash);
    if (owner) await store.put('staff', { ...owner, passwordHash: hashPassword(config.owner.password) });
  }
  return store;
}

export function makeApp(store: Store) {
  const app = new Hono().basePath('/api');
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
    console.error(err);
    return c.json({ error: 'Something went wrong on our side. Please try again.' }, 500);
  });
  app.get('/health', (c) => c.json({ ok: true }));
  // the website calls in from its own domain (www has no /api of its own)
  const site = new URL(config.siteUrl);
  const siteOrigins = [site.origin, `${site.protocol}//${site.host.replace(/^www\./, '')}`];
  app.use('/public/*', cors({ origin: siteOrigins, allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowHeaders: ['Content-Type'], maxAge: 86400 }));
  app.route('/public', publicRoutes(store));
  app.route('/cal', calendarRoutes(store));
  app.route('/staff', staffRoutes(store));
  app.route('/webhooks', webhookRoutes(store));
  return app;
}
