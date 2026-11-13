// Excerpt from the private EventXplore codebase (src/lib/...). Shown as-is for review; imports resolve inside the full repo.

import { PaymentConfigurationError } from "@/lib/payments/errors";
import { minorUnitsToBaht } from "@/lib/payments/money";
import type { Money } from "@/lib/payments/types";
import { sanitizeThaiMobileNumber } from "@/lib/payments/thai-mobile";
import { promptPayIdKind, sanitizePromptPayId } from "@/lib/payments/promptpay-id";

const PROMPTPAY_ID_ENV_VAR = "PAYMENT_PROMPTPAY_ID";

const PROMPTPAY_AID = "A000000677010111";

export { sanitizeThaiMobileNumber };

function encodeMobileProxyValue(localMobileNumber: string): string {
  return `0066${localMobileNumber.slice(1)}`;
}

/** Tag 29 sub-tag 01 = mobile number (as 0066 + 9 digits), sub-tag 02 = 13-digit national ID / tax ID. */
function proxyFieldFor(promptPayId: string): { subTag: "01" | "02"; value: string } {
  return promptPayIdKind(promptPayId) === "tax_id" ? { subTag: "02", value: promptPayId } : { subTag: "01", value: encodeMobileProxyValue(promptPayId) };
}

function promptPayIdFromEnv(): string {
  const raw = process.env[PROMPTPAY_ID_ENV_VAR]?.trim();
  if (!raw) {
    throw new PaymentConfigurationError(
      `No PromptPay-category payment account is assigned to the current Event in Payment ` +
        `Accounts (/admin/payment-accounts), and ${PROMPTPAY_ID_ENV_VAR} is not set (local .env only, ` +
        "must be a 10-digit Thai mobile number or a 13-digit national ID / tax ID registered with PromptPay).",
    );
  }

  const sanitized = sanitizePromptPayId(raw);
  if (!sanitized) {
    throw new PaymentConfigurationError(
      `${PROMPTPAY_ID_ENV_VAR} is neither a 10-digit Thai mobile number nor a 13-digit national ID / tax ID ` +
        "with a valid checksum. e-Wallet PromptPay IDs are not supported.",
    );
  }

  return sanitized;
}

type AssignedPromptPay = { assigned: false } | { assigned: true; promptPayId: string | null };

/**
 * The Event's own receiving account decides the payment mode. When that account has no PromptPay
 * (bank-transfer, amount typed by the payer), the answer is "assigned, no PromptPay" and callers must
 * NOT fall back to the environment PromptPay ID, or customers would be shown a QR for someone else's
 * account. The env value is only a fallback for an Event with no active account assigned at all.
 */
async function resolveAssignedPromptPay(forEventId?: string | null): Promise<AssignedPromptPay> {
  try {
    const { resolveOwnerEventId } = await import("@/lib/events/resolve-owner-event");
    const { getEventPaymentAccountId, getPaymentAccount } = await import("@/lib/payments/payment-accounts-service");

    const eventId = forEventId ?? (await resolveOwnerEventId());
    if (!eventId) return { assigned: false };
    const accountId = await getEventPaymentAccountId(eventId);
    if (!accountId) return { assigned: false };
    const account = await getPaymentAccount(accountId);
    if (!account || !account.isActive) return { assigned: false };
    return { assigned: true, promptPayId: sanitizePromptPayId(account.promptpayId) };
  } catch {
    return { assigned: false };
  }
}

export async function resolvePromptPayId(forEventId?: string | null): Promise<string> {
  const assigned = await resolveAssignedPromptPay(forEventId);
  if (assigned.assigned) {
    if (assigned.promptPayId) return assigned.promptPayId;
    throw new PaymentConfigurationError("The payment account assigned to this Event has no PromptPay ID (bank-transfer mode, no QR).");
  }
  return promptPayIdFromEnv();
}

export async function isPromptPayConfigured(forEventId?: string | null): Promise<boolean> {
  try {
    await resolvePromptPayId(forEventId);
    return true;
  } catch {
    return false;
  }
}

function crc16CcittFalseHex(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= (input.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function assertCrc16ImplementationCorrect(): void {
  const actual = crc16CcittFalseHex("123456789");
  if (actual !== "29B1") {
    throw new Error(
      `CRC16/CCITT-FALSE self-check failed (got ${actual}, expected 29B1) — refusing to build a PromptPay QR ` +
        "on a checksum implementation that cannot even reproduce the standard test vector.",
    );
  }
}

function formatEmvField(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

interface ParsedTlvField {
  tag: string;
  value: string;
}

function parseTlv(payload: string): ParsedTlvField[] {
  const fields: ParsedTlvField[] = [];
  let cursor = 0;
  while (cursor < payload.length) {
    const tag = payload.slice(cursor, cursor + 2);
    const lengthStr = payload.slice(cursor + 2, cursor + 4);
    const length = Number.parseInt(lengthStr, 10);
    if (tag.length !== 2 || lengthStr.length !== 2 || !Number.isInteger(length)) {
      throw new Error("PromptPay QR self-verification failed: malformed TLV structure while re-parsing own output.");
    }
    const value = payload.slice(cursor + 4, cursor + 4 + length);
    fields.push({ tag, value });
    cursor += 4 + length;
  }
  return fields;
}

function assertPayloadSelfConsistent(payload: string, expectedProxy: { subTag: "01" | "02"; value: string }, expectedAmountStr: string): void {
  const crcField = payload.slice(-4);
  const bodyBeforeCrc = payload.slice(0, -4);
  if (!bodyBeforeCrc.endsWith("6304")) {
    throw new Error("PromptPay QR self-verification failed: payload does not end with a well-formed CRC field.");
  }
  const recomputedCrc = crc16CcittFalseHex(bodyBeforeCrc);
  if (recomputedCrc !== crcField) {
    throw new Error("PromptPay QR self-verification failed: CRC does not match the payload it was computed over.");
  }

  const fields = parseTlv(payload);
  const byTag = new Map(fields.map((field) => [field.tag, field.value]));

  if (byTag.get("00") !== "01") throw new Error("PromptPay QR self-verification failed: tag 00 (Payload Format Indicator) mismatch.");
  if (byTag.get("01") !== "12") throw new Error("PromptPay QR self-verification failed: tag 01 (Point of Initiation Method) mismatch.");
  if (byTag.get("53") !== "764") throw new Error("PromptPay QR self-verification failed: tag 53 (Currency) mismatch.");
  if (byTag.get("58") !== "TH") throw new Error("PromptPay QR self-verification failed: tag 58 (Country Code) mismatch.");
  if (byTag.get("54") !== expectedAmountStr) throw new Error("PromptPay QR self-verification failed: tag 54 (Amount) mismatch.");

  const merchantAccountInfo = byTag.get("29");
  if (!merchantAccountInfo) throw new Error("PromptPay QR self-verification failed: tag 29 (Merchant Account Info) missing.");
  const subFields = parseTlv(merchantAccountInfo);
  const subByTag = new Map(subFields.map((field) => [field.tag, field.value]));
  if (subByTag.get("00") !== PROMPTPAY_AID) throw new Error("PromptPay QR self-verification failed: tag 29 sub-tag 00 (AID) mismatch.");
  if (subByTag.get(expectedProxy.subTag) !== expectedProxy.value) {
    throw new Error(`PromptPay QR self-verification failed: tag 29 sub-tag ${expectedProxy.subTag} (PromptPay ID) mismatch.`);
  }
  const otherProxyTags = ["01", "02", "03"].filter((tag) => tag !== expectedProxy.subTag && subByTag.has(tag));
  if (otherProxyTags.length > 0) {
    throw new Error("PromptPay QR self-verification failed: more than one PromptPay ID sub-tag was present.");
  }
}

export function buildPromptPayEmvPayload(params: { promptPayId: string; amount: Money }): string {
  assertCrc16ImplementationCorrect();

  const promptPayId = sanitizePromptPayId(params.promptPayId);
  if (!promptPayId) {
    throw new PaymentConfigurationError("Cannot build a PromptPay QR: the PromptPay ID is not a 10-digit mobile number or a valid 13-digit ID.");
  }

  if (params.amount.currency !== "THB") {
    throw new PaymentConfigurationError(
      `Cannot build a PromptPay QR for a non-THB amount (got currency "${params.amount.currency}") — PromptPay is THB-only.`,
    );
  }
  if (!Number.isFinite(params.amount.amountMinorUnits) || params.amount.amountMinorUnits <= 0) {
    throw new PaymentConfigurationError("Cannot build a PromptPay QR for a non-positive or non-finite amount.");
  }
  const baht = minorUnitsToBaht(params.amount);
  if (baht >= 10_000_000) {
    throw new PaymentConfigurationError("Cannot build a PromptPay QR for an implausibly large amount — refusing as a safety guard.");
  }
  const amountStr = baht.toFixed(2);

  const proxy = proxyFieldFor(promptPayId);

  const merchantAccountInfo = formatEmvField("00", PROMPTPAY_AID) + formatEmvField(proxy.subTag, proxy.value);

  const bodyBeforeCrc =
    formatEmvField("00", "01") +
    formatEmvField("01", "12") +
    formatEmvField("29", merchantAccountInfo) +
    formatEmvField("53", "764") +
    formatEmvField("54", amountStr) +
    formatEmvField("58", "TH") +
    "6304";

  const crc = crc16CcittFalseHex(bodyBeforeCrc);
  const payload = `${bodyBeforeCrc}${crc}`;

  assertPayloadSelfConsistent(payload, proxy, amountStr);

  return payload;
}
