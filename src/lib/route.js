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
