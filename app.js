/* global Chart */

const STORAGE_KEY = "jlm_weight_tracker_v1";
const AVATAR_KEY = "jlm_weight_tracker_avatar_v1";
const BG_KEY = "jlm_weight_tracker_bg_v1";

/** @typedef {{ heightCm:number, startWeightKg:number|null, targetWeightKg:number, updatedAt:number }} Profile */
/** @typedef {{ date:string, weightKg:number, createdAt:number }} Entry */
/** @typedef {{ profile: Profile|null, entries: Entry[] }} Store */

/** @returns {Store} */
function defaultStore() {
  return { profile: null, entries: [] };
}

/** @returns {Store} */
function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultStore();
    const profile = parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null;
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return {
      profile: sanitizeProfile(profile),
      entries: sanitizeEntries(entries),
    };
  } catch {
    return defaultStore();
  }
}

/** @param {Store} store */
function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** @param {any} profile */
function sanitizeProfile(profile) {
  if (!profile) return null;
  const heightCm = toNumber(profile.heightCm);
  const startWeightRaw = profile.startWeightKg;
  const startWeightKg =
    startWeightRaw === null || startWeightRaw === undefined || String(startWeightRaw).trim() === ""
      ? null
      : toNumber(startWeightRaw);
  const targetWeightKg = toNumber(profile.targetWeightKg);
  const updatedAt = typeof profile.updatedAt === "number" ? profile.updatedAt : Date.now();
  if (!isFinite(heightCm) || !isFinite(targetWeightKg)) return null;
  if (startWeightKg !== null && !isFinite(startWeightKg)) return null;
  return { heightCm, startWeightKg, targetWeightKg, updatedAt };
}

/** @param {any[]} entries */
function sanitizeEntries(entries) {
  /** @type {Entry[]} */
  const out = [];
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const date = typeof e.date === "string" ? e.date : "";
    const weightKg = toNumber(e.weightKg);
    const createdAt = typeof e.createdAt === "number" ? e.createdAt : Date.now();
    if (!isValidDateKey(date)) continue;
    if (!isFinite(weightKg)) continue;
    out.push({ date, weightKg, createdAt });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return dedupeByDate(out);
}

/** @param {Entry[]} entries */
function dedupeByDate(entries) {
  const map = new Map();
  for (const e of entries) map.set(e.date, e);
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** @param {unknown} v */
function toNumber(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const normalized = v.replace(/，/g, ",").replace(/,/g, ".").trim();
  return Number(normalized);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function signNumber(n) {
  if (!isFinite(n)) return "—";
  const r = round1(n);
  if (r > 0) return `+${r.toFixed(1)}`;
  if (r < 0) return `${r.toFixed(1)}`;
  return "0.0";
}

function fmt1(n) {
  if (!isFinite(n)) return "—";
  return round1(n).toFixed(1);
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isValidDateKey(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** @param {Profile} profile */
function validateProfile(profile) {
  const errors = {};
  if (!(profile.heightCm >= 50 && profile.heightCm <= 250)) errors.heightCm = "身高看起来不太对（50–250cm）";
  if (
    profile.startWeightKg !== null &&
    !(profile.startWeightKg >= 20 && profile.startWeightKg <= 300)
  ) {
    errors.startWeightKg = "起始体重看起来不太对（20–300kg）";
  }
  if (!(profile.targetWeightKg >= 20 && profile.targetWeightKg <= 300)) errors.targetWeightKg = "目标体重看起来不太对（20–300kg）";
  if (
    profile.startWeightKg !== null &&
    isFinite(profile.startWeightKg) &&
    isFinite(profile.targetWeightKg) &&
    profile.targetWeightKg >= profile.startWeightKg
  ) {
    errors.targetWeightKg = "目标体重需要小于起始体重（减脂目标）";
  }
  return errors;
}

/** @param {Entry} entry */
function validateEntry(entry) {
  const errors = {};
  if (!isValidDateKey(entry.date)) errors.date = "请选择正确日期";
  if (!(entry.weightKg >= 20 && entry.weightKg <= 300)) errors.weightKg = "体重看起来不太对（20–300kg）";
  return errors;
}

function calcBmi(weightKg, heightCm) {
  const hm = heightCm / 100;
  if (!(hm > 0)) return NaN;
  return weightKg / (hm * hm);
}

/** @param {Entry[]} entriesSortedAsc */
function buildDeltas(entriesSortedAsc) {
  /** @type {Record<string, number|null>} */
  const out = {};
  for (let i = 0; i < entriesSortedAsc.length; i++) {
    const cur = entriesSortedAsc[i];
    if (i === 0) out[cur.date] = null;
    else out[cur.date] = cur.weightKg - entriesSortedAsc[i - 1].weightKg;
  }
  return out;
}

function moodCopy({ delta, toGoal, hasProfile, hasEntry }) {
  if (!hasProfile) return "先把身高和目标填好，我们一起把路铺平。";
  if (!hasEntry) return "今天也可以很轻：先记录一下，就已经很棒。";
  if (!isFinite(delta)) return "第一条记录很重要：你已经开始了。";
  if (delta < -0.2) return "很稳的下降。别急，继续把节奏保持住。";
  if (delta > 0.2) return "今天有点波动也正常。睡好、喝够水，明天再看。";
  if (Math.abs(delta) <= 0.2) return "保持住了。稳定，也是进步的一种。";
  if (isFinite(toGoal) && toGoal <= 0) return "目标达成了。记得好好夸夸自己。";
  return "继续记录，数据会告诉你：你在变好。";
}

function toast(text) {
  const el = document.getElementById("statusLine");
  if (!el) return;
  el.textContent = text;
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => {
    if (el.textContent === text) el.textContent = "";
  }, 2600);
}
toast._t = 0;

/** DOM refs */
const $ = (id) => document.getElementById(id);

const elMoodLine = $("moodLine");
const elProfileStatus = $("profileStatus");
const elTodayStatus = $("todayStatus");

const inAvatar = $("avatarInput");
const inBg = $("bgInput");
const elBg = document.querySelector(".bg");

const settingsMenu = $("settingsMenu");
const settingsMenuOverlay = $("settingsMenuOverlay");
const btnSettings = $("settingsBtn");
const settingsBtnAvatar = $("settingsBtnAvatar");
const settingsBtnFallback = $("settingsBtnFallback");
const btnChangeAvatar = $("btnChangeAvatar");
const btnChangeBg = $("btnChangeBg");
const btnResetBg = $("btnResetBg");
const btnCloseSettings = $("btnCloseSettings");

const profileForm = $("profileForm");
const entryForm = $("entryForm");

const inHeight = $("heightCm");
const inStart = $("startWeightKg");
const inTarget = $("targetWeightKg");

const hintHeight = $("heightHint");
const hintStart = $("startHint");
const hintTarget = $("targetHint");

const inDate = $("entryDate");
const inWeight = $("entryWeightKg");
const hintDate = $("dateHint");
const hintWeight = $("weightHint");

const btnFillLatest = $("btnFillLatest");
const btnExportCsv = $("btnExportCsv");
const btnImportCsv = $("btnImportCsv");
const inImportCsv = $("importCsvInput");
const btnClearAll = $("btnClearAll");

const metricBmi = $("metricBmi");
const metricBmiSub = $("metricBmiSub");
const metricDelta = $("metricDelta");
const metricDeltaSub = $("metricDeltaSub");
const metricToGoal = $("metricToGoal");
const metricToGoalSub = $("metricToGoalSub");
const chartMeta = $("chartMeta");
const historyMeta = $("historyMeta");
const historyTbody = $("historyTbody");

/** @type {Store} */
let store = loadStore();

/** @type {Chart|null} */
let chart = null;

function loadAvatar() {
  try {
    const v = localStorage.getItem(AVATAR_KEY);
    return typeof v === "string" && v.startsWith("data:image/") ? v : "";
  } catch {
    return "";
  }
}

function saveAvatar(dataUrl) {
  if (!dataUrl) localStorage.removeItem(AVATAR_KEY);
  else localStorage.setItem(AVATAR_KEY, dataUrl);
}

function renderAvatar() {
  const dataUrl = loadAvatar();
  if (dataUrl) {
    settingsBtnAvatar.src = dataUrl;
    settingsBtnAvatar.style.display = "block";
    settingsBtnFallback.style.display = "none";
  } else {
    settingsBtnAvatar.removeAttribute("src");
    settingsBtnAvatar.style.display = "none";
    settingsBtnFallback.style.display = "inline";
  }
}

function loadBgImage() {
  try {
    const v = localStorage.getItem(BG_KEY);
    return typeof v === "string" && v.startsWith("data:image/") ? v : "";
  } catch {
    return "";
  }
}

function saveBgImage(dataUrl) {
  if (!dataUrl) localStorage.removeItem(BG_KEY);
  else localStorage.setItem(BG_KEY, dataUrl);
}

function renderBgImage() {
  const dataUrl = loadBgImage();
  if (!elBg) return;
  if (!dataUrl) {
    elBg.style.removeProperty("background");
    elBg.style.removeProperty("backgroundBlendMode");
    elBg.style.removeProperty("filter");
    return;
  }
  elBg.style.backgroundBlendMode = "multiply";
  elBg.style.background =
    `linear-gradient(180deg, rgba(11,16,32,.35), rgba(11,16,32,.72)), url(${dataUrl}) center/cover no-repeat`;
}

async function fileToSmallDataUrl(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) throw new Error("not_image");

  const bitmap = await createImageBitmap(file);
  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("no_ctx");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const quality = 0.86;
  try {
    return canvas.toDataURL("image/webp", quality);
  } catch {
    return canvas.toDataURL("image/jpeg", quality);
  }
}

async function fileToBgDataUrl(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) throw new Error("not_image");

  const bitmap = await createImageBitmap(file);
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("no_ctx");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const quality = 0.76;
  try {
    return canvas.toDataURL("image/webp", quality);
  } catch {
    return canvas.toDataURL("image/jpeg", quality);
  }
}

function setHint(el, msg) {
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("error", Boolean(msg));
}

function clearHints() {
  setHint(hintHeight, "");
  setHint(hintStart, "");
  setHint(hintTarget, "");
  setHint(hintDate, "");
  setHint(hintWeight, "");
}

function getEntriesAsc() {
  return [...store.entries].sort((a, b) => a.date.localeCompare(b.date));
}

function getLatestEntry() {
  const entriesAsc = getEntriesAsc();
  return entriesAsc.length ? entriesAsc[entriesAsc.length - 1] : null;
}

function upsertEntry(entry) {
  const entries = dedupeByDate([...store.entries.filter((e) => e.date !== entry.date), entry]);
  store = { ...store, entries };
  saveStore(store);
}

function deleteEntry(date) {
  store = { ...store, entries: store.entries.filter((e) => e.date !== date) };
  saveStore(store);
}

function clearAll() {
  store = defaultStore();
  saveStore(store);
}

function setProfile(profile) {
  store = { ...store, profile: { ...profile, updatedAt: Date.now() } };
  saveStore(store);
}

function renderProfileForm() {
  if (store.profile) {
    inHeight.value = String(store.profile.heightCm ?? "");
    inStart.value = String(store.profile.startWeightKg ?? "");
    inTarget.value = String(store.profile.targetWeightKg ?? "");
    elProfileStatus.textContent = "已保存";
  } else {
    elProfileStatus.textContent = "未保存";
  }
}

function renderEntryForm() {
  inDate.value = inDate.value || todayKey();
  const date = inDate.value;
  const found = store.entries.find((e) => e.date === date);
  if (found) {
    elTodayStatus.textContent = "已存在，保存将覆盖";
    elTodayStatus.classList.remove("badgeSoft");
  } else {
    elTodayStatus.textContent = "待记录";
    elTodayStatus.classList.add("badgeSoft");
  }
}

function renderMetricsAndMood() {
  const profile = store.profile;
  const latest = getLatestEntry();
  const entriesAsc = getEntriesAsc();
  const deltas = buildDeltas(entriesAsc);

  const hasProfile = Boolean(profile);
  const hasEntry = Boolean(latest);

  const bmi = profile && latest ? calcBmi(latest.weightKg, profile.heightCm) : NaN;
  const delta = latest ? deltas[latest.date] : NaN;
  const toGoal = profile && latest ? latest.weightKg - profile.targetWeightKg : NaN;

  metricBmi.textContent = isFinite(bmi) ? fmt1(bmi) : "—";
  metricBmiSub.textContent = isFinite(bmi) ? "BMI（1 位小数）" : "先保存身高与体重";

  metricDelta.textContent = latest && delta === null ? "—" : isFinite(delta) ? signNumber(delta) : "—";
  metricDeltaSub.textContent = latest && delta === null ? "从第二条开始计算" : "最新记录 vs 前一条";

  if (isFinite(toGoal)) {
    const v = round1(toGoal);
    metricToGoal.textContent = `${v.toFixed(1)}`;
    metricToGoalSub.textContent = v > 0 ? "还差（kg）" : "已到达/低于目标（kg）";
  } else {
    metricToGoal.textContent = "—";
    metricToGoalSub.textContent = "需要目标体重";
  }

  const mood = moodCopy({
    delta: delta === null ? NaN : delta,
    toGoal,
    hasProfile,
    hasEntry,
  });
  elMoodLine.textContent = mood;

  const count = entriesAsc.length;
  chartMeta.textContent = count ? `共 ${count} 天记录` : "—";
  historyMeta.textContent = count ? `最近更新：${entriesAsc[count - 1].date}` : "—";
}

function renderHistoryTable() {
  const profile = store.profile;
  const entriesAsc = getEntriesAsc();
  const deltas = buildDeltas(entriesAsc);
  const rows = [...entriesAsc].sort((a, b) => b.date.localeCompare(a.date));

  if (!rows.length) {
    historyTbody.innerHTML = `<tr><td colspan="5" class="empty">还没有记录。今天就从一次小小的开始。</td></tr>`;
    return;
  }

  const heightCm = profile ? profile.heightCm : NaN;
  const html = rows
    .map((e) => {
      const bmi = profile ? calcBmi(e.weightKg, heightCm) : NaN;
      const d = deltas[e.date];
      const deltaText = d === null ? "—" : signNumber(d);
      return `
        <tr>
          <td><span class="tiny">${e.date}</span></td>
          <td class="right">${fmt1(e.weightKg)}</td>
          <td class="right">${isFinite(bmi) ? fmt1(bmi) : "—"}</td>
          <td class="right">${deltaText}</td>
          <td class="right">
            <div class="rowActions">
              <button class="linkBtn danger" type="button" data-action="delete" data-date="${e.date}">删除</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  historyTbody.innerHTML = html;
}

function ensureChart() {
  const canvas = $("weightChart");
  if (!canvas) return null;
  if (chart) return chart;

  if (typeof Chart === "undefined") return null;

  const ctx = canvas.getContext("2d");
  try {
    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "体重（kg）",
            data: [],
            borderColor: "rgba(125,211,252,.95)",
            backgroundColor: "rgba(125,211,252,.16)",
            pointRadius: 3,
            pointHoverRadius: 4,
            borderWidth: 2,
            tension: 0.25,
          },
          {
            label: "目标体重（kg）",
            data: [],
            borderColor: "rgba(167,243,208,.65)",
            borderDash: [6, 6],
            pointRadius: 0,
            borderWidth: 2,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { boxWidth: 10, boxHeight: 10 } },
          tooltip: { intersect: false, mode: "index" },
        },
        interaction: { intersect: false, mode: "index" },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: "rgba(255,255,255,.08)" } },
        },
      },
    });
  } catch {
    chart = null;
    return null;
  }
  return chart;
}

function renderChart() {
  const c = ensureChart();
  if (!c) return;

  const entriesAsc = getEntriesAsc();
  const labels = entriesAsc.map((e) => e.date);
  const data = entriesAsc.map((e) => round1(e.weightKg));

  c.data.labels = labels;
  c.data.datasets[0].data = data;

  const target = store.profile?.targetWeightKg;
  if (isFinite(target) && labels.length) {
    c.data.datasets[1].data = labels.map(() => round1(target));
  } else {
    c.data.datasets[1].data = [];
  }

  c.update();
  // 移动端 / GitHub Pages 首次布局完成后父级高度才稳定，补一次 resize 避免画布高度为 0
  requestAnimationFrame(() => {
    try {
      c.resize();
    } catch (_) {
      /* ignore */
    }
  });
}

function exportCsv() {
  const profile = store.profile;
  const entriesAsc = getEntriesAsc();
  const deltas = buildDeltas(entriesAsc);
  const rows = [...entriesAsc].sort((a, b) => b.date.localeCompare(a.date));

  const lines = [];
  lines.push(["日期", "体重(kg)", "BMI", "相比昨日变化(kg)"].join(","));
  for (const e of rows) {
    const bmi = profile ? calcBmi(e.weightKg, profile.heightCm) : NaN;
    const d = deltas[e.date];
    const deltaCell = d === null ? "" : String(round1(d));
    const dateCell = `\t${e.date}`;
    lines.push([dateCell, round1(e.weightKg), isFinite(bmi) ? fmt1(bmi) : "", deltaCell].join(","));
  }

  const content = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `今天练了吗-体重记录-${todayKey()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeDateKey(s) {
  const t = String(s ?? "").trim().replace(/^\uFEFF/, "");
  const noCtrl = t.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  const noTab = noCtrl.replace(/^\t+/, "").trim();
  const m = noTab.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (!m) return "";
  const y = m[1];
  const mm = String(m[2]).padStart(2, "0");
  const dd = String(m[3]).padStart(2, "0");
  const key = `${y}-${mm}-${dd}`;
  return isValidDateKey(key) ? key : "";
}

function importCsvText(text) {
  const raw = String(text ?? "").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { added: 0, updated: 0 };

  let startIdx = 0;
  const header = parseCsvLine(lines[0]).join(",");
  if (header.includes("日期") && header.includes("体重")) startIdx = 1;

  const byDate = new Map(store.entries.map((e) => [e.date, e]));
  let added = 0;
  let updated = 0;

  for (let i = startIdx; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;
    const date = normalizeDateKey(cols[0]);
    if (!date) continue;
    const weightKg = toNumber(cols[1]);
    if (!isFinite(weightKg)) continue;

    const existing = byDate.get(date);
    const entry = { date, weightKg, createdAt: existing?.createdAt ?? Date.now() };
    if (existing) updated++;
    else added++;
    byDate.set(date, entry);
  }

  store = { ...store, entries: dedupeByDate(Array.from(byDate.values())) };
  saveStore(store);
  return { added, updated };
}

function hideSettingsMenu() {
  if (!settingsMenu) return;
  settingsMenu.hidden = true;
  settingsMenu.setAttribute("aria-hidden", "true");
}

function wireEvents() {
  // Unified settings menu
  if (btnSettings) {
    btnSettings.addEventListener("click", () => {
      if (!settingsMenu) return;
      settingsMenu.hidden = false;
      settingsMenu.setAttribute("aria-hidden", "false");
      btnChangeAvatar?.focus?.();
    });
  }

  if (btnChangeAvatar) {
    btnChangeAvatar.addEventListener("click", () => {
      hideSettingsMenu();
      inAvatar.click();
    });
  }

  if (btnChangeBg) {
    btnChangeBg.addEventListener("click", () => {
      hideSettingsMenu();
      inBg.click();
    });
  }

  if (btnResetBg) {
    btnResetBg.addEventListener("click", () => {
      saveBgImage("");
      renderBgImage();
      hideSettingsMenu();
      toast("已恢复默认网页背景。");
    });
  }

  if (btnCloseSettings) {
    btnCloseSettings.addEventListener("click", () => hideSettingsMenu());
  }

  // Click on overlay closes menu
  if (settingsMenuOverlay) {
    settingsMenuOverlay.addEventListener("click", () => hideSettingsMenu());
  }

  // Avatar input
  inAvatar.addEventListener("change", async () => {
    const file = inAvatar.files && inAvatar.files[0];
    inAvatar.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToSmallDataUrl(file);
      saveAvatar(dataUrl);
      renderAvatar();
      toast("头像已更新。");
    } catch {
      toast("这张照片好像不太能用，换一张试试。");
    }
  });

  // Background input
  inBg.addEventListener("change", async () => {
    const file = inBg.files && inBg.files[0];
    inBg.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToBgDataUrl(file);
      saveBgImage(dataUrl);
      renderBgImage();
      toast("网页背景已更新。");
    } catch {
      toast("这张背景照片好像不太能用，换一张试试。");
    }
  });

  profileForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    clearHints();

    const profile = {
      heightCm: toNumber(inHeight.value),
      startWeightKg: String(inStart.value ?? "").trim() ? toNumber(inStart.value) : null,
      targetWeightKg: toNumber(inTarget.value),
      updatedAt: Date.now(),
    };
    const errors = validateProfile(profile);
    if (errors.heightCm) setHint(hintHeight, errors.heightCm);
    if (errors.startWeightKg) setHint(hintStart, errors.startWeightKg);
    if (errors.targetWeightKg) setHint(hintTarget, errors.targetWeightKg);
    if (Object.keys(errors).length) return;

    setProfile(profile);
    elProfileStatus.textContent = "已保存";
    toast("设置已保存。慢慢来，我们有很多次机会。");
    renderAll();
  });

  entryForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    clearHints();

    const entry = {
      date: inDate.value,
      weightKg: toNumber(inWeight.value),
      createdAt: Date.now(),
    };
    const errors = validateEntry(entry);
    if (errors.date) setHint(hintDate, errors.date);
    if (errors.weightKg) setHint(hintWeight, errors.weightKg);
    if (Object.keys(errors).length) return;

    upsertEntry(entry);
    toast("已保存。今天也辛苦了。");
    renderAll();
  });

  inDate.addEventListener("change", () => {
    renderEntryForm();
    const date = inDate.value;
    const found = store.entries.find((e) => e.date === date);
    if (found) inWeight.value = String(found.weightKg);
  });

  btnFillLatest.addEventListener("click", () => {
    const latest = getLatestEntry();
    if (!latest) {
      toast("还没有最近体重可填。先记录一次就好。");
      return;
    }
    inWeight.value = String(latest.weightKg);
  });

  btnExportCsv.addEventListener("click", () => {
    if (!store.entries.length) {
      toast("还没有记录可导出。");
      return;
    }
    exportCsv();
  });

  btnImportCsv.addEventListener("click", () => {
    inImportCsv.click();
  });

  inImportCsv.addEventListener("change", async () => {
    const file = inImportCsv.files && inImportCsv.files[0];
    inImportCsv.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const { added, updated } = importCsvText(text);
      toast(`导入完成：新增 ${added} 条，更新 ${updated} 条。`);
      renderAll();
    } catch {
      toast("导入失败：请确认这是 CSV 文件。");
    }
  });

  btnClearAll.addEventListener("click", () => {
    if (!store.profile && !store.entries.length) {
      toast("已经是空的了。");
      return;
    }
    const ok = window.confirm("确定要清空所有设置和记录吗？此操作无法撤销。");
    if (!ok) return;
    clearAll();
    toast("已清空。重新开始也没关系。");
    renderAll();
  });

  historyTbody.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const action = t.getAttribute("data-action");
    if (action !== "delete") return;
    const date = t.getAttribute("data-date");
    if (!date) return;
    const ok = window.confirm(`删除 ${date} 的记录？`);
    if (!ok) return;
    deleteEntry(date);
    toast("已删除一条记录。");
    renderAll();
  });
}

function renderAll() {
  renderProfileForm();
  renderEntryForm();
  renderMetricsAndMood();
  try {
    renderChart();
  } catch {
    // keep silent
  }
  renderHistoryTable();
}

function init() {
  inDate.value = todayKey();
  if (store.profile) {
    inHeight.value = String(store.profile.heightCm);
    inStart.value = String(store.profile.startWeightKg);
    inTarget.value = String(store.profile.targetWeightKg);
  }
  wireEvents();
  renderAvatar();
  renderBgImage();
  // Ensure chart is initialized BEFORE the first renderAll so the canvas exists.
  ensureChart();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
