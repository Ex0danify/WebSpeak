/** True when the request's `Origin` header names the same host as its `Host` header. */
export function isSameOrigin(request: { header(name: string): string | undefined }): boolean {
  const origin = request.header("origin");
  const host = request.header("host");
  try {
    return Boolean(origin && host && new URL(origin).host === host);
  } catch {
    return false;
  }
}
