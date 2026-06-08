const API_BASE = 'https://api.thera-os.com';
const REGIME_PALETTE = ['#ff8a4c','#2dd4bf','#f472b6','#a3e635','#4f8cff','#f05252','#2fb37c','#d6a93a'];
const DATA = { prices: [], dates: [], scenarios: {}, scopedScenarios: {}, defaultScenario: "auto", colors: {}, parseDiagnostics: null };
const state = { scenario: DATA.defaultScenario, selectedIndex: null, rangeStart: 0, rangeEnd: 1 };
const fmtPct = value => `${(value * 100).toFixed(2)}%`;
const fmtNum = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
const svg = document.getElementById("price-chart");
const windowBarSvg = document.getElementById("window-bar");
const surfaceCanvas = document.getElementById("surface-canvas");
const surfaceContext = surfaceCanvas.getContext("2d");
const probabilityHeatmapSvg = document.getElementById("probability-heatmap");
const transitionHeatmapSvg = document.getElementById("transition-heatmap");
const tooltip = document.getElementById("dashboard-tooltip");
const commandOverlay = document.getElementById("command-overlay");
const commandSearch = document.getElementById("command-search");
const commandList = document.getElementById("command-list");
const infoOverlay = document.getElementById("info-overlay");
const infoTitle = document.getElementById("info-title");
const infoBody = document.getElementById("info-body");
const dashboardState = { transitionZoom: 1.0, scopeRequestId: 0 };

function init() {
  const select = document.getElementById("cluster-select");
  populateScenarioSelect();
  select.value = state.scenario;
  select.addEventListener("change", event => {
    state.scenario = event.target.value;
    state.selectedIndex = null;
    requestScopedRender();
  });
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = current === "dark" ? "light" : "dark";
    document.getElementById("theme-toggle").textContent = document.documentElement.dataset.theme === "dark" ? "☀" : "☾";
    drawSurface3D(activeScoped());
  });
  document.getElementById("transition-zoom-in").addEventListener("click", () => {
    zoomTransitionHeatmap(1.32);
  });
  document.getElementById("transition-zoom-out").addEventListener("click", () => {
    zoomTransitionHeatmap(1 / 1.32);
  });
  document.getElementById("transition-zoom-reset").addEventListener("click", () => {
    zoomTransitionHeatmap(1, true);
  });
  transitionHeatmapSvg.addEventListener("wheel", event => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.12;
    zoomTransitionHeatmap(factor);
  }, { passive: false });
  document.getElementById("timeline-reset").addEventListener("click", () => {
    state.selectedIndex = null;
    render();
  });
  document.getElementById("command-open").addEventListener("click", openCommandPalette);
  document.getElementById("load-series").addEventListener("click", () => document.getElementById("series-file").click());
  document.getElementById("series-file").addEventListener("change", handleSeriesFile);
  document.getElementById("export-csv").addEventListener("click", () => exportScenario("csv"));
  document.getElementById("export-json").addEventListener("click", () => exportScenario("json"));
  document.getElementById("range-start").addEventListener("input", event => {
    state.rangeStart = Math.min(Number(event.target.value), state.rangeEnd - 1);
    state.selectedIndex = null;
    requestScopedRender();
  });
  document.getElementById("range-end").addEventListener("input", event => {
    state.rangeEnd = Math.max(Number(event.target.value), state.rangeStart + 1);
    state.selectedIndex = null;
    requestScopedRender();
  });
  windowBarSvg.addEventListener("click", event => {
    const rect = windowBarSvg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1)));
    const span = state.rangeEnd - state.rangeStart;
    const center = Math.round(ratio * (DATA.prices.length - 1));
    state.rangeStart = Math.max(0, Math.min(DATA.prices.length - span - 1, center - Math.floor(span / 2)));
    state.rangeEnd = Math.min(DATA.prices.length - 1, state.rangeStart + span);
    state.selectedIndex = null;
    requestScopedRender();
  });
  commandOverlay.addEventListener("click", event => {
    if (event.target === commandOverlay) closeCommandPalette();
  });
  infoOverlay.addEventListener("click", event => {
    if (event.target === infoOverlay) closeInfoModal();
  });
  document.getElementById("info-close").addEventListener("click", closeInfoModal);
  commandSearch.addEventListener("input", renderCommands);
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommandPalette();
    }
    if (event.key === "Escape") {
      closeCommandPalette();
      closeInfoModal();
    }
  });
  bindSurfaceControls();
  enhancePanels();
  bindInfoButtons(document.querySelector(".metrics"));
  loadInitialSample();
}

function populateScenarioSelect() {
  const select = document.getElementById("cluster-select");
  select.innerHTML = "";
  Object.keys(DATA.scenarios).sort(compareScenarioKeys).forEach(key => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key === "auto" ? "Auto" : key === "uploaded" ? "Uploaded" : key;
    select.appendChild(option);
  });
}

function bindSurfaceControls() {
  if (surfaceCanvas.dataset.bound === "true") return;
  surfaceCanvas.dataset.bound = "true";

  surfaceCanvas.addEventListener("pointerdown", event => {
    surfaceCamera.dragging = true;
    surfaceCamera.lastX = event.clientX;
    surfaceCamera.lastY = event.clientY;
    surfaceCanvas.setPointerCapture(event.pointerId);
  });

  surfaceCanvas.addEventListener("pointermove", event => {
    if (!surfaceCamera.dragging) return;
    const dx = event.clientX - surfaceCamera.lastX;
    const dy = event.clientY - surfaceCamera.lastY;
    surfaceCamera.rotY += dx * 0.008;
    surfaceCamera.rotX += dy * 0.008;
    surfaceCamera.rotX = Math.max(-1.45, Math.min(1.1, surfaceCamera.rotX));
    surfaceCamera.lastX = event.clientX;
    surfaceCamera.lastY = event.clientY;
    drawSurface3D(activeScoped());
  });

  surfaceCanvas.addEventListener("pointerup", event => {
    surfaceCamera.dragging = false;
    surfaceCanvas.releasePointerCapture(event.pointerId);
  });

  surfaceCanvas.addEventListener("pointercancel", () => {
    surfaceCamera.dragging = false;
  });

  surfaceCanvas.addEventListener("wheel", event => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    surfaceCamera.zoom = Math.max(0.58, Math.min(1.85, surfaceCamera.zoom + direction * 0.08));
    drawSurface3D(activeScoped());
  }, { passive: false });

  surfaceCanvas.addEventListener("dblclick", () => {
    surfaceCamera.rotX = -0.62;
    surfaceCamera.rotY = 0.72;
    surfaceCamera.zoom = 1.0;
    drawSurface3D(activeScoped());
  });
}

function active() {
  return DATA.scenarios[state.scenario];
}

function activeScoped() {
  return DATA.scopedScenarios[state.scenario] || active();
}

function compareScenarioKeys(a, b) {
  if (a === "auto") return -1;
  if (b === "auto") return 1;
  if (a === "uploaded") return -1;
  if (b === "uploaded") return 1;
  return Number(a) - Number(b);
}

function regimeLabels(scenario) {
  const preferred = ["bear", "sideways", "bull"];
  const labels = [...new Set(scenario.rows.flatMap(row => Object.keys(row.probabilities)))];
  const preferredLabels = preferred.filter(label => labels.includes(label));
  const extraLabels = labels.filter(label => !preferred.includes(label)).sort();
  return [...preferredLabels, ...extraLabels];
}

function zoomTransitionHeatmap(factor, reset = false) {
  const frame = transitionHeatmapSvg.parentElement;
  const xRatio = frame ? frame.scrollLeft / Math.max(frame.scrollWidth - frame.clientWidth, 1) : 0;
  const yRatio = frame ? frame.scrollTop / Math.max(frame.scrollHeight - frame.clientHeight, 1) : 0;
  dashboardState.transitionZoom = reset ? 1.0 : Math.max(0.55, Math.min(6.0, dashboardState.transitionZoom * factor));
  renderTransitionHeatmap(activeScoped());
  if (frame) {
    frame.scrollLeft = xRatio * Math.max(frame.scrollWidth - frame.clientWidth, 1);
    frame.scrollTop = yRatio * Math.max(frame.scrollHeight - frame.clientHeight, 1);
  }
}

function mapApiResponse(data) {
  return {
    n_regimes: data.n_regimes,
    selection_scores: data.selection_scores || {},
    information_criteria: data.information_criteria || {},
    transition_matrix: data.transition_matrix,
    log_likelihoods: data.log_likelihoods || [],
    viterbi_path: data.viterbi_path,
    alerts: data.alerts || [],
    selected_signals: data.selected_signals || [],
    flow_diagnostics: data.flow_diagnostics || [],
    volatility_surface: data.volatility_surface || null,
    summary: Object.fromEntries(Object.entries(data.summary).map(([label, s]) => [label, {
      share: s.share,
      avg_probability: s.avg_probability,
      avg_mean_return: s.avg_mean_return,
      avg_volatility: s.avg_volatility,
      avg_trend_strength: s.avg_trend_strength || 0,
      avg_uncertainty: s.avg_uncertainty || 0,
      count: s.count
    }])),
    rows: data.rows.map(r => ({
      index: r.index,
      label: r.label,
      cluster: r.cluster,
      probabilities: r.probabilities,
      filtered_probabilities: r.filtered_probabilities,
      smoothed_probabilities: r.filtered_probabilities,
      features: r.features,
      viterbi_label: r.viterbi_label,
      uncertainty: r.uncertainty
    }))
  };
}

function assignColors(scenarios) {
  const allLabels = new Set();
  Object.values(scenarios).forEach(sc => Object.keys(sc.summary || {}).forEach(l => allLabels.add(l)));
  const labelReturns = {};
  Object.values(scenarios).forEach(sc => {
    Object.entries(sc.summary || {}).forEach(([l, s]) => {
      if (labelReturns[l] === undefined) labelReturns[l] = s.avg_mean_return ?? 0;
    });
  });
  const sorted = [...allLabels].sort((a, b) => (labelReturns[a] ?? 0) - (labelReturns[b] ?? 0));
  const colors = {};
  sorted.forEach((l, i) => { colors[l] = REGIME_PALETTE[i % REGIME_PALETTE.length]; });
  return colors;
}

async function loadInitialSample() {
  const status = document.getElementById("upload-status");
  try {
    status.textContent = "loading sample...";
    const response = await fetch("data/sample.csv");
    if (!response.ok) throw new Error(`Could not load data/sample.csv (${response.status})`);
    const blob = await response.blob();
    const file = new File([blob], "data/sample.csv", { type: "text/csv" });
    await uploadSeriesFile(file);
  } catch (error) {
    status.textContent = "sample failed";
    openInfoModal("Sample load failed", error?.message || "Could not load the initial sample.");
  }
}

function handleSeriesFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  uploadSeriesFile(file)
    .catch(error => {
      document.getElementById("upload-status").textContent = "load failed";
      openInfoModal("File load failed", error?.message || "Could not process the uploaded file.");
    })
    .finally(() => { event.target.value = ""; });
}

async function uploadSeriesFile(file) {
  const status = document.getElementById("upload-status");
  status.textContent = "calling API...";
  const form = new FormData();
  form.append("file", file);
  form.append("window", "5");
  form.append("auto_method", "bic");
  const response = await fetch(`${API_BASE}/api/v1/regime/upload`, { method: "POST", body: form });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  applyDashboardResponse(await response.json());
  await refreshScopedViews({ renderAfter: false });
  status.textContent = `${DATA.prices.length} obs loaded`;
  render();
}

function applyDashboardResponse(payload) {
  const scenarios = {};
  Object.entries(payload.scenarios || {}).forEach(([key, value]) => {
    scenarios[key] = mapApiResponse(value);
  });
  DATA.prices = payload.prices || [];
  DATA.dates = payload.dates || DATA.prices.map((_, index) => String(index));
  DATA.scenarios = scenarios;
  DATA.scopedScenarios = {};
  DATA.colors = assignColors(scenarios);
  DATA.defaultScenario = payload.default_scenario || "auto";
  DATA.parseDiagnostics = payload.parse_diagnostics || null;
  state.scenario = DATA.defaultScenario;
  state.selectedIndex = null;
  state.rangeStart = 0;
  state.rangeEnd = Math.min(Math.max(DATA.prices.length - 1, 1), 120);
  populateScenarioSelect();
  document.getElementById("cluster-select").value = state.scenario;
}

async function refreshScopedViews(options = {}) {
  if (!DATA.prices.length || !Object.keys(DATA.scenarios).length) return;
  const requestId = ++dashboardState.scopeRequestId;
  const response = await fetch(`${API_BASE}/api/v1/regime/scope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenarios: DATA.scenarios,
      range_start: state.rangeStart,
      range_end: state.rangeEnd,
      selected_index: state.selectedIndex,
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (requestId !== dashboardState.scopeRequestId) return;
  const scoped = {};
  Object.entries(payload.scenarios || {}).forEach(([key, value]) => {
    scoped[key] = mapApiResponse(value);
  });
  DATA.scopedScenarios = scoped;
  if (options.renderAfter !== false) render();
}

function requestScopedRender() {
  refreshScopedViews().catch(error => {
    openInfoModal("Range update failed", error?.message || "Could not update the selected range.");
  });
}

function render() {
  if (!DATA.prices.length || !Object.keys(DATA.scenarios).length) return;
  updateRangeControls();
  const scenario = activeScoped();
  document.getElementById("metric-observations").textContent = `${state.rangeStart}-${state.rangeEnd}`;
  document.getElementById("metric-windows").textContent = scenario.rows.length;
  document.getElementById("metric-regimes").textContent = scenario.n_regimes;
  document.getElementById("metric-likelihood").textContent = fmtNum(scenario.log_likelihoods.at(-1) ?? 0);
  document.getElementById("metric-latest").textContent = scenario.rows.at(-1)?.label ?? "-";
  document.getElementById("chart-note").textContent = `K=${scenario.n_regimes}`;
  renderChart(scenario);
  renderSurfaceChart(scenario);
  renderProbabilityHeatmap(scenario);
  renderTransitionHeatmap(scenario);
  renderLegend(scenario);
  renderSummary(scenario);
  renderSelection(scenario);
  renderTransition(scenario);
  renderLatest(scenario);
  renderAlerts(scenario);
  renderTimeline(scenario);
  renderWindowBar(active());
  renderInspector(scenario);
  renderSelectedSignals(scenario);
  renderFlowDiagnostics(scenario);
}

function updateRangeControls() {
  state.rangeStart = Math.max(0, Math.min(state.rangeStart, DATA.prices.length - 2));
  state.rangeEnd = Math.max(state.rangeStart + 1, Math.min(state.rangeEnd, DATA.prices.length - 1));
  const start = document.getElementById("range-start");
  const end = document.getElementById("range-end");
  start.max = String(DATA.prices.length - 2);
  end.max = String(DATA.prices.length - 1);
  start.value = String(state.rangeStart);
  end.value = String(state.rangeEnd);
  document.getElementById("range-readout").textContent = `${state.rangeStart} - ${state.rangeEnd}`;
}

function selectedRow(scenario) {
  return state.selectedIndex === null
    ? scenario.rows.at(-1)
    : scenario.rows.find(row => row.index === state.selectedIndex) ?? scenario.rows.at(-1);
}

function setSelectedIndex(index, rerender = true) {
  state.selectedIndex = Number(index);
  if (rerender) requestScopedRender();
}

function renderChart(scenario) {
  const prices = DATA.prices;
  const width = 1000, height = 560, left = 54, right = 24, top = 28, bottom = 48;
  const start = state.rangeStart;
  const end = state.rangeEnd;
  const visiblePrices = prices.slice(start, end + 1);
  const minPrice = Math.min(...visiblePrices);
  const maxPrice = Math.max(...visiblePrices);
  const priceRange = Math.max(maxPrice - minPrice, 1e-12);
  const rows = new Map(scenario.rows.map(row => [row.index, row]));
  const sx = index => left + ((index - start) / Math.max(end - start, 1)) * (width - left - right);
  const sy = price => top + (1 - ((price - minPrice) / priceRange)) * (height - top - bottom);
  const nodes = [];

  for (let step = 0; step < 5; step++) {
    const y = top + step * (height - top - bottom) / 4;
    const price = maxPrice - step * priceRange / 4;
    nodes.push(`<line x1="${left}" y1="${y.toFixed(2)}" x2="${width - right}" y2="${y.toFixed(2)}" stroke="var(--soft)" />`);
    nodes.push(`<text x="8" y="${(y + 4).toFixed(2)}" font-size="12" fill="var(--muted)">${price.toFixed(2)}</text>`);
  }

  for (let index = start + 1; index <= end; index++) {
    const row = rows.get(index);
    const color = row ? DATA.colors[row.label] : "#98a2b3";
    nodes.push(`<line x1="${sx(index - 1).toFixed(2)}" y1="${sy(prices[index - 1]).toFixed(2)}" x2="${sx(index).toFixed(2)}" y2="${sy(prices[index]).toFixed(2)}" stroke="${color}" stroke-width="3.2" stroke-linecap="round" />`);
  }

  scenario.rows.forEach(row => {
    const x = sx(row.index);
    const y = sy(prices[row.index]);
    const probability = row.probabilities[row.label] || 0;
    const fill = DATA.colors[row.label] || "#98a2b3";
    const isSelected = state.selectedIndex !== null && row.index === state.selectedIndex;
    const selectedClass = isSelected ? " is-selected" : "";
    const selectedOpacity = isSelected ? "1" : "0";
    const selectedRadius = isSelected ? "7.2" : "5.5";
    nodes.push(`<circle class="price-point${selectedClass}" data-index="${row.index}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${selectedRadius}" fill="${fill}" opacity="${selectedOpacity}" stroke="var(--ink)" stroke-width="1.5" data-tooltip="${escapeHtml(`obs: ${row.index}
price: ${prices[row.index].toFixed(2)}
regime: ${row.label}
prob: ${fmtPct(probability)}`)}" />`);
  });

  const axisY = height - bottom;
  const selected = state.selectedIndex === null ? null : selectedRow(scenario);
  if (selected) {
    const x = sx(selected.index);
    nodes.push(`<line x1="${x.toFixed(2)}" y1="${top}" x2="${x.toFixed(2)}" y2="${axisY}" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="5 5" opacity="0.82" />`);
  }

  nodes.push(`<line x1="${left}" y1="${axisY}" x2="${width - right}" y2="${axisY}" stroke="var(--line)" />`);
  nodes.push(`<text x="${left}" y="${height - 10}" font-size="12" fill="var(--muted)">${start}</text>`);
  nodes.push(`<text x="${width - right - 28}" y="${height - 10}" font-size="12" fill="var(--muted)">${end}</text>`);
  svg.innerHTML = nodes.join("");
  bindSvgTooltips(svg);
}

const surfaceCamera = { rotX: -0.62, rotY: 0.72, zoom: 1.0, dragging: false, lastX: 0, lastY: 0 };

function renderSurfaceChart(scenario) {
  drawSurface3D(scenario);
}

function surfaceThemeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function rotate3D(point) {
  const cosY = Math.cos(surfaceCamera.rotY);
  const sinY = Math.sin(surfaceCamera.rotY);
  const cosX = Math.cos(surfaceCamera.rotX);
  const sinX = Math.sin(surfaceCamera.rotX);
  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const y1 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;
  return { x: x1, y: y1, z: z2 };
}

function project3D(point) {
  const rotated = rotate3D(point);
  const distance = 4.2;
  const perspective = distance / (distance + rotated.z);
  const scale = 200 * surfaceCamera.zoom * perspective;
  return {
    x: surfaceCanvas.width / 2 - 58 + rotated.x * scale,
    y: surfaceCanvas.height / 2 + rotated.y * scale + 22,
    z: rotated.z,
    perspective,
  };
}

function drawLine3D(a, b, color, width = 1, alpha = 1) {
  const pa = project3D(a);
  const pb = project3D(b);
  surfaceContext.save();
  surfaceContext.globalAlpha = alpha;
  surfaceContext.strokeStyle = color;
  surfaceContext.lineWidth = width;
  surfaceContext.beginPath();
  surfaceContext.moveTo(pa.x, pa.y);
  surfaceContext.lineTo(pb.x, pb.y);
  surfaceContext.stroke();
  surfaceContext.restore();
}

function drawSurface3D(scenario) {
  const ctx = surfaceContext;
  const rows = scenario.rows;
  const surfacePayload = scenario.volatility_surface;
  if (!surfacePayload?.grid?.length) return;
  const minReturn = surfacePayload.min_return;
  const maxReturn = surfacePayload.max_return;
  const minVol = surfacePayload.min_vol;
  const maxVol = surfacePayload.max_vol;
  const returnRange = Math.max(maxReturn - minReturn, 1e-12);
  const volRange = Math.max(maxVol - minVol, 1e-12);
  const bounds = { xMin: -1.12, xMax: 1.12, yMin: -0.80, yMax: 0.80, zMin: 0, zMax: 1.30 };
  const timeBins = surfacePayload.time_bins;
  const returnBins = surfacePayload.return_bins;
  const surface = surfacePayload.grid;

  ctx.clearRect(0, 0, surfaceCanvas.width, surfaceCanvas.height);
  ctx.fillStyle = surfaceThemeColor("--panel-2") || "#151a23";
  ctx.fillRect(0, 0, surfaceCanvas.width, surfaceCanvas.height);

  const lineColor = surfaceThemeColor("--line") || "#293241";
  const mutedColor = surfaceThemeColor("--muted") || "#9aa4b2";
  const inkColor = surfaceThemeColor("--ink") || "#f5f7fb";
  const gridColor = document.documentElement.dataset.theme === "dark" ? "rgba(180, 190, 205, 0.24)" : "rgba(60, 70, 84, 0.28)";
  const boxColor = document.documentElement.dataset.theme === "dark" ? "rgba(235, 240, 248, 0.70)" : "rgba(20, 24, 32, 0.72)";

  function label3D(point, text, dx = 0, dy = 0, align = "center") {
    const projected = project3D(point);
    ctx.save();
    ctx.fillStyle = inkColor;
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.textAlign = align;
    ctx.fillText(text, projected.x + dx, projected.y + dy);
    ctx.restore();
  }

  for (let step = 0; step <= 5; step++) {
    const ratio = step / 5;
    const x = bounds.xMin + ratio * (bounds.xMax - bounds.xMin);
    const y = bounds.yMin + ratio * (bounds.yMax - bounds.yMin);
    const z = bounds.zMin + ratio * (bounds.zMax - bounds.zMin);
    drawLine3D({ x, y: bounds.yMin, z: bounds.zMin }, { x, y: bounds.yMax, z: bounds.zMin }, gridColor, 1, 1);
    drawLine3D({ x, y: bounds.yMax, z: bounds.zMin }, { x, y: bounds.yMax, z: bounds.zMax }, gridColor, 1, 1);
    drawLine3D({ x: bounds.xMin, y, z: bounds.zMin }, { x: bounds.xMax, y, z: bounds.zMin }, gridColor, 1, 1);
    drawLine3D({ x: bounds.xMax, y, z: bounds.zMin }, { x: bounds.xMax, y, z: bounds.zMax }, gridColor, 1, 1);
    drawLine3D({ x: bounds.xMin, y: bounds.yMax, z }, { x: bounds.xMax, y: bounds.yMax, z }, gridColor, 1, 1);
    drawLine3D({ x: bounds.xMax, y: bounds.yMin, z }, { x: bounds.xMax, y: bounds.yMax, z }, gridColor, 1, 1);
  }

  const corners = [
    { x: bounds.xMin, y: bounds.yMin, z: bounds.zMin },
    { x: bounds.xMax, y: bounds.yMin, z: bounds.zMin },
    { x: bounds.xMax, y: bounds.yMax, z: bounds.zMin },
    { x: bounds.xMin, y: bounds.yMax, z: bounds.zMin },
    { x: bounds.xMin, y: bounds.yMin, z: bounds.zMax },
    { x: bounds.xMax, y: bounds.yMin, z: bounds.zMax },
    { x: bounds.xMax, y: bounds.yMax, z: bounds.zMax },
    { x: bounds.xMin, y: bounds.yMax, z: bounds.zMax },
  ];
  [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(([a, b]) => {
    drawLine3D(corners[a], corners[b], boxColor, 1.6, 1);
  });

  const faces = [];
  for (let xi = 0; xi < timeBins - 1; xi++) {
    for (let yi = 0; yi < returnBins - 1; yi++) {
      const p00 = surface[xi][yi];
      const p10 = surface[xi + 1][yi];
      const p11 = surface[xi + 1][yi + 1];
      const p01 = surface[xi][yi + 1];
      faces.push({
        points: [p00, p10, p11, p01],
        depth: (project3D(p00).z + project3D(p10).z + project3D(p11).z + project3D(p01).z) / 4,
        height: (p00.z + p10.z + p11.z + p01.z) / 4,
      });
    }
  }

  faces.sort((a, b) => a.depth - b.depth).forEach(face => {
    const projected = face.points.map(project3D);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    projected.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = surfaceColor(face.height / 1.45);
    ctx.globalAlpha = 0.74;
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();
  });

  for (let xi = 0; xi < timeBins; xi += 3) {
    for (let yi = 0; yi < returnBins; yi += 3) {
      drawLine3D({ x: surface[xi][yi].x, y: surface[xi][yi].y, z: 0 }, surface[xi][yi], surfaceColor(surface[xi][yi].z / 1.45), 0.8, 0.24);
    }
  }

  for (let step = 0; step <= 5; step++) {
    const ratio = step / 5;
    const x = bounds.xMin + ratio * (bounds.xMax - bounds.xMin);
    const y = bounds.yMin + ratio * (bounds.yMax - bounds.yMin);
    const z = bounds.zMin + ratio * (bounds.zMax - bounds.zMin);
    const timeValue = Math.round(rows[0].index + ratio * (rows.at(-1).index - rows[0].index));
    const returnValue = maxReturn - ratio * returnRange;
    const volValue = minVol + ratio * volRange;
    label3D({ x, y: bounds.yMax + 0.13, z: bounds.zMin }, String(timeValue), 0, 18);
    label3D({ x: bounds.xMin - 0.10, y, z: bounds.zMin }, fmtPct(returnValue), -12, 4, "right");
    label3D({ x: bounds.xMin - 0.10, y: bounds.yMax, z }, fmtPct(volValue), -12, 4, "right");
  }

  ctx.fillStyle = mutedColor;
  ctx.font = "14px Inter, system-ui, sans-serif";
  const xLabel = project3D({ x: bounds.xMax + 0.26, y: bounds.yMax + 0.08, z: 0 });
  const yLabel = project3D({ x: bounds.xMin - 0.18, y: bounds.yMin - 0.20, z: 0 });
  const zLabel = project3D({ x: bounds.xMin - 0.18, y: bounds.yMax, z: bounds.zMax + 0.22 });
  ctx.fillText("time", xLabel.x, xLabel.y);
  ctx.fillText("return", yLabel.x - 20, yLabel.y);
  ctx.fillText("volatility", zLabel.x + 8, zLabel.y);
  ctx.fillText(`return: ${fmtPct(minReturn)} to ${fmtPct(maxReturn)}`, 18, 28);
  ctx.fillText(`vol: ${fmtPct(minVol)} to ${fmtPct(maxVol)}`, 18, 48);
  drawSurfaceColorbar(minVol, maxVol, inkColor, mutedColor);
  ctx.fillStyle = inkColor;
  ctx.font = "600 13px Inter, system-ui, sans-serif";
  ctx.fillText("Surface height is interpolated volatility across time and return bins.", 18, surfaceCanvas.height - 20);
}

function drawSurfaceColorbar(minVol, maxVol, inkColor, mutedColor) {
  const ctx = surfaceContext;
  const width = 16;
  const height = Math.min(320, surfaceCanvas.height - 164);
  const x = surfaceCanvas.width - 82;
  const y = (surfaceCanvas.height - height) / 2;
  const steps = 72;

  for (let step = 0; step < steps; step++) {
    const ratio = step / (steps - 1);
    ctx.fillStyle = surfaceColor(1 - ratio);
    ctx.fillRect(x, y + ratio * height, width, Math.ceil(height / steps) + 1);
  }

  ctx.strokeStyle = mutedColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = inkColor;
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("vol", x - 2, y - 12);

  [0, 0.5, 1].forEach(ratio => {
    const value = maxVol - ratio * (maxVol - minVol);
    const tickY = y + ratio * height;
    ctx.strokeStyle = mutedColor;
    ctx.beginPath();
    ctx.moveTo(x + width, tickY);
    ctx.lineTo(x + width + 6, tickY);
    ctx.stroke();
    ctx.fillText(fmtPct(value), x + width + 10, tickY + 4);
  });
}

function surfaceColor(value) {
  const clamped = Math.max(0, Math.min(1, value));
  const stops = [
    [0.00, [8, 24, 58]],
    [0.18, [13, 49, 104]],
    [0.38, [20, 84, 157]],
    [0.58, [32, 128, 202]],
    [0.78, [68, 178, 228]],
    [1.00, [158, 221, 255]],
  ];
  for (let index = 1; index < stops.length; index++) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (clamped <= current[0]) {
      const span = current[0] - previous[0];
      const ratio = span === 0 ? 0 : (clamped - previous[0]) / span;
      const rgb = current[1].map((channel, channelIndex) =>
        Math.round(previous[1][channelIndex] + (channel - previous[1][channelIndex]) * ratio)
      );
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }
  return "rgb(190, 0, 0)";
}

function renderProbabilityHeatmap(scenario) {
  const labels = regimeLabels(scenario);
  const frameWidth = probabilityHeatmapSvg.parentElement?.clientWidth || 1000;
  const width = Math.max(1000, frameWidth - 28, scenario.rows.length * 26 + 130);
  const height = 260, left = 78, right = 18, top = 8, bottom = 34;
  const cellWidth = (width - left - right) / Math.max(scenario.rows.length, 1);
  const cellHeight = (height - top - bottom) / Math.max(labels.length, 1);
  const nodes = [];
  probabilityHeatmapSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  probabilityHeatmapSvg.style.width = `${width}px`;
  probabilityHeatmapSvg.style.minWidth = "100%";

  labels.forEach((label, rowIdx) => {
    const y = top + rowIdx * cellHeight;
    nodes.push(`<text x="8" y="${(y + cellHeight * 0.62).toFixed(2)}" font-size="12" fill="var(--muted)">${escapeHtml(label)}</text>`);
    scenario.rows.forEach((row, colIdx) => {
      const value = row.probabilities[label] || 0;
      const x = left + colIdx * cellWidth;
      const color = DATA.colors[label] || "#7dd3fc";
      const isSelected = state.selectedIndex !== null && row.index === state.selectedIndex;
      const selectedClass = isSelected ? " is-selected" : "";
      nodes.push(`<rect class="heatmap-cell${selectedClass}" data-index="${row.index}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(cellWidth, 1).toFixed(2)}" height="${Math.max(cellHeight - 1, 1).toFixed(2)}" fill="${color}" opacity="${(0.16 + value * 0.84).toFixed(3)}" stroke="${isSelected ? "var(--ink)" : "transparent"}" stroke-width="1.5" data-tooltip="${escapeHtml(`obs: ${row.index}
regime: ${label}
prob: ${fmtPct(value)}`)}" />`);
    });
  });

  const tickCount = Math.min(8, scenario.rows.length);
  for (let tick = 0; tick < tickCount; tick++) {
    const rowIndex = Math.round(tick * (scenario.rows.length - 1) / Math.max(tickCount - 1, 1));
    const row = scenario.rows[rowIndex];
    const x = left + rowIndex * cellWidth + cellWidth / 2;
    nodes.push(`<line x1="${x.toFixed(2)}" y1="${height - bottom}" x2="${x.toFixed(2)}" y2="${height - bottom + 6}" stroke="var(--muted)" />`);
    nodes.push(`<text x="${x.toFixed(2)}" y="${height - 16}" text-anchor="middle" font-size="11" fill="var(--muted)">${row.index}</text>`);
  }
  probabilityHeatmapSvg.innerHTML = nodes.join("");
  bindSvgTooltips(probabilityHeatmapSvg);
}

function renderTransitionHeatmap(scenario) {
  const matrix = scenario.transition_matrix;
  const width = Math.round(1000 * dashboardState.transitionZoom);
  const height = Math.round(380 * dashboardState.transitionZoom);
  const left = 70 * dashboardState.transitionZoom;
  const top = 42 * dashboardState.transitionZoom;
  const right = 118 * dashboardState.transitionZoom;
  const bottom = 20 * dashboardState.transitionZoom;
  const n = Math.max(matrix.length, 1);
  const cellSize = Math.min((width - left - right) / n, (height - top - bottom) / n);
  const offsetX = left + ((width - left - right) - cellSize * n) / 2;
  const offsetY = top + ((height - top - bottom) - cellSize * n) / 2;
  const nodes = [];
  transitionHeatmapSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  transitionHeatmapSvg.style.width = `${width}px`;

  for (let idx = 0; idx < n; idx++) {
    nodes.push(`<text x="${(offsetX + idx * cellSize + cellSize / 2).toFixed(2)}" y="${(offsetY - 14 * dashboardState.transitionZoom).toFixed(2)}" text-anchor="middle" font-size="${12 * dashboardState.transitionZoom}" fill="var(--muted)">S${idx}</text>`);
    nodes.push(`<text x="${(offsetX - 42 * dashboardState.transitionZoom).toFixed(2)}" y="${(offsetY + idx * cellSize + cellSize / 2 + 4).toFixed(2)}" font-size="${12 * dashboardState.transitionZoom}" fill="var(--muted)">S${idx}</text>`);
  }

  matrix.forEach((row, rowIdx) => {
    row.forEach((value, colIdx) => {
      const x = offsetX + colIdx * cellSize;
      const y = offsetY + rowIdx * cellSize;
      nodes.push(`<rect class="transition-cell" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cellSize - 2).toFixed(2)}" height="${(cellSize - 2).toFixed(2)}" rx="${4 * dashboardState.transitionZoom}" fill="${surfaceColor(value)}" stroke="transparent" stroke-width="${2 * dashboardState.transitionZoom}" data-tooltip="${escapeHtml(`from S${rowIdx} to S${colIdx}
prob: ${fmtPct(value)}`)}" />`);
      nodes.push(`<text x="${(x + cellSize / 2).toFixed(2)}" y="${(y + cellSize / 2 + 4 * dashboardState.transitionZoom).toFixed(2)}" text-anchor="middle" font-size="${11 * dashboardState.transitionZoom}" fill="${value > 0.82 ? "#07111f" : "#ffffff"}">${fmtPct(value)}</text>`);
    });
  });

  nodes.push(...transitionColorbarNodes(
    offsetX + cellSize * n + 34 * dashboardState.transitionZoom,
    offsetY,
    16 * dashboardState.transitionZoom,
    cellSize * n,
    dashboardState.transitionZoom,
  ));
  transitionHeatmapSvg.innerHTML = nodes.join("");
  bindSvgTooltips(transitionHeatmapSvg);
}

function transitionColorbarNodes(x, y, width, height, scale) {
  const nodes = [];
  const steps = 60;
  for (let step = 0; step < steps; step++) {
    const ratio = step / (steps - 1);
    nodes.push(`<rect x="${x.toFixed(2)}" y="${(y + ratio * height).toFixed(2)}" width="${width.toFixed(2)}" height="${Math.ceil(height / steps) + 1}" fill="${surfaceColor(1 - ratio)}" />`);
  }
  nodes.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="none" stroke="var(--muted)" />`);
  nodes.push(`<text x="${(x - 2 * scale).toFixed(2)}" y="${(y - 10 * scale).toFixed(2)}" font-size="${11 * scale}" fill="var(--muted)">prob.</text>`);
  [[0, "100.00%"], [0.5, "50.00%"], [1, "0.00%"]].forEach(([ratio, label]) => {
    const tickY = y + ratio * height;
    nodes.push(`<line x1="${(x + width).toFixed(2)}" y1="${tickY.toFixed(2)}" x2="${(x + width + 6 * scale).toFixed(2)}" y2="${tickY.toFixed(2)}" stroke="var(--muted)" />`);
    nodes.push(`<text x="${(x + width + 10 * scale).toFixed(2)}" y="${(tickY + 4 * scale).toFixed(2)}" font-size="${11 * scale}" fill="var(--muted)">${label}</text>`);
  });
  return nodes;
}

function renderLegend(scenario) {
  const labels = [...new Set(scenario.rows.map(row => row.label))].sort();
  document.getElementById("legend").innerHTML = labels.map(label =>
    `<span><i class="swatch" style="background:${DATA.colors[label]}"></i>${escapeHtml(label)}</span>`
  ).join("");
}

function renderSummary(scenario) {
  document.getElementById("summary-body").innerHTML = Object.entries(scenario.summary).sort().map(([label, stats]) =>
    `<tr><td><span class="swatch" style="background:${DATA.colors[label]}"></span> ${escapeHtml(label)}</td><td>${fmtPct(stats.share)}</td><td>${fmtPct(stats.avg_probability)}</td><td>${fmtPct(stats.avg_mean_return)}</td><td>${fmtPct(stats.avg_volatility)}</td></tr>`
  ).join("");
}

function renderSelection(scenario) {
  const entries = Object.entries(scenario.selection_scores);
  document.getElementById("selection-body").innerHTML = entries.length
    ? entries.sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, score]) => `<tr><td>K=${k}</td><td>${score.toFixed(4)}</td></tr>`).join("")
    : [
        ["AIC", "Akaike information criterion"],
        ["BIC", "Bayesian information criterion"],
        ["ICL", "Integrated completed likelihood"],
      ].map(([key, label]) => `<tr><td>${key} <span class="panel-note">(${label})</span></td><td>${scenario.information_criteria[key.toLowerCase()].toFixed(2)}</td></tr>`).join("");
}

function renderTransition(scenario) {
  const header = `<tr><th></th>${scenario.transition_matrix.map((_, idx) => `<th>S${idx}</th>`).join("")}</tr>`;
  const rows = scenario.transition_matrix.map((row, idx) =>
    `<tr><th>S${idx}</th>${row.map(value => `<td>${fmtPct(value)}</td>`).join("")}</tr>`
  ).join("");
  document.getElementById("transition-body").innerHTML = header + rows;
}

function renderLatest(scenario) {
  document.getElementById("latest-body").innerHTML = scenario.rows.slice(-10).map(row =>
    `<tr><td>${row.index}</td><td>${escapeHtml(row.label)}</td><td>${fmtPct(row.probabilities[row.label])}</td></tr>`
  ).join("");
}

function renderAlerts(scenario) {
  const cards = scenario.alerts || [];
  document.getElementById("alert-strip").innerHTML = cards.map(({ label, value, help }) =>
    `<div class="alert-card"><div class="card-top"><span>${escapeHtml(label)}</span><button class="info-btn" type="button" data-info-title="${escapeHtml(label)}" data-info-body="${escapeHtml(help)}" aria-label="Explain ${escapeHtml(label)}">i</button></div><strong>${escapeHtml(value)}</strong></div>`
  ).join("");
  bindInfoButtons(document.getElementById("alert-strip"));
}

function renderTimeline(scenario) {
  const timeline = document.getElementById("regime-timeline");
  timeline.innerHTML = scenario.rows.map(row => {
    const color = DATA.colors[row.label] || "#7dd3fc";
    const selectedClass = state.selectedIndex !== null && row.index === state.selectedIndex ? " is-selected" : "";
    return `<button class="timeline-segment${selectedClass}" data-index="${row.index}" style="background:${color}" title="obs ${row.index} | ${escapeHtml(row.label)} | ${fmtPct(row.probabilities[row.label] || 0)}"></button>`;
  }).join("");
  timeline.querySelectorAll(".timeline-segment").forEach(segment => {
    segment.addEventListener("click", () => setSelectedIndex(segment.dataset.index));
  });
}

function renderWindowBar(fullScenario) {
  const width = 1000, height = 42, top = 10, barHeight = 16;
  const rowByIndex = new Map(fullScenario.rows.map(row => [row.index, row]));
  const nodes = [];
  const cellWidth = width / Math.max(DATA.prices.length, 1);
  for (let index = 0; index < DATA.prices.length; index++) {
    const row = rowByIndex.get(index);
    const label = row?.label || "outside";
    const color = row ? (DATA.colors[label] || "#7dd3fc") : "#667085";
    const active = index >= state.rangeStart && index <= state.rangeEnd;
    nodes.push(`<rect class="window-cell${active ? " is-active" : ""}" x="${(index * cellWidth).toFixed(2)}" y="${top}" width="${Math.max(cellWidth, 1).toFixed(2)}" height="${barHeight}" fill="${color}" />`);
  }
  const x = state.rangeStart * cellWidth;
  const w = (state.rangeEnd - state.rangeStart + 1) * cellWidth;
  nodes.push(`<rect x="${x.toFixed(2)}" y="${top - 5}" width="${w.toFixed(2)}" height="${barHeight + 10}" fill="none" stroke="var(--ink)" stroke-width="2" rx="4" />`);
  nodes.push(`<text x="8" y="38" font-size="11" fill="var(--muted)">window ${state.rangeStart}-${state.rangeEnd}</text>`);
  windowBarSvg.innerHTML = nodes.join("");
}

function renderInspector(scenario) {
  const row = selectedRow(scenario);
  if (!row) return;
  const price = DATA.prices[row.index] ?? 0;
  const returnValue = row.features?.mean_return ?? 0;
  const volatility = row.features?.volatility ?? 0;
  const dominantProb = row.probabilities[row.label] || 0;
  const viterbi = row.viterbi_label || row.label;
  document.getElementById("inspector-note").textContent = `obs ${row.index}`;
  document.getElementById("inspector-kv").innerHTML = [
    ["Observation", row.index],
    ["Price", price.toFixed(2)],
    ["Regime", row.label],
    ["Hidden State", `S${row.cluster}`],
    ["Viterbi Path", viterbi],
    ["Dominant Prob.", fmtPct(dominantProb)],
    ["Uncertainty", fmtPct(row.uncertainty || 0)],
    ["Avg Return", fmtPct(returnValue)],
    ["Volatility", fmtPct(volatility)],
  ].map(([label, value]) => `<div class="kv"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");

  document.getElementById("inspector-probabilities").innerHTML = regimeLabels(scenario)
    .map(label => {
      const value = row.probabilities[label] || 0;
      return `
      <div class="prob-row">
        <span>${escapeHtml(label)}</span>
        <div class="prob-track"><div class="prob-fill" style="width:${(value * 100).toFixed(2)}%; background:${DATA.colors[label] || "#7dd3fc"}"></div></div>
        <strong>${fmtPct(value)}</strong>
      </div>
    `;
    }).join("");
}

function renderSelectedSignals(scenario) {
  const cards = scenario.selected_signals || [];
  document.getElementById("selected-signal-grid").innerHTML = cards.map(({ label, value, level = 0, help }) =>
    `<div class="signal-card"><div class="card-top"><span>${escapeHtml(label)}</span><button class="info-btn" type="button" data-info-title="${escapeHtml(label)}" data-info-body="${escapeHtml(help)}" aria-label="Explain ${escapeHtml(label)}">i</button></div><strong>${escapeHtml(value)}</strong><div class="signal-meter"><i style="width:${Math.max(3, level * 100).toFixed(1)}%"></i></div></div>`
  ).join("");
  bindInfoButtons(document.getElementById("selected-signal-grid"));
}

function renderFlowDiagnostics(scenario) {
  const cards = scenario.flow_diagnostics || [];
  document.getElementById("flow-diagnostics").innerHTML = cards.map(({ label, value, level = 0, help }) =>
    `<div class="flow-card"><div class="card-top"><span>${escapeHtml(label)}</span><button class="info-btn" type="button" data-info-title="${escapeHtml(label)}" data-info-body="${escapeHtml(help)}" aria-label="Explain ${escapeHtml(label)}">i</button></div><strong>${escapeHtml(value)}</strong><div class="signal-meter"><i style="width:${Math.max(3, level * 100).toFixed(1)}%"></i></div></div>`
  ).join("");
  bindInfoButtons(document.getElementById("flow-diagnostics"));
}

function commandItems() {
  const scenarios = Object.keys(DATA.scenarios).sort(compareScenarioKeys).map(key => ({
    label: key === "auto" ? "Set K: Auto" : `Set K: ${key}`,
    action: () => {
      state.scenario = key;
      document.getElementById("cluster-select").value = key;
      state.selectedIndex = null;
      requestScopedRender();
    },
  }));
  return [
    { label: "Toggle theme", action: () => document.getElementById("theme-toggle").click() },
    { label: "Jump to probability heatmap", action: () => probabilityHeatmapSvg.scrollIntoView({ behavior: "smooth", block: "center" }) },
    { label: "Jump to transition heatmap", action: () => transitionHeatmapSvg.scrollIntoView({ behavior: "smooth", block: "center" }) },
    { label: "Reset 3D surface camera", action: () => { surfaceCamera.rotX = -0.62; surfaceCamera.rotY = 0.72; surfaceCamera.zoom = 1.0; drawSurface3D(activeScoped()); } },
    { label: "Export probabilities CSV", action: () => exportScenario("csv") },
    { label: "Export model JSON", action: () => exportScenario("json") },
    ...scenarios,
  ];
}

function openCommandPalette() {
  commandOverlay.classList.add("is-open");
  commandSearch.value = "";
  renderCommands();
  commandSearch.focus();
}

function closeCommandPalette() {
  commandOverlay.classList.remove("is-open");
}

function openInfoModal(title, body) {
  infoTitle.textContent = title;
  infoBody.textContent = body;
  infoOverlay.classList.add("is-open");
}

function closeInfoModal() {
  infoOverlay.classList.remove("is-open");
}

function renderCommands() {
  const query = commandSearch.value.trim().toLowerCase();
  const items = commandItems().filter(item => item.label.toLowerCase().includes(query));
  commandList.innerHTML = items.map((item, index) =>
    `<button class="command-item" type="button" data-command-index="${index}">${escapeHtml(item.label)}</button>`
  ).join("");
  commandList.querySelectorAll(".command-item").forEach(button => {
    button.addEventListener("click", () => {
      const item = items[Number(button.dataset.commandIndex)];
      closeCommandPalette();
      item.action();
    });
  });
}

function exportScenario(kind) {
  const scenario = activeScoped();
  if (kind === "json") {
    downloadText(`regime-model-${state.scenario}.json`, JSON.stringify(scenario, null, 2), "application/json");
    return;
  }
  const labels = regimeLabels(scenario);
  const header = ["obs", "price", "regime", "hidden_state", "viterbi_label", "uncertainty", ...labels.map(label => `prob_${label}`)];
  const lines = [header.join(",")];
  scenario.rows.forEach(row => {
    const values = [
      row.index,
      DATA.prices[row.index] ?? "",
      row.label,
      row.cluster,
      row.viterbi_label || row.label,
      row.uncertainty || 0,
      ...labels.map(label => row.probabilities[label] || 0),
    ];
    lines.push(values.map(csvValue).join(","));
  });
  downloadText(`regime-probabilities-${state.scenario}.csv`, lines.join("\n"), "text/csv");
}

function csvValue(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function enhancePanels() {
  document.querySelectorAll(".panel").forEach(panel => {
    const head = panel.querySelector(".panel-head");
    if (!head || head.dataset.enhanced === "true") return;
    head.dataset.enhanced = "true";
    const tools = document.createElement("span");
    tools.className = "panel-tools";
      const title = head.querySelector("h2")?.textContent?.trim() || "Panel";
      const existingRight = [...head.children].find(child => child !== head.querySelector("h2"));
      if (existingRight) tools.appendChild(existingRight);
      const info = document.createElement("button");
      info.type = "button";
      info.className = "info-btn";
      info.textContent = "i";
      info.setAttribute("aria-label", `Explain ${title}`);
      info.dataset.infoTitle = title;
      info.dataset.infoBody = panelHelp(title);
      info.addEventListener("click", event => {
        event.stopPropagation();
        openInfoModal(info.dataset.infoTitle, info.dataset.infoBody);
      });
      tools.appendChild(info);
      const full = document.createElement("button");
    full.type = "button";
    full.className = "icon-btn";
    full.title = "Toggle fullscreen";
    full.setAttribute("aria-label", "Toggle fullscreen");
    full.textContent = "⛶";
    full.addEventListener("click", () => {
      document.querySelectorAll(".panel.is-fullscreen").forEach(open => {
        if (open !== panel) open.classList.remove("is-fullscreen");
      });
      panel.classList.toggle("is-fullscreen");
      drawSurface3D(activeScoped());
    });
    tools.appendChild(full);
    head.appendChild(tools);
  });
}

function panelHelp(title) {
  const help = {
    "Regime Timeline": "Compact sequence of modeled observations colored by their dominant regime. Click a segment to inspect that observation, or use Full view to clear selection.",
    "Historical Price by Regime": "Original time series plotted as a price path. Segment colors show the dominant regime assigned to each modeled window.",
    "Regime Summary": "Aggregated statistics by regime: share of windows, average dominant probability, average return, and volatility.",
    "Model Selection Criteria": "Model diagnostics such as AIC, BIC, and ICL. Lower values are generally preferred when comparing model settings.",
    "Observation Inspector": "Detailed readout for the selected observation, including state, regime probability, uncertainty, return, and volatility.",
    "Regime Probability Heatmap": "Probability assigned to each regime over time. Stronger opacity means higher probability for that regime at that observation.",
    "Regime Flow Diagnostics": "Compact operational signals summarizing stability, average uncertainty, regime concentration, and transition pressure.",
    "Interactive 3D Return-Volatility Surface": "Three-dimensional view of volatility across time and return bins. Drag to rotate, wheel to zoom.",
    "Transition Heatmap": "Markov transition probabilities between hidden states. Larger/brighter cells indicate stronger transition channels.",
    "Markov Transition Matrix": "Numeric transition matrix behind the heatmap, shown as probabilities from each state to each next state.",
    "Latest Regime Probabilities": "Last modeled observations with their dominant regime and associated probability.",
  };
  return help[title] || "Analytical dashboard block generated from the current regime detection model.";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindSvgTooltips(root) {
  root.querySelectorAll("[data-tooltip]").forEach(element => {
    element.addEventListener("pointerenter", event => {
      if (element.classList.contains("price-point")) {
        element.setAttribute("opacity", "1");
        element.setAttribute("r", "6.8");
      }
      if (element.classList.contains("heatmap-cell") || element.classList.contains("transition-cell")) {
        element.setAttribute("stroke", "var(--ink)");
        element.setAttribute("filter", "brightness(1.2)");
      }
      tooltip.textContent = element.getAttribute("data-tooltip");
      tooltip.style.opacity = "1";
      moveTooltip(event);
    });
    element.addEventListener("pointermove", moveTooltip);
    element.addEventListener("pointerleave", () => {
      if (element.classList.contains("price-point") && !element.classList.contains("is-selected")) {
        element.setAttribute("opacity", "0");
        element.setAttribute("r", "5.5");
      }
      if ((element.classList.contains("heatmap-cell") || element.classList.contains("transition-cell")) && !element.classList.contains("is-selected")) {
        element.setAttribute("stroke", "transparent");
        element.removeAttribute("filter");
      }
      tooltip.style.opacity = "0";
    });
    element.addEventListener("click", () => {
      if (element.dataset.index !== undefined) setSelectedIndex(element.dataset.index);
    });
  });
}

function bindInfoButtons(root) {
  root.querySelectorAll(".info-btn").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      openInfoModal(button.dataset.infoTitle || "Metric", button.dataset.infoBody || "");
    });
  });
}

function moveTooltip(event) {
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
}

function heatColor(value) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = Math.round(26 + clamped * 42);
  const g = Math.round(64 + clamped * 130);
  const b = Math.round(104 + clamped * 96);
  return `rgb(${r}, ${g}, ${b})`;
}


init();