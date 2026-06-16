function requireAuth(req, res, next) {
  if (req.session && req.session.agentId) return next();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.redirect('/');
}

module.exports = { requireAuth, requireAdmin };
