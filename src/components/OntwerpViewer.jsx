import { useMemo, useState } from 'react';
import GraphMap from './GraphMap.jsx';
import { metersPerOndergrond } from '../lib/route.js';
import { SURFACE_LABEL, SURFACES } from '../data/defaultMapData.js';
import { haversineM } from '../lib/geo.js';
import '../ontwerp.css';

// kleur per ondergrond — de "lijnkleuren" van de wegwijzer
const SURF_COLOR = {
  verhard: '#75817d',
  rijplaten: '#b3bdbd',
  gras: '#bfd8b4',
  onverhard: '#dcc19c',
  zand: '#c2492f'
};

function Octopus() {
  // handgetekende lijn-octopus (huisstijl-mascotte 2026)
  return (
    <svg className="octo" width="66" height="60" viewBox="0 0 66 60" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 33 C15 16 51 16 51 33" />
      <path d="M15 33 q-4 9 1 16 M24 35 q-3 10 1 17 M33 36 q0 10 0 17 M42 35 q3 10 -1 17 M51 33 q4 9 -1 16" />
      <circle cx="27" cy="30" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="39" cy="30" r="2.1" fill="currentColor" stroke="none" />
      <path d="M29 37 q4 3 8 0" />
    </svg>
  );
}

function fmtMin(min) {
  if (min == null) return '–';
  return min < 1 ? 0 : Math.round(min);
}

export default function OntwerpViewer({
  data, route, gps, userPos, view, base, start, doel, effStart, imgNamen,
  onStart, onDoel, onView, onBase, onToggleNamen, onNavigeer, mapProps
}) {
  const [expanded, setExpanded] = useState(false);
  const [picker, setPicker] = useState(null); // null | 'doel' | 'start'
  const [pick, setPick] = useState(null);     // kaart-kies: null | 'start' | 'doel'

  const nodeById = useMemo(
    () => Object.fromEntries(data.nodes.map((n) => [n.id, n])), [data]);
  const benoemd = useMemo(
    () => data.nodes.filter((n) => n.type !== 'junction'), [data]);

  const doelNode = nodeById[doel];
  const heeftDoel = !!(doelNode && doelNode.type !== 'junction');
  const routeGevonden = !!(route && route.found && heeftDoel);

  // doel ligt niet aan het netwerk: route liep naar de dichtstbijzijnde knoop,
  // de rest wijst alleen een pijl. arrowOnly = er valt niets te lopen.
  const off = !!(route && route.offNetwork && heeftDoel);
  const walkM = routeGevonden ? Math.round(route.totalMeters) : 0;
  const rest = off ? Math.round(route.restMeters || 0) : 0;
  const arrowOnly = off && walkM < 15;
  // navigeren kan zodra er een te lopen pad is (ook naar de dichtstbijzijnde
  // knoop bij een doel buiten het netwerk)
  const kanNavigeren = routeGevonden && route.path && route.path.length > 1;

  const min = routeGevonden ? route.totalMinutes : null;
  const meters = routeGevonden ? Math.round(route.totalMeters) : null;
  const perSurface = routeGevonden ? metersPerOndergrond(route.legs) : {};
  const zand = Math.round(perSurface.zand ?? 0);
  const totaalM = Object.values(perSurface).reduce((s, m) => s + m, 0) || 1;

  // vertrekpunt: label + coördinaat voor het sorteren van de kiezer
  const startNode = nodeById[effStart];
  const startCoord = (userPos && gps === 'ok' ? userPos.geo : startNode?.geo) || null;
  const startLabel =
    start === '__gps'
      ? (gps === 'ok' ? '📍 hier' : '📍 mijn locatie')
      : (nodeById[start]?.name || 'Entree');

  // haltes onderweg = benoemde punten waar de route langskomt
  const haltes = useMemo(() => {
    if (!routeGevonden) return [];
    return route.legs
      .map((l) => nodeById[l.to])
      .filter((n) => n && n.type !== 'junction' && n.id !== doel)
      .map((n) => n.name);
  }, [route, routeGevonden, nodeById, doel]);

  // kiezer-lijst, dichtstbij eerst (hemelsbreed)
  const kiezerlijst = useMemo(() => {
    const arr = benoemd.map((n) => ({
      node: n,
      afst: startCoord ? haversineM(startCoord, n.geo) : 0
    }));
    arr.sort((a, b) => a.afst - b.afst);
    return arr;
  }, [benoemd, startCoord]);

  function kiesDoel(id) { onDoel(id); setPicker(null); setExpanded(false); }
  function kiesStart(id) { onStart(id); setPicker(null); }

  // Google-Maps-stijl kiezen op de kaart: eerst startpunt, dan bestemming.
  // Buiten die modus is een tik gewoon de bestemming (bestaand gedrag).
  function kaartTik(node) {
    if (pick === 'start') { onStart(node.id); setPick('doel'); }
    else if (pick === 'doel') { onDoel(node.id); setPick(null); }
    else { onDoel(node.id); }
  }
  const gmProps = { ...mapProps, onSelectNode: kaartTik };

  const surfaces = SURFACES.filter((s) => (perSurface[s] ?? 0) > 0);

  return (
    <div className="ontwerp">
      <div className="ow-map">
        {view === 'plattegrond'
          ? <GraphMap key="img" space="img" labels={imgNamen}
              onToggleLabels={onToggleNamen} {...gmProps} />
          : <GraphMap key="geo" space="geo" base={base} {...gmProps} />}
      </div>

      {/* kaartbediening linksboven */}
      <div className="ow-topbar">
        <div className="ow-seg" role="tablist">
          <button role="tab" aria-selected={view === 'plattegrond'}
            className={view === 'plattegrond' ? 'on' : ''}
            onClick={() => onView('plattegrond')}>Plattegrond</button>
          <button role="tab" aria-selected={view === 'echt'}
            className={view === 'echt' ? 'on' : ''}
            onClick={() => onView('echt')}>Echte kaart</button>
        </div>
        {view === 'echt' && (
          <div className="ow-bases">
            {[['pdok', 'Luchtfoto'], ['sat', 'Satelliet'], ['osm', 'Kaart']].map(([b, lab]) => (
              <button key={b} className={base === b ? 'on' : ''}
                onClick={() => onBase(b)}>{lab}</button>
            ))}
          </div>
        )}
      </div>

      {/* het onderblad */}
      <div className="ow-sheet">
        <button className="ow-grip" aria-label="blad open/dicht"
          onClick={() => setExpanded((v) => !v)} />

        {pick ? (
          <div className="ow-pick">
            <div className="ow-pickstep">
              <b>{pick === 'start' ? '① Tik je startpunt aan' : '② Tik je bestemming aan'}</b>
              <span>op de kaart</span>
            </div>
            <button className="ow-btn" onClick={() => setPick(null)}>Annuleer</button>
          </div>
        ) : (
          <>
        {arrowOnly ? (
          <div className="ow-result">
            <div className="ow-arrowonly">
              <div className="lead"><b>{doelNode.name}</b> ligt niet aan een pad.</div>
              <div className="big">🧭 ~{rest} m</div>
              <div className="sub">Volg de pijl op de kaart die kant op.</div>
            </div>
            <button className="ow-dest" onClick={() => setPicker('doel')}>
              <span className="ow-dest-arrow">➤</span>
              <span className="ow-dest-name">{doelNode.name}</span>
              <span className="ow-dest-change">wijzig</span>
            </button>
            {gps === 'buiten' && (
              <p className="ow-gps-note">Je loopt nog buiten het terrein — daarom even geen blauwe stip.</p>
            )}
            <div className="ow-startline">
              vertrek: <b>{startLabel}</b> · <button onClick={() => setPicker('start')}>wijzig</button>
            </div>
          </div>
        ) : routeGevonden ? (
          <div className="ow-result">
            <div className="ow-board" onClick={() => setExpanded((v) => !v)}>
              <div className="ow-flap"><span key={fmtMin(min)} className="ow-flap-num">{fmtMin(min)}</span></div>
              <div className="ow-board-side">
                <div className="ow-unit">min lopen</div>
                <div className="ow-dist">{off ? `${walkM} m tot het pad` : (min < 1 ? 'je bent er bijna' : `${meters} m`)}</div>
              </div>
              <div className="ow-board-tag">van {startLabel}<br />{expanded ? 'tik: dicht' : 'tik: route'}</div>
            </div>

            <button className="ow-dest" onClick={() => setPicker('doel')}>
              <span className="ow-dest-arrow">➤</span>
              <span className="ow-dest-name">{doelNode.name}</span>
              <span className="ow-dest-change">wijzig</span>
            </button>

            {off && (
              <div className="ow-arrownote"><span className="k">🧭</span> De laatste ~{rest} m naar {doelNode.name} loopt buiten de paden — volg de pijl.</div>
            )}

            {zand > 0 && (
              <div className="ow-sand">⚑ even door&apos;t zand — zo&apos;n {zand} m. schoenen los mag.</div>
            )}

            {kanNavigeren && (
              <button className="ow-btn-primary ow-nav" onClick={onNavigeer}>🧭 Navigeer</button>
            )}

            {expanded && (
              <div className="ow-details">
                <div className="ow-surface-bar">
                  {surfaces.map((s) => (
                    <span key={s} className={s}
                      style={{ width: `${(perSurface[s] / totaalM) * 100}%`, background: SURF_COLOR[s] }}
                      title={`${SURFACE_LABEL[s]}: ${Math.round(perSurface[s])} m`} />
                  ))}
                </div>
                <div className="ow-legend">
                  {surfaces.map((s) => (
                    <span className="item" key={s}>
                      <span className="dot" style={{ background: SURF_COLOR[s] }} />
                      {SURFACE_LABEL[s]} · {Math.round(perSurface[s])} m
                    </span>
                  ))}
                </div>
                {haltes.length > 0 && (
                  <ol className="ow-legs">
                    {haltes.map((nm, i) => (
                      <li key={i}>{nm}</li>
                    ))}
                    {off
                      ? <li><strong>volg de pijl</strong> <span className="m">· naar {doelNode.name}</span></li>
                      : <li><strong>{doelNode.name}</strong> <span className="m">· aankomst</span></li>}
                  </ol>
                )}
                {doelNode.info && (
                  <p className="ow-info"><b>{doelNode.name}.</b> {doelNode.info}</p>
                )}
              </div>
            )}

            {gps === 'buiten' && (
              <p className="ow-gps-note">Je loopt nog buiten het terrein — daarom even geen blauwe stip.
                Zodra je binnen bent, verschijn je vanzelf.</p>
            )}
            {gps === 'geweigerd' && (
              <p className="ow-gps-note">Zet locatie aan om jezelf als blauw stipje te zien — of kies hieronder je vertrekpunt.</p>
            )}

            <div className="ow-startline">
              vertrek: <b>{startLabel}</b> · <button onClick={() => setPicker('start')}>wijzig</button>
            </div>
          </div>
        ) : heeftDoel ? (
          <div className="ow-noroute">
            <p>Hier komt lopend even geen pad langs naar <b>{doelNode.name}</b>. Kies een andere plek — of durf te verdwalen.</p>
            <button className="ow-btn-primary" onClick={() => setPicker('doel')}>Andere bestemming</button>
            <div className="ow-startline">
              vertrek: <b>{startLabel}</b> · <button onClick={() => setPicker('start')}>wijzig</button>
            </div>
          </div>
        ) : (
          <div className="ow-invite">
            <Octopus />
            <h2>Waar wil je heen?</h2>
            <p>Kies een plek — of tik &apos;m aan op de kaart. Wij wijzen de weg en tellen af.</p>
            <button className="ow-btn-primary" onClick={() => setPicker('doel')}>Kies je bestemming</button>
            <div className="ow-startline">
              vertrek: <b>{startLabel}</b> · <button onClick={() => setPicker('start')}>wijzig</button>
            </div>
          </div>
        )}
            <button className="ow-mapkies" onClick={() => { setPick('start'); setExpanded(false); }}>
              📍 Kies begin- en eindpunt op de kaart
            </button>
          </>
        )}
      </div>

      {/* kiezer-overlay */}
      {picker && (
        <>
          <div className="ow-scrim" onClick={() => setPicker(null)} />
          <div className="ow-picker">
            <div className="ow-picker-head">
              <h3>{picker === 'doel' ? 'Waar wil je heen?' : 'Waar vertrek je?'}</h3>
              <button className="close" aria-label="sluiten" onClick={() => setPicker(null)}>✕</button>
            </div>
            <div className="ow-picker-list">
              {picker === 'start' && gps === 'ok' && (
                <button className={`ow-item ${start === '__gps' ? 'on' : ''}`}
                  onClick={() => kiesStart('__gps')}>
                  <span className="nm">📍 Mijn locatie</span>
                  <span className="tag">GPS</span>
                </button>
              )}
              {kiezerlijst.map(({ node, afst }) => {
                const gekozen = picker === 'doel' ? node.id === doel : node.id === start;
                return (
                  <button key={node.id} className={`ow-item ${gekozen ? 'on' : ''}`}
                    onClick={() => (picker === 'doel' ? kiesDoel(node.id) : kiesStart(node.id))}>
                    <span className="nm">{node.name}</span>
                    <span className={`tag ${node.type === 'stage' ? 'stage' : ''}`}>
                      {node.type === 'stage' ? 'stage' : 'plek'}
                    </span>
                    {startCoord && <span className="far">≈{Math.round(afst)} m</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
