// Excerpt from the private EventXplore codebase (src/lib/...). Shown as-is for review; imports resolve inside the full repo.

export interface ThaiTaxIdValidationResult {
  normalized: string;
  formatValid: boolean;
  checksumValid: boolean;
  isValid: boolean;
  message: string | null;
}

const THAI_TAX_ID_LENGTH = 13;

export function normalizeThaiTaxId(raw: string): string {
  const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";
  const arabicIndicDigits = "٠١٢٣٤٥٦٧٨٩";

  let normalized = "";
  for (const char of raw) {
    const thaiIndex = thaiDigits.indexOf(char);
    if (thaiIndex !== -1) {
      normalized += String(thaiIndex);
      continue;
    }
    const arabicIndicIndex = arabicIndicDigits.indexOf(char);
    if (arabicIndicIndex !== -1) {
      normalized += String(arabicIndicIndex);
      continue;
    }
    if (char >= "0" && char <= "9") {
      normalized += char;
    }
  }
  return normalized;
}

export function computeThaiTaxIdCheckDigit(first12Digits: string): number | null {
  if (first12Digits.length !== 12 || !/^\d{12}$/.test(first12Digits)) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(first12Digits[i]) * (13 - i);
  }
  return (11 - (sum % 11)) % 10;
}

export function isThaiTaxIdFormatValid(normalized: string): boolean {
  return normalized.length === THAI_TAX_ID_LENGTH && /^\d{13}$/.test(normalized);
}

export function validateThaiTaxId(raw: string): ThaiTaxIdValidationResult {
  const normalized = normalizeThaiTaxId(raw);
  const formatValid = isThaiTaxIdFormatValid(normalized);

  if (!formatValid) {
    return {
      normalized,
      formatValid: false,
      checksumValid: false,
      isValid: false,
      message: `เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก (พบ ${normalized.length} หลัก)`,
    };
  }

  const expectedCheckDigit = computeThaiTaxIdCheckDigit(normalized.slice(0, 12));
  const actualCheckDigit = Number(normalized[12]);
  const checksumValid = expectedCheckDigit !== null && expectedCheckDigit === actualCheckDigit;

  return {
    normalized,
    formatValid: true,
    checksumValid,
    isValid: checksumValid,
    message: checksumValid ? null : "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (checksum ไม่ตรง) กรุณาตรวจสอบอีกครั้ง",
  };
}

export function maskThaiTaxId(normalizedOrRaw: string): string {
  const digits = normalizeThaiTaxId(normalizedOrRaw) || normalizedOrRaw;
  const visibleDigits = 4;
  if (digits.length <= visibleDigits) {
    return "*".repeat(digits.length);
  }
  return "*".repeat(digits.length - visibleDigits) + digits.slice(-visibleDigits);
}
