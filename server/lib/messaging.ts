/**
 * Messaging Service — Barrel re-export
 * Phase 56: Split into email.ts, sms.ts, msg-templates.ts
 */
export { sendEmail } from "./email";
export { sendSms } from "./sms";
export {
  buildOtpEmailHtml,
  buildResetPasswordEmailHtml,
  buildOtpSmsMessage,
  buildResetSmsMessage,
} from "./msg-templates";

