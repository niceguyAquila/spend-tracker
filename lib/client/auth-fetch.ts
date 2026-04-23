export function handleUnauthorizedResponse(response: Response): boolean {
  if (response.status !== 401 && response.status !== 403) {
    return false;
  }

  const loginUrl = new URL("/login", window.location.origin);
  const currentPath = `${window.location.pathname}${window.location.search}`;
  loginUrl.searchParams.set("next", currentPath);
  loginUrl.searchParams.set("error", "session-expired");
  window.location.href = loginUrl.toString();
  return true;
}
