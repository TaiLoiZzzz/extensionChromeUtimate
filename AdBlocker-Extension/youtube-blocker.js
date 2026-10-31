// ====================================================
// UltraBlock Pro - YouTube Engine (PURE CINEMA & INSTANT SKIP)
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
    ytAudioGain: 3.0
  };

  function sendAudioGainToMainWorld() {
    const gainVal = S.ytAudioBoost !== false ? (parseFloat(S.ytAudioGain) || 3.0) : 1.0;
    window.postMessage({ type: 'UB_SET_AUDIO_GAIN', gain: gainVal }, '*');
  }

  chrome.storage.local.get(null, d => {
    Object.assign(S, d);
    applyPureCinemaCSS();
    sendAudioGainToMainWorld();
  });

  chrome.storage.onChanged.addListener(changes => {
    for (const k in changes) S[k] = changes[k].newValue;
    applyPureCinemaCSS();
    sendAudioGainToMainWorld();
  });

  // ====================================================
  // PHẦN 1: TRIỆT TIÊU TUYỆT ĐỐI UI/UX RÁC CỦA YOUTUBE
  // ====================================================
  const styleEl = document.createElement('style');
  styleEl.id = 'ub-yt-pure-cinema-style';
  (document.head || document.documentElement).appendChild(styleEl);

  function applyPureCinemaCSS() {
    let css = `
      /* Ép GPU Render Video 60FPS */
      #movie_player video, .html5-main-video {
        transform: translateZ(0) !important;
        backface-visibility: hidden !important;
        will-change: transform !important;
      }

      /* Khung video và Live Chat tự nhiên */
      ytd-watch-flexy:not([live]) #related {
        display: none !important;
      }
      ytd-watch-flexy[theater] #chat-container {
        display: block !important;
      }

      /* Chỉ ẩn video đề xuất liên quan, giữ lại khung Chat trong #secondary */
      #related, ytd-watch-next-secondary-results-renderer {
        display: none !important;
      }

      /* Xóa khu vực bình luận */
      #comments, ytd-comments, #item-section {
        display: none !important;
      }

      /* Xóa nút tương tác rườm rà */
      #top-level-buttons-computed, #actions-inner,
      ytd-menu-renderer[has-flexible-items], ytd-download-button-renderer,
      #ticket-shelf, ytd-merch-shelf-renderer, #merchandise-shelf,
      ytd-donation-shelf-renderer {
        display: none !important;
      }

      /* Giữ Live Chat và khu vực tương tác khi xem Live */
      /* Không ẩn #chat, #chat-container, ytd-live-chat-frame */

      /* Xóa Ambient Lighting */
      #cinematics, .ytp-ambient-lighting {
        display: none !important;
      }

      /* Xóa Shorts */
      ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts],
      a[href^="/shorts"], ytd-guide-entry-renderer:has(a[href="/shorts"]),
      ytd-mini-guide-entry-renderer:has(a[href="/shorts"]), [title="Shorts"], ytd-shorts {
        display: none !important;
      }

      /* Xóa End-Screen & Info Cards */
      .ytp-ce-element, .ytp-ce-covering-overlay, .ytp-endscreen-content,
      .ytp-cards-teaser, .ytp-cards-button, .iv-branding {
        display: none !important;
      }

      /* Xóa Popup & Banner Ads */
      ytd-popup-container:has(ytd-mealbar-promo-renderer),
      ytd-premium-yva-upsell-dialog-renderer, tp-yt-paper-dialog:has(#feedback),
      ytd-sponsorships-offer-dialog-view-model, .ytp-suggested-action, #clarify-box,
      #player-ads, #masthead-ad, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer,
      ytd-banner-promo-renderer, ytd-statement-banner-renderer,
      ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer,
      ytd-search-pyv-renderer, ytd-mealbar-promo-renderer,
      ytd-primetime-promo-renderer, ytd-companion-slot-renderer,
      ytd-action-companion-ad-renderer, ytd-display-ad-renderer,
      .ytp-ad-overlay-container, .ytp-ad-text-overlay,
      .ytp-ad-image-overlay, .video-ads.ytp-ad-module {
        display: none !important;
      }
    `;
    styleEl.textContent = css;
  }

  // ====================================================
  // PHẦN 2: CLICK SKIP NGAY LẬP TỨC (KHÔNG TĂNG TỐC 16X NỮA)
  // ====================================================
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-container button',
    'button.ytp-ad-overlay-close-button',
    '[class*="ytp-ad-skip-button"]'
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
  // PHẦN 3: AUTO HD CHẤT LƯỢNG CAO NHẤT (1080P/4K)
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

  function boostBufferSize() {
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof player.getMediaElement === 'function') {
        const el = player.getMediaElement();
        if (el) el.preload = 'auto';
      }
    } catch(e) {}
  }

  function onVideoReady() {
    const video = document.querySelector('video');
    if (video) {
      setBestQuality();
      boostBufferSize();
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
  });

  document.addEventListener('play', (e) => {
    if (e.target.tagName === 'VIDEO') {
      onVideoReady();
    }
  }, true);

  applyPureCinemaCSS();
  setTimeout(onVideoReady, 800);
  setInterval(sendAudioGainToMainWorld, 3000);
})();
