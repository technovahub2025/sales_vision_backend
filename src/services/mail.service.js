import nodemailer from 'nodemailer';

let transporter = null;

function provider() {
  return String(process.env.MAIL_PROVIDER || '').trim().toLowerCase();
}

function createTransport() {
  const selected = provider();
  if (selected !== 'gmail') {
    throw new Error(`Unsupported MAIL_PROVIDER: ${selected || '(empty)'}`);
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.MAIL_FROM_EMAIL,
      pass: process.env.MAIL_GMAIL_APP_PASSWORD,
    },
  });
}

function getTransport() {
  if (!transporter) {
    transporter = createTransport();
  }
  return transporter;
}

function quoteName(value) {
  const normalized = String(value || '').replace(/"/g, '\\"').trim();
  return normalized ? `"${normalized}"` : '';
}

export function getMailFromHeader() {
  const email = String(process.env.MAIL_FROM_EMAIL || '').trim();
  const name = String(process.env.MAIL_FROM_NAME || '').trim();
  const safeName = quoteName(name);
  return safeName ? `${safeName} <${email}>` : email;
}

export async function sendEmail({ to, subject, text, html }) {
  const tx = getTransport();
  return tx.sendMail({
    from: getMailFromHeader(),
    to,
    subject,
    text,
    html,
  });
}

export function __setTransportForTests(fakeTransport) {
  transporter = fakeTransport;
}

export function __resetTransportForTests() {
  transporter = null;
}
