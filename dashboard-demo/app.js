const STATUS_META = {
  ok: { label: 'OK (Binnen geofence)', color: '#16a34a', priority: 4 },
  moved: { label: 'Afwijkende locatie', color: '#dc2626', priority: 1 },
  low_battery: { label: 'Batterij bijna leeg', color: '#d97706', priority: 2 },
  offline: { label: 'Lang geen signaal', color: '#6b7280', priority: 3 }
};

const PAGE_SIZE = 50;
const trackers = INITIAL_TRACKERS;
let selectedId = 'RM-TRK-0002'; // Start met Bord J16_1 (Project Zeewolde -> Haarlem)

const state = {
  search: '',
  project: 'all',
  type: 'all',
  status: 'all',
  onlyExceptions: false,
  page: 1
};

// Map setup
const map = L.map('map').setView([52.36, 5.35], 9);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap-bijdragers'
}).addTo(map);

// 1. Marker Clustering voor 5.000 markers
const clusterGroup = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 55,
  spiderfyOnMaxZoom: true,
  disableClusteringAtZoom: 16
});
map.addLayer(clusterGroup);

// 4. Projectzones (Geofence cirkels)
const geofenceLayer = L.layerGroup().addTo(map);

// 6. Historie / Broodkruimelspoor voor geselecteerde tracker
const historyLayer = L.layerGroup().addTo(map);

// DOM references
const searchInput = document.getElementById('search-input');
const projectFilter = document.getElementById('project-filter');
const typeFilter = document.getElementById('type-filter');
const statusFilter = document.getElementById('status-filter');
const tableBody = document.getElementById('table-body');
const projectSummaryBody = document.getElementById('project-summary-body');
const detailContent = document.getElementById('detail-content');
const visibleCount = document.getElementById('visible-count');
const toggleGeofences = document.getElementById('toggle-geofences');
const pagePrev = document.getElementById('page-prev');
const pageNext = document.getElementById('page-next');
const pageInfo = document.getElementById('page-info');
const kpiCards = document.querySelectorAll('.kpi-card');

function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatHoursAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const hours = Math.max(0, Math.round(diffMs / 3600000));
  if (hours < 1) return 'Zojuist';
  if (hours === 1) return '1 uur geleden';
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  return `${days} dag${days > 1 ? 'en' : ''} geleden`;
}

function getBatteryColor(pct) {
  if (pct < 20) return '#d97706';
  if (pct <= 50) return '#eab308';
  return '#16a34a';
}

function populateOptions() {
  const projects = Object.keys(PROJECTS);
  projectFilter.innerHTML = '<option value="all">Alle projecten</option>';
  projects.forEach((proj) => {
    const opt = document.createElement('option');
    opt.value = proj;
    opt.textContent = proj;
    projectFilter.appendChild(opt);
  });
}

function renderGeofences() {
  geofenceLayer.clearLayers();
  if (!toggleGeofences.checked) return;

  Object.entries(PROJECTS).forEach(([name, proj]) => {
    if (state.project !== 'all' && state.project !== name) return;
    L.circle([proj.lat, proj.lon], {
      radius: proj.radiusKm * 1000,
      color: '#0f4c81',
      weight: 1.5,
      dashArray: '6 5',
      fillColor: '#3b82f6',
      fillOpacity: 0.06
    })
      .bindTooltip(`${name} (geofence: ${proj.radiusKm} km)`)
      .addTo(geofenceLayer);
  });
}

function getFilteredTrackers() {
  const q = state.search.trim().toLowerCase();
  const filtered = trackers.filter((t) => {
    if (state.onlyExceptions && t.status === 'ok') return false;
    if (state.project !== 'all' && t.project !== state.project) return false;
    if (state.type !== 'all' && t.type !== state.type) return false;
    if (state.status !== 'all' && t.status !== state.status) return false;
    if (q) {
      const haystack = `${t.materiaal} ${t.id} ${t.project} ${t.locatieNaam} ${t.type}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Bij "Alleen afwijkingen" sorteren op urgentie (verplaatst -> batterij -> offline)
  if (state.onlyExceptions) {
    filtered.sort((a, b) => STATUS_META[a.status].priority - STATUS_META[b.status].priority);
  }
  return filtered;
}

function renderKpis() {
  let ok = 0, moved = 0, lowBat = 0, offline = 0;
  for (const t of trackers) {
    if (t.status === 'ok') ok++;
    else if (t.status === 'moved') moved++;
    else if (t.status === 'low_battery') lowBat++;
    else if (t.status === 'offline') offline++;
  }

  document.getElementById('kpi-total').textContent = trackers.length.toLocaleString('nl-NL');
  document.getElementById('kpi-ok').textContent = ok.toLocaleString('nl-NL');
  document.getElementById('kpi-moved').textContent = moved.toLocaleString('nl-NL');
  document.getElementById('kpi-battery').textContent = lowBat.toLocaleString('nl-NL');
  document.getElementById('kpi-offline').textContent = offline.toLocaleString('nl-NL');

  kpiCards.forEach((card) => {
    card.classList.toggle('active', !state.onlyExceptions && card.dataset.statusFilter === state.status);
  });
}

function renderProjectSummary() {
  const stats = {};
  Object.keys(PROJECTS).forEach((p) => {
    stats[p] = { total: 0, moved: 0, low_battery: 0, offline: 0 };
  });

  for (const t of trackers) {
    const s = stats[t.project];
    if (!s) continue;
    s.total++;
    if (t.status === 'moved') s.moved++;
    else if (t.status === 'low_battery') s.low_battery++;
    else if (t.status === 'offline') s.offline++;
  }

  projectSummaryBody.innerHTML = Object.entries(stats)
    .map(([proj, s]) => {
      const radius = PROJECTS[proj].radiusKm;
      const pill = (count, statusKey, badgeClass) => {
        if (count === 0) return '<span class="summary-pill summary-pill-zero">0</span>';
        return `<button class="summary-pill ${badgeClass}" data-proj="${proj}" data-stat="${statusKey}" type="button">${count}</button>`;
      };
      return `
        <tr>
          <td><strong>${proj}</strong></td>
          <td>${radius.toFixed(1)} km</td>
          <td>${s.total.toLocaleString('nl-NL')}</td>
          <td>${pill(s.moved, 'moved', 'badge-moved')}</td>
          <td>${pill(s.low_battery, 'low_battery', 'badge-low_battery')}</td>
          <td>${pill(s.offline, 'offline', 'badge-offline')}</td>
        </tr>
      `;
    })
    .join('');

  projectSummaryBody.querySelectorAll('button[data-proj]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.onlyExceptions = false;
      state.project = btn.dataset.proj;
      state.status = btn.dataset.stat;
      state.page = 1;
      projectFilter.value = state.project;
      statusFilter.value = state.status;
      renderAll();
      const proj = PROJECTS[state.project];
      if (proj) map.setView([proj.lat, proj.lon], 11, { animate: true });
    });
  });
}

function renderMap(list) {
  clusterGroup.clearLayers();
  const markers = [];

  for (const t of list) {
    const meta = STATUS_META[t.status] || STATUS_META.ok;
    const isSelected = t.id === selectedId;
    const marker = L.circleMarker([t.lat, t.lon], {
      radius: isSelected ? 10 : 7,
      color: isSelected ? '#0f172a' : '#ffffff',
      weight: isSelected ? 3 : 1.5,
      fillColor: meta.color,
      fillOpacity: 0.9
    });

    marker.bindPopup(`
      <strong>${t.materiaal}</strong> — ${t.project}<br/>
      <small>${t.locatieNaam}</small><br/>
      Status: <strong>${meta.label}</strong><br/>
      Batterij: ${t.batterijPct}% (~${estimateBatteryDays(t.batterijPct)} dgn)
    `);

    marker.on('click', () => {
      selectedId = t.id;
      renderDetail();
      renderHistoryOnMap();
      renderTablePage(list);
    });

    markers.push(marker);
  }

  clusterGroup.addLayers(markers);
}

// 6. Teken verplaatsingshistorie (broodkruimelspoor) op kaart
function renderHistoryOnMap() {
  historyLayer.clearLayers();
  const item = trackers.find((t) => t.id === selectedId);
  if (!item || !item.history || item.history.length < 2) return;

  const latLngs = item.history.map((h) => [h.lat, h.lon]);
  L.polyline(latLngs, {
    color: '#0f4c81',
    weight: 3,
    dashArray: '6 6',
    opacity: 0.85
  }).addTo(historyLayer);

  item.history.forEach((h, idx) => {
    const isLatest = idx === item.history.length - 1;
    L.circleMarker([h.lat, h.lon], {
      radius: isLatest ? 7 : 4.5,
      color: '#0f4c81',
      weight: 2,
      fillColor: isLatest ? '#dc2626' : '#ffffff',
      fillOpacity: 1
    })
      .bindTooltip(`${idx + 1}. ${h.plaats} (${formatDateTime(h.tijd)})`)
      .addTo(historyLayer);
  });
}

function renderDetail() {
  const item = trackers.find((t) => t.id === selectedId);
  if (!item) {
    detailContent.className = 'detail-empty';
    detailContent.innerHTML = '<p>Selecteer een materiaal op de kaart of in de tabel.</p>';
    return;
  }

  const meta = STATUS_META[item.status] || STATUS_META.ok;
  const estDays = estimateBatteryDays(item.batterijPct);
  const historyHtml = (item.history || [])
    .slice()
    .reverse()
    .map(
      (h) => `
      <li>
        <span>${h.plaats}</span>
        <span class="history-time">${formatDateTime(h.tijd)}</span>
      </li>`
    )
    .join('');

  detailContent.className = 'detail-body';
  detailContent.innerHTML = `
    <div class="detail-title-row">
      <div>
        <h3 class="detail-title">${item.materiaal}</h3>
        <div class="detail-sub">${item.type} · ${item.project}</div>
      </div>
      <span class="badge badge-${item.status}">${meta.label}</span>
    </div>

    <div class="alert-banner alert-${item.status}">
      ${item.melding}
    </div>

    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-item-label">Tracker ID</div>
        <div class="detail-item-value">${item.id}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Afstand tot project</div>
        <div class="detail-item-value">${(item.afstandKm || 0).toFixed(1)} km</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Laatste locatie</div>
        <div class="detail-item-value">${item.locatieNaam}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Laatst bijgewerkt</div>
        <div class="detail-item-value">${formatDateTime(item.laatstBijgewerkt)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Batterij &amp; restduur</div>
        <div class="detail-item-value">${item.batterijPct}% (~${estDays} dagen)</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-label">Spanning</div>
        <div class="detail-item-value">${item.batterijSpanning.toFixed(2)} V</div>
      </div>
    </div>

    <div class="history-section">
      <div class="history-title">Recente verplaatsingshistorie (broodkruimelspoor)</div>
      <ul class="history-list">${historyHtml}</ul>
    </div>

    <button id="btn-focus-map" class="btn btn-secondary" type="button">
      📍 Centreer kaart op dit materiaal &amp; spoor
    </button>
  `;

  document.getElementById('btn-focus-map').addEventListener('click', () => {
    map.setView([item.lat, item.lon], 13, { animate: true });
    renderHistoryOnMap();
  });
}

function renderTablePage(list) {
  visibleCount.textContent = list.length.toLocaleString('nl-NL');
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;

  pageInfo.textContent = `Pagina ${state.page} van ${totalPages}`;
  pagePrev.disabled = state.page <= 1;
  pageNext.disabled = state.page >= totalPages;

  if (list.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#64748b;">Geen materialen gevonden voor deze filters.</td></tr>';
    return;
  }

  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  tableBody.innerHTML = pageItems
    .map((t) => {
      const meta = STATUS_META[t.status] || STATUS_META.ok;
      const batColor = getBatteryColor(t.batterijPct);
      const selectedClass = t.id === selectedId ? 'selected' : '';
      return `
        <tr data-id="${t.id}" class="${selectedClass}">
          <td><strong>${t.materiaal}</strong></td>
          <td>${t.type}</td>
          <td>${t.project}</td>
          <td><code>${t.id}</code></td>
          <td>
            ${t.locatieNaam}
            <div class="coords">${t.lat.toFixed(4)}, ${t.lon.toFixed(4)}</div>
          </td>
          <td>
            ${formatDateTime(t.laatstBijgewerkt)}
            <div class="coords">${formatHoursAgo(t.laatstBijgewerkt)}</div>
          </td>
          <td>
            <div class="battery-wrap">
              <div class="battery-bar">
                <div class="battery-fill" style="width:${t.batterijPct}%;background:${batColor};"></div>
              </div>
              <span>${t.batterijPct}%</span>
            </div>
            <div class="coords">~${estimateBatteryDays(t.batterijPct)} dgn</div>
          </td>
          <td><span class="badge badge-${t.status}">${meta.label}</span></td>
        </tr>
      `;
    })
    .join('');

  tableBody.querySelectorAll('tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => {
      selectedId = row.dataset.id;
      renderDetail();
      renderHistoryOnMap();
      renderTablePage(list);
      const item = trackers.find((t) => t.id === selectedId);
      if (item) {
        map.setView([item.lat, item.lon], 13, { animate: true });
      }
    });
  });
}

let currentFiltered = [];

function renderAll() {
  currentFiltered = getFilteredTrackers();
  renderKpis();
  renderProjectSummary();
  renderGeofences();
  renderMap(currentFiltered);
  renderHistoryOnMap();
  renderTablePage(currentFiltered);
  renderDetail();
}

// Excel-vriendelijke CSV export
function exportToCsv() {
  const rows = currentFiltered;
  const headers = [
    'Materiaal',
    'Type',
    'Project',
    'Tracker ID',
    'LoRa DevEUI',
    'Laatst bekende locatie',
    'Latitude',
    'Longitude',
    'Afstand tot project (km)',
    'Laatst bijgewerkt',
    'Batterij (%)',
    'Geschatte restduur (dagen)',
    'Spanning (V)',
    'Status',
    'Melding'
  ];

  const escapeCsv = (val) => `"${String(val).replace(/"/g, '""')}"`;

  const lines = [
    headers.map(escapeCsv).join(';'),
    ...rows.map((t) =>
      [
        t.materiaal,
        t.type,
        t.project,
        t.id,
        t.devEui,
        t.locatieNaam,
        t.lat.toFixed(6).replace('.', ','),
        t.lon.toFixed(6).replace('.', ','),
        (t.afstandKm || 0).toFixed(2).replace('.', ','),
        formatDateTime(t.laatstBijgewerkt),
        t.batterijPct,
        estimateBatteryDays(t.batterijPct),
        t.batterijSpanning.toFixed(2).replace('.', ','),
        (STATUS_META[t.status] || STATUS_META.ok).label,
        t.melding
      ]
        .map(escapeCsv)
        .join(';')
    )
  ];

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rm-verkeerstechniek-trackers-${rows.length}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Event listeners
searchInput.addEventListener('input', (e) => {
  state.search = e.target.value;
  state.page = 1;
  renderAll();
});

projectFilter.addEventListener('change', (e) => {
  state.project = e.target.value;
  state.page = 1;
  renderAll();
});

typeFilter.addEventListener('change', (e) => {
  state.type = e.target.value;
  state.page = 1;
  renderAll();
});

statusFilter.addEventListener('change', (e) => {
  state.onlyExceptions = false;
  state.status = e.target.value;
  state.page = 1;
  renderAll();
});

toggleGeofences.addEventListener('change', renderGeofences);

kpiCards.forEach((card) => {
  card.addEventListener('click', () => {
    state.onlyExceptions = false;
    state.status = card.dataset.statusFilter;
    statusFilter.value = state.status;
    state.page = 1;
    renderAll();
  });
});

pagePrev.addEventListener('click', () => {
  if (state.page > 1) {
    state.page--;
    renderTablePage(currentFiltered);
  }
});

pageNext.addEventListener('click', () => {
  const totalPages = Math.ceil(currentFiltered.length / PAGE_SIZE);
  if (state.page < totalPages) {
    state.page++;
    renderTablePage(currentFiltered);
  }
});

document.getElementById('btn-reset').addEventListener('click', () => {
  state.search = '';
  state.project = 'all';
  state.type = 'all';
  state.status = 'all';
  state.onlyExceptions = false;
  state.page = 1;
  searchInput.value = '';
  projectFilter.value = 'all';
  typeFilter.value = 'all';
  statusFilter.value = 'all';
  renderAll();
});

document.getElementById('btn-export').addEventListener('click', exportToCsv);

// Init
populateOptions();
renderAll();
