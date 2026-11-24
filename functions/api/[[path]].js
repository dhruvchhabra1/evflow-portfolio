// Admin + API for EVFlow portfolio. Bindings: DB (D1), BUCKET (R2). Secrets: SESSION_SECRET, ADMIN_PASSWORD, INSTRUCTOR_PASSWORD.
const enc = new TextEncoder();
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...h } });
const MAX = 25 * 1024 * 1024;
const INLINE = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];

async function sign(env, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

async function getRole(req, env) {
  if (!env.SESSION_SECRET) return null;
  const m = (req.headers.get('cookie') || '').match(/(?:^|; )sid=([^;]+)/);
  if (!m) return null;
  const [role, exp, sig] = m[1].split('.');
  if (!['admin', 'instructor'].includes(role) || Date.now() / 1000 > +exp || !sig) return null;
  return safeEq(sig, await sign(env, `${role}.${exp}`)) ? role : null;
}

export async function onRequest({ request, env, params }) {
  const path = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean);
  const method = request.method, role = await getRole(request, env);
  const [a, b] = path;
  try {
    if (a === 'me' && method === 'GET') return J({ role });

    if (a === 'login' && method === 'POST') {
      const { role: r, password } = await request.json();
      const expected = r === 'admin' ? env.ADMIN_PASSWORD : r === 'instructor' ? env.INSTRUCTOR_PASSWORD : null;
      if (!expected || !env.SESSION_SECRET || typeof password !== 'string' ||
        !safeEq(await sign(env, 'pw:' + password), await sign(env, 'pw:' + expected))) return J({ error: 'Wrong role or password' }, 401);
      const exp = Math.floor(Date.now() / 1000) + 8 * 3600;
      const v = `${r}.${exp}.${await sign(env, `${r}.${exp}`)}`;
      return J({ role: r }, 200, { 'set-cookie': `sid=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800` });
    }
    if (a === 'logout' && method === 'POST') return J({ ok: 1 }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });

    if (a === 'documents' && !b && method === 'GET') {
      const docs = (await env.DB.prepare('SELECT * FROM documents ORDER BY id DESC').all()).results;
      const vers = (await env.DB.prepare(`SELECT id,document_id,version,filename,size,content_type,uploaded_by,published,created_at FROM versions ${role ? '' : 'WHERE published=1'} ORDER BY version DESC`).all()).results;
      return J({ role, documents: docs.map(d => ({ ...d, versions: vers.filter(v => v.document_id === d.id) })).filter(d => role || d.versions.length) });
    }

    if (a === 'documents' && !b && method === 'POST') {
      if (!role) return J({ error: 'Login required' }, 401);
      const fd = await request.formData(), file = fd.get('file');
      if (!file || typeof file === 'string' || !file.size) return J({ error: 'Choose a file' }, 400);
      if (file.size > MAX) return J({ error: 'File is larger than 25 MB' }, 413);
      const now = new Date().toISOString();
      let docId = parseInt(fd.get('doc_id')) || null, version = 1;
      if (docId) {
        const row = await env.DB.prepare('SELECT MAX(version) m FROM versions WHERE document_id=?').bind(docId).first();
        if (!row || row.m === null) return J({ error: 'Document not found' }, 404);
        version = row.m + 1;
      } else {
        const title = String(fd.get('title') || '').trim().slice(0, 120) || file.name.slice(0, 120);
        const r = await env.DB.prepare('INSERT INTO documents(title,category,description,created_at) VALUES(?,?,?,?)')
          .bind(title, String(fd.get('category') || 'Other').slice(0, 40), String(fd.get('description') || '').slice(0, 500), now).run();
        docId = r.meta.last_row_id;
      }
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 100);
      const key = `docs/${docId}/v${version}-${crypto.randomUUID()}-${safe}`;
      await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
      await env.DB.prepare('INSERT INTO versions(document_id,version,r2_key,filename,size,content_type,uploaded_by,published,created_at) VALUES(?,?,?,?,?,?,?,1,?)')
        .bind(docId, version, key, file.name.slice(0, 200), file.size, file.type || 'application/octet-stream', role, now).run();
      return J({ ok: 1, document_id: docId, version });
    }

    if (a === 'documents' && b && method === 'DELETE') {
      if (role !== 'admin') return J({ error: 'Admin only' }, 403);
      const id = parseInt(b);
      const keys = (await env.DB.prepare('SELECT r2_key FROM versions WHERE document_id=?').bind(id).all()).results;
      for (const k of keys) await env.BUCKET.delete(k.r2_key);
      await env.DB.batch([env.DB.prepare('DELETE FROM versions WHERE document_id=?').bind(id), env.DB.prepare('DELETE FROM documents WHERE id=?').bind(id)]);
      return J({ ok: 1 });
    }

    if (a === 'versions' && b && method === 'PATCH') {
      if (role !== 'admin') return J({ error: 'Admin only' }, 403);
      const { published } = await request.json();
      await env.DB.prepare('UPDATE versions SET published=? WHERE id=?').bind(published ? 1 : 0, parseInt(b)).run();
      return J({ ok: 1 });
    }

    if (a === 'files' && b && method === 'GET') {
      const v = await env.DB.prepare('SELECT * FROM versions WHERE id=?').bind(parseInt(b)).first();
      if (!v || (!v.published && !role)) return J({ error: 'Not found' }, 404);
      const obj = await env.BUCKET.get(v.r2_key);
      if (!obj) return J({ error: 'File missing' }, 404);
      const type = v.content_type || 'application/octet-stream';
      return new Response(obj.body, { headers: {
        'content-type': type, 'x-content-type-options': 'nosniff',
        'content-disposition': `${INLINE.includes(type) ? 'inline' : 'attachment'}; filename="${v.filename.replace(/[^\w.\- ]+/g, '_')}"`,
        'content-security-policy': "default-src 'none'; sandbox" } });
    }
    return J({ error: 'Not found' }, 404);
  } catch (e) { return J({ error: 'Server error: ' + e.message }, 500); }
}
