export const MAINTENANCE_PATH = "/przerwa-techniczna";

export const shouldBypassMaintenance = (pathname: string) =>
  pathname === MAINTENANCE_PATH ||
  pathname === "/admin" ||
  pathname.startsWith("/admin/") ||
  pathname.startsWith("/api/");

export const shouldRedirectToMaintenance = (
  pathname: string,
  maintenanceEnabled: boolean,
  isAdmin: boolean,
) => maintenanceEnabled && !isAdmin && !shouldBypassMaintenance(pathname);
