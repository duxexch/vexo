/**
 * Email Service — Multi-provider email delivery
 * 
 * Providers: console | smtp | sendgrid
 * Configure via EMAIL_PROVIDER, SMTP_*, SENDGRID_* env vars
 */

import { logger } from "./logger";

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type EmailProvider = 'console' | 'smtp' | 'sendgrid';

export interface EmailSendResult {
  delivered: boolean;
  provider: EmailProvider;
  reason?: string;
  statusCode?: number;
  messageId?: string;
}

let warnedConsoleProviderInProduction = false;

function maskEmailAddress(value: string): string {
  const [name, domain] = String(value || "").trim().split("@");
  if (!name || !domain) return "invalid-email";
  const safeName = name.length <= 2 ? `${name[0] ?? "*"}*` : `${name.slice(0, 2)}***`;
  return `${safeName}@${domain}`;
}

async function sendEmailConsole(options: EmailOptions): Promise<EmailSendResult> {
  logger.debug(`[Email Console] To: ${maskEmailAddress(options.to)} | Subject: ${options.subject}`);
  return {
    delivered: true,
    provider: "console",
    reason: "console_provider",
  };
}

async function sendEmailSMTP(options: EmailOptions): Promise<EmailSendResult> {
  try {
    // Dynamic import to avoid requiring nodemailer when not used
    // Install: npm install nodemailer @types/nodemailer
    let nodemailer: Record<string, unknown>;
    try {
      nodemailer = await import('nodemailer' as string) as Record<string, unknown>;
    } catch {
      logger.warn('nodemailer package not installed. Run: npm install nodemailer');
      return {
        delivered: false,
        provider: "smtp",
        reason: "nodemailer_not_installed",
      };
    }

    const smtpHost = process.env.SMTP_HOST || "localhost";
    const smtpPortRaw = process.env.SMTP_PORT || "587";
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || "noreply@vixo.click";
    const smtpPort = Number.parseInt(smtpPortRaw, 10);

    if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
      logger.warn(`Invalid SMTP_PORT value: ${smtpPortRaw}`);
      return {
        delivered: false,
        provider: "smtp",
        reason: "invalid_smtp_port",
      };
    }

    const missing: string[] = [];
    if (!smtpUser) missing.push("SMTP_USER");
    if (!smtpPass) missing.push("SMTP_PASS");

    if (missing.length > 0) {
      logger.warn(`SMTP configuration incomplete: ${missing.join(", ")}`);
      return {
        delivered: false,
        provider: "smtp",
        reason: `missing_${missing.join("_").toLowerCase()}`,
      };
    }

    const createTransport = (nodemailer.default as Record<string, unknown>)?.createTransport || nodemailer.createTransport;
    const transporter = (createTransport as Function)({
      host: smtpHost,
      port: smtpPort,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    const accepted = Array.isArray((info as { accepted?: unknown[] }).accepted)
      ? ((info as { accepted?: unknown[] }).accepted?.length || 0)
      : 0;
    const rejected = Array.isArray((info as { rejected?: unknown[] }).rejected)
      ? ((info as { rejected?: unknown[] }).rejected?.length || 0)
      : 0;

    const messageId = typeof (info as { messageId?: unknown }).messageId === "string"
      ? ((info as { messageId?: string }).messageId)
      : undefined;

    if (rejected > 0 && accepted === 0) {
      logger.error(`SMTP rejected email to ${maskEmailAddress(options.to)}`);
      return {
        delivered: false,
        provider: "smtp",
        reason: "smtp_rejected",
        messageId,
      };
    }

    logger.info(`Email sent via SMTP to ${maskEmailAddress(options.to)}: ${options.subject}`, {
      provider: "smtp",
      messageId,
      accepted,
      rejected,
    });
    return {
      delivered: true,
      provider: "smtp",
      messageId,
    };
  } catch (error) {
    logger.error(`Email failed via SMTP to ${maskEmailAddress(options.to)}`, error instanceof Error ? error : new Error(String(error)));
    return {
      delivered: false,
      provider: "smtp",
      reason: "smtp_send_failed",
    };
  }
}

async function sendEmailSendGrid(options: EmailOptions): Promise<EmailSendResult> {
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      logger.warn('SendGrid API key not configured');
      return {
        delivered: false,
        provider: "sendgrid",
        reason: "missing_sendgrid_api_key",
      };
    }

    const fromEmail = process.env.SENDGRID_FROM || 'noreply@vixo.click';

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: options.to }] }],
        from: { email: fromEmail },
        subject: options.subject,
        content: [
          { type: 'text/plain', value: options.text },
          ...(options.html ? [{ type: 'text/html', value: options.html }] : []),
        ],
      }),
    });

    if (response.ok || response.status === 202) {
      const messageId = response.headers.get("x-message-id") || undefined;
      logger.info(`Email sent via SendGrid to ${maskEmailAddress(options.to)}: ${options.subject}`, {
        provider: "sendgrid",
        messageId,
      });
      return {
        delivered: true,
        provider: "sendgrid",
        statusCode: response.status,
        messageId,
      };
    }

    const errorText = await response.text();
    logger.warn(`SendGrid error: ${response.status} ${errorText.substring(0, 400)}`);
    return {
      delivered: false,
      provider: "sendgrid",
      reason: "sendgrid_rejected",
      statusCode: response.status,
    };
  } catch (error) {
    logger.error('SendGrid failed', error instanceof Error ? error : new Error(String(error)));
    return {
      delivered: false,
      provider: "sendgrid",
      reason: "sendgrid_request_failed",
    };
  }
}

export async function sendEmailWithResult(options: EmailOptions): Promise<EmailSendResult> {
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

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const result = await sendEmailWithResult(options);
  return result.delivered;
}
