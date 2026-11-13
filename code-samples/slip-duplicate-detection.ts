// Excerpt from the private EventXplore codebase (src/lib/...). Shown as-is for review; imports resolve inside the full repo.

import {
  findSlipByQrPayloadHash,
  findSlipBySha256Hash,
  findSlipByTransactionReference,
} from "@/lib/slip-analysis/slip-analysis-repository";

export interface DuplicateDetectionInput {
  sha256Hash: string;
  transactionReference?: string;
  qrPayloadHash: string | null;
  excludeSlipId: string;
}

export interface DuplicateDetectionResult {
  duplicateFileSlipId: string | null;
  duplicateTransactionReferenceSlipId: string | null;
  duplicateQrPayloadSlipId: string | null;
}

export function detectDuplicates(input: DuplicateDetectionInput): DuplicateDetectionResult {
  const fileMatch = findSlipBySha256Hash(input.sha256Hash, input.excludeSlipId);
  const referenceMatch = input.transactionReference
    ? findSlipByTransactionReference(input.transactionReference, input.excludeSlipId)
    : null;
  const qrMatch = input.qrPayloadHash
    ? findSlipByQrPayloadHash(input.qrPayloadHash, input.excludeSlipId)
    : null;

  return {
    duplicateFileSlipId: fileMatch?.id ?? null,
    duplicateTransactionReferenceSlipId: referenceMatch?.id ?? null,
    duplicateQrPayloadSlipId: qrMatch?.id ?? null,
  };
}

export function hasAnyDuplicate(result: DuplicateDetectionResult): boolean {
  return Boolean(
    result.duplicateFileSlipId || result.duplicateTransactionReferenceSlipId || result.duplicateQrPayloadSlipId,
  );
}
