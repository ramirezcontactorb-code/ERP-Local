// MR · Sistema Local — API para guardar los datos en Neon (Postgres) desde Vercel.
// Vercel lee la conexión desde la variable DATABASE_URL (la crea sola la integración Neon de Vercel).
const { neon } = require('@neondatabase/serverless');

let ready = null;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return res.status(500).json({ error: 'Falta la variable DATABASE_URL en Vercel' });
  const sql = neon(url);
  try {
    if (!ready) {
      ready = sql`create table if not exists mr_docs (
        path text primary key,
        parent text not null,
        data jsonb not null,
        updated_at timestamptz not null default now())`;
    }
    await ready;

    if (req.method === 'GET') {
      const since = req.query && req.query.since;
      const rows = since
        ? await sql`select path, data, updated_at from mr_docs where updated_at >= ${since} order by updated_at`
        : await sql`select path, data, updated_at from mr_docs order by path`;
      return res.status(200).json({ rows });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      const path = String((body && body.path) || '');
      if (!path || body.data === undefined) return res.status(400).json({ error: 'Faltan path o data' });
      const parent = path.split('/').slice(0, -1).join('/');
      const rows = await sql`insert into mr_docs (path, parent, data, updated_at)
        values (${path}, ${parent}, ${JSON.stringify(body.data)}::jsonb, now())
        on conflict (path) do update set data = excluded.data, parent = excluded.parent, updated_at = now()
        returning updated_at`;
      return res.status(200).json({ ok: true, updated_at: rows[0] && rows[0].updated_at });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    ready = null;
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
