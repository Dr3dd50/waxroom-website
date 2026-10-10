// AWS entry points: the API (behind CloudFront at /api/*) and the 15-minute
// scheduled run that sends timed texts.
import { handle } from 'hono/aws-lambda';
import { makeApp, makeStore } from './app';
import { runDueTexts } from './services/notify';

const ready = makeStore();
const app = ready.then(makeApp);

export const api = async (event: unknown, context: unknown) => handle(await app)(event as never, context as never);
export const tick = async () => runDueTexts(await ready);
