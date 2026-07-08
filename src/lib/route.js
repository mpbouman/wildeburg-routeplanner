import { haversineM } from './geo.js';
import { SPEED } from '../data/defaultMapData.js';

// Dijkstra: snelste route (op tijd) door het netwerk in mapData.
// Afstanden komen van de echte geo-posities van de punten.
export function snelsteRoute(data, start, doel, accessibleOnly = false) {
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  const adj = new Map();
  for (const e of data.edges) {
    if (accessibleOnly && !e.toegankelijk) continue;
    const na = byId[e.a];
    const nb = byId[e.b];
    if (!na || !nb) continue;
    const d = haversineM(na.geo, nb.geo);
    const minutes = d / (SPEED[e.surface] ?? 60);
    for (const [from, to] of [[e.a, e.b], [e.b, e.a]]) {
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from).push({ to, minutes, meters: d, surface: e.surface });
    }
  }

  const best = new Map([[start, 0]]);
  const prev = new Map();
  const done = new Set();
  const queue = [{ id: start, t: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.t - b.t);
    const { id, t } = queue.shift();
    if (done.has(id)) continue;
    done.add(id);
    if (id === doel) break;
    for (const edge of adj.get(id) ?? []) {
      const nt = t + edge.minutes;
      if (nt < (best.get(edge.to) ?? Infinity)) {
        best.set(edge.to, nt);
        prev.set(edge.to, { from: id, edge });
        queue.push({ id: edge.to, t: nt });
      }
    }
  }

  if (start === doel) return { path: [start], legs: [], totalMinutes: 0, totalMeters: 0, found: true };
  if (!done.has(doel)) return { path: [], legs: [], totalMinutes: 0, totalMeters: 0, found: false };

  const path = [doel];
  const legs = [];
  let cur = doel;
  while (cur !== start) {
    const { from, edge } = prev.get(cur);
    legs.unshift({ from, to: cur, ...edge });
    path.unshift(from);
    cur = from;
  }
  return {
    path,
    legs,
    totalMinutes: legs.reduce((s, l) => s + l.minutes, 0),
    totalMeters: legs.reduce((s, l) => s + l.meters, 0),
    found: true
  };
}

export function metersPerOndergrond(legs) {
  const acc = {};
  for (const l of legs) acc[l.surface] = (acc[l.surface] ?? 0) + l.meters;
  return acc;
}

// Alle knopen die vanaf `start` over paden te bereiken zijn (BFS, paden zijn
// tweerichtings). Gebruikt om bij een onbereikbaar doel het dichtstbijzijnde
// WEL-bereikbare knooppunt te vinden.
export function bereikbareKnopen(data, start) {
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  const adj = new Map();
  for (const e of data.edges) {
    if (!byId[e.a] || !byId[e.b]) continue;
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  }
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const id = stack.pop();
    for (const nb of adj.get(id) ?? []) {
      if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
  }
  return seen;
}

// Route mét pijl-terugval: ligt het doel niet aan het netwerk (geen pad
// heen), dan loopt de route naar het dichtstbijzijnde bereikbare knooppunt en
// wijst de rest alleen als pijl naar het doel. Geeft de gewone route terug als
// het doel wél bereikbaar is; extra velden bij terugval:
//   offNetwork: true, viaNode: <knoop-id>, restMeters: <hemelsbreed via→doel>
export function routeMetPijl(data, start, doel) {
  const basis = snelsteRoute(data, start, doel);
  if (basis.found) return { ...basis, offNetwork: false };

  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  const doelNode = byId[doel];
  if (!doelNode) return { ...basis, offNetwork: false };

  const bereikbaar = bereikbareKnopen(data, start);
  let via = null, best = Infinity;
  for (const id of bereikbaar) {
    const n = byId[id];
    if (!n) continue;
    const d = haversineM(n.geo, doelNode.geo);
    if (d < best) { best = d; via = id; }
  }
  if (!via) return { ...basis, offNetwork: false };

  const naarVia = via === start
    ? { path: [start], legs: [], totalMinutes: 0, totalMeters: 0, found: true }
    : snelsteRoute(data, start, via);
  return { ...naarVia, offNetwork: true, viaNode: via, restMeters: best };
}
