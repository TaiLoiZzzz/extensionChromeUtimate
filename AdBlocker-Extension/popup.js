// UltraBlock Pro - Popup Script

const KEYS = ['autoTranslate','blockAds','blockBetting','removeCookieBanners','ytSkipAds','ytAutoHD','ytRemoveShorts'];

function fmtNum(n) {
  n = n || 0;
  return n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
}
function fmtKB(kb) {
  kb = kb || 0;
  if (kb >= 1024) return (kb/1024).toFixed(1)+'MB';
  return Math.round(kb)+'KB';
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

    // Audio Gain
    const gain = parseFloat(data.ytAudioGain) || 2.2;
    const gainSlider = document.getElementById('audioGainSlider');
    const gainVal = document.getElementById('audioGainVal');
    if (gainSlider && gainVal) {
      gainSlider.value = gain;
      gainVal.textContent = Math.round(gain * 100) + '%';
    }

    // AI Dubbing Settings
    const dubEnabled = document.getElementById('dubbingEnabled');
    if (dubEnabled) dubEnabled.checked = data.dubbingEnabled === true;

    const dubProvider = document.getElementById('dubbingProvider');
    if (dubProvider) dubProvider.value = data.dubbingProvider || 'gemini';

    const geminiKeyInput = document.getElementById('geminiApiKey');
    if (geminiKeyInput) geminiKeyInput.value = data.geminiApiKey || '';

    const dubVoice = document.getElementById('dubbingVoice');
    if (dubVoice) dubVoice.value = data.dubbingVoice || 'vi-VN-HoaiMyNeural';

    // Âm lượng lồng tiếng
    const dubVol = data.dubbingVolume !== undefined ? parseFloat(data.dubbingVolume) : 1.0;
    const dubVolSlider = document.getElementById('dubVolumeSlider');
    const dubVolVal = document.getElementById('dubVolumeVal');
    if (dubVolSlider && dubVolVal) {
      dubVolSlider.value = dubVol;
      dubVolVal.textContent = Math.round(dubVol * 100) + '%';
    }

    // Âm lượng tiếng video gốc khi thuyết minh
    const dubDuck = data.dubbingDuckLevel !== undefined ? parseFloat(data.dubbingDuckLevel) : 0.15;
    const dubDuckSlider = document.getElementById('dubDuckSlider');
    const dubDuckVal = document.getElementById('dubDuckVal');
    if (dubDuckSlider && dubDuckVal) {
      dubDuckSlider.value = dubDuck;
      dubDuckVal.textContent = Math.round(dubDuck * 100) + '%';
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

  // Slider kích âm thanh
  const gainSlider = document.getElementById('audioGainSlider');
  const gainVal = document.getElementById('audioGainVal');
  gainSlider?.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    gainVal.textContent = Math.round(val * 100) + '%';
    chrome.storage.local.set({ ytAudioGain: val, ytAudioBoost: true });
  });

  // AI Dubbing Listeners
  document.getElementById('dubbingEnabled')?.addEventListener('change', e => {
    chrome.storage.local.set({ dubbingEnabled: e.target.checked });
  });

  document.getElementById('dubbingProvider')?.addEventListener('change', e => {
    chrome.storage.local.set({ dubbingProvider: e.target.value });
  });

  document.getElementById('geminiApiKey')?.addEventListener('change', e => {
    chrome.storage.local.set({ geminiApiKey: e.target.value.trim() });
  });

  document.getElementById('dubbingVoice')?.addEventListener('change', e => {
    chrome.storage.local.set({ dubbingVoice: e.target.value });
  });

  // Slider chỉnh âm lượng giọng dịch
  const dubVolSlider = document.getElementById('dubVolumeSlider');
  const dubVolVal = document.getElementById('dubVolumeVal');
  dubVolSlider?.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    dubVolVal.textContent = Math.round(val * 100) + '%';
    chrome.storage.local.set({ dubbingVolume: val });
  });

  // Slider chỉnh âm lượng video gốc khi đang nói
  const dubDuckSlider = document.getElementById('dubDuckSlider');
  const dubDuckVal = document.getElementById('dubDuckVal');
  dubDuckSlider?.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    dubDuckVal.textContent = Math.round(val * 100) + '%';
    chrome.storage.local.set({ dubbingDuckLevel: val });
  });

  // Xóa cache
  document.getElementById('clearCacheBtn')?.addEventListener('click', function() {
    this.textContent = '⏳ Đang xóa...';
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
      this.textContent = '✅ Xong!';
      setTimeout(() => this.textContent = '🗑 Xóa cache', 1500);
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
