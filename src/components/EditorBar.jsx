import { SURFACES, SURFACE_LABEL } from '../data/defaultMapData.js';

// Gereedschappen: id (tool-waarde), icoon, korte naam, tooltip.
// tool === null is de standaard "Selecteren/verplaatsen"-modus.
const TOOLS = [
  [null, '🖐', 'Selecteren', 'Standaard: sleep punten of paden om ze te verleggen; klik een punt aan om het uit te lichten op beide kaarten.'],
  ['draw', '✏️', 'Teken', 'Klik van punt naar punt: elke klik maakt een kruispunt + pad. Klik op een bestaand punt of pad om eraan te koppelen. Stoppen: Esc.'],
  ['add', '📍', 'Punt', 'Klik op de kaart om een los benoemd punt toe te voegen (kies het type hiernaast).'],
  ['delete', '🗑', 'Verwijder', 'Klik op een pad of punt om het te verwijderen; bij een tussenpunt krijg je een keuze.']
];

const HINT = {
  draw: 'Klik van punt naar punt: elke klik maakt een kruispunt + pad. Klik op een bestaand punt of pad om eraan te koppelen. Stoppen: Esc of klik nogmaals op het laatste punt.',
  add: 'Klik op de kaart om een los benoemd punt toe te voegen (type hiernaast).',
  delete: 'Klik op een pad of punt om het te verwijderen; bij een tussenpunt krijg je een keuze.'
};

const HINT_STANDAARD =
  'Sleep punten of paden om ze te verleggen — op de PLATTEGROND past dat de img-coördinaten aan, op de ECHTE KAART de geo-coördinaten. ' +
  'Dubbelklik op een pad om er een punt in te voegen. Klik een punt aan om het vast te zetten of de rest te schalen.';

const ALIGN_HINT =
  'Sleep, zoom of draai de echte kaart onder de punten door; de punten ' +
  'blijven staan en hun geo-posities schuiven mee. Plattegrond blijft ongemoeid.';

// Kleine iconische knop
function TB({ icon, label, active, disabled, danger, onClick, title }) {
  return (
    <button type="button"
      className={'tbBtn' + (active ? ' active' : '') + (danger ? ' danger' : '')}
      disabled={disabled} onClick={onClick} title={title}>
      <span className="tbIcon" aria-hidden="true">{icon}</span>
      {label && <span className="tbLabel">{label}</span>}
    </button>
  );
}

export default function EditorBar({
  mode, tool, surface, newType, align,
  selNode, hidePlattegrond, preview,
  onMode, onTool, onAlign, onSurface, onNewType,
  onToggleFixed, onScaleRest, onToggleHidePlattegrond, onTogglePreview,
  onUndo, canUndo,
  onExport, onImport, onDefaultView, onMerge, onReset,
  onPublish, publishing
}) {
  function kiesImportBestand(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onImport(String(reader.result));
    reader.readAsText(file);
  }

  return (
    <div className="editorBar">
      <div className="tbGroup">
        <TB icon={mode === 'edit' ? '✓' : '✎'}
          label={mode === 'edit' ? 'Klaar' : 'Bewerken'}
          active={mode === 'edit'}
          onClick={() => onMode(mode === 'edit' ? 'view' : 'edit')}
          title={mode === 'edit' ? 'Bewerken afsluiten' : 'Bewerkmodus openen (plattegrond + echte kaart naast elkaar)'} />
      </div>

      {mode === 'edit' && (
        <>
          {/* Gereedschap */}
          <div className="tbGroup" role="group" aria-label="Gereedschap">
            {TOOLS.map(([id, icon, label, title]) => (
              <TB key={id ?? 'select'} icon={icon} label={label}
                active={tool === id}
                onClick={() => onTool(id)}
                title={title} />
            ))}
          </div>

          {/* Contextuele keuze bij het actieve gereedschap */}
          {!align && (tool === 'draw' || tool === 'add') && (
            <div className="tbGroup">
              {tool === 'draw' && (
                <select value={surface} onChange={(e) => onSurface(e.target.value)}
                  title="Ondergrond van nieuwe paden (bepaalt de loopsnelheid)">
                  {SURFACES.map((s) => (
                    <option key={s} value={s}>{SURFACE_LABEL[s]}</option>
                  ))}
                </select>
              )}
              {tool === 'add' && (
                <select value={newType} onChange={(e) => onNewType(e.target.value)}
                  title="Type van nieuwe punten">
                  <option value="junction">kruispunt</option>
                  <option value="stage">stage</option>
                  <option value="facility">faciliteit</option>
                </select>
              )}
            </div>
          )}

          {/* Geselecteerd punt: vastzetten */}
          <div className="tbGroup" role="group" aria-label="Geselecteerd punt">
            <TB icon={selNode && selNode.fixed ? '📌' : '📍'}
              label={selNode && selNode.fixed ? 'Vast' : 'Vastzetten'}
              active={!!(selNode && selNode.fixed)}
              disabled={!selNode}
              onClick={onToggleFixed}
              title={selNode
                ? 'Zet het geselecteerde punt vast als ankerpunt (blijft staan bij "Schaal rest")'
                : 'Selecteer eerst een punt (klik het aan in de Selecteren-modus)'} />
          </div>

          {/* Plattegrond op schaal brengen + kaart uitlijnen */}
          <div className="tbGroup" role="group" aria-label="Plattegrond">
            <TB icon="🧮" label="Schaal rest"
              onClick={onScaleRest}
              title="Warp de plattegrond-posities (img) van de NIET-vaste KRUISPUNTEN lokaal naar hun echte-wereldvorm (geo), verankerd op de vaste punten (die blijven exact staan). Stages en faciliteiten blijven ongemoeid. Minstens 2 vaste ankers nodig, idealiter 3+." />
            <TB icon="🧭" label="Kaart uitlijnen" active={align}
              onClick={() => onAlign(!align)}
              title="Echte kaart onder de vaststaande punten door bewegen (geo-posities schuiven mee)" />
          </div>

          {/* Weergave / bezoekersvlag */}
          <div className="tbGroup" role="group" aria-label="Weergave">
            <TB icon={hidePlattegrond ? '🙈' : '👁'}
              label="Verberg netwerk"
              active={!!hidePlattegrond}
              onClick={onToggleHidePlattegrond}
              title="Voor bezoekers op de plattegrond: verberg het ruwe navigatienetwerk (kruispunten + paden); alleen de actieve route blijft zichtbaar. In de editor blijft alles zichtbaar." />
            <TB icon={preview ? '📱' : '🔍'}
              label="Voorbeeld app"
              active={!!preview}
              onClick={onTogglePreview}
              title="Toon de plattegrond zoals de companion-app 'm straks laat zien: alleen klikbare puntjes, zonder paden en zonder namen. De echte kaart blijft gewoon bewerkbaar." />
          </div>

          <div className="tbGroup">
            <TB icon="↩" label="Herstel" disabled={!canUndo}
              onClick={onUndo}
              title="Laatste bewerking ongedaan maken (ook Ctrl+Z)" />
          </div>

          <span className="spacer" />

          {/* Kaart-data & startweergave */}
          <div className="tbGroup" role="group" aria-label="Data">
            <TB icon="⊹" label="Dubbelen"
              onClick={onMerge}
              title="Punten die (vrijwel) op elkaar liggen opsporen en samenvoegen; paden worden omgehangen" />
            <TB icon="⌂" label="Startweergave"
              onClick={onDefaultView}
              title="Huidige stand van de echte kaart (positie, zoom en rotatie) wordt de startweergave voor iedereen" />
            <label className="tbBtn importBtn" title="Een eerder geëxporteerde mapdata.json inladen">
              <span className="tbIcon" aria-hidden="true">📂</span>
              <span className="tbLabel">Importeer</span>
              <input type="file" accept=".json,application/json"
                onChange={kiesImportBestand} style={{ display: 'none' }} />
            </label>
            <TB icon="💾" label="Exporteer"
              onClick={onExport}
              title="Download mapdata.json; leg deze in public/ van het project" />
            <TB icon="⟲" label="Reset" danger
              onClick={onReset}
              title="Eigen bewerkingen wissen en terug naar de standaarddata" />
            <TB icon="🚀" label={publishing ? 'Bezig…' : 'Publiceer'}
              disabled={publishing}
              onClick={onPublish}
              title="Huidige editor-kaart direct live zetten voor alle bezoekers van de companion" />
          </div>

          <span className="hint">{align ? ALIGN_HINT : (HINT[tool] || HINT_STANDAARD)}</span>
        </>
      )}
    </div>
  );
}
