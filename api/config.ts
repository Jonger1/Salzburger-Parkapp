import { json } from './_lib.js';

// Zeigt, ob der Push-Server vollständig konfiguriert ist (ohne Geheimnisse preiszugeben).
function handle(): Response {
  const e = process.env;
  return json({
    push: Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.QSTASH_TOKEN && e.QSTASH_CURRENT_SIGNING_KEY && e.QSTASH_NEXT_SIGNING_KEY),
  });
}

export default {
  fetch(request: Request): Response | Promise<Response> {
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    return handle();
  },
};
