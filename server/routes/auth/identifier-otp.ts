import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { loginMethodConfigs, otpVerifications, type User } from "@shared/schema";
import { JWT_USER_SECRET } from "../../lib/auth-config";
import { buildOtpEmailHtml, buildOtpSmsMessage, sendEmail, sendSms } from "../../lib/messaging";
import { isSafeEmailAddress, isSafePhoneNumber } from "../../lib/input-security";

export type IdentifierOtpMethod = "email" | "phone";
export type IdentifierOtpFlow = "login" | "signup";

export interface IdentifierOtpChallengePayload {
    purpose: "identifier_otp";
    uid: string;
    methods: IdentifierOtpMethod[];
    preferred: IdentifierOtpMethod;
    flow: IdentifierOtpFlow;
    nonce: string;
    iat?: number;
    exp?: number;
}

const IDENTIFIER_OTP_CHALLENGE_EXPIRY_SECONDS = 10 * 60;
const OTP_FALLBACK_LENGTH = 6;
const OTP_FALLBACK_EXPIRY_MINUTES = 10;

type UserOtpProfile = Pick<User, "id" | "email" | "phone" | "emailVerified" | "phoneVerified">;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizeMethods(methods: unknown): IdentifierOtpMethod[] {
    if (!Array.isArray(methods)) return [];

    const unique = new Set<IdentifierOtpMethod>();
    for (const method of methods) {
        if (method === "email" || method === "phone") {
            unique.add(method);
        }
    }

    return Array.from(unique);
}

function maskEmail(email: string): string {
    const [local = "", domain = ""] = email.split("@");
    if (!local || !domain) return "***";
    const head = local.slice(0, Math.min(2, local.length));
    return `${head}***@${domain}`;
}

function maskPhone(phone: string): string {
    const clean = phone.trim();
    if (clean.length <= 4) return "****";
    return `${clean.slice(0, 2)}****${clean.slice(-2)}`;
}

function resolveContactValue(user: UserOtpProfile, method: IdentifierOtpMethod, flow: IdentifierOtpFlow): string | null {
    if (method === "email") {
        const email = (user.email || "").trim().toLowerCase();
        if (!email || !isSafeEmailAddress(email)) return null;
        if (flow === "login" && !user.emailVerified) return null;
        return email;
    }

    const phone = (user.phone || "").trim();
    if (!phone || !isSafePhoneNumber(phone)) return null;
    if (flow === "login" && !user.phoneVerified) return null;
    return phone;
}

export function getVerifiedIdentifierMethods(user: UserOtpProfile): IdentifierOtpMethod[] {
    const methods: IdentifierOtpMethod[] = [];

    if (resolveContactValue(user, "email", "login")) {
        methods.push("email");
    }

    if (resolveContactValue(user, "phone", "login")) {
        methods.push("phone");
    }

    return methods;
}

export function getSignupIdentifierMethods(user: UserOtpProfile): IdentifierOtpMethod[] {
    const methods: IdentifierOtpMethod[] = [];

    if (resolveContactValue(user, "email", "signup")) {
        methods.push("email");
    }

    if (resolveContactValue(user, "phone", "signup")) {
        methods.push("phone");
    }

    return methods;
}

async function readOtpSettings(method: IdentifierOtpMethod): Promise<{ otpLength: number; otpExpiryMinutes: number }> {
    let otpLength = OTP_FALLBACK_LENGTH;
    let otpExpiryMinutes = OTP_FALLBACK_EXPIRY_MINUTES;

    try {
        const [config] = await db.select().from(loginMethodConfigs)
            .where(eq(loginMethodConfigs.method, method))
            .limit(1);

        if (config) {
            otpLength = clamp(config.otpLength || OTP_FALLBACK_LENGTH, 4, 8);
            otpExpiryMinutes = clamp(config.otpExpiryMinutes || OTP_FALLBACK_EXPIRY_MINUTES, 1, 30);
        }
    } catch {
        // Fallback to defaults if config table is unavailable.
    }

    return { otpLength, otpExpiryMinutes };
}

export function createIdentifierOtpChallengeToken(input: {
    userId: string;
    methods: IdentifierOtpMethod[];
    preferredMethod: IdentifierOtpMethod;
    flow: IdentifierOtpFlow;
}): string {
    const methods = normalizeMethods(input.methods);
    if (methods.length === 0) {
        throw new Error("No OTP methods available for challenge token");
    }

    const preferred = methods.includes(input.preferredMethod) ? input.preferredMethod : methods[0];

    const payload: IdentifierOtpChallengePayload = {
        purpose: "identifier_otp",
        uid: input.userId,
        methods,
        preferred,
        flow: input.flow,
        nonce: crypto.randomBytes(16).toString("hex"),
    };

    return jwt.sign(payload, JWT_USER_SECRET, { expiresIn: IDENTIFIER_OTP_CHALLENGE_EXPIRY_SECONDS });
}

export function verifyIdentifierOtpChallengeToken(token: string): IdentifierOtpChallengePayload | null {
    try {
        const decoded = jwt.verify(token, JWT_USER_SECRET) as Partial<IdentifierOtpChallengePayload>;
        const methods = normalizeMethods(decoded.methods);

        if (decoded.purpose !== "identifier_otp") return null;
        if (typeof decoded.uid !== "string" || decoded.uid.length === 0) return null;
        if (decoded.flow !== "login" && decoded.flow !== "signup") return null;
        if (methods.length === 0) return null;

        const preferred = decoded.preferred === "email" || decoded.preferred === "phone"
            ? decoded.preferred
            : methods[0];

        return {
            purpose: "identifier_otp",
            uid: decoded.uid,
            methods,
            preferred: methods.includes(preferred) ? preferred : methods[0],
            flow: decoded.flow,
            nonce: typeof decoded.nonce === "string" ? decoded.nonce : "",
            iat: decoded.iat,
            exp: decoded.exp,
        };
    } catch {
        return null;
    }
}

export async function issueIdentifierOtp(input: {
    user: UserOtpProfile;
    method: IdentifierOtpMethod;
    flow: IdentifierOtpFlow;
}): Promise<{ sent: boolean; maskedTarget: string; expiresInSeconds: number }> {
    const { user, method, flow } = input;
    const contactValue = resolveContactValue(user, method, flow);
    if (!contactValue) {
        return { sent: false, maskedTarget: "", expiresInSeconds: 0 };
    }

    const { otpLength, otpExpiryMinutes } = await readOtpSettings(method);
    const otpMin = Math.pow(10, otpLength - 1);
    const otpMax = Math.pow(10, otpLength) - 1;
    const otpCode = crypto.randomInt(otpMin, otpMax + 1).toString();
    const codeHash = await bcrypt.hash(otpCode, 12);
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    await db.delete(otpVerifications)
        .where(and(
            eq(otpVerifications.userId, user.id),
            eq(otpVerifications.contactType, method),
        ));

    await db.insert(otpVerifications).values({
        userId: user.id,
        contactType: method,
        contactValue,
        codeHash,
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
    });

    const delivered = method === "email"
        ? await sendEmail({
            to: contactValue,
            subject: "VEX - Login Verification Code",
            text: `Your verification code is: ${otpCode}\nValid for ${otpExpiryMinutes} minutes.`,
            html: buildOtpEmailHtml(otpCode, otpExpiryMinutes),
        })
        : await sendSms({
            to: contactValue,
            message: buildOtpSmsMessage(otpCode, otpExpiryMinutes),
        });

    if (!delivered) {
        await db.delete(otpVerifications)
            .where(and(
                eq(otpVerifications.userId, user.id),
                eq(otpVerifications.contactType, method),
            ));

        return { sent: false, maskedTarget: "", expiresInSeconds: 0 };
    }

    return {
        sent: true,
        maskedTarget: method === "email" ? maskEmail(contactValue) : maskPhone(contactValue),
        expiresInSeconds: otpExpiryMinutes * 60,
    };
}

export async function verifyIdentifierOtpCode(input: {
    userId: string;
    methods: IdentifierOtpMethod[];
    code: string;
}): Promise<{ valid: boolean; matchedMethod?: IdentifierOtpMethod }> {
    const methods = normalizeMethods(input.methods);
    if (methods.length === 0) {
        return { valid: false };
    }

    const records = await db.select()
        .from(otpVerifications)
        .where(and(
            eq(otpVerifications.userId, input.userId),
            inArray(otpVerifications.contactType, methods),
        ))
        .orderBy(desc(otpVerifications.createdAt))
        .limit(8);

    if (records.length === 0) {
        return { valid: false };
    }

    const now = new Date();
    const normalizedCode = input.code.trim();
    let attemptsCandidate: (typeof records)[number] | null = null;

    for (const record of records) {
        if (record.consumedAt) continue;
        if (record.expiresAt <= now) continue;
        if (record.attempts >= record.maxAttempts) continue;

        if (!attemptsCandidate) {
            attemptsCandidate = record;
        }

        const isMatch = await bcrypt.compare(normalizedCode, record.codeHash);
        if (!isMatch) {
            continue;
        }

        await db.update(otpVerifications)
            .set({ consumedAt: new Date() })
            .where(eq(otpVerifications.id, record.id));

        return {
            valid: true,
            matchedMethod: record.contactType as IdentifierOtpMethod,
        };
    }

    if (attemptsCandidate) {
        await db.update(otpVerifications)
            .set({ attempts: attemptsCandidate.attempts + 1 })
            .where(eq(otpVerifications.id, attemptsCandidate.id));
    }

    return { valid: false };
}
