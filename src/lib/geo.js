// Hulpfuncties voor de twee coördinaatruimtes:
// - geo: [lng, lat] op de echte kaart
// - img: [x, y] in pixels op de plattegrond-afbeelding

// Afstand in meters tussen twee geo-punten
export function haversineM(a, b) {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Plattegrond-pixels worden in MapLibre getoond via een kunstmatige
// lng/lat-ruimte rond [0, 0]: 1 pixel = IMG_K graden.
export const IMG_K = 0.0001;

export function imgToFake(img) {
  return [img[0] * IMG_K, -img[1] * IMG_K];
}

export function fakeToImg(lngLat) {
  return [lngLat[0] / IMG_K, -lngLat[1] / IMG_K];
}

// Startmapping plattegrond -> echte wereld (natuurpark Netl): affiene
// transformatie (rotatie ~78 graden, schaal ~0,87 m/px), geijkt op twee
// vaste ankers: de grote glazen kas (BAG-pand, 52.68263 N 5.88078 O) en de
// eilandengroep in het meer. De plattegrond is getekend met het westen
// grofweg boven; DEFAULT_BEARING zet de echte kaart in dezelfde stand.
// Alleen gebruikt om punten een beginpositie in de andere kaart te geven;
// daarna versleep je ze zelf naar de juiste plek.
export const DEFAULT_BEARING = 282;

// lng = A0 + A1*x + A2*y ; lat = B0 + B1*x + B2*y  (x, y in plattegrond-px)
const A = [5.874627039, 0.000002670960580, 0.00001259125671];
const B = [52.68035024, 0.000007633191650, -0.000001619215180];

export function imgToGeoDefault(img) {
  return [
    A[0] + A[1] * img[0] + A[2] * img[1],
    B[0] + B[1] * img[0] + B[2] * img[1]
  ];
}

export function geoToImgDefault(geo) {
  const det = A[1] * B[2] - A[2] * B[1];
  const dLng = geo[0] - A[0];
  const dLat = geo[1] - B[0];
  return [
    (B[2] * dLng - A[2] * dLat) / det,
    (A[1] * dLat - B[1] * dLng) / det
  ];
}
