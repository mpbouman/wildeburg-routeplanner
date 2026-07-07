import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { imgToFake, fakeToImg, haversineM } from '../lib/geo.js';

// Eén kleur voor alle looppaden (wens Mick: geen kleur per ondergrond)
const EDGE_COLOR = '#e8e2d0';

function imgStyle(meta) {
  const W = meta.imgW, H = meta.imgH;
  const c = imgToFake;
  return {
    version: 8,
    sources: {
      plattegrond: {
        type: 'image',
        url: meta.imgFile,
        coordinates: [c([0, 0]), c([W, 0]), c([W, H]), c([0, H])]
      }
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#161616' } },
      { id: 'plattegrond', type: 'raster', source: 'plattegrond' }
    ]
  };
}

// Beschikbare onderlagen voor de echte kaart. PDOK-luchtfoto is in Nederland
// veel scherper en actueler dan Esri; rotatie werkt hier gewoon (in de
// PDOK-viewer zelf niet, daarom deze laag hier ingebouwd).
export const BASE_LAYERS = ['pdok', 'sat', 'osm'];

const geoStyle = {
  version: 8,
  sources: {
    pdok: {
      type: 'raster',
      tiles: ['https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Luchtfoto &copy; Beeldmateriaal Nederland / PDOK'
    },
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; OpenStreetMap-bijdragers'
    },
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Beeldmateriaal &copy; Esri'
    }
  },
  layers: [
    { id: 'pdok', type: 'raster', source: 'pdok' },
    { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' } },
    { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } }
  ]
};

export default function GraphMap(props) {
  const {
    data, space, base, route, startId, doelId,
    mode, tool, pendingId, align, userPos
  } = props;

  const divRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const markersRef = useRef([]); // [{ id, mk }]
  const gpsMkRef = useRef(null); // blauwe stip: waar de gebruiker nu is
  const pijlRef = useRef(null);  // grote pijl richting de bestemming
  const p = useRef(props);
  p.current = props;

  const coordOf = (n) => (space === 'geo' ? n.geo : imgToFake(n.img));

  // --- kaart initialiseren -------------------------------------------------
  useEffect(() => {
    const meta = p.current.data.meta;
    const map = new maplibregl.Map({
      container: divRef.current,
      style: space === 'geo' ? geoStyle : imgStyle(meta),
      // echte kaart start in de opgeslagen standaardweergave (meta.center/
      // zoom/bearing, vast te leggen via "Zet startweergave" in de editor)
      center: space === 'geo'
        ? (meta.center || [5.8815, 52.6829])
        : imgToFake([meta.imgW / 2, meta.imgH / 2]),
      zoom: space === 'geo' ? (meta.zoom ?? 15.6) : 12.2,
      bearing: space === 'geo' ? (meta.bearing || 0) : 0,
      maxZoom: 20,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({
      showCompass: space === 'geo',
      visualizePitch: false
    }));

    map.on('load', () => {
      if (space === 'img') {
        map.fitBounds([imgToFake([0, meta.imgH]), imgToFake([meta.imgW, 0])], { padding: 24, duration: 0 });
      }
      if (space === 'geo') {
        for (const id of BASE_LAYERS) {
          map.setLayoutProperty(id, 'visibility',
            (p.current.base || 'pdok') === id ? 'visible' : 'none');
        }
      }
      map.addSource('edges', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'edges-layer', type: 'line', source: 'edges',
        paint: { 'line-color': EDGE_COLOR, 'line-width': 3.5, 'line-opacity': 0.85 }
      });
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'route-layer', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ff5d3a', 'line-width': 6, 'line-dasharray': [2, 1.2] }
      });
      // voorbeeldweergave tijdens het oppakken/verleggen van een lijn
      map.addSource('drag-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'drag-preview-line', type: 'line', source: 'drag-preview',
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#ffd23f', 'line-width': 3, 'line-dasharray': [1.5, 1] }
      });
      map.addLayer({
        id: 'drag-preview-point', type: 'circle', source: 'drag-preview',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 6, 'circle-color': '#ffd23f',
          'circle-stroke-color': '#162417', 'circle-stroke-width': 2
        }
      });
      readyRef.current = true;
      syncEdges();
      syncRoute();
      syncMarkers();
    });

    // klik op een pad: verwijderen (verwijder-tool) of splitsen + aankoppelen
    // van de tekenketting (teken-tool)
    map.on('click', 'edges-layer', (e) => {
      const q = p.current;
      if (q.align || q.mode !== 'edit' || e.features.length === 0) return;
      if (q.tool === 'delete') {
        q.onDeleteEdge(e.features[0].properties.key);
        e.preventDefault();
      } else if (q.tool === 'draw') {
        const c = [e.lngLat.lng, e.lngLat.lat];
        q.onDrawClickEdge(e.features[0].properties.key,
          space === 'geo' ? c : fakeToImg(c), space);
        e.preventDefault();
      }
    });

    // dubbelklik op een pad (standaardmodus): kruispunt invoegen op die plek
    map.on('dblclick', 'edges-layer', (e) => {
      const q = p.current;
      if (q.align || q.mode !== 'edit' || q.tool || e.features.length === 0) return;
      e.preventDefault(); // geen dubbelklik-zoom
      const c = [e.lngLat.lng, e.lngLat.lat];
      q.onSplitEdgeAt(e.features[0].properties.key,
        space === 'geo' ? c : fakeToImg(c), space);
    });

    // lijn oppakken en verleggen (standaardmodus): op de greep-plek ontstaat
    // een nieuw kruispunt dat de lijn splitst en met de muis meebeweegt
    let edgeDrag = null;
    function edgeDragStart(e) {
      const q = p.current;
      // standaardmodus én verwijdermodus: lijn kan opgepakt/versleept worden
      if (q.align || q.mode !== 'edit' || (q.tool && q.tool !== 'delete') || e.features.length === 0) return;
      // begon de druk op een MARKER (punt ligt vrijwel altijd op zijn eigen
      // lijn)? Dan sleept de marker; de lijn eronder moet NIET ook oppakken,
      // anders ontstaat er bij elk punt-verslepen een extra kruispunt.
      const doel = e.originalEvent && e.originalEvent.target;
      if (doel && doel.closest && doel.closest('.mk')) return;
      const key = e.features[0].properties.key;
      const [aId, bId] = key.split('|');
      const byId = Object.fromEntries(q.data.nodes.map((n) => [n.id, n]));
      if (!byId[aId] || !byId[bId]) return;
      e.preventDefault(); // geen kaart-pan tijdens deze sleep
      map.dragPan.disable();
      edgeDrag = {
        key,
        vast: [coordOf(byId[aId]), coordOf(byId[bId])],
        startPx: e.point,
        laatste: null,
        bezig: false
      };
      window.addEventListener('mouseup', edgeDragWindowUp);
    }
    function edgeDragMove(e) {
      if (!edgeDrag) return;
      if (!edgeDrag.bezig) {
        const d = Math.hypot(e.point.x - edgeDrag.startPx.x, e.point.y - edgeDrag.startPx.y);
        if (d < 3) return; // nog gewoon een klik
        edgeDrag.bezig = true;
        map.getCanvas().style.cursor = 'grabbing';
      }
      const c = [e.lngLat.lng, e.lngLat.lat];
      edgeDrag.laatste = c;
      map.getSource('drag-preview').setData({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [edgeDrag.vast[0], c] } },
          { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [c, edgeDrag.vast[1]] } },
          { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }
        ]
      });
    }
    function edgeDragEnd(c) {
      if (!edgeDrag) return;
      const drag = edgeDrag;
      edgeDrag = null;
      window.removeEventListener('mouseup', edgeDragWindowUp);
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      const src = map.getSource('drag-preview');
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
      const eind = c || drag.laatste;
      if (!drag.bezig || !eind) return; // was een gewone klik
      suppressClick = true; // de afsluitende klik niet als 'leeg' interpreteren
      p.current.onSplitEdgeAt(drag.key,
        space === 'geo' ? eind : fakeToImg(eind), space);
    }
    function edgeDragWindowUp() { edgeDragEnd(null); }
    map.on('mousedown', 'edges-layer', edgeDragStart);
    map.on('mousemove', edgeDragMove);
    map.on('mouseup', (e) => edgeDragEnd([e.lngLat.lng, e.lngLat.lat]));
    // touch (iPad): zelfde gedrag met één vinger op een lijn
    map.on('touchstart', 'edges-layer', edgeDragStart);
    map.on('touchmove', edgeDragMove);
    map.on('touchend', () => edgeDragEnd(null));
    // punt toevoegen (gereedschap 'punt') of kettingtekenen ('teken');
    // vlakbij een bestaand punt (±15 px) komt er GEEN nieuw punt: tekenen
    // koppelt dan aan het bestaande punt, Punt + doet niets
    let suppressClick = false; // na een lijnsleep de bijbehorende klik negeren
    map.on('click', (e) => {
      if (e.defaultPrevented) return;
      const q = p.current;
      if (q.align) return;
      if (q.mode !== 'edit') {
        // bezoekersweergave: klik op de kaart = navigeren naar het punt van
        // het netwerk dat het dichtst bij de klik ligt (ook kruispunten)
        let bestNode = null, best = Infinity;
        for (const n of q.data.nodes) {
          const pt = map.project(coordOf(n));
          const d = Math.hypot(pt.x - e.point.x, pt.y - e.point.y);
          if (d < best) { best = d; bestNode = n; }
        }
        if (bestNode) q.onSelectNode(bestNode);
        return;
      }
      if (suppressClick) { suppressClick = false; return; }
      let snapId = null, best = 15;
      for (const n of q.data.nodes) {
        const pt = map.project(coordOf(n));
        const d = Math.hypot(pt.x - e.point.x, pt.y - e.point.y);
        if (d < best) { best = d; snapId = n.id; }
      }
      const c = [e.lngLat.lng, e.lngLat.lat];
      const coords = space === 'geo' ? c : fakeToImg(c);
      if (q.tool === 'add') {
        if (!snapId) q.onAddNode(coords, space);
      } else if (q.tool === 'draw') {
        if (snapId) q.onChainNodeClick(snapId);
        else q.onChainMapClick(coords, space);
      } else if (!q.tool && q.selId && !snapId) {
        // geselecteerd punt + klik op leeg (niet op een lijn) = pad daarheen
        const opLijn = map.queryRenderedFeatures(e.point, { layers: ['edges-layer'] }).length > 0;
        if (!opLijn) q.onExtendFromSelection(coords, space);
      }
    });
    map.on('mousemove', 'edges-layer', () => {
      if (edgeDrag) return; // tijdens slepen bepaalt de sleep de cursor
      const q = p.current;
      let cursor = '';
      if (q.mode === 'edit' && !q.align) {
        if (q.tool === 'delete') cursor = 'not-allowed';
        else if (q.tool === 'draw') cursor = 'crosshair';
        else if (!q.tool) cursor = 'move';
      }
      map.getCanvas().style.cursor = cursor;
    });
    map.on('mouseleave', 'edges-layer', () => {
      if (!edgeDrag) map.getCanvas().style.cursor = '';
    });

    // splitter/zijbalk kan de container van maat veranderen
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(divRef.current);

    mapRef.current = map;
    divRef.current._map = map; // debughandvat + basis voor sync-knop
    if (p.current.onMapRef) p.current.onMapRef(space, map);
    return () => {
      readyRef.current = false;
      ro.disconnect();
      if (p.current.onMapRef) p.current.onMapRef(space, null);
      markersRef.current.forEach((m) => m.mk.remove());
      markersRef.current = [];
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space]);

  // --- uitlijn-modus: kaart beweegt ONDER de vaststaande punten door -------
  // De schermposities van alle punten worden bevroren; pan/zoom/rotatie van
  // de kaart herberekent hun geo-positie (img-posities blijven onaangeroerd).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || space !== 'geo' || !align) return;

    const px = new Map();
    for (const n of p.current.data.nodes) px.set(n.id, map.project(n.geo));

    const posOf = (id) => {
      const pt = px.get(id);
      if (!pt) return null;
      const ll = map.unproject(pt);
      return [ll.lng, ll.lat];
    };

    function onMove() {
      for (const { id, mk } of markersRef.current) {
        const pt = px.get(id);
        if (pt) mk.setLngLat(map.unproject(pt));
      }
      if (!readyRef.current) return;
      const q = p.current;
      map.getSource('edges').setData({
        type: 'FeatureCollection',
        features: q.data.edges
          .filter((e) => px.get(e.a) && px.get(e.b))
          .map((e) => ({
            type: 'Feature',
            properties: { key: e.a + '|' + e.b, surface: e.surface },
            geometry: { type: 'LineString', coordinates: [posOf(e.a), posOf(e.b)] }
          }))
      });
      map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
    }

    function onMoveEnd() {
      const updates = {};
      for (const [id, pt] of px) updates[id] = posOf(id);
      p.current.onAlignCommit(updates);
    }

    map.on('move', onMove);
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('move', onMove);
      map.off('moveend', onMoveEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [align, space]);

  // --- basiskaart (pdok/satelliet/osm) --------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || space !== 'geo' || !readyRef.current) return;
    for (const id of BASE_LAYERS) {
      map.setLayoutProperty(id, 'visibility', (base || 'pdok') === id ? 'visible' : 'none');
    }
  }, [base, space]);

  // dubbelklik-zoom uit tijdens tekenen/punten zetten (anders zoomt een
  // snelle dubbele klik terwijl je punten aan het zetten bent)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === 'edit' && (tool === 'draw' || tool === 'add')) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
  }, [mode, tool]);

  // --- synchronisatie ------------------------------------------------------
  function syncEdges() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const q = p.current;
    const byId = Object.fromEntries(q.data.nodes.map((n) => [n.id, n]));
    map.getSource('edges').setData({
      type: 'FeatureCollection',
      features: q.data.edges
        .filter((e) => byId[e.a] && byId[e.b])
        .map((e) => ({
          type: 'Feature',
          properties: { key: e.a + '|' + e.b, surface: e.surface },
          geometry: {
            type: 'LineString',
            coordinates: [coordOf(byId[e.a]), coordOf(byId[e.b])]
          }
        }))
    });
  }

  function syncRoute() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const q = p.current;
    const byId = Object.fromEntries(q.data.nodes.map((n) => [n.id, n]));
    const feats = [];
    if (q.route && q.route.found && q.route.path.length > 1) {
      feats.push({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: q.route.path.map((id) => coordOf(byId[id])) }
      });
    }
    map.getSource('route').setData({ type: 'FeatureCollection', features: feats });
  }

  function syncMarkers() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const q = p.current;
    markersRef.current.forEach((m) => m.mk.remove());
    markersRef.current = [];

    for (const n of q.data.nodes) {
      if (n.type === 'junction' && q.mode !== 'edit') continue;
      const state =
        n.id === q.doelId ? 'doel' :
        n.id === q.startId ? 'start' :
        n.id === q.pendingId ? 'pending' : '';
      const el = document.createElement('div');
      el.className = 'mk mk-' + n.type + (state ? ' mk-' + state : '') +
        (n.id === q.selId ? ' mk-sel' : '') +
        (space === 'img' ? ' mk-op-img' : '');
      el.innerHTML = '<i></i>' + (n.name ? '<span>' + n.name + '</span>' : '');
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const r = p.current;
        if (r.align) return;
        if (r.mode === 'edit') {
          if (r.tool === 'draw') r.onChainNodeClick(n.id);
          else if (r.tool === 'delete') r.onDeleteNode(n.id, { x: ev.clientX, y: ev.clientY });
          else if (!r.tool) r.onToggleSelect(n.id); // uitlichten op beide kaarten
        } else {
          r.onSelectNode(n);
        }
      });
      // dubbelklik op een punt (standaardmodus) = verwijderen, met keuzemenu
      // bij een tussenpunt
      el.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        const r = p.current;
        if (r.align || r.mode !== 'edit' || r.tool) return;
        r.onDeleteNode(n.id, { x: ev.clientX, y: ev.clientY });
      });
      // rechtermuisknop op een punt = verwijderen (werkt bij elk gereedschap)
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const r = p.current;
        if (r.align || r.mode !== 'edit') return;
        r.onDeleteNode(n.id, { x: ev.clientX, y: ev.clientY });
      });
      const mk = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        // beetpakbaar in standaardmodus én verwijdermodus (klik = verwijderen,
        // slepen = verplaatsen)
        draggable: q.mode === 'edit' && !q.align && (!q.tool || q.tool === 'delete')
      }).setLngLat(coordOf(n)).addTo(map);
      mk.on('dragend', () => {
        const ll = mk.getLngLat();
        const c = [ll.lng, ll.lat];
        p.current.onMoveNode(n.id, space === 'geo' ? c : fakeToImg(c), space);
      });
      markersRef.current.push({ id: n.id, mk });
    }
  }

  useEffect(() => { syncEdges(); syncRoute(); syncMarkers(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, route, startId, doelId, mode, tool, pendingId, align, props.selId]);

  // --- blauwe stip: de eigen GPS-positie op beide kaarten -------------------
  // Op de echte kaart staat hij exact; op de plattegrond grosso modo via
  // dezelfde geo→img-fit die ook bij het tekenen wordt gebruikt.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = userPos ? (space === 'geo' ? userPos.geo : imgToFake(userPos.img)) : null;
    if (!c) {
      if (gpsMkRef.current) { gpsMkRef.current.remove(); gpsMkRef.current = null; }
      return;
    }
    if (!gpsMkRef.current) {
      const el = document.createElement('div');
      el.className = 'gpsDot';
      el.innerHTML = '<i></i>';
      gpsMkRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(c).addTo(map);
    } else {
      gpsMkRef.current.setLngLat(c);
    }
  }, [userPos, space]);

  // --- grote pijl richting de bestemming (bezoekersweergave) ---------------
  // De pijl wijst hemelsbreed naar de bestemming — los van hoe de route
  // loopt (die kan ergens omheen gaan). Referentie: de GPS-positie, anders
  // het vertrekpunt. Draait mee met de kaartrotatie (schermhoek via project).
  useEffect(() => {
    const map = mapRef.current;
    const el = pijlRef.current;
    if (!map || !el) return;
    const q = p.current;
    const doel = q.data.nodes.find((n) => n.id === q.doelId);
    const startN = q.data.nodes.find((n) => n.id === q.startId);
    const vanCoord = q.userPos
      ? (space === 'geo' ? q.userPos.geo : imgToFake(q.userPos.img))
      : (startN ? coordOf(startN) : null);
    if (mode === 'edit' || !doel || !vanCoord) { el.style.display = 'none'; return; }
    el.style.display = '';

    function upd() {
      const a = map.project(vanCoord);
      const b = map.project(coordOf(doel));
      const hoek = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      el.querySelector('.pijl').style.transform = `rotate(${hoek}deg)`;
    }
    // afstand hemelsbreed, altijd uit de geo-posities
    const van = q.userPos ? q.userPos.geo : (startN ? startN.geo : null);
    const meters = van ? Math.round(haversineM(van, doel.geo)) : null;
    el.querySelector('.pijlTekst').textContent =
      (doel.name || 'bestemming') + (meters != null ? ` · ${meters} m` : '');
    upd();
    map.on('move', upd);
    return () => map.off('move', upd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doelId, startId, userPos, mode, data, space]);

  // vastgezette startweergave (meta.center/zoom/bearing) altijd terug te laden
  function naarStartweergave() {
    const map = mapRef.current;
    if (!map) return;
    const meta = p.current.data.meta;
    map.jumpTo({
      center: meta.center || [5.8815, 52.6829],
      zoom: meta.zoom ?? 15.6,
      bearing: meta.bearing || 0
    });
  }

  // Belangrijk: de kaartcontainer (divRef) moet LEEG blijven en een vaste
  // className houden — MapLibre voegt daar zelf klassen en DOM aan toe, en
  // een React-herrender van die container wist die (kaart valt dan uit
  // elkaar). Knoppen en de namen-schakelklasse zitten daarom op een wrapper.
  return (
    <div className={'graphMapWrap' + (space === 'img' && !props.labels ? ' hideNames' : '')}>
      <div ref={divRef} className="graphMap" />
      <div ref={pijlRef} className="doelPijl" style={{ display: 'none' }}>
        <span className="pijl">➤</span>
        <span className="pijlTekst" />
      </div>
      {space === 'geo' && !align && (
        <button className="homeView" onClick={naarStartweergave}
          title="Terug naar de vaste startweergave (positie, zoom en rotatie)">
          ⌂ Start
        </button>
      )}
      {space === 'img' && (
        <button className="homeView" onClick={props.onToggleLabels}
          title="Naamlabels op de plattegrond tonen of verbergen (de namen staan al op de kaart getekend)">
          {props.labels ? 'Namen uit' : 'Namen aan'}
        </button>
      )}
    </div>
  );
}
