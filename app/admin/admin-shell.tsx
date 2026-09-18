import {
  CalendarRange,
  ExternalLink,
  LayoutDashboard,
  PackageSearch,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import LogoutButton from "./dashboard/logout-btn";

// Chrome shared by every admin screen: sidebar, header and mobile section bar.
// The dashboard keeps its three sections on one page (hash links), the catalog
// lives on its own route — both navigate through the same list.
export type AdminNavKey = "overview" | "orders" | "calendar" | "catalog";

const navItems: Array<{
  key: AdminNavKey;
  label: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    key: "overview",
    label: "Pulpit",
    href: "/admin/dashboard#overview",
    icon: LayoutDashboard,
  },
  {
    key: "orders",
    label: "Zamówienia",
    href: "/admin/dashboard#orders",
    icon: PackageSearch,
  },
  {
    key: "calendar",
    label: "Kalendarz",
    href: "/admin/dashboard#calendar",
    icon: CalendarRange,
  },
  { key: "catalog", label: "Dywany", href: "/admin/dywany", icon: Shapes },
];

const DEPLOY_MARKER = "qmail-wa-260918";

export default function AdminShell({
  userEmail,
  activeNav,
  title,
  subtitle,
  children,
}: {
  userEmail: string | null | undefined;
  activeNav: AdminNavKey;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="ruggy-thread-bg min-h-screen bg-[var(--ruggy-canvas)] text-[var(--ruggy-ink)]">
      <div className="min-h-screen lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="hidden border-r-2 border-[var(--ruggy-border)] bg-[var(--ruggy-surface)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <div className="border-b-2 border-[var(--ruggy-border)] px-6 py-7">
            <p className="ruggy-wordmark text-3xl text-[var(--ruggy-ink)]">
              ruggy<span className="text-[var(--ruggy-blue)]">.</span>
            </p>
            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--ruggy-blue)]">
              Studio dywanów
            </p>
          </div>

          <nav
            className="flex-1 space-y-2 px-3 py-5"
            aria-label="Panel administracyjny"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === activeNav;

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={true}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "flex h-11 items-center gap-3 rounded-2xl bg-[var(--ruggy-yellow)] px-3 text-sm font-black text-[var(--ruggy-ink)] shadow-[3px_3px_0_var(--ruggy-ink)]"
                      : "flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-[var(--ruggy-body)] transition-colors hover:bg-[var(--ruggy-blue-soft)] hover:text-[var(--ruggy-ink)]"
                  }
                >
                  <Icon size={17} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t-2 border-[var(--ruggy-border)] p-4">
            <Link
              href="/"
              className="flex items-center justify-between rounded-xl px-2 py-2 text-sm font-semibold text-[var(--ruggy-body)] hover:bg-[var(--ruggy-blue-soft)] hover:text-[var(--ruggy-ink)]"
            >
              Przejdź do witryny
              <ExternalLink size={15} aria-hidden="true" />
            </Link>
            <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-[var(--ruggy-border)] bg-[var(--ruggy-blue-soft)] p-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ruggy-blue)] text-xs font-black text-white">
                {userEmail?.slice(0, 1).toUpperCase() || "A"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-[var(--ruggy-ink)]">
                  Administrator
                </p>
                <p className="truncate text-[11px] text-[var(--ruggy-muted)]">
                  {userEmail}
                </p>
              </div>
              <LogoutButton compact />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b-2 border-[var(--ruggy-border)] bg-[var(--ruggy-canvas)]/95 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                <div className="lg:hidden">
                  <p className="ruggy-wordmark text-2xl text-[var(--ruggy-ink)]">
                    ruggy<span className="text-[var(--ruggy-blue)]">.</span>
                  </p>
                </div>
                <div className="hidden lg:block">
                  <p className="text-sm font-black text-[var(--ruggy-ink)]">
                    {title}
                  </p>
                  <p className="text-xs text-[var(--ruggy-muted)]">{subtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="max-w-[150px] truncate rounded-full border border-[var(--ruggy-border)] bg-[var(--ruggy-surface)] px-2.5 py-1 text-[10px] font-black tracking-[0.04em] text-[var(--ruggy-muted)] sm:max-w-none sm:text-xs"
                  title={`Wersja wdrożenia: ${DEPLOY_MARKER}`}
                >
                  deploy {DEPLOY_MARKER}
                </span>
                <span className="hidden items-center gap-2 text-xs font-semibold text-[var(--ruggy-body)] sm:flex">
                  <span className="size-2 rounded-full bg-[var(--ruggy-success)]" />
                  System aktywny
                </span>
                <div className="lg:hidden">
                  <LogoutButton />
                </div>
              </div>
            </div>

            <nav
              className="flex gap-1 overflow-x-auto border-t-2 border-[var(--ruggy-border)] px-3 py-2 lg:hidden"
              aria-label="Sekcje panelu"
            >
              {navItems.map((item) => {
                const isActive = item.key === activeNav;

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    prefetch={true}
                    aria-current={isActive ? "page" : undefined}
                    className={
                      isActive
                        ? "whitespace-nowrap rounded-full bg-[var(--ruggy-yellow)] px-3 py-1.5 text-xs font-black text-[var(--ruggy-ink)]"
                        : "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--ruggy-body)]"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <main className="w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
