import { useEffect, useMemo, useRef, useState } from 'react';
import GraphMap from './components/GraphMap.jsx';
import RoutePanel from './components/RoutePanel.jsx';
import EditorBar from './components/EditorBar.jsx';
import NavigatiePrototype from './components/NavigatiePrototype.jsx';
import OntwerpViewer from './components/OntwerpViewer.jsx';
import { snelsteRoute, routeMetPijl } from './lib/route.js';
import { loadData, saveLocal, resetLocal, exportData, isEditor, EVENT } from './lib/store.js';
import { defaultData } from './data/defaultMapData.js';
import { fitImgGeo } from './lib/fit.js';
import { buildWarp } from './lib/warp.js';
import { haversineM } from './lib/geo.js';

// Bezoekers-herontwerp (synthese) achter ?ontwerp — laat de live-app ongemoeid.
const isOntwerp = new URLSearchParams(window.location.search).has('ontwerp');

export default function App() {
  const [data, setData] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [start, setStart] = useState('entree');
  const [doel, setDoel] = useState('strand');
  const [accessible, setAccessible] = useState(false);
  const [view, setView] = useState('plattegrond'); // 'plattegrond' | 'echt'
  const [base, setBase] = useState('pdok');        // 'pdok' | 'sat' | 'osm'
  const [split, setSplit] = useState(0.5);         // aandeel plattegrond in bewerkmodus
  const [mode, setMode] = useState('view');        // 'view' | 'edit'
  const [tool, setTool] = useState(null);          // null = standaard: alles beetpakbaar
  const [align, setAlign] = useState(false);       // echte kaart onder punten uitlijnen
  const [popup, setPopup] = useState(null);        // keuzepopup {x, y, titel, keuzes}
  const [surface, setSurface] = useState('onverhard');
  const [newType, setNewType] = useState('junction');
  const [chainId, setChainId] = useState(null);    // laatste punt van de tekenketting
  const [selId, setSelId] = useState(null);        // geselecteerd punt: groot op beide kaarten
  const [imgNamen, setImgNamen] = useState(false); // namen tonen op de plattegrond (staan er al op getekend)
  const [preview, setPreview] = useState(false);   // voorbeeld: plattegrond zoals de companion-app 'm toont
  const [userGeo, setUserGeo] = useState(null);    // GPS-positie [lng, lat]
  const [navOpen, setNavOpen] = useState(          // navigatie-mockup (PROTOTYPE)
    () => new URLSearchParams(window.location.search).has('nav'));
  const [gpsFout, setGpsFout] = useState(null);    // 'geweigerd' | 'geen' | null
  const gpsGekozen = useRef(false);                // GPS al eens automatisch als vertrekpunt gezet
  const chainRef = useRef(null);                   // synchroon bij (state loopt een render achter bij snelle kliks)
  const loaded = useRef(false);
  const mapsRef = useRef({});                      // { img: Map, geo: Map }
  const histRef = useRef([]);                      // undo-geschiedenis (vorige data-standen)
  const prevDataRef = useRef(null);                // vorige data, om bij elke wijziging te bewaren
  const undoingRef = useRef(false);                // true tijdens een herstel-actie (dan niets bewaren)
  const [histLen, setHistLen] = useState(0);
  // Navigeervlak (RoutePanel) inklapbaar — scheelt horizontale ruimte, m.n. in de
  // bewerkmodus. Keuze onthouden in localStorage.
  const [panelOpen, setPanelOpen] = useState(() => {
    try { return localStorage.getItem('wb-panel-dicht') !== '1'; } catch { return true; }
  });
  function togglePanel() {
    setPanelOpen((v) => {
      const nv = !v;
      try { localStorage.setItem('wb-panel-dicht', nv ? '0' : '1'); } catch { /* negeren */ }
      return nv;
    });
  }

  function setChain(id) {
    chainRef.current = id;
    setChainId(id);
  }

  useEffect(() => {
    loadData().then((d) => {
      setData(d);
      // weergave-instellingen reizen mee in meta (ook via export/import)
      if (d.meta && d.meta.base) setBase(d.meta.base);
      if (d.meta && typeof d.meta.imgNamen === 'boolean') setImgNamen(d.meta.imgNamen);
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (loaded.current && data) saveLocal(data);
    // elke wijziging: vorige stand in de undo-geschiedenis (max 50)
    if (loaded.current && data && prevDataRef.current && prevDataRef.current !== data) {
      if (undoingRef.current) {
        undoingRef.current = false;
      } else {
        histRef.current.push(prevDataRef.current);
        if (histRef.current.length > 50) histRef.current.shift();
        setHistLen(histRef.current.length);
      }
    }
    prevDataRef.current = data;
  }, [data]);

  function undo() {
    const vorige = histRef.current.pop();
    if (!vorige) return;
    setHistLen(histRef.current.length);
    undoingRef.current = true;
    setChain(null);
    setSelId(null);
    setData(vorige);
  }

  // Esc stopt de tekenketting en sluit de keuzepopup
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        chainRef.current = null;
        setChainId(null);
        setPopup(null);
        setSelId(null);
      }
      // Ctrl+Z / Cmd+Z = laatste bewerking herstellen
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- GPS: waar is de gebruiker? -------------------------------------------
  useEffect(() => {
    if (!('geolocation' in navigator)) { setGpsFout('geen'); return; }
    const id = navigator.geolocation.watchPosition(
      (pos) => { setGpsFout(null); setUserGeo([pos.coords.longitude, pos.coords.latitude]); },
      (err) => setGpsFout(err.code === 1 ? 'geweigerd' : 'geen'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // terreingrens: rechthoek om alle punten + ~250 m marge
  const terrein = useMemo(() => {
    if (!data || data.nodes.length === 0) return null;
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const n of data.nodes) {
      minLng = Math.min(minLng, n.geo[0]); maxLng = Math.max(maxLng, n.geo[0]);
      minLat = Math.min(minLat, n.geo[1]); maxLat = Math.max(maxLat, n.geo[1]);
    }
    const mLat = 250 / 111320;
    const mLng = 250 / (111320 * Math.cos((52.68 * Math.PI) / 180));
    return { minLng: minLng - mLng, maxLng: maxLng + mLng, minLat: minLat - mLat, maxLat: maxLat + mLat };
  }, [data]);

  const opTerrein = !!(userGeo && terrein &&
    userGeo[0] >= terrein.minLng && userGeo[0] <= terrein.maxLng &&
    userGeo[1] >= terrein.minLat && userGeo[1] <= terrein.maxLat);

  // status voor het paneel: ok / buiten het terrein / geweigerd / zoeken
  const gps = userGeo ? (opTerrein ? 'ok' : 'buiten') : (gpsFout || 'zoeken');

  // stip op de plattegrond: geo → img via dezelfde fit als bij het tekenen
  const userPos = useMemo(() => {
    if (!opTerrein || !data) return null;
    return { geo: userGeo, img: fitImgGeo(data.nodes).geoToImg(userGeo) };
  }, [opTerrein, userGeo, data]);

  // dichtstbijzijnde netwerkpunt bij de gebruiker = vertrekpunt bij GPS-start
  const gpsStartId = useMemo(() => {
    if (!opTerrein || !data) return null;
    let best = Infinity, id = null;
    for (const n of data.nodes) {
      const d = haversineM(n.geo, userGeo);
      if (d < best) { best = d; id = n.id; }
    }
    return id;
  }, [opTerrein, userGeo, data]);

  // op het terrein? Dan wordt GPS eenmalig automatisch het vertrekpunt
  useEffect(() => {
    if (opTerrein && !gpsGekozen.current) {
      gpsGekozen.current = true;
      setStart('__gps');
    }
  }, [opTerrein]);

  const effStart = start === '__gps' ? (gpsStartId || 'entree') : start;

  const route = useMemo(
    () => (data ? snelsteRoute(data, effStart, doel, accessible) : null),
    [data, effStart, doel, accessible]
  );

  // Herontwerp: onbereikbaar doel → route naar de dichtstbijzijnde knoop, de
  // rest alleen als pijl. Alleen in ?ontwerp; de live-app blijft ongewijzigd.
  const ontwerpRoute = useMemo(
    () => (isOntwerp && data ? routeMetPijl(data, effStart, doel) : route),
    [data, effStart, doel, route]
  );

  if (!data) return <div className="loading">Laden…</div>;

  // --- mutaties -------------------------------------------------------------
  function moveNode(id, coords, space) {
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) =>
        n.id === id ? { ...n, [space === 'geo' ? 'geo' : 'img']: coords } : n)
    }));
  }

  // uniek id (Date.now alleen kan botsen binnen dezelfde milliseconde)
  function newId() {
    return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
  }

  // nieuw punt; positie in de andere kaartruimte via de lokale warp (zie
  // warp.js) als er ≥2 vaste ankers zijn — dan valt het nieuwe punt meteen
  // ongeveer op zijn juiste plek in een al gewarpt gebied. Anders (of met
  // <2 ankers) de kale globale fit uit alle punten (oud gedrag).
  function makeNode(coords, space, type, name) {
    const { toImg, toGeo } = buildWarp(data.nodes);
    return {
      id: newId(), name: name || '', type, info: '',
      geo: space === 'geo' ? coords : toGeo(coords),
      img: space === 'img' ? coords : toImg(coords)
    };
  }

  function addNode(coords, space) {
    let name = '';
    if (newType !== 'junction') {
      name = window.prompt('Naam van het nieuwe punt:') || '';
      if (!name) return;
    }
    const node = makeNode(coords, space, newType, name);
    setData((d) => ({ ...d, nodes: [...d.nodes, node] }));
  }

  // uitlijn-modus: alle geo-posities in één keer bijwerken (img blijft staan)
  function alignCommit(updates) {
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (updates[n.id] ? { ...n, geo: updates[n.id] } : n))
    }));
  }

  function edgeMaken(d, a, b) {
    if (a === b) return d;
    if (d.edges.some((e) =>
      (e.a === a && e.b === b) || (e.a === b && e.b === a))) return d;
    return {
      ...d,
      edges: [...d.edges, { a, b, surface, toegankelijk: surface !== 'zand' }]
    };
  }

  // tekenketting: klik op bestaand punt = starten/koppelen, klik op de kaart
  // = nieuw kruispunt + pad vanaf het vorige punt; zelfde punt of Esc = stop
  function chainNodeClick(id) {
    const from = chainRef.current;
    if (!from) { setChain(id); return; }
    if (from === id) { setChain(null); return; }
    setData((d) => edgeMaken(d, from, id));
    setChain(id);
  }

  function chainMapClick(coords, space) {
    const node = makeNode(coords, space, 'junction', '');
    const from = chainRef.current;
    setData((d) => {
      const met = { ...d, nodes: [...d.nodes, node] };
      return from ? edgeMaken(met, from, node.id) : met;
    });
    setChain(node.id);
  }

  // pad splitsen: nieuw kruispunt op coords, edge a-b wordt a-n + n-b
  // (ondergrond en toegankelijk-vlag worden overgeërfd). Belangrijk: in de
  // huidige kaart komt het punt waar je klikt/sleept, maar in de ANDERE kaart
  // precies op de lijn a-b (op dezelfde fractie), zodat die kaart niet
  // meebuigt — daar versleep je het punt desgewenst apart.
  function splitEdgeAt(key, coords, space) {
    const [aId, bId] = key.split('|');
    const A = data.nodes.find((n) => n.id === aId);
    const B = data.nodes.find((n) => n.id === bId);
    if (!A || !B) return null;
    const cur = space === 'geo' ? 'geo' : 'img';
    const oth = cur === 'geo' ? 'img' : 'geo';
    const ax = A[cur][0], ay = A[cur][1];
    const dx = B[cur][0] - ax, dy = B[cur][1] - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((coords[0] - ax) * dx + (coords[1] - ay) * dy) / len2 : 0.5;
    t = Math.max(0, Math.min(1, t));
    const node = {
      id: newId(), name: '', type: 'junction', info: '',
      [cur]: coords,
      [oth]: [A[oth][0] + t * (B[oth][0] - A[oth][0]), A[oth][1] + t * (B[oth][1] - A[oth][1])]
    };
    setData((d) => {
      const edge = d.edges.find((e) =>
        (e.a === aId && e.b === bId) || (e.a === bId && e.b === aId));
      if (!edge) return d;
      return {
        ...d,
        nodes: [...d.nodes, node],
        edges: d.edges.filter((e) => e !== edge).concat([
          { ...edge, a: edge.a, b: node.id },
          { ...edge, a: node.id, b: edge.b }
        ])
      };
    });
    return node.id;
  }

  // geselecteerd punt + klik op een lege plek = pad naar een nieuw punt daar
  // (het nieuwe punt blijft geselecteerd zodat je kettinggewijs door kunt)
  function extendFromSelection(coords, space) {
    const from = selId;
    if (!from) return;
    const node = makeNode(coords, space, 'junction', '');
    setData((d) => {
      const met = { ...d, nodes: [...d.nodes, node] };
      return edgeMaken(met, from, node.id);
    });
    setSelId(node.id);
  }

  // tijdens tekenen op een bestaand pad klikken: pad splitst daar en de
  // ketting koppelt aan het nieuwe punt
  function drawClickEdge(key, coords, space) {
    const from = chainRef.current;
    const nid = splitEdgeAt(key, coords, space);
    if (from) setData((d) => edgeMaken(d, from, nid));
    setChain(nid);
  }

  // punt weghalen maar het pad laten doorlopen: buren rechtstreeks verbinden
  // met de ondergrond van het langste van de twee segmenten
  function healNode(id) {
    setData((d) => {
      const rond = d.edges.filter((e) => e.a === id || e.b === id);
      if (rond.length !== 2) return d;
      const byId = Object.fromEntries(d.nodes.map((n) => [n.id, n]));
      const buur = (e) => (e.a === id ? e.b : e.a);
      const lengte = (e) =>
        byId[e.a] && byId[e.b] ? haversineM(byId[e.a].geo, byId[e.b].geo) : 0;
      const n1 = buur(rond[0]), n2 = buur(rond[1]);
      const langste = lengte(rond[0]) >= lengte(rond[1]) ? rond[0] : rond[1];
      let edges = d.edges.filter((e) => e.a !== id && e.b !== id);
      const bestaatAl = n1 === n2 || edges.some((e) =>
        (e.a === n1 && e.b === n2) || (e.a === n2 && e.b === n1));
      if (!bestaatAl) edges = [...edges, { ...langste, a: n1, b: n2 }];
      return { ...d, nodes: d.nodes.filter((n) => n.id !== id), edges };
    });
    if (start === id) setStart('entree');
    if (doel === id) setDoel('strand');
  }

  // dubbele punten (vrijwel op elkaar) opsporen en samenvoegen; paden worden
  // omgehangen naar het overgebleven punt. Benoemde punten winnen van
  // kruispunten; twee benoemde punten op elkaar worden alleen gemeld.
  function mergeDuplicates() {
    const MAX_M = 2.5;  // meters op de echte kaart
    const MAX_PX = 3;   // pixels op de plattegrond
    const dichtbij = (a, b) =>
      haversineM(a.geo, b.geo) < MAX_M ||
      Math.hypot(a.img[0] - b.img[0], a.img[1] - b.img[1]) < MAX_PX;

    let nodes = [...data.nodes];
    let edges = [...data.edges];
    const vervang = {};
    let weer = true;
    while (weer) {
      weer = false;
      buiten:
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          if (!dichtbij(a, b)) continue;
          const aNaam = a.type !== 'junction';
          const bNaam = b.type !== 'junction';
          if (aNaam && bNaam) continue; // beide benoemd: handmatig beslissen
          const keep = aNaam ? a : b;
          const weg = keep === a ? b : a;
          nodes = nodes.filter((n) => n.id !== weg.id);
          edges = edges.map((e) => ({
            ...e,
            a: e.a === weg.id ? keep.id : e.a,
            b: e.b === weg.id ? keep.id : e.b
          })).filter((e) => e.a !== e.b);
          const gezien = new Set();
          edges = edges.filter((e) => {
            const k = [e.a, e.b].sort().join('|');
            if (gezien.has(k)) return false;
            gezien.add(k);
            return true;
          });
          vervang[weg.id] = keep.id;
          weer = true;
          break buiten;
        }
      }
    }

    const aantal = Object.keys(vervang).length;
    // resterende benoemde paren die op elkaar liggen alleen melden
    const gemeld = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (dichtbij(nodes[i], nodes[j])) {
          gemeld.push(`${nodes[i].name || nodes[i].id} + ${nodes[j].name || nodes[j].id}`);
        }
      }
    }

    if (aantal === 0 && gemeld.length === 0) {
      window.alert('Geen dubbele punten gevonden.');
      return;
    }
    setData((d) => ({ ...d, nodes, edges }));
    // verwijzingen naar verdwenen punten netjes omhangen
    const volg = (id) => { while (vervang[id]) id = vervang[id]; return id; };
    if (vervang[start]) setStart(volg(start));
    if (vervang[doel]) setDoel(volg(doel));
    if (selId && vervang[selId]) setSelId(volg(selId));
    if (chainRef.current && vervang[chainRef.current]) setChain(volg(chainRef.current));
    window.alert(
      `${aantal} dubbele punt${aantal === 1 ? '' : 'en'} samengevoegd.` +
      (gemeld.length
        ? `\nNiet samengevoegd (beide benoemd, zelf beslissen): ${gemeld.join(', ')}`
        : '')
    );
  }

  // verwijder-klik op een punt: direct, of via keuzepopup afhankelijk van
  // het aantal aangesloten paden
  function deleteNodeRequest(id, at) {
    const n = data.nodes.find((x) => x.id === id);
    const rond = data.edges.filter((e) => e.a === id || e.b === id);
    if (rond.length <= 1) { deleteNode(id); return; }
    const naam = n && n.name ? `“${n.name}”` : 'Dit punt';
    const x = at && at.x ? at.x : window.innerWidth / 2;
    const y = at && at.y ? at.y : 160;
    if (rond.length === 2) {
      setPopup({
        x, y,
        titel: `${naam} verwijderen?`,
        keuzes: [
          { label: 'Alleen dit punt — pad blijft doorlopen', actie: () => healNode(id) },
          { label: 'Punt én beide paden — keten verbreken', actie: () => deleteNode(id), danger: true },
          { label: 'Annuleren', actie: null }
        ]
      });
    } else {
      setPopup({
        x, y,
        titel: `${naam} heeft ${rond.length} paden.`,
        keuzes: [
          { label: `Punt én alle ${rond.length} paden verwijderen`, actie: () => deleteNode(id), danger: true },
          { label: 'Annuleren', actie: null }
        ]
      });
    }
  }

  // huidige stand van de echte kaart vastleggen als startweergave voor
  // iedereen (komt in meta en dus ook in de export)
  function setDefaultView() {
    const m = mapsRef.current.geo;
    if (!m) return;
    const c = m.getCenter();
    setData((d) => ({
      ...d,
      meta: {
        ...d.meta,
        center: [+c.lng.toFixed(6), +c.lat.toFixed(6)],
        zoom: +m.getZoom().toFixed(2),
        bearing: +m.getBearing().toFixed(1)
      }
    }));
    window.alert('Startweergave opgeslagen. Bezoekers zien de echte kaart straks precies in deze stand.');
  }

  // mapdata.json importeren (bijv. een eerder geëxporteerde versie)
  function handleImport(text) {
    try {
      const d = JSON.parse(text);
      if (!d || !d.meta || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) {
        throw new Error('geen geldig mapdata-formaat');
      }
      setData(d);
      if (d.meta.base) setBase(d.meta.base);
      if (typeof d.meta.imgNamen === 'boolean') setImgNamen(d.meta.imgNamen);
      setChain(null);
      window.alert(`Geïmporteerd: ${d.nodes.length} punten en ${d.edges.length} paden.`);
    } catch (err) {
      window.alert('Importeren mislukt: ' + err.message);
    }
  }

  function deleteNode(id) {
    setData((d) => ({
      ...d,
      nodes: d.nodes.filter((n) => n.id !== id),
      edges: d.edges.filter((e) => e.a !== id && e.b !== id)
    }));
    if (start === id) setStart('entree');
    if (doel === id) setDoel('strand');
  }

  function deleteEdge(key) {
    const [a, b] = key.split('|');
    setData((d) => ({
      ...d,
      edges: d.edges.filter((e) => !(e.a === a && e.b === b))
    }));
  }

  function handleReset() {
    if (!window.confirm('Eigen bewerkingen wissen en terug naar standaard?')) return;
    resetLocal();
    loadData().then((d) => {
      setData(d);
      if (d.meta && d.meta.base) setBase(d.meta.base);
      if (d.meta && typeof d.meta.imgNamen === 'boolean') setImgNamen(d.meta.imgNamen);
    });
  }

  // huidige editor-kaart live publiceren naar de companion (Supabase), zodat
  // bezoekers de nieuwe kaart meteen zien zonder handmatige export/deploy
  async function publishToCompanion() {
    if (publishing) return;
    if (!window.confirm('De LIVE kaart voor alle bezoekers overschrijven met de huidige editor-kaart?')) return;

    let pw = localStorage.getItem('wb_publish_pw');
    if (!pw) {
      pw = window.prompt('Publiceer-wachtwoord:');
      if (!pw) return;
    }

    setPublishing(true);
    try {
      const res = await fetch('https://pvszepseulwrdbiylhtj.supabase.co/rest/v1/rpc/publish_mapdata', {
        method: 'POST',
        headers: {
          apikey: 'sb_publishable_XvLMuPXN1JNKD4tq7R-d2w_hBUbNDPl',
          Authorization: 'Bearer sb_publishable_XvLMuPXN1JNKD4tq7R-d2w_hBUbNDPl',
          'Content-Type': 'application/json'
        },
        // target: welke map_live-rij ('live' = Wildeburg, 'loveland' = Loveland-kloon)
        body: JSON.stringify({ pw, payload: data, target: EVENT === 'loveland' ? 'loveland' : 'live' })
      });
      if (res.ok) {
        localStorage.setItem('wb_publish_pw', pw);
        window.alert("✓ Kaart gepubliceerd naar de companion. Bezoekers zien 'm binnen ~10s.");
      } else {
        if (res.status === 400) localStorage.removeItem('wb_publish_pw');
        const j = await res.json().catch(() => null);
        window.alert('Publiceren mislukt: ' + (j?.message || res.status));
      }
    } catch (err) {
      window.alert('Publiceren mislukt: ' + err.message);
    } finally {
      setPublishing(false);
    }
  }

  // bezoekersweergave: elk aangeklikt punt (of de dichtstbijzijnde bij een
  // klik op de kaart) wordt de bestemming
  function handleSelectNode(node) {
    setDoel(node.id);
  }

  // onderlaag en namen-schakelaar: direct in meta bewaren zodat ze in de
  // opgeslagen/geëxporteerde kaartdata terechtkomen
  function kiesBase(b) {
    setBase(b);
    setData((d) => ({ ...d, meta: { ...d.meta, base: b } }));
  }

  function wisselNamen() {
    const nieuw = !imgNamen;
    setImgNamen(nieuw);
    setData((d) => ({ ...d, meta: { ...d.meta, imgNamen: nieuw } }));
  }

  // bezoekersvlag: verberg op de plattegrond het ruwe netwerk (kruispunten +
  // paden) voor festivalbezoekers; alleen de actieve route blijft zichtbaar.
  // In de editor blijft alles zichtbaar — we bewaren enkel de vlag in meta.
  function toggleHidePlattegrond() {
    setData((d) => ({
      ...d,
      meta: { ...d.meta, hidePlattegrondNetwork: !d.meta.hidePlattegrondNetwork }
    }));
  }

  // geselecteerd punt vast/los zetten als ankerpunt voor "Schaal rest"
  function toggleFixed() {
    if (!selId) return;
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === selId ? { ...n, fixed: !n.fixed } : n))
    }));
  }

  // Geselecteerd punt (her)noemen — window.prompt werkt ook op iPad/iOS.
  // Krijgt een naamloos kruispunt een naam, dan kan het meteen zichtbaar
  // worden als faciliteit (kruispunten blijven voor bezoekers onzichtbaar).
  function renameSel() {
    if (!selId) return;
    const node = data.nodes.find((n) => n.id === selId);
    if (!node) return;
    const naam = window.prompt('Naam van dit punt:', node.name || '');
    if (naam == null) return; // geannuleerd
    const nieuw = naam.trim();
    let type = node.type;
    if (nieuw && type === 'junction' &&
        window.confirm('Dit kruispunt ook tonen als zichtbare plek (faciliteit) in de app?')) {
      type = 'facility';
    }
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === selId ? { ...n, name: nieuw, type } : n))
    }));
  }

  // Schaal rest: LOKALE interpolatie-warp van geo → img voor de NIET-vaste
  // KRUISPUNTEN (paden). De vaste punten (ankers) blijven exact staan; stages
  // en faciliteiten blijven ongemoeid (die staan al goed). De warp is:
  //   1. globale gelijkvormigheidsfit T: geo→img (kleinste kwadraten, uit
  //      ALLE ankers) — hergebruikt de wiskunde van fitImgGeo.
  //   2. per anker een residu r_i = anker.img − T(anker.geo).
  //   3. voor een kruispunt met geo g:
  //        img = T(g) + ( Σ wᵢ·rᵢ ) / ( Σ wᵢ ),  wᵢ = 1/(dist(g,ankerᵢ)² + ε)
  //      met afstand in lokale METERS (lng geïsotropiseerd via cos(lat)).
  // Exact op de ankers (wᵢ→∞ daar), lokaal (dichtbije ankers domineren) en
  // glad. Undo werkt (gewone data-wijziging).
  function scaleRest() {
    const anchors = data.nodes.filter((n) => n.fixed && n.img && n.geo);
    if (anchors.length < 2) {
      window.alert(
        'Zet eerst minstens 2 vaste punten (ankers) — idealiter 3 of meer, ' +
        'verspreid over het terrein.\n\nSelecteer een punt en klik ' +
        '"Vastzetten". Alleen de NIET-vaste kruispunten (paden) worden dan ' +
        'lokaal naar hun echte-wereldvorm gewarpt; stages en faciliteiten ' +
        'blijven staan.'
      );
      return;
    }

    // Te morfen punten: alleen kruispunten die NIET vast zijn (en geo hebben)
    const morph = data.nodes.filter(
      (n) => n.type === 'junction' && !n.fixed && n.geo);
    if (morph.length === 0) {
      window.alert(
        'Geen niet-vaste kruispunten om te warpen. (Alleen paden/kruispunten ' +
        'worden verplaatst; stages en faciliteiten blijven staan.)'
      );
      return;
    }

    // zelfde warp als bij het toevoegen van nieuwe punten (warp.js) — hier
    // toegepast op ALLE niet-vaste kruispunten in één keer
    const { toImg } = buildWarp(data.nodes);
    const nieuw = new Map(morph.map((n) => [n.id, toImg(n.geo)]));
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) =>
        nieuw.has(n.id) ? { ...n, img: nieuw.get(n.id) } : n)
    }));
    window.alert(
      `Plattegrond gewarpt: ${morph.length} kruispunt${morph.length === 1 ? '' : 'en'} ` +
      `lokaal verplaatst op basis van ${anchors.length} vaste anker` +
      `${anchors.length === 1 ? '' : 's'}. Stages en faciliteiten bleven staan. ` +
      'Ongedaan maken kan met Herstel (Ctrl+Z).'
    );
  }

  function startSplitDrag(e) {
    e.preventDefault();
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    function onMove(ev) {
      setSplit(Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width)));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const mapProps = {
    data, route: isOntwerp ? ontwerpRoute : route, startId: effStart, doelId: doel, userPos,
    mode, tool, pendingId: chainId, align, selId,
    onToggleSelect: (id) => setSelId((s) => (s === id ? null : id)),
    onSelectNode: handleSelectNode,
    onMoveNode: moveNode,
    onAddNode: addNode,
    onChainNodeClick: chainNodeClick,
    onChainMapClick: chainMapClick,
    onSplitEdgeAt: splitEdgeAt,
    onDrawClickEdge: drawClickEdge,
    onExtendFromSelection: extendFromSelection,
    onDeleteNode: deleteNodeRequest,
    onDeleteEdge: deleteEdge,
    onAlignCommit: alignCommit,
    onMapRef: (space, m) => { mapsRef.current[space] = m; }
  };

  // Herontwerp-bezoekersweergave: beeldvullende kaart + onderblad met
  // vertrektijd/wegwijzer. Hergebruikt alle bestaande state en de routemachine.
  if (isOntwerp) {
    return (
      <>
        <OntwerpViewer
          data={data} route={ontwerpRoute} gps={gps} userPos={userPos}
          view={view} base={base} start={start} doel={doel} effStart={effStart}
          imgNamen={imgNamen}
          onStart={setStart} onDoel={setDoel} onView={setView}
          onBase={kiesBase} onToggleNamen={wisselNamen}
          onNavigeer={() => setNavOpen(true)}
          mapProps={mapProps} />
        {navOpen && (
          <NavigatiePrototype
            data={data} route={ontwerpRoute} doelId={doel} startId={effStart}
            userGeo={userGeo} opTerrein={opTerrein}
            onClose={() => setNavOpen(false)} />
        )}
      </>
    );
  }

  return (
    <div className={'app' + (panelOpen ? '' : ' panelDicht')}>
      <RoutePanel
        data={data} start={start} doel={doel} accessible={accessible}
        route={route} gps={gps} onStart={setStart} onDoel={setDoel}
        onAccessible={setAccessible} onNavigeer={() => setNavOpen(true)}
        open={panelOpen} onToggle={togglePanel} />
      <main className="mapWrap">
        <div className="topBar">
          <div className="viewToggle" role="tablist">
            {mode !== 'edit' && (
              <>
                <button role="tab" aria-selected={view === 'plattegrond'}
                  className={view === 'plattegrond' ? 'active' : ''}
                  onClick={() => setView('plattegrond')}>Plattegrond</button>
                <button role="tab" aria-selected={view === 'echt'}
                  className={view === 'echt' ? 'active' : ''}
                  onClick={() => setView('echt')}>Echte kaart</button>
              </>
            )}
            {(mode === 'edit' || view === 'echt') && (
              <select className="baseSelect" value={base}
                onChange={(e) => kiesBase(e.target.value)}
                title="Onderlaag van de echte kaart">
                <option value="pdok">Luchtfoto (PDOK)</option>
                <option value="sat">Satelliet (Esri)</option>
                <option value="osm">Kaart (OSM)</option>
              </select>
            )}
          </div>
          {isEditor && <EditorBar
            mode={mode} tool={tool} surface={surface} newType={newType}
            align={align}
            selNode={selId ? data.nodes.find((n) => n.id === selId) : null}
            hidePlattegrond={!!(data.meta && data.meta.hidePlattegrondNetwork)}
            onMode={(m) => { setMode(m); setChain(null); setAlign(false); setSelId(null); }}
            onTool={(t) => { setTool(t); setChain(null); }}
            onAlign={setAlign}
            onSurface={setSurface} onNewType={setNewType}
            onToggleFixed={toggleFixed} onRename={renameSel} onScaleRest={scaleRest}
            onToggleHidePlattegrond={toggleHidePlattegrond}
            preview={preview} onTogglePreview={() => setPreview((v) => !v)}
            onUndo={undo} canUndo={histLen > 0}
            onExport={() => exportData(data)} onImport={handleImport}
            onDefaultView={setDefaultView} onMerge={mergeDuplicates}
            onReset={handleReset}
            onPublish={publishToCompanion} publishing={publishing} />}
        </div>
        {mode === 'edit' ? (
          <div className="editSplit">
            <div className="pane" style={{ width: `${split * 100}%` }}>
              <span className="spaceLabel spaceLabel-img"
                title="Slepen op de plattegrond past de img-coördinaten (gestileerde pixels) aan.">
                Plattegrond · img&nbsp;[x,y]
              </span>
              <GraphMap key="img" space="img" labels={imgNamen} preview={preview}
                onToggleLabels={wisselNamen} {...mapProps} />
            </div>
            <div className="splitter" onPointerDown={startSplitDrag}
              title="Sleep om de verdeling aan te passen" />
            <div className="pane paneGeo">
              <span className="spaceLabel spaceLabel-geo"
                title="Slepen op de echte kaart past de geo-coördinaten (lng, lat) aan.">
                Echte kaart · geo&nbsp;[lng,lat]
              </span>
              <GraphMap key="geo" space="geo" base={base} {...mapProps} />
            </div>
          </div>
        ) : (view === 'plattegrond'
          ? <GraphMap key="img" space="img" labels={imgNamen}
              onToggleLabels={wisselNamen} {...mapProps} />
          : <GraphMap key="geo" space="geo" base={base} {...mapProps} />)}
      </main>

      {navOpen && (
        <NavigatiePrototype
          data={data} route={route} doelId={doel} startId={effStart}
          userGeo={userGeo} opTerrein={opTerrein}
          onClose={() => setNavOpen(false)} />
      )}

      {popup && (
        <div className="popupScherm" onClick={() => setPopup(null)}>
          <div className="choicePopup"
            style={{
              left: Math.max(150, Math.min(window.innerWidth - 150, popup.x)),
              top: Math.min(window.innerHeight - 170, popup.y + 10)
            }}
            onClick={(e) => e.stopPropagation()}>
            <p>{popup.titel}</p>
            {popup.keuzes.map((k, i) => (
              <button key={i} className={k.danger ? 'danger' : ''}
                onClick={() => { setPopup(null); if (k.actie) k.actie(); }}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
