import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
class Bucket {
  records = new Map();
  async get(key) {
    const record = this.records.get(key);
    return record && { etag: record.etag, json: async () => JSON.parse(record.body) };
  }
  async put(key, body, options = {}) {
    const existing = this.records.get(key);
    if (options.onlyIf?.etagMatches && existing?.etag !== options.onlyIf.etagMatches) return null;
    if (options.onlyIf?.etagDoesNotMatch === '*' && existing) return null;
    const etag = crypto.randomUUID();
    this.records.set(key, { body, etag });
    return { etag };
  }
  async delete(key) { this.records.delete(key); }
}
const env = { BUCKET: new Bucket(), CMS_PASSWORD: crypto.randomUUID() };
let cookie = '', csrf = '';
async function call(path, method = 'GET', body, origin = 'https://example.com') {
  return worker.fetch(new Request('https://example.com/api/cms/' + path, {
    method, headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env);
}
assert.equal((await call('content')).status, 401);
assert.equal((await call('login', 'POST', { username: 'admin', password: 'wrong' })).status, 401);
const login = await call('login', 'POST', { username: 'admin', password: env.CMS_PASSWORD });
assert.equal(login.status, 200);
cookie = login.headers.get('Set-Cookie').split(';')[0];
csrf = (await login.json()).csrf;
assert.equal((await call('content')).status, 200);
assert.equal((await call('content', 'PUT', { values: {}, revision: null }, 'https://evil.example')).status, 403);
assert.equal((await call('content', 'PUT', { values: { unknown: 'test' }, revision: null })).status, 400);
const saved = await call('content', 'PUT', { values: { 'text-001': 'Test' }, revision: null });
assert.equal(saved.status, 200);
assert.equal((await call('content', 'PUT', { values: {}, revision: null })).status, 409);
assert.equal((await (await call('content')).json()).values['text-001'], 'Test');
assert.equal((await call('logout', 'POST', {})).status, 200);
assert.equal((await call('content')).status, 401);
console.log('Passed authentication, persistence, validation, CSRF, conflict and logout checks.');
