// UltraBlock Pro - Popup Script

const KEYS = ['autoTranslate', 'ytAutoHD'];

document.addEventListener('DOMContentLoaded', () => {

  // Load cài đặt
  chrome.storage.local.get(null, data => {
    const enabled = data.enabled !== false;
    document.getElementById('masterToggle').checked = enabled;

    KEYS.forEach(key => {
      const el = document.getElementById(key);
      if (el) el.checked = data[key] !== false;
    });

    // Theme selector
    const currentTheme = data.ytTheme || 'cyberpunk';
    document.querySelectorAll('.theme-pill').forEach(pill => {
      const theme = pill.dataset.theme;
      if (theme === currentTheme) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    const customInput = document.getElementById('customBgUrlInput');
    if (currentTheme === 'custom') {
      customInput.style.display = 'block';
      customInput.value = data.ytCustomBgUrl || '';
    }

    // Audio Gain
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
    chrome.storage.local.set({ enabled: e.target.checked });
  });

  // Feature toggles
  KEYS.forEach(key => {
    document.getElementById(key)?.addEventListener('change', e => {
      chrome.storage.local.set({ [key]: e.target.checked });
    });
  });

  // Xử lý chọn hình nền phong cách (Theme Pills)
  document.querySelectorAll('.theme-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.theme-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const theme = pill.dataset.theme;
      const customInput = document.getElementById('customBgUrlInput');

      if (theme === 'custom') {
        customInput.style.display = 'block';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
        chrome.storage.local.set({ ytTheme: theme });
      }
    });
  });

  // Lưu link hình nền tự chọn
  const customInput = document.getElementById('customBgUrlInput');
  customInput?.addEventListener('input', e => {
    const url = e.target.value.trim();
    chrome.storage.local.set({ ytTheme: 'custom', ytCustomBgUrl: url });
  });

  // Slider âm thanh
  const gainSlider = document.getElementById('audioGainSlider');
  const gainVal = document.getElementById('audioGainVal');
  gainSlider?.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    gainVal.textContent = Math.round(val * 100) + '%';
    chrome.storage.local.set({ ytAudioGain: val, ytAudioBoost: true });
  });

  // Xóa cache
  document.getElementById('clearCacheBtn')?.addEventListener('click', function () {
    this.textContent = 'Đang xóa...';
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
      this.textContent = 'Đã xong!';
      setTimeout(() => this.textContent = 'Xóa cache', 1500);
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
