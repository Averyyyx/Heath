'use strict';

function register(context) {
  const {
    app, githubReady, passport, sanitizeUser, session
  } = context;

app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ message: 'Logout failed.' });
    }
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

app.get('/api/auth/providers', (_req, res) => {
  res.json({ github: githubReady });
});

app.get('/api/auth/session', (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: !!req.user });
});

app.get('/api/auth/github', (req, res, next) => {
  if (!githubReady) {
    return res.status(503).json({ message: 'GitHub OAuth is not configured.' });
  }
  passport.authenticate('github')(req, res, next);
});

app.get(
  '/api/auth/github/callback',
  (req, res, next) => {
    if (!githubReady) {
      return res.redirect('/?error=github_not_configured');
    }
    next();
  },
  passport.authenticate('github', {
    failureRedirect: '/?error=github_failed'
  }),
  (req, res) => {
    res.redirect('/?auth=github_success');
  }
);
}

module.exports = { register };
