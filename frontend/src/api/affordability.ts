import { apiPost } from "./client";

export type AffordabilityResult = {
  purchase_amount: string;
  current_available: string;
  upcoming_required: string;
  savings_remaining: string;
  projected_remaining: string;
  can_afford: boolean;
  message: string;
};

export function checkAffordability(purchaseAmount: string) {
  return apiPost<AffordabilityResult>("/affordability/check", {
    purchase_amount: purchaseAmount,
  });
}

