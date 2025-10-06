#!/usr/bin/env node
const express = require('express');
const nodemailer = require('nodemailer');

const {
  SMTP_HOST,
  SMTP_PORT = '587',
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM,
  EMAIL_WEBHOOK_TOKEN,
  PORT = 8787,
} = process.env;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
  console.warn('[email webhook] Missing SMTP configuration. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: SMTP_PORT === '465',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

const app = express();
app.use(express.json());

const SUBJECTS = {
  completion: 'Laundry cycle completed',
  reminder: 'Friendly laundry reminder',
  pickup: 'Laundry machine available',
};

app.post('/notify', async (req, res) => {
  try {
    if (EMAIL_WEBHOOK_TOKEN) {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${EMAIL_WEBHOOK_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const { recipientEmail, senderEmail, message, machineId, type, subjectHint } = req.body || {};

    if (!recipientEmail || !message) {
      return res.status(400).json({ error: 'recipientEmail and message are required' });
    }

    const subject = subjectHint || SUBJECTS[type] || 'Laundry notification';
    const text = [
      message,
      '',
      machineId ? `Machine: ${machineId}` : null,
      senderEmail ? `From: ${senderEmail}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    await transporter.sendMail({
      from: EMAIL_FROM,
      to: recipientEmail,
      subject,
      text,
    });

    res.json({ status: 'sent' });
  } catch (error) {
    console.error('[email webhook] Failed to send email', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`[email webhook] listening on port ${PORT}`);
});
