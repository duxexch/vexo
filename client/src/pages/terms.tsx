import { useI18n } from "@/lib/i18n";
import { Shield } from "lucide-react";
import { LegalDocumentLayout } from "@/components/legal/LegalDocumentLayout";

export default function TermsPage() {
  const { language } = useI18n();
  const isAr = language === "ar";

  return (
    <LegalDocumentLayout
      icon={Shield}
      titleAr="الشروط والأحكام"
      titleEn="Terms & Conditions"
      updatedAtAr="آخر تحديث: 25 فبراير 2026"
      updatedAtEn="Last Updated: February 25, 2026"
    >
      {isAr ? (
        <div className="legal-content max-w-none space-y-6 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-xl font-semibold text-primary">1. مقدمة</h2>
            <p>
              مرحباً بك في منصة VEX ("المنصة"، "نحن"، "الخدمة"). باستخدامك لهذه المنصة، فإنك توافق على الالتزام بهذه الشروط والأحكام. يرجى قراءتها بعناية قبل استخدام أي من خدماتنا.
            </p>
            <p>
              VEX هي منصة ألعاب وتداول نظير لنظير (P2P) تتيح للمستخدمين لعب ألعاب متنوعة والتداول فيما بينهم. إذا كنت لا توافق على هذه الشروط، يرجى عدم استخدام المنصة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">2. الأهلية</h2>
            <ul className="list-disc pr-6 space-y-2">
              <li>يجب أن يكون عمرك 18 عاماً على الأقل لاستخدام هذه المنصة.</li>
              <li>يجب أن تكون مؤهلاً قانونياً لاستخدام خدمات الألعاب والتداول وفقاً لقوانين بلدك.</li>
              <li>أنت مسؤول عن التحقق من أن استخدامك للمنصة لا ينتهك أي قوانين محلية أو دولية.</li>
              <li>لا يُسمح بإنشاء حسابات متعددة. الحساب الواحد لمستخدم واحد فقط.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">3. حساب المستخدم</h2>
            <ul className="list-disc pr-6 space-y-2">
              <li>أنت مسؤول عن الحفاظ على سرية بيانات حسابك (رقم الحساب وكلمة المرور).</li>
              <li>أنت مسؤول عن جميع الأنشطة التي تتم تحت حسابك.</li>
              <li>يجب عليك إبلاغنا فوراً عند اكتشاف أي استخدام غير مصرح به لحسابك.</li>
              <li>نحتفظ بالحق في تعليق أو إنهاء أي حساب ينتهك هذه الشروط.</li>
              <li>يجب أن تكون جميع المعلومات المقدمة عند التسجيل صحيحة ودقيقة.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">4. الألعاب والمسابقات</h2>
            <ul className="list-disc pr-6 space-y-2">
              <li>توفر المنصة ألعاباً متنوعة تشمل الشطرنج، الطاولة (النرد)، الدومينو، البلوت، الطرنيب وغيرها.</li>
              <li>قد تتضمن بعض الألعاب رهانات برصيد افتراضي أو حقيقي حسب الإعدادات.</li>
              <li>يُمنع استخدام أي برامج غش أو أدوات مساعدة خارجية أثناء اللعب.</li>
              <li>يُمنع التلاعب بنتائج المباريات أو التواطؤ مع لاعبين آخرين.</li>
              <li>نحتفظ بالحق في إلغاء أي مباراة أو بطولة يُشتبه فيها بالغش.</li>
              <li>نتائج الألعاب نهائية بعد التأكيد ولا يمكن الطعن فيها إلا عبر نظام الشكاوى.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">5. المعاملات المالية والمحفظة</h2>
            <ul className="list-disc pr-6 space-y-2">
              <li>تتضمن المنصة نظام محفظة رقمية لإدارة الرصيد.</li>
              <li>جميع عمليات الإيداع والسحب تخضع لعمليات المراجعة والتحقق.</li>
              <li>نحتفظ بالحق في تجميد الأرصدة المشتبه بها أو المرتبطة بأنشطة مشبوهة.</li>
              <li>رسوم المعاملات (إن وُجدت) ستُعرض بوضوح قبل التأكيد.</li>
              <li>أنت مسؤول عن دفع أي ضرائب أو رسوم مترتبة على أرباحك وفقاً لقوانين بلدك.</li>
              <li>لا نتحمل مسؤولية أي خسائر ناتجة عن تقلبات الأسعار أو أخطاء التداول.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">6. التداول نظير لنظير (P2P)</h2>
            <ul className="list-disc pr-6 space-y-2">
              <li>تداول P2P يتم مباشرة بين المستخدمين. المنصة توفر فقط البنية التحتية والوساطة.</li>
              <li>أنت مسؤول عن التحقق من هوية الطرف الآخر وصحة المعاملة.</li>
              <li>في حال النزاع، سيتم التحكيم وفقاً لنظام النزاعات الداخلي.</li>
              <li>يُمنع استخدام P2P لغسل الأموال أو أي أنشطة غير قانونية.</li>
              <li>يحق للمنصة إلغاء أي صفقة مشبوهة وتجميد الحسابات المرتبطة.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">7. السلوك المحظور</h2>
            <ul className="list-disc pr-6 space-y-2">
              <li>الغش أو التلاعب بالألعاب أو النتائج.</li>
              <li>استخدام لغة مسيئة أو تهديدات أو تحرش تجاه مستخدمين آخرين.</li>
              <li>انتحال شخصية مستخدم آخر أو مشرف.</li>
              <li>محاولة اختراق المنصة أو استغلال ثغرات أمنية.</li>
              <li>إنشاء حسابات متعددة أو حسابات وهمية.</li>
              <li>استخدام المنصة لأي نشاط غير قانوني.</li>
              <li>نشر محتوى غير لائق أو مخالف للآداب العامة.</li>
              <li>مشاركة بيانات حسابك مع أشخاص آخرين.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">8. نظام الإحالات والمكافآت</h2>
            <ul className="list-disc pr-6 space-y-2">
              <li>يمكنك دعوة أصدقاء عبر رمز الإحالة الخاص بك.</li>
              <li>المكافآت تُمنح وفقاً للشروط المعلنة وقابلة للتغيير.</li>
              <li>يُمنع إساءة استخدام نظام الإحالات عبر حسابات وهمية.</li>
              <li>نحتفظ بالحق في إلغاء المكافآت في حال اكتشاف سوء استخدام.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">9. الملكية الفكرية</h2>
            <p>
              جميع المحتويات والتصاميم والبرمجيات والعلامات التجارية على المنصة مملوكة لنا أو مرخصة لنا. لا يحق لك نسخ أو توزيع أو تعديل أي جزء من المنصة دون إذن كتابي مسبق.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">10. إخلاء المسؤولية</h2>
            <ul className="list-disc pr-6 space-y-2">
              <li>المنصة مقدمة "كما هي" دون أي ضمانات صريحة أو ضمنية.</li>
              <li>لا نضمن عمل الخدمة دون انقطاع أو خلوها من الأخطاء.</li>
              <li>لا نتحمل مسؤولية أي خسائر مالية ناتجة عن استخدام المنصة.</li>
              <li>أنت تستخدم المنصة على مسؤوليتك الشخصية.</li>
              <li>لا نتحمل مسؤولية أي محتوى ينشئه المستخدمون.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">11. التعديلات على الشروط</h2>
            <p>
              نحتفظ بالحق في تعديل هذه الشروط والأحكام في أي وقت. سيتم إشعارك بأي تغييرات جوهرية عبر المنصة أو البريد الإلكتروني. استمرارك في استخدام المنصة بعد التعديل يُعتبر قبولاً للشروط الجديدة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">12. إنهاء الحساب</h2>
            <ul className="list-disc pr-6 space-y-2">
              <li>يمكنك طلب إغلاق حسابك في أي وقت عبر التواصل مع الدعم.</li>
              <li>نحتفظ بالحق في إنهاء حسابك فوراً إذا انتهكت هذه الشروط.</li>
              <li>عند إغلاق الحساب، سيتم التعامل مع الرصيد المتبقي وفقاً لسياستنا.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">13. القانون الحاكم</h2>
            <p>
              تخضع هذه الشروط والأحكام وتُفسَّر وفقاً للقوانين المعمول بها. أي نزاعات تنشأ عن استخدام المنصة ستُحل عبر التحكيم أو المحاكم المختصة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">14. التواصل</h2>
            <p>
              للتواصل معنا بخصوص هذه الشروط أو أي استفسارات، يمكنك استخدام نظام الدعم داخل المنصة أو التواصل عبر قنوات الدعم المتاحة.
            </p>
          </section>
        </div>
      ) : (
        <div className="legal-content max-w-none space-y-6 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-xl font-semibold text-primary">1. Introduction</h2>
            <p>
              Welcome to VEX ("Platform", "we", "our", "Service"). By using this Platform, you agree to be bound by these Terms and Conditions. Please read them carefully before using any of our services.
            </p>
            <p>
              VEX is a gaming and peer-to-peer (P2P) trading platform that allows users to play various games and trade between each other. If you do not agree to these terms, please do not use the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">2. Eligibility</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must be at least 18 years of age to use this Platform.</li>
              <li>You must be legally eligible to use gaming and trading services per the laws of your country.</li>
              <li>You are responsible for verifying that your use of the Platform does not violate any local or international laws.</li>
              <li>Multiple accounts are not permitted. One account per user only.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">3. User Account</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You are responsible for maintaining the confidentiality of your account credentials (account ID, password).</li>
              <li>You are responsible for all activities that occur under your account.</li>
              <li>You must notify us immediately upon discovering any unauthorized use of your account.</li>
              <li>We reserve the right to suspend or terminate any account that violates these terms.</li>
              <li>All information provided during registration must be accurate and truthful.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">4. Games & Competitions</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>The Platform offers various games including Chess, Backgammon, Domino, Baloot, Tarneeb and others.</li>
              <li>Some games may involve wagers with virtual or real balance depending on settings.</li>
              <li>The use of cheating software or external assistance tools during gameplay is strictly prohibited.</li>
              <li>Match fixing or collusion with other players is prohibited.</li>
              <li>We reserve the right to cancel any match or tournament suspected of cheating.</li>
              <li>Game results are final after confirmation and can only be disputed through the complaints system.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">5. Financial Transactions & Wallet</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>The Platform includes a digital wallet system for balance management.</li>
              <li>All deposit and withdrawal operations are subject to review and verification.</li>
              <li>We reserve the right to freeze suspicious balances or those associated with suspicious activities.</li>
              <li>Transaction fees (if any) will be clearly displayed before confirmation.</li>
              <li>You are responsible for paying any taxes or fees on your earnings as required by your local laws.</li>
              <li>We are not liable for any losses resulting from price fluctuations or trading errors.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">6. Peer-to-Peer (P2P) Trading</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>P2P trading occurs directly between users. The Platform only provides the infrastructure and mediation.</li>
              <li>You are responsible for verifying the identity of the other party and the validity of the transaction.</li>
              <li>In case of dispute, arbitration will follow the internal dispute resolution system.</li>
              <li>Using P2P for money laundering or any illegal activities is strictly prohibited.</li>
              <li>The Platform reserves the right to cancel suspicious transactions and freeze associated accounts.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">7. Prohibited Conduct</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Cheating or manipulating games or results.</li>
              <li>Using abusive language, threats, or harassment toward other users.</li>
              <li>Impersonating another user or administrator.</li>
              <li>Attempting to hack the Platform or exploit security vulnerabilities.</li>
              <li>Creating multiple or fake accounts.</li>
              <li>Using the Platform for any illegal activity.</li>
              <li>Publishing inappropriate or offensive content.</li>
              <li>Sharing your account credentials with others.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">8. Referral & Rewards System</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You can invite friends via your referral code.</li>
              <li>Rewards are granted per announced conditions and are subject to change.</li>
              <li>Abusing the referral system via fake accounts is prohibited.</li>
              <li>We reserve the right to revoke rewards in case of abuse.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">9. Intellectual Property</h2>
            <p>
              All content, designs, software, and trademarks on the Platform are owned by us or licensed to us. You may not copy, distribute, or modify any part of the Platform without prior written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">10. Disclaimer</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>The Platform is provided "as is" without any express or implied warranties.</li>
              <li>We do not guarantee uninterrupted or error-free service.</li>
              <li>We are not liable for any financial losses arising from the use of the Platform.</li>
              <li>You use the Platform at your own risk.</li>
              <li>We are not responsible for any user-generated content.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">11. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms and Conditions at any time. You will be notified of any material changes via the Platform or email. Your continued use of the Platform after modifications constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">12. Account Termination</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You may request account closure at any time by contacting support.</li>
              <li>We reserve the right to terminate your account immediately if you violate these terms.</li>
              <li>Upon account closure, remaining balance will be handled per our policy.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">13. Governing Law</h2>
            <p>
              These Terms and Conditions are governed by and construed in accordance with applicable laws. Any disputes arising from the use of the Platform will be resolved through arbitration or competent courts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">14. Contact</h2>
            <p>
              To contact us regarding these terms or any inquiries, you can use the in-app support system or reach out through available support channels.
            </p>
          </section>
        </div>
      )}
    </LegalDocumentLayout>
  );
}
