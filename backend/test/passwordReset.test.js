// End-to-end tests for forgot/reset password flow.
// Run: node test/passwordReset.test.js
// Email delivery is fully mocked — no real emails are sent.

require('dotenv').config();
const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const authRoutes = require('../routes/auth');
const emailService = require('../utils/emailService');
const { resetRateLimits } = require('../utils/rateLimiter');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

const createdUserIds = [];
const sentEmails = [];
let baseUrl;

async function api(method, path, body) {
  const res = await fetch(`${baseUrl}/api/auth${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

async function makeUser(email, password = 'OldPass123') {
  const u = await User.create({
    fullName: 'Reset Test', email, passwordHash: await require('bcryptjs').hash(password, 12),
  });
  createdUserIds.push(u._id);
  return u;
}

function extractToken(email) {
  const m = /reset-password\?token=([a-f0-9]+)/.exec(email.text || '');
  assert.ok(m, 'reset email must contain a token link');
  return m[1];
}

async function main() {
  console.log('== Password reset tests ==');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 4000 });
  await User.init();

  // Mock transporter: captures outbound mail, never delivers.
  emailService.setTransporterForTests({
    verify: async () => true,
    sendMail: async (mail) => {
      sentEmails.push(mail);
      return { messageId: `mock-${sentEmails.length}` };
    },
  });
  resetRateLimits();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await test('unregistered email gets the same generic response (no enumeration)', async () => {
      const { status, data } = await api('POST', '/forgot-password', { email: 'nobody-' + Date.now() + '@example.com' });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.message, 'If an account exists for this email address, a password reset link will be sent.');
    });

    const user = await makeUser('reset-test@example.com');

    await test('registered email: generic response + reset email sent with secure link', async () => {
      const before = sentEmails.length;
      const { status, data } = await api('POST', '/forgot-password', { email: '  RESET-TEST@Example.com  ' });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.message, 'If an account exists for this email address, a password reset link will be sent.');
      assert.strictEqual(sentEmails.length, before + 1, 'exactly one email should be sent');
      const mail = sentEmails[sentEmails.length - 1];
      assert.strictEqual(mail.to, 'reset-test@example.com');
      assert.ok(/reset-password\?token=/.test(mail.text), 'email must contain reset link');
      assert.ok(mail.text.includes('30 minutes'), 'email must state expiry');
      assert.ok(/ignore/i.test(mail.text), 'email must include ignore-if-not-you note');
      // Reset link must point at the configured frontend, not a hardcoded URL.
      const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
      if (frontendUrl) assert.ok(mail.text.includes(`${frontendUrl}/reset-password`), `link should use FRONTEND_URL (${frontendUrl})`);
    });

    await test('only the token hash is stored — never the raw token', async () => {
      const mail = sentEmails[sentEmails.length - 1];
      const token = extractToken(mail);
      const fresh = await User.findById(user._id).lean();
      assert.ok(fresh.resetPasswordTokenHash, 'hash must be stored');
      assert.ok(!fresh.resetPasswordTokenHash.includes(token), 'raw token must not be stored');
      assert.strictEqual(fresh.resetPasswordTokenHash.length, 64, 'SHA-256 hex hash expected');
      assert.ok(fresh.resetPasswordExpires > new Date(), 'expiry must be in the future');
      assert.ok(fresh.resetPasswordExpires <= new Date(Date.now() + 31 * 60000), 'expiry must be ~30min');
    });

    let token;
    await test('verify-reset-token accepts the emailed token', async () => {
      token = extractToken(sentEmails[sentEmails.length - 1]);
      const { data } = await api('GET', `/verify-reset-token?token=${token}`);
      assert.strictEqual(data.valid, true);
    });

    await test('verify-reset-token rejects bogus tokens', async () => {
      const { data } = await api('GET', '/verify-reset-token?token=deadbeef');
      assert.strictEqual(data.valid, false);
      const missing = await api('GET', '/verify-reset-token');
      assert.strictEqual(missing.data.valid, false);
    });

    await test('reset-password validates confirmation and length', async () => {
      const mismatch = await api('POST', '/reset-password', { token, password: 'NewPass123', confirmPassword: 'Different123' });
      assert.strictEqual(mismatch.status, 400);
      const short = await api('POST', '/reset-password', { token, password: 'short', confirmPassword: 'short' });
      assert.strictEqual(short.status, 400);
    });

    await test('successful reset updates password and burns the token', async () => {
      const { status, data } = await api('POST', '/reset-password', { token, password: 'NewSecurePass1', confirmPassword: 'NewSecurePass1' });
      assert.strictEqual(status, 200);
      assert.ok(/reset successfully/i.test(data.message));
      const fresh = await User.findById(user._id).lean();
      assert.strictEqual(fresh.resetPasswordTokenHash, null, 'token must be cleared');
      assert.strictEqual(fresh.resetPasswordExpires, null);
      assert.ok(fresh.passwordChangedAt instanceof Date);
      // Password stored as bcrypt hash, not plaintext.
      assert.ok(fresh.passwordHash.startsWith('$2'));
      assert.notStrictEqual(fresh.passwordHash, 'NewSecurePass1');
      // Profile data preserved.
      assert.strictEqual(fresh.fullName, 'Reset Test');
      assert.strictEqual(fresh.email, 'reset-test@example.com');
    });

    await test('old password no longer works; new password logs in', async () => {
      const old = await api('POST', '/login', { email: 'reset-test@example.com', password: 'OldPass123' });
      assert.strictEqual(old.status, 401);
      const neu = await api('POST', '/login', { email: 'reset-test@example.com', password: 'NewSecurePass1' });
      assert.strictEqual(neu.status, 200);
      assert.ok(neu.data.token, 'login must return JWT');
    });

    await test('used token cannot be reused (single-use)', async () => {
      const verify = await api('GET', `/verify-reset-token?token=${token}`);
      assert.strictEqual(verify.data.valid, false);
      const reuse = await api('POST', '/reset-password', { token, password: 'AnotherPass99', confirmPassword: 'AnotherPass99' });
      assert.strictEqual(reuse.status, 400);
    });

    await test('requesting a new link invalidates the previous token', async () => {
      await api('POST', '/forgot-password', { email: 'reset-test@example.com' });
      const firstToken = extractToken(sentEmails[sentEmails.length - 2]);
      await api('POST', '/forgot-password', { email: 'reset-test@example.com' });
      const secondToken = extractToken(sentEmails[sentEmails.length - 1]);
      const oldCheck = await api('GET', `/verify-reset-token?token=${firstToken}`);
      assert.strictEqual(oldCheck.data.valid, false, 'previous token must be invalidated');
      const newCheck = await api('GET', `/verify-reset-token?token=${secondToken}`);
      assert.strictEqual(newCheck.data.valid, true);
    });

    await test('expired token is rejected', async () => {
      const crypto = require('crypto');
      const expToken = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(expToken).digest('hex');
      await User.updateOne({ _id: user._id }, {
        resetPasswordTokenHash: hash,
        resetPasswordExpires: new Date(Date.now() - 1000),
      });
      const check = await api('GET', `/verify-reset-token?token=${expToken}`);
      assert.strictEqual(check.data.valid, false);
      const reset = await api('POST', '/reset-password', { token: expToken, password: 'Whatever123', confirmPassword: 'Whatever123' });
      assert.strictEqual(reset.status, 400);
    });

    await test('rate limiting blocks repeated reset requests', async () => {
      const email = `ratelimit-${Date.now()}@example.com`;
      const codes = [];
      for (let i = 0; i < 4; i++) {
        const { status } = await api('POST', '/forgot-password', { email });
        codes.push(status);
      }
      assert.deepStrictEqual(codes.slice(0, 3), [200, 200, 200]);
      assert.strictEqual(codes[3], 429, '4th request within window must be rate-limited');
    });

    await test('email delivery failure returns honest error, not fake success', async () => {
      resetRateLimits(); // clear buckets so this request isn't rate-limited
      emailService.setTransporterForTests({
        verify: async () => true,
        sendMail: async () => { const e = new Error('SMTP down'); e.code = 'EAI_AGAIN'; throw e; },
      });
      try {
        const { status, data } = await api('POST', '/forgot-password', { email: 'reset-test@example.com' });
        assert.strictEqual(status, 503);
        assert.ok(/could not send/i.test(data.message));
        assert.ok(!/link will be sent/i.test(data.message), 'must not claim email was sent');
      } finally {
        emailService.setTransporterForTests({
          verify: async () => true,
          sendMail: async (mail) => { sentEmails.push(mail); return { messageId: 'mock' }; },
        });
      }
    });

    await test('failed email delivery does NOT invalidate the previous working token', async () => {
      // Establish a working token first.
      resetRateLimits();
      await api('POST', '/forgot-password', { email: 'reset-test@example.com' });
      const goodToken = extractToken(sentEmails[sentEmails.length - 1]);
      assert.strictEqual((await api('GET', `/verify-reset-token?token=${goodToken}`)).data.valid, true);

      // Now make SMTP fail and request again — the old link must survive.
      resetRateLimits();
      emailService.setTransporterForTests({
        verify: async () => true,
        sendMail: async () => { throw new Error('SMTP throttled'); },
      });
      try {
        const { status } = await api('POST', '/forgot-password', { email: 'reset-test@example.com' });
        assert.strictEqual(status, 503);
      } finally {
        emailService.setTransporterForTests({
          verify: async () => true,
          sendMail: async (mail) => { sentEmails.push(mail); return { messageId: 'mock' }; },
        });
      }
      const check = await api('GET', `/verify-reset-token?token=${goodToken}`);
      assert.strictEqual(check.data.valid, true, 'previous token must remain valid after failed send');
    });

    await test('rate-limited response includes Retry-After header', async () => {
      resetRateLimits();
      const email = `retryafter-${Date.now()}@example.com`;
      let lastHeaders = null;
      for (let i = 0; i < 4; i++) {
        const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        lastHeaders = res.headers;
        if (res.status === 429) break;
      }
      const retryAfter = lastHeaders.get('retry-after');
      assert.ok(retryAfter && Number(retryAfter) > 0, `Retry-After header missing, got: ${retryAfter}`);
    });

    await test('unregistered email never triggers an email send', async () => {
      const before = sentEmails.length;
      await api('POST', '/forgot-password', { email: `ghost-${Date.now()}@example.com` });
      assert.strictEqual(sentEmails.length, before);
    });
  } finally {
    server.close();
    await User.deleteMany({ _id: { $in: createdUserIds } });
    emailService.resetTransporter();
    resetRateLimits();
    await mongoose.disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f.name}: ${f.error.message}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
