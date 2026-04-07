/**
 * Email Service — Multi-provider email delivery
 * 
 * Providers: console | smtp | sendgrid
 * Configure via EMAIL_PROVIDER, SMTP_*, SENDGRID_* env vars
 */

import { logger } from "./logger";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

type EmailProvider = 'console' | 'smtp' | 'sendgrid';
let warnedConsoleProviderInProduction = false;

async function sendEmailConsole(options: EmailOptions): Promise<boolean> {
  logger.debug(`[Email Console] To: ${options.to} | Subject: ${options.subject}`);
  return true;
}

async function sendEmailSMTP(options: EmailOptions): Promise<boolean> {
  try {
    // Dynamic import to avoid requiring nodemailer when not used
    // Install: npm install nodemailer @types/nodemailer
    let nodemailer: Record<string, unknown>;
    try {
      nodemailer = await import('nodemailer' as string) as Record<string, unknown>;
    } catch {
      logger.error('nodemailer package not installed. Run: npm install nodemailer');
      return false;
    }

    const createTransport = (nodemailer.default as Record<string, unknown>)?.createTransport || nodemailer.createTransport;
    const transporter = (createTransport as Function)({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@vixo.click',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    logger.info(`Email sent to ${options.to}: ${options.subject}`);
    return true;
  } catch (error) {
    logger.error(`Email failed to ${options.to}`, error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

async function sendEmailSendGrid(options: EmailOptions): Promise<boolean> {
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      logger.error('SendGrid API key not configured');
      return false;
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: options.to }] }],
        from: { email: process.env.SENDGRID_FROM || 'noreply@vixo.click' },
        subject: options.subject,
        content: [
          { type: 'text/plain', value: options.text },
          ...(options.html ? [{ type: 'text/html', value: options.html }] : []),
        ],
      }),
    });

    if (response.ok || response.status === 202) {
      logger.info(`Email sent via SendGrid to ${options.to}: ${options.subject}`);
      return true;
    }

    const errorText = await response.text();
    logger.error(`SendGrid error: ${response.status} ${errorText}`);
    return false;
  } catch (error) {
    logger.error('SendGrid failed', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const provider = (process.env.EMAIL_PROVIDER || 'console') as EmailProvider;

  if (provider === 'console' && process.env.NODE_ENV === 'production' && !warnedConsoleProviderInProduction) {
    warnedConsoleProviderInProduction = true;
    logger.warn('EMAIL_PROVIDER=console in production. Emails are not delivered to real inboxes.');
  }

  switch (provider) {
    case 'smtp':
      return sendEmailSMTP(options);
    case 'sendgrid':
      return sendEmailSendGrid(options);
    case 'console':
    default:
      return sendEmailConsole(options);
  }
}
