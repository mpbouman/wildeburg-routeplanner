// Standaard kaartdata Wildeburg 2026, voorgevuld op basis van de officiële
// plattegrond (public/plattegrond.jpg, 728x993 px) en wildeburg.nl/info.
//
// Elk punt heeft TWEE posities:
//   img: [x, y]   pixels op de plattegrond (topologisch, niet op schaal)
//   geo: [lng, lat] op de echte kaart (natuurpark Netl)
// De geo-posities zijn onderzocht via satellietbeeld, OpenStreetMap en
// BAG-pandcontouren (juli 2026): ankers zijn de grote glazen kas in het
// bamboebos (Kas & De Spot) en de eilandengroep in het meer; de overige
// punten volgen de affiene plattegrond-mapping uit lib/geo.js, hier en
// daar handmatig op het terrein gelegd (Strand, Vuurtorenstrand).
// Fijnafstemming gebeurt door slepen in de editor.

import { DEFAULT_BEARING } from '../lib/geo.js';

export const SPEED = {
  verhard: 80,
  rijplaten: 72,
  gras: 62,
  onverhard: 55,
  zand: 38
};

export const SURFACE_LABEL = {
  verhard: 'verhard pad',
  rijplaten: 'rijplaten',
  gras: 'gras',
  onverhard: 'onverhard pad',
  zand: 'zand'
};

export const SURFACES = Object.keys(SPEED);

const meta = {
  imgFile: 'plattegrond.jpg',
  imgW: 728,
  imgH: 993
};

// [id, naam, type, imgX, imgY, lng, lat, info]
const N = [
  ['wildlive', 'Wildlive', 'stage', 130, 200, 5.87749, 52.68102, 'Grasveld met rijplaten, naast camping 1 en de foodcourt.'],
  ['strand', 'Strand', 'stage', 176, 296, 5.8791, 52.6813, 'Je moet door het zand om bij dit podium te komen.'],
  ['studiodebaan', 'Studio de Baan', 'stage', 140, 375, 5.87972, 52.68081, 'Ochtendgloren. Bereikbaar via een pad vanaf de Kas.'],
  ['kas', 'Kas & De Spot', 'stage', 385, 407, 5.88078, 52.68263, 'De grote glazen kas, aan een verhard pad.'],
  ['bamboebos', 'Bamboebos', 'stage', 320, 465, 5.88134, 52.68204, 'In het bamboebos, vlak bij de Kas.'],
  ['budxlodge', 'Bud x Lodge', 'stage', 415, 483, 5.88182, 52.68274, 'Via verharde paden, podium op verharde ondergrond.'],
  ['helling', 'Helling', 'stage', 135, 525, 5.8816, 52.68053, 'Het podium ligt in het zand op een helling.'],
  ['duinpan', 'Duinpan', 'stage', 330, 552, 5.88246, 52.68198, 'Via onverharde paden, stage volledig op het zand.'],
  ['boomboom', 'Boom Boom', 'stage', 640, 380, 5.88112, 52.68462, ''],
  ['achtertuin', 'Achtertuin', 'stage', 150, 740, 5.88435, 52.6803, 'Via onverharde paden en door het zand.'],
  ['bamboebios', 'Bamboe Bios', 'stage', 265, 745, 5.88472, 52.68117, ''],
  ['vuurtorenstrand', 'Vuurtorenstrand', 'stage', 490, 810, 5.886, 52.6828, 'Verhard pad tot aan de area, daarna door het zand.'],

  ['entree', 'Entree', 'facility', 630, 75, 5.87725, 52.68504, ''],
  ['ehbo', 'EHBO', 'facility', 95, 127, 5.87648, 52.68087, ''],
  ['dorpshart', 'Dorpshart & Campingwinkel', 'facility', 253, 180, 5.87757, 52.68199, ''],
  ['camping1', 'Camping 1', 'facility', 325, 200, 5.87801, 52.68251, ''],
  ['camping2', 'Camping 2', 'facility', 545, 290, 5.87973, 52.68404, ''],
  ['radiokoperenhond', 'Radio de Koperen Hond', 'facility', 340, 320, 5.87956, 52.68243, ''],
  ['verwilderij', 'De Verwilderij', 'facility', 245, 452, 5.88097, 52.68149, ''],
  ['vriendenvelden', 'Vriendenvelden', 'facility', 655, 522, 5.88295, 52.6845, ''],
  ['eiland', 'Eiland', 'facility', 455, 632, 5.8838, 52.6828, ''],
  ['camping3', 'Camping 3', 'facility', 630, 622, 5.88414, 52.68415, ''],
  ['brandpunt', 'Brandpunt', 'facility', 505, 690, 5.88466, 52.68309, ''],
  ['zweefhut', 'Zweefhut', 'facility', 545, 780, 5.8859, 52.68325, ''],
  ['camping4', 'Camping 4', 'facility', 185, 838, 5.88567, 52.68041, ''],
  ['camping35', 'Camping 3.5', 'facility', 620, 850, 5.88699, 52.68371, '']
];

// [a, b, ondergrond, toegankelijk]
// Bewust leeg: Mick tekent de looppaden zelf op de echte kaart in de editor.
const E = [];

export function defaultData() {
  return {
    // meta bevat ook de weergave-instellingen die met de kaartdata meereizen:
    // center/zoom/bearing (startweergave), base (onderlaag) en imgNamen
    // (naamlabels op de plattegrond)
    meta: { ...meta, bearing: DEFAULT_BEARING, base: 'pdok', imgNamen: false },
    nodes: N.map(([id, name, type, x, y, lng, lat, info]) => ({
      id, name, type, info,
      img: [x, y],
      geo: [lng, lat]
    })),
    edges: E.map(([a, b, surface, toegankelijk]) => ({ a, b, surface, toegankelijk }))
  };
}
