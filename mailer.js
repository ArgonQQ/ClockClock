'use strict';
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'ClockClock <noreply@example.com>';
const RESET_TOKEN_TTL_MIN = parseInt(process.env.RESET_TOKEN_TTL_MIN || '60', 10);

if (!SMTP_HOST && process.env.NODE_ENV === 'production') {
  console.error('FATAL: SMTP_HOST is required in production for password-reset emails.');
  console.error('Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, and APP_BASE_URL.');
  process.exit(1);
}

const transporter = SMTP_HOST ? nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
}) : null;

const TEMPLATES = {
  en: {
    pwReset: {
      subject: 'Reset your ClockClock password',
      body: (link, ttl) =>
        `Click to reset (expires in ${ttl} minutes):\n\n${link}\n\nIgnore this email if you did not request a reset.`
    }
  },
  de: {
    pwReset: {
      subject: 'ClockClock-Passwort zurücksetzen',
      body: (link, ttl) =>
        `Klicke zum Zurücksetzen (gültig für ${ttl} Minuten):\n\n${link}\n\nIgnoriere diese E-Mail, falls du keine Zurücksetzung angefordert hast.`
    }
  }
};

async function sendPasswordResetEmail(to, link, lang) {
  const tpl = (TEMPLATES[lang] || TEMPLATES.en).pwReset;
  const text = tpl.body(link, RESET_TOKEN_TTL_MIN);

  if (!transporter) {
    console.log('--- Password Reset Link (dev mode, no SMTP configured) ---');
    console.log(`To: ${to}`);
    console.log(`Subject: ${tpl.subject}`);
    console.log(text);
    console.log('----------------------------------------------------------');
    return;
  }

  await transporter.sendMail({ from: SMTP_FROM, to, subject: tpl.subject, text });
}

module.exports = { sendPasswordResetEmail };
