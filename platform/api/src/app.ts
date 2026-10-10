// The API: /api/public (website), /api/staff (dashboard), /api/webhooks.
import { Hono } from 'hono';
import { config } from './config';
import { HttpError } from './lib/util';
import { publicRoutes } from './routes/public';
import { staffRoutes } from './routes/staff';
import { webhookRoutes } from './routes/webhooks';
import { seed } from './seed';
import { DynamoStore } from './store/dynamo';
import { FileStore } from './store/file';
import type { Store } from './store/store';
import type { Settings } from './types';

export async function makeStore(): Promise<Store> {
  const store: Store = config.tableName ? new DynamoStore(config.tableName) : new FileStore(config.dataFile);
  if (!(await store.get<Settings>('settings', 'settings'))) await seed(store);
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
  app.route('/public', publicRoutes(store));
  app.route('/staff', staffRoutes(store));
  app.route('/webhooks', webhookRoutes(store));
  return app;
}
