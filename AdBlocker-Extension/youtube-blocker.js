// ====================================================
// UltraBlock Pro - YouTube Engine (Custom Theme & Ambient Art)
// Giao diện siêu đẹp: Đổi hình nền, Dark Glassmorphism, Hi-Fi Audio
// ====================================================
(function () {
  'use strict';
  if (!location.hostname.includes('youtube.com')) return;

  // ─── Cấu hình ────────────────────────────────────
  let S = {
    ytSkipAds: true,
    ytAutoHD: true,
    ytRememberSpeed: true,
    ytSavedSpeed: 1,
    ytAudioBoost: true,
    ytAudioGain: 2.2,
    ytTheme: 'cyberpunk', // 'none', 'cyberpunk', 'galaxy', 'aurora', 'matrix', 'sunset', 'custom'
    ytCustomBgUrl: '',
    ytBgDim: 0.65 // Độ mờ làm tối nền để nhìn rõ video (0.3 đến 0.9)
  };

  function sendAudioGainToMainWorld() {
    const gainVal = S.ytAudioBoost !== false ? (parseFloat(S.ytAudioGain) || 2.2) : 1.0;
    window.postMessage({ type: 'UB_SET_AUDIO_GAIN', gain: gainVal }, '*');
  }

  chrome.storage.local.get(null, d => {
    Object.assign(S, d);
    applyYouTubeTheme();
    sendAudioGainToMainWorld();
  });

  chrome.storage.onChanged.addListener(changes => {
    for (const k in changes) S[k] = changes[k].newValue;
    applyYouTubeTheme();
    sendAudioGainToMainWorld();
  });

  // ====================================================
  // PHẦN 1: QUẢN LÝ HÌNH NỀN & GIAO DIỆN SIÊU ĐẸP
  // ====================================================
  const THEME_WALLPAPERS = {
    none: '',
    cyberpunk: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=2560&auto=format&fit=crop', // Neon Cyberpunk
    galaxy: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2560&auto=format&fit=crop', // Deep Space Galaxy
    aurora: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=2560&auto=format&fit=crop', // Northern Lights Aurora
    matrix: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=2560&auto=format&fit=crop', // Cyber Code Dark
    sunset: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2560&auto=format&fit=crop'  // Relaxing Sunset
  };

  const styleEl = document.createElement('style');
  styleEl.id = 'ub-yt-theme-style';
  (document.head || document.documentElement).appendChild(styleEl);

  function applyYouTubeTheme() {
    const theme = S.ytTheme || 'cyberpunk';
    let bgUrl = '';

    if (theme === 'custom' && S.ytCustomBgUrl) {
      bgUrl = S.ytCustomBgUrl;
    } else if (THEME_WALLPAPERS[theme]) {
      bgUrl = THEME_WALLPAPERS[theme];
    }

    const dim = S.ytBgDim !== undefined ? parseFloat(S.ytBgDim) : 0.65;

    let bgCSS = '';
    if (bgUrl) {
      bgCSS = `
        /* Lớp nền Wallpaper cố định mượt mà */
        ytd-app, #page-manager, body, html {
          background-color: transparent !important;
        }

        #ub-yt-background-layer {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: -999999 !important;
          pointer-events: none !important;
          background-image: linear-gradient(rgba(10, 10, 16, ${dim}), rgba(10, 10, 16, ${dim})), url("${bgUrl}") !important;
          background-size: cover !important;
          background-position: center center !important;
          background-attachment: fixed !important;
          filter: saturate(1.15) !important;
          transition: background-image 0.4s ease-in-out !important;
        }

        /* Hiệu ứng kính mờ Glassmorphism cao cấp */
        #masthead-container, #background.ytd-masthead {
          background: rgba(14, 15, 24, 0.75) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        }

        ytd-guide-renderer, #guide-content.ytd-app {
          background: rgba(14, 15, 24, 0.8) !important;
          backdrop-filter: blur(18px) !important;
          -webkit-backdrop-filter: blur(18px) !important;
          border-right: 1px solid rgba(255, 255, 255, 0.08) !important;
        }

        /* Thẻ video Card bo góc mờ nghệ thuật */
        ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer {
          background: rgba(255, 255, 255, 0.03) !important;
          border-radius: 12px !important;
          padding: 8px !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
          transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease !important;
        }
        ytd-rich-item-renderer:hover, ytd-video-renderer:hover {
          transform: translateY(-3px) !important;
          background: rgba(255, 255, 255, 0.07) !important;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0, 230, 118, 0.15) !important;
          border-color: rgba(0, 230, 118, 0.3) !important;
        }

        /* Khung thông tin dưới video chính */
        #above-the-fold, #below {
          background: rgba(18, 19, 28, 0.65) !important;
          backdrop-filter: blur(12px) !important;
          border-radius: 14px !important;
          padding: 16px !important;
          margin-top: 12px !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
      `;
    }

    styleEl.textContent = `
      /* Ép GPU render video 60FPS không giật */
      #movie_player video, .html5-main-video {
        transform: translateZ(0) !important;
        backface-visibility: hidden !important;
        will-change: transform !important;
      }

      /* Khung phát video bo góc Cinema sang trọng */
      #movie_player, .html5-video-player {
        border-radius: 14px !important;
        overflow: hidden !important;
        box-shadow: 0 16px 45px rgba(0, 0, 0, 0.8), 0 0 25px rgba(0, 230, 118, 0.12) !important;
      }

      /* Tắt Ambient Mode ngốn GPU */
      #cinematics, .ytp-ambient-lighting, ytd-watch-flexy[theater] #cinematics {
        display: none !important;
      }

      /* Xóa toàn bộ quảng cáo banner & overlay */
      #player-ads, #masthead-ad,
      ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer,
      ytd-banner-promo-renderer, ytd-statement-banner-renderer,
      ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer,
      ytd-search-pyv-renderer, ytd-mealbar-promo-renderer,
      ytd-primetime-promo-renderer, ytd-companion-slot-renderer,
      ytd-action-companion-ad-renderer, ytd-display-ad-renderer,
      .ytp-ad-overlay-container, .ytp-ad-text-overlay,
      .ytp-ad-image-overlay, .video-ads.ytp-ad-module,
      ytd-donation-shelf-renderer, ytd-merch-shelf-renderer,
      #merchandise-shelf, .ytp-suggested-action {
        display: none !important;
      }

      /* Xóa rác gây phân tâm (Shorts, Live Chat, Playables) */
      ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts],
      a[href^="/shorts"], [title="Shorts"], ytd-shorts,
      #chat, #chat-container, ytd-live-chat-frame, yt-live-chat-app,
      .ytp-ce-element, .ytp-ce-covering-overlay, .ytp-endscreen-content {
        display: none !important;
      }

      ${bgCSS}
    `;

    // Đảm bảo thẻ nền tồn tại trong DOM
    if (bgUrl) {
      let bgLayer = document.getElementById('ub-yt-background-layer');
      if (!bgLayer) {
        bgLayer = document.createElement('div');
        bgLayer.id = 'ub-yt-background-layer';
        document.documentElement.appendChild(bgLayer);
      }
    } else {
      const existing = document.getElementById('ub-yt-background-layer');
      if (existing) existing.remove();
    }
  }

  // ====================================================
  // PHẦN 2: SKIP ADS TỨC THÌ
  // ====================================================
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-container button',
    'button.ytp-ad-overlay-close-button'
  ];

  function tryClickSkip() {
    for (const sel of SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  }
  setInterval(tryClickSkip, 100);

  // ====================================================
  // PHẦN 3: AUTO CHẤT LƯỢNG CAO (1080P/4K)
  // ====================================================
  let hdDone = false;
  function setBestQuality() {
    if (!S.ytAutoHD || hdDone) return;
    const player = document.getElementById('movie_player');
    if (player && typeof player.getAvailableQualityLevels === 'function') {
      const list = player.getAvailableQualityLevels();
      if (list && list.length > 0) {
        const best = list[0];
        if (typeof player.setPlaybackQualityRange === 'function') player.setPlaybackQualityRange(best, best);
        if (typeof player.setPlaybackQuality === 'function') player.setPlaybackQuality(best);
        hdDone = true;
      }
    }
  }

  function onVideoReady() {
    const video = document.querySelector('video');
    if (video) {
      setBestQuality();
      sendAudioGainToMainWorld();
      if (S.ytRememberSpeed) {
        const spd = parseFloat(S.ytSavedSpeed) || 1;
        if (video.playbackRate !== spd && !document.querySelector('.ad-showing')) {
          video.playbackRate = spd;
        }
      }
    }
  }

  document.addEventListener('yt-navigate-finish', () => {
    hdDone = false;
    setTimeout(onVideoReady, 300);
    applyYouTubeTheme();
  });

  document.addEventListener('play', (e) => {
    if (e.target.tagName === 'VIDEO') onVideoReady();
  }, true);

  applyYouTubeTheme();
  setTimeout(onVideoReady, 800);
})();
