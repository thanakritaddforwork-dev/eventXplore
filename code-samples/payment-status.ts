// Excerpt from the private EventXplore codebase (src/lib/...). Shown as-is for review; imports resolve inside the full repo.

import { PaymentConflictError } from "@/lib/payments/errors";
import type { PaymentStatus } from "@/lib/payments/types";

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ["paid", "failed", "expired", "cancelled"],
  paid: [],
  failed: [],
  expired: [],
  cancelled: [],
  refunded: [],
  unknown: ["pending", "paid", "failed", "expired", "cancelled"],
};

export function canTransitionPaymentStatus(current: PaymentStatus, next: PaymentStatus): boolean {
  if (current === next) {
    return true;
  }

  return ALLOWED_TRANSITIONS[current].includes(next);
}

export function assertValidPaymentStatusTransition(current: PaymentStatus, next: PaymentStatus): void {
  if (!canTransitionPaymentStatus(current, next)) {
    throw new PaymentConflictError(
      `Illegal payment status transition: ${current} -> ${next}`,
    );
  }
}

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
