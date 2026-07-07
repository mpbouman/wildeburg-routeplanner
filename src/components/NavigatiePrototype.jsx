import { useEffect, useMemo, useRef, useState } from 'react';
import { haversineM } from '../lib/geo.js';
import { fitImgGeo } from '../lib/fit.js';

// ============================================================================
// PROTOTYPE — WEGGOOICODE
// Vraag die dit beantwoordt: "hoe moet het navigatiescherm voor bezoekers
// eruitzien?" Drie structureel verschillende varianten, schakelbaar via
// ?variant=A|B|C en de zwevende balk onderin. De schakelbalk staat bewust
// óók in de productie-build: Mick test dit op zijn iPhone via GitHub Pages.
// Zodra een winnaar gekozen is: winnaar netjes herbouwen, dit bestand weg.
// ============================================================================

const LOOPSNELHEID = 1.25; // m/s van de gesimuleerde wandelaar

// --- rekenhulpjes (klein gebied: equirectangulair is ruim voldoende) --------
function bearingDeg(a, b) {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return ((Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}
function norm180(d) { return ((d % 360) + 540) % 360 - 180; }
function toLokaal(ref, p) { // meters oost/noord t.o.v. ref
  const k = Math.cos((ref[1] * Math.PI) / 180) * 111320;
  return [(p[0] - ref[0]) * k, (p[1] - ref[1]) * 111320];
}

// positie + kijkrichting op afstand s langs een polyline
function opAfstand(lijn, s) {
  let acc = 0;
  for (let i = 0; i < lijn.length - 1; i++) {
    const d = haversineM(lijn[i], lijn[i + 1]);
    if (acc + d >= s && d > 0) {
      const t = (s - acc) / d;
      return {
        pos: [lijn[i][0] + t * (lijn[i + 1][0] - lijn[i][0]),
              lijn[i][1] + t * (lijn[i + 1][1] - lijn[i][1])],
        kop: bearingDeg(lijn[i], lijn[i + 1]),
        klaar: false
      };
    }
    acc += d;
  }
  const n = lijn.length;
  return { pos: lijn[n - 1], kop: bearingDeg(lijn[Math.max(0, n - 2)], lijn[n - 1]), klaar: true };
}

// projecteer de gebruiker op de route: pad vooruit + resterende meters
function padInfo(lijn, pos) {
  let best = { d: Infinity, i: 0, t: 0 };
  for (let i = 0; i < lijn.length - 1; i++) {
    const a = toLokaal(pos, lijn[i]), b = toLokaal(pos, lijn[i + 1]);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? -(a[0] * dx + a[1] * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a[0] + t * dx, a[1] + t * dy);
    if (d < best.d) best = { d, i, t };
  }
  const A = lijn[best.i], B = lijn[best.i + 1];
  const startP = [A[0] + best.t * (B[0] - A[0]), A[1] + best.t * (B[1] - A[1])];
  const vooruit = [startP, ...lijn.slice(best.i + 1)];
  let rest = 0;
  for (let i = 0; i < vooruit.length - 1; i++) rest += haversineM(vooruit[i], vooruit[i + 1]);
  return { vanPad: best.d, vooruit, rest };
}

// eerstvolgende duidelijke bocht in het pad vooruit
function volgendeBocht(punten) {
  let s = 0;
  for (let i = 1; i < punten.length - 1; i++) {
    s += haversineM(punten[i - 1], punten[i]);
    if (s > 300) return null;
    const d = norm180(bearingDeg(punten[i], punten[i + 1]) - bearingDeg(punten[i - 1], punten[i]));
    if (Math.abs(d) > 35) return { m: Math.round(s), tekst: d > 0 ? 'rechtsaf' : 'linksaf', hoek: d };
  }
  return null;
}

// --- padstrook: komende 300 m, looprichting = omhoog -------------------------
function PadStrook({ vooruit, pos, kop, w = 230, h = 260 }) {
  const rad = (kop * Math.PI) / 180;
  const schaal = (h - 30) / 300;
  const pts = vooruit.map((p) => {
    const [e, n] = toLokaal(pos, p);
    const sx = e * Math.cos(rad) - n * Math.sin(rad);
    const sy = e * Math.sin(rad) + n * Math.cos(rad);
    return [w / 2 + sx * schaal, h - 15 - sy * schaal];
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg className="npStrook" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke="#ff5d3a" strokeWidth="5"
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 5" />
      <circle cx={w / 2} cy={h - 15} r="7" fill="#2e90ff" stroke="#fff" strokeWidth="2.5" />
    </svg>
  );
}

// --- bekende punten die aan de schermrand in-/uitfaden -----------------------
// Dichterbij = helderder ("De Helling ▸" licht op als je erlangs loopt).
function RandMarkers({ nodes, pos, kop, doelId }) {
  const items = [];
  for (const n of nodes) {
    if (n.type === 'junction' || n.id === doelId) continue;
    const d = haversineM(pos, n.geo);
    if (d > 180) continue;
    const rel = norm180(bearingDeg(pos, n.geo) - kop);
    items.push({ n, d, rel, op: Math.max(0.1, Math.min(1, 1 - (d - 25) / 150)) });
  }
  return (
    <>
      {items.map(({ n, d, rel, op }) => {
        const stijl = { opacity: op };
        let pijl;
        if (Math.abs(rel) <= 55) { // vóór je: bovenrand
          stijl.top = 74;
          stijl.left = `calc(50% + ${(rel / 55) * 38}%)`;
          stijl.transform = 'translateX(-50%)';
          pijl = '▲';
        } else if (rel > 0) {       // rechts van je
          stijl.right = 8;
          stijl.top = `${28 + Math.min(1, (rel - 55) / 125) * 46}%`;
          pijl = '▸';
        } else {                    // links van je
          stijl.left = 8;
          stijl.top = `${28 + Math.min(1, (-rel - 55) / 125) * 46}%`;
          pijl = '◂';
        }
        return (
          <div key={n.id} className="npRand" style={stijl}>
            {rel < -55 && <span className="npRandPijl">{pijl}</span>}
            <span>{n.name}</span>
            <em>{Math.round(d)} m</em>
            {rel >= -55 && <span className="npRandPijl">{pijl}</span>}
          </div>
        );
      })}
    </>
  );
}

// --- Variant A: plattegrond onder je voeten, draait mee ----------------------
function VariantA({ data, lijnImg, userImg, kopImg, doelId }) {
  const meta = data.meta;
  const zoom = 1.35; // plattegrond-pixels → schermpixels
  return (
    <div className="npKaartWrap">
      <svg className="npKaart" viewBox="-200 -260 400 520" preserveAspectRatio="xMidYMid slice">
        <g transform={`scale(${zoom}) rotate(${-kopImg}) translate(${-userImg[0]} ${-userImg[1]})`}>
          <image href={meta.imgFile} width={meta.imgW} height={meta.imgH} />
          <polyline points={lijnImg.map((p) => p.join(',')).join(' ')}
            fill="none" stroke="#ff5d3a" strokeWidth={4 / zoom}
            strokeDasharray={`${9 / zoom} ${5 / zoom}`} strokeLinecap="round" />
        </g>
        {/* jij, altijd midden op het scherm, kijkend naar boven */}
        <polygon points="0,-13 9,8 0,3 -9,8" fill="#2e90ff" stroke="#fff" strokeWidth="2" />
      </svg>
    </div>
  );
}

// ============================================================================
export default function NavigatiePrototype({ data, route, doelId, startId, userGeo, opTerrein, onClose }) {
  const [variant, setVariant] = useState(() =>
    (new URLSearchParams(window.location.search).get('variant') || 'A').toUpperCase());
  const [sim, setSim] = useState(!opTerrein); // niet op het terrein? dan simuleren
  const [simStand, setSimStand] = useState({ s: 0, pauze: false });
  const [kompasOk, setKompasOk] = useState(false);
  const [kompas, setKompas] = useState(null); // echte telefoonrichting (deg)
  const vorigeGeo = useRef(null);             // GPS-koers als kompas ontbreekt
  const koersRef = useRef(0);

  const byId = useMemo(() => Object.fromEntries(data.nodes.map((n) => [n.id, n])), [data]);
  const doel = byId[doelId];
  const lijn = useMemo(
    () => (route && route.found ? route.path.map((id) => byId[id].geo) : null),
    [route, byId]);
  const fit = useMemo(() => fitImgGeo(data.nodes), [data]);
  const lijnImg = useMemo(
    () => (lijn ? lijn.map((g) => fit.geoToImg(g)) : []), [lijn, fit]);

  // --- simulatie: nep-wandelaar loopt met wat zwabber over de route ---------
  useEffect(() => {
    if (!sim || !lijn || simStand.pauze) return;
    // op kloktijd, niet op ticks: browsers vertragen timers in
    // achtergrondtabbladen en de wandelaar moet gewoon doorlopen
    let vorig = performance.now();
    const t = setInterval(() => {
      const nu = performance.now();
      const dt = Math.min(2, (nu - vorig) / 1000);
      vorig = nu;
      setSimStand((st) => ({ ...st, s: st.s + LOOPSNELHEID * dt }));
    }, 250);
    return () => clearInterval(t);
  }, [sim, lijn, simStand.pauze]);

  // --- echt kompas (iOS vraagt om een expliciete toestemmingsklik) ----------
  async function kompasAanzetten() {
    try {
      if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return;
      }
      setKompasOk(true);
    } catch { /* genegeerd */ }
  }
  useEffect(() => {
    if (!kompasOk || sim) return;
    function onOri(e) {
      const h = e.webkitCompassHeading != null
        ? e.webkitCompassHeading
        : (e.absolute && e.alpha != null ? 360 - e.alpha : null);
      if (h != null) setKompas(h);
    }
    window.addEventListener('deviceorientationabsolute', onOri, true);
    window.addEventListener('deviceorientation', onOri, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOri, true);
      window.removeEventListener('deviceorientation', onOri, true);
    };
  }, [kompasOk, sim]);

  if (!lijn || !doel) {
    return (
      <div className="npScherm">
        <NpStijl />
        <div className="npLeeg">
          <p>Geen route — kies eerst een bestemming op de kaart.</p>
          <button className="npKnop" onClick={onClose}>Terug</button>
        </div>
      </div>
    );
  }

  // --- waar ben je en waar kijk je heen? -------------------------------------
  let pos, kop, klaar = false;
  if (sim) {
    const st = opAfstand(lijn, simStand.s);
    pos = st.pos;
    kop = st.kop + 7 * Math.sin(simStand.s / 9); // beetje menselijk zwabberen
    klaar = st.klaar;
  } else {
    pos = userGeo || byId[startId]?.geo || lijn[0];
    if (kompas != null) kop = kompas;
    else {
      // koers uit opeenvolgende GPS-posities
      if (vorigeGeo.current && haversineM(vorigeGeo.current, pos) > 3) {
        koersRef.current = bearingDeg(vorigeGeo.current, pos);
        vorigeGeo.current = pos;
      } else if (!vorigeGeo.current) vorigeGeo.current = pos;
      kop = koersRef.current;
    }
  }

  const info = padInfo(lijn, pos);
  const bocht = volgendeBocht(info.vooruit);
  const naarDoel = haversineM(pos, doel.geo);
  const relDoel = norm180(bearingDeg(pos, doel.geo) - kop);
  const etaMin = Math.max(1, Math.round(info.rest / 75));
  if (naarDoel < 15) klaar = true;

  // img-ruimte voor variant A
  const userImg = fit.geoToImg(pos);
  const stapje = fit.geoToImg(opAfstand([pos,
    [pos[0] + 0.0002 * Math.sin((kop * Math.PI) / 180),
     pos[1] + 0.0002 * Math.cos((kop * Math.PI) / 180)]], 5).pos);
  const kopImg = (Math.atan2(stapje[1] - userImg[1], stapje[0] - userImg[0]) * 180) / Math.PI + 90;

  const VARIANTEN = ['A', 'B', 'C'];
  function wissel(richting) {
    const i = (VARIANTEN.indexOf(variant) + richting + 3) % 3;
    const v = VARIANTEN[i];
    setVariant(v);
    const u = new URL(window.location.href);
    u.searchParams.set('variant', v);
    window.history.replaceState(null, '', u);
  }

  const iosKompas = window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission;

  return (
    <div className="npScherm">
      <NpStijl />

      {/* kop: bestemming + resterend, sluiten */}
      <header className="npKop">
        <div>
          <strong>{doel.name || 'bestemming'}</strong>
          <span>{Math.round(info.rest)} m · ±{etaMin} min{info.vanPad > 25 ? ' · ⚠ naast het pad' : ''}</span>
        </div>
        <button className="npKnop npDicht" onClick={onClose}>✕</button>
      </header>

      {klaar && <div className="npKlaar">🎉 Je bent er!</div>}

      {/* de drie varianten */}
      {variant === 'A' && (
        <>
          <VariantA data={data} lijnImg={lijnImg} userImg={userImg} kopImg={kopImg} doelId={doelId} />
          <div className="npMiniPijl" title="hemelsbreed naar de bestemming">
            <span style={{ transform: `rotate(${relDoel}deg)` }}>➤</span>
            <em>{Math.round(naarDoel)} m</em>
          </div>
          {bocht && <div className="npBocht">↪ over {bocht.m} m {bocht.tekst}</div>}
        </>
      )}

      {variant === 'B' && (
        <div className="npMidden">
          <div className="npGrotePijl">
            <span style={{ transform: `rotate(${relDoel - 90}deg)` }}>➤</span>
          </div>
          <p className="npAfstand">{Math.round(naarDoel)} m hemelsbreed</p>
          {bocht
            ? <p className="npBocht npBochtLos">↪ over {bocht.m} m {bocht.tekst}</p>
            : <p className="npBocht npBochtLos">volg het pad</p>}
          <PadStrook vooruit={info.vooruit} pos={pos} kop={kop} />
          <p className="npStrookLabel">komende 300 m</p>
        </div>
      )}

      {variant === 'C' && (
        <div className="npMidden">
          <div className="npRing">
            <span className="npNoord" style={{ transform: `rotate(${-kop}deg) translateY(-74px)` }}>N</span>
            <span className="npRingPijl" style={{ transform: `rotate(${relDoel - 90}deg)` }}>➤</span>
            <em>{Math.round(naarDoel)} m</em>
          </div>
          {bocht
            ? <p className="npBocht npBochtLos">↪ over {bocht.m} m {bocht.tekst}</p>
            : <p className="npBocht npBochtLos">volg het pad</p>}
          <PadStrook vooruit={info.vooruit} pos={pos} kop={kop} w={190} h={200} />
        </div>
      )}

      {/* podia en punten die aan de rand oplichten als je er dichtbij bent */}
      <RandMarkers nodes={data.nodes} pos={pos} kop={kop} doelId={doelId} />

      {/* onderste regelbalk: sim/echt + kompas */}
      <div className="npRegel">
        <button className={'npKnop' + (sim ? ' actief' : '')}
          onClick={() => { setSim(!sim); setSimStand({ s: 0, pauze: false }); }}>
          {sim ? '▶ SIM loopt' : 'SIM uit'}
        </button>
        {sim && (
          <>
            <button className="npKnop"
              onClick={() => setSimStand((st) => ({ ...st, pauze: !st.pauze }))}>
              {simStand.pauze ? '▶' : '⏸'}
            </button>
            <button className="npKnop" onClick={() => setSimStand({ s: 0, pauze: false })}>⟲</button>
          </>
        )}
        {!sim && iosKompas && !kompasOk && (
          <button className="npKnop" onClick={kompasAanzetten}>🧭 Kompas aan</button>
        )}
        {!sim && !opTerrein && <span className="npWaarschuwing">niet op het terrein</span>}
      </div>

      {/* PROTOTYPE-schakelbalk (hoort niet bij het ontwerp zelf) */}
      <div className="npSwitcher">
        <button onClick={() => wissel(-1)}>◀</button>
        <span>{variant} — {variant === 'A' ? 'Kaart draait mee' : variant === 'B' ? 'Pijl eerst' : 'Kompasring'}</span>
        <button onClick={() => wissel(1)}>▶</button>
      </div>
    </div>
  );
}

// alle prototype-styling in één blok, zodat styles.css schoon blijft
function NpStijl() {
  return <style>{`
    .npScherm { position: fixed; inset: 0; z-index: 2000; background: #12200f;
      color: #f4f1e8; font-family: 'Segoe UI', system-ui, sans-serif; overflow: hidden;
      display: flex; flex-direction: column; }
    .npKop { position: relative; z-index: 6; display: flex; align-items: center;
      justify-content: space-between; padding: 12px 14px; background: #1e3120ee;
      border-bottom: 1px solid #35513a; }
    .npKop strong { display: block; font-size: 19px; color: #ffd23f; }
    .npKop span { font-size: 13px; color: #b9c9ae; }
    .npKnop { padding: 8px 13px; border-radius: 10px; border: 1px solid #35513a;
      background: #1e3120; color: #f4f1e8; font-size: 14px; cursor: pointer; }
    .npKnop.actief { background: #ffd23f; color: #162417; border-color: #ffd23f; font-weight: 700; }
    .npDicht { font-size: 16px; }
    .npLeeg { margin: auto; text-align: center; display: grid; gap: 12px; }
    .npKlaar { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%);
      z-index: 8; background: #ffd23f; color: #162417; font-size: 22px; font-weight: 800;
      padding: 14px 22px; border-radius: 14px; box-shadow: 0 8px 30px #000a; }
    /* variant A */
    .npKaartWrap { position: absolute; inset: 0; }
    .npKaart { width: 100%; height: 100%; }
    .npMiniPijl { position: absolute; top: 74px; left: 12px; z-index: 6; display: flex;
      align-items: center; gap: 7px; background: #1e3120ee; border: 1px solid #35513a;
      border-radius: 999px; padding: 6px 12px; }
    .npMiniPijl span { display: inline-block; font-size: 20px; color: #ffd23f; }
    .npMiniPijl em { font-style: normal; font-size: 13px; }
    .npBocht { position: absolute; bottom: 118px; left: 50%; transform: translateX(-50%);
      z-index: 6; background: #1e3120ee; border: 1px solid #35513a; border-radius: 999px;
      padding: 7px 16px; font-size: 15px; font-weight: 700; white-space: nowrap; }
    /* variant B en C */
    .npMidden { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 6px; padding-bottom: 90px; }
    .npBochtLos { position: static; transform: none; }
    .npGrotePijl span { display: inline-block; font-size: 110px; line-height: 1; color: #ffd23f;
      filter: drop-shadow(0 4px 14px #0008); transition: transform .2s linear; }
    .npAfstand { margin: 2px 0 4px; font-size: 17px; font-weight: 700; }
    .npStrook { background: #1e3120aa; border: 1px solid #35513a; border-radius: 14px; }
    .npStrookLabel { margin: 2px 0 0; font-size: 11.5px; color: #8fa585; }
    .npRing { position: relative; width: 180px; height: 180px; border-radius: 50%;
      border: 2px solid #35513a; background: #1e3120aa; display: flex; align-items: center;
      justify-content: center; flex-direction: column; }
    .npRingPijl { display: inline-block; font-size: 64px; color: #ffd23f; transition: transform .2s linear; }
    .npRing em { font-style: normal; font-size: 14px; margin-top: 2px; }
    .npNoord { position: absolute; top: 50%; left: 50%; margin: -10px 0 0 -7px; font-size: 14px;
      color: #ff8a66; font-weight: 800; transition: transform .2s linear; }
    /* randmarkers */
    .npRand { position: absolute; z-index: 7; display: flex; align-items: center; gap: 6px;
      background: #ffffffe8; color: #1b2b1c; border-radius: 999px; padding: 5px 12px;
      font-size: 13px; font-weight: 700; box-shadow: 0 2px 10px #0007;
      transition: opacity .5s; pointer-events: none; white-space: nowrap; }
    .npRand em { font-style: normal; font-weight: 400; font-size: 11.5px; color: #55654f; }
    .npRandPijl { color: #c2492f; font-size: 15px; }
    /* regelbalk + switcher */
    .npRegel { position: absolute; bottom: 58px; left: 0; right: 0; z-index: 9; display: flex;
      gap: 8px; justify-content: center; align-items: center; }
    .npWaarschuwing { font-size: 12.5px; color: #ffd88a; }
    .npSwitcher { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
      z-index: 10; display: flex; align-items: center; gap: 4px; background: #000000cc;
      border-radius: 999px; padding: 4px; box-shadow: 0 4px 18px #000b; }
    .npSwitcher button { border: 0; background: transparent; color: #fff; font-size: 15px;
      padding: 6px 10px; cursor: pointer; }
    .npSwitcher span { font-size: 12.5px; color: #ffd23f; min-width: 130px; text-align: center; }
  `}</style>;
}
