// ====================================================
// UltraBlock Pro - Audiophile Studio Sound Engine
// Xử lý âm thanh chuyên nghiệp: Khuếch đại lớn + Giữ trọn độ hay
// ====================================================
(function () {
  'use strict';

  let currentGainValue = 2.2; // Khuếch đại tối ưu chuẩn Studio (220%)
  let audioCtx = null;
  let preGainNode = null;
  let duckingGainNode = null;
  let waveShaper = null;
  let bassFilter = null;
  let midFilter = null;
  let airFilter = null;
  let studioLimiter = null;
  let audioSource = null;
  let boundVideo = null;
  let cachedCaptionTracks = [];

  // ─── 1. THUẬT TOÁN TUBE SATURATION / SOFT CLIPPER (CHỐNG RÉO MÉO RÁC TAI) ───
  // Mô phỏng amply đèn điện tử (Analog Warmth): Uốn cong đỉnh sóng thay vì cắt phẳng
  function createAnalogSoftClipCurve() {
    const samples = 65536;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / samples - 1;
      // Thuật toán Tanh bão hòa âm thanh mềm mại: Giữ 100% chi tiết ở âm lượng thường,
      // khi âm lượng quá to sẽ nén tròn đỉnh mượt mà, tạo âm bass lực và ấm
      curve[i] = Math.tanh(1.2 * x);
    }
    return curve;
  }

  // ─── 2. THIẾT LẬP CHUỖI XỬ LÝ ÂM THANH CHUẨN PHÒNG THU (STUDIO MASTERING) ───
  function setupStudioAudiophileEngine(video) {
    if (!video) return;
    if (boundVideo === video && audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      audioSource = audioCtx.createMediaElementSource(video);

      // --- DẢI 1: BASS TẦNG SÂU (Sub-Bass 90Hz) ---
      // Tăng lực trầm chắc gọn, không tăng dải 250Hz để tránh ù rền đục tiếng
      bassFilter = audioCtx.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.setValueAtTime(90, audioCtx.currentTime);
      bassFilter.gain.setValueAtTime(3.0, audioCtx.currentTime); // +3dB Bass sâu

      // --- DẢI 2: GIỌNG HÁT TRONG TRẺO (Vocal Presence 3.2kHz) ---
      // Làm sáng giọng ca sĩ, tách bạch lời bài hát khỏi nhạc nền
      midFilter = audioCtx.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.setValueAtTime(3200, audioCtx.currentTime);
      midFilter.Q.setValueAtTime(0.9, audioCtx.currentTime);
      midFilter.gain.setValueAtTime(2.2, audioCtx.currentTime); // +2.2dB giọng hát nét

      // --- DẢI 3: DẢI KHÔNG KHÍ (Air Treble 11kHz) ---
      // Tạo cảm giác không gian thoáng đãng, tiếng nhạc cụ tơi xốp, mịn màng
      airFilter = audioCtx.createBiquadFilter();
      airFilter.type = 'highshelf';
      airFilter.frequency.setValueAtTime(11000, audioCtx.currentTime);
      airFilter.gain.setValueAtTime(2.5, audioCtx.currentTime); // +2.5dB Treble tơi

      // --- DẢI 4: PRE-GAIN (BỘ KHUẾCH ĐẠI CHÍNH) ---
      preGainNode = audioCtx.createGain();
      preGainNode.gain.setValueAtTime(currentGainValue, audioCtx.currentTime);

      // --- DẢI 5: TUBE ANALOG SATURATOR (CHỐNG VỠ TIẾNG TUYỆT ĐỐI) ---
      waveShaper = audioCtx.createWaveShaper();
      waveShaper.curve = createAnalogSoftClipCurve();
      waveShaper.oversample = '4x'; // Khử răng cưa âm thanh 4 lần chuẩn Hi-Fi

      // --- DẢI 6: STUDIO MASTERING LIMITER ---
      // Khống chế đỉnh sóng tức thời, loại bỏ hoàn toàn tiếng lẹt xẹt, chát chúa
      studioLimiter = audioCtx.createDynamicsCompressor();
      studioLimiter.threshold.setValueAtTime(-4.0, audioCtx.currentTime); // Chỉ can thiệp khi gần vỡ
      studioLimiter.knee.setValueAtTime(35.0, audioCtx.currentTime);      // Chuyển tiếp siêu mượt (Soft-knee)
      studioLimiter.ratio.setValueAtTime(6.0, audioCtx.currentTime);
      studioLimiter.attack.setValueAtTime(0.002, audioCtx.currentTime);   // 2ms phản ứng cực nhạy
      studioLimiter.release.setValueAtTime(0.12, audioCtx.currentTime);   // 120ms nhả âm mượt mà, không bị phập phồng

      // --- DẢI 0: DUCKING GAIN (ĐẶT Ở CUỐI CHUỖI ĐỂ KIỂM SOÁT TRIỆT ĐỂ ÂM LƯỢNG) ---
      duckingGainNode = audioCtx.createGain();
      duckingGainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);

      // NỐI CHUỖI XỬ LÝ ÂM THANH CHUYÊN NGHIỆP:
      // Video Source -> 3-Band Studio EQ -> Pre-Gain -> Tube Saturator -> Studio Limiter -> Ducking Gain Node -> Loa / Tai nghe
      audioSource.connect(bassFilter);
      bassFilter.connect(midFilter);
      midFilter.connect(airFilter);
      airFilter.connect(preGainNode);
      preGainNode.connect(waveShaper);
      waveShaper.connect(studioLimiter);
      studioLimiter.connect(duckingGainNode);
      duckingGainNode.connect(audioCtx.destination);

      boundVideo = video;
      console.log('[UltraBlock DSP] 🎧 Audiophile Engine Activated! Gain =', currentGainValue);
    } catch (err) {}
  }

  function ensureActiveAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }
  ['click', 'keydown', 'play', 'playing', 'volumechange'].forEach(ev => {
    document.addEventListener(ev, ensureActiveAudio, { passive: true });
  });

  // Tắt tính năng tự dìm âm lượng (Stable Volume)
  function disableYouTubeCompression() {
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof player.setStableVolume === 'function') {
        player.setStableVolume(false);
      }
    } catch (e) {}
  }

  function sendCaptionsToIsolatedWorld(tracks) {
    if (!tracks || !tracks.length) {
      // 1. mp.getPlayerResponse() (Cách chuẩn xác và mới nhất của YouTube player)
      try {
        const mp = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (mp && typeof mp.getPlayerResponse === 'function') {
          const resp = mp.getPlayerResponse();
          tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        }
      } catch (e) {}

      // 2. window.ytInitialPlayerResponse
      if (!tracks || !tracks.length) {
        tracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      }

      // 3. mp.getOption('captions', 'tracklist')
      if (!tracks || !tracks.length) {
        try {
          const mp = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
          if (mp && typeof mp.getOption === 'function') {
            const list = mp.getOption('captions', 'tracklist');
            if (Array.isArray(list) && list.length > 0) {
              tracks = list.map(t => ({
                baseUrl: t.baseUrl || t.url || '',
                languageCode: t.languageCode || (t.vss_id ? t.vss_id.replace(/^[a\.]*/, '') : 'en'),
                name: t.name || t.displayName || { simpleText: t.languageName || 'Auto' },
                vssId: t.vssId || t.vss_id || '',
                kind: t.kind || '',
                isTranslatable: t.is_translateable !== false
              }));
            }
          }
        } catch (e) {}
      }

      // 4. cached tracks
      if (!tracks || !tracks.length) {
        tracks = cachedCaptionTracks;
      }
    }

    if (tracks && tracks.length > 0) {
      const normalized = tracks.map(t => ({
        baseUrl: t.baseUrl || t.url || '',
        languageCode: t.languageCode || 'en',
        name: typeof t.name === 'string' ? { simpleText: t.name } : (t.name || { simpleText: 'English' }),
        vssId: t.vssId || t.vss_id || '',
        kind: t.kind || '',
        isTranslatable: t.isTranslatable !== false
      })).filter(t => Boolean(t.baseUrl));

      if (normalized.length > 0) {
        cachedCaptionTracks = normalized;
        window.postMessage({ type: 'UB_CAPTIONS_DATA', tracks: normalized }, '*');
      }
    }
  }

  // Lắng nghe lệnh đổi mức âm lượng, Ducking và lấy phụ đề từ Content Script
  window.addEventListener('message', async (event) => {
    if (!event.data) return;
    if (event.data.type === 'UB_SET_AUDIO_GAIN') {
      currentGainValue = parseFloat(event.data.gain) || 2.2;
      if (preGainNode && audioCtx) {
        preGainNode.gain.setTargetAtTime(currentGainValue, audioCtx.currentTime, 0.05);
      }
      disableYouTubeCompression();
    } else if (event.data.type === 'UB_AUDIO_DUCK') {
      const isDuck = Boolean(event.data.duck);
      let targetGain = 1.0;
      if (isDuck) {
        targetGain = (event.data.level !== undefined && event.data.level !== null)
          ? Math.max(0, Math.min(1.0, parseFloat(event.data.level)))
          : 0.15;
      }

      if (duckingGainNode && audioCtx) {
        duckingGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        duckingGainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.04);
      }

      const v = document.querySelector('video');
      if (v) {
        if (targetGain <= 0.005) {
          v.muted = true;
        } else {
          v.muted = false;
        }
      }
    } else if (event.data.type === 'UB_GET_CAPTIONS') {
      sendCaptionsToIsolatedWorld();
    } else if (event.data.type === 'UB_FETCH_SUBTITLES_DIRECT') {
      const reqUrl = event.data.url;
      const reqId = event.data.requestId;
      try {
        const res = await window.fetch(reqUrl, { credentials: 'include' });
        const text = await res.text();
        window.postMessage({ type: 'UB_SUBTITLES_FETCHED', requestId: reqId, data: text, success: true }, '*');
      } catch (err) {
        window.postMessage({ type: 'UB_SUBTITLES_FETCHED', requestId: reqId, error: err.message, success: false }, '*');
      }
    } else if (event.data.type === 'UB_FORCE_LOAD_CAPTIONS') {
      try {
        const mp = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (mp) {
          if (typeof mp.loadModule === 'function') mp.loadModule('captions');
          if (typeof mp.getOption === 'function') {
            const list = mp.getOption('captions', 'tracklist') || [];
            const best = list.find(t => t.languageCode === 'en' || t.languageCode === 'vi') || list[0];
            if (best && typeof mp.setOption === 'function') {
              mp.setOption('captions', 'track', best);
            }
          }
        }
      } catch (e) {}
    }
  });

  // Hook XMLHttpRequest để bắt các gói tin timedtext nếu YouTube dùng XHR
  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._ubUrl = typeof url === 'string' ? url : '';
    return origXhrOpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    if (this._ubUrl && this._ubUrl.includes('/api/timedtext')) {
      this.addEventListener('load', () => {
        try {
          if (this.responseText && this.responseText.length > 20) {
            window.postMessage({ type: 'UB_CAPTIONS_FETCHED_LIVE', data: this.responseText, url: this._ubUrl }, '*');
          }
        } catch (e) {}
      });
    }
    return origXhrSend.apply(this, args);
  };

  setInterval(() => {
    const video = document.querySelector('video');
    if (video) {
      if (!audioCtx || boundVideo !== video) {
        setupStudioAudiophileEngine(video);
      }
      disableYouTubeCompression();
    }
  }, 1000);

  // ====================================================
  // PHẦN BẢO VỆ GỐC: XÓA QUẢNG CÁO TỪ RESPONSE
  // ====================================================
  // PHẦN CHẶN QUẢNG CÁO TẬN GỐC (ZERO BLACK SCREEN / ZERO LAG)
  // ====================================================
  function cleanAdData(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      if (obj.adPlacements) delete obj.adPlacements;
      if (obj.playerAds) delete obj.playerAds;
      if (obj.adSlots) delete obj.adSlots;
      if (obj.adBreakHeartbeatParams) delete obj.adBreakHeartbeatParams;
      if (obj.auxiliaryUi && obj.auxiliaryUi.messageRenderers) delete obj.auxiliaryUi;
    } catch (e) {}
    return obj;
  }

  // 1. Chặn ngay từ ytInitialPlayerResponse trước khi player khởi tạo
  if (window.ytInitialPlayerResponse) {
    cleanAdData(window.ytInitialPlayerResponse);
  } else {
    let rawResponse = undefined;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      get() { return rawResponse; },
      set(val) { rawResponse = cleanAdData(val); },
      configurable: true
    });
  }

  // 2. Chặn trong Fetch API khi YouTube tải video metadata
  const origFetch = window.fetch;
  window.fetch = async function (resource, init) {
    const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';

    // Chặn các endpoint tracking quảng cáo gây delay
    if (url.includes('/api/stats/ads') || url.includes('/pagead/') || url.includes('/ptracking')) {
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const response = await origFetch.apply(this, arguments);

    if (url.includes('/youtubei/v1/player')) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data && (data.adPlacements || data.playerAds || data.adSlots)) {
          cleanAdData(data);
          return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }
      } catch (err) {}
    }
    return response;
  };

  // 3. Chặn trong XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._ub_url = typeof url === 'string' ? url : '';
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this._ub_url && (this._ub_url.includes('/api/stats/ads') || this._ub_url.includes('/pagead/'))) {
      try { this.abort(); return; } catch (e) {}
    }
    if (this._ub_url && this._ub_url.includes('/youtubei/v1/player')) {
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4 && this.status === 200) {
          try {
            const data = JSON.parse(this.responseText);
            if (data && (data.adPlacements || data.playerAds || data.adSlots)) {
              cleanAdData(data);
              Object.defineProperty(this, 'responseText', { value: JSON.stringify(data) });
              Object.defineProperty(this, 'response', { value: JSON.stringify(data) });
            }
          } catch (e) {}
        }
      });
    }
    return origSend.apply(this, arguments);
  };

  // 4. Chặn trong JSON.parse
  const originalJSONParse = JSON.parse;
  JSON.parse = function () {
    const data = originalJSONParse.apply(this, arguments);
    if (data && typeof data === 'object') {
      if (data.adPlacements || data.playerAds || data.adSlots) cleanAdData(data);
    }
    return data;
  };

  // 5. Xử lý êm ái nếu quảng cáo lọt lưới (KHÔNG BAO GIỜ BỊ MÀN HÌNH ĐEN)
  let wasAdShowing = false;
  let userMutedState = false;

  function handleVideoAdsGracefully() {
    const moviePlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    const adShowing = moviePlayer && (moviePlayer.classList.contains('ad-showing') || moviePlayer.classList.contains('ad-interrupting'));
    const video = document.querySelector('video');

    if (adShowing && video) {
      if (!wasAdShowing) {
        wasAdShowing = true;
        userMutedState = video.muted;
      }
      // Tắt tiếng quảng cáo
      video.muted = true;

      // Dùng lệnh native skip nếu có
      if (moviePlayer && typeof moviePlayer.skipAd === 'function') {
        try { moviePlayer.skipAd(); } catch (e) {}
      }

      // Bấm nút skip nếu đã hiện
      const skipButtons = document.querySelectorAll(
        '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, [class*="skip-ad"], .ytp-ad-overlay-close-button'
      );
      skipButtons.forEach(btn => {
        try { btn.click(); } catch(e) {}
      });

      // Tăng tốc 16x để quảng cáo trôi qua trong tích tắc mà KHÔNG làm hỏng pipeline
      video.playbackRate = 16;
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else {
      // Khi quảng cáo kết thúc hoặc phát video bình thường
      if (wasAdShowing) {
        wasAdShowing = false;
        if (video) {
          video.muted = userMutedState;
          video.playbackRate = 1.0;
          // Tự động phát tiếp nếu YouTube bị đơ ở khung hình đen!
          if (video.paused && !video.ended) {
            video.play().catch(() => {});
          }
        }
      }
    }
  }

  setInterval(handleVideoAdsGracefully, 100);

})();
