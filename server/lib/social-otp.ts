/**
 * Social OTP Engine — Send OTP codes via WhatsApp Business API, Telegram Bot API, SMS
 */
import crypto from "crypto";
import { storage } from "../storage";
import { getErrorMessage } from "../routes/helpers";

export interface OtpSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ==================== WhatsApp Business API ====================
export async function sendWhatsAppOTP(
  phoneNumber: string,
  code: string,
  accessToken: string,
  phoneNumberId: string,
  template?: string,
): Promise<OtpSendResult> {
  try {
    const message = template
      ? template.replace("{{code}}", code)
      : `Your VEX verification code is: ${code}`;

    // WhatsApp Cloud API
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phoneNumber.replace(/[^0-9]/g, ""),
          type: "text",
          text: { body: message },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `WhatsApp API error: ${response.status} ${JSON.stringify(errorData?.error?.message || "")}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

// ==================== Telegram Bot API ====================
export async function sendTelegramOTP(
  chatId: string,
  code: string,
  botToken: string,
  template?: string,
): Promise<OtpSendResult> {
  try {
    const message = template
      ? template.replace("{{code}}", code)
      : `🔐 Your VEX verification code is: *${code}*\n\nThis code expires in 5 minutes. Do not share it with anyone.`;

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `Telegram API error: ${response.status} ${errorData?.description || ""}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      messageId: String(data.result?.message_id || ""),
    };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

// ==================== Generic Webhook OTP Adapter ====================
export async function sendWebhookOTP(
  recipient: string,
  code: string,
  webhookUrl: string,
  options?: {
    template?: string;
    apiKey?: string | null;
    apiSecret?: string | null;
    accessToken?: string | null;
    platformName?: string;
  },
): Promise<OtpSendResult> {
  try {
    const message = options?.template
      ? options.template.replace("{{code}}", code)
      : `Your VEX verification code is: ${code}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (options?.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    } else if (options?.apiKey) {
      headers["X-API-KEY"] = options.apiKey;
    }

    if (options?.apiSecret) {
      headers["X-API-SECRET"] = options.apiSecret;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        recipient,
        code,
        message,
        channel: "otp",
        platform: options?.platformName,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text().catch(() => "");
      return {
        success: false,
        error: `Webhook OTP error: ${response.status}${errorData ? ` ${errorData}` : ""}`,
      };
    }

    const body = await response.json().catch(() => ({}));
    return {
      success: true,
      messageId: typeof body.messageId === "string" ? body.messageId : undefined,
    };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

// ==================== Generic OTP via Social Platform ====================
export async function sendSocialOTP(
  platformName: string,
  recipient: string, // phone number or chat ID
  code: string,
): Promise<OtpSendResult> {
  const platform = await storage.getSocialPlatformByName(platformName);

  if (!platform) {
    return { success: false, error: "Platform not found" };
  }

  if (!platform.isEnabled) {
    return { success: false, error: "Platform is disabled" };
  }

  if (!platform.otpEnabled && platform.type !== "otp") {
    return { success: false, error: "OTP is not enabled for this platform" };
  }

  switch (platformName) {
    case "whatsapp": {
      if (!platform.accessToken || !platform.phoneNumberId) {
        return { success: false, error: "WhatsApp not configured (missing access token or phone number ID)" };
      }
      return sendWhatsAppOTP(
        recipient,
        code,
        platform.accessToken,
        platform.phoneNumberId,
        platform.otpTemplate || undefined,
      );
    }

    case "telegram": {
      if (!platform.botToken) {
        return { success: false, error: "Telegram not configured (missing bot token)" };
      }
      return sendTelegramOTP(
        recipient,
        code,
        platform.botToken,
        platform.otpTemplate || undefined,
      );
    }

    case "sms": {
      if (!platform.webhookUrl) {
        return { success: false, error: "SMS not configured (missing webhook URL)" };
      }

      return sendWebhookOTP(recipient, code, platform.webhookUrl, {
        template: platform.otpTemplate || undefined,
        apiKey: platform.apiKey,
        apiSecret: platform.apiSecret,
        accessToken: platform.accessToken,
        platformName,
      });
    }

    default: {
      if (!platform.webhookUrl) {
        return { success: false, error: `OTP not supported for platform: ${platformName}. Configure webhook URL for generic adapter` };
      }

      return sendWebhookOTP(recipient, code, platform.webhookUrl, {
        template: platform.otpTemplate || undefined,
        apiKey: platform.apiKey,
        apiSecret: platform.apiSecret,
        accessToken: platform.accessToken,
        platformName,
      });
    }
  }
}

// ==================== Generate OTP Code ====================
export function generateOTPCode(length: number = 6): string {
  const max = Math.pow(10, length);
  const code = crypto.randomInt(0, max);
  return code.toString().padStart(length, "0");
}
