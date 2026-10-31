// UltraBlock Pro - Popup Script

const KEYS = ['blockAds', 'blockBetting', 'removeCookieBanners', 'ytSkipAds', 'ytAutoHD', 'ytRemoveShorts'];

function fmtNum(n) {
  n = n || 0;
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}

function fmtKB(kb) {
  kb = kb || 0;
  if (kb >= 1024) return (kb / 1024).toFixed(1) + 'MB';
  return Math.round(kb) + 'KB';
}

document.addEventListener('DOMContentLoaded', () => {

  // Load cài đặt
  chrome.storage.local.get(null, data => {
    const enabled = data.enabled !== false;
    document.getElementById('masterToggle').checked = enabled;
    document.getElementById('statusDot').className = 'stat-dot' + (enabled ? '' : ' off');
    document.getElementById('countToday').textContent = fmtNum(data.blockedToday);
    document.getElementById('savedKB').textContent = fmtKB(data.savedKB);

    KEYS.forEach(key => {
      const el = document.getElementById(key);
      if (el) el.checked = data[key] !== false;
    });

    // Audio Gain (Khuếch đại âm thanh)
    const gain = parseFloat(data.ytAudioGain) || 2.2;
    const gainSlider = document.getElementById('audioGainSlider');
    const gainVal = document.getElementById('audioGainVal');
    if (gainSlider && gainVal) {
      gainSlider.value = gain;
      gainVal.textContent = Math.round(gain * 100) + '%';
    }
  });

  // Master toggle
  document.getElementById('masterToggle').addEventListener('change', e => {
    const v = e.target.checked;
    chrome.storage.local.set({ enabled: v });
    document.getElementById('statusDot').className = 'stat-dot' + (v ? '' : ' off');
  });

  // Feature toggles
  KEYS.forEach(key => {
    document.getElementById(key)?.addEventListener('change', e => {
      chrome.storage.local.set({ [key]: e.target.checked });
    });
  });

  // Slider kích âm thanh 500%
  const gainSlider = document.getElementById('audioGainSlider');
  const gainVal = document.getElementById('audioGainVal');
  gainSlider?.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    gainVal.textContent = Math.round(val * 100) + '%';
    chrome.storage.local.set({ ytAudioGain: val, ytAudioBoost: true });
  });

  // Xóa cache
  document.getElementById('clearCacheBtn')?.addEventListener('click', function () {
    this.textContent = '⏳ Đang xóa...';
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
      this.textContent = '✓ Xong!';
      setTimeout(() => this.textContent = '🗑️ Xóa cache', 1500);
    });
  });

  // Reload tab
  document.getElementById('reloadBtn')?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) chrome.tabs.reload(tabs[0].id);
    });
    window.close();
  });

});
