# EDITOR-HANDOFF — Wildeburg routeplanner-editor tunen

*Plak dit als eerste bericht in een verse Claude Code-sessie in deze map, of zeg:
"Lees `EDITOR-HANDOFF.md` en volg dat."*

Je gaat de **editor van de Wildeburg-routeplanner** verder afstemmen (de `?editor`-modus:
paden/knooppunten tekenen + de plattegrond indelen). Dit is een **losstaand
werkspoor** — de companion-app (aparte repo `wildeburg-companion`) staat hier los van;
raak die niet aan.

---

## 0. HARDE GUARDRAILS (de live editor moet veilig blijven)

- De routeplanner draait **live** op GitHub Pages, gebouwd vanaf **`main` → `/docs`**.
- Er is al een branch **`editor-revamp`** met de nieuwe editor. **Werk ALLEEN op die branch.**
  - **NOOIT** naar `main` committen, **NOOIT** `/docs` aanraken of herbouwen, **NIET pushen**
    tot Mick de nieuwe versie goedkeurt.
  - Geen destructieve git (`reset --hard`, `clean`, `checkout -- .`). Committen naar de
    branch mag (checkpoints zijn goed).
- **Breek het `mapdata.json`-schema niet.** De companion haalt dit bestand **live** op van
  de routeplanner-Pages, dus het moet achterwaarts compatibel blijven. Je mag **velden
  toevoegen** (zoals `node.fixed`, `meta.hidePlattegrondNetwork`) maar niets verwijderen/hernoemen.
- Draaien/testen: `npm run dev` (Vite) → open **`http://localhost:5173/?editor`**
  (of `:5188` via `.claude/launch.json`) → klik **"Bewerken"**. `npm install` eerst als
  `node_modules` mist (Dropbox-map: bij lock-gedoe niet eindeloos vechten, meld het).

---

## 1. Git-staat (bij het schrijven)

Branch **`editor-revamp`**, t.o.v. `main` (live = `a209c32`):

```
bb8cc37 Schaal rest: lokale interpolatie-warp i.p.v. rigide similarity-snap
358c03c Editor-revamp: gegroepeerde iconische toolbar + vaste punten/Schaal rest
914408b vangnet: routeplanner WIP (prototype-nav + ontwerp-styling) voor editor-revamp
```

- `914408b` = **vangnet** met Micks eigen WIP van vóór de revamp (NavigatiePrototype.jsx,
  OntwerpViewer.jsx, ontwerp.css, fonts, route.js). **Dat is NIET de editor-revamp** — laat
  die met rust tenzij nodig.
- De **editor-revamp zelf** zit in `358c03c` + `bb8cc37` en raakt: `src/App.jsx`,
  `src/components/EditorBar.jsx`, `src/components/GraphMap.jsx`, `src/styles.css`.
- Check altijd even `git log --oneline main..HEAD` voor de actuele stand.

---

## 2. Wat er al staat (de revamp)

Editormodus = `?editor` in de URL → knop **"Bewerken"** → **twee-pane-weergave**
(Plattegrond naast Echte kaart), met bovenin de nieuwe toolbar.

1. **Gegroepeerde iconische toolbar** (`src/components/EditorBar.jsx`, styles `.tbGroup`/`.tbBtn`/
   `.tbIcon`/`.tbLabel` in `src/styles.css`) i.p.v. de oude losse tekstknoppen. Groepen o.a.:
   *Gereedschap* (Selecteren / Teken / Punt / Verwijder), *Geselecteerd punt* (Vastzetten),
   *Plattegrond* (Schaal rest / Verberg netwerk / Kaart uitlijnen), *Data* (Dubbelen /
   Startweergave / Importeer / Exporteer / Reset). Er is een expliciete **Selecteren**-tool
   (`tool=null`).
2. **Per-ruimte lijn-editing**: de twee panes hebben labels **"Plattegrond · img [x,y]"** en
   **"Echte kaart · geo [lng,lat]"** (`.spaceLabel` CSS). Een punt op de **plattegrond** slepen
   past `node.img` aan; op de **echte kaart** past `node.geo` aan (die logica bestond al via
   `onMoveNode(id, coords, space)` in `App.jsx`).
3. **Verberg netwerk** (`toggleHidePlattegrond()` in `App.jsx`): zet `meta.hidePlattegrondNetwork`
   (boolean) in de data. In de editor blijft de graaf zichtbaar; alleen de vlag wordt opgeslagen.
   ⚠️ De **companion die deze vlag respecteert** (padennetwerk verbergen voor bezoekers, alleen
   de route tonen) is **nog niet gebouwd** — dat is companion-werk, niet dit spoor.
4. **Vaste punten** (`toggleFixed()` in `App.jsx`): zet `node.fixed` op het geselecteerde punt
   ("Vastzetten"/"Vast"; blauwe ring `mk-fixed` in `GraphMap.jsx` + CSS). Punt-niveau is bewust
   (Mick: punten definiëren de lijnstukken, dus segment-vast is niet nodig).
5. **"Schaal rest"** (`scaleRest()` in `App.jsx`) — een **lokale interpolatie-warp**:
   - **Ankers = de vaste punten** (`node.fixed`). Er mag veel vastliggen; hele vaste stukken
     blijven exact.
   - **Alleen niet-vaste WÉG-punten morfen** (`node.type === 'junction' && !node.fixed`). Podia
     (stages) en faciliteiten blijven staan (die liggen al goed).
   - **Methode**: globale similarity-fit `T: geo→img` (uit alle ankers, hergebruikt
     `fitImgGeo` uit `src/lib/fit.js`) + **afstand-gewogen residu-correctie**:
     `new_img = T(geo) + Σ(wᵢ·rᵢ) / Σwᵢ`, met `rᵢ = anker.img − T(anker.geo)` en
     `wᵢ = 1/(afstand² + ε)` in **echte meters** (lng geïsotropiseerd met `cos(lat)`, zoals `fit.js`).
   - Eigenschappen: **exact op ankers** (op een anker verschuift niets), **lokaal** (dichtbij
     domineert), glad. Alleen `img` verandert; `geo` blijft de waarheid. **Ctrl+Z draait 't terug**
     (het is een gewone `setData`). Vereist ≥2 ankers (melding anders).

---

## 3. Knoppen om aan te draaien (waarschijnlijk je tuning)

- **`scaleRest` lokaliteit** — nu weegt afstand kwadratisch (`1/dist²`) in `warp()` binnen
  `scaleRest()` (`App.jsx`). **Hogere macht** (`1/dist³/⁴`) = strakker lokaal / scherpere grens;
  **lagere** = vloeiender over grotere afstand. Dit is dé knop als het morf-gedrag te globaal of
  te lokaal voelt.
- **Welke punten morfen** — nu `type==='junction'`. Wil je ook faciliteiten laten meebewegen,
  pas het filter in `scaleRest()` aan.
- **Toolbar-indeling / iconen / labels** — `EditorBar.jsx` + `.tbGroup`/`.tbBtn` in `styles.css`.
  (Nu emoji/unicode-iconen, geen icon-library; wil je een echte icon-set, dat kan.)
- **Vaste-punt-visual** — `.mk-fixed` (blauwe ring) in `GraphMap.jsx` + `styles.css`.
- **Kaartbases in de editor** — PDOK-luchtfoto / Esri / OSM in de `geoStyle` in `GraphMap.jsx`
  (allemaal keyless).

---

## 4. Belangrijkste bestanden

| Bestand | Wat |
|---|---|
| `src/App.jsx` | Editor-state; `scaleRest`, `toggleFixed`, `toggleHidePlattegrond`, de twee-pane-weergave + labels, undo-history (`histRef`, Ctrl+Z), import/export. |
| `src/components/EditorBar.jsx` | De toolbar. |
| `src/components/GraphMap.jsx` | De MapLibre-kaart per ruimte (`space="img"` plattegrond / `space="geo"` echt); knoop-markers (`.mk`, `.mk-*`), edges/route. |
| `src/lib/fit.js` · `geo.js` | De img↔geo-fit (`fitImgGeo`, gelijkvormigheid, complexe kleinste-kwadraten) — hergebruikt door `scaleRest`. |
| `src/styles.css` | Toolbar- + marker-stijlen. |
| `public/mapdata.json` (+ `docs/mapdata.json`) | De data (knopen met img/geo/fixed, edges, meta). |

---

## 5. mapdata.json-schema (achterwaarts compatibel houden)

- **node**: `{ id, name, type: "junction"|"stage"|"facility", info?, img:[x,y] (in 728×993),
  geo:[lng,lat], fixed?: boolean }`
- **edge**: `{ a, b, surface, toegankelijk }`
- **meta**: `{ imgFile, imgW:728, imgH:993, bearing:-121.2, center, zoom, base, hidePlattegrondNetwork?: boolean }`
- 119 knopen / 129 edges. Let op: `img` is **y-omlaag**, native 728×993. **~11 knopen liggen
  losgekoppeld** in de graaf (o.a. het Wildlive-podium heeft nul edges) — dat is bekend; de
  companion vangt onbereikbare bestemmingen op met een pijl-terugval.

---

## 6. Publiceren (bewust, pas als Mick tevreden is)

De live site = `main`/`docs`. Publiceren = **branch → `main` → `npm run build` (bouwt naar
`/docs`) → committen → pushen**. **Doe dit niet zomaar** — het gaat direct live. Laat Mick 't
zeggen. (Vite bouwt naar `/docs`; `npm run build` overschrijft dus de live output.)

---

## 7. Buiten scope / context

- De **companion-app** (`../wildeburg-companion`, apart) haalt `mapdata.json` **live** op van de
  routeplanner-Pages (`https://mpbouman.github.io/wildeburg-routeplanner/mapdata.json`), dus
  mapdata-wijzigingen in de editor stromen vanzelf door. Raak de companion-repo niet aan.
- De **companion die `meta.hidePlattegrondNetwork` respecteert** = companion-werk, niet hier.
- De **"gebieden/areas"-feature** (cirkel/ellipse als beloopbaar gebied) is **geschrapt** (te veel
  moeite) — niet bouwen tenzij Mick 't opnieuw vraagt.
- Bredere projectcontext: de companion-handoffs in `C:\Users\dyn1015\Downloads\Wildeburg 2026\`
  (`HANDOFF-joint-app-v2.md`).

---

## 8. Eerste stap voor de oppakkende sessie

1. `git -C . branch --show-current` → moet **`editor-revamp`** zijn (zo niet: `git checkout
   editor-revamp`, nooit main).
2. `npm run dev` → `http://localhost:5173/?editor` → **Bewerken**.
3. Test-flow "Schaal rest": zet een paar wég-punten **Vastzetten** → **Schaal rest** → kijk of
   het morf-gedrag klopt; **Ctrl+Z** draait terug.
4. Tune wat Mick vraagt (§3), commit naar `editor-revamp`, **niet pushen/publiceren**.
