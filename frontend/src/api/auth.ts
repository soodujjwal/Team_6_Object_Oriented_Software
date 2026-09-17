import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export type User = {
  id: number;
  name: string;
  email: string;
  phone_number: string;
  occupation: string;
};

export type AuthSession = {
  access_token: string;
  token_type: "bearer";
  user: User;
};

export function login(email: string, password: string) {
  return apiPost<AuthSession>("/auth/login", { email, password });
}

export function register(name: string, email: string, phone_number: string, password: string) {
  return apiPost<AuthSession>("/auth/register", { name, email, phone_number, password });
}

export function getCurrentUser() {
  return apiGet<User>("/auth/me");
}

export function updateProfile(payload: { name: string; email: string; occupation: string }) {
  return apiPatch<AuthSession>("/auth/me", payload);
}

export function changePassword(payload: { current_password: string; new_password: string }) {
  return apiPatch<User>("/auth/me/password", payload);
}

export function deleteCurrentUser() {
  return apiDelete("/auth/me");
}
