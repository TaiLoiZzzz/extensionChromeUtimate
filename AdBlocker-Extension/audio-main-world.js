// ====================================================
// UltraBlock Pro - Audiophile Studio Sound Engine
// Xử lý âm thanh chuyên nghiệp: Khuếch đại lớn + Giữ trọn độ hay
// ====================================================
(function () {
  'use strict';

  let currentGainValue = 2.2; // Khuếch đại tối ưu chuẩn Studio (220%)
  let audioCtx = null;
  let preGainNode = null;
  let waveShaper = null;
  let bassFilter = null;
  let midFilter = null;
  let airFilter = null;
  let studioLimiter = null;
  let audioSource = null;
  let boundVideo = null;

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

      // NỐI CHUỖI XỬ LÝ ÂM THANH CHUYÊN NGHIỆP:
      // Video Source -> 3-Band Studio EQ -> Pre-Gain -> Tube Saturator -> Studio Limiter -> Loa / Tai nghe
      audioSource.connect(bassFilter);
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

  // Lắng nghe lệnh đổi mức âm lượng từ Popup
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'UB_SET_AUDIO_GAIN') {
      currentGainValue = parseFloat(event.data.gain) || 2.2;
      if (preGainNode && audioCtx) {
        preGainNode.gain.setTargetAtTime(currentGainValue, audioCtx.currentTime, 0.05);
      }
      disableYouTubeCompression();
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
