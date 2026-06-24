import {
  ASSETS, COMMAND_UUID, DATA_UUID, OPS, PANELS, SERVICE_UUID,
  STATUS_SERVICE_UUID, STATUS_UUID, crc16Ccitt, pack2bpp, parseStatus, serializeConfig,
} from "./protocol.js";

const FEATURES = [
  ["뽀모도로", "25분 집중과 5분 휴식", 0],
  ["디데이", "소중한 날까지 남은 시간", 1],
  ["라면 타이머", "고정 3분 타이머", 2],
  ["메뉴 추천", "오늘의 메뉴를 무작위 추천", 3],
  ["주사위", "1부터 6까지 빠르게 굴리기", 4],
  ["해결의 책", "고민에 짧은 답을 건네기", 5],
];
const DEFAULTS = {
  panelId: 0,
  featureMask: 0x3f,
  ddayTitle: "우리의 D-DAY",
  ddayDate: "",
  qrUrl: "https://zeroble.github.io/hema-keyring/",
  menus: ["김치찌개", "돈까스", "비빔밥", "라멘", "파스타", "샌드위치"],
  answers: ["좋아, 해보자", "조금 기다려", "다른 길을 찾아", "지금이 기회야", "너무 고민하지 마", "한 번 더 생각해"],
};
const state = {
  config: loadDraft(),
  selectedAsset: 0,
  assets: new Map(),
  device: null,
  server: null,
  command: null,
  data: null,
  status: null,
  busy: false,
};

const $ = (selector) => document.querySelector(selector);
const els = {
  connect: $("#connectButton"), connectLabel: $("#connectLabel"), connection: $("#connectionState"),
  screen: $("#screenState"), timer: $("#timerState"), panel: $("#panelSelect"), qrUrl: $("#qrUrlInput"),
  ddayTitle: $("#ddayTitleInput"), ddayDate: $("#ddayDateInput"), featureGrid: $("#featureGrid"),
  assetGrid: $("#assetGrid"), selectedAsset: $("#selectedAssetName"), assetResolution: $("#assetResolution"),
  imageCanvas: $("#imageCanvas"), deviceCanvas: $("#deviceCanvas"), imageInput: $("#imageInput"),
  fit: $("#fitSelect"), contrast: $("#contrastInput"), contrastValue: $("#contrastValue"),
  menuList: $("#menuList"), bookList: $("#bookList"), apply: $("#applyButton"),
  applyTitle: $("#applyTitle"), applyMessage: $("#applyMessage"), progress: $("#progressBar"),
  toast: $("#toast"), qrGenerator: $("#qrGenerator"),
};

function loadDraft() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("hema-keyring-draft") || "{}") }; }
  catch { return structuredClone(DEFAULTS); }
}
function saveDraft() {
  localStorage.setItem("hema-keyring-draft", JSON.stringify(state.config));
  updateApplyState();
}
function toast(message, error = false) {
  els.toast.textContent = message;
  els.toast.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { els.toast.className = "toast"; }, 2600);
}
function setProgress(value, title, message) {
  els.progress.value = value;
  if (title) els.applyTitle.textContent = title;
  if (message) els.applyMessage.textContent = message;
}
function updateApplyState() {
  els.apply.disabled = !state.command || state.busy;
  if (!state.command) setProgress(0, "기기를 연결해 주세요", "Chrome 또는 Edge에서 Bluetooth 키링을 연결합니다.");
  else if (!state.busy) setProgress(0, "적용할 준비가 됐어요", "설정과 변경된 이미지를 안전하게 전송합니다.");
}

function renderFeatureCards() {
  els.featureGrid.replaceChildren(...FEATURES.map(([name, description, bit]) => {
    const label = document.createElement("label");
    label.className = "feature-card";
    label.innerHTML = `<input type="checkbox" ${state.config.featureMask & (1 << bit) ? "checked" : ""}/><strong>${name}</strong><small>${description}</small>`;
    label.querySelector("input").addEventListener("change", (event) => {
      state.config.featureMask = event.target.checked
        ? state.config.featureMask | (1 << bit)
        : state.config.featureMask & ~(1 << bit);
      saveDraft();
    });
    return label;
  }));
}

function renderList(kind) {
  const target = kind === "menu" ? els.menuList : els.bookList;
  const values = kind === "menu" ? state.config.menus : state.config.answers;
  target.replaceChildren(...values.map((value, index) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `<input maxlength="${kind === "menu" ? 22 : 36}" value="${escapeHtml(value)}" aria-label="${kind === "menu" ? "메뉴" : "답변"} ${index + 1}"/><button type="button" aria-label="삭제">×</button>`;
    row.querySelector("input").addEventListener("input", (event) => {
      values[index] = event.target.value;
      saveDraft();
    });
    row.querySelector("button").addEventListener("click", () => {
      values.splice(index, 1); renderList(kind); saveDraft();
    });
    return row;
  }));
}
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function assetDimensions(asset) {
  if (!asset.fullScreen) return { width: 96, height: 80 };
  const panel = PANELS[state.config.panelId];
  return { width: panel.logicalWidth, height: panel.logicalHeight };
}
function renderAssetCards() {
  els.assetGrid.replaceChildren(...ASSETS.map((asset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `asset-card${asset.id === state.selectedAsset ? " active" : ""}${state.assets.has(asset.id) || asset.generated ? " ready" : ""}`;
    button.innerHTML = `<span class="thumb">${asset.icon}</span><span><strong>${asset.name}</strong><small>${asset.generated ? "주소에서 자동 생성" : state.assets.has(asset.id) ? "변경됨" : "기본 이미지"}</small></span>`;
    button.addEventListener("click", () => selectAsset(asset.id));
    return button;
  }));
}
function selectAsset(id) {
  state.selectedAsset = id;
  const asset = ASSETS[id];
  const { width, height } = assetDimensions(asset);
  els.selectedAsset.textContent = asset.name;
  els.assetResolution.textContent = `${width} × ${height}`;
  els.imageInput.disabled = Boolean(asset.generated);
  els.fit.disabled = Boolean(asset.generated);
  renderAssetCards();
  rebuildSelectedAsset();
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  return canvas;
}
function drawFitted(ctx, source, width, height, fit) {
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const scale = fit === "cover" ? Math.max(width / sourceWidth, height / sourceHeight) : Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale; const h = sourceHeight * scale;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
}
function quantizeCanvas(source, width, height, fit, contrastPercent) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  drawFitted(ctx, source, width, height, fit);
  const image = ctx.getImageData(0, 0, width, height);
  const levels = new Uint8Array(width * height);
  const contrast = contrastPercent / 100;
  for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) {
    const alpha = image.data[i + 3] / 255;
    const luminance = (image.data[i] * .299 + image.data[i + 1] * .587 + image.data[i + 2] * .114) * alpha + 255 * (1 - alpha);
    const adjusted = Math.max(0, Math.min(255, (luminance - 127.5) * contrast + 127.5));
    levels[p] = Math.max(0, Math.min(3, Math.round(adjusted / 85)));
  }
  return levels;
}
function paintLevels(canvas, levels, width, height) {
  canvas.width = width * 3; canvas.height = height * 3;
  const ctx = canvas.getContext("2d");
  const colors = ["#171717", "#66645f", "#aaa79f", "#f8f6ef"];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    ctx.fillStyle = colors[levels[y * width + x]];
    ctx.fillRect(x * 3, y * 3, 3, 3);
  }
}

async function generateQrImage() {
  els.qrGenerator.replaceChildren();
  const holder = document.createElement("div");
  els.qrGenerator.append(holder);
  if (!window.QRCode) throw new Error("QR 생성 모듈을 불러오지 못했습니다.");
  new window.QRCode(holder, { text: state.config.qrUrl, width: 160, height: 160, correctLevel: window.QRCode.CorrectLevel.M });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const canvas = holder.querySelector("canvas");
  if (canvas) return canvas;
  const image = holder.querySelector("img");
  if (image && !image.complete) await image.decode();
  return image;
}

async function rebuildSelectedAsset() {
  const asset = ASSETS[state.selectedAsset];
  let record = state.assets.get(asset.id);
  if (asset.generated) {
    try {
      record = { source: await generateQrImage(), fit: "contain", contrast: 180, dirty: true };
      state.assets.set(asset.id, record);
    } catch (error) { toast(error.message, true); return; }
  }
  const dimensions = assetDimensions(asset);
  if (!record) {
    const levels = new Uint8Array(dimensions.width * dimensions.height).fill(3);
    paintLevels(els.imageCanvas, levels, dimensions.width, dimensions.height);
    renderDevicePreview(levels, dimensions.width, dimensions.height, asset.fullScreen);
    return;
  }
  record.fit = asset.generated ? "contain" : els.fit.value;
  record.contrast = asset.generated ? 180 : Number(els.contrast.value);
  record.levels = quantizeCanvas(record.source, dimensions.width, dimensions.height, record.fit, record.contrast);
  record.bytes = pack2bpp(record.levels);
  record.dirty = true;
  paintLevels(els.imageCanvas, record.levels, dimensions.width, dimensions.height);
  renderDevicePreview(record.levels, dimensions.width, dimensions.height, asset.fullScreen);
  renderAssetCards();
}
function renderDevicePreview(levels, width, height, fullScreen) {
  const panel = PANELS[state.config.panelId];
  const canvas = els.deviceCanvas;
  canvas.width = panel.logicalWidth * 2; canvas.height = panel.logicalHeight * 2;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f8f6ef"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const colors = ["#171717", "#5c5b57", "#aaa79f", "#f8f6ef"];
  const drawWidth = fullScreen ? panel.logicalWidth : width;
  const drawHeight = fullScreen ? panel.logicalHeight : height;
  const x0 = fullScreen ? 0 : panel.logicalWidth - width - 4;
  const y0 = fullScreen ? 0 : panel.logicalHeight - height;
  for (let y = 0; y < drawHeight; y += 1) for (let x = 0; x < drawWidth; x += 1) {
    ctx.fillStyle = colors[levels[y * width + x]];
    ctx.fillRect((x0 + x) * 2, (y0 + y) * 2, 2, 2);
  }
  if (!fullScreen) {
    ctx.fillStyle = "#171717"; ctx.font = "bold 24px sans-serif";
    ctx.fillText(ASSETS[state.selectedAsset].name.replace(" 마스코트", ""), 16, 34);
    ctx.font = "18px monospace"; ctx.fillText("00:25", 16, 68);
  }
}

async function connect() {
  if (!navigator.bluetooth) throw new Error("Chrome 또는 Edge의 HTTPS/localhost 환경이 필요합니다.");
  const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: "HEMA" }], optionalServices: [SERVICE_UUID, STATUS_SERVICE_UUID] });
  state.device = device;
  device.addEventListener("gattserverdisconnected", handleDisconnect);
  state.server = await device.gatt.connect();
  const service = await state.server.getPrimaryService(SERVICE_UUID);
  state.command = await service.getCharacteristic(COMMAND_UUID);
  try { state.data = await service.getCharacteristic(DATA_UUID); } catch { state.data = null; }
  try {
    const statusService = await state.server.getPrimaryService(STATUS_SERVICE_UUID);
    state.status = await statusService.getCharacteristic(STATUS_UUID);
    await refreshStatus();
  } catch { state.status = null; }
  els.connect.classList.add("connected");
  els.connectLabel.textContent = "연결됨";
  els.connection.textContent = device.name || "HEMA-KEYRING";
  updateApplyState();
  toast("키링과 연결됐습니다.");
}
function handleDisconnect() {
  state.command = null; state.data = null; state.status = null; state.server = null;
  els.connect.classList.remove("connected"); els.connectLabel.textContent = "기기 연결";
  els.connection.textContent = "연결 안 됨"; els.screen.textContent = "—"; els.timer.textContent = "—";
  updateApplyState(); toast("기기 연결이 끊어졌습니다.", true);
}
async function writeCommand(bytes) {
  if (!state.command) throw new Error("기기가 연결되지 않았습니다.");
  if (state.command.writeValueWithResponse) await state.command.writeValueWithResponse(bytes);
  else await state.command.writeValue(bytes);
}
async function writeData(bytes) {
  if (state.data?.writeValueWithoutResponse) await state.data.writeValueWithoutResponse(bytes);
  else await writeCommand(bytes);
}
async function sendPayload(startOpcode, dataOpcode, commitOpcode, header, payload, progressStart, progressEnd) {
  const crc = crc16Ccitt(payload);
  await writeCommand(new Uint8Array([...header, payload.length & 0xff, payload.length >> 8, crc & 0xff, crc >> 8]));
  const chunkSize = state.data ? 200 : 16;
  for (let offset = 0; offset < payload.length; offset += chunkSize) {
    const chunk = payload.slice(offset, offset + chunkSize);
    const packet = new Uint8Array(4 + chunk.length);
    packet[0] = dataOpcode; packet[1] = offset & 0xff; packet[2] = offset >> 8; packet[3] = chunk.length;
    packet.set(chunk, 4);
    await writeData(packet);
    setProgress(progressStart + ((offset + chunk.length) / payload.length) * (progressEnd - progressStart));
  }
  await writeCommand(new Uint8Array([commitOpcode]));
}
async function sendConfig() {
  const payload = serializeConfig(state.config);
  await sendPayload(OPS.CONFIG_START, OPS.CONFIG_DATA, OPS.CONFIG_COMMIT, [OPS.CONFIG_START], payload, 2, 20);
  const epoch = Math.floor(Date.now() / 86400000);
  await writeCommand(new Uint8Array([OPS.TIME_SYNC, epoch & 0xff, (epoch >>> 8) & 0xff, (epoch >>> 16) & 0xff, (epoch >>> 24) & 0xff]));
}
async function sendAsset(asset, record, index, total) {
  const range = 76 / Math.max(1, total);
  const start = 20 + index * range;
  const end = start + range;
  setProgress(start, `${asset.name} 전송 중`, `${index + 1} / ${total}`);
  try {
    await sendPayload(OPS.ASSET_START, OPS.ASSET_DATA, OPS.ASSET_COMMIT,
      [OPS.ASSET_START, asset.id, state.config.panelId], record.bytes, start, end);
  } catch (error) {
    try { await writeCommand(new Uint8Array([OPS.ASSET_ABORT])); } catch {}
    throw error;
  }
}
async function applyAll() {
  state.busy = true; updateApplyState();
  try {
    await rebuildSelectedAsset();
    if (!state.assets.has(8)) await selectAndWaitQr();
    const dirtyAssets = ASSETS.map((asset) => [asset, state.assets.get(asset.id)]).filter(([, record]) => record?.dirty && record.bytes);
    setProgress(2, "설정 전송 중", "기능과 콘텐츠를 검증하고 있습니다.");
    await sendConfig();
    for (let i = 0; i < dirtyAssets.length; i += 1) await sendAsset(dirtyAssets[i][0], dirtyAssets[i][1], i, dirtyAssets.length);
    dirtyAssets.forEach(([, record]) => { record.dirty = false; });
    setProgress(100, "적용 완료", "키링에 새 설정이 안전하게 저장됐습니다.");
    await refreshStatus();
    toast("모든 설정을 적용했습니다.");
  } catch (error) {
    setProgress(0, "적용하지 못했어요", "기존 기기 설정은 유지됩니다. 연결을 확인하고 다시 시도하세요.");
    toast(error.message || "전송 중 오류가 발생했습니다.", true);
  } finally {
    state.busy = false; updateApplyState();
  }
}
async function selectAndWaitQr() {
  const previous = state.selectedAsset;
  state.selectedAsset = 8; await rebuildSelectedAsset(); state.selectedAsset = previous; renderAssetCards();
}
async function refreshStatus() {
  if (!state.status) return;
  const parsed = parseStatus(await state.status.readValue());
  els.screen.textContent = parsed.screenName;
  els.timer.textContent = parsed.timerName + (parsed.remaining ? ` · ${Math.floor(parsed.remaining / 60)}:${String(parsed.remaining % 60).padStart(2, "0")}` : "");
}

function bindEvents() {
  els.connect.addEventListener("click", async () => {
    try { if (state.server?.connected) state.device.gatt.disconnect(); else await connect(); }
    catch (error) { toast(error.message, true); }
  });
  els.apply.addEventListener("click", applyAll);
  els.panel.addEventListener("change", () => {
    state.config.panelId = Number(els.panel.value); saveDraft();
    for (const [id, record] of state.assets) if (ASSETS[id].fullScreen) record.dirty = true;
    selectAsset(state.selectedAsset);
  });
  els.qrUrl.addEventListener("input", () => { state.config.qrUrl = els.qrUrl.value; state.assets.delete(8); saveDraft(); });
  els.ddayTitle.addEventListener("input", () => { state.config.ddayTitle = els.ddayTitle.value; saveDraft(); });
  els.ddayDate.addEventListener("change", () => { state.config.ddayDate = els.ddayDate.value; saveDraft(); });
  els.imageInput.addEventListener("change", async () => {
    const [file] = els.imageInput.files; if (!file) return;
    try {
      state.assets.set(state.selectedAsset, { source: await loadImage(file), fit: els.fit.value, contrast: Number(els.contrast.value), dirty: true });
      await rebuildSelectedAsset(); toast("그레이스케일 미리보기를 만들었습니다.");
    } catch (error) { toast(error.message, true); }
  });
  els.fit.addEventListener("change", rebuildSelectedAsset);
  els.contrast.addEventListener("input", () => { els.contrastValue.textContent = `${els.contrast.value}%`; rebuildSelectedAsset(); });
  document.querySelectorAll("[data-add-list]").forEach((button) => button.addEventListener("click", () => {
    const kind = button.dataset.addList; const values = kind === "menu" ? state.config.menus : state.config.answers;
    if (values.length >= 8) return toast("최대 8개까지 등록할 수 있습니다.", true);
    values.push(""); renderList(kind); saveDraft();
    const inputs = (kind === "menu" ? els.menuList : els.bookList).querySelectorAll("input");
    inputs[inputs.length - 1].focus();
  }));
}

function init() {
  els.panel.value = String(state.config.panelId);
  els.qrUrl.value = state.config.qrUrl;
  els.ddayTitle.value = state.config.ddayTitle;
  els.ddayDate.value = state.config.ddayDate;
  renderFeatureCards(); renderList("menu"); renderList("book"); renderAssetCards(); bindEvents();
  selectAsset(0); updateApplyState();
}
init();
