export type AppRoute = "/" | "/login" | "/register" | "/app" | "/download";

export function readRoute(pathname: string): AppRoute {
  return pathname === "/login" || pathname === "/register" || pathname === "/app" || pathname === "/download" ? pathname : "/";
}

export function resolveRoute(route: AppRoute, authenticated: boolean, nativeApp = false): AppRoute {
  if (nativeApp && route === "/") return authenticated ? "/app" : "/login";
  if (route === "/app" && !authenticated) return "/login";
  if ((route === "/login" || route === "/register") && authenticated) return "/app";
  return route;
}
