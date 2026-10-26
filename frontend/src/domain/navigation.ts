export type AppRoute = "/" | "/login" | "/register" | "/app";

export function readRoute(pathname: string): AppRoute {
  return pathname === "/login" || pathname === "/register" || pathname === "/app" ? pathname : "/";
}

export function resolveRoute(route: AppRoute, authenticated: boolean): AppRoute {
  if (route === "/app" && !authenticated) return "/login";
  if ((route === "/login" || route === "/register") && authenticated) return "/app";
  return route;
}
