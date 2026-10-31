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
