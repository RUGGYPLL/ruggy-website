# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Głównym użytkownikiem jest klient, który chce zamówić ręcznie tuftowany,
personalizowany dywan na podstawie własnego pomysłu, zdjęcia albo szkicu.
Klient ma przejść od inspiracji do wyboru wariantu, rozmiaru, terminu i dostawy
bez prowadzenia całego procesu w wiadomościach prywatnych.

Drugim użytkownikiem jest właściciel Ruggy, który korzysta z chronionego panelu
administracyjnego do obsługi zamówień, terminów i materiałów referencyjnych.

## Product Purpose

Ruggy jest sklepem i systemem zamówień jednego twórcy ręcznie tuftowanych
dywanów. Produkt upraszcza klientowi złożenie kompletnego zamówienia, a
właścicielowi daje jedno miejsce do zarządzania napływającymi zleceniami.

Sukces oznacza, że klient rozumie dostępne warianty, podaje wszystkie potrzebne
dane i kończy właściwą ścieżkę: płatność online albo zgłoszenie do indywidualnej
wyceny. Właściciel otrzymuje kompletne zamówienie i może dalej prowadzić jego
realizację w panelu administracyjnym.

## Positioning

Ruggy łączy bezpośredni kontakt z konkretnym twórcą z uporządkowanym procesem
zamawiania. Nie jest katalogiem gotowych produktów ani platformą dla wielu
sprzedawców. Każde zamówienie dotyczy ręcznie wykonywanego dywanu Ruggy i może
zacząć się od unikalnego materiału referencyjnego klienta.

## Operating Context

Klient przegląda ofertę, wybiera rodzaj dywanu i przechodzi do konfiguratora.
Podaje rozmiar lub wymiary, termin, sposób dostawy, dane kontaktowe, uwagi oraz
opcjonalne zdjęcie referencyjne. Może także dodać podkład antypoślizgowy.

Każda kategoria ma w panelu administracyjnym własny sposób sprzedaży. Płatność
online korzysta ze zdefiniowanych wariantów, rozmiarów i cen oraz prowadzi do
Stripe. Wycena przez Instagram korzysta z własnych wymiarów i orientacyjnej
ceny, po czym klient wysyła zgłoszenie do indywidualnej wyceny. Osobna ścieżka
płatności pozwala opłacić projekt i kwotę uzgodnione wcześniej z właścicielem.

Właściciel pracuje w panelu administracyjnym. Przegląda szczegóły i statusy
zamówień, korzysta z widoku kalendarza, blokuje terminy oraz może wygenerować
poglądowy projekt dywanu AI na podstawie zdjęcia referencyjnego. Nowe prośby o
wycenę mogą uruchamiać powiadomienie WhatsApp z odnośnikiem do zamówienia.

## Capabilities and Constraints

- Produkt obsługuje jednego twórcę i jedną markę; nie jest systemem
  wielosprzedawcowym.
- Dane oferty, zamówień, blokad kalendarza i zdjęć są przechowywane w Supabase.
- Płatności online i potwierdzenie ich wyniku obsługuje Stripe.
- Dostępne formy dostawy to Paczkomat InPost oraz przesyłka kurierska.
- Klient może przesłać zdjęcie JPG, PNG lub WebP jako materiał referencyjny.
- Terminy wcześniejsze niż minimalne wyprzedzenie oraz dni zablokowane przez
  właściciela są niedostępne.
- Panel administracyjny jest dostępny wyłącznie po zalogowaniu.
- Płatność online w standardowym konfiguratorze dotyczy tylko piwodywanów i
  papadywanów.
- Pozostałe rodzaje pokazują cenę orientacyjną i wymagają indywidualnego
  ustalenia ostatecznej ceny na Instagramie.

## Brand Commitments

Nazwa produktu to Ruggy, a rozpoznawalną personą marki jest „Twój Wuja
Dywaniarz”. Komunikacja jest bezpośrednia, swobodna i prowadzona w pierwszej
osobie liczby pojedynczej. Teksty zwracają się do jednej osoby i nie używają
form sugerujących zespół, takich jak „pokaż nam” lub „napisz do nas”.

Marka obiecuje ręczne wykonanie, indywidualny charakter projektu i kontakt z
konkretnym twórcą. Tych zobowiązań nie należy zastępować komunikacją typową dla
masowego sklepu lub anonimowej platformy.

## Evidence on Hand

- Potwierdzonym dowodem społecznym jest społeczność ponad 10 tysięcy
  obserwujących Ruggy.
- Repozytorium zawiera rzeczywiste zdjęcia prac i procesu w `public/ruggy/`.
- Strona zawiera galerię realizacji oraz opis rzeczywistego procesu wykonania
  dywanu.
- Nie ma potwierdzonych ocen liczbowych, cytatów klientów, nagród, publikacji
  prasowych ani danych o liczbie zrealizowanych zamówień; przyszłe prace nie
  mogą ich wymyślać.

## Product Principles

1. Prowadź klienta od pomysłu do kompletnego zgłoszenia bez chaosu w
   wiadomościach prywatnych.
2. Wyraźnie rozdzielaj produkty z gotową ceną od projektów wymagających
   indywidualnej wyceny.
3. Zachowuj osobisty kontakt z jednym twórcą na każdym etapie komunikacji.
4. Pokazuj klientowi cenę, termin i kolejny krok przed podjęciem zobowiązania.
5. Daj właścicielowi pełny kontekst zamówienia w jednym panelu.

## Accessibility & Inclusion

Kluczowe ścieżki przeglądania oferty, konfiguracji, płatności i zarządzania
zamówieniami muszą działać na telefonie i komputerze, z użyciem klawiatury oraz
przy włączonym ograniczeniu animacji. Informacje potrzebne do złożenia
zamówienia nie mogą być przekazywane wyłącznie kolorem, obrazem albo ruchem.
