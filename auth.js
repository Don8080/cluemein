// Accounts: login sessions, sign-up with email verification, forgot/change
// password. Screens P0 (Login) and P3 (Change Password) call these endpoints.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const { sendEmail, FROM_VERIFY, FROM_RESET } = require('./mailer');

const SALT_ROUNDS = 10;
const KEEP_SIGNED_IN_MS = 90 * 24 * 60 * 60 * 1000;
const VERIFY_TOKEN_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_MS = 60 * 60 * 1000;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  return null;
}

function setupAuth(app, db) {
  // A trailing slash would make links like "//verify", which the server doesn't recognize.
  const baseURL = (process.env.BASE_URL || 'http://localhost:3003').replace(/\/+$/, '');

  // Session store backed by SQLite, so logins survive server restarts.
  class SqliteSessionStore extends session.Store {
    get(sid, cb) {
      const row = db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?').get(sid);
      if (!row) return cb(null, null);
      if (Date.now() > row.expires_at) {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return cb(null, null);
      }
      try {
        cb(null, JSON.parse(row.data));
      } catch {
        cb(null, null);
      }
    }
    set(sid, sess, cb) {
      // Browser-session cookies (not "keep me signed in") get a 1-day server lifetime.
      const expires = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 24 * 60 * 60 * 1000;
      db.prepare(
        `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`
      ).run(sid, JSON.stringify(sess), expires);
      cb(null);
    }
    destroy(sid, cb) {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    }
    touch(sid, sess, cb) {
      this.set(sid, sess, cb);
    }
  }

  setInterval(() => {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('DELETE FROM auth_tokens WHERE expires_at < ?').run(Date.now());
  }, 60 * 60 * 1000).unref();

  // On Railway a missing secret would make every login forgeable, so refuse to start.
  if (process.env.RAILWAY_ENVIRONMENT_NAME && !process.env.SESSION_SECRET) {
    console.error('SESSION_SECRET is not set; refusing to start.');
    process.exit(1);
  }

  app.use(
    session({
      store: new SqliteSessionStore(),
      secret: process.env.SESSION_SECRET || 'cluemein-local-dev-secret',
      resave: false,
      saveUninitialized: false,
      rolling: true, // each visit restarts the 90 days, so frequent players never expire
      cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto' },
    })
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
  });

  const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const findUserByID = db.prepare('SELECT * FROM users WHERE id = ?');

  function newToken(userID, kind, ttlMs) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?').run(userID, kind);
    db.prepare('INSERT INTO auth_tokens (user_id, kind, token, expires_at) VALUES (?, ?, ?, ?)').run(
      userID, kind, token, Date.now() + ttlMs
    );
    return token;
  }

  // Returns the token's user id and deletes the token (links are single-use).
  function useToken(token, kind) {
    const row = db
      .prepare('SELECT * FROM auth_tokens WHERE token = ? AND kind = ? AND expires_at > ?')
      .get(String(token || ''), kind, Date.now());
    if (!row) return null;
    db.prepare('DELETE FROM auth_tokens WHERE id = ?').run(row.id);
    return row.user_id;
  }

  // Log the browser in as `user`. A fresh session id guards against fixation.
  function startSession(req, user, keep, cb) {
    req.session.regenerate((err) => {
      if (err) return cb(err);
      req.session.userID = user.id;
      req.session.email = user.email;
      req.session.cookie.maxAge = keep ? KEEP_SIGNED_IN_MS : null;
      req.session.keep = !!keep;
      db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
      req.session.save(cb);
    });
  }

  async function sendVerification(user) {
    const token = newToken(user.id, 'verify', VERIFY_TOKEN_MS);
    const url = `${baseURL}/verify?token=${token}`;
    await sendEmail({
      from: FROM_VERIFY,
      to: user.email,
      subject: 'Finish creating your Clue Me In account',
      text: `Welcome to Clue Me In!\n\nOpen this link to finish creating your account:\n${url}\n\nThen go back to Clue Me In and click "Refresh after Verification".\n\nThis link is valid for 24 hours.`,
      html: `<p>Welcome to Clue Me In!</p><p><a href="${url}">Click here</a> to finish creating your account.</p><p>Then go back to Clue Me In and click <b>Refresh after Verification</b>.</p><p>This link is valid for 24 hours.</p>`,
    });
  }

  // Who is this browser? Also completes "Refresh after Verification": a
  // pending sign-up becomes a login once its email has been verified.
  app.get('/api/me', (req, res) => {
    const s = req.session;
    if (s.userID) {
      const phone = db.prepare('SELECT phone FROM users WHERE id = ?').get(s.userID)?.phone || '';
      return res.json({ user: { id: s.userID, email: s.email, phone } });
    }
    if (s.pendingUserID) {
      const user = findUserByID.get(s.pendingUserID);
      if (!user) return res.json({});
      if (user.email_verified) {
        return startSession(req, user, s.keep, (err) =>
          err ? res.status(500).json({ error: 'Session error' }) : res.json({ user: { id: user.id, email: user.email } })
        );
      }
      return res.json({ pending: { email: user.email } });
    }
    res.json({});
  });

  app.post('/api/register', authLimiter, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password, keep } = req.body;
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const pwErr = passwordError(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    let user = findUserByEmail.get(email);
    if (user && user.email_verified) {
      return res.status(409).json({ error: 'That email already has an account. Use Login instead.' });
    }
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    if (user) {
      // Signing up again before verifying: take the new password and resend the link.
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    } else {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
        .run(email, hash);
      user = findUserByID.get(lastInsertRowid);
    }

    req.session.pendingUserID = user.id;
    req.session.keep = keep !== false;
    try {
      await sendVerification(user);
    } catch (err) {
      console.error('[register] verification email failed:', err.name, err.message);
      return res.status(502).json({
        error: `Your account was created, but the verification email could not be sent (${err.name}). Try "Resend email" later.`,
        pending: { email },
      });
    }
    res.json({ pending: { email } });
  });

  app.post('/api/resend-verification', authLimiter, async (req, res) => {
    const user = req.session.pendingUserID && findUserByID.get(req.session.pendingUserID);
    if (!user || user.email_verified) return res.json({ ok: true });
    try {
      await sendVerification(user);
    } catch (err) {
      console.error('[resend] verification email failed:', err.name, err.message);
      return res.status(502).json({ error: `The verification email could not be sent (${err.name}).` });
    }
    res.json({ ok: true });
  });

  // The link in the verification email. Verifies the account and logs in
  // whichever browser opened the link.
  app.get('/verify', (req, res) => {
    const userID = useToken(req.query.token, 'verify');
    if (!userID) return res.redirect('/?message=link-expired');
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userID);
    startSession(req, findUserByID.get(userID), true, () => res.redirect('/?message=verified'));
  });

  app.post('/api/login', authLimiter, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password, keep } = req.body;
    const user = findUserByEmail.get(email);
    if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
      console.log(`[login] ${email}: ${user ? 'wrong password' : 'no such account'}`);
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    console.log(`[login] ${email}: ${user.email_verified ? 'ok' : 'not verified yet'}`);
    if (!user.email_verified) {
      req.session.pendingUserID = user.id;
      req.session.keep = keep !== false;
      return res.status(403).json({
        error: 'Please verify your email first. Check your inbox (and Spam folder) for the link.',
        pending: { email: user.email },
      });
    }
    startSession(req, user, keep !== false, (err) =>
      err ? res.status(500).json({ error: 'Session error' }) : res.json({ user: { id: user.id, email: user.email } })
    );
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  // Emails a single-use link that either logs in directly or opens
  // Change Password without the current password.
  app.post('/api/forgot-password', authLimiter, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter your email address first.' });
    const user = findUserByEmail.get(email);
    // Same answer whether or not the account exists.
    const reply = { ok: true, message: 'If that email has an account, a login link is on its way.' };
    if (!user) return res.json(reply);

    const token = newToken(user.id, 'reset', RESET_TOKEN_MS);
    const loginURL = `${baseURL}/login-link?token=${token}`;
    const resetURL = `${baseURL}/?reset=${token}`;
    try {
      await sendEmail({
        from: FROM_RESET,
        to: user.email,
        subject: 'Log in to Clue Me In',
        text: `Log in directly: ${loginURL}\n\nOr set a new password: ${resetURL}\n\nThis link can be used once and expires in 1 hour.`,
        html: `<p><a href="${loginURL}">Log in directly</a></p><p>or <a href="${resetURL}">set a new password</a>.</p><p>This link can be used once and expires in 1 hour.</p>`,
      });
    } catch (err) {
      console.error('[forgot-password] email failed:', err.name, err.message);
      return res.status(502).json({ error: `The email could not be sent (${err.name}).` });
    }
    res.json(reply);
  });

  app.get('/login-link', (req, res) => {
    const userID = useToken(req.query.token, 'reset');
    if (!userID) return res.redirect('/?message=link-expired');
    startSession(req, findUserByID.get(userID), true, () => res.redirect('/'));
  });

  // Change Password: either (email + current password) from the Login popup,
  // or (reset token) from the forgot-password email, which also logs in.
  app.post('/api/change-password', authLimiter, async (req, res) => {
    const { token, email, current, password } = req.body;
    const pwErr = passwordError(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    if (token) {
      const userID = useToken(token, 'reset');
      if (!userID) return res.status(400).json({ error: 'This link has expired. Use Forgot Password again.' });
      db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').run(hash, userID);
      const user = findUserByID.get(userID);
      return startSession(req, user, true, () => res.json({ user: { id: user.id, email: user.email } }));
    }

    const user = findUserByEmail.get(String(email || '').trim().toLowerCase());
    if (!user || !(await bcrypt.compare(String(current || ''), user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or current password.' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    res.json({ ok: true });
  });

  // Add, change or clear the logged-in player's phone number (Start page).
  app.post('/api/account/phone', (req, res) => {
    if (!req.session.userID) return res.status(401).json({ error: 'Not logged in' });
    const phone = String(req.body.phone || '').trim().replace(/s+/g, ' ');
    const digits = phone.replace(/D/g, '').length;
    if (phone && (!/^[0-9+()-. ]{1,25}$/.test(phone) || digits < 7 || digits > 15)) {
      return res.status(400).json({ error: 'Enter a phone number using digits (spaces, +, -, ( ) and . are fine).' });
    }
    db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone || null, req.session.userID);
    res.json({ phone });
  });

  function requireAuth(req, res, next) {
    if (req.session.userID) return next();
    res.status(401).json({ error: 'Not logged in' });
  }

  return { requireAuth };
}

module.exports = { setupAuth };
