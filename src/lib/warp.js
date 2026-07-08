import { fitImgGeo } from './fit.js';

// Dezelfde lokale interpolatie-warp als "Schaal rest" (zie scaleRest() in
// App.jsx), hier herbruikbaar: een globale gelijkvormigheidsfit T: geo->img
// uit de vaste ankerpunten, gecorrigeerd met een afstand-gewogen residu per
// anker. Exact op de ankers, lokaal (dichtbije ankers domineren) en glad.
// Met minder dan 2 ankers valt dit terug op de kale globale fit uit ALLE
// punten (huidig gedrag).
export function buildWarp(nodes) {
  const anchors = nodes.filter((n) => n.fixed && n.img && n.geo);
  const fit = fitImgGeo(nodes);
  if (anchors.length < 2) return { toImg: fit.geoToImg, toGeo: fit.imgToGeo };

  const T = fitImgGeo(anchors).geoToImg;
  const Tinv = fitImgGeo(anchors).imgToGeo;

  const lat0 = anchors.reduce((s, a) => s + a.geo[1], 0) / anchors.length;
  const mLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const mLat = 111320;

  const res = anchors.map((a) => {
    const t = T(a.geo);
    return { geo: a.geo, img: a.img, rx: a.img[0] - t[0], ry: a.img[1] - t[1] };
  });

  const EPS = 1e-6; // m²: voorkomt deling door nul precies op een anker
  function residualAt(g) {
    let wSum = 0, cx = 0, cy = 0;
    for (const a of res) {
      const dx = (g[0] - a.geo[0]) * mLng;
      const dy = (g[1] - a.geo[1]) * mLat;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1e-9) return [a.rx, a.ry]; // valt exact op dit anker
      const w = 1 / (d2 + EPS);
      wSum += w; cx += w * a.rx; cy += w * a.ry;
    }
    return [cx / wSum, cy / wSum];
  }

  // geo -> img: zelfde formule als scaleRest()
  function toImg(g) {
    const t = T(g);
    const [rx, ry] = residualAt(g);
    return [t[0] + rx, t[1] + ry];
  }

  // img -> geo: de correctie hangt zelf van de geo-positie af, dus benader
  // via fixed-point-iteratie. Start bij de kale inverse fit, trek daar de
  // lokale correctie van af en herhaal — convergeert snel omdat de correctie
  // traag varieert t.o.v. de ankerafstanden.
  function toGeo(imgPoint) {
    let g = Tinv(imgPoint);
    for (let i = 0; i < 6; i++) {
      const [rx, ry] = residualAt(g);
      g = Tinv([imgPoint[0] - rx, imgPoint[1] - ry]);
    }
    return g;
  }

  return { toImg, toGeo };
}
