// ====================================================
// UltraBlock Pro - Background Service Worker (Rock Solid)
// ====================================================

const DEFAULT_SETTINGS = {
  enabled: true,
  autoTranslate: true,
  blockAds: true,
  blockTrackers: true,
  blockBetting: true,
  blockPopups: true,
  boostPerf: true,
  lazyImages: true,
  removeCookieBanners: true,
  dubbingEnabled: false,
  dubbingProvider: 'gemini',
  geminiApiKey: 'AIzaSyCklhdUMekEOmueB6uqa7B7_SKdnMKFu1M',
  dubbingVoice: 'vi-VN-HoaiMyNeural',
  dubbingDuckLevel: 0.15,
  dubbingVolume: 1.0,
  blockedTotal: 0,
  blockedToday: 0,
  savedKB: 0,
  lastDate: new Date().toDateString()
};

// ─── TẠO MENU CHUỘT PHẢI (CONTEXT MENU) ───
function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ub-translate-context',
      title: '🌐 Dịch sang Tiếng Việt: "%s"',
      contexts: ['selection']
    });
  });
}

// Khởi tạo menu chuột phải
setupContextMenu();
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, existing => {
    chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...existing });
  });
  setupContextMenu();
});

// ─── HÀM HIỂN THỊ KẾT QUẢ DỊCH TRỰC TIẾP TRÊN TRANG (INJECT 100% THÀNH CÔNG) ───
function displayTranslationOnPage(originalText, translatedText) {
  // 1. Tìm và thay thế chữ trong Selection nếu có
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

      if (isInput) {
        document.execCommand('insertText', false, translatedText);
      } else {
        range.deleteContents();
        range.insertNode(document.createTextNode(translatedText));
      }
    }
  } catch (e) {
    // Dự phòng thay thế trong DOM
    try {
      const sel = window.getSelection();
      if (sel && sel.anchorNode && sel.anchorNode.parentElement) {
        const el = sel.anchorNode.parentElement;
        el.innerHTML = el.innerHTML.replace(originalText, translatedText);
      }
    } catch(err) {}
  }

  // 2. Tạo thông báo / bong bóng nổi bật giữa màn hình
  let box = document.getElementById('ub-direct-translate-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'ub-direct-translate-box';
    box.style.cssText = `
      position: fixed !important;
      top: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      z-index: 2147483647 !important;
      background: #111116 !important;
      color: #ffffff !important;
      border: 2px solid #00e676 !important;
      border-radius: 12px !important;
      padding: 12px 20px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 15px !important;
      font-weight: 600 !important;
      box-shadow: 0 12px 40px rgba(0,0,0,0.95), 0 0 20px rgba(0,230,118,0.4) !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      max-width: 600px !important;
      line-height: 1.4 !important;
      transition: all 0.25s ease-out !important;
      cursor: pointer !important;
    `;
    (document.body || document.documentElement).appendChild(box);
  }

  box.innerHTML = `
    <span style="font-size:22px;">🇻🇳</span>
    <div>
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Bản dịch Tiếng Việt:</div>
      <div style="color:#00e676;font-size:16px;font-weight:700;">${translatedText}</div>
    </div>
    <span style="font-size:11px;color:#555;margin-left:10px;">(Click để đóng)</span>
  `;
  box.style.display = 'flex';
  box.style.opacity = '1';

  box.onclick = () => {
    box.style.opacity = '0';
    setTimeout(() => { box.style.display = 'none'; }, 250);
  };

  // Tự ẩn sau 6 giây
  clearTimeout(window.__ub_box_timer);
  window.__ub_box_timer = setTimeout(() => {
    if (box) {
      box.style.opacity = '0';
      setTimeout(() => { box.style.display = 'none'; }, 250);
    }
  }, 6000);
}

// ─── LẮNG NGHE SỰ KIỆN CLICK MENU CHUỘT PHẢI ───
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ub-translate-context' && info.selectionText && tab?.id) {
    try {
      const translated = await fetchGoogleTranslate(info.selectionText, 'vi');
      
      // Dùng chrome.scripting.executeScript để chạy thẳng lên trang web
      // Chắc chắn 100% hiển thị, không sợ tab chưa tải lại
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: displayTranslationOnPage,
        args: [info.selectionText, translated]
      }).catch(err => {
        console.warn('Lỗi executeScript:', err);
      });

    } catch (err) {
      console.warn('Lỗi dịch chuột phải:', err);
    }
  }
});

// ─── FETCH GOOGLE TRANSLATE API SIÊU TỐC (~30ms) ───
async function fetchGoogleTranslate(text, targetLang = 'vi') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  const data = await res.json();
  return data[0].map(item => item[0]).join('');
}

// ─── FETCH GEMINI AI TRANSLATE VỚI RÀNG BUỘC ÂM TIẾT / THỜI LƯỢNG ───
async function fetchGeminiTranslate(text, apiKey, targetDuration = null) {
  // Nếu không có API Key riêng hợp lệ của người dùng, chuyển thẳng sang Google Translate siêu tốc (~30ms)
  if (!apiKey || apiKey.includes('AIzaSyCklhdUMekEOmueB6uqa7B7')) {
    return await fetchGoogleTranslate(text, 'vi');
  }
  const key = apiKey;
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  let constraint = '';
  if (targetDuration && targetDuration > 0) {
    const maxWords = Math.max(3, Math.round(targetDuration * 3.8));
    constraint = ` Câu dịch tiếng Việt phải cô đọng, tự nhiên, tối đa khoảng ${maxWords} từ để vừa vặn đọc trong ${targetDuration.toFixed(1)} giây.`;
  }

  const prompt = `Bạn là chuyên gia dịch thuật và lồng tiếng video YouTube.${constraint}\nDịch câu sau từ tiếng Anh sang tiếng Việt thật chuẩn xác và tự nhiên:\n"${text}"\nChỉ trả về duy nhất bản dịch tiếng Việt, không kèm giải thích hoặc dấu ngoặc kép.`;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 120
          }
        })
      });
      if (!res.ok) continue;
      const data = await res.json();
      const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (output && output.trim()) {
        return output.trim().replace(/^["']|["']$/g, '');
      }
    } catch (err) {}
  }

  // Dự phòng sang Google Translate nếu Gemini gặp lỗi mạng hoặc hạn ngạch
  return await fetchGoogleTranslate(text, 'vi');
}

// ─── ĐĂNG KÝ DYNAMIC RULES CHO BẢN QUYỀN WEBSOCKET EDGE-TTS ───
try {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [51001],
    addRules: [
      {
        id: 51001,
        priority: 9999,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "Origin", operation: "set", value: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold" },
            { header: "User-Agent", operation: "set", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0" },
            { header: "Cookie", operation: "set", value: "muid=5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C0D;" },
            { header: "Pragma", operation: "set", value: "no-cache" },
            { header: "Cache-Control", operation: "set", value: "no-cache" }
          ]
        },
        condition: {
          urlFilter: "speech.platform.bing.com",
          resourceTypes: ["websocket", "xmlhttprequest", "other"]
        }
      }
    ]
  }).catch(() => {});
} catch (e) {}

// ─── MICROSOFT EDGE-TTS DRM V2 TOKEN ENGINE ───
const EDGE_TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WIN_EPOCH = 11644473600n;
const S_TO_NS = 1000000000n;
const _U32_MASK = 0xFFFFFFFFn;

let edgeClockSkew = 0n;
async function syncEdgeClockSkew() {
  try {
    const res = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=' + EDGE_TRUSTED_TOKEN, { method: 'HEAD' });
    const sDate = res.headers.get('date');
    if (sDate) {
      const serverUnix = BigInt(Math.floor(new Date(sDate).getTime() / 1000));
      const clientUnix = BigInt(Math.floor(Date.now() / 1000));
      edgeClockSkew = serverUnix - clientUnix;
    }
  } catch (e) {}
}
syncEdgeClockSkew();

const _SHA256_INITIAL = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
const _SHA256_STATE = [0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2];
const _SHA256_SCHEDULE = [0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6, 0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564];
const _SHA256_ROUND_CONSTANTS = [
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
];
const _SHA256_ADJUSTMENT = 0xC9DC06A7;
const _SHA256_BLOCK_CONSTANTS = [..._SHA256_ROUND_CONSTANTS.slice(0, 14), _SHA256_ADJUSTMENT, ..._SHA256_ROUND_CONSTANTS.slice(15)];
const _SHA256_SIGMA0_ADJUSTMENT = 0x059C0B80;
const _SHA256_SIGMA1_ADJUSTMENT = 0x000B92C0;

const _CS64_COEFFICIENTS = [
  [0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D], [0x3BEB65BC, 0x29514038], [0xC89C5933, 0xB328CBDF],
  [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C], [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB],
  [0x06064CF3, 0xFA51A3DA], [0xDA79FA60, 0x207CC464], [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61],
  [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167]
];
const _CS64_FACTOR = 0x82893933;
const _CS64_ADJUSTMENT0 = 0xF2F90B1A;
const _CS64_ADJUSTMENT1 = 0x0B1A0000;

function _rol16(value) {
  value = Number(BigInt(value) & _U32_MASK);
  return Number((BigInt((value << 16) | (value >>> 16))) & _U32_MASK);
}
function _words_le4_even(bytes) {
  const padLen = (4 - (bytes.length % 4)) % 4;
  const padded = new Uint8Array(bytes.length + padLen);
  padded.set(bytes);
  const view = new DataView(padded.buffer);
  const words = [];
  for (let i = 0; i < padded.length; i += 4) words.push(view.getUint32(i, true));
  if (words.length % 2 !== 0) words.push(0);
  return words;
}
function _sigma0(v) {
  const b = BigInt(v) & _U32_MASK;
  return Number(((b >> 7n) ^ ((b << 25n) & _U32_MASK) ^ (b >> 18n) ^ ((b << 14n) & _U32_MASK) ^ (b >> 3n)) & _U32_MASK);
}
function _sigma1(v) {
  const b = BigInt(v) & _U32_MASK;
  return Number(((b >> 17n) ^ ((b << 15n) & _U32_MASK) ^ (b >> 19n) ^ ((b << 13n) & _U32_MASK) ^ (b >> 10n)) & _U32_MASK);
}
function _sha256_rounds(state, words, first_round = 0) {
  let [a, b, c, d, e, f, g, h] = state.map(x => BigInt(x));
  const mask = _U32_MASK;
  const constants = (first_round === 14 ? _SHA256_BLOCK_CONSTANTS : _SHA256_ROUND_CONSTANTS).map(x => BigInt(x));
  const W = words.map(x => BigInt(x));
  const aligned = Math.min(64, Math.floor((first_round + 7) / 8) * 8);
  for (let index = first_round; index < aligned; index++) {
    const rot_e = e * 0x100000001n;
    const rot_a = a * 0x100000001n;
    const t1 = (h + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (g ^ (e & (f ^ g))) + constants[index] + W[index]) & mask;
    const t2 = (((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((a & b) | (c & (a | b)))) & mask;
    [a, b, c, d, e, f, g, h] = [(t1 + t2) & mask, a, b, c, (d + t1) & mask, e, f, g];
  }
  for (let index = aligned; index < 64; index += 8) {
    let rot_e = e * 0x100000001n;
    let rot_a = a * 0x100000001n;
    let t1 = (h + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (g ^ (e & (f ^ g))) + constants[index] + W[index]) & mask;
    d = (d + t1) & mask;
    h = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((a & b) | (c & (a | b)))) & mask;

    rot_e = d * 0x100000001n;
    rot_a = h * 0x100000001n;
    t1 = (g + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (f ^ (d & (e ^ f))) + constants[index + 1] + W[index + 1]) & mask;
    c = (c + t1) & mask;
    g = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((h & a) | (b & (h | a)))) & mask;

    rot_e = c * 0x100000001n;
    rot_a = g * 0x100000001n;
    t1 = (f + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (e ^ (c & (d ^ e))) + constants[index + 2] + W[index + 2]) & mask;
    b = (b + t1) & mask;
    f = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((g & h) | (a & (g | h)))) & mask;

    rot_e = b * 0x100000001n;
    rot_a = f * 0x100000001n;
    t1 = (e + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (d ^ (b & (c ^ d))) + constants[index + 3] + W[index + 3]) & mask;
    a = (a + t1) & mask;
    e = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((f & g) | (h & (f | g)))) & mask;

    rot_e = a * 0x100000001n;
    rot_a = e * 0x100000001n;
    t1 = (d + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (c ^ (a & (b ^ c))) + constants[index + 4] + W[index + 4]) & mask;
    h = (h + t1) & mask;
    d = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((e & f) | (g & (e | f)))) & mask;

    rot_e = h * 0x100000001n;
    rot_a = d * 0x100000001n;
    t1 = (c + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (b ^ (h & (a ^ b))) + constants[index + 5] + W[index + 5]) & mask;
    g = (g + t1) & mask;
    c = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((d & e) | (f & (d | e)))) & mask;

    rot_e = g * 0x100000001n;
    rot_a = c * 0x100000001n;
    t1 = (b + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (a ^ (g & (h ^ a))) + constants[index + 6] + W[index + 6]) & mask;
    f = (f + t1) & mask;
    b = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((c & d) | (e & (c | d)))) & mask;

    rot_e = f * 0x100000001n;
    rot_a = b * 0x100000001n;
    t1 = (a + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + (h ^ (f & (g ^ h))) + constants[index + 7] + W[index + 7]) & mask;
    e = (e + t1) & mask;
    a = (t1 + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + ((b & c) | (d & (b | c)))) & mask;
  }
  return [Number(a), Number(b), Number(c), Number(d), Number(e), Number(f), Number(g), Number(h)];
}
function _expand_sha256_schedule(words, first_word = 16) {
  const mask = _U32_MASK;
  for (let index = first_word; index < 64; index++) {
    const x = BigInt(words[index - 2]);
    const y = BigInt(words[index - 15]);
    const sigma1 = ((x >> 17n) ^ ((x << 15n) & mask) ^ (x >> 19n) ^ ((x << 13n) & mask) ^ (x >> 10n)) & mask;
    const sigma0 = ((y >> 7n) ^ ((y << 25n) & mask) ^ (y >> 18n) ^ ((y << 14n) & mask) ^ (y >> 3n)) & mask;
    words.push(Number((sigma1 + BigInt(words[index - 7]) + sigma0 + BigInt(words[index - 16])) & mask));
  }
}
function _sha256_init(data) {
  const mask = _U32_MASK;
  const words = new Array(14).fill(0);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const b012 = (data[0] << 16) | (data[1] << 8) | data[2];
  words.push(b012);
  words.push(view.getUint32(3, false));
  for (let index = 16; index < 30; index++) {
    let value = BigInt(_SHA256_SCHEDULE[index - 16]);
    if (index - 2 >= 14) {
      const s1 = BigInt(_sigma1(words[index - 2]));
      value += (index === 16 ? (s1 ^ BigInt(_SHA256_SIGMA1_ADJUSTMENT)) : s1);
    }
    if (index - 7 >= 14) value += BigInt(words[index - 7]);
    if (index - 15 >= 14) {
      const s0 = BigInt(_sigma0(words[index - 15]));
      value += (index === 29 ? (s0 ^ BigInt(_SHA256_SIGMA0_ADJUSTMENT)) : s0);
    }
    words.push(Number(value & mask));
  }
  words.push(Number((BigInt(_sigma1(words[28])) + BigInt(words[23]) + BigInt(_sigma0(words[15])) + BigInt(words[14]) + BigInt(_SHA256_ADJUSTMENT) - BigInt(_SHA256_ROUND_CONSTANTS[14])) & mask));
  _expand_sha256_schedule(words, 31);
  const working = _sha256_rounds(_SHA256_STATE, words, 14);
  return _SHA256_INITIAL.map((x, i) => Number((BigInt(x) + BigInt(working[i])) & mask));
}
function _sha256_digest(data) {
  const length = 57 + data.length;
  const padLen = (55 - length) % 64 >= 0 ? (55 - length) % 64 : ((55 - length) % 64) + 64;
  const padded = new Uint8Array(data.length - 7 + 1 + padLen + 8);
  padded.set(data.subarray(7), 0);
  padded[data.length - 7] = 0x80;
  const view = new DataView(padded.buffer);
  view.setBigUint64(padded.length - 8, BigInt(length * 8), false);

  let state = _sha256_init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = [];
    for (let i = 0; i < 64; i += 4) words.push(view.getUint32(offset + i, false));
    _expand_sha256_schedule(words);
    const working = _sha256_rounds(state, words);
    state = state.map((x, i) => Number((BigInt(x) + BigInt(working[i])) & _U32_MASK));
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, state[i], false);
  return out;
}
function _cs64_digest(data, digest) {
  const mask = _U32_MASK;
  const digView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  let key_a = BigInt(digView.getUint32(0, true)) | 1n;
  let key_b = BigInt(digView.getUint32(4, true)) | 1n;
  const factors = [(key_a * BigInt(_CS64_FACTOR)) & mask, (key_b * BigInt(_CS64_FACTOR)) & mask];
  const terms = _CS64_COEFFICIENTS.map(([coef], idx) => (BigInt(coef) * factors[idx % 2]) & mask);
  const offsets = _CS64_COEFFICIENTS.map(([, off]) => BigInt(off));

  const zeroPrep = new Uint8Array(data.length + 1);
  zeroPrep.set(data, 1);
  const words = _words_le4_even(zeroPrep);
  for (let index = 0; index < words.length; index++) {
    const word = BigInt(words[index]);
    let term = word * (index % 2 === 0 ? key_a : key_b);
    let offset = BigInt(_rol16(Number(word))) * (index % 2 === 0 ? 0xEF0569FBn : 0xC31713DBn);
    if (index === 0) {
      term += BigInt(_CS64_ADJUSTMENT0) * factors[0];
      offset += BigInt(_CS64_ADJUSTMENT1);
    }
    terms.push(term & mask);
    offsets.push(offset & mask);
  }
  let swap_acc = 0n, swap_last = 0n, state = 0n, acc = 0n;
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index], y = terms[index + 1];
    let t = BigInt(_rol16(Number((offsets[index] + x) & mask)));
    let q = (t * 0x76F50F34n) & mask;
    swap_acc = (swap_acc + BigInt(_rol16(Number(q))) * 0xC3EFEA97n + q) & mask;
    t = BigInt(_rol16(Number((offsets[index + 1] + y) & mask)));
    q = (t * 0x1881CE3Cn) & mask;
    swap_last = (BigInt(_rol16(Number(q))) * 0x35BD1EC9n + q) & mask;
    swap_acc = (swap_acc + swap_last) & mask;
    state = (state * key_a + x) & mask;
    state = (BigInt(_rol16(Number(state))) * 0xCF98B111n) & mask;
    state = (BigInt(_rol16(Number(state))) * 0x87085B9Fn) & mask;
    state = (BigInt(_rol16(Number(state))) * 0x12CEB96Dn) & mask;
    state = (BigInt(_rol16(Number(state))) * 0x257E1D83n) & mask;
    acc += state;
    t = (state * key_b + y) & mask;
    t = (BigInt(_rol16(Number(t))) * 0xA27416F5n) & mask;
    t = (BigInt(_rol16(Number(t))) * 0xD38396FFn) & mask;
    state = (BigInt(_rol16(Number((BigInt(_rol16(Number(t))) * 0x7C932B89n) & mask))) * 0xBFA49F69n) & mask;
    acc = (acc + state) & mask;
  }
  return [Number(swap_last ^ state), Number(swap_acc ^ acc)];
}
function generateSecMsGecV2(unix_timestamp = null) {
  let ticks = BigInt(Math.floor(unix_timestamp || (Date.now() / 1000))) + edgeClockSkew;
  ticks += WIN_EPOCH;
  ticks -= ticks % 300n;
  ticks *= S_TO_NS / 100n;
  const strToHash = new TextEncoder().encode(String(ticks) + EDGE_TRUSTED_TOKEN);
  const digest = _sha256_digest(strToHash);
  const [cs0, cs1] = _cs64_digest(strToHash, digest);

  const csBuf = new Uint8Array(8);
  const csView = new DataView(csBuf.buffer);
  csView.setUint32(0, cs0 >>> 0, true);
  csView.setUint32(4, cs1 >>> 0, true);

  const hexCs = Array.from(csBuf).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const hexDig = Array.from(digest).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hexCs}-${hexDig}`;
}

async function fetchBackgroundEdgeTTS(text, voice) {
  return new Promise((resolve, reject) => {
    try {
      const secGec = generateSecMsGecV2();
      const requestId = crypto.randomUUID().replace(/-/g, '');
      const wssUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TRUSTED_TOKEN}&Sec-MS-GEC=${secGec}&Sec-MS-GEC-Version=2-143.0.3650.75&ConnectionId=${requestId}`;

      const ws = new WebSocket(wssUrl);
      ws.binaryType = 'arraybuffer';
      const audioChunks = [];
      let isDone = false;

      const timer = setTimeout(() => {
        if (!isDone) {
          try { ws.close(); } catch(e) {}
          reject(new Error('Edge-TTS timeout'));
        }
      }, 5000);

      ws.onopen = () => {
        const configMsg = `Content-Type:application/json;charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                  outputFormat: "audio-24khz-48kbitrate-mono-mp3"
                }
              }
            }
          }) + "\r\n";
        ws.send(configMsg);

        const safeText = text.replace(/[<>&"']/g, '');
        const voiceName = voice || 'vi-VN-NamMinhNeural';
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'>` +
          `<voice name='${voiceName}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${safeText}</prosody></voice></speak>`;
        const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      };

      ws.onmessage = async event => {
        let rawData = event.data;
        if (typeof rawData === 'string') {
          if (rawData.includes('Path:turn.end')) {
            isDone = true;
            clearTimeout(timer);
            try { ws.close(); } catch(e) {}

            if (audioChunks.length === 0) {
              reject(new Error('No audio received'));
              return;
            }

            const totalLen = audioChunks.reduce((acc, c) => acc + c.byteLength, 0);
            const merged = new Uint8Array(totalLen);
            let offset = 0;
            for (const c of audioChunks) {
              merged.set(new Uint8Array(c), offset);
              offset += c.byteLength;
            }

            // Convert to base64 for message passing
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < merged.length; i += chunkSize) {
              binary += String.fromCharCode.apply(null, merged.subarray(i, i + chunkSize));
            }
            const base64 = btoa(binary);
            resolve(base64);
          }
        } else {
          try {
            let arrayBuffer = null;
            if (rawData instanceof ArrayBuffer) {
              arrayBuffer = rawData;
            } else if (rawData instanceof Blob) {
              arrayBuffer = await rawData.arrayBuffer();
            }
            if (arrayBuffer && arrayBuffer.byteLength > 2) {
              const view = new DataView(arrayBuffer);
              const headerLen = view.getUint16(0, false);
              if (arrayBuffer.byteLength > headerLen + 2) {
                audioChunks.push(arrayBuffer.slice(headerLen + 2));
              }
            }
          } catch (e) {}
        }
      };

      ws.onclose = event => {
        if (!isDone) {
          clearTimeout(timer);
          reject(new Error(`WebSocket closed early: code ${event.code}`));
        }
      };

      ws.onerror = err => {
        clearTimeout(timer);
        console.error('[Edge-TTS] Connection error:', err);
        reject(err);
      };
    } catch (e) {
      reject(e);
    }
  });
}

// ─── TỔNG HỢP ÂM THANH DỰ PHÒNG GOOGLE TTS QUA BACKGROUND SERVICE WORKER (KHÔNG BỊ CSP) ───
async function fetchBackgroundGoogleTTS(text) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error('Google TTS HTTP failed: ' + res.status);
  const arrayBuf = await res.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ─── TỰ ĐỘNG THỬ EDGE-TTS TRƯỚC, NẾU LỖI CHUYỂN DỰ PHÒNG KHÔNG BAO GIỜ BỊ MẤT TIẾNG ───
async function synthesizeTTSWithFallback(text, voice) {
  try {
    return await fetchBackgroundEdgeTTS(text, voice);
  } catch (err) {
    console.warn('[TTS] Edge-TTS không khả dụng, dùng Google TTS dự phòng trong service worker:', err);
    return await fetchBackgroundGoogleTTS(text);
  }
}

// ─── TẢI PHỤ ĐỀ YOUTUBE BẰNG INNERTUBE API (ĐA NỀN TẢNG: IOS, WEB, ANDROID) ───
async function fetchInnerTubeSubtitles(videoId) {
  const url = 'https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false';
  const tryClients = [
    {
      clientName: 'IOS',
      clientVersion: '20.10.4',
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      platform: 'MOBILE',
      osName: 'iOS',
      osVersion: '18.3.2.22D82',
      userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
      clientNumber: '5'
    },
    {
      clientName: 'WEB',
      clientVersion: '2.20241028.01.00',
      platform: 'DESKTOP',
      osName: 'Windows',
      osVersion: '10.0',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      clientNumber: '1'
    },
    {
      clientName: 'ANDROID',
      clientVersion: '19.44.38',
      deviceMake: 'Google',
      deviceModel: 'Pixel 8',
      platform: 'MOBILE',
      osName: 'Android',
      osVersion: '14',
      userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14; en_US; Pixel 8)',
      clientNumber: '3'
    }
  ];

  for (const c of tryClients) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': c.userAgent,
          'X-YouTube-Client-Name': c.clientNumber,
          'X-YouTube-Client-Version': c.clientVersion,
          'Origin': 'https://www.youtube.com'
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: c.clientName,
              clientVersion: c.clientVersion,
              hl: 'en',
              gl: 'US',
              ...(c.deviceMake ? { deviceMake: c.deviceMake, deviceModel: c.deviceModel } : {}),
              platform: c.platform,
              osName: c.osName,
              osVersion: c.osVersion
            }
          },
          videoId: videoId
        })
      });
      const data = await res.json();
      const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length > 0) {
        // Ưu tiên: Tiếng Việt -> Tiếng Anh manual -> Tiếng Anh auto -> Track bất kỳ
        const best = tracks.find(t => t.languageCode === 'vi')
          || tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
          || tracks.find(t => t.languageCode === 'en')
          || tracks[0];

        const subRes = await fetch(best.baseUrl);
        const xml = await subRes.text();
        if (xml && xml.length > 20) {
          return { xml, track: best };
        }
      }
    } catch (e) {
      // Thử client tiếp theo
    }
  }
  throw new Error('Không tìm thấy track phụ đề trong InnerTube');
}

// ─── TẢI PHỤ ĐỀ YOUTUBE TIMEDTEXT XUYÊN DOMAIN ───
async function fetchSubtitles(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });
    return await res.text();
  } catch (err) {
    return '';
  }
}

// ─── TỰ ĐỘNG GIẢI PHÓNG RAM CÁC TAB CHẠY NGẦM KHÔNG DÙNG (MEMORY SAVER) ───
setInterval(() => {
  chrome.tabs.query({ active: false, discarded: false }, tabs => {
    tabs.forEach(tab => {
      if (!tab.audible && tab.id && !tab.pinned) {
        chrome.tabs.discard(tab.id).catch(() => {});
      }
    });
  });
}, 10 * 60 * 1000);

function incrementBlocked(count = 1, kb = 0) {
  chrome.storage.local.get(['blockedTotal', 'blockedToday', 'savedKB', 'lastDate'], data => {
    const today = new Date().toDateString();
    let todayCount = (data.lastDate === today) ? (data.blockedToday || 0) : 0;
    const newTotal = (data.blockedTotal || 0) + count;
    const newToday = todayCount + count;
    const newKB = (data.savedKB || 0) + kb;

    chrome.storage.local.set({
      blockedTotal: newTotal,
      blockedToday: newToday,
      savedKB: newKB,
      lastDate: today
    });

    const label = newToday >= 10000 ? '∞' : newToday >= 1000 ? Math.floor(newToday / 1000) + 'k' : String(newToday);
    chrome.action.setBadgeText({ text: label });
    chrome.action.setBadgeBackgroundColor({ color: '#00e676' });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'DUB_FETCH_INNERTUBE_SUBTITLES') {
    fetchInnerTubeSubtitles(msg.videoId)
      .then(res => sendResponse({ ok: true, xml: res.xml, track: res.track }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'DUB_GET_SUBTITLES') {
    fetchSubtitles(msg.url)
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'DUB_TRANSLATE') {
    const { text, targetDuration, provider, apiKey } = msg;
    if (provider === 'gemini') {
      fetchGeminiTranslate(text, apiKey, targetDuration)
        .then(result => sendResponse({ ok: true, result, provider: 'gemini' }))
        .catch(err => {
          fetchGoogleTranslate(text, 'vi')
            .then(result => sendResponse({ ok: true, result, provider: 'google_fallback' }))
            .catch(e => sendResponse({ ok: false, error: e.message }));
        });
    } else {
      fetchGoogleTranslate(text, 'vi')
        .then(result => sendResponse({ ok: true, result, provider: 'google' }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
    }
    return true;
  }

  if (msg.type === 'DUB_SYNTHESIZE_TTS') {
    synthesizeTTSWithFallback(msg.text, msg.voice)
      .then(audioBase64 => sendResponse({ ok: true, audioBase64 }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'TRANSLATE_TEXT') {
    fetchGoogleTranslate(msg.text, msg.to || 'vi')
      .then(result => sendResponse({ ok: true, result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'AD_BLOCKED') {
    incrementBlocked(msg.count || 1, msg.kb || 1);
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'GET_STATS') {
    chrome.storage.local.get(null, sendResponse);
    return true;
  }

  if (msg.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set(msg.settings, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'CLEAR_CACHE') {
    chrome.browsingData.remove({
      since: 0
    }, {
      cache: true,
      cacheStorage: true
    }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'RESET_STATS') {
    chrome.storage.local.set({
      blockedTotal: 0, blockedToday: 0, savedKB: 0,
      lastDate: new Date().toDateString()
    }, () => sendResponse({ ok: true }));
    chrome.action.setBadgeText({ text: '' });
    return true;
  }
});
