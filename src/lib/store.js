import { defaultData } from '../data/defaultMapData.js';

// v2: geo-posities vervangen door onderzochte werkelijke posities (juli 2026).
// v3: voorgevulde verbindingen verwijderd — Mick tekent de paden zelf.
// Oudere sleutels worden bewust genegeerd.
const KEY = 'wildeburg-mapdata-v3';

// Editormodus alleen via ?editor in de URL. Bezoekers krijgen ALTIJD de
// gepubliceerde kaart (public/mapdata.json) en er wordt bij hen niets in
// localStorage bewaard — anders zouden ze na een update van de kaart voor
// eeuwig hun oude, lokaal opgeslagen versie blijven zien.
export const isEditor = new URLSearchParams(window.location.search).has('editor');

// Laadvolgorde editor: localStorage (werk in uitvoering) > gepubliceerde
// mapdata.json > ingebouwde standaarddata.
// Laadvolgorde bezoeker: gepubliceerde mapdata.json > standaarddata.
export async function loadData() {
  if (isEditor) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* negeren */ }
  }
  try {
    const res = await fetch('mapdata.json?t=' + Date.now());
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
      return await res.json();
    }
  } catch { /* negeren */ }
  return defaultData();
}

export function saveLocal(data) {
  if (!isEditor) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* negeren */ }
}

export function resetLocal() {
  localStorage.removeItem(KEY);
}

// Download de huidige data als mapdata.json (leg dit bestand in public/
// zodat je bewerkingen voor alle bezoekers gelden).
export function exportData(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mapdata.json';
  a.click();
  URL.revokeObjectURL(url);
}
