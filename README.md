# Enroute-work-in-progress-
Planer dojazdu do szkoły z dzielnic Legionowa (Serock/Łajski/Zegrze → Legionowo), mapa linii, kalendarz zajęć i tablice odjazdów na przystankach z danymi realtimes.

## Wersja
Version 0.5

## Funkcje
- **Planner trasy** (Do szkoły / Powrót): autobus 731, pociągi S4/S40 (KM) i R90 (Koleje Mazowieckie), spacery piesze, tryb FAST, zapas czasowy.
- **Mapa linii** z pozycjami na żywo dla 731 (API ZTM).
- **Tablice odjazdów na przystanku** (klik w słupek na mapie): REALTIME (pozycje ZTM → ETA z opóźnieniem) > oficjalny rozkład GTFS > uczciwy komunikat przy braku danych.
- **Kalendarz** z zajęciami (dodawanie/edycja/usuwanie wydarzeń).

## Dane
- `schedules.js` — oficjalne rozkłady GTFS (ZTM/Koleje Mazowieckie), okno 2026-09-09..09-18, struktura: `SCHEDULES.lines.<id>.keys = [stopId, name, stopCode]`, `trips = [tripId, serviceDays[], dirFlag, stops[]]`.
- `departures.js` — moduł odjazdów (`DEPT`): identyfikacja słupka po `stop_code` z nazwy („Urząd Miasta (3)" → `03`) i kierunku, dopasowanie pojazdów ZTM do kursów po postępie geograficznym (okno 45 min, pozycje starsze niż 120 s odrzucane), strefa czasowa Europe/Warsaw.
- Pozycje na żywo: `https://api.um.warszawa.pl/.../busapi/...` (linia 731; w `departures.js` jako `ZTM_URL`).

## Testy (Node.js, bez zależności)
```
node tools/test-planner.js
node tools/test-calendar.js
node tools/test-calendar-dom.js
node tools/test-departures.js
```