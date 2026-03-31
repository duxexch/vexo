/**
 * Social OTP Engine — Send OTP codes via WhatsApp Business API, Telegram Bot API, SMS
 */
import crypto from "crypto";
import { db } from "../db";
import { otpVerifications } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { decryptSecret } from "./crypto-utils";
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

    default:
      return { success: false, error: `OTP not supported for platform: ${platformName}` };
  }
}

// ==================== Generate OTP Code ====================
export function generateOTPCode(length: number = 6): string {
  const max = Math.pow(10, length);
  const code = crypto.randomInt(0, max);
  return code.toString().padStart(length, "0");
}
