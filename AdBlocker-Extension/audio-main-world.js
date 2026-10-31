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

      // --- DẢI 0: DUCKING GAIN (HẠ ÂM LƯỢNG GỐC KHI THUYẾT MINH AI NÓI) ---
      duckingGainNode = audioCtx.createGain();
      duckingGainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);

      // NỐI CHUỖI XỬ LÝ ÂM THANH CHUYÊN NGHIỆP:
      // Video Source -> Ducking Node -> 3-Band Studio EQ -> Pre-Gain -> Tube Saturator -> Studio Limiter -> Loa / Tai nghe
      audioSource.connect(duckingGainNode);
      duckingGainNode.connect(bassFilter);
      bassFilter.connect(midFilter);
      midFilter.connect(airFilter);
      airFilter.connect(preGainNode);
      preGainNode.connect(waveShaper);
      waveShaper.connect(studioLimiter);
      studioLimiter.connect(audioCtx.destination);

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
      const v = document.querySelector('video');
      if (v && !document.querySelector('.ad-showing')) {
        v.muted = false;
        v.volume = 1.0;
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
      if (duckingGainNode && audioCtx) {
        const targetGain = event.data.duck ? (parseFloat(event.data.level) || 0.15) : 1.0;
        duckingGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        duckingGainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, event.data.duck ? 0.06 : 0.18);
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
    }
  });

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
  function cleanAdData(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      if (obj.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
        sendCaptionsToIsolatedWorld(obj.captions.playerCaptionsTracklistRenderer.captionTracks);
      }
      if (obj.adPlacements) delete obj.adPlacements;
      if (obj.playerAds) delete obj.playerAds;
      if (obj.adSlots) delete obj.adSlots;
      if (obj.auxiliaryUi && obj.auxiliaryUi.messageRenderers) delete obj.auxiliaryUi;
    } catch (e) {}
    return obj;
  }

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

  const origFetch = window.fetch;
  window.fetch = async function (resource, init) {
    const response = await origFetch.apply(this, arguments);
    const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';

    if (url.includes('/youtubei/v1/player')) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data && data.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          sendCaptionsToIsolatedWorld(data.captions.playerCaptionsTracklistRenderer.captionTracks);
        }
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

  const originalJSONParse = JSON.parse;
  JSON.parse = function () {
    const data = originalJSONParse.apply(this, arguments);
    if (data && typeof data === 'object') {
      if (data.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
        sendCaptionsToIsolatedWorld(data.captions.playerCaptionsTracklistRenderer.captionTracks);
      }
      if (data.adPlacements || data.playerAds || data.adSlots) cleanAdData(data);
    }
    return data;
  };

  function forceSkipAd() {
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    const adElement = document.querySelector('.ad-showing, .ad-interrupting');
    const video = document.querySelector('video');

    if (adElement && video) {
      video.muted = true;
      if (player && typeof player.skipAd === 'function') player.skipAd();
      const skipButtons = document.querySelectorAll(
        '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, [class*="skip-ad"], .ytp-ad-overlay-close-button'
      );
      skipButtons.forEach(btn => btn && btn.click());
      if (isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration;
        video.dispatchEvent(new Event('ended'));
      }
    }
  }
  setInterval(forceSkipAd, 50);

})();
