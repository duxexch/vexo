/**
 * SMS Service — Multi-provider SMS delivery
 * 
 * Providers: console | twilio | custom
 * Configure via SMS_PROVIDER, TWILIO_*, SMS_WEBHOOK_URL env vars
 */

import { logger } from "./logger";

interface SmsOptions {
  to: string;
  message: string;
}

type SmsProvider = 'console' | 'twilio' | 'custom';

async function sendSmsConsole(options: SmsOptions): Promise<boolean> {
  logger.debug(`[SMS Console] To: ${options.to} | Message: ${options.message.substring(0, 50)}...`);
  return true;
}

async function sendSmsTwilio(options: SmsOptions): Promise<boolean> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      logger.error('Twilio credentials not configured');
      return false;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: options.to,
        From: fromNumber,
        Body: options.message,
      }),
    });

    if (response.ok) {
      logger.info(`SMS sent via Twilio to ${options.to}`);
      return true;
    }

    const errorData = await response.json();
    logger.error('Twilio error', new Error(JSON.stringify(errorData)));
    return false;
  } catch (error) {
    logger.error('Twilio failed', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

async function sendSmsCustomWebhook(options: SmsOptions): Promise<boolean> {
  try {
    const webhookUrl = process.env.SMS_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.error('SMS webhook URL not configured');
      return false;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: options.to,
        message: options.message,
        timestamp: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      logger.info(`SMS sent via webhook to ${options.to}`);
      return true;
    }

    logger.error(`SMS webhook error: ${response.status}`);
    return false;
  } catch (error) {
    logger.error('SMS webhook failed', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

export async function sendSms(options: SmsOptions): Promise<boolean> {
  const provider = (process.env.SMS_PROVIDER || 'console') as SmsProvider;
  
  switch (provider) {
    case 'twilio':
      return sendSmsTwilio(options);
    case 'custom':
      return sendSmsCustomWebhook(options);
    case 'console':
    default:
      return sendSmsConsole(options);
  }
}
