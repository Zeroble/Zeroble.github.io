export const SERVICE_UUID = "1842467c-7cbc-11e9-8f9e-2a86e4085a59";
export const COMMAND_UUID = "2c86686a-53dc-25b3-0c4a-f0e10c8dee20";
export const DATA_UUID = "5987b4ef-3bfa-76a8-e642-92933c31434f";
export const STATUS_SERVICE_UUID = "184247d0-7cbc-11e9-089e-2a86e4085a59";
export const STATUS_UUID = "14005991-b131-3396-014c-664c9867b917";

export const OPS = {
  CONFIG_START: 0x30,
  CONFIG_DATA: 0x31,
  CONFIG_COMMIT: 0x32,
  TIME_SYNC: 0x33,
  CONFIG_SINGLE: 0x34,
  ASSET_START: 0x40,
  ASSET_DATA: 0x41,
  ASSET_COMMIT: 0x42,
  ASSET_ABORT: 0x43,
};

export const PANELS = {
  0: { id: 0, memoryWidth: 104, memoryHeight: 212, logicalWidth: 212, logicalHeight: 104 },
  1: { id: 1, memoryWidth: 122, memoryHeight: 250, logicalWidth: 250, logicalHeight: 122 },
};

export const ASSETS = [
  { id: 0, key: "saver", name: "대기화면", icon: "◫", fullScreen: true },
  { id: 1, key: "pomoFocus", name: "집중 마스코트", icon: "◉" },
  { id: 2, key: "pomoRest", name: "휴식 마스코트", icon: "☕" },
  { id: 3, key: "dday", name: "디데이 마스코트", icon: "♡" },
  { id: 4, key: "ramen", name: "라면 마스코트", icon: "♨" },
  { id: 5, key: "menu", name: "메뉴 마스코트", icon: "♧" },
  { id: 6, key: "dice", name: "주사위 마스코트", icon: "⚄" },
  { id: 7, key: "book", name: "해결의 책 마스코트", icon: "?" },
  { id: 8, key: "qr", name: "설정 QR", icon: "▦", generated: true },
];

export function crc16Ccitt(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc;
}

function epochDay(dateValue) {
  if (!dateValue) return 0;
  const [year, month, day] = dateValue.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function pushI32(output, value) {
  const raw = value | 0;
  output.push(raw & 0xff, (raw >>> 8) & 0xff, (raw >>> 16) & 0xff, (raw >>> 24) & 0xff);
}

function pushText(output, text, maximumBytes) {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(text.trim());
  if (bytes.length >= maximumBytes) {
    bytes = bytes.slice(0, maximumBytes - 1);
    while (bytes.length && (bytes[bytes.length - 1] & 0xc0) === 0x80) bytes = bytes.slice(0, -1);
  }
  output.push(bytes.length, ...bytes);
}

export function serializeConfig(config) {
  const output = [1, Number(config.panelId), Number(config.featureMask) & 0x3f];
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  pushI32(output, epochDay(config.ddayDate));
  pushI32(output, epochDay(todayValue));
  pushText(output, config.ddayTitle, 32);
  const menus = config.menus.map((item) => item.trim()).filter(Boolean).slice(0, 8);
  output.push(menus.length);
  menus.forEach((item) => pushText(output, item, 24));
  const answers = config.answers.map((item) => item.trim()).filter(Boolean).slice(0, 8);
  output.push(answers.length);
  answers.forEach((item) => pushText(output, item, 40));
  pushText(output, config.qrUrl, 96);
  return new Uint8Array(output);
}

export function pack2bpp(levels) {
  const packed = new Uint8Array(Math.ceil(levels.length / 4));
  packed.fill(0xff);
  for (let i = 0; i < levels.length; i += 1) {
    const shift = 6 - ((i & 3) * 2);
    packed[i >> 2] = (packed[i >> 2] & ~(3 << shift)) | ((levels[i] & 3) << shift);
  }
  return packed;
}

export function unpack2bpp(packed, count) {
  const levels = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    levels[i] = (packed[i >> 2] >> (6 - ((i & 3) * 2))) & 3;
  }
  return levels;
}

export function parseStatus(dataView) {
  const screenNames = ["뽀모도로", "디데이", "라면 타이머", "메뉴 추천", "주사위", "해결의 책", "설정 QR", "대기화면"];
  const timerNames = ["준비", "진행", "일시정지", "완료"];
  return {
    displayStatus: dataView.byteLength > 0 ? dataView.getUint8(0) : 0xff,
    error: dataView.byteLength > 1 ? dataView.getUint8(1) : 0xff,
    panelId: dataView.byteLength > 2 ? dataView.getUint8(2) : null,
    screen: dataView.byteLength > 8 ? dataView.getUint8(8) : null,
    screenName: dataView.byteLength > 8 ? (screenNames[dataView.getUint8(8)] || "알 수 없음") : "—",
    timerState: dataView.byteLength > 9 ? dataView.getUint8(9) : null,
    timerName: dataView.byteLength > 9 ? (timerNames[dataView.getUint8(9)] || "—") : "—",
    remaining: dataView.byteLength > 11 ? dataView.getUint16(10, true) : 0,
  };
}
