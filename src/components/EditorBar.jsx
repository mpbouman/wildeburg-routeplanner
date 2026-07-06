import { SURFACES, SURFACE_LABEL } from '../data/defaultMapData.js';

const TOOLS = [
  ['draw', 'Teken'],
  ['add', 'Punt +'],
  ['delete', 'Verwijder']
];

const HINT = {
  draw: 'Klik van punt naar punt: elke klik maakt een kruispunt + pad. Klik op een bestaand punt of pad om eraan te koppelen. Stoppen: Esc of klik nogmaals op het laatste punt.',
  add: 'Klik op de kaart om een los benoemd punt toe te voegen (type hiernaast).',
  delete: 'Klik op een pad of punt om het te verwijderen; bij een tussenpunt krijg je een keuze.'
};

const HINT_STANDAARD =
  'Sleep punten of paden om ze te verleggen (per kaart apart); ' +
  'dubbelklik op een pad om er een punt in te voegen.';

const ALIGN_HINT =
  'Sleep, zoom of draai de echte kaart onder de punten door; de punten ' +
  'blijven staan en hun geo-posities schuiven mee. Plattegrond blijft ongemoeid.';

export default function EditorBar({
  mode, tool, surface, newType, align,
  onMode, onTool, onAlign, onSurface, onNewType,
  onUndo, canUndo,
  onExport, onImport, onDefaultView, onMerge, onReset
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
      <button className={mode === 'edit' ? 'active' : ''}
        onClick={() => onMode(mode === 'edit' ? 'view' : 'edit')}>
        {mode === 'edit' ? 'Klaar met bewerken' : 'Bewerken'}
      </button>

      {mode === 'edit' && (
        <>
          {TOOLS.map(([id, label]) => (
            <button key={id} className={tool === id ? 'active' : ''}
              onClick={() => onTool(tool === id ? null : id)}>{label}</button>
          ))}

          <button className={align ? 'active' : ''}
            onClick={() => onAlign(!align)}
            title="Echte kaart onder de vaststaande punten door bewegen">
            Kaart uitlijnen
          </button>

          {!align && tool === 'draw' && (
            <select value={surface} onChange={(e) => onSurface(e.target.value)}
              title="Ondergrond van nieuwe paden (bepaalt de loopsnelheid)">
              {SURFACES.map((s) => (
                <option key={s} value={s}>{SURFACE_LABEL[s]}</option>
              ))}
            </select>
          )}

          {!align && tool === 'add' && (
            <select value={newType} onChange={(e) => onNewType(e.target.value)}
              title="Type van nieuwe punten">
              <option value="junction">kruispunt</option>
              <option value="stage">stage</option>
              <option value="facility">faciliteit</option>
            </select>
          )}

          <button onClick={onUndo} disabled={!canUndo}
            title="Laatste bewerking ongedaan maken (ook Ctrl+Z)">
            ↩ Herstel
          </button>

          <span className="hint">{align ? ALIGN_HINT : (HINT[tool] || HINT_STANDAARD)}</span>

          <span className="spacer" />
          <button onClick={onMerge}
            title="Punten die (vrijwel) op elkaar liggen opsporen en samenvoegen; paden worden omgehangen">
            Dubbelen samenvoegen
          </button>
          <button onClick={onDefaultView}
            title="Huidige stand van de echte kaart (positie, zoom en rotatie) wordt de startweergave voor iedereen">
            Zet startweergave
          </button>
          <label className="importBtn" title="Een eerder geëxporteerde mapdata.json inladen">
            Importeer
            <input type="file" accept=".json,application/json"
              onChange={kiesImportBestand} style={{ display: 'none' }} />
          </label>
          <button onClick={onExport} title="Download mapdata.json; leg deze in public/ van het project">
            Exporteer
          </button>
          <button onClick={onReset} className="danger"
            title="Eigen bewerkingen wissen en terug naar de standaarddata">
            Reset
          </button>
        </>
      )}
    </div>
  );
}
