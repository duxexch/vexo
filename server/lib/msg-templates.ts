/**
 * Email & SMS Template Helpers
 */

type RecoveryEmailAction = "restore" | "reactivate";

type AuthCodeTemplateOptions = {
  accentColor: string;
  badgeAr: string;
  badgeEn: string;
  titleAr: string;
  titleEn: string;
  introAr: string;
  introEn: string;
  codeLabelAr: string;
  codeLabelEn: string;
  code: string;
  expiryMinutes: number;
  noteAr: string;
  noteEn: string;
};

const BRAND_NAME = "VEX";
const BRAND_URL = "https://vixo.click";
const BRAND_LOGO_URL = "https://vixo.click/icons/vex-gaming-logo-192x192.png";
const BASE_FONT = "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPreheader(text: string): string {
  const safe = escapeHtml(text);
  return `<div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${safe}</div>`;
}

function buildAuthCodeEmailHtml(options: AuthCodeTemplateOptions): string {
  const safeCode = escapeHtml(options.code);
  return `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${BRAND_NAME}</title>
      </head>
      <body style="margin:0;padding:0;background:#eef3f7;font-family:${BASE_FONT};">
        ${buildPreheader(`${options.titleAr} - ${BRAND_NAME}`)}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f7;padding:28px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e8eef5;border-radius:18px;overflow:hidden;box-shadow:0 16px 42px rgba(16,24,40,0.08);">
                <tr>
                  <td style="background:linear-gradient(135deg,#0b1220 0%, #111c30 55%, #0f1419 100%);padding:24px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="right" style="vertical-align:middle;">
                          <img src="${BRAND_LOGO_URL}" width="54" height="54" alt="${BRAND_NAME} logo" style="display:block;border-radius:12px;border:1px solid rgba(18,247,182,0.45);background:#071018;" />
                        </td>
                        <td align="left" style="vertical-align:middle;">
                          <span style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#f8fbff;font-size:12px;font-weight:700;border-radius:999px;padding:6px 12px;">${escapeHtml(options.badgeAr)} | ${escapeHtml(options.badgeEn)}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:28px 28px 8px 28px;">
                    <p style="margin:0 0 6px 0;color:#0f172a;font-size:27px;line-height:1.35;font-weight:800;">${escapeHtml(options.titleAr)}</p>
                    <p style="margin:0;color:#475467;font-size:15px;line-height:1.7;">${escapeHtml(options.titleEn)}</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 28px 2px 28px;">
                    <p style="margin:0 0 6px 0;color:#1f2937;font-size:16px;line-height:1.8;">${escapeHtml(options.introAr)}</p>
                    <p style="margin:0;color:#667085;font-size:14px;line-height:1.7;">${escapeHtml(options.introEn)}</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 28px 10px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce6f1;border-radius:14px;background:linear-gradient(180deg,#f7fbff 0%,#ffffff 100%);">
                      <tr>
                        <td style="padding:16px 18px 2px 18px;">
                          <p style="margin:0;color:#334155;font-size:13px;font-weight:700;">${escapeHtml(options.codeLabelAr)} | ${escapeHtml(options.codeLabelEn)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding:10px 18px 20px 18px;">
                          <div style="display:inline-block;border-radius:14px;padding:12px 20px;background:${options.accentColor};box-shadow:0 8px 24px rgba(0,0,0,0.14);">
                            <span style="display:block;font-family:'Consolas','Courier New',monospace;font-size:34px;line-height:1.2;font-weight:900;letter-spacing:7px;color:#ffffff;">${safeCode}</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 28px 0 28px;">
                    <p style="margin:0;color:#344054;font-size:14px;line-height:1.8;">هذا الرمز صالح لمدة <strong>${options.expiryMinutes} دقيقة</strong>.</p>
                    <p style="margin:6px 0 0 0;color:#667085;font-size:13px;line-height:1.7;">This code expires in <strong>${options.expiryMinutes} minutes</strong>.</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 28px 0 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;">
                      <tr>
                        <td style="padding:12px 14px;">
                          <p style="margin:0;color:#9a3412;font-size:13px;line-height:1.7;">${escapeHtml(options.noteAr)}</p>
                          <p style="margin:4px 0 0 0;color:#b45309;font-size:12px;line-height:1.6;">${escapeHtml(options.noteEn)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:22px 28px 26px 28px;">
                    <p style="margin:0;color:#98a2b3;font-size:12px;line-height:1.7;">
                      ${BRAND_NAME} Security Mailer ·
                      <a href="${BRAND_URL}" style="color:#98a2b3;text-decoration:underline;">${BRAND_URL}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function buildBackupCodesList(codes: string[]): string {
  return codes.map((code) => {
    const safeCode = escapeHtml(code);
    return `<tr><td style="padding:8px 0;"><div style="border:1px solid #dce6f1;background:#ffffff;border-radius:10px;padding:10px 12px;text-align:center;"><span style="font-family:'Consolas','Courier New',monospace;font-size:19px;letter-spacing:2px;font-weight:700;color:#111827;">${safeCode}</span></div></td></tr>`;
  }).join("");
}

export function buildOtpEmailHtml(code: string, expiryMinutes: number): string {
  return buildAuthCodeEmailHtml({
    accentColor: "linear-gradient(135deg,#0ea5e9 0%, #2563eb 55%, #1d4ed8 100%)",
    badgeAr: "أمان الحساب",
    badgeEn: "Account Security",
    titleAr: "رمز التحقق لتسجيل الدخول",
    titleEn: "Your login verification code",
    introAr: "استخدم الرمز التالي لإكمال تسجيل الدخول بأمان داخل منصة VEX.",
    introEn: "Use the following code to complete your secure sign-in on VEX.",
    codeLabelAr: "رمز التحقق",
    codeLabelEn: "Verification Code",
    code,
    expiryMinutes,
    noteAr: "إذا لم تطلب هذا الرمز، تجاهل الرسالة وغيّر كلمة المرور فورًا.",
    noteEn: "If you did not request this code, ignore this message and change your password immediately.",
  });
}

export function buildResetPasswordEmailHtml(resetCode: string, expiryMinutes: number): string {
  return buildAuthCodeEmailHtml({
    accentColor: "linear-gradient(135deg,#ef4444 0%, #dc2626 55%, #b91c1c 100%)",
    badgeAr: "استعادة الحساب",
    badgeEn: "Password Recovery",
    titleAr: "رمز استعادة كلمة المرور",
    titleEn: "Your password reset code",
    introAr: "استخدم الرمز التالي لإعادة تعيين كلمة المرور لحسابك في VEX.",
    introEn: "Use the following code to reset your VEX account password.",
    codeLabelAr: "رمز الاستعادة",
    codeLabelEn: "Reset Code",
    code: resetCode,
    expiryMinutes,
    noteAr: "إذا لم تطلب استعادة كلمة المرور، تجاهل الرسالة وتأكّد من أمان حسابك.",
    noteEn: "If you did not request a password reset, ignore this email and secure your account.",
  });
}

export function buildAccountRecoveryEmailHtml(action: RecoveryEmailAction, code: string, expiryMinutes: number): string {
  const isRestore = action === "restore";
  return buildAuthCodeEmailHtml({
    accentColor: "linear-gradient(135deg,#0ea5a4 0%, #14b8a6 55%, #0f766e 100%)",
    badgeAr: isRestore ? "استرجاع الحساب" : "إعادة التفعيل",
    badgeEn: isRestore ? "Account Restore" : "Reactivation",
    titleAr: isRestore ? "رمز استرجاع حساب VEX" : "رمز إعادة تفعيل حساب VEX",
    titleEn: isRestore ? "Your VEX account restore code" : "Your VEX account reactivation code",
    introAr: isRestore
      ? "استلمت هذا الرمز لأنك طلبت استرجاع الحساب المحذوف مؤخرًا."
      : "استلمت هذا الرمز لأنك طلبت إعادة تفعيل حسابك غير النشط.",
    introEn: isRestore
      ? "You received this because an account restore request was submitted recently."
      : "You received this because an account reactivation request was submitted.",
    codeLabelAr: "رمز التحقق",
    codeLabelEn: "Verification Code",
    code,
    expiryMinutes,
    noteAr: "إذا لم تقم بهذا الطلب، تجاهل الرسالة وتواصل مع الدعم فورًا.",
    noteEn: "If you did not make this request, ignore this message and contact support immediately.",
  });
}

export function buildTwoFactorBackupCodesEmailHtml(username: string, backupCodes: string[]): string {
  const safeUsername = escapeHtml(username || "Player");
  const safeCodes = backupCodes.filter((code) => Boolean(code?.trim()));
  return `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${BRAND_NAME}</title>
      </head>
      <body style="margin:0;padding:0;background:#eef3f7;font-family:${BASE_FONT};">
        ${buildPreheader("أكواد النسخ الاحتياطي للمصادقة الثنائية - VEX")}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f7;padding:28px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e8eef5;border-radius:18px;overflow:hidden;box-shadow:0 16px 42px rgba(16,24,40,0.08);">
                <tr>
                  <td style="background:linear-gradient(135deg,#111827 0%, #1f2937 55%, #0f172a 100%);padding:24px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="right" style="vertical-align:middle;">
                          <img src="${BRAND_LOGO_URL}" width="54" height="54" alt="${BRAND_NAME} logo" style="display:block;border-radius:12px;border:1px solid rgba(18,247,182,0.45);background:#071018;" />
                        </td>
                        <td align="left" style="vertical-align:middle;">
                          <span style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#f8fbff;font-size:12px;font-weight:700;border-radius:999px;padding:6px 12px;">2FA Backup Codes</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:28px 28px 8px 28px;">
                    <p style="margin:0 0 6px 0;color:#0f172a;font-size:27px;line-height:1.35;font-weight:800;">أكواد النسخ الاحتياطي للمصادقة الثنائية</p>
                    <p style="margin:0;color:#475467;font-size:15px;line-height:1.7;">Hello ${safeUsername}, your VEX 2FA backup codes were regenerated.</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 28px 10px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce6f1;border-radius:14px;background:linear-gradient(180deg,#f7fbff 0%,#ffffff 100%);">
                      <tr>
                        <td style="padding:14px 16px 0 16px;">
                          <p style="margin:0;color:#334155;font-size:13px;font-weight:700;">كل كود صالح للاستخدام مرة واحدة فقط | Each code is single-use only</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 16px 16px 16px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            ${buildBackupCodesList(safeCodes)}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 28px 0 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;">
                      <tr>
                        <td style="padding:12px 14px;">
                          <p style="margin:0;color:#9a3412;font-size:13px;line-height:1.7;">احتفظ بهذه الأكواد في مكان آمن. إذا لم تقم أنت بإعادة التوليد، غيّر كلمة المرور فورًا.</p>
                          <p style="margin:4px 0 0 0;color:#b45309;font-size:12px;line-height:1.6;">Store these codes securely. If you did not request this, reset your password immediately.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:22px 28px 26px 28px;">
                    <p style="margin:0;color:#98a2b3;font-size:12px;line-height:1.7;">
                      ${BRAND_NAME} Security Mailer ·
                      <a href="${BRAND_URL}" style="color:#98a2b3;text-decoration:underline;">${BRAND_URL}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export function buildOtpSmsMessage(code: string, expiryMinutes: number): string {
  return `VEX - رمز التحقق: ${code}\nصالح لمدة ${expiryMinutes} دقيقة`;
}

export function buildResetSmsMessage(code: string, expiryMinutes: number): string {
  return `VEX - رمز استعادة كلمة المرور: ${code}\nصالح لمدة ${expiryMinutes} دقيقة`;
}
