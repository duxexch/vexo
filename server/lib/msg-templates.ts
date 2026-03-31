/**
 * Email & SMS Template Helpers
 */

export function buildOtpEmailHtml(code: string, expiryMinutes: number): string {
  return `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; background: #f5f5f5;">
      <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #6366f1; text-align: center; margin-bottom: 20px;">VEX - رمز التحقق</h2>
        <p style="text-align: center; color: #555; font-size: 16px;">رمز التحقق الخاص بك هو:</p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="font-size: 36px; font-weight: bold; color: #6366f1; letter-spacing: 8px; background: #f0f0ff; padding: 12px 24px; border-radius: 8px;">${code}</span>
        </div>
        <p style="text-align: center; color: #888; font-size: 14px;">صالح لمدة ${expiryMinutes} دقيقة</p>
        <p style="text-align: center; color: #aaa; font-size: 12px; margin-top: 20px;">إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.</p>
      </div>
    </div>
  `;
}

export function buildResetPasswordEmailHtml(resetCode: string, expiryMinutes: number): string {
  return `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; background: #f5f5f5;">
      <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #ef4444; text-align: center; margin-bottom: 20px;">VEX - استعادة كلمة المرور</h2>
        <p style="text-align: center; color: #555; font-size: 16px;">رمز إعادة تعيين كلمة المرور:</p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="font-size: 36px; font-weight: bold; color: #ef4444; letter-spacing: 8px; background: #fef2f2; padding: 12px 24px; border-radius: 8px;">${resetCode}</span>
        </div>
        <p style="text-align: center; color: #888; font-size: 14px;">صالح لمدة ${expiryMinutes} دقيقة</p>
        <p style="text-align: center; color: #aaa; font-size: 12px; margin-top: 20px;">إذا لم تطلب استعادة كلمة المرور، تجاهل هذه الرسالة.</p>
      </div>
    </div>
  `;
}

export function buildOtpSmsMessage(code: string, expiryMinutes: number): string {
  return `VEX - رمز التحقق: ${code}\nصالح لمدة ${expiryMinutes} دقيقة`;
}

export function buildResetSmsMessage(code: string, expiryMinutes: number): string {
  return `VEX - رمز استعادة كلمة المرور: ${code}\nصالح لمدة ${expiryMinutes} دقيقة`;
}
