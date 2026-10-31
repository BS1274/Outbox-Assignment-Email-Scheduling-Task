import nodemailer from 'nodemailer';
import type { Sender } from '@prisma/client';

export type EtherealMailbox = {
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
};

// Ethereal gives us a real SMTP server that never delivers to a person's inbox.
// createTestAccount talks to ethereal.email and returns live credentials.
export async function createEtherealMailbox(): Promise<EtherealMailbox> {
  const account = await nodemailer.createTestAccount();
  return {
    fromEmail: account.user,
    smtpHost: account.smtp.host,
    smtpPort: account.smtp.port,
    smtpUser: account.user,
    smtpPass: account.pass,
  };
}

export async function sendWithSender(
  sender: Pick<Sender, 'fromName' | 'fromEmail' | 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPass'>,
  message: { to: string; subject: string; text: string; html: string },
): Promise<{ messageId: string; previewUrl: string | null }> {
  const transport = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpPort === 465,
    auth: { user: sender.smtpUser, pass: sender.smtpPass },
  });

  const info = await transport.sendMail({
    from: `"${sender.fromName}" <${sender.fromEmail}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  const preview = nodemailer.getTestMessageUrl(info);
  return {
    messageId: info.messageId,
    previewUrl: typeof preview === 'string' ? preview : null,
  };
}

export function toPlainText(body: string): string {
  return body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function toHtml(body: string): string {
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div>${escaped.replace(/\n/g, '<br/>')}</div>`;
}
