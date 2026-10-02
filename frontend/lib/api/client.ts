export const TOKEN_STORAGE_KEY = "stocksync_jwt";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
  }
}

function getBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. Configure it in your environment.",
    );
  }
  return base.replace(/\/+$/, "");
}

function getToken(): string | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  const token = getToken();

  const headers: Record<string, string> = {};

  // X-Tenant-Id is intentionally NOT set by the frontend.
  // The gateway derives tenant context from the verified JWT only.
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      for (const [key, value] of options.headers) {
        headers[key] = String(value);
      }
    } else {
      for (const [key, value] of Object.entries(options.headers)) {
        headers[key] = String(value);
      }
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await parseBody(response);
    throw new ApiError(
      response.status,
      body,
      `API request failed with status ${response.status}`,
    );
  }

  return (await parseBody(response)) as T;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
