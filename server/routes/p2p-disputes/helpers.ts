/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// ==================== STATIC DATA ====================

export const prewrittenResponses = [
  { id: "pr-1", category: "payment_proof", title: "Payment Completed", titleAr: "تم الدفع", message: "I have completed the payment. Please check your account and confirm receipt.", messageAr: "لقد أتممت الدفع. يرجى التحقق من حسابك وتأكيد الاستلام." },
  { id: "pr-2", category: "payment_proof", title: "Payment Screenshot Attached", titleAr: "مرفق لقطة شاشة الدفع", message: "I have attached a screenshot of the payment transaction as proof.", messageAr: "لقد أرفقت لقطة شاشة لمعاملة الدفع كإثبات." },
  { id: "pr-3", category: "payment_not_received", title: "Payment Not Received", titleAr: "لم يتم استلام الدفع", message: "I have not received the payment yet. Please provide proof of transaction.", messageAr: "لم أستلم الدفع بعد. يرجى تقديم إثبات المعاملة." },
  { id: "pr-4", category: "wrong_amount", title: "Wrong Amount Received", titleAr: "استلام مبلغ خاطئ", message: "The amount received does not match the agreed amount. Please review and correct.", messageAr: "المبلغ المستلم لا يتطابق مع المبلغ المتفق عليه. يرجى المراجعة والتصحيح." },
  { id: "pr-5", category: "release_request", title: "Request to Release", titleAr: "طلب الإفراج", message: "Please release the crypto as I have completed the payment successfully.", messageAr: "يرجى إطلاق العملة المشفرة حيث أنني أتممت الدفع بنجاح." },
  { id: "pr-6", category: "name_mismatch", title: "Name Mismatch", titleAr: "عدم تطابق الاسم", message: "The payment was made from a different account name. Please verify the payment details.", messageAr: "تم الدفع من حساب باسم مختلف. يرجى التحقق من تفاصيل الدفع." },
  { id: "pr-7", category: "bank_delay", title: "Bank Processing Delay", titleAr: "تأخير المعالجة البنكية", message: "My bank is taking time to process the payment. It should arrive within 2-4 hours.", messageAr: "البنك يستغرق وقتاً لمعالجة الدفع. يجب أن يصل خلال 2-4 ساعات." },
  { id: "pr-8", category: "cancel_request", title: "Request to Cancel", titleAr: "طلب إلغاء", message: "I would like to cancel this trade due to unforeseen circumstances.", messageAr: "أود إلغاء هذه الصفقة بسبب ظروف غير متوقعة." },
];

export const disputeRules = [
  { id: "rule-1", category: "proof_requirements", title: "Payment Proof Requirements", titleAr: "متطلبات إثبات الدفع", content: "All payment proofs must include: 1) Full transaction reference number, 2) Date and time of transaction, 3) Sender and receiver names, 4) Transaction amount, 5) Bank/payment method name clearly visible.", contentAr: "يجب أن تتضمن جميع إثباتات الدفع: 1) رقم مرجع المعاملة الكامل، 2) تاريخ ووقت المعاملة، 3) أسماء المرسل والمستلم، 4) مبلغ المعاملة، 5) اسم البنك/طريقة الدفع بشكل واضح.", icon: "FileCheck" },
  { id: "rule-2", category: "screenshot_guidelines", title: "Screenshot Guidelines", titleAr: "إرشادات لقطات الشاشة", content: "Screenshots must be: 1) Original and unedited, 2) Full screen captures showing complete information, 3) Clearly readable with no blurry text, 4) Showing the transaction date and time, 5) Including bank/app name in the screenshot.", contentAr: "يجب أن تكون لقطات الشاشة: 1) أصلية وغير معدلة، 2) التقاطات شاشة كاملة تظهر المعلومات الكاملة، 3) قابلة للقراءة بوضوح بدون نص ضبابي، 4) تظهر تاريخ ووقت المعاملة، 5) تتضمن اسم البنك/التطبيق.", icon: "Camera" },
  { id: "rule-3", category: "video_evidence", title: "Video Evidence Guidelines", titleAr: "إرشادات الفيديو كإثبات", content: "Video evidence should: 1) Be recorded from the official banking app, 2) Show scrolling through the full transaction details, 3) Include the current date/time on the device, 4) Be no longer than 60 seconds, 5) Clearly show all relevant information.", contentAr: "يجب أن يكون الفيديو كإثبات: 1) مسجلاً من تطبيق البنك الرسمي، 2) يظهر التمرير خلال تفاصيل المعاملة الكاملة، 3) يتضمن التاريخ/الوقت الحالي على الجهاز، 4) لا يزيد عن 60 ثانية، 5) يظهر جميع المعلومات ذات الصلة بوضوح.", icon: "Video" },
  { id: "rule-4", category: "prohibited_actions", title: "Prohibited Actions", titleAr: "الإجراءات المحظورة", content: "The following actions are prohibited and may result in account suspension: 1) Submitting fake or edited screenshots, 2) Using offensive language, 3) Making false claims, 4) Not responding within the given timeframe, 5) Trading outside the platform.", contentAr: "الإجراءات التالية محظورة وقد تؤدي إلى تعليق الحساب: 1) تقديم لقطات شاشة مزيفة أو معدلة، 2) استخدام لغة مسيئة، 3) تقديم ادعاءات كاذبة، 4) عدم الرد خلال الإطار الزمني المحدد، 5) التداول خارج المنصة.", icon: "Ban" },
  { id: "rule-5", category: "timeframe", title: "Response Timeframe", titleAr: "الإطار الزمني للرد", content: "All parties must respond within: 1) 10 minutes for peer negotiation, 2) 24 hours for evidence submission, 3) 48 hours for additional documentation if requested. Failure to respond may result in automatic resolution in favor of the responding party.", contentAr: "يجب على جميع الأطراف الرد خلال: 1) 10 دقائق للتفاوض بين الأطراف، 2) 24 ساعة لتقديم الأدلة، 3) 48 ساعة للوثائق الإضافية إذا طُلبت. قد يؤدي عدم الرد إلى حل تلقائي لصالح الطرف المستجيب.", icon: "Clock" },
];

// ==================== HELPERS ====================

export const PEER_NEGOTIATION_MINUTES = 10;

/** Derive the client-facing "stage" from the DB status */
export function deriveStage(status: string): "peer_negotiation" | "support_review" | "resolved" {
  switch (status) {
    case "open":
      return "peer_negotiation";
    case "investigating":
      return "support_review";
    case "resolved":
    case "closed":
      return "resolved";
    default:
      return "peer_negotiation";
  }
}

/** Format a dispute row + trade info into the shape the frontend expects */
export function formatDispute(row: Record<string, unknown>) {
  const createdAt = row.dispute_created_at ?? row.createdAt;
  const createdAtStr = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt);
  return {
    id: row.dispute_id ?? row.id,
    tradeId: row.trade_id ?? row.tradeId,
    initiatorId: row.initiator_id ?? row.initiatorId,
    initiatorName: row.initiator_name ?? row.initiatorName,
    respondentId: row.respondent_id ?? row.respondentId,
    respondentName: row.respondent_name ?? row.respondentName,
    status: row.dispute_status ?? row.status,
    reason: row.reason,
    description: row.description,
    stage: deriveStage(String(row.dispute_status ?? row.status ?? '')),
    peerNegotiationEndsAt: new Date(
      new Date(createdAtStr).getTime() + PEER_NEGOTIATION_MINUTES * 60 * 1000
    ).toISOString(),
    tradeAmount: `${row.trade_amount ?? "0"} ${String(row.currency_type ?? "usd").toUpperCase()}`,
    tradeFiatAmount: `${row.fiat_amount ?? "0"} USD`,
    createdAt: createdAtStr,
  };
}
