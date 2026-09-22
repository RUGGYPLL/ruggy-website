# Ruggy

Aplikacja do zamawiania ręcznie tuftowanych dywanów. Klient wybiera wariant,
rozmiar, termin i dostawę, przesyła zdjęcie referencyjne i opłaca zamówienie
przez Stripe. Panel administracyjny służy do obsługi zamówień i kalendarza.

## Uruchomienie

```bash
npm install
npm run dev
```

Aplikacja będzie dostępna pod adresem [http://localhost:3000](http://localhost:3000).

## Migracje bazy

Pliki z `supabase/migrations/` uruchamiaj w kolejności dat w SQL Editorze
Supabase. Migracja `20260801_add_rug_photos.sql` dodaje tabelę `rug_photos`
i publiczny bucket `rug-catalog-photos`, a
`20260803_add_variant_rug_photos.sql` rozszerza je o zdjęcia podrodzajów.
Migracja `20260802_security_hardening.sql` włącza RLS dla danych prywatnych
i ustawia bucket `booking-reference-images` jako prywatny. Wszystkie te
migracje muszą być zastosowane przed wdrożeniem aplikacji.

Migracja `20260819_add_maintenance_mode.sql` dodaje przełącznik przerwy
technicznej. Po jej zastosowaniu administrator może włączyć lub wyłączyć
widoczność strony publicznej z poziomu `/admin/dashboard`. Podczas przerwy
strony publiczne pokazują `/przerwa-techniczna`, a panel administratora i
webhook Stripe nadal działają.

Migracja `20260917_add_agreed_project_payments.sql` dodaje obsługę płatności za
uzgodnione projekty oraz zapis statusu powiadomień WhatsApp. Zastosuj ją przed
wdrożeniem kodu korzystającego z tych pól.

## Zdjęcia kategorii

Okładkę i przykładowe realizacje wgrywasz w `/admin/dywany` — przy tworzeniu
nowej kategorii albo w jej edycji. Pliki trafiają do bucketu
`rug-catalog-photos`, a kategoria bez własnych zdjęć wciąż pokazuje kuratorowany
zestaw z `lib/gallery.ts`. Pierwsze wgrane zdjęcie zastępuje ten zestaw w
całości, żeby nie mieszać dwóch źródeł.

## Adres produkcyjny

Na Vercelu ustaw zmienną:

```env
NEXT_PUBLIC_SITE_URL=https://twoja-domena.pl
NEXT_PUBLIC_APP_URL=https://twoja-domena.pl
```

Adres jest używany w canonicalach, Open Graph, danych strukturalnych,
`robots.txt` i `sitemap.xml`. Bez tej zmiennej aplikacja użyje produkcyjnego
adresu projektu Vercel, a lokalnie `NEXT_PUBLIC_APP_URL` lub
`http://localhost:3000`.

## Kontrola jakości

```bash
npm run lint
npm run build
npm run start
```

Lighthouse uruchamiaj na produkcyjnym serwerze `http://localhost:3000`, który
startuje ostatnia komenda. Nie mierz `npm run dev`, ponieważ tryb deweloperski
dołącza DevTools, HMR i rozwojowe wersje Reacta, które nie trafiają na produkcję.

Po wdrożeniu sprawdź:

- `/robots.txt` i `/sitemap.xml`,
- podgląd linku w Facebook Sharing Debugger,
- dane strukturalne w Google Rich Results Test,
- wydajność mobilną w Google PageSpeed Insights,
- indeksowanie i przesłanie sitemap w Google Search Console.

Panel `/admin`, konfiguratory `/zamow/[id]` oraz strony wyniku płatności mają
ustawione `noindex` i celowo nie występują w sitemapie.

## Potwierdzenia zamówień email

Po potwierdzeniu płatności standardowego zamówienia aplikacja wysyła klientowi
wiadomość przez Resend API. Ustaw lokalnie i na Vercelu:

```env
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Ruggy <zamowienia@ruggy.pl>
```

Do testów przed weryfikacją domeny użyj nadawcy Resend i skieruj wszystkie
wiadomości na adres właściciela konta Resend:

```env
RESEND_FROM_EMAIL=Ruggy <onboarding@resend.dev>
RESEND_TEST_RECIPIENT=twoj-email@example.com
```

W trybie testowym temat wiadomości ma prefiks `[TEST]`, a treść pokazuje
docelowy adres klienta. Przed produkcją zweryfikuj domenę w Resend, ustaw
nadawcę w domenie Ruggy i usuń `RESEND_TEST_RECIPIENT`.

## Powiadomienia WhatsApp

Powiadomienia o nowych zgłoszeniach do wyceny oraz opłaconych projektach
korzystają z oficjalnego Meta WhatsApp Cloud API. W WhatsApp Manager utwórz i
zatwierdź szablon typu Utility. Po każdym zgłoszeniu do wyceny klient dostaje
też potwierdzenie email przez Resend.

```text
Nazwa: new_quote_request
Język: Polish (pl)
Treść: Ktoś prosi o wycenę. Otwórz zamówienie: {{1}}
```

Następnie ustaw lokalnie i na Vercelu:

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_RECIPIENT_NUMBER=48XXXXXXXXX
WHATSAPP_GRAPH_API_VERSION=vXX.X
WHATSAPP_TEMPLATE_NAME=new_quote_request
WHATSAPP_PAID_TEMPLATE_NAME=
WHATSAPP_TEMPLATE_LANGUAGE=pl
```

Numer odbiorcy podaj z kodem kraju, bez znaku `+`. Wersję Graph API wpisz
zgodnie z wersją wybraną w aplikacji Meta. `NEXT_PUBLIC_SITE_URL` musi
wskazywać publiczną domenę, ponieważ jest używany w linku do zamówienia.
`WHATSAPP_PAID_TEMPLATE_NAME` może wskazywać osobny zatwierdzony szablon dla
opłaconych projektów. Jeśli pozostanie puste, aplikacja użyje
`WHATSAPP_TEMPLATE_NAME`.

## Pozostałe integracje

Kompletny zestaw zmiennych produkcyjnych znajduje się w `.env.example`.
Obejmuje również produkcyjny token InPost, osobny
`RUGGY_UPLOAD_SIGNING_SECRET` oraz `OPENAI_API_KEY` używany do generowania
poglądowych projektów w panelu administratora. Nie kopiuj lokalnego `.env`
do produkcji bez sprawdzenia trybu każdego klucza, w szczególności Stripe.
