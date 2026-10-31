// ====================================================
// UltraBlock Pro - Background Service Worker (Rock Solid)
// Chặn quảng cáo, Tối ưu bộ nhớ, Thống kê chặn
// ====================================================

const DEFAULT_SETTINGS = {
  enabled: true,
  blockAds: true,
  blockTrackers: true,
  blockBetting: true,
  blockPopups: true,
  boostPerf: true,
  lazyImages: true,
  removeCookieBanners: true,
  ytSkipAds: true,
  ytAutoHD: true,
  ytRemoveShorts: false,
  ytAudioGain: 2.2,
  ytAudioBoost: true,
  blockedTotal: 0,
  blockedToday: 0,
  savedKB: 0,
  lastDate: new Date().toDateString()
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, existing => {
    chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...existing });
  });
});

// ── TỰ ĐỘNG GIẢI PHÓNG RAM CÁC TAB CHẠY NGẦM KHÔNG DÙNG (MEMORY SAVER) ──
setInterval(() => {
  chrome.tabs.query({ active: false, discarded: false }, tabs => {
    tabs.forEach(tab => {
      if (tab.id && !tab.pinned && !tab.audible && !tab.url?.includes('youtube.com')) {
        chrome.tabs.discard(tab.id).catch(() => {});
      }
    });
  });
}, 30 * 60 * 1000); // Mỗi 30 phút dọn RAM 1 lần

// ── BỘ ĐẾM SỐ QUẢNG CÁO ĐÃ CHẶN ──
function incrementBlocked(count = 1, kb = 0) {
  chrome.storage.local.get(['blockedTotal', 'blockedToday', 'savedKB', 'lastDate'], d => {
    const today = new Date().toDateString();
    const isNewDay = d.lastDate !== today;
    const total = (d.blockedTotal || 0) + count;
    const day = isNewDay ? count : (d.blockedToday || 0) + count;
    const saved = (d.savedKB || 0) + kb;

    chrome.storage.local.set({
      blockedTotal: total,
      blockedToday: day,
      savedKB: saved,
      lastDate: today
    });

    const label = day >= 1000 ? (day / 1000).toFixed(1) + 'K' : String(day);
    chrome.action.setBadgeText({ text: label });
    chrome.action.setBadgeBackgroundColor({ color: '#00e676' });
  });
}

// ── ĐẾM SỐ QUẢNG CÁO BỊ DECLARATIVE NET REQUEST CHẶN ──
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(() => {
    incrementBlocked(1, 15);
  });
}

// ── XỬ LÝ MESSAGE TỪ POPUP VÀ CONTENT SCRIPTS ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'AD_BLOCKED') {
    incrementBlocked(msg.count || 1, msg.kb || 15);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'GET_SETTINGS') {
    chrome.storage.local.get(null, sendResponse);
    return true;
  }

  if (msg.type === 'SET_SETTINGS') {
    chrome.storage.local.set(msg.settings, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'CLEAR_CACHE') {
    chrome.browsingData.remove({
      since: 0
    }, {
      cache: true,
      serviceWorkers: true
    }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'RESET_STATS') {
    chrome.storage.local.set({
      blockedTotal: 0,
      blockedToday: 0,
      savedKB: 0
    }, () => {
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ ok: true });
    });
    return true;
  }
});
