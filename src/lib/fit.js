import { imgToGeoDefault, geoToImgDefault } from './geo.js';

// Gelijkvormigheidsfit (rotatie + schaal + translatie) tussen de twee
// kaartruimtes, berekend uit alle punten die in beide ruimtes een positie
// hebben. Hiermee krijgt een punt dat in de ene kaart wordt gezet een
// "grosso modo"-positie in de andere kaart — ook nadat de gebruiker de
// echte kaart onder het netwerk heeft uitgelijnd (bulk-verschuiving).
// Minder dan 2 bruikbare punten: terugvallen op de vaste startmapping.
export function fitImgGeo(nodes) {
  const pts = nodes.filter((n) => n.img && n.geo);
  if (pts.length < 2) {
    return { imgToGeo: imgToGeoDefault, geoToImg: geoToImgDefault };
  }

  const lat0 = pts.reduce((s, n) => s + n.geo[1], 0) / pts.length;
  const mLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const mLat = 111320;

  // complexe kleinste kwadraten: w = M*z + t
  // z = img als complex getal (x, -y), w = geo in lokale meters
  let zRe = 0, zIm = 0, wRe = 0, wIm = 0;
  for (const n of pts) {
    zRe += n.img[0]; zIm += -n.img[1];
    wRe += n.geo[0] * mLng; wIm += n.geo[1] * mLat;
  }
  zRe /= pts.length; zIm /= pts.length;
  wRe /= pts.length; wIm /= pts.length;

  let numRe = 0, numIm = 0, den = 0;
  for (const n of pts) {
    const a = n.img[0] - zRe, b = -n.img[1] - zIm;
    const c = n.geo[0] * mLng - wRe, d = n.geo[1] * mLat - wIm;
    numRe += c * a + d * b;   // (c+di)(a-bi)
    numIm += d * a - c * b;
    den += a * a + b * b;
  }
  if (den < 1e-9 || (numRe * numRe + numIm * numIm) < 1e-12) {
    return { imgToGeo: imgToGeoDefault, geoToImg: geoToImgDefault };
  }
  const mRe = numRe / den, mIm = numIm / den;

  function imgToGeo(img) {
    const a = img[0] - zRe, b = -img[1] - zIm;
    return [
      (wRe + mRe * a - mIm * b) / mLng,
      (wIm + mRe * b + mIm * a) / mLat
    ];
  }

  function geoToImg(geo) {
    const c = geo[0] * mLng - wRe, d = geo[1] * mLat - wIm;
    const m2 = mRe * mRe + mIm * mIm;
    const a = (c * mRe + d * mIm) / m2;
    const b = (d * mRe - c * mIm) / m2;
    return [a + zRe, -(b + zIm)];
  }

  return { imgToGeo, geoToImg };
}
