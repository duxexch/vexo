import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ArrowLeft, Lock } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function PrivacyPage() {
  const [, setLocation] = useLocation();
  const { language, dir } = useI18n();
  const isAr = language === "ar";

  return (
    <div className="min-h-screen bg-background py-8 px-4" dir={dir}>
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>
      <div className="max-w-3xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/login")}
          className="mb-4"
        >
          {isAr ? <ArrowRight className="me-2 h-4 w-4" /> : <ArrowLeft className="me-2 h-4 w-4" />}
          {isAr ? "العودة لتسجيل الدخول" : "Back to Login"}
        </Button>

        <Card className="border-primary/20">
          <CardContent className="p-6 md:p-10">
            <div className="flex items-center gap-3 mb-6">
              <Lock className="w-8 h-8 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {isAr ? "سياسة الخصوصية" : "Privacy Policy"}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              {isAr ? "آخر تحديث: 25 فبراير 2026" : "Last Updated: February 25, 2026"}
            </p>

            {isAr ? (
              <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground leading-relaxed">
                <section>
                  <h2 className="text-xl font-semibold text-primary">1. مقدمة</h2>
                  <p>
                    نحن في VEX نلتزم بحماية خصوصيتك وبياناتك الشخصية. توضح هذه السياسة كيفية جمع واستخدام وحماية ومشاركة معلوماتك عند استخدام منصتنا. باستخدامك للمنصة، فإنك توافق على ممارسات جمع البيانات والاستخدام الموضحة في هذه السياسة.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">2. البيانات التي نجمعها</h2>
                  <h3 className="text-lg font-medium mt-3">أ. بيانات تقدمها مباشرةً:</h3>
                  <ul className="list-disc pr-6 space-y-2">
                    <li>بيانات التسجيل: الاسم المستعار، رقم الهاتف، البريد الإلكتروني، كلمة المرور (مُشفرة).</li>
                    <li>بيانات الملف الشخصي: الصورة الرمزية، المعلومات الشخصية الاختيارية.</li>
                    <li>بيانات المعاملات: سجل الإيداعات والسحوبات ومعاملات P2P.</li>
                    <li>الرسائل: محادثات الدردشة داخل المنصة والنزاعات.</li>
                  </ul>
                  <h3 className="text-lg font-medium mt-3">ب. بيانات تُجمع تلقائياً:</h3>
                  <ul className="list-disc pr-6 space-y-2">
                    <li>معلومات الجهاز: نوع المتصفح، نظام التشغيل، معرف الجهاز.</li>
                    <li>بيانات الاستخدام: الصفحات المزارة، الألعاب التي لُعبت، مدة الجلسة.</li>
                    <li>عنوان IP وبيانات الموقع التقريبي.</li>
                    <li>ملفات تعريف الارتباط ومعرفات الجلسة.</li>
                    <li>سجلات الأداء والأخطاء التقنية.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">3. كيف نستخدم بياناتك</h2>
                  <ul className="list-disc pr-6 space-y-2">
                    <li>تقديم وصيانة وتحسين خدمات المنصة.</li>
                    <li>معالجة المعاملات المالية وإدارة المحفظة.</li>
                    <li>التحقق من هويتك ومنع الاحتيال.</li>
                    <li>إدارة الألعاب والمسابقات والبطولات.</li>
                    <li>التواصل معك بشأن حسابك وتحديثات الخدمة.</li>
                    <li>إرسال إشعارات المنصة (نتائج الألعاب، تحديثات التداول).</li>
                    <li>تحسين تجربة المستخدم من خلال تحليل أنماط الاستخدام.</li>
                    <li>منع إساءة الاستخدام والحفاظ على أمان المنصة.</li>
                    <li>الامتثال للمتطلبات القانونية والتنظيمية.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">4. حماية البيانات وأمانها</h2>
                  <ul className="list-disc pr-6 space-y-2">
                    <li>يتم تشفير كلمات المرور باستخدام خوارزميات قوية (bcrypt).</li>
                    <li>جميع الاتصالات مُشفرة عبر بروتوكول HTTPS/TLS.</li>
                    <li>نستخدم حماية من هجمات الحقن (SQL Injection) وهجمات البرمجة عبر المواقع (XSS).</li>
                    <li>نطبق نظام تحديد معدل الطلبات لمنع هجمات القوة الغاشمة.</li>
                    <li>نراقب الأنشطة المشبوهة والوصول غير المصرح به.</li>
                    <li>الوصول إلى البيانات الشخصية محدود بالموظفين المخولين فقط.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">5. مشاركة البيانات</h2>
                  <p>لا نبيع بياناتك الشخصية لأطراف ثالثة. قد نشارك بياناتك في الحالات التالية:</p>
                  <ul className="list-disc pr-6 space-y-2">
                    <li>مع مقدمي خدمات الدفع لمعالجة المعاملات المالية.</li>
                    <li>مع جهات إنفاذ القانون عند الاقتضاء بأمر قضائي.</li>
                    <li>عند الضرورة لحماية حقوقنا أو سلامة المستخدمين.</li>
                    <li>مع الأطراف المقابلة في معاملات P2P (معلومات محدودة فقط).</li>
                    <li>في حالة اندماج أو استحواذ (مع إشعار مسبق).</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">6. ملفات تعريف الارتباط (Cookies)</h2>
                  <ul className="list-disc pr-6 space-y-2">
                    <li>نستخدم ملفات تعريف الارتباط الأساسية للمصادقة والحفاظ على جلسة العمل.</li>
                    <li>نستخدم ملفات تعريف الارتباط التحليلية لفهم أنماط الاستخدام.</li>
                    <li>يمكنك إدارة إعدادات ملفات تعريف الارتباط عبر متصفحك.</li>
                    <li>تعطيل بعض ملفات تعريف الارتباط قد يؤثر على وظائف المنصة.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">7. حقوق المستخدم</h2>
                  <p>لديك الحقوق التالية فيما يتعلق ببياناتك:</p>
                  <ul className="list-disc pr-6 space-y-2">
                    <li><strong>حق الوصول:</strong> طلب نسخة من بياناتك الشخصية.</li>
                    <li><strong>حق التصحيح:</strong> طلب تصحيح بيانات غير دقيقة.</li>
                    <li><strong>حق الحذف:</strong> طلب حذف بياناتك (مع مراعاة المتطلبات القانونية).</li>
                    <li><strong>حق الاعتراض:</strong> الاعتراض على معالجة بياناتك لأغراض معينة.</li>
                    <li><strong>حق النقل:</strong> طلب نقل بياناتك بتنسيق قابل للقراءة.</li>
                  </ul>
                  <p>لممارسة هذه الحقوق، تواصل معنا عبر نظام الدعم.</p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">8. الاحتفاظ بالبيانات</h2>
                  <ul className="list-disc pr-6 space-y-2">
                    <li>نحتفظ ببيانات الحساب طالما كان الحساب نشطاً.</li>
                    <li>نحتفظ بسجلات المعاملات المالية للمدة المطلوبة قانونياً.</li>
                    <li>بعد حذف الحساب، نحتفظ ببيانات معينة للمدة القانونية المطلوبة.</li>
                    <li>سجلات الأمان تُحفظ لمدة لا تقل عن 12 شهراً.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">9. خصوصية الأطفال</h2>
                  <p>
                    المنصة غير مخصصة للأطفال دون 18 عاماً. لا نجمع عن علم بيانات شخصية من أطفال. إذا اكتشفنا أن طفلاً دون 18 عاماً أنشأ حساباً، سنقوم بحذفه فوراً والتواصل مع ولي الأمر إن أمكن.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">10. خدمات الطرف الثالث</h2>
                  <ul className="list-disc pr-6 space-y-2">
                    <li>قد تحتوي المنصة على روابط لمواقع أو خدمات طرف ثالث.</li>
                    <li>لا نتحمل مسؤولية سياسات الخصوصية الخاصة بمواقع الطرف الثالث.</li>
                    <li>ننصحك بمراجعة سياسات الخصوصية لأي موقع خارجي تزوره عبر منصتنا.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">11. الإشعارات</h2>
                  <p>
                    نرسل إشعارات داخل التطبيق وإشعارات دفع (إذا فعّلتها) بخصوص نتائج الألعاب، تحديثات التداول، والأنشطة المهمة. يمكنك التحكم في إعدادات الإشعارات من صفحة الإعدادات.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">12. تغييرات السياسة</h2>
                  <p>
                    نحتفظ بالحق في تحديث سياسة الخصوصية هذه في أي وقت. سنُعلمك بالتغييرات الجوهرية عبر المنصة. ننصحك بمراجعة هذه السياسة دورياً. استمرارك في استخدام المنصة يعني قبولك للسياسة المحدثة.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">13. التواصل معنا</h2>
                  <p>
                    إذا كانت لديك أي أسئلة أو مخاوف بشأن سياسة الخصوصية هذه أو ممارسات البيانات لدينا، يرجى التواصل معنا عبر نظام الدعم داخل المنصة.
                  </p>
                </section>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground leading-relaxed">
                <section>
                  <h2 className="text-xl font-semibold text-primary">1. Introduction</h2>
                  <p>
                    At VEX, we are committed to protecting your privacy and personal data. This policy explains how we collect, use, protect, and share your information when using our Platform. By using the Platform, you consent to the data collection and usage practices described in this policy.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">2. Data We Collect</h2>
                  <h3 className="text-lg font-medium mt-3">a. Data you provide directly:</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Registration data: Nickname, phone number, email address, password (encrypted).</li>
                    <li>Profile data: Avatar, optional personal information.</li>
                    <li>Transaction data: Deposit, withdrawal, and P2P transaction history.</li>
                    <li>Messages: In-app chat conversations and disputes.</li>
                  </ul>
                  <h3 className="text-lg font-medium mt-3">b. Automatically collected data:</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Device information: Browser type, operating system, device identifier.</li>
                    <li>Usage data: Pages visited, games played, session duration.</li>
                    <li>IP address and approximate location data.</li>
                    <li>Cookies and session identifiers.</li>
                    <li>Performance logs and technical errors.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">3. How We Use Your Data</h2>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Providing, maintaining, and improving Platform services.</li>
                    <li>Processing financial transactions and wallet management.</li>
                    <li>Verifying your identity and preventing fraud.</li>
                    <li>Managing games, competitions, and tournaments.</li>
                    <li>Communicating with you about your account and service updates.</li>
                    <li>Sending platform notifications (game results, trade updates).</li>
                    <li>Improving user experience through usage pattern analysis.</li>
                    <li>Preventing abuse and maintaining Platform security.</li>
                    <li>Complying with legal and regulatory requirements.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">4. Data Protection & Security</h2>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Passwords are encrypted using strong hashing algorithms (bcrypt).</li>
                    <li>All communications are encrypted via HTTPS/TLS protocol.</li>
                    <li>We employ protection against SQL Injection and Cross-Site Scripting (XSS) attacks.</li>
                    <li>We implement rate limiting to prevent brute force attacks.</li>
                    <li>We monitor suspicious activities and unauthorized access attempts.</li>
                    <li>Access to personal data is restricted to authorized personnel only.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">5. Data Sharing</h2>
                  <p>We do not sell your personal data to third parties. We may share your data in the following cases:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>With payment service providers to process financial transactions.</li>
                    <li>With law enforcement when required by court order.</li>
                    <li>When necessary to protect our rights or user safety.</li>
                    <li>With counterparties in P2P transactions (limited information only).</li>
                    <li>In case of merger or acquisition (with prior notice).</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">6. Cookies</h2>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>We use essential cookies for authentication and session management.</li>
                    <li>We use analytical cookies to understand usage patterns.</li>
                    <li>You can manage cookie settings through your browser.</li>
                    <li>Disabling certain cookies may affect Platform functionality.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">7. User Rights</h2>
                  <p>You have the following rights regarding your data:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Right of Access:</strong> Request a copy of your personal data.</li>
                    <li><strong>Right to Rectification:</strong> Request correction of inaccurate data.</li>
                    <li><strong>Right to Erasure:</strong> Request deletion of your data (subject to legal requirements).</li>
                    <li><strong>Right to Object:</strong> Object to processing of your data for certain purposes.</li>
                    <li><strong>Right to Portability:</strong> Request transfer of your data in a readable format.</li>
                  </ul>
                  <p>To exercise these rights, contact us through the support system.</p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">8. Data Retention</h2>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>We retain account data as long as the account is active.</li>
                    <li>We retain financial transaction records for the legally required period.</li>
                    <li>After account deletion, we retain certain data for the legally required duration.</li>
                    <li>Security logs are kept for a minimum of 12 months.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">9. Children's Privacy</h2>
                  <p>
                    The Platform is not intended for children under 18 years of age. We do not knowingly collect personal data from children. If we discover that a child under 18 has created an account, we will delete it immediately and contact the guardian if possible.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">10. Third-Party Services</h2>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>The Platform may contain links to third-party websites or services.</li>
                    <li>We are not responsible for the privacy policies of third-party websites.</li>
                    <li>We recommend reviewing the privacy policies of any external site you visit through our Platform.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">11. Notifications</h2>
                  <p>
                    We send in-app notifications and push notifications (if enabled) regarding game results, trade updates, and important activities. You can control notification settings from the Settings page.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">12. Policy Changes</h2>
                  <p>
                    We reserve the right to update this Privacy Policy at any time. We will notify you of material changes through the Platform. We encourage you to review this policy periodically. Your continued use of the Platform constitutes acceptance of the updated policy.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-primary">13. Contact Us</h2>
                  <p>
                    If you have any questions or concerns about this Privacy Policy or our data practices, please contact us through the in-app support system.
                  </p>
                </section>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
