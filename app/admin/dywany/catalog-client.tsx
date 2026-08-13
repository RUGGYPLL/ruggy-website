"use client";

import { getCategory } from "@/lib/gallery";
import { RUG_LEAD_TIME_LABEL } from "@/lib/rug-lead-time";
import {
  usesDirectCheckout,
  type RugOrderMode,
} from "@/lib/rug-order-mode";
import { MAX_RUG_PHOTO_SIZE, type RugPhoto } from "@/lib/rug-photos";
import {
  collectCatalogFieldErrors,
  rugSizeSchema,
  rugTypeSchema,
  rugVariantSchema,
  slugifyRugName,
  type RugSizeInput,
  type RugTypeInput,
  type RugVariantInput,
} from "@/schema/rug-catalog";
import {
  Boxes,
  AtSign,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  ImagePlus,
  Info,
  Layers,
  LoaderCircle,
  Lock,
  LockOpen,
  Plus,
  Ruler,
  Shapes,
  Star,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  createRugSize,
  createRugType,
  createRugVariant,
  deleteRugPhoto,
  deleteRugSize,
  deleteRugType,
  deleteRugVariant,
  setRugPhotoCover,
  updateRugSize,
  updateRugType,
  updateRugVariant,
  uploadRugPhoto,
  type CatalogActionResult,
} from "./actions";

export type CatalogSize = {
  id: number;
  label: string;
  widthCm: number;
  priceCents: number;
  isActive: boolean;
  displayOrder: number;
};

export type CatalogVariant = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  photos: RugPhoto[];
  sizes: CatalogSize[];
};

export type CatalogRugType = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  leadTimeDays: number | null;
  isActive: boolean;
  orderMode: RugOrderMode;
  hasDelay: boolean;
  displayOrder: number;
  photos: RugPhoto[];
  sizes: CatalogSize[];
  variants: CatalogVariant[];
};

/** A photo chosen for a category that does not exist yet, held until it does. */
type PendingPhoto = { id: string; file: File; previewUrl: string };

type SizeOwner = { rugTypeId: number | null; rugVariantId: number | null };

type RunAction = (
  action: () => Promise<CatalogActionResult>,
  onSuccess?: () => void,
  options?: { onFailure?: () => void; refreshOnFailure?: boolean },
) => void;

type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
};

/* -------------------------------------------------------------- utilities */

const priceFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
});

const formatPrice = (priceCents: number) => priceFormatter.format(priceCents / 100);

const centsToInput = (priceCents: number) => (priceCents / 100).toFixed(2);

const inputToCents = (value: string) => {
  const amount = Number(value.replace(",", "."));
  return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
};

const toInteger = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? Number.NaN : Number(trimmed);
};

// Where a category's sizes actually come from in the order flow. The size
// tables below use it so the owner never edits a table nobody will ever see.
type SizeSource = "variants" | "type" | "custom";

const getSizeSource = (
  orderMode: RugOrderMode,
  variantCount: number,
): SizeSource => {
  if (!usesDirectCheckout(orderMode)) return "custom";
  if (variantCount > 0) return "variants";
  return "type";
};

const activePrices = (sizes: CatalogSize[]) =>
  sizes.filter((size) => size.isActive).map((size) => size.priceCents);

const formatPriceRange = (prices: number[]) => {
  if (!prices.length) return "Brak cen";

  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);

  return lowest === highest
    ? formatPrice(lowest)
    : `${formatPrice(lowest)} – ${formatPrice(highest)}`;
};

// One template for the size header, every size row and the "add size" form.
// Every track is fixed except the label: an `auto` track would resolve to a
// different width in the header (empty) than in a row (two buttons), which
// silently slides the column labels one field to the side.
const SIZE_GRID_CLASS =
  "lg:grid-cols-[minmax(0,1.4fr)_100px_130px_92px_150px_156px]";

const inputClass =
  "h-11 w-full rounded-xl border-2 bg-[var(--ruggy-canvas)] px-3 text-sm font-bold text-[var(--ruggy-ink)] outline-none transition-colors placeholder:font-semibold placeholder:text-[var(--ruggy-muted)] focus:ring-2 focus:ring-[var(--ruggy-blue)]/15 disabled:cursor-not-allowed disabled:opacity-60";

const fieldClass = (invalid?: boolean) =>
  `${inputClass} ${
    invalid
      ? "border-[var(--ruggy-error)] focus:border-[var(--ruggy-error)]"
      : "border-[var(--ruggy-border)] focus:border-[var(--ruggy-blue)]"
  }`;

const primaryButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--ruggy-blue)] px-5 text-sm font-black text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-ink)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

const secondaryButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-[var(--ruggy-border)] bg-[var(--ruggy-surface)] px-4 text-sm font-black text-[var(--ruggy-body)] transition-colors hover:border-[var(--ruggy-ink)] hover:bg-[var(--ruggy-yellow)] hover:text-[var(--ruggy-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-blue)] disabled:cursor-not-allowed disabled:opacity-60";

const dangerButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-[var(--ruggy-error)] bg-[var(--ruggy-surface)] px-4 text-sm font-black text-[var(--ruggy-error)] transition-colors hover:bg-[#fff0eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-error)] disabled:cursor-not-allowed disabled:opacity-60";

/* ------------------------------------------------------------------- page */

export default function RugCatalogClient({
  catalog,
  usedTypeIds,
  usedVariantIds,
  usedSizeIds,
  photosEnabled,
}: {
  catalog: CatalogRugType[];
  usedTypeIds: number[];
  usedVariantIds: number[];
  usedSizeIds: number[];
  photosEnabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [openTypeId, setOpenTypeId] = useState<number | null>(null);
  const [isAddingType, setIsAddingType] = useState(false);
  const [newTypePhotos, setNewTypePhotos] = useState<PendingPhoto[]>([]);
  const [newTypeCoverId, setNewTypeCoverId] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null,
  );

  // Previews are object URLs; the browser holds each blob alive until the URL
  // is revoked, so none may leave this component unreleased. The ref exists
  // only for the unmount path, where the latest state is no longer in scope.
  const pendingPhotosRef = useRef<PendingPhoto[]>([]);

  useEffect(() => {
    pendingPhotosRef.current = newTypePhotos;
  }, [newTypePhotos]);

  useEffect(
    () => () => {
      for (const photo of pendingPhotosRef.current) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    },
    [],
  );

  const releasePendingPhotos = (photos: PendingPhoto[]) => {
    for (const photo of photos) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    setNewTypePhotos([]);
    setNewTypeCoverId(null);
  };

  const usedTypes = useMemo(() => new Set(usedTypeIds), [usedTypeIds]);
  const usedVariants = useMemo(() => new Set(usedVariantIds), [usedVariantIds]);
  const usedSizes = useMemo(() => new Set(usedSizeIds), [usedSizeIds]);

  // Success messages are transient confirmations; errors stay until the next
  // action so the owner can actually read what went wrong.
  useEffect(() => {
    if (feedback?.tone !== "success") return;

    const timeout = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const run: RunAction = (action, onSuccess, options) => {
    setFeedback(null);

    startTransition(async () => {
      const result = await action();

      if (!result.success) {
        setFeedback({
          tone: "error",
          message: result.message ?? "Nie udało się zapisać zmian.",
        });
        options?.onFailure?.();
        if (options?.refreshOnFailure) router.refresh();
        return;
      }

      setFeedback({ tone: "success", message: result.message ?? "Zapisano." });
      onSuccess?.();
      router.refresh();
    });
  };

  // Photos can only be attached once the category has an id, so creating one
  // is a two-step transaction: insert the row, then push the buffered files at
  // it. The cover goes first, so no other photo is ever briefly the cover.
  const handleCreateType = (values: RugTypeInput) => {
    setFeedback(null);

    startTransition(async () => {
      const result = await createRugType(values);

      if (!result.success || !result.rugTypeId) {
        setFeedback({
          tone: "error",
          message: result.message ?? "Nie udało się dodać kategorii.",
        });
        return;
      }

      const queue = newTypePhotos.toSorted(
        (first, second) =>
          Number(second.id === newTypeCoverId) -
          Number(first.id === newTypeCoverId),
      );
      let uploaded = 0;
      let uploadError: string | undefined;

      // Sequential on purpose: each upload reads the category's current photos
      // to work out the next display_order and whether a cover already exists.
      for (const photo of queue) {
        const upload = await uploadRugPhoto(
          { rugTypeId: result.rugTypeId, rugVariantId: null },
          photo.file,
          photo.id === newTypeCoverId,
        );

        if (upload.success) {
          uploaded += 1;
        } else {
          uploadError = upload.message;
          break;
        }
      }

      releasePendingPhotos(newTypePhotos);
      setIsAddingType(false);

      setFeedback(
        uploadError
          ? {
              tone: "error",
              message: `Kategoria „${values.name}” została dodana, ale zdjęcia nie w całości: ${uploadError}`,
            }
          : {
              tone: "success",
              message: uploaded
                ? `Kategoria „${values.name}” została dodana wraz z ${uploaded} zdjęciami.`
                : (result.message ?? "Kategoria została dodana."),
            },
      );
      router.refresh();
    });
  };

  const stats = useMemo(() => {
    const variants = catalog.flatMap((type) => type.variants);
    const sizes = [
      ...catalog.flatMap((type) => type.sizes),
      ...variants.flatMap((variant) => variant.sizes),
    ];

    return {
      types: `${catalog.filter((type) => type.isActive).length} / ${catalog.length}`,
      variants: `${variants.filter((variant) => variant.isActive).length} / ${variants.length}`,
      sizes: `${sizes.filter((size) => size.isActive).length} / ${sizes.length}`,
      priceRange: formatPriceRange(activePrices(sizes)),
    };
  }, [catalog]);

  const nextTypeOrder = catalog.length
    ? Math.max(...catalog.map((type) => type.displayOrder)) + 1
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ruggy-blue)]">
            Katalog
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--ruggy-ink)] sm:text-4xl">
            Dywany i ceny
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ruggy-body)]">
            Dodawaj kategorie, podrodzaje i rozmiary, zmieniaj ceny i ukrywaj
            to, czego chwilowo nie robisz. Zmiany trafiają wprost na stronę
            zamówienia.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsAddingType(true);
            setOpenTypeId(null);
          }}
          className={primaryButtonClass}
        >
          <Plus size={17} aria-hidden="true" />
          Dodaj kategorię
        </button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Kategorie (aktywne / wszystkie)" value={stats.types} icon={Shapes} />
        <StatCard
          label="Podrodzaje (aktywne / wszystkie)"
          value={stats.variants}
          icon={Layers}
          tone="rose"
        />
        <StatCard
          label="Rozmiary (aktywne / wszystkie)"
          value={stats.sizes}
          icon={Ruler}
          tone="green"
        />
        <StatCard
          label="Widełki cenowe"
          value={stats.priceRange}
          icon={CircleDollarSign}
          tone="yellow"
        />
      </div>

      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className={`flex items-start gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-bold ${
            feedback.tone === "error"
              ? "border-[var(--ruggy-error)] bg-[#fff0eb] text-[var(--ruggy-error)]"
              : "border-[var(--ruggy-border-strong)] bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-ink)]"
          }`}
        >
          {feedback.tone === "error" ? (
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          {feedback.message}
        </p>
      ) : null}

      {isAddingType ? (
        <section className="rounded-[2rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-surface)] p-5 shadow-[5px_5px_0_var(--ruggy-yellow)] sm:p-6">
          <h2 className="text-lg font-black text-[var(--ruggy-ink)]">
            Nowa kategoria dywanów
          </h2>
          <p className="mt-1 text-xs text-[var(--ruggy-muted)]">
            Pojawi się na stronie /zamow, gdy zaznaczysz ją jako aktywną.
          </p>
          <TypeForm
            initial={null}
            defaultDisplayOrder={nextTypeOrder}
            pending={isPending}
            submitLabel="Dodaj kategorię"
            onCancel={() => {
              releasePendingPhotos(newTypePhotos);
              setIsAddingType(false);
            }}
            onSubmit={handleCreateType}
            extraFields={
              photosEnabled ? (
                <PendingPhotoPicker
                  photos={newTypePhotos}
                  coverId={newTypeCoverId}
                  disabled={isPending}
                  onAdd={(added) => {
                    setNewTypePhotos((current) => [...current, ...added]);
                    setNewTypeCoverId(
                      (current) => current ?? added[0]?.id ?? null,
                    );
                  }}
                  onRemove={(photoId) => {
                    setNewTypePhotos((current) => {
                      const removed = current.find(
                        (photo) => photo.id === photoId,
                      );
                      if (removed) URL.revokeObjectURL(removed.previewUrl);
                      const next = current.filter(
                        (photo) => photo.id !== photoId,
                      );
                      setNewTypeCoverId((cover) =>
                        cover === photoId ? (next[0]?.id ?? null) : cover,
                      );
                      return next;
                    });
                  }}
                  onSetCover={setNewTypeCoverId}
                  onError={(message) => setFeedback({ tone: "error", message })}
                />
              ) : null
            }
          />
        </section>
      ) : null}

      {catalog.length ? (
        <ul className="flex flex-col gap-4">
          {catalog.map((type) => (
            <li key={type.id}>
              <TypeCard
                type={type}
                isOpen={openTypeId === type.id}
                onToggle={() =>
                  setOpenTypeId((current) => (current === type.id ? null : type.id))
                }
                hasBookings={usedTypes.has(type.id)}
                usedVariants={usedVariants}
                usedSizes={usedSizes}
                photosEnabled={photosEnabled}
                pending={isPending}
                run={run}
                askConfirm={setConfirmRequest}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] px-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-blue)]">
            <Shapes size={19} aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-black text-[var(--ruggy-ink)]">
            Katalog jest pusty
          </p>
          <p className="mt-1 max-w-sm text-sm text-[var(--ruggy-muted)]">
            Dodaj pierwszą kategorię dywanów, żeby klienci mieli co zamawiać.
          </p>
        </div>
      )}

      {confirmRequest ? (
        <ConfirmDialog
          request={confirmRequest}
          pending={isPending}
          onClose={() => setConfirmRequest(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- type card */

function TypeCard({
  type,
  isOpen,
  onToggle,
  hasBookings,
  usedVariants,
  usedSizes,
  photosEnabled,
  pending,
  run,
  askConfirm,
}: {
  type: CatalogRugType;
  isOpen: boolean;
  onToggle: () => void;
  hasBookings: boolean;
  usedVariants: Set<number>;
  usedSizes: Set<number>;
  photosEnabled: boolean;
  pending: boolean;
  run: RunAction;
  askConfirm: (request: ConfirmRequest) => void;
}) {
  const [isAddingVariant, setIsAddingVariant] = useState(false);
  const [newVariantPhotos, setNewVariantPhotos] = useState<PendingPhoto[]>([]);
  const [newVariantCoverId, setNewVariantCoverId] = useState<string | null>(null);
  const pendingVariantPhotosRef = useRef<PendingPhoto[]>([]);
  const sizeSource = getSizeSource(type.orderMode, type.variants.length);
  const allSizes = [...type.sizes, ...type.variants.flatMap((v) => v.sizes)];
  const gallery = getCategory(type.slug);

  const nextVariantOrder = type.variants.length
    ? Math.max(...type.variants.map((variant) => variant.displayOrder)) + 1
    : 1;

  useEffect(() => {
    pendingVariantPhotosRef.current = newVariantPhotos;
  }, [newVariantPhotos]);

  useEffect(
    () => () => {
      for (const photo of pendingVariantPhotosRef.current) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    },
    [],
  );

  const releasePendingVariantPhotos = (photos: PendingPhoto[]) => {
    for (const photo of photos) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    setNewVariantPhotos([]);
    setNewVariantCoverId(null);
  };

  const handleCreateVariant = (values: RugVariantInput) => {
    const queue = newVariantPhotos.toSorted(
      (first, second) =>
        Number(second.id === newVariantCoverId) -
        Number(first.id === newVariantCoverId),
    );

    run(
      async () => {
        const result = await createRugVariant(type.id, values);

        if (!result.success || !result.rugVariantId) return result;

        let uploaded = 0;
        let uploadError: string | undefined;

        for (const photo of queue) {
          const upload = await uploadRugPhoto(
            { rugTypeId: null, rugVariantId: result.rugVariantId },
            photo.file,
            photo.id === newVariantCoverId,
          );

          if (!upload.success) {
            uploadError = upload.message;
            break;
          }

          uploaded += 1;
        }

        releasePendingVariantPhotos(newVariantPhotos);

        if (uploadError) {
          return {
            success: false,
            message: `Podrodzaj „${values.name}” został dodany, ale zdjęcia nie w całości: ${uploadError}`,
          };
        }

        return {
          success: true,
          message: uploaded
            ? `Podrodzaj „${values.name}” został dodany wraz z ${uploaded} zdjęciami.`
            : (result.message ?? "Podrodzaj został dodany."),
        };
      },
      () => setIsAddingVariant(false),
      {
        onFailure: () => {
          releasePendingVariantPhotos(newVariantPhotos);
          setIsAddingVariant(false);
        },
        refreshOnFailure: true,
      },
    );
  };

  const requestDelete = () => {
    askConfirm({
      title: `Usunąć kategorię „${type.name}”?`,
      description:
        "Usunę też wszystkie jej podrodzaje i rozmiary. Tej operacji nie da się cofnąć — jeśli chcesz tylko schować kategorię przed klientami, zamiast usuwać ustaw ją jako nieaktywną.",
      confirmLabel: "Usuń kategorię",
      onConfirm: () => run(() => deleteRugType(type.id)),
    });
  };

  return (
    <section
      className={`overflow-hidden rounded-[2rem] border-2 bg-[var(--ruggy-surface)] shadow-[5px_5px_0_var(--ruggy-border)] ${
        type.isActive
          ? "border-[var(--ruggy-border-strong)]"
          : "border-dashed border-[var(--ruggy-border)]"
      }`}
    >
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-[#fff8d9] focus-visible:bg-[#fff8d9] focus-visible:outline-none sm:px-6"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-[var(--ruggy-border)] bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-blue)]">
            {type.variants.length ? (
              <Layers size={19} aria-hidden="true" />
            ) : (
              <Boxes size={19} aria-hidden="true" />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base font-black text-[var(--ruggy-ink)]">
                {type.name || "Bez nazwy"}
              </span>
              <Badge tone={type.isActive ? "green" : "muted"}>
                {type.isActive ? "Widoczna" : "Ukryta"}
              </Badge>
              <Badge tone={usesDirectCheckout(type.orderMode) ? "blue" : "yellow"}>
                {usesDirectCheckout(type.orderMode)
                  ? "Płatność online"
                  : "Wycena na Instagramie"}
              </Badge>
              {type.hasDelay ? <Badge tone="yellow">Opóźnienie</Badge> : null}
              {gallery ? <Badge tone="muted">Galeria realizacji</Badge> : null}
            </span>
            <span className="mt-1 block truncate text-xs font-semibold text-[var(--ruggy-muted)]">
              /{type.slug} · {type.variants.length} podrodzajów ·{" "}
              {allSizes.length} rozmiarów · {formatPriceRange(activePrices(allSizes))}
            </span>
          </span>

          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`shrink-0 text-[var(--ruggy-muted)] transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </h2>

      {isOpen ? (
        <div className="border-t-2 border-[var(--ruggy-border)] px-4 py-5 sm:px-6">
          <TypeForm
            initial={type}
            defaultDisplayOrder={type.displayOrder}
            pending={pending}
            submitLabel="Zapisz kategorię"
            onSubmit={(values) => run(() => updateRugType(type.id, values))}
            onDelete={requestDelete}
            deleteBlocked={hasBookings}
          />

          {photosEnabled ? (
            <PhotoManager
              owner={{ rugTypeId: type.id, rugVariantId: null }}
              ownerName={type.name}
              photos={type.photos}
              fallbackSlug={type.slug}
              pending={pending}
              run={run}
              askConfirm={askConfirm}
            />
          ) : null}

          <SizeSection
            title="Rozmiary i ceny kategorii"
            sizes={type.sizes}
            owner={{ rugTypeId: type.id, rugVariantId: null }}
            usedSizes={usedSizes}
            pending={pending}
            run={run}
            askConfirm={askConfirm}
            note={
              sizeSource === "variants"
                ? "Ta kategoria sprzedaje przez podrodzaje — klient wybiera rozmiar dopiero w wybranym podrodzaju. Rozmiary dodane tutaj nie pojawią się w zamówieniu."
                : sizeSource === "custom"
                  ? "Ta kategoria idzie ścieżką wyceny: klient podaje własne wymiary, a cenę orientacyjną wylicza kalkulator. Rozmiary z tej tabeli nie pojawią się w zamówieniu."
                  : null
            }
          />

          <div className="mt-7 border-t-2 border-[var(--ruggy-border)] pt-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.1em] text-[var(--ruggy-ink)]">
                  <Layers size={16} className="text-[var(--ruggy-blue)]" aria-hidden="true" />
                  Podrodzaje
                </h3>
                <p className="mt-1 text-xs text-[var(--ruggy-muted)]">
                  {type.variants.length
                    ? usesDirectCheckout(type.orderMode)
                      ? "Klient wybiera podrodzaj na osobnym ekranie, a potem jego rozmiar."
                      : "Klient wybiera podrodzaj na osobnym ekranie, a potem podaje własne wymiary do wyceny."
                    : "Dodaj podrodzaj, jeśli klient ma najpierw wybrać konkretny wzór lub wariant."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddingVariant(true)}
                className={secondaryButtonClass}
              >
                <Plus size={16} aria-hidden="true" />
                Dodaj podrodzaj
              </button>
            </div>

            {isAddingVariant ? (
              <div className="mt-4 rounded-[1.5rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-canvas)] p-4 sm:p-5">
                <p className="text-sm font-black text-[var(--ruggy-ink)]">
                  Nowy podrodzaj w „{type.name}”
                </p>
                <VariantForm
                  initial={null}
                  defaultDisplayOrder={nextVariantOrder}
                  pending={pending}
                  submitLabel="Dodaj podrodzaj"
                  onCancel={() => {
                    releasePendingVariantPhotos(newVariantPhotos);
                    setIsAddingVariant(false);
                  }}
                  onSubmit={handleCreateVariant}
                  extraFields={
                    photosEnabled ? (
                      <PendingPhotoPicker
                        photos={newVariantPhotos}
                        coverId={newVariantCoverId}
                        disabled={pending}
                        emptyMessage="Bez zdjęć podrodzaj odziedziczy galerię kategorii nadrzędnej."
                        onAdd={(added) => {
                          setNewVariantPhotos((current) => [...current, ...added]);
                          setNewVariantCoverId(
                            (current) => current ?? added[0]?.id ?? null,
                          );
                        }}
                        onRemove={(photoId) => {
                          setNewVariantPhotos((current) => {
                            const removed = current.find(
                              (photo) => photo.id === photoId,
                            );
                            if (removed) URL.revokeObjectURL(removed.previewUrl);
                            const next = current.filter(
                              (photo) => photo.id !== photoId,
                            );
                            setNewVariantCoverId((cover) =>
                              cover === photoId ? (next[0]?.id ?? null) : cover,
                            );
                            return next;
                          });
                        }}
                        onSetCover={setNewVariantCoverId}
                        onError={(message) => run(async () => ({ success: false, message }))}
                      />
                    ) : null
                  }
                />
              </div>
            ) : null}

            {type.variants.length ? (
              <ul className="mt-4 flex flex-col gap-3">
                {type.variants.map((variant) => (
                  <li key={variant.id}>
                    <VariantCard
                      variant={variant}
                      hasBookings={usedVariants.has(variant.id)}
                      usedSizes={usedSizes}
                      typeName={type.name}
                      parentSlug={type.slug}
                      parentPhotos={type.photos}
                      photosEnabled={photosEnabled}
                      pending={pending}
                      run={run}
                      askConfirm={askConfirm}
                    />
                  </li>
                ))}
              </ul>
            ) : isAddingVariant ? null : (
              <p className="mt-4 rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-canvas)] px-4 py-5 text-sm font-bold text-[var(--ruggy-muted)]">
                Ta kategoria nie ma podrodzajów.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------- variant card */

function VariantCard({
  variant,
  hasBookings,
  usedSizes,
  typeName,
  parentSlug,
  parentPhotos,
  photosEnabled,
  pending,
  run,
  askConfirm,
}: {
  variant: CatalogVariant;
  hasBookings: boolean;
  usedSizes: Set<number>;
  typeName: string;
  parentSlug: string;
  parentPhotos: RugPhoto[];
  photosEnabled: boolean;
  pending: boolean;
  run: RunAction;
  askConfirm: (request: ConfirmRequest) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const requestDelete = () => {
    askConfirm({
      title: `Usunąć podrodzaj „${variant.name}”?`,
      description:
        "Usunę też wszystkie jego rozmiary. Tej operacji nie da się cofnąć — jeśli chcesz go tylko schować, ustaw go jako nieaktywny.",
      confirmLabel: "Usuń podrodzaj",
      onConfirm: () => run(() => deleteRugVariant(variant.id)),
    });
  };

  return (
    <div
      className={`overflow-hidden rounded-[1.5rem] border-2 bg-[var(--ruggy-canvas)] ${
        variant.isActive
          ? "border-[var(--ruggy-border-strong)]"
          : "border-dashed border-[var(--ruggy-border)]"
      }`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#fff8d9] focus-visible:bg-[#fff8d9] focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-[var(--ruggy-ink)]">
              {variant.name || "Bez nazwy"}
            </span>
            <Badge tone={variant.isActive ? "green" : "muted"}>
              {variant.isActive ? "Widoczny" : "Ukryty"}
            </Badge>
          </span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--ruggy-muted)]">
            /{variant.slug} · {variant.sizes.length} rozmiarów ·{" "}
            {formatPriceRange(activePrices(variant.sizes))}
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-[var(--ruggy-muted)] transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div className="border-t-2 border-[var(--ruggy-border)] px-4 py-4">
          <VariantForm
            initial={variant}
            defaultDisplayOrder={variant.displayOrder}
            pending={pending}
            submitLabel="Zapisz podrodzaj"
            onSubmit={(values) => run(() => updateRugVariant(variant.id, values))}
            onDelete={requestDelete}
            deleteBlocked={hasBookings}
          />

          {photosEnabled ? (
            <PhotoManager
              owner={{ rugTypeId: null, rugVariantId: variant.id }}
              ownerName={variant.name}
              photos={variant.photos}
              fallbackSlug={parentSlug}
              fallbackName={typeName}
              fallbackPhotos={parentPhotos}
              pending={pending}
              run={run}
              askConfirm={askConfirm}
            />
          ) : null}

          <SizeSection
            title="Rozmiary i ceny podrodzaju"
            sizes={variant.sizes}
            owner={{ rugTypeId: null, rugVariantId: variant.id }}
            usedSizes={usedSizes}
            pending={pending}
            run={run}
            askConfirm={askConfirm}
            note={null}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ type form */

function TypeForm({
  initial,
  defaultDisplayOrder,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
  deleteBlocked,
  extraFields,
}: {
  initial: CatalogRugType | null;
  defaultDisplayOrder: number;
  pending: boolean;
  submitLabel: string;
  onSubmit: (values: RugTypeInput) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  deleteBlocked?: boolean;
  /** Rendered just above the buttons — the new-category photo picker uses it. */
  extraFields?: ReactNode;
}) {
  const serverDraft = {
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    leadTimeDays: String(initial?.leadTimeDays ?? 7),
    displayOrder: String(defaultDisplayOrder),
    isActive: initial?.isActive ?? true,
    orderMode: initial?.orderMode ?? "quote",
    hasDelay: initial?.hasDelay ?? false,
  };
  const [draft, setDraft, isDirty] = useServerDraft(serverDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSlugUnlocked, setIsSlugUnlocked] = useState(!initial);

  const handleSubmit = () => {
    const values: RugTypeInput = {
      name: draft.name,
      slug: draft.slug,
      description: draft.description,
      leadTimeDays: toInteger(draft.leadTimeDays),
      displayOrder: toInteger(draft.displayOrder),
      isActive: draft.isActive,
      orderMode: draft.orderMode,
      hasDelay: draft.hasDelay,
    };
    const parsed = rugTypeSchema.safeParse(values);

    if (!parsed.success) {
      setErrors(collectCatalogFieldErrors(parsed.error));
      return;
    }

    setErrors({});
    onSubmit(values);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
      className="mt-4 grid gap-4"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <TextField
          label="Nazwa kategorii"
          value={draft.name}
          error={errors.name}
          placeholder="np. ALKODYWANY"
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              name: value,
              // A brand new category gets its slug suggested from the name; an
              // existing one never has it rewritten behind the owner's back.
              slug: initial ? current.slug : slugifyRugName(value),
            }))
          }
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor={`type-slug-${initial?.id ?? "new"}`}
              className="text-xs font-black uppercase tracking-[0.08em] text-[var(--ruggy-muted)]"
            >
              Slug (adres)
            </label>
            {initial ? (
              <button
                type="button"
                onClick={() => setIsSlugUnlocked((current) => !current)}
                className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--ruggy-blue)] hover:underline"
              >
                {isSlugUnlocked ? (
                  <>
                    <Lock size={12} aria-hidden="true" />
                    Zablokuj
                  </>
                ) : (
                  <>
                    <LockOpen size={12} aria-hidden="true" />
                    Odblokuj
                  </>
                )}
              </button>
            ) : null}
          </div>
          <input
            id={`type-slug-${initial?.id ?? "new"}`}
            value={draft.slug}
            disabled={!isSlugUnlocked}
            onChange={(event) =>
              setDraft((current) => ({ ...current, slug: event.target.value }))
            }
            placeholder="np. alkodywany"
            className={fieldClass(Boolean(errors.slug))}
            aria-invalid={errors.slug ? true : undefined}
          />
          <InlineError message={errors.slug} />
          {isSlugUnlocked && initial ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold leading-4 text-[var(--ruggy-error)]">
              <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              Slug steruje galerią realizacji i ścieżką zdjęć w /public. Zmień
              go tylko razem z odpowiadającymi mu plikami.
            </p>
          ) : null}
        </div>
      </div>

      <TextAreaField
        label="Opis widoczny u klienta"
        value={draft.description}
        error={errors.description}
        placeholder="np. może nie lepszy niż piwo, ale na pewno wystarcza na dłużej"
        onChange={(value) =>
          setDraft((current) => ({ ...current, description: value }))
        }
      />

      <fieldset>
        <legend className="text-xs font-black uppercase tracking-[0.08em] text-[var(--ruggy-muted)]">
          Sposób sprzedaży
        </legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <OrderModeOption
            mode="quote"
            selected={draft.orderMode === "quote"}
            disabled={pending}
            icon={AtSign}
            title="Wycena przez Instagram"
            description="Klient podaje własne wymiary. Zgłoszenie zapisuje się bez płatności."
            onSelect={() =>
              setDraft((current) => ({ ...current, orderMode: "quote" }))
            }
          />
          <OrderModeOption
            mode="checkout"
            selected={draft.orderMode === "checkout"}
            disabled={pending}
            icon={CreditCard}
            title="Płatność od razu na stronie"
            description="Klient wybiera zapisany rozmiar i przechodzi do płatności online."
            onSelect={() =>
              setDraft((current) => ({ ...current, orderMode: "checkout" }))
            }
          />
        </div>
        <InlineError message={errors.orderMode} />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Czas realizacji (dni)"
          value={draft.leadTimeDays}
          error={errors.leadTimeDays}
          type="number"
          onChange={(value) =>
            setDraft((current) => ({ ...current, leadTimeDays: value }))
          }
        />
        <TextField
          label="Kolejność na liście"
          value={draft.displayOrder}
          error={errors.displayOrder}
          type="number"
          onChange={(value) =>
            setDraft((current) => ({ ...current, displayOrder: value }))
          }
        />
        <ActiveSwitch
          label="Widoczność"
          checked={draft.isActive}
          onLabel="Widoczna dla klientów"
          offLabel="Ukryta"
          onChange={(checked) =>
            setDraft((current) => ({ ...current, isActive: checked }))
          }
        />
      </div>

      {/* Deliberately its own row: it is the one switch that changes what the
          shop says about a category without hiding it. */}
      <div>
        <ActiveSwitch
          label="Opóźnienie"
          checked={draft.hasDelay}
          onLabel="Nakładka „opóźnienie” włączona"
          offLabel="Bez opóźnienia"
          onChange={(checked) =>
            setDraft((current) => ({ ...current, hasDelay: checked }))
          }
        />
        <p className="mt-1.5 text-[11px] font-bold leading-4 text-[var(--ruggy-muted)]">
          Włączone: karta tej kategorii i jej strona pokazują klientowi, że
          realizacja potrwa dłużej niż {RUG_LEAD_TIME_LABEL}.
        </p>
      </div>

      {extraFields}

      <FormActions
        pending={pending}
        isDirty={isDirty || !initial}
        submitLabel={submitLabel}
        onCancel={onCancel}
        onDelete={onDelete}
        deleteBlocked={deleteBlocked}
        deleteLabel="Usuń kategorię"
      />
    </form>
  );
}

function OrderModeOption({
  mode,
  selected,
  disabled,
  icon: Icon,
  title,
  description,
  onSelect,
}: {
  mode: RugOrderMode;
  selected: boolean;
  disabled: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex min-h-24 cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ruggy-blue)] ${
        selected
          ? "border-[var(--ruggy-ink)] bg-[var(--ruggy-blue-soft)]"
          : "border-[var(--ruggy-border)] bg-[var(--ruggy-canvas)] hover:border-[var(--ruggy-border-strong)]"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="radio"
        name="rug-order-mode"
        value={mode}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="mt-1 size-4 shrink-0 accent-[var(--ruggy-blue)]"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-black text-[var(--ruggy-ink)]">
          <Icon size={16} aria-hidden="true" />
          {title}
        </span>
        <span className="mt-1 block text-xs leading-5 text-[var(--ruggy-body)]">
          {description}
        </span>
      </span>
    </label>
  );
}

/* --------------------------------------------------------- variant form */

function VariantForm({
  initial,
  defaultDisplayOrder,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
  deleteBlocked,
  extraFields,
}: {
  initial: CatalogVariant | null;
  defaultDisplayOrder: number;
  pending: boolean;
  submitLabel: string;
  onSubmit: (values: RugVariantInput) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  deleteBlocked?: boolean;
  extraFields?: ReactNode;
}) {
  const serverDraft = {
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    displayOrder: String(defaultDisplayOrder),
    isActive: initial?.isActive ?? true,
  };
  const [draft, setDraft, isDirty] = useServerDraft(serverDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    const values: RugVariantInput = {
      name: draft.name,
      slug: draft.slug,
      description: draft.description,
      displayOrder: toInteger(draft.displayOrder),
      isActive: draft.isActive,
    };
    const parsed = rugVariantSchema.safeParse(values);

    if (!parsed.success) {
      setErrors(collectCatalogFieldErrors(parsed.error));
      return;
    }

    setErrors({});
    onSubmit(values);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
      className="mt-3 grid gap-4"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <TextField
          label="Nazwa podrodzaju"
          value={draft.name}
          error={errors.name}
          placeholder="np. PAPASHREK"
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              name: value,
              slug: initial ? current.slug : slugifyRugName(value),
            }))
          }
        />
        <TextField
          label="Slug (adres)"
          value={draft.slug}
          error={errors.slug}
          placeholder="np. papashrek"
          hint="Slug podrodzaju wskazuje jego zdjęcie w galerii i domyślny „popularny” rozmiar."
          onChange={(value) => setDraft((current) => ({ ...current, slug: value }))}
        />
      </div>

      <TextAreaField
        label="Opis (opcjonalny)"
        value={draft.description}
        error={errors.description}
        onChange={(value) =>
          setDraft((current) => ({ ...current, description: value }))
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Kolejność na liście"
          value={draft.displayOrder}
          error={errors.displayOrder}
          type="number"
          onChange={(value) =>
            setDraft((current) => ({ ...current, displayOrder: value }))
          }
        />
        <ActiveSwitch
          label="Widoczność"
          checked={draft.isActive}
          onLabel="Widoczny dla klientów"
          offLabel="Ukryty"
          onChange={(checked) =>
            setDraft((current) => ({ ...current, isActive: checked }))
          }
        />
      </div>

      {extraFields}

      <FormActions
        pending={pending}
        isDirty={isDirty || !initial}
        submitLabel={submitLabel}
        onCancel={onCancel}
        onDelete={onDelete}
        deleteBlocked={deleteBlocked}
        deleteLabel="Usuń podrodzaj"
      />
    </form>
  );
}

/* --------------------------------------------------------------- photos */

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// The same rules the server enforces, applied here so a wrong file is rejected
// before it is uploaded rather than after.
const pickValidPhotos = (files: File[]) => {
  const valid: File[] = [];

  for (const file of files) {
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      return { valid, error: `„${file.name}” to nie jest JPG, PNG ani WEBP.` };
    }

    if (file.size > MAX_RUG_PHOTO_SIZE) {
      return {
        valid,
        error: `„${file.name}” waży więcej niż ${MAX_RUG_PHOTO_SIZE / (1024 * 1024)} MB.`,
      };
    }

    valid.push(file);
  }

  return { valid, error: undefined as string | undefined };
};

function PhotoUploadButton({
  label,
  disabled,
  onFiles,
}: {
  label: string;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={secondaryButtonClass}
      >
        <ImagePlus size={16} aria-hidden="true" />
        {label}
      </button>
      {/* `hidden` rather than sr-only: the button is the control, and a second
          tab stop onto an invisible input helps nobody. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_PHOTO_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          // Cleared so picking the very same file again still fires onChange.
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

function PhotoTile({
  src,
  alt,
  isCover,
  disabled,
  onSetCover,
  onRemove,
}: {
  src: string;
  alt: string;
  isCover: boolean;
  disabled: boolean;
  onSetCover: () => void;
  onRemove: () => void;
}) {
  return (
    <figure
      className={`overflow-hidden rounded-2xl border-2 bg-white ${
        isCover
          ? "border-[var(--ruggy-ink)] shadow-[3px_4px_0_var(--ruggy-yellow)]"
          : "border-[var(--ruggy-border)]"
      }`}
    >
      <div className="relative aspect-square bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="size-full object-contain" />
        {isCover ? (
          <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-yellow)] px-2 py-0.5 text-[10px] font-black text-[var(--ruggy-ink)]">
            <Star size={10} aria-hidden="true" />
            Okładka
          </span>
        ) : null}
      </div>

      <figcaption className="flex items-center justify-between gap-1 border-t-2 border-[var(--ruggy-border)] p-1.5">
        <button
          type="button"
          disabled={disabled || isCover}
          onClick={onSetCover}
          className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-black text-[var(--ruggy-blue)] transition-colors hover:bg-[var(--ruggy-blue-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-blue)] disabled:cursor-not-allowed disabled:text-[var(--ruggy-muted)] disabled:hover:bg-transparent"
        >
          <Star size={11} aria-hidden="true" />
          <span className="truncate">
            {isCover ? "Jest okładką" : "Na okładkę"}
          </span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label="Usuń zdjęcie"
          title="Usuń zdjęcie"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--ruggy-error)] transition-colors hover:bg-[#fff0eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-error)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </figcaption>
    </figure>
  );
}

function PhotoHeading({ count }: { count: number }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.1em] text-[var(--ruggy-ink)]">
        <ImagePlus size={16} className="text-[var(--ruggy-blue)]" aria-hidden="true" />
        Zdjęcia
      </h3>
      <p className="mt-1 text-xs text-[var(--ruggy-muted)]">
        Okładka trafia na kafelek, reszta na pasek „przykładowe realizacje”.
        JPG, PNG lub WEBP do{" "}
        {MAX_RUG_PHOTO_SIZE / (1024 * 1024)} MB.
        {count ? ` Masz ${count}.` : ""}
      </p>
    </div>
  );
}

// New category: there is no row to hang photos on yet, so files sit here with
// object-URL previews until the insert returns an id.
function PendingPhotoPicker({
  photos,
  coverId,
  disabled,
  onAdd,
  onRemove,
  onSetCover,
  onError,
  emptyMessage,
}: {
  photos: PendingPhoto[];
  coverId: string | null;
  disabled: boolean;
  onAdd: (photos: PendingPhoto[]) => void;
  onRemove: (photoId: string) => void;
  onSetCover: (photoId: string) => void;
  onError: (message: string) => void;
  emptyMessage?: string;
}) {
  return (
    <section className="rounded-[1.5rem] border-2 border-[var(--ruggy-border)] bg-[var(--ruggy-canvas)] p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <PhotoHeading count={photos.length} />
        <PhotoUploadButton
          label="Wybierz zdjęcia"
          disabled={disabled}
          onFiles={(files) => {
            const { valid, error } = pickValidPhotos(files);

            if (valid.length) {
              onAdd(
                valid.map((file) => ({
                  id: crypto.randomUUID(),
                  file,
                  previewUrl: URL.createObjectURL(file),
                })),
              );
            }

            if (error) onError(error);
          }}
        />
      </div>

      {photos.length ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {photos.map((photo) => (
            <li key={photo.id}>
              <PhotoTile
                src={photo.previewUrl}
                alt={photo.file.name}
                isCover={photo.id === coverId}
                disabled={disabled}
                onSetCover={() => onSetCover(photo.id)}
                onRemove={() => onRemove(photo.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] px-4 py-4 text-xs font-bold text-[var(--ruggy-muted)]">
          {emptyMessage ??
            "Bez zdjęć kafelek kategorii pokaże tylko jej pierwszą literę. Zdjęcia wyślą się zaraz po dodaniu kategorii."}
        </p>
      )}
    </section>
  );
}

// Existing category: every pick uploads straight away, so what you see here is
// exactly what the shop is serving.
function PhotoManager({
  owner,
  ownerName,
  photos,
  fallbackSlug,
  fallbackName,
  fallbackPhotos,
  pending,
  run,
  askConfirm,
}: {
  owner: SizeOwner;
  ownerName: string;
  photos: RugPhoto[];
  fallbackSlug?: string;
  fallbackName?: string;
  fallbackPhotos?: RugPhoto[];
  pending: boolean;
  run: RunAction;
  askConfirm: (request: ConfirmRequest) => void;
}) {
  const staticGallery = fallbackSlug ? getCategory(fallbackSlug) : undefined;
  const isVariant = owner.rugVariantId != null;
  const fallbackPhotoCount = fallbackPhotos?.length ?? 0;

  return (
    <section className="mt-7 border-t-2 border-[var(--ruggy-border)] pt-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <PhotoHeading count={photos.length} />
        <PhotoUploadButton
          label="Dodaj zdjęcia"
          disabled={pending}
          onFiles={(files) => {
            const { valid, error } = pickValidPhotos(files);

            if (error) {
              run(async () => ({ success: false, message: error }));
              return;
            }

            run(async () => {
              for (const file of valid) {
                const result = await uploadRugPhoto(owner, file, false);
                if (!result.success) return result;
              }

              return {
                success: true,
                message:
                  valid.length > 1
                    ? `Dodano ${valid.length} zdjęć.`
                    : "Zdjęcie zostało dodane.",
              };
            });
          }}
        />
      </div>

      {photos.length ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {photos.map((photo) => (
            <li key={photo.id}>
              <PhotoTile
                src={photo.url}
                alt={`Zdjęcie ${isVariant ? "podrodzaju" : "kategorii"} ${ownerName}`}
                isCover={photo.isCover}
                disabled={pending}
                onSetCover={() => run(() => setRugPhotoCover(photo.id))}
                onRemove={() =>
                  askConfirm({
                    title: "Usunąć to zdjęcie?",
                    description:
                      "Plik zniknie ze strony i z magazynu Supabase. Tej operacji nie da się cofnąć — jeśli to okładka, jej rolę przejmie kolejne zdjęcie.",
                    confirmLabel: "Usuń zdjęcie",
                    onConfirm: () => run(() => deleteRugPhoto(photo.id)),
                  })
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-canvas)] px-4 py-4 text-xs font-bold leading-5 text-[var(--ruggy-muted)]">
          {isVariant
            ? `Brak własnych zdjęć. Ten podrodzaj korzysta teraz z galerii kategorii${fallbackName ? ` „${fallbackName}”` : " nadrzędnej"}${fallbackPhotoCount ? ` (${fallbackPhotoCount} zdjęć)` : ""}. Dodanie pierwszego zdjęcia zastąpi ten fallback.`
            : staticGallery
            ? `Ta kategoria korzysta na razie ze zdjęć wgranych do repozytorium (${staticGallery.photos.length + 1} szt. z /public). Pierwsze zdjęcie dodane tutaj zastąpi cały ten zestaw.`
            : "Brak zdjęć — kafelek kategorii pokaże tylko jej pierwszą literę."}
        </p>
      )}
    </section>
  );
}

/* ----------------------------------------------------------- size table */

function SizeSection({
  title,
  sizes,
  owner,
  usedSizes,
  pending,
  run,
  askConfirm,
  note,
}: {
  title: string;
  sizes: CatalogSize[];
  owner: SizeOwner;
  usedSizes: Set<number>;
  pending: boolean;
  run: RunAction;
  askConfirm: (request: ConfirmRequest) => void;
  note: string | null;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const nextOrder = sizes.length
    ? Math.max(...sizes.map((size) => size.displayOrder)) + 1
    : 1;

  return (
    <section className="mt-7 border-t-2 border-[var(--ruggy-border)] pt-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.1em] text-[var(--ruggy-ink)]">
            <Ruler size={16} className="text-[var(--ruggy-blue)]" aria-hidden="true" />
            {title}
          </h3>
          <p className="mt-1 text-xs text-[var(--ruggy-muted)]">
            Wymiar to dłuższy bok dywanu — tak samo opisujemy go klientowi.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className={secondaryButtonClass}
        >
          <Plus size={16} aria-hidden="true" />
          Dodaj rozmiar
        </button>
      </div>

      {note ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border-2 border-[var(--ruggy-border)] bg-[var(--ruggy-blue-soft)] px-3 py-2.5 text-xs font-bold leading-5 text-[var(--ruggy-ink)]">
          <Info size={14} className="mt-0.5 shrink-0 text-[var(--ruggy-blue)]" aria-hidden="true" />
          {note}
        </p>
      ) : null}

      {sizes.length ? (
        <div className="mt-4">
          <div
            className={`hidden items-center gap-3 border-b-2 border-[var(--ruggy-border)] pb-2 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--ruggy-muted)] lg:grid ${SIZE_GRID_CLASS}`}
          >
            <span>Etykieta</span>
            <span>Bok (cm)</span>
            <span>Cena (zł)</span>
            <span>Kolejność</span>
            <span>Widoczność</span>
            <span />
          </div>

          <ul className="divide-y-2 divide-[var(--ruggy-border)]">
            {sizes.map((size) => (
              <li key={size.id}>
                <SizeRow
                  size={size}
                  hasBookings={usedSizes.has(size.id)}
                  pending={pending}
                  run={run}
                  askConfirm={askConfirm}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-canvas)] px-4 py-5 text-sm font-bold text-[var(--ruggy-muted)]">
          Brak rozmiarów.
        </p>
      )}

      {isAdding ? (
        <div className="mt-4 rounded-[1.5rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-canvas)] p-4">
          <p className="text-sm font-black text-[var(--ruggy-ink)]">Nowy rozmiar</p>
          <SizeForm
            initial={null}
            defaultDisplayOrder={nextOrder}
            pending={pending}
            submitLabel="Dodaj rozmiar"
            onCancel={() => setIsAdding(false)}
            onSubmit={(values) =>
              run(
                () => createRugSize(owner, values),
                () => setIsAdding(false),
              )
            }
          />
        </div>
      ) : null}
    </section>
  );
}

function SizeRow({
  size,
  hasBookings,
  pending,
  run,
  askConfirm,
}: {
  size: CatalogSize;
  hasBookings: boolean;
  pending: boolean;
  run: RunAction;
  askConfirm: (request: ConfirmRequest) => void;
}) {
  const serverDraft = {
    label: size.label,
    widthCm: String(size.widthCm),
    price: centsToInput(size.priceCents),
    displayOrder: String(size.displayOrder),
    isActive: size.isActive,
  };
  const [draft, setDraft, isDirty] = useServerDraft(serverDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const values: RugSizeInput = {
      label: draft.label,
      widthCm: toInteger(draft.widthCm),
      priceCents: inputToCents(draft.price),
      displayOrder: toInteger(draft.displayOrder),
      isActive: draft.isActive,
    };
    const parsed = rugSizeSchema.safeParse(values);

    if (!parsed.success) {
      setErrors(collectCatalogFieldErrors(parsed.error));
      return;
    }

    setErrors({});
    run(() => updateRugSize(size.id, values));
  };

  const requestDelete = () => {
    askConfirm({
      title: `Usunąć rozmiar „${size.label}”?`,
      description:
        "Zniknie z konfiguratora zamówienia. Tej operacji nie da się cofnąć — jeśli chcesz go tylko chwilowo wycofać, ustaw go jako nieaktywny.",
      confirmLabel: "Usuń rozmiar",
      onConfirm: () => run(() => deleteRugSize(size.id)),
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
      className={`grid gap-3 py-3 lg:items-start ${SIZE_GRID_CLASS}`}
    >
      <CompactField
        label="Etykieta"
        value={draft.label}
        error={errors.label}
        placeholder="np. 70 cm"
        onChange={(value) => setDraft((current) => ({ ...current, label: value }))}
      />
      <CompactField
        label="Bok (cm)"
        value={draft.widthCm}
        error={errors.widthCm}
        type="number"
        onChange={(value) =>
          setDraft((current) => ({
            ...current,
            widthCm: value,
            // Labels here are always "<bok> cm", so keep them in step unless the
            // owner has written something of their own.
            label:
              current.label === `${current.widthCm} cm` || current.label === ""
                ? `${value} cm`
                : current.label,
          }))
        }
      />
      <CompactField
        label="Cena (zł)"
        value={draft.price}
        error={errors.priceCents}
        type="number"
        step="0.01"
        onChange={(value) => setDraft((current) => ({ ...current, price: value }))}
      />
      <CompactField
        label="Kolejność"
        value={draft.displayOrder}
        error={errors.displayOrder}
        type="number"
        onChange={(value) =>
          setDraft((current) => ({ ...current, displayOrder: value }))
        }
      />
      <ActiveSwitch
        label="Widoczność"
        compact
        checked={draft.isActive}
        onLabel="Widoczny"
        offLabel="Ukryty"
        onChange={(checked) =>
          setDraft((current) => ({ ...current, isActive: checked }))
        }
      />

      {/* On lg the field labels are sr-only (out of flow), so every control in
          the row starts at the same top edge as these buttons. */}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || !isDirty}
          className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--ruggy-blue)] px-4 text-xs font-black text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-ink)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {pending && isDirty ? (
            <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Check size={14} aria-hidden="true" />
          )}
          Zapisz
        </button>
        <button
          type="button"
          onClick={requestDelete}
          disabled={pending || hasBookings}
          title={
            hasBookings
              ? "Ten rozmiar jest w zamówieniach — możesz go tylko ukryć."
              : "Usuń rozmiar"
          }
          aria-label={`Usuń rozmiar ${size.label}`}
          className="inline-flex size-11 items-center justify-center rounded-full border-2 border-[var(--ruggy-border)] text-[var(--ruggy-error)] transition-colors hover:border-[var(--ruggy-error)] hover:bg-[#fff0eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-error)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

function SizeForm({
  initial,
  defaultDisplayOrder,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CatalogSize | null;
  defaultDisplayOrder: number;
  pending: boolean;
  submitLabel: string;
  onSubmit: (values: RugSizeInput) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    label: initial?.label ?? "",
    widthCm: initial ? String(initial.widthCm) : "",
    price: initial ? centsToInput(initial.priceCents) : "",
    displayOrder: String(defaultDisplayOrder),
    isActive: initial?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    const values: RugSizeInput = {
      label: draft.label,
      widthCm: toInteger(draft.widthCm),
      priceCents: inputToCents(draft.price),
      displayOrder: toInteger(draft.displayOrder),
      isActive: draft.isActive,
    };
    const parsed = rugSizeSchema.safeParse(values);

    if (!parsed.success) {
      setErrors(collectCatalogFieldErrors(parsed.error));
      return;
    }

    setErrors({});
    onSubmit(values);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
      className={`mt-3 grid gap-3 ${SIZE_GRID_CLASS}`}
    >
      <CompactField
        label="Etykieta"
        value={draft.label}
        error={errors.label}
        placeholder="np. 70 cm"
        onChange={(value) => setDraft((current) => ({ ...current, label: value }))}
      />
      <CompactField
        label="Bok (cm)"
        value={draft.widthCm}
        error={errors.widthCm}
        type="number"
        onChange={(value) =>
          setDraft((current) => ({
            ...current,
            widthCm: value,
            label:
              current.label === `${current.widthCm} cm` || current.label === ""
                ? `${value} cm`
                : current.label,
          }))
        }
      />
      <CompactField
        label="Cena (zł)"
        value={draft.price}
        error={errors.priceCents}
        type="number"
        step="0.01"
        placeholder="np. 399.00"
        onChange={(value) => setDraft((current) => ({ ...current, price: value }))}
      />
      <CompactField
        label="Kolejność"
        value={draft.displayOrder}
        error={errors.displayOrder}
        type="number"
        onChange={(value) =>
          setDraft((current) => ({ ...current, displayOrder: value }))
        }
      />
      <ActiveSwitch
        label="Widoczność"
        compact
        checked={draft.isActive}
        onLabel="Widoczny"
        offLabel="Ukryty"
        onChange={(checked) =>
          setDraft((current) => ({ ...current, isActive: checked }))
        }
      />

      <div className="flex flex-wrap items-center gap-2 lg:col-span-full">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus size={16} aria-hidden="true" />
          )}
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------- form helpers */

// Keeps an editable draft next to server data: as long as the server values
// stay put the draft is the owner's, and the moment the server row changes
// (a save landing, another tab editing) the draft resyncs to it.
function useServerDraft<T extends Record<string, string | boolean>>(
  serverDraft: T,
) {
  const serverKey = JSON.stringify(serverDraft);
  const [baseline, setBaseline] = useState(serverKey);
  const [draft, setDraft] = useState(serverDraft);

  if (baseline !== serverKey) {
    setBaseline(serverKey);
    setDraft(serverDraft);
  }

  return [draft, setDraft, JSON.stringify(draft) !== serverKey] as const;
}

function FormActions({
  pending,
  isDirty,
  submitLabel,
  onCancel,
  onDelete,
  deleteBlocked,
  deleteLabel,
}: {
  pending: boolean;
  isDirty: boolean;
  submitLabel: string;
  onCancel?: () => void;
  onDelete?: () => void;
  deleteBlocked?: boolean;
  deleteLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={pending || !isDirty}
        className={primaryButtonClass}
      >
        {pending && isDirty ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Check size={16} aria-hidden="true" />
        )}
        {submitLabel}
      </button>

      {onCancel ? (
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Anuluj
        </button>
      ) : null}

      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={pending || deleteBlocked}
          title={
            deleteBlocked
              ? "Są z tym powiązane zamówienia — możesz to tylko ukryć."
              : deleteLabel
          }
          className={`${dangerButtonClass} sm:ms-auto`}
        >
          <Trash2 size={15} aria-hidden="true" />
          {deleteLabel}
        </button>
      ) : null}

      {deleteBlocked ? (
        <p className="w-full text-[11px] font-bold text-[var(--ruggy-muted)] sm:w-auto sm:text-right">
          Są tu powiązane zamówienia — zamiast usuwać, ustaw jako nieaktywne.
        </p>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  error,
  placeholder,
  hint,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  hint?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.08em] text-[var(--ruggy-muted)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass(Boolean(error))}
        aria-invalid={error ? true : undefined}
      />
      {hint && !error ? (
        <span className="mt-1.5 block text-[11px] font-semibold leading-4 text-[var(--ruggy-muted)]">
          {hint}
        </span>
      ) : null}
      <InlineError message={error} />
    </label>
  );
}

function CompactField({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = "text",
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-[var(--ruggy-muted)] lg:sr-only">
        {label}
      </span>
      <input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass(Boolean(error))}
        aria-invalid={error ? true : undefined}
      />
      <InlineError message={error} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.08em] text-[var(--ruggy-muted)]">
        {label}
      </span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClass(Boolean(error))} min-h-24 resize-y py-2.5`}
        aria-invalid={error ? true : undefined}
      />
      <InlineError message={error} />
    </label>
  );
}

function ActiveSwitch({
  label,
  checked,
  onChange,
  onLabel,
  offLabel,
  compact = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel: string;
  offLabel: string;
  compact?: boolean;
}) {
  return (
    <div className="block">
      <span
        className={`block font-black uppercase tracking-[0.08em] text-[var(--ruggy-muted)] ${
          compact ? "mb-1 text-[10px] lg:sr-only" : "mb-1.5 text-xs"
        }`}
      >
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`flex h-11 w-full items-center gap-2 rounded-xl border-2 px-3 text-left text-xs font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-blue)] ${
          checked
            ? "border-[var(--ruggy-ink)] bg-[var(--ruggy-yellow)] text-[var(--ruggy-ink)]"
            : "border-[var(--ruggy-border)] bg-[var(--ruggy-canvas)] text-[var(--ruggy-muted)]"
        }`}
      >
        <span
          className={`flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-[var(--ruggy-ink)] px-0.5 transition-colors ${
            checked ? "bg-[var(--ruggy-ink)]" : "bg-[var(--ruggy-surface)]"
          }`}
        >
          <span
            className={`size-3 rounded-full transition-transform ${
              checked
                ? "translate-x-4 bg-[var(--ruggy-yellow)]"
                : "bg-[var(--ruggy-muted)]"
            }`}
          />
        </span>
        <span className="truncate">{checked ? onLabel : offLabel}</span>
      </button>
    </div>
  );
}

function InlineError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <span className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold leading-4 text-[var(--ruggy-error)]">
      <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
      {message}
    </span>
  );
}

/* ---------------------------------------------------------------- chrome */

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "green" | "blue" | "yellow" | "muted";
}) {
  const toneClass = {
    green: "bg-[#e1f1e8] text-[var(--ruggy-success)]",
    blue: "bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-blue)]",
    yellow: "bg-[#fff1bf] text-[#8a6411]",
    muted: "bg-[#ece9e2] text-[var(--ruggy-muted)]",
  }[tone];

  return (
    <span
      className={`inline-flex w-fit items-center whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-black ${toneClass}`}
    >
      {children}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "neutral" | "rose" | "green" | "yellow";
}) {
  const toneClass = {
    neutral: "bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-blue)]",
    rose: "bg-[var(--ruggy-yellow)] text-[var(--ruggy-ink)]",
    green: "bg-[#e1f1e8] text-[var(--ruggy-success)]",
    yellow: "bg-[var(--ruggy-ink)] text-[var(--ruggy-yellow)]",
  }[tone];

  return (
    <div className="rounded-[1.5rem] border-2 border-[var(--ruggy-border)] bg-[var(--ruggy-surface)] p-4 shadow-[3px_3px_0_var(--ruggy-border)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--ruggy-muted)]">{label}</p>
          <p className="mt-2 truncate text-2xl font-black tracking-tight text-[var(--ruggy-ink)]">
            {value}
          </p>
        </div>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-md ${toneClass}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function ConfirmDialog({
  request,
  pending,
  onClose,
}: {
  request: ConfirmRequest;
  pending: boolean;
  onClose: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[var(--ruggy-ink)]/70 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-confirm-title"
        aria-describedby="catalog-confirm-description"
        className="w-full max-w-lg rounded-[2rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-surface)] p-6 shadow-[8px_10px_0_var(--ruggy-yellow)] sm:p-8"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-[#fff0eb] text-[var(--ruggy-error)]">
          <TriangleAlert size={24} aria-hidden="true" />
        </span>
        <h2
          id="catalog-confirm-title"
          className="mt-5 text-xl font-black leading-tight text-[var(--ruggy-ink)] sm:text-2xl"
        >
          {request.title}
        </h2>
        <p
          id="catalog-confirm-description"
          className="mt-3 text-sm leading-6 text-[var(--ruggy-body)]"
        >
          {request.description}
        </p>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
          >
            <X size={16} aria-hidden="true" />
            Zostaw jak jest
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              request.onConfirm();
              onClose();
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-[var(--ruggy-error)] bg-[var(--ruggy-error)] px-5 text-sm font-black text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-ink)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={16} aria-hidden="true" />
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
