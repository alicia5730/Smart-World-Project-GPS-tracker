// Demo dataset voor RM Verkeerstechniek — 5.000 trackers met project-geofences en historie

const PROJECTS = {
  'Project Zeewolde': { lat: 52.3306, lon: 5.5416, radiusKm: 3.5, plaats: 'Zeewolde' },
  'Project Lelystad N302': { lat: 52.5020, lon: 5.4850, radiusKm: 3.5, plaats: 'Lelystad' },
  'Project Almere Buiten': { lat: 52.3960, lon: 5.2800, radiusKm: 3.5, plaats: 'Almere' },
  'Project Dronten N307': { lat: 52.5245, lon: 5.7180, radiusKm: 3.5, plaats: 'Dronten' },
  'Project Harderwijk A28': { lat: 52.3418, lon: 5.6205, radiusKm: 3.0, plaats: 'Harderwijk' },
  'Project Zwolle N35': { lat: 52.5168, lon: 6.0830, radiusKm: 4.0, plaats: 'Zwolle' },
  'Project Utrecht A27': { lat: 52.0907, lon: 5.1510, radiusKm: 3.5, plaats: 'Utrecht' },
  'Depot Lelystad': { lat: 52.5028, lon: 5.5178, radiusKm: 1.2, plaats: 'Lelystad Depot' }
};

const AWAY_LOCATIONS = [
  { naam: 'Haarlem — Schipholweg / N205', lat: 52.3765, lon: 4.6462 },
  { naam: 'Amsterdam — Ring A10 West', lat: 52.3728, lon: 4.8415 },
  { naam: 'Utrecht — Rijnsweerd / A27', lat: 52.0893, lon: 5.1581 },
  { naam: 'Amersfoort — Hoevelaken', lat: 52.1714, lon: 5.4512 },
  { naam: 'Apeldoorn — Deventerstraat', lat: 52.2145, lon: 5.9782 },
  { naam: 'Hilversum — Oostereind', lat: 52.2286, lon: 5.1932 }
];

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Automatische geofence-, batterij- en offline-controle
function evaluateTrackerStatus(tracker, referenceNowMs = Date.now()) {
  const proj = PROJECTS[tracker.project];
  const hoursOffline = (referenceNowMs - new Date(tracker.laatstBijgewerkt).getTime()) / 3600000;

  if (proj) {
    const distKm = haversineKm(proj.lat, proj.lon, tracker.lat, tracker.lon);
    tracker.afstandKm = distKm;
    if (distKm > proj.radiusKm) {
      tracker.status = 'moved';
      tracker.melding = `Afwijkende locatie: ${distKm.toFixed(1)} km buiten geofence van ${tracker.project} (max ${proj.radiusKm} km).`;
      return tracker;
    }
  }

  if (hoursOffline > 24) {
    tracker.status = 'offline';
    tracker.melding = `Al ${Math.round(hoursOffline)} uur geen signaal ontvangen. Controleer dekking of of materiaal in berm/sloot ligt.`;
    return tracker;
  }

  if (tracker.batterijPct < 20) {
    tracker.status = 'low_battery';
    tracker.melding = `Batterij bijna leeg (${tracker.batterijPct}%). Plan vervanging/opladen in tijdens volgende onderhoudsrit.`;
    return tracker;
  }

  tracker.status = 'ok';
  tracker.melding = `Binnen projectzone ${tracker.project} (afstand ${(tracker.afstandKm || 0).toFixed(1)} km).`;
  return tracker;
}

function estimateBatteryDays(pct) {
  // Richtwaarde bij 1x per dag GPS+LoRa: ~365 dagen bij 100%
  return Math.max(1, Math.round((pct / 100) * 365));
}

// Deterministische pseudo-random generator voor snelle, reproduceerbare 5.000 trackers
function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildShowcaseTrackers(nowMs) {
  const isoHoursAgo = (h) => new Date(nowMs - h * 3600000).toISOString();

  const showcase = [
    {
      id: 'RM-TRK-0001',
      devEui: '70B3D57ED0060001',
      materiaal: 'Baken_1',
      type: 'Baken',
      project: 'Project Zeewolde',
      locatieNaam: 'Zeewolde — Horsterweg / N305',
      lat: 52.3306,
      lon: 5.5416,
      laatstBijgewerkt: isoHoursAgo(2.5),
      batterijPct: 86,
      batterijSpanning: 3.58,
      history: [
        { tijd: isoHoursAgo(98.5), plaats: 'Depot Lelystad', lat: 52.5028, lon: 5.5178 },
        { tijd: isoHoursAgo(74.5), plaats: 'Zeewolde — Horsterweg', lat: 52.3309, lon: 5.5412 },
        { tijd: isoHoursAgo(50.5), plaats: 'Zeewolde — Horsterweg', lat: 52.3307, lon: 5.5415 },
        { tijd: isoHoursAgo(26.5), plaats: 'Zeewolde — Horsterweg', lat: 52.3305, lon: 5.5418 },
        { tijd: isoHoursAgo(2.5), plaats: 'Zeewolde — Horsterweg / N305', lat: 52.3306, lon: 5.5416 }
      ]
    },
    {
      id: 'RM-TRK-0002',
      devEui: '70B3D57ED0060002',
      materiaal: 'Bord J16_1',
      type: 'Bord',
      project: 'Project Zeewolde',
      locatieNaam: 'Haarlem — Schipholweg / N205',
      lat: 52.3765,
      lon: 4.6462,
      laatstBijgewerkt: isoHoursAgo(1),
      batterijPct: 74,
      batterijSpanning: 3.51,
      history: [
        { tijd: isoHoursAgo(72), plaats: 'Zeewolde — Spiekweg', lat: 52.3321, lon: 5.5390 },
        { tijd: isoHoursAgo(48), plaats: 'Zeewolde — Spiekweg', lat: 52.3320, lon: 5.5392 },
        { tijd: isoHoursAgo(14), plaats: 'Almere — A6 (verplaatsing)', lat: 52.3508, lon: 5.2647 },
        { tijd: isoHoursAgo(9), plaats: 'Amsterdam — Ring A10', lat: 52.3420, lon: 4.9120 },
        { tijd: isoHoursAgo(1), plaats: 'Haarlem — Schipholweg / N205', lat: 52.3765, lon: 4.6462 }
      ]
    },
    {
      id: 'RM-TRK-0003',
      devEui: '70B3D57ED0060003',
      materiaal: 'Hek_14',
      type: 'Hek',
      project: 'Project Zeewolde',
      locatieNaam: 'Zeewolde — Nijkerkerweg',
      lat: 52.3189,
      lon: 5.5241,
      laatstBijgewerkt: isoHoursAgo(3),
      batterijPct: 14,
      batterijSpanning: 3.18,
      history: [
        { tijd: isoHoursAgo(51), plaats: 'Zeewolde — Nijkerkerweg', lat: 52.3191, lon: 5.5240 },
        { tijd: isoHoursAgo(27), plaats: 'Zeewolde — Nijkerkerweg', lat: 52.3188, lon: 5.5243 },
        { tijd: isoHoursAgo(3), plaats: 'Zeewolde — Nijkerkerweg', lat: 52.3189, lon: 5.5241 }
      ]
    },
    {
      id: 'RM-TRK-0004',
      devEui: '70B3D57ED0060004',
      materiaal: 'Bord C01_4',
      type: 'Bord',
      project: 'Project Zeewolde',
      locatieNaam: 'Zeewolde — Flevoweg (laatst bekende positie)',
      lat: 52.3375,
      lon: 5.5521,
      laatstBijgewerkt: isoHoursAgo(66),
      batterijPct: 48,
      batterijSpanning: 3.41,
      history: [
        { tijd: isoHoursAgo(114), plaats: 'Zeewolde — Flevoweg', lat: 52.3374, lon: 5.5520 },
        { tijd: isoHoursAgo(90), plaats: 'Zeewolde — Flevoweg', lat: 52.3376, lon: 5.5523 },
        { tijd: isoHoursAgo(66), plaats: 'Zeewolde — Flevoweg', lat: 52.3375, lon: 5.5521 }
      ]
    }
  ];

  return showcase.map((t) => evaluateTrackerStatus(t, nowMs));
}

function generateDemoTrackers(totalCount = 5000) {
  const nowMs = Date.now();
  const list = buildShowcaseTrackers(nowMs);
  const projectNames = Object.keys(PROJECTS);
  const types = ['Bord', 'Hek', 'Baken'];
  const bordCodes = ['J16', 'J37', 'C01', 'A01-50', 'F05', 'D02', 'B06'];
  const rng = createRng(20261117);

  for (let i = list.length + 1; i <= totalCount; i++) {
    const project = projectNames[Math.floor(rng() * projectNames.length)];
    const projMeta = PROJECTS[project];
    const type = types[Math.floor(rng() * types.length)];
    const id = `RM-TRK-${String(i).padStart(4, '0')}`;
    const devEui = `70B3D57ED006${i.toString(16).toUpperCase().padStart(4, '0')}`;

    const materiaal =
      type === 'Bord'
        ? `Bord ${bordCodes[Math.floor(rng() * bordCodes.length)]}_${i}`
        : `${type}_${i}`;

    // Bepaal scenario: ~1.4% verplaatst buiten geofence, ~4% lage batterij, ~2.5% offline, rest OK
    const roll = rng();
    let lat, lon, locatieNaam, hoursAgo, batterijPct;

    if (roll < 0.014 && project !== 'Depot Lelystad') {
      const away = AWAY_LOCATIONS[Math.floor(rng() * AWAY_LOCATIONS.length)];
      lat = away.lat + (rng() - 0.5) * 0.015;
      lon = away.lon + (rng() - 0.5) * 0.02;
      locatieNaam = away.naam;
      hoursAgo = 1 + rng() * 10;
      batterijPct = 45 + Math.floor(rng() * 50);
    } else {
      // Binnen project-geofence (straal * 0.85)
      const angle = rng() * Math.PI * 2;
      const distKm = Math.sqrt(rng()) * projMeta.radiusKm * 0.85;
      const dLat = (distKm / 111) * Math.cos(angle);
      const dLon = (distKm / (111 * Math.cos((projMeta.lat * Math.PI) / 180))) * Math.sin(angle);
      lat = projMeta.lat + dLat;
      lon = projMeta.lon + dLon;
      locatieNaam = `${projMeta.plaats} — Sector ${Math.floor(rng() * 12) + 1}`;

      if (roll < 0.039) {
        hoursAgo = 26 + rng() * 70; // offline
        batterijPct = 30 + Math.floor(rng() * 60);
      } else if (roll < 0.079) {
        hoursAgo = 1 + rng() * 16;
        batterijPct = 5 + Math.floor(rng() * 14); // < 20%
      } else {
        hoursAgo = 0.5 + rng() * 20;
        batterijPct = 25 + Math.floor(rng() * 75);
      }
    }

    const laatstBijgewerkt = new Date(nowMs - hoursAgo * 3600000).toISOString();
    const batterijSpanning = +(3.05 + (batterijPct / 100) * 0.6).toFixed(2);

    // Compacte 3-punts historie per tracker
    const history = [
      {
        tijd: new Date(nowMs - (hoursAgo + 48) * 3600000).toISOString(),
        plaats: `${projMeta.plaats} — Vorige positie`,
        lat: projMeta.lat + (rng() - 0.5) * 0.008,
        lon: projMeta.lon + (rng() - 0.5) * 0.01
      },
      {
        tijd: new Date(nowMs - (hoursAgo + 24) * 3600000).toISOString(),
        plaats: locatieNaam,
        lat: lat + (rng() - 0.5) * 0.0005,
        lon: lon + (rng() - 0.5) * 0.0005
      },
      {
        tijd: laatstBijgewerkt,
        plaats: locatieNaam,
        lat,
        lon
      }
    ];

    const tracker = evaluateTrackerStatus(
      {
        id,
        devEui,
        materiaal,
        type,
        project,
        locatieNaam,
        lat,
        lon,
        laatstBijgewerkt,
        batterijPct,
        batterijSpanning,
        history
      },
      nowMs
    );

    list.push(tracker);
  }

  return list;
}

const INITIAL_TRACKERS = generateDemoTrackers(5000);
