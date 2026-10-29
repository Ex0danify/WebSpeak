/** The code of a request the gateway never answered. */
export const GATEWAY_UNREACHABLE = "GATEWAY_UNREACHABLE";

export interface ApiError extends Error {
  code?: string;
}

function unreachable(): ApiError {
  const error = new Error(GATEWAY_UNREACHABLE) as ApiError;
  error.code = GATEWAY_UNREACHABLE;
  return error;
}

export interface AdminApiOptions {
  /** Read at call time: the token changes on login/logout. */
  getCsrfToken: () => string;
  /** Called when a response is 401, before the error is thrown. */
  onUnauthorized: () => void;
}

/** JSON fetch helpers for `/api/admin/*`. A non-2xx response throws an `ApiError` whose `code` is
 *  the server's `code` field (or `REQUEST_FAILED`). */
export function createAdminApi(options: AdminApiOptions) {
  /** A proxy answers for a gateway that is down, with a status of its own and no code. */
  const GATEWAY_DOWN_STATUSES = new Set([502, 503, 504]);

  async function request(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch {
      throw unreachable();
    }
  }

  async function parseResponse(response: Response) {
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (!value.code && GATEWAY_DOWN_STATUSES.has(response.status)) throw unreachable();
      const error = new Error(String(value.code || response.statusText)) as ApiError;
      error.code = String(value.code || "REQUEST_FAILED");
      if (response.status === 401) options.onUnauthorized();
      throw error;
    }
    return value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin JSON bodies are read field by field, the gateway owns their shape
  async function getJson(url: string): Promise<any> {
    const response = await request(url, { headers: { accept: "application/json" } });
    return parseResponse(response);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin JSON bodies are read field by field, the gateway owns their shape
  async function sendJson(url: string, method: string, body: unknown, authenticated = true): Promise<any> {
    const csrfToken = options.getCsrfToken();
    const response = await request(url, {
      method,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(authenticated && csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
    });
    return parseResponse(response);
  }

  return { getJson, sendJson };
}
