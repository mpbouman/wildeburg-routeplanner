# HANDOFF — Wildeburg Routeplanner

Dit document is bedoeld voor een AI (of ontwikkelaar) die dit project overneemt.
Lees eerst dit hele document, daarna de code. De eigenaar is Mick (Nederlandstalig).

## 1. Wat is dit project

Een React-webapp waarmee bezoekers van festival **Wildeburg** (natuurpark Netl,
Leemringweg 19, Kraggenburg, NL) de snelste looproute naar een stage vinden.
De route wordt geplot op twee kaarten:

1. **Plattegrond**: de officiële Wildeburg 2026 festivalplattegrond
   (`public/plattegrond.jpg`, 728×993 px). Belangrijk: deze plattegrond is
   **bewust topologisch correct maar geometrisch onjuist** (artistieke kaart,
   niet op schaal). Een affine overlay op de echte kaart past dus nooit exact.
2. **Echte kaart**: MapLibre GL met OSM-rastertegels of Esri-satelliet.

Daarom heeft elk punt in het netwerk **twee onafhankelijke posities**:
`img: [x, y]` (pixels op de plattegrond) en `geo: [lng, lat]` (echte wereld).
De paden-topologie (edges) is gedeeld. **Afstanden/looptijden worden altijd
berekend uit de geo-posities** (haversine), nooit uit de plattegrond.

## 2. Locatie en draaien

- Projectmap: `C:\Users\dyn1015\Dropbox\Dynaflow\Claude code folder\wildeburg-routeplanner`
- Starten: dubbelklik `start-wildeburg.bat` (draait `npm install` + `npm run dev -- --open`, poort 5173)
- Build: `npm run build` → statische site in `dist/`
- Stack: Vite 5 + React 18 + maplibre-gl ^4.7 (geen andere dependencies)

**Let op — Dropbox-valkuilen (Windows):**
- `vite.config.js` heeft `cacheDir` in `%TEMP%` (`vite-cache-wildeburg`) omdat
  Dropbox anders bestanden in `node_modules/.vite` lockt → EBUSY-fouten.
  Dit zo laten.
- Advies aan gebruiker: `node_modules` in Dropbox op "negeren" zetten.

## 3. Huidige architectuur (v2.1, werkend)

```
src/
  App.jsx                  state + mutaties (nodes/edges), tabs Plattegrond|Echte kaart
  main.jsx                 entry, importeert maplibre-gl css
  styles.css               donkergroen thema, marker-styling (.mk-*)
  components/
    GraphMap.jsx           generiek MapLibre-component, prop space='geo'|'img'
    RoutePanel.jsx         vertrekpunt/stage-keuze, looptijd, zand-waarschuwing
    EditorBar.jsx          tools: Verplaats/Verbind/Punt+/Verwijder, export/reset
  lib/
    geo.js                 haversineM; IMG_K (img-px ↔ fake lng/lat voor weergave);
                           affiene startmapping img↔geo (rotatie 78°, 0,87 m/px)
                           + DEFAULT_BEARING (282°, plattegrond-stand)
    route.js               Dijkstra op tijd; SPEED per ondergrond
    store.js               laadvolgorde localStorage > public/mapdata.json > defaults;
                           autosave localStorage (sleutel wildeburg-mapdata-v2);
                           export = download mapdata.json
  data/
    defaultMapData.js      voorgevuld netwerk 2026: 26 nodes, 34 edges;
                           geo-posities ONDERZOCHT (zie §4), niet meer geschat
public/plattegrond.jpg     officiële plattegrond Wildeburg 2026 (728×993)
```

Datamodel (ook het formaat van geëxporteerde `mapdata.json`):

```json
{
  "meta": { "imgFile": "plattegrond.jpg", "imgW": 728, "imgH": 993, "bearing": 282 },
  "nodes": [{ "id": "kas", "name": "Kas & De Spot", "type": "stage|facility|junction",
              "info": "...", "img": [385, 407], "geo": [5.88078, 52.68263] }],
  "edges": [{ "a": "kas", "b": "budxlodge", "surface": "verhard", "toegankelijk": true }]
}
```

Ondergronden + loopsnelheid (m/min): verhard 80, rijplaten 72, gras 62,
onverhard 55, zand 38. (`toegankelijk` op edges verdwijnt bij het herontwerp,
zie beslissing 14/15.)

Techniek plattegrond-weergave: de afbeelding staat als MapLibre `image`-source
in een kunstmatige geo-ruimte: `lng = x * 0.0001`, `lat = -y * 0.0001`
(zie `IMG_K` in geo.js). Markers zijn `maplibregl.Marker` met div-elementen.
Edges en route zijn GeoJSON-sources met line-layers.

## 4. Geo-posities: onderzocht en geplaatst (juli 2026)

De geo-posities in `defaultMapData.js` zijn NIET meer de oude lineaire
schatting maar het resultaat van terreinonderzoek (satellietbeeld Esri,
OpenStreetMap/Overpass, BAG-pandcontouren via PDOK):

- **Ankers**: Kas & De Spot = het BAG-pand van 1216 m² (bouwjaar 2020) op
  52.68263 N, 5.88078 O — de grote glazen kas midden in het bamboebos
  (grootste bamboebos van de Benelux, permanent onderdeel van Netl).
  Eiland = eilandengroep in het meer (52.6828 N, 5.8838 O).
- **Transformatie**: gelijkvormigheid (rotatie ≈ 78°, schaal ≈ 0,87 m/px).
  De plattegrond is getekend met het **westen grofweg boven**; de echte kaart
  hoort in stand `bearing ≈ 282°` om beide gelijk te richten (staat in
  `meta.bearing` en `DEFAULT_BEARING` in geo.js).
- **Handmatig op terrein gelegd**: Strand (zandvlakte zuidwest van bamboebos),
  Vuurtorenstrand (oostoever meer, bij de tipi). Overige punten volgen de
  affiene mapping; onzekerheid ± 30–80 m. Mick verfijnt door slepen.
- Herkenningspunten omgeving: paviljoen Brennels Buiten 52.68349/5.88254,
  parkeerterrein 52.6839/5.8811, helikopter-speeltoestel 52.68207/5.87762,
  MIG-straaljager (NO-hoek) 52.68637/5.88343, camping Kallumaan (chalets)
  52.684–52.686 / 5.878–5.883. Handig als extra ijkpunten.
- localStorage-sleutel is bewust opgehoogd naar `wildeburg-mapdata-v2` zodat
  oude (foute) v1-data genegeerd wordt. Beslissing Mick: oude bewerkingen
  hoeven niet gemigreerd te worden.

## 5. DE OPDRACHT: herontwerp (alle ontwerpvragen zijn beantwoord)

Interview met Mick afgerond op 6 juli 2026. Alle beslissingen:

**Structuur & fasen**
1. Editor (bouwfase): **twee kaarten zij aan zij** met versleepbare splitter;
   na verslepen `map.resize()` op beide.
2. Navigatie tussen kaarten onafhankelijk, met **sync-knop** ("centreer andere
   kaart hier").
3. Routepaneel: linker sidebar, inklapbaar.
4. Publieksversie (online fase): **één kaart tegelijk**, routeplanner-overlay,
   wisselen van kaarttype (plattegrond/OSM/satelliet).
5. Eén codebase; **geen zichtbare bewerkknop** voor bezoekers. Editor bereikbaar
   via URL-parameter (bijv. `?editor`), óók op de gehoste site.

**Online opslag & publiceren (nieuw, belangrijk)**
6. Mick wil **tijdens het festival vanaf zijn iPad** wijzigingen doorvoeren die
   iedereen ziet (laptop niet beschikbaar). Gekozen: **GitHub-repo + GitHub
   Pages**; mapdata wordt gelezen uit de repo en de editor schrijft via de
   GitHub-API met een fine-grained token (eenmalig invoeren op het apparaat,
   bewaard in localStorage). Mick heeft al een GitHub-account.
7. Publiceren via een **aparte "Publiceer"-knop** (lokaal werken, bewust live
   zetten; elke publicatie = commit = terugdraaibare versie).
8. **Volledige editor moet op touch/iPad werken** (sleep-acties krijgen waar
   nodig tik-alternatieven; op smalle schermen één kaart met wisselknop).

**Rotatie**
9. Rotatie dient om de echte kaart **eenmalig goed te oriënteren** t.o.v. de
   plattegrond; beginstand 282° staat al klaar. De gekozen stand wordt
   **opgeslagen in de kaartdata en geldt ook voor bezoekers** (kompasknop om
   naar noord te draaien blijft). GEBOUWD: knop **"Zet startweergave"** in de
   EditorBar slaat center/zoom/bearing van de echte kaart op in `meta`;
   GraphMap initialiseert daarmee. Ook GEBOUWD: **Importeer-knop** (mapdata.json
   terugladen) en **PDOK-luchtfoto** als standaard-onderlaag (WMTS
   Actueel_orthoHR EPSG:3857, scherper/actueler dan Esri, mét rotatie —
   laagkeuze via select: PDOK / Esri / OSM).

**Publieksversie**
10. **Mobiel eerst** ontwerpen (bezoekers staan met hun telefoon op het terrein).
11. **GPS als standaard vertrekpunt** ("Vanaf mijn locatie", dichtstbijzijnde
    netwerkpunt), mét de optie om handmatig een ander vertrekpunt te kiezen.
    Blauwe stip ook (omgerekend, benaderd) op de plattegrond.
12. Startkaart bezoekers: **onthouden per bezoeker** (eerste keer plattegrond,
    daarna de laatst gekozen weergave).

**Editor-gedrag**
13. Punten/paden in de ene kaart verschijnen **pro forma** in de andere
    (via de affiene mapping; beter: affiene fit op reeds in beide ruimtes
    geplaatste punten). Pro-forma-punten krijgen een afwijkende markerstijl
    tot ze versleept zijn (vlaggen `imgPlaced`/`geoPlaced` per node).
14. **Toegankelijkheidsfunctie verwijderen** (vinkje, vlag en filter) — niet
    relevant voor Mick. In plaats daarvan krijgt elk pad een **`gesloten`-vlag**:
    afgesloten paden tellen niet mee in de routering en tonen gestippeld/rood
    in de editor (typisch iPad-festivalscenario).
15. Eigenschappen wijzigen via een **apart "Eigenschappen"-gereedschap**
    (klik/tik opent paneeltje: ondergrond, gesloten, verwijderen; bij punten
    naam/type/info).
16. Knooppunt invoegen op een lijn: **klikken én slepen** — GEBOUWD (6 juli):
    het bewerkmodel is nu **modeloos**: geen gereedschap actief = punten én
    lijnen standaard beetpakbaar (lijn oppakken = splitsen + meeslepen met
    preview, Google Maps-stijl; dubbelklik op lijn = punt invoegen; ondergrond
    wordt overgeërfd). De knop "Verplaats" is vervallen; actieve tool nogmaals
    aanklikken zet hem uit. Met Teken actief splitst een klik op een bestaand
    pad dat pad en koppelt de ketting eraan. Verwijderen van een punt met
    precies 2 paden geeft een keuzepopup: alleen tussenpunt (buren verbonden
    met ondergrond van het langste segment) of punt + paden (keten verbreken);
    bij 3+ paden een bevestiging. Startweergave (meta.center/zoom/bearing) is
    altijd terug te laden via het "⌂ Start"-knopje op de echte kaart, in
    editor- én bezoekersmodus.
    Verfijningen (6 juli, ronde 2):
    - **Lijnsplitsing is per kaart onafhankelijk**: bij het splitsen/verleggen
      van een lijn komt het nieuwe punt in de ANDERE kaart exact op de lijn a–b
      (interpolatie op fractie t in `splitEdgeAt`), zodat die kaart niet
      meebuigt; daarna versleep je het punt daar apart. (Bewezen: afstand van
      het nieuwe punt tot lijn a–b in de andere ruimte = 0.)
    - **Dubbelklik op een punt = verwijderen** (met hetzelfde keuzemenu bij een
      tussenpunt), in standaardmodus.
    - **Selectie → pad**: een geselecteerd punt + klik op een lege plek (niet op
      een lijn) maakt een nieuw kruispunt daar met een pad ernaartoe; het
      nieuwe punt blijft geselecteerd zodat je kettinggewijs door kunt bouwen.
      Deselecteren met Esc of nogmaals op het punt klikken.
    - **Slepen mag ook in de verwijdermodus**: klik = verwijderen, slepen =
      punt/lijn verleggen (marker `draggable` en `edgeDragStart` staan de
      delete-tool nu toe).
    - Bewaakt met `suppressClick` (lijnsleep mag geen extra 'leeg'-punt maken)
      en een `queryRenderedFeatures`-check op 'edges-layer' (klik op een lijn
      telt niet als lege klik).
17. **Elke bocht is een knooppunt** (geen vormpunten in lijnen).
18. Tekenen: **doorteken-modus is dé tekentool** ("Teken" — GEBOUWD): elke
    klik maakt kruispunt + pad, klik op bestaand punt koppelt/start, zelfde
    punt nogmaals of Esc stopt, daarna elders verder. De losse "Verbind"-tool
    is vervallen (Mick, 6 juli); "Punt +" bestaat nog voor losse benoemde
    punten. Let op: de ketting loopt via chainRef (synchroon) omdat snelle
    kliks anders binnen één render dezelfde stale state lezen.
19. **Snappen op punten** binnen ~12 px (niet op lijnen).
20. **Live meters** (en looptijd) tonen bij tekenen/slepen, alleen op de echte
    kaart.
21. **Undo/redo** (Ctrl+Z/Y + knoppen voor iPad).
22. Loopsnelheden **vast in code**.
23. Standaard onderlaag echte kaart in de editor: **satelliet**.
24. Voorgevuld netwerk blijft het startpunt (met de onderzochte posities).

## 6. Implementatieplan (fasen)

- **Fase 0 — KLAAR**: geo-posities onderzocht en in defaultMapData gezet;
  affiene startmapping + DEFAULT_BEARING in geo.js; localStorage-sleutel → v2.
  Nog te doen door Mick: visueel controleren en punten fijnslepen (kan al in
  de huidige app, tab "Echte kaart" + satelliet).
- **Fase A — datamodel & fundament — DEELS KLAAR**: `lib/fit.js` bestaat
  (gelijkvormigheidsfit img↔geo over alle punten; gebruikt door addNode voor
  grosso modo-spiegeling naar de andere kaart). NOG TE DOEN:
  `imgPlaced`/`geoPlaced`-vlaggen, `gesloten` op edges, toegankelijk-veld
  verwijderen, history (undo/redo).
  Extra beslissingen Mick (6 juli): voorgevulde verbindingen zijn LEEG gemaakt
  (hij tekent de paden zelf op de echte kaart; localStorage-sleutel → v3);
  looppaden krijgen ÉÉN kleur (geen kleur per ondergrond; EDGE_COLOR in
  GraphMap.jsx). Er is een **uitlijn-modus** ("Kaart uitlijnen" in de
  EditorBar): pan/zoom/rotatie van de echte kaart beweegt de kaart ONDER de
  op het scherm vastgezette punten door; bij loslaten worden alle geo-posities
  in één keer gecommit (img blijft staan). Zit in GraphMap.jsx (align-effect:
  schermposities bevriezen via project/unproject, commit op moveend).
- **Fase B — editor zij aan zij — DEELS KLAAR**: bewerkmodus toont nu twee
  GraphMaps naast elkaar met versleepbare splitter (ResizeObserver →
  map.resize() zit in GraphMap); echte kaart is draaibaar (kompas, start op
  meta.bearing 282°); satelliet is standaard-onderlaag (ook direct bij load
  gezet — let op: de zichtbaarheids-effect draait vóór map-load, daarom staat
  dezelfde switch óók in de load-handler). NOG TE DOEN: inklapbare sidebar,
  sync-knop, bearing opslaan bij draaien, `?editor`-routing, touch-verfijning.
- **Fase C — tekeninteracties**: doorteken-modus + snappen + live meters,
  knooppunt op lijn (klik + sleep, met tik-alternatief op touch), pro-forma-
  markers, eigenschappen-gereedschap.
- **Fase D — GitHub-opslag**: mapdata lezen uit repo (cache-busting),
  Publiceer-knop (GitHub Contents API, fine-grained token in localStorage,
  eenmalige invoer), conflictregel "laatst gepubliceerd wint", export/import
  als backup behouden.
- **Fase E — publieksversie**: mobiel-eerst viewer (kaart beeldvullend,
  paneel onderin), GPS-vertrekpunt + blauwe stip (ook benaderd op plattegrond),
  kaartkeuze onthouden, opgeslagen bearing toepassen.
- **Fase F — afronding**: GitHub-repo + Pages inrichten (Mick heeft account),
  iPad-test op het terrein-scenario, HANDOFF/README bijwerken.

## 7. Implementatiehints

- Zij aan zij: twee `<GraphMap>`-instanties (space="img" en space="geo") in een
  flex-container; splitter versleepbaar; `map.resize()` na elke maatwijziging.
- Rotatie: MapLibre native — `dragRotate`, `touchZoomRotate`,
  `NavigationControl({ showCompass: true })`; `bearing` bij init uit meta.
- Lijn slepen → knooppunt invoegen: `mousedown`/`touchstart` op de edge-layer,
  `map.dragPan.disable()`, preview op move, op release edge a–b vervangen door
  a–nieuw en nieuw–b (ondergrond overerven), nieuwe node krijgt geschatte
  positie in de andere ruimte + `…Placed: false`.
- GitHub-API: `PUT /repos/{owner}/{repo}/contents/mapdata.json` met base64-
  inhoud + laatste blob-sha; lezen via de Contents-API of raw-URL met
  `?t=Date.now()` tegen CDN-cache. Fine-grained token met alléén
  contents:read/write op deze ene repo.
- De vraag-dialoog (AskUserQuestion) werkte in deze omgeving wél; bij crashes:
  vragen gewoon in chattekst stellen.
- localStorage-sleutel bij toekomstige datamodel-wijzigingen opnieuw ophogen.

## 8. Bronnen

- Stage-/terreininfo: https://wildeburg.nl/info/ en https://www.netl.nl/
- Plattegrond 2026: aangeleverd door Mick (origineel: `Downloads/Wildeburg2026.jpg`)
- Festival 2026: 9–12 juli, terrein Netl de Wildste Tuin, Kraggenburg
- Geo-onderzoek: Esri World Imagery (export-API), OSM Overpass, PDOK BAG WFS
