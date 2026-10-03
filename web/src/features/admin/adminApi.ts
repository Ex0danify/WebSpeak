export interface ApiError extends Error { code?: string }

export interface AdminApiOptions {
  /** Read at call time: the token changes on login/logout. */
  getCsrfToken: () => string;
  /** Called when a response is 401, before the error is thrown. */
  onUnauthorized: () => void;
}

/** JSON fetch helpers for `/api/admin/*`. A non-2xx response throws an `ApiError` whose `code` is
 *  the server's `code` field (or `REQUEST_FAILED`). */
export function createAdminApi(options: AdminApiOptions) {
  async function parseResponse(response: Response) {
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(value.code || response.statusText)) as ApiError;
      error.code = String(value.code || "REQUEST_FAILED");
      if (response.status === 401) options.onUnauthorized();
      throw error;
    }
    return value;
  }

  async function getJson(url: string): Promise<any> {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    return parseResponse(response);
  }

  async function sendJson(url: string, method: string, body: unknown, authenticated = true): Promise<any> {
    const csrfToken = options.getCsrfToken();
    const response = await fetch(url, { method, headers: { "content-type": "application/json", accept: "application/json", ...(authenticated && csrfToken ? { "x-csrf-token": csrfToken } : {}) }, body: JSON.stringify(body) });
    return parseResponse(response);
  }

  return { getJson, sendJson };
}
