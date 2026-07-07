import { useMemo } from 'react';
import { SURFACE_LABEL } from '../data/defaultMapData.js';
import { metersPerOndergrond } from '../lib/route.js';

function fmtMin(min) {
  return min < 1 ? '< 1 min' : Math.round(min) + ' min';
}

export default function RoutePanel({ data, start, doel, accessible, route, gps,
  onStart, onDoel, onAccessible, onNavigeer }) {
  const nodeById = useMemo(
    () => Object.fromEntries(data.nodes.map((n) => [n.id, n])), [data]);
  // alle benoemde punten kunnen vertrekpunt én bestemming zijn
  const benoemd = data.nodes.filter((n) => n.type !== 'junction');
  const startpunten = benoemd;
  const doelpunten = benoemd;
  const doelNode = nodeById[doel];
  const perOndergrond = route && route.found ? metersPerOndergrond(route.legs) : {};
  const zand = Math.round(perOndergrond.zand ?? 0);

  return (
    <aside className="panel">
      <header>
        <h1>Wildeburg</h1>
        <p className="sub">Routeplanner — snelste looproute naar een stage</p>
      </header>

      <label htmlFor="start">Vertrekpunt</label>
      <select id="start" value={start} onChange={(e) => onStart(e.target.value)}>
        {gps === 'ok' && <option value="__gps">📍 Mijn locatie (GPS)</option>}
        {start === '__gps' && gps !== 'ok' && (
          <option value="__gps">📍 Mijn locatie (geen GPS…)</option>
        )}
        {startpunten.map((n) => (
          <option key={n.id} value={n.id}>{n.name}</option>
        ))}
      </select>

      {gps === 'buiten' && (
        <p className="gpsMelding">Je bent nu niet op het festivalterrein — de
          blauwe locatiestip staat daarom uit. Kies hierboven een vertrekpunt.</p>
      )}
      {gps === 'geweigerd' && (
        <p className="gpsMelding">Locatietoegang is geweigerd. Zet die aan om
          jezelf als blauwe stip op de kaart te zien.</p>
      )}

      <label htmlFor="doel">Waar wil je heen?</label>
      <select id="doel" value={doel} onChange={(e) => onDoel(e.target.value)}>
        {doelNode && doelNode.type === 'junction' && (
          <option value={doel}>— aangeklikt punt op de kaart —</option>
        )}
        {doelpunten.map((n) => (
          <option key={n.id} value={n.id}>{n.name}</option>
        ))}
      </select>

      <label className="check">
        <input type="checkbox" checked={accessible}
          onChange={(e) => onAccessible(e.target.checked)} />
        Toegankelijke route (rolstoelvriendelijk)
      </label>

      {route && route.found ? (
        <div className="result">
          <div className="eta">
            <span className="etaTime">{fmtMin(route.totalMinutes)}</span>
            <span className="etaDist">{Math.round(route.totalMeters)} m lopen</span>
          </div>

          {zand > 0 && (
            <p className="warn">Let op: circa {zand} m door het zand.</p>
          )}

          <button className="navKnop" onClick={onNavigeer}>
            🧭 Navigeer (proefversie)
          </button>

          <ol className="legs">
            {route.legs.map((l, i) => (
              <li key={i}>
                <strong>{(nodeById[l.to] && nodeById[l.to].name) || 'kruispunt'}</strong>
                <span> — {Math.round(l.meters)} m via {SURFACE_LABEL[l.surface]}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="result">
          <p className="warn">
            Geen {accessible ? 'toegankelijke ' : ''}route gevonden
            {accessible ? ' — deze stage is niet (volledig) rolstoeltoegankelijk.' : '.'}
          </p>
        </div>
      )}

      {doelNode && doelNode.info && (
        <p className="stageInfo"><strong>{doelNode.name}:</strong> {doelNode.info}</p>
      )}

      <p className="tip">Klik ergens op de kaart en de route loopt naar het
        dichtstbijzijnde punt daar. Afstanden volgen de echte kaart.</p>

      <footer>
        Plattegrond &copy; Wildeburg. Stage-info: wildeburg.nl
      </footer>
    </aside>
  );
}
