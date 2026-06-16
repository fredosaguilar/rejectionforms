const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router   = express.Router();

// GET /login
router.get('/login', (req, res) => {
  if (req.session?.agentId) return res.redirect('/');
  res.send(loginPage(req.query.error));
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await db.query(
      'SELECT * FROM agents WHERE email = $1 AND active = TRUE', [email?.toLowerCase().trim()]
    );
    const agent = rows[0];
    if (!agent) return res.redirect('/login?error=invalid');
    const ok = await bcrypt.compare(password, agent.password_hash);
    if (!ok) return res.redirect('/login?error=invalid');
    req.session.agentId   = agent.id;
    req.session.agentName = agent.name;
    req.session.email     = agent.email;
    req.session.role      = agent.role;
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect('/login?error=server');
      }
      res.redirect('/');
    });
  } catch (err) {
    console.error(err);
    res.redirect('/login?error=server');
  }
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// GET /admin/agents  — list agents
router.get('/admin/agents', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await db.query('SELECT id, name, email, role, active, created_at FROM agents ORDER BY created_at DESC');
  res.send(agentsPage(rows, req.session));
});

// POST /admin/agents — create agent
router.post('/admin/agents', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    await db.query(
      'INSERT INTO agents (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [name, email.toLowerCase().trim(), hash, role || 'agent']
    );
    res.redirect('/admin/agents?success=created');
  } catch (err) {
    res.redirect('/admin/agents?error=' + encodeURIComponent(err.message));
  }
});

// POST /admin/agents/:id/toggle — enable/disable
router.post('/admin/agents/:id/toggle', requireAuth, requireAdmin, async (req, res) => {
  await db.query('UPDATE agents SET active = NOT active WHERE id = $1', [req.params.id]);
  res.redirect('/admin/agents');
});

// POST /admin/agents/:id/reset-password
router.post('/admin/agents/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const { newPassword } = req.body;
  const hash = await bcrypt.hash(newPassword, 12);
  await db.query('UPDATE agents SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
  res.redirect('/admin/agents?success=reset');
});

// ── HTML Templates ────────────────────────────────────────────────────────────

function loginPage(error) {
  const msg = error === 'invalid' ? 'Invalid email or password.' : error === 'server' ? 'Server error. Try again.' : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign In — Columbia Basin Insurance</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f2ee;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
.card{background:#fff;border:1px solid #e0dcd4;border-radius:12px;padding:2.5rem 2rem;width:100%;max-width:380px}
.card::before{content:'';display:block;height:4px;background:#0f2644;border-radius:4px 4px 0 0;margin:-2.5rem -2rem 2rem}
h1{font-size:20px;font-weight:500;color:#1a1a1a;margin-bottom:4px}
p{font-size:13px;color:#6b6560;margin-bottom:1.5rem}
label{font-size:12px;font-weight:500;color:#6b6560;display:block;margin-bottom:4px}
input{width:100%;padding:9px 11px;font-size:14px;border:1px solid #d4cfc6;border-radius:8px;outline:none;margin-bottom:14px;font-family:inherit}
input:focus{border-color:#0f2644}
button{width:100%;padding:10px;background:#0f2644;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit}
button:hover{opacity:0.88}
.err{background:#fef2f2;color:#991b1b;font-size:13px;padding:9px 12px;border-radius:8px;margin-bottom:14px}
</style></head><body>
<div class="card">
  <h1>Columbia Basin Insurance</h1>
  <p>E&O Forms Portal — Agent Sign In</p>
  ${msg ? `<div class="err">${msg}</div>` : ''}
  <form method="POST" action="/login">
    <label>Email</label>
    <input type="email" name="email" required autofocus placeholder="you@agency.com">
    <label>Password</label>
    <input type="password" name="password" required placeholder="••••••••">
    <button type="submit">Sign in</button>
  </form>
</div>
</body></html>`;
}

function agentsPage(agents, session) {
  const rows = agents.map(a => `
    <tr>
      <td>${a.name}</td><td>${a.email}</td>
      <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;background:${a.role==='admin'?'#dbeafe':'#f1f0ec'};color:${a.role==='admin'?'#1e40af':'#444'}">${a.role}</span></td>
      <td><span style="color:${a.active?'#16a34a':'#dc2626'}">${a.active?'Active':'Disabled'}</span></td>
      <td>${new Date(a.created_at).toLocaleDateString()}</td>
      <td style="display:flex;gap:8px">
        <form method="POST" action="/admin/agents/${a.id}/toggle"><button class="tb">Toggle</button></form>
        <form method="POST" action="/admin/agents/${a.id}/reset-password" style="display:flex;gap:4px">
          <input name="newPassword" placeholder="New password" style="padding:4px 8px;font-size:12px;border:1px solid #d4cfc6;border-radius:6px;width:130px">
          <button class="tb">Reset</button>
        </form>
      </td>
    </tr>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Agents — Admin</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f4f2ee;padding:2rem}
.card{background:#fff;border:1px solid #e0dcd4;border-radius:12px;padding:1.5rem;max-width:1100px;margin:0 auto}
h1{font-size:18px;font-weight:500;margin-bottom:1.5rem}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px 10px;border-bottom:1px solid #e0dcd4;color:#6b6560;font-weight:500}
td{padding:8px 10px;border-bottom:1px solid #f0ece6}
.tb{padding:4px 10px;font-size:12px;border:1px solid #d4cfc6;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit}
.tb:hover{background:#f4f2ee}
h2{font-size:15px;font-weight:500;margin:1.5rem 0 1rem}
.form-row{display:flex;gap:10px;flex-wrap:wrap}
.form-row input,.form-row select{padding:8px 10px;font-size:13px;border:1px solid #d4cfc6;border-radius:8px;font-family:inherit}
.btn-pri{padding:8px 18px;background:#0f2644;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit}
a{color:#0f2644;text-decoration:none;font-size:13px}
</style></head><body>
<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
    <h1>Agent Management</h1>
    <a href="/">← Back to forms</a>
  </div>
  <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <h2>Add new agent</h2>
  <form method="POST" action="/admin/agents">
    <div class="form-row">
      <input name="name" placeholder="Full name" required>
      <input type="email" name="email" placeholder="Email" required>
      <input type="password" name="password" placeholder="Temporary password" required>
      <select name="role"><option value="agent">Agent</option><option value="admin">Admin</option></select>
      <button class="btn-pri" type="submit">Add agent</button>
    </div>
  </form>
</div></body></html>`;
}

module.exports = router;
