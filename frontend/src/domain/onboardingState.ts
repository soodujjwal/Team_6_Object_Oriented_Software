import type { User } from "../api/auth";
import { accountStorage } from "../api/accountStorage";

export function hasCompletedOnboarding(user: User) {
  return accountStorage.getItem(`pfm_onboarding_complete_${user.email}`) === "true";
}

export function markOnboardingComplete(user: User) {
  accountStorage.setItem(`pfm_onboarding_complete_${user.email}`, "true");
}
