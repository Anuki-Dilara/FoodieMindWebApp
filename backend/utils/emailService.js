// Transactional email service (nodemailer/SMTP).
// Configuration comes exclusively from environment variables — never hardcode
// credentials. If SMTP is not configured the service reports itself as
// unavailable instead of pretending mail was sent.

const nodemailer = require('nodemailer');

let transporter = null;
let transporterMode = null; // 'smtp' | 'log' | 'test'

function isEmailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function missingConfig() {
  const missing = [];
  if (!process.env.SMTP_HOST) missing.push('SMTP_HOST');
  if (!process.env.SMTP_USER) missing.push('SMTP_USER');
  if (!process.env.SMTP_PASS) missing.push('SMTP_PASS');
  return missing;
}

function getTransporter() {
  if (transporterMode === 'test') return transporter;
  if (process.env.EMAIL_TRANSPORT === 'log') {
    // Dev fallback: accepts "sent" mail without delivering it. Clearly not a
    // real send — used only when explicitly enabled.
    transporterMode = 'log';
    transporter = {
      verify: async () => true,
      sendMail: async (mail) => {
        console.log(`[email:log] To: ${mail.to} | Subject: ${mail.subject}`);
        return { messageId: `log-${Date.now()}` };
      },
    };
    return transporter;
  }
  if (!isEmailConfigured()) return null;
  if (!transporter || transporterMode !== 'smtp') {
    transporterMode = 'smtp';
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// Test hook: inject a fake transporter (e.g. capturing sendMail calls).
function setTransporterForTests(fake) {
  transporter = fake;
  transporterMode = 'test';
}

function resetTransporter() {
  transporter = null;
  transporterMode = null;
}

async function verifyEmailService() {
  const t = getTransporter();
  if (!t) {
    return { ok: false, configured: false, missing: missingConfig() };
  }
  try {
    await t.verify();
    return { ok: true, configured: true };
  } catch (error) {
    // Log a safe diagnostic — never credentials.
    console.error('[email] SMTP verification failed:', error.message);
    return { ok: false, configured: true, error: error.message };
  }
}

async function sendPasswordResetEmail(to, resetUrl, expiresInMinutes = 30) {
  const t = getTransporter();
  if (!t) {
    const err = new Error(`Email service is not configured. Missing: ${missingConfig().join(', ')}`);
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const subject = 'Reset your FoodieMind password';
  const text = [
    'Hi there,',
    '',
    'We received a request to reset the password for your FoodieMind account.',
    'Click the link below to choose a new password:',
    '',
    resetUrl,
    '',
    `This link expires in ${expiresInMinutes} minutes and can only be used once.`,
    '',
    "If you didn't request a password reset, you can safely ignore this email — your password will not change.",
    '',
    '— The FoodieMind Team',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#2f4858">🥗 FoodieMind</h2>
      <p>We received a request to reset the password for your FoodieMind account.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${resetUrl}" style="background:#5b8e7d;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:bold">Reset my password</a>
      </p>
      <p style="font-size:13px;color:#666">This link expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.</p>
      <p style="font-size:13px;color:#666">If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>
      <p style="font-size:12px;color:#999">Or paste this link into your browser:<br>${resetUrl}</p>
      <p>— The FoodieMind Team</p>
    </div>`;

  try {
    const info = await t.sendMail({ from, to, subject, text, html });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    // Safe diagnostic: log recipient domain + error only, never credentials.
    console.error(`[email] Failed to send password reset to ${to}:`, error.message);
    const err = new Error('Failed to send password reset email.');
    err.code = 'EMAIL_SEND_FAILED';
    throw err;
  }
}

module.exports = {
  isEmailConfigured,
  missingConfig,
  verifyEmailService,
  sendPasswordResetEmail,
  setTransporterForTests,
  resetTransporter,
};
