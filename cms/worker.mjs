import { files, fields } from './generated.mjs';

const encoder = new TextEncoder();
const json = (value, status = 200, headers = {}) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store', ...headers }
});
const cookie = (token, age = 28800) =>
  `cms_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;

async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function session(request, env) {
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)cms_session=([a-f0-9-]+)/)?.[1];
  if (!token) return null;
  const record = await env.BUCKET.get('sessions/' + await digest(token));
  if (!record) return null;
  const value = await record.json();
  return value.expires > Date.now() ? { token, csrf: value.csrf } : null;
}

async function content(env) {
  const record = await env.BUCKET.get('content/published.json');
  return record
    ? { values: await record.json(), revision: record.etag }
    : { values: {}, revision: null };
}

function validValue(id, value) {
  const field = fields[id];
  if (!field || typeof value !== 'string' || value.length > 10000) return false;
  if (field.type === 'text') return true;
  if (value.startsWith('/media/') || value.startsWith('assets/')) return !value.includes('..');
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

async function api(request, env, path) {
  if (request.method !== 'GET' && request.headers.get('Origin') !== new URL(request.url).origin)
    return json({ error: 'Недопустимый источник запроса' }, 403);
  if (path === '/api/cms/login' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = 'attempts/' + await digest(ip);
    const previous = await env.BUCKET.get(key);
    let attempts = previous ? await previous.json() : { count: 0, expires: 0 };
    if (attempts.expires < Date.now()) attempts = { count: 0, expires: Date.now() + 900000 };
    if (attempts.count >= 10) return json({ error: 'Слишком много попыток. Повторите через 15 минут.' }, 429);
    const body = await request.json();
    const supplied = await digest(String(body.password || ''));
    const expected = await digest('Speller7!');
    let difference = 0;
    for (let i = 0; i < supplied.length; i++) difference |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
    if (body.username !== 'admin' || difference) {
      attempts.count++;
      await env.BUCKET.put(key, JSON.stringify(attempts));
      return json({ error: 'Неверный логин или пароль' }, 401);
    }
    await env.BUCKET.delete(key);
    const token = crypto.randomUUID() + crypto.randomUUID();
    const csrf = crypto.randomUUID();
    await env.BUCKET.put('sessions/' + await digest(token), JSON.stringify({ csrf, expires: Date.now() + 28800000 }));
    return json({ csrf }, 200, { 'Set-Cookie': cookie(token) });
  }
  const user = await session(request, env);
  if (!user) return json({ error: 'Войдите в админку' }, 401);
  if (request.method !== 'GET' && request.headers.get('X-CSRF-Token') !== user.csrf)
    return json({ error: 'Обновите страницу и повторите вход' }, 403);
  if (path === '/api/cms/session') return json({ csrf: user.csrf });
  if (path === '/api/cms/logout' && request.method === 'POST') {
    await env.BUCKET.delete('sessions/' + await digest(user.token));
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (path === '/api/cms/content' && request.method === 'GET')
    return json({ ...await content(env), fields });
  if (path === '/api/cms/content' && request.method === 'PUT') {
    if (Number(request.headers.get('Content-Length')) > 1000000) return json({ error: 'Слишком большой запрос' }, 413);
    const body = await request.json();
    if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values) ||
      Object.entries(body.values).some(([id, value]) => !validValue(id, value)))
      return json({ error: 'Проверьте значения полей' }, 400);
    const saved = await env.BUCKET.put('content/published.json', JSON.stringify(body.values), {
      onlyIf: body.revision ? { etagMatches: body.revision } : { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json' }
    });
    if (!saved) return json({ error: 'Контент уже изменён в другой вкладке. Обновите редактор перед сохранением.' }, 409);
    return json({ revision: saved.etag });
  }
  if (path === '/api/cms/upload' && request.method === 'POST') {
    const type = request.headers.get('Content-Type') || '';
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' };
    if (!extensions[type]) return json({ error: 'Поддерживаются JPG, PNG, WebP, GIF, MP4 и WebM' }, 400);
    const data = await request.arrayBuffer();
    if (data.byteLength > 20 * 1024 * 1024) return json({ error: 'Максимальный размер файла — 20 МБ' }, 413);
    const key = 'media/' + crypto.randomUUID() + '.' + extensions[type];
    await env.BUCKET.put(key, data, { httpMetadata: { contentType: type } });
    return json({ url: '/' + key });
  }
  return json({ error: 'Маршрут не найден' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/cms/')) return await api(request, env, path);
      if (path.startsWith('/media/')) {
        const object = await env.BUCKET.get(path.slice(1), { range: request.headers });
        if (!object) return new Response('Not found', { status: 404 });
        const headers = new Headers({ 'Cache-Control': 'public,max-age=31536000,immutable', 'X-Content-Type-Options': 'nosniff' });
        object.writeHttpMetadata(headers);
        headers.set('Accept-Ranges', 'bytes');
        if (object.range) {
          headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
          return new Response(object.body, { status: 206, headers });
        }
        return new Response(object.body, { headers });
      }
      const filePath = path === '/' || path === '/index.html' ? '/index.html'
        : path === '/cpanel' || path === '/cpanel/' ? '/cpanel.html' : path;
      const file = files[filePath];
      if (!file) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
      const headers = { 'Content-Type': file.type, 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' };
      if (filePath !== '/index.html') return new Response(file.text, { headers });
      const { values } = await content(env);
      const editing = url.searchParams.has('edit') && !!await session(request, env);
      let html = file.text;
      if (editing) html = html.replace('</head>', '<link rel="stylesheet" href="/editor-bridge.css"></head>')
        .replace('</body>', '<script src="/editor-bridge.js"></script></body>');
      return new HTMLRewriter().on('[data-cms]', {
        element(element) {
          const id = element.getAttribute('data-cms');
          if (!Object.hasOwn(values, id)) return;
          const field = fields[id];
          if (field.type === 'text') element.setInnerContent(values[id]);
          else element.setAttribute(field.attribute, values[id]);
        }
      }).transform(new Response(html, { headers }));
    } catch (error) {
      console.error('CMS request failed', error.message);
      return json({ error: 'Не удалось выполнить запрос. Повторите попытку.' }, 500);
    }
  }
};
