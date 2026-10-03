import { apiFetch, TOKEN_STORAGE_KEY } from "./client";

export interface LoginResponse {
  message: string;
  token: string;
  user: {
    userId: string;
    email: string;
    tenantId: string;
    role: string;
  };
}

function getStorage(): Storage {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error(
      "localStorage is unavailable in this environment",
    );
  }
  return window.localStorage;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const storage = getStorage();
  storage.setItem(TOKEN_STORAGE_KEY, response.token);

  return response;
}

export function logout(): void {
  const storage = getStorage();
  storage.removeItem(TOKEN_STORAGE_KEY);
}

export function getCurrentToken(): string | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}
