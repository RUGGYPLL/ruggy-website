import type { Metadata } from "next";
import { AtSign, Clock3, Wrench } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Przerwa techniczna",
  description: "Ruggy wróci za chwilę. Trwa krótka przerwa techniczna.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export const dynamic = "force-dynamic";

export default function MaintenancePage() {
  return (
    <main className="ruggy-thread-bg flex min-h-screen items-center justify-center bg-[var(--ruggy-canvas)] px-5 py-12 text-[var(--ruggy-ink)]">
      <section className="w-full max-w-xl rounded-[2rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-surface)] p-7 shadow-[8px_10px_0_var(--ruggy-ink)] sm:p-10">
        <p className="ruggy-wordmark text-4xl">
          ruggy<span className="text-[var(--ruggy-blue)]">.</span>
        </p>

        <div className="mt-10 flex size-16 items-center justify-center rounded-2xl border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-yellow)] shadow-[4px_5px_0_var(--ruggy-ink)]">
          <Wrench size={28} aria-hidden="true" />
        </div>

        <p className="mt-8 text-xs font-black uppercase tracking-[0.16em] text-[var(--ruggy-blue)]">
          Chwila przerwy
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
          Pracownia jest chwilowo zamknięta online.
        </h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-[var(--ruggy-body)] sm:text-lg">
          Właśnie przygotowujemy coś na stronie. Wróć za chwilę, a jeśli chcesz
          się odezwać, napisz do nas na Instagramie.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="https://www.instagram.com/ruggy.pl/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--ruggy-blue)] px-6 text-sm font-black text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-ink)]"
          >
            <AtSign size={18} aria-hidden="true" />
            Napisz na Instagramie
          </a>
          <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-[var(--ruggy-border-strong)] px-6 text-sm font-black text-[var(--ruggy-body)]">
            <Clock3 size={18} aria-hidden="true" />
            Wrócimy niedługo
          </span>
        </div>

        <p className="mt-8 text-xs leading-5 text-[var(--ruggy-muted)]">
          Zamówienia i panel pracowni są chwilowo niedostępne dla odwiedzających.
        </p>
        <Link
          href="/admin/login"
          className="sr-only focus:not-sr-only focus:mt-4 focus:inline-flex focus:rounded-full focus:border-2 focus:border-[var(--ruggy-ink)] focus:px-4 focus:py-2 focus:text-xs focus:font-black"
        >
          Logowanie administratora
        </Link>
      </section>
    </main>
  );
}
