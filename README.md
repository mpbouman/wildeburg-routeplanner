# Wildeburg Routeplanner

Webapp waarmee festivalbezoekers de snelste looproute naar een stage op het
Wildeburg-terrein (natuurpark Netl, Kraggenburg) vinden — geplot op de
officiële plattegrond én op een echte kaart (MapLibre).

## Hoe het werkt

De plattegrond van Wildeburg is bewust topologisch-maar-niet-geometrisch
correct. Daarom heeft elk punt (stage, faciliteit, kruispunt) TWEE posities:

- `img`: pixels op de plattegrond (weergave "Plattegrond")
- `geo`: lng/lat op de echte kaart (weergave "Echte kaart", OSM of satelliet)

De paden (topologie) zijn gedeeld tussen beide weergaven. Afstanden en
looptijden worden berekend uit de geo-posities; zand telt zwaarder dan
verhard pad. Routes worden in beide weergaven getekend.

## Bewerken

Knop **Bewerken** rechtsboven:

- **Verplaats**: sleep punten naar de juiste plek (per weergave apart —
  zo maak je de mapping tussen plattegrond en werkelijkheid).
- **Verbind**: klik twee punten om een pad te maken; kies eerst de ondergrond.
- **Punt +**: klik op de kaart voor een nieuw punt (kruispunt/stage/faciliteit).
- **Verwijder**: klik op een pad of punt.

Bewerkingen worden automatisch bewaard in de browser (localStorage).
**Exporteer** downloadt `mapdata.json`; leg dat bestand in `public/` zodat
je bewerkingen voor alle bezoekers gelden. **Reset** wist je lokale
bewerkingen. Laadvolgorde: localStorage → `public/mapdata.json` → ingebouwde
standaarddata (`src/data/defaultMapData.js`, voorgevuld met de 2026-stages).

De geo-posities zijn een startschatting (lineaire mapping van de plattegrond
op het park); versleep ze in "Echte kaart" naar de werkelijke plekken.
Nieuwe paden krijgen toegankelijk=true behalve bij ondergrond zand; pas dit
zo nodig aan in de geëxporteerde mapdata.json.

## Starten

```bash
npm install
npm run dev      # ontwikkelserver
npm run build    # productie-build in dist/
```

Of dubbelklik op `start-wildeburg.bat` (Windows). De `dist/`-map is statisch
en direct te hosten (Netlify, GitHub Pages, Vercel, eigen server).

De plattegrond staat in `public/plattegrond.jpg` (Wildeburg 2026).

## Bronnen

Stagenamen en toegankelijkheidsinformatie: [wildeburg.nl/info](https://wildeburg.nl/info/).
Plattegrond © Wildeburg.
