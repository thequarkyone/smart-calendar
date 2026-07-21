import type { FastifyInstance } from 'fastify';
import type { TilesService } from '../services/tiles.js';
import type { EventBus } from '../event-bus.js';

const MOTD_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quick Message</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:1.5rem}
  .card{width:100%;max-width:480px;background:#161b22;border:1px solid #21262d;border-radius:12px;padding:1.5rem;display:flex;flex-direction:column;gap:1rem}
  h1{font-size:1.25rem;font-weight:600}
  p{font-size:0.85rem;color:#8b949e}
  textarea{width:100%;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#e6edf3;font-size:1rem;padding:0.75rem;resize:vertical;min-height:120px;font-family:inherit}
  textarea:focus{outline:none;border-color:#4a90e2}
  label{font-size:0.8rem;color:#8b949e}
  input[type=datetime-local]{width:100%;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#e6edf3;padding:0.5rem 0.75rem;font-size:0.9rem;font-family:inherit}
  input[type=datetime-local]:focus{outline:none;border-color:#4a90e2}
  .actions{display:flex;gap:0.75rem;align-items:center}
  button{background:#4a90e2;color:#fff;border:none;border-radius:8px;padding:0.6rem 1.4rem;font-size:0.95rem;font-weight:600;cursor:pointer}
  button:hover{background:#5da0f0}
  button:disabled{opacity:0.5;cursor:default}
  .clear-btn{background:transparent;border:1px solid #30363d;color:#8b949e;font-weight:400}
  .clear-btn:hover{border-color:#8b949e;color:#e6edf3}
  #status{font-size:0.85rem}
  .ok{color:#3fb950}.err{color:#f85149}
</style>
</head>
<body>
<div class="card">
  <div>
    <h1>Quick Message</h1>
    <p>Display a message on the smart display right now.</p>
  </div>
  <textarea id="msg" maxlength="500" placeholder="Type your message…" rows="4"></textarea>
  <div>
    <label for="exp">Expires (optional)</label>
    <input type="datetime-local" id="exp">
  </div>
  <div class="actions">
    <button id="send">Send</button>
    <button class="clear-btn" id="clr">Clear message</button>
    <span id="status"></span>
  </div>
</div>
<script>
async function post(message, expiresAt) {
  const body = { message };
  if (expiresAt) body.expiresAt = expiresAt;
  const r = await fetch('/api/motd', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (r.status === 401) { location.replace('/'); return; }
  if (!r.ok) throw new Error(await r.text());
}
document.getElementById('send').addEventListener('click', async () => {
  const btn = document.getElementById('send');
  const st = document.getElementById('status');
  const msg = document.getElementById('msg').value.trim();
  if (!msg) { st.textContent = 'Enter a message first.'; st.className = 'err'; return; }
  btn.disabled = true; st.textContent = '';
  try {
    const exp = document.getElementById('exp').value;
    await post(msg, exp ? new Date(exp).toISOString() : null);
    st.textContent = 'Sent!'; st.className = 'ok';
  } catch(e) { st.textContent = 'Error: ' + e.message; st.className = 'err'; } finally { btn.disabled = false; }
});
document.getElementById('clr').addEventListener('click', async () => {
  const st = document.getElementById('status');
  try { await post('', null); document.getElementById('msg').value=''; document.getElementById('exp').value=''; st.textContent='Cleared'; st.className='ok'; }
  catch(e) { st.textContent='Error: '+e.message; st.className='err'; }
});
</script>
</body>
</html>`;

export function createMotdRoutes(tilesService: TilesService, bus: EventBus) {
  return async function motdRoutes(app: FastifyInstance): Promise<void> {
    // Minimal capture page — auth checked client-side via localStorage token; no React build required
    app.get('/motd', async (_req, reply) => {
      return reply.header('Content-Type', 'text/html; charset=utf-8').send(MOTD_PAGE);
    });

    // Quick-capture endpoint — requires session token, rate-limited tightly
    app.post('/api/motd', {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          additionalProperties: false,
          properties: {
            message: { type: 'string', maxLength: 500 },
            expiresAt: { type: 'string', nullable: true, maxLength: 30, pattern: '^\\d{4}-\\d{2}-\\d{2}T' },
          },
        },
      },
    }, async (req, reply) => {
      const { message, expiresAt } = req.body as { message: string; expiresAt?: string | null };
      try {
        tilesService.updateConfig('motd', { message, expiresAt: expiresAt ?? null });
        bus.emit('tiles:changed', tilesService.list());
        return reply.status(200).send({ ok: true });
      } catch {
        return reply.status(404).send({ error: 'MOTD tile not found' });
      }
    });
  };
}
