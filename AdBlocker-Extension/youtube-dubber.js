// ====================================================
// UltraBlock Pro - YouTube AI Dubbing Engine
// Lồng tiếng thời gian thực: Gemini AI / Google Translate + Microsoft Edge-TTS
// Thuật toán đồng bộ thời lượng 4 lớp (4-Layer Duration Matching)
// ====================================================
(function () {
  'use strict';
  if (!location.hostname.includes('youtube.com')) return;

  // ─── TRẠNG THÁI HỆ THỐNG ───
  const D = {
    enabled: false,
    provider: 'google', // Mặc định Google Translate siêu tốc (~30ms) không cần API key
    geminiApiKey: '',
    voice: 'vi-VN-NamMinhNeural', // Mặc định Nam Minh Neural trầm ấm, chuẩn tự nhiên
    duckLevel: 0.15,
    dubVolume: 1.0,
    cues: [],
    captionTracks: [],
    currentVideoId: '',
    activeCueIndex: -1,
    audioCtx: null,
    dubGainNode: null,
    currentSource: null,
    isSpeaking: false
  };

  // ─── ĐIỀU PHỐI ÂM LƯỢNG VIDEO GỐC CHÍNH XÁC (DUCKING & MUTE) ───
  function updateOriginalAudioDucking() {
    if (!D.enabled) {
      window.postMessage({ type: 'UB_AUDIO_DUCK', duck: false, level: 1.0 }, '*');
      return;
    }

    if (D.duckLevel <= 0.005) {
      // Người dùng kéo về 0%: Tắt tiếng gốc hoàn toàn trong suốt quá trình thuyết minh
      window.postMessage({ type: 'UB_AUDIO_DUCK', duck: true, level: 0.0 }, '*');
      return;
    }

    if (D.isSpeaking) {
      // Khi AI đang nói: hạ đúng mức D.duckLevel người dùng chọn
      window.postMessage({ type: 'UB_AUDIO_DUCK', duck: true, level: D.duckLevel }, '*');
    } else {
      // Khi AI tạm nghỉ giữa các câu:
      // Giữ âm lượng nền êm dịu (khoảng 30% - 50%), KHÔNG BAO GIỜ gầm rú quá to
      const pauseLevel = Math.min(0.6, Math.max(D.duckLevel, D.duckLevel * 2.0));
      window.postMessage({ type: 'UB_AUDIO_DUCK', duck: true, level: pauseLevel }, '*');
    }
  }

  // ─── TẢI CÀI ĐẶT TỪ CHROME STORAGE ───
  function syncSettings() {
    chrome.storage.local.get([
      'dubbingEnabled', 'dubbingProvider', 'geminiApiKey',
      'dubbingVoice', 'dubbingDuckLevel', 'dubbingVolume'
    ], data => {
      if (data.dubbingEnabled !== undefined) D.enabled = data.dubbingEnabled;
      if (data.dubbingProvider) D.provider = data.dubbingProvider;
      if (data.geminiApiKey) D.geminiApiKey = data.geminiApiKey;
      if (data.dubbingVoice) D.voice = data.dubbingVoice;
      if (data.dubbingDuckLevel !== undefined) {
        D.duckLevel = Math.max(0, Math.min(1.0, parseFloat(data.dubbingDuckLevel)));
      }
      if (data.dubbingVolume !== undefined) {
        D.dubVolume = Math.max(0, Math.min(2.0, parseFloat(data.dubbingVolume)));
        if (D.dubGainNode && D.audioCtx) {
          D.dubGainNode.gain.cancelScheduledValues(D.audioCtx.currentTime);
          D.dubGainNode.gain.setTargetAtTime(D.dubVolume, D.audioCtx.currentTime, 0.03);
        }
      }
      updateOriginalAudioDucking();
      updateDubButtonUI();
      if (D.enabled) {
        ensureDubbingRunning();
      } else {
        stopAllDubbing();
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') syncSettings();
  });

  // ─── KHỞI TẠO WEB AUDIO CONTEXT CHO LỒNG TIẾNG ───
  function initAudioCtx() {
    if (!D.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        D.audioCtx = new AudioCtx();
        D.dubGainNode = D.audioCtx.createGain();
        D.dubGainNode.gain.setValueAtTime(D.dubVolume, D.audioCtx.currentTime);
        D.dubGainNode.connect(D.audioCtx.destination);
      }
    }
    if (D.audioCtx && D.audioCtx.state === 'suspended') {
      D.audioCtx.resume().catch(() => {});
    }
  }

  // ─── LẮNG NGHE DỮ LIỆU PHỤ ĐỀ TỪ MAIN WORLD (AUDIO-MAIN-WORLD.JS) ───
  window.addEventListener('message', event => {
    if (!event.data) return;
    if (event.data.type === 'UB_CAPTIONS_DATA' && Array.isArray(event.data.tracks)) {
      D.captionTracks = event.data.tracks;
      if (D.enabled && (!D.cues || D.cues.length === 0)) {
        loadSubtitlesForCurrentVideo();
      }
    } else if (event.data.type === 'UB_CAPTIONS_FETCHED_LIVE' && event.data.data) {
      const liveCues = parseAnySubtitles(event.data.data);
      if (liveCues && liveCues.length > 0 && (!D.cues || D.cues.length === 0)) {
        applyTimingToCues(liveCues);
        D.cues = liveCues;
        const v = document.querySelector('video');
        preloadInitialBuffer(v);
      }
    }
  });

  function applyTimingToCues(cues) {
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const nextStart = cues[i + 1] ? cues[i + 1].start : (cue.end + 2.0);
      cue.gap = Math.max(0, nextStart - cue.end);
      cue.effectiveTarget = cue.duration + Math.min(0.6 * cue.gap, 0.8);
      cue.maxSyllables = Math.max(4, Math.round(cue.effectiveTarget * 3.8));
    }
  }

  // ─── LẤY VIDEO ID HIỆN TẠI ───
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v') || '';
  }

  // ─── GỌI MAIN WORLD FETCH TIMEDTEXT (CÙNG ORIGIN YOUTUBE.COM + COOKIES) ───
  function fetchSubtitlesFromMainWorld(url) {
    return new Promise((resolve) => {
      const requestId = 'sub_' + Math.random().toString(36).substring(2);
      let resolved = false;

      const handler = (event) => {
        if (event.data?.type === 'UB_SUBTITLES_FETCHED' && event.data.requestId === requestId) {
          window.removeEventListener('message', handler);
          clearTimeout(timer);
          resolved = true;
          if (event.data.success && event.data.data && event.data.data.length > 10) {
            resolve(event.data.data);
          } else {
            resolve(null);
          }
        }
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: 'UB_FETCH_SUBTITLES_DIRECT', url, requestId }, '*');

      const timer = setTimeout(() => {
        if (!resolved) {
          window.removeEventListener('message', handler);
          resolve(null);
        }
      }, 3500);
    });
  }

  // ─── GỌI BACKGROUND SERVICE WORKER FETCH (DỰ PHÒNG 2) ───
  function fetchSubtitlesFromBackground(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'DUB_GET_SUBTITLES', url }, (res) => {
        if (res && res.ok && res.data) {
          const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
          if (raw && raw.length > 10) {
            resolve(raw);
            return;
          }
        }
        resolve(null);
      });
    });
  }

  // ─── THUẬT TOÁN TÁI CẤU TRÚC VÀ GHÉP MẢNH THÀNH CÂU HOÀN CHỈNH (SENTENCE RECONSTRUCTION) ───
  function mergeFragmentsIntoSentences(fragments) {
    if (!fragments || fragments.length === 0) return [];
    
    const sentences = [];
    let batchStart = 0;
    let batchEnd = 0;
    let batchText = '';
    let count = 0;

    for (let i = 0; i < fragments.length; i++) {
      const frag = fragments[i];
      const clean = (frag.text || '').replace(/\s+/g, ' ').trim();
      if (!clean) continue;

      if (count === 0) {
        batchStart = frag.start;
        batchEnd = frag.end;
        batchText = clean;
        count = 1;
      } else {
        const gap = frag.start - batchEnd;
        const currentDur = frag.end - batchStart;

        // Tiêu chí nhận diện kết thúc 1 câu / vế hoàn chỉnh:
        // 1. Dấu câu kết thúc rõ ràng (chấm, hỏi, than, ba chấm)
        const endsWithPunct = /[.?!…]$/.test(batchText);
        // 2. Người nói dừng lại lấy hơi (khoảng lặng gap >= 0.45s)
        const hasNaturalPause = gap >= 0.45;
        // 3. Đã nói đủ dài (>= 3.2s) và gặp dấu phẩy, chấm phẩy, gạch ngang
        const hasClauseBreak = currentDur >= 3.2 && /[,;—–-]$/.test(batchText);
        // 4. Độ dài tối ưu của 1 câu lồng tiếng đạt ngưỡng (currentDur >= 5.5s)
        const isIdealMax = currentDur >= 5.5;

        if (endsWithPunct || hasNaturalPause || hasClauseBreak || isIdealMax) {
          const finalDuration = Math.max(1.0, batchEnd - batchStart);
          sentences.push({
            id: sentences.length,
            start: batchStart,
            end: batchEnd,
            duration: finalDuration,
            text: batchText,
            viText: '',
            audioBuffer: null,
            translating: false,
            synthesizing: false
          });

          // Bắt đầu câu kế tiếp
          batchStart = frag.start;
          batchEnd = frag.end;
          batchText = clean;
          count = 1;
        } else {
          // Nối tiếp vào câu hiện tại
          batchEnd = frag.end;
          batchText = batchText + ' ' + clean;
          count++;
        }
      }
    }

    if (count > 0 && batchText) {
      const finalDuration = Math.max(1.0, batchEnd - batchStart);
      sentences.push({
        id: sentences.length,
        start: batchStart,
        end: batchEnd,
        duration: finalDuration,
        text: batchText,
        viText: '',
        audioBuffer: null,
        translating: false,
        synthesizing: false
      });
    }

    return sentences;
  }

  // ─── BỘ PHÂN TÍCH PHỤ ĐỀ ĐA ĐỊNH DẠNG (JSON3 & XML TIMEDTEXT) ───
  function parseAnySubtitles(raw) {
    if (!raw) return [];

    const rawFragments = [];

    // 1. Thử phân tích JSON3
    try {
      const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (json && Array.isArray(json.events) && json.events.length > 0) {
        json.events.forEach((ev) => {
          if (!ev.segs || !ev.segs.length) return;
          const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
          if (!text || text === '\n') return;
          const start = (ev.tStartMs || 0) / 1000;
          const duration = (ev.dDurationMs || 1500) / 1000;
          rawFragments.push({
            start: start,
            duration: duration,
            end: start + duration,
            text: text
          });
        });
      }
    } catch (e) {}

    // 2. Thử phân tích XML TimedText (<p t="..." d="..."> hoặc <text start="..." dur="...">)
    if (rawFragments.length === 0) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(raw, 'text/xml');

        const pTags = doc.querySelectorAll('p');
        if (pTags && pTags.length > 0) {
          pTags.forEach((p) => {
            const text = (p.textContent || '').replace(/\n/g, ' ').trim();
            if (!text) return;
            const start = (parseFloat(p.getAttribute('t')) || 0) / 1000;
            const duration = (parseFloat(p.getAttribute('d')) || 1500) / 1000;
            rawFragments.push({
              start: start,
              duration: duration,
              end: start + duration,
              text: text
            });
          });
        }

        if (rawFragments.length === 0) {
          const textTags = doc.querySelectorAll('text');
          if (textTags && textTags.length > 0) {
            textTags.forEach((t) => {
              const text = (t.textContent || '').replace(/\n/g, ' ').trim();
              if (!text) return;
              const start = parseFloat(t.getAttribute('start')) || 0;
              const duration = parseFloat(t.getAttribute('dur')) || 1.5;
              rawFragments.push({
                start: start,
                duration: duration,
                end: start + duration,
                text: text
              });
            });
          }
        }
      } catch (e) {}
    }

    if (rawFragments.length === 0) return [];

    // Tự động sắp xếp theo thứ tự thời gian tăng dần
    rawFragments.sort((a, b) => a.start - b.start);

    // Tái cấu trúc các mẩu vụn thành các câu hoàn chỉnh liền mạch
    return mergeFragmentsIntoSentences(rawFragments);
  }

  // ─── TẢI PHỤ ĐỀ YOUTUBE TIMEDTEXT API (ĐA TẦNG DÒ TÌM SIÊU CẤP) ───
  async function loadSubtitlesForCurrentVideo() {
    const videoId = getVideoId();
    if (!videoId) return;
    D.currentVideoId = videoId;
    D.cues = [];
    showToast('Đang kết nối phụ đề AI...', 'loading');

    // TẦNG 1: TRUY VẤN QUA INNERTUBE API (SIÊU TỐC ~0.5s, 100% CHÍNH XÁC)
    const innerTubeSuccess = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'DUB_FETCH_INNERTUBE_SUBTITLES', videoId }, resp => {
        if (resp && resp.ok && resp.xml) {
          const parsedCues = parseAnySubtitles(resp.xml);
          if (parsedCues && parsedCues.length > 0) {
            applyTimingToCues(parsedCues);
            if (resp.track?.languageCode === 'vi') {
              parsedCues.forEach(c => { c.viText = c.text; });
            }
            D.cues = parsedCues;
            const v = document.querySelector('video');
            preloadInitialBuffer(v);
            resolve(true);
            return;
          }
        }
        resolve(false);
      });
    });

    if (innerTubeSuccess) return;

    // TẦNG 2: NẾU TẦNG 1 CHƯA CÓ, DÒ TRACKS TRỰC TIẾP TỪ PLAYER RESPONSE
    window.postMessage({ type: 'UB_FORCE_LOAD_CAPTIONS' }, '*');
    observeLiveDomCaptions();

    let tracks = D.captionTracks || [];
    for (let attempt = 1; attempt <= 6; attempt++) {
      if (tracks && tracks.length > 0) break;
      window.postMessage({ type: 'UB_GET_CAPTIONS' }, '*');
      await new Promise(r => setTimeout(r, 300));
      tracks = D.captionTracks || [];
    }

    if (tracks && tracks.length > 0) {
      const viTrack = tracks.find(t => t.languageCode === 'vi' || (t.vssId && t.vssId.includes('.vi')));
      const enManual = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
      const enAsr = tracks.find(t => t.languageCode === 'en' || (t.vssId && t.vssId.includes('en')));
      const chosenTrack = viTrack || enManual || enAsr || tracks[0];
      const isAlreadyVietnamese = Boolean(viTrack && chosenTrack === viTrack);

      const base = chosenTrack.baseUrl;
      const urlsToTry = [
        base.includes('fmt=json3') ? base : (base + '&fmt=json3'),
        base.replace(/&fmt=[^&]+/, '')
      ];

      let parsedCues = [];
      for (const url of urlsToTry) {
        let raw = await fetchSubtitlesFromMainWorld(url);
        if (!raw) raw = await fetchSubtitlesFromBackground(url);
        if (raw) {
          parsedCues = parseAnySubtitles(raw);
          if (parsedCues.length > 0) {
            if (isAlreadyVietnamese) {
              parsedCues.forEach(c => { c.viText = c.text; });
            }
            break;
          }
        }
      }

      if (parsedCues && parsedCues.length > 0) {
        applyTimingToCues(parsedCues);
        D.cues = parsedCues;
        const v = document.querySelector('video');
        preloadInitialBuffer(v);
        return;
      }
    }

    // TẦNG 3: BẮT TRỰC TIẾP TỪ PHỤ ĐỀ ĐANG CHẠY TRÊN MÀN HÌNH (DOM OBSERVER)
    observeLiveDomCaptions();
    showToast('Đang đọc trực tiếp phụ đề trên màn hình', 'loading');
  }

  // ─── THUẬT TOÁN RÚT GỌN TỪ ĐỆM TIẾNG VIỆT (TEXT CONDENSATION) ───
  function condenseVietnameseText(text, maxSyllables) {
    if (!text) return '';
    const words = text.trim().split(/\s+/);
    if (words.length <= maxSyllables) return text;

    // Loại bỏ các từ đệm, từ dư thừa
    const fillers = [
      /^(chúng ta hãy|hãy cùng|hãy|bạn hãy)\s+/i,
      /\b(thì|là|rằng|mà|thực sự|hoàn toàn|ngay bây giờ)\b/gi,
      /\s{2,}/g
    ];

    let condensed = text;
    for (const pattern of fillers) {
      condensed = condensed.replace(pattern, ' ').trim();
      const currentWords = condensed.split(/\s+/);
      if (currentWords.length <= maxSyllables) break;
    }

    return condensed;
  }

  // ─── HÀM CHUYỂN ĐỔI BASE64 SANG ARRAYBUFFER ───
  function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // ─── TỔNG HỢP GIỌNG ĐỌC MICROSOFT EDGE-TTS QUA BACKGROUND SERVICE WORKER (DRM V2) ───
  async function fetchEdgeTTSAudio(text, voice) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'DUB_SYNTHESIZE_TTS',
        text: text,
        voice: voice || D.voice
      }, resp => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (resp && resp.ok && resp.audioBase64) {
          try {
            const buffer = base64ToArrayBuffer(resp.audioBase64);
            resolve(buffer);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(resp?.error || 'Edge-TTS synthesis failed'));
        }
      });
    });
  }

  // ─── TỰ ĐỘNG PHÁT HIỆN VÀ CẮT KHOẢNG LẶNG ĐẦU FILE MP3 (KHỬ TRIỆT ĐỂ TRỄ ÂM) ───
  function detectLeadingSilence(audioBuffer) {
    if (!audioBuffer) return 0;
    try {
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const threshold = 0.005; // Ngưỡng phát hiện bắt đầu có âm thanh
      const maxScanSamples = Math.min(channelData.length, Math.floor(sampleRate * 0.45)); // Quét tối đa 0.45s đầu
      let firstSoundSample = 0;
      for (let i = 0; i < maxScanSamples; i++) {
        if (Math.abs(channelData[i]) > threshold) {
          firstSoundSample = i;
          break;
        }
      }
      // Giữ lại 0.02s đệm nhẹ để phụ âm đầu phát tự nhiên không bị giật
      return Math.max(0, (firstSoundSample / sampleRate) - 0.02);
    } catch (e) {
      return 0;
    }
  }

  // ─── GIẢI MÃ AUDIO THÀNH AUDIOBUFFER DÙNG WEB AUDIO API ───
  async function decodeAudioData(arrayBuffer) {
    initAudioCtx();
    if (!D.audioCtx) return null;
    return new Promise((resolve) => {
      D.audioCtx.decodeAudioData(arrayBuffer.slice(0), buffer => {
        resolve(buffer);
      }, () => {
        resolve(null);
      });
    });
  }


  // ─── ĐẢM BẢO CÂU ĐƯỢC DỊCH VÀ TẠO GIỌNG ĐỌC HOÀN CHỈNH TRƯỚC KHI PHÁT ───
  function ensureCueReady(cue) {
    if (!cue) return Promise.resolve(null);
    if (cue.audioBuffer) return Promise.resolve(cue.audioBuffer);

    return new Promise((resolve) => {
      // 1. Dịch văn bản nếu chưa có viText
      const getViText = () => {
        if (cue.viText) return Promise.resolve(cue.viText);
        if (cue.translating) {
          return new Promise(r => {
            const check = setInterval(() => {
              if (!cue.translating) {
                clearInterval(check);
                r(cue.viText || '');
              }
            }, 50);
            setTimeout(() => { clearInterval(check); r(cue.viText || ''); }, 3500);
          });
        }

        cue.translating = true;
        return new Promise(r => {
          chrome.runtime.sendMessage({
            type: 'DUB_TRANSLATE',
            text: cue.text,
            targetDuration: cue.effectiveTarget,
            provider: D.provider,
            apiKey: D.geminiApiKey
          }, resp => {
            cue.translating = false;
            if (resp && resp.ok && resp.result) {
              cue.viText = condenseVietnameseText(resp.result, cue.maxSyllables);
            }
            r(cue.viText || '');
          });
        });
      };

      // 2. Tạo giọng đọc Edge-TTS sau khi đã có bản dịch
      getViText().then(viText => {
        if (!viText) {
          resolve(null);
          return;
        }
        if (cue.audioBuffer) {
          resolve(cue.audioBuffer);
          return;
        }
        if (cue.synthesizing) {
          const check = setInterval(() => {
            if (!cue.synthesizing) {
              clearInterval(check);
              resolve(cue.audioBuffer || null);
            }
          }, 50);
          setTimeout(() => { clearInterval(check); resolve(cue.audioBuffer || null); }, 3500);
          return;
        }

        cue.synthesizing = true;
        fetchEdgeTTSAudio(viText, D.voice)
          .then(decodeAudioData)
          .then(buffer => {
            cue.synthesizing = false;
            cue.audioBuffer = buffer;
            cue.silenceOffset = detectLeadingSilence(buffer);
            resolve(buffer);
          })
          .catch(err => {
            console.warn('[Dubber] Edge-TTS lần 1 thất bại, thử lại lần 2...', err);
            // Thử lại lần 2 với Edge-TTS
            fetchEdgeTTSAudio(viText, D.voice)
              .then(decodeAudioData)
              .then(buffer => {
                cue.synthesizing = false;
                cue.audioBuffer = buffer;
                cue.silenceOffset = detectLeadingSilence(buffer);
                resolve(buffer);
              })
              .catch(err2 => {
                console.warn('[Dubber] Edge-TTS thất bại 2 lần, chuyển dự phòng:', err2);
                const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(viText)}`;
                fetch(gUrl)
                  .then(r => r.arrayBuffer())
                  .then(decodeAudioData)
                  .then(gBuf => {
                    cue.synthesizing = false;
                    cue.audioBuffer = gBuf;
                    cue.silenceOffset = 0;
                    resolve(gBuf);
                  })
                  .catch(() => {
                    cue.synthesizing = false;
                    resolve(null);
                  });
              });
          });
      });
    });
  }

  // ─── NẠP TRƯỚC BẢN DỊCH VÀ GIỌNG ĐỌC KHI MỚI VÀO (TRÁNH BỊ HỤT CÂU & NGẮT QUÃNG) ───
  let isBufferingInitial = false;

  async function preloadInitialBuffer(video) {
    if (!D.cues || D.cues.length === 0 || isBufferingInitial) return;
    isBufferingInitial = true;

    const curTime = video ? video.currentTime : 0;
    // Lấy 4 câu đầu tiên sắp nói tính từ thời điểm hiện tại
    const initialBatch = D.cues.filter(c => c.end >= curTime && c.start <= curTime + 22).slice(0, 4);

    if (initialBatch.length > 0) {
      showToast(`Đang sẵn sàng thuyết minh (${initialBatch.length} câu)...`, 'loading');
      // Nạp song song trong nền, TUYỆT ĐỐI không làm dừng video của người dùng
      initialBatch.forEach(c => ensureCueReady(c));
      setTimeout(() => {
        hideToast();
      }, 1500);
    }

    isBufferingInitial = false;

    // Tiếp tục kích hoạt nạp trước nền cho 28 giây tiếp theo
    if (video) processQueue(video.currentTime);
  }

  // ─── QUẢN LÝ HÀNG ĐỢI NẠP TRƯỚC LIÊN TỤC 28 GIÂY ───
  function processQueue(currentTime) {
    if (!D.enabled || !D.cues || D.cues.length === 0) return;

    // Lọc các câu sắp nói trong khoảng từ currentTime đến currentTime + 28s
    const upcomingCues = D.cues.filter(c => c.start >= currentTime - 1 && c.start <= currentTime + 28);

    for (const cue of upcomingCues) {
      if (!cue.audioBuffer && !cue.synthesizing && !cue.translating) {
        ensureCueReady(cue);
      }
    }
  }

  // ─── LỚP 3 & 4: PHÁT ÂM THANH ĐỒNG BỘ THỜI GIAN THỰC + DUCKING NHẠC NỀN ───
  function playCueAudio(cue) {
    if (!cue || !cue.audioBuffer) {
      D.isSpeaking = false;
      return;
    }

    initAudioCtx();
    stopCurrentAudio();

    D.isSpeaking = true;
    updateOriginalAudioDucking();
    showToast(cue.viText || cue.text, 'speaking');

    if (D.audioCtx && D.dubGainNode) {
      try {
        const source = D.audioCtx.createBufferSource();
        source.buffer = cue.audioBuffer;
        // Giữ nguyên tốc độ chuẩn 1.0x (Tránh biến âm làm méo cao độ giọng Neural tự nhiên)
        source.playbackRate.setValueAtTime(1.0, D.audioCtx.currentTime);
        source.connect(D.dubGainNode);

        source.onended = () => {
          D.isSpeaking = false;
          D.currentSource = null;
          updateOriginalAudioDucking();
        };

        D.currentSource = source;
        const dur = cue.audioBuffer.duration || 1.0;
        const startOffset = Math.max(0, Math.min(cue.silenceOffset || 0, Math.max(0, dur - 0.1)));
        source.start(0, startOffset);
      } catch (err) {
        console.warn('[Dubber] Lỗi khởi tạo source audio:', err);
        try {
          const fallbackSource = D.audioCtx.createBufferSource();
          fallbackSource.buffer = cue.audioBuffer;
          fallbackSource.connect(D.dubGainNode);
          fallbackSource.onended = () => {
            D.isSpeaking = false;
            D.currentSource = null;
            updateOriginalAudioDucking();
          };
          D.currentSource = fallbackSource;
          fallbackSource.start(0);
        } catch (e2) {
          D.isSpeaking = false;
        }
      }
    }
  }

  function stopCurrentAudio() {
    if (D.currentSource) {
      try { D.currentSource.stop(); } catch (e) {}
      D.currentSource = null;
    }
    D.isSpeaking = false;
    updateOriginalAudioDucking();
  }

  function stopAllDubbing() {
    stopCurrentAudio();
    stopClockLoop();
    hideToast();
    updateDubButtonUI();
    updateOriginalAudioDucking();
  }

  // ─── VÒNG LẶP ĐỒNG BỘ THEO PLAYER CLOCK (RAF + TIMEUPDATE SIÊU CHÍNH XÁC) ───
  let boundVideoElement = null;
  let syncRafId = null;

  function checkAndPlayCurrentCue(video) {
    if (!D.enabled || !D.cues || D.cues.length === 0 || !video) return;
    const t = video.currentTime;

    // Nạp trước dữ liệu 28 giây tiếp theo
    processQueue(t);

    // Nếu đang nói câu hiện tại, KHÔNG ĐƯỢC ngắt giữa chừng!
    if (D.isSpeaking) return;

    // Bù trừ độ trễ: Kích hoạt trước 0.15s để khớp 100% khẩu hình người nói gốc
    const syncLeadTime = 0.15;
    const syncT = t + syncLeadTime;

    // Tìm câu tương ứng với thời điểm hiện tại
    const cueIndex = D.cues.findIndex(c => syncT >= c.start && t < (c.end + (c.gap || 0.4)));

    if (cueIndex !== -1 && cueIndex !== D.activeCueIndex) {
      D.activeCueIndex = cueIndex; // ĐÁNH DẤU NGAY LẬP TỨC để tránh gọi lặp lại trong vòng lặp RAF
      const cue = D.cues[cueIndex];
      
      if (cue.audioBuffer) {
        playCueAudio(cue);
      } else {
        // Nếu câu này chưa nạp xong: ưu tiên nạp và chỉ phát khi có audioBuffer chuẩn Microsoft Neural
        ensureCueReady(cue).then((buf) => {
          if (buf && D.enabled && !D.isSpeaking && Math.abs(video.currentTime - cue.start) < (cue.duration + 2.5)) {
            playCueAudio(cue);
          }
        });
      }
    }
  }

  function startClockLoop(video) {
    if (syncRafId) cancelAnimationFrame(syncRafId);
    function tick() {
      if (video && !video.paused && !video.ended) {
        checkAndPlayCurrentCue(video);
        syncRafId = requestAnimationFrame(tick);
      } else {
        syncRafId = null;
      }
    }
    syncRafId = requestAnimationFrame(tick);
  }

  function stopClockLoop() {
    if (syncRafId) {
      cancelAnimationFrame(syncRafId);
      syncRafId = null;
    }
  }

  function bindVideoEvents() {
    const video = document.querySelector('video');
    if (!video || boundVideoElement === video) return;
    boundVideoElement = video;

    video.addEventListener('timeupdate', () => {
      checkAndPlayCurrentCue(video);
    });

    video.addEventListener('seeking', () => {
      stopCurrentAudio();
      D.activeCueIndex = -1;
      if (D.enabled) {
        preloadInitialBuffer(video);
      }
    });

    video.addEventListener('pause', () => {
      stopClockLoop();
      if (D.audioCtx && D.audioCtx.state === 'running') {
        D.audioCtx.suspend().catch(() => {});
      }
    });

    video.addEventListener('play', () => {
      initAudioCtx();
      startClockLoop(video);
    });

    if (!video.paused) {
      startClockLoop(video);
    }
  }

  // ─── THEO DÕI ĐỔI VIDEO TRÊN YOUTUBE (SPA NAVIGATION) ───
  function observeVideoChanges() {
    const checkChange = () => {
      const vId = getVideoId();
      if (vId && vId !== D.currentVideoId) {
        D.currentVideoId = vId;
        D.cues = [];
        D.activeCueIndex = -1;
        stopCurrentAudio();
        if (D.enabled) {
          loadSubtitlesForCurrentVideo();
        }
      }
    };

    window.addEventListener('yt-navigate-finish', checkChange);
    window.addEventListener('spfdone', checkChange);
    window.addEventListener('popstate', checkChange);
    setInterval(checkChange, 1500);
  }

  // ─── THEO DÕI PHỤ ĐỀ TRỰC TIẾP TRÊN MÀN HÌNH (DOM FALLBACK) ───
  let lastLiveCaptionText = '';
  function observeLiveDomCaptions() {
    const container = document.querySelector('.ytp-caption-window-container') || document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (!container || window.__ub_dom_obs) return;

    window.__ub_dom_obs = new MutationObserver(() => {
      if (!D.enabled) return;
      // Chỉ can thiệp nếu chưa có cues tải qua timedtext
      if (D.cues && D.cues.length > 5) return;

      const segs = document.querySelectorAll('.ytp-caption-segment');
      if (segs.length > 0) {
        const text = Array.from(segs).map(s => s.textContent || '').join(' ').trim();
        if (text && text.length > 1 && text !== lastLiveCaptionText) {
          lastLiveCaptionText = text;
          handleLiveDomCaption(text);
        }
      }
    });

    window.__ub_dom_obs.observe(container, { childList: true, subtree: true, characterData: true });
  }

  function handleLiveDomCaption(text) {
    if (!D.enabled || !text) return;
    const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);

    if (isVietnamese) {
      const cue = {
        id: Date.now(),
        start: 0,
        duration: 3.0,
        effectiveTarget: 3.0,
        maxSyllables: 15,
        text: text,
        viText: text,
        audioBuffer: null
      };
      playCueAudio(cue);
    } else {
      // Dịch sang tiếng Việt rồi đọc
      chrome.runtime.sendMessage({
        type: 'DUB_TRANSLATE',
        text: text,
        targetDuration: 3.0,
        provider: D.provider,
        apiKey: D.geminiApiKey
      }, resp => {
        const viText = resp && resp.ok && resp.result ? resp.result : text;
        const cue = {
          id: Date.now(),
          start: 0,
          duration: 3.0,
          effectiveTarget: 3.0,
          maxSyllables: 15,
          text: text,
          viText: viText,
          audioBuffer: null
        };
        playCueAudio(cue);
      });
    }
  }

  // ─── NÚT NỔI VÀ BẢNG TRỘN ÂM THANH TRỰC TIẾP TRÊN VIDEO ───
  function injectFloatingDubPill() {
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (!player) return;

    let pill = document.getElementById('ub-floating-dub-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'ub-floating-dub-pill';
      pill.style.cssText = `
        position: absolute !important;
        top: 14px !important;
        right: 16px !important;
        z-index: 60 !important;
        cursor: pointer !important;
        user-select: none !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 6px 12px !important;
        border-radius: 20px !important;
        backdrop-filter: blur(8px) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        transition: all 0.25s ease !important;
      `;
      player.appendChild(pill);
    }

    // Bảng mixer trực tiếp trên video
    let mixer = document.getElementById('ub-video-mixer-box');
    if (!mixer) {
      mixer = document.createElement('div');
      mixer.id = 'ub-video-mixer-box';
      mixer.style.cssText = `
        display: none;
        position: absolute !important;
        top: 50px !important;
        right: 16px !important;
        z-index: 60 !important;
        background: rgba(18, 18, 24, 0.95) !important;
        backdrop-filter: blur(12px) !important;
        border: 1.5px solid #00e676 !important;
        border-radius: 10px !important;
        padding: 10px 14px !important;
        width: 210px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        box-shadow: 0 10px 30px rgba(0,0,0,0.85) !important;
        user-select: none !important;
      `;
      mixer.innerHTML = `
        <div style="font-size:11px;font-weight:800;color:#00e676;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">🎚️ Chỉnh Âm Lượng Trực Tiếp</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#ddd;margin-bottom:2px;">
          <span>🎙️ Giọng dịch:</span>
          <span id="ub-mix-dub-lbl" style="color:#00e676;font-weight:700;">${Math.round(D.dubVolume * 100)}%</span>
        </div>
        <input type="range" id="ub-mix-dub-input" min="0" max="2.0" step="0.1" value="${D.dubVolume}" style="width:100%;height:4px;cursor:pointer;accent-color:#00e676;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#ddd;margin-bottom:2px;">
          <span>🎬 Tiếng video gốc:</span>
          <span id="ub-mix-orig-lbl" style="color:#00e676;font-weight:700;">${Math.round(D.duckLevel * 100)}%</span>
        </div>
        <input type="range" id="ub-mix-orig-input" min="0" max="1.0" step="0.05" value="${D.duckLevel}" style="width:100%;height:4px;cursor:pointer;accent-color:#00e676;">
      `;

      mixer.onclick = (e) => e.stopPropagation();

      const dubSlider = mixer.querySelector('#ub-mix-dub-input');
      const dubLbl = mixer.querySelector('#ub-mix-dub-lbl');
      dubSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        dubLbl.textContent = Math.round(val * 100) + '%';
        D.dubVolume = val;
        if (D.dubGainNode && D.audioCtx) {
          D.dubGainNode.gain.cancelScheduledValues(D.audioCtx.currentTime);
          D.dubGainNode.gain.setTargetAtTime(val, D.audioCtx.currentTime, 0.03);
        }
        chrome.storage.local.set({ dubbingVolume: val });
      };

      const origSlider = mixer.querySelector('#ub-mix-orig-input');
      const origLbl = mixer.querySelector('#ub-mix-orig-lbl');
      origSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        origLbl.textContent = Math.round(val * 100) + '%';
        D.duckLevel = val;
        updateOriginalAudioDucking();
        chrome.storage.local.set({ dubbingDuckLevel: val });
      };

      player.appendChild(mixer);
    }

    if (D.enabled) {
      pill.style.background = 'rgba(0, 200, 83, 0.88)';
      pill.style.color = '#ffffff';
      pill.style.border = '1.5px solid #00e676';
      pill.style.boxShadow = '0 0 15px rgba(0, 230, 118, 0.6)';
      pill.innerHTML = `
        <span style="font-size:14px;">🎙️</span>
        <span id="ub-pill-main-toggle">Thuyết minh AI: BẬT</span>
        <span id="ub-pill-mixer-btn" style="margin-left:4px;padding:2px 6px;background:rgba(0,0,0,0.3);border-radius:10px;font-size:11px;" title="Chỉnh lớn nhỏ âm thanh">🎚️</span>
      `;

      pill.querySelector('#ub-pill-main-toggle').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        initAudioCtx();
        chrome.storage.local.set({ dubbingEnabled: false });
      };

      pill.querySelector('#ub-pill-mixer-btn').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const m = document.getElementById('ub-video-mixer-box');
        if (m) m.style.display = (m.style.display === 'none' || !m.style.display) ? 'block' : 'none';
      };

    } else {
      pill.style.background = 'rgba(20, 20, 26, 0.8)';
      pill.style.color = '#eeeeee';
      pill.style.border = '1px solid rgba(255, 255, 255, 0.25)';
      pill.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      pill.innerHTML = `<span style="font-size:14px;opacity:0.8;">🎙️</span><span>Lồng tiếng AI: TẮT</span>`;
      pill.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        initAudioCtx();
        chrome.storage.local.set({ dubbingEnabled: true });
      };
      if (mixer) mixer.style.display = 'none';
    }
  }

  // ─── GIAO DIỆN NÚT BẤM TRÊN THANH ĐIỀU KHIỂN YOUTUBE ───
  function injectDubButton() {
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (!player) return;

    const rightControls = player.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    let btn = rightControls.querySelector('#ub-ytp-dub-btn');
    if (!btn) {
      // Xóa các nút mồ côi ngoài rightControls
      const orphans = document.querySelectorAll('#ub-ytp-dub-btn');
      orphans.forEach(o => o.remove());

      btn = document.createElement('button');
      btn.id = 'ub-ytp-dub-btn';
      btn.className = 'ytp-button ub-dub-button';
      btn.setAttribute('title', 'Lồng tiếng Tiếng Việt AI (Bật/Tắt)');
      btn.setAttribute('aria-label', 'Lồng tiếng Tiếng Việt AI');
      btn.style.cssText = `
        position: relative !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 48px !important;
        height: 100% !important;
        vertical-align: top !important;
        cursor: pointer !important;
        user-select: none !important;
        padding: 0 !important;
        border: none !important;
        background: transparent !important;
        opacity: 1 !important;
        visibility: visible !important;
        z-index: 50 !important;
      `;

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        initAudioCtx();
        const newEnabled = !D.enabled;
        chrome.storage.local.set({ dubbingEnabled: newEnabled });
      };

      const settingsBtn = rightControls.querySelector('.ytp-settings-button') ||
                          rightControls.querySelector('.ytp-subtitles-button') ||
                          rightControls.querySelector('.ytp-size-button');
      if (settingsBtn) {
        rightControls.insertBefore(btn, settingsBtn);
      } else {
        rightControls.prepend(btn);
      }
    }

    updateDubButtonUI();
  }

  function updateDubButtonUI() {
    injectFloatingDubPill();

    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player') || document;
    const btn = player.querySelector('#ub-ytp-dub-btn');
    if (btn) {
      btn.innerHTML = `
        <div id="ub-dub-icon-box" style="
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 2px 6px;
          border-radius: 6px;
          background: ${D.enabled ? 'rgba(0, 200, 83, 0.4)' : 'rgba(255,255,255,0.18)'};
          border: 1px solid ${D.enabled ? '#00e676' : 'rgba(255,255,255,0.3)'};
          box-shadow: ${D.enabled ? '0 0 10px rgba(0,230,118,0.6)' : 'none'};
          transition: all 0.2s ease;
        ">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="${D.enabled ? '#00e676' : '#ffffff'}">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
          <span style="
            font-size: 11px;
            font-weight: 800;
            color: ${D.enabled ? '#00e676' : '#ffffff'};
            letter-spacing: 0.5px;
          ">VI</span>
        </div>
      `;
    }

    // Đồng bộ slider trong mixer box
    const dubSlider = document.getElementById('ub-mix-dub-input');
    const dubLbl = document.getElementById('ub-mix-dub-lbl');
    if (dubSlider && dubLbl) {
      dubSlider.value = D.dubVolume;
      dubLbl.textContent = Math.round(D.dubVolume * 100) + '%';
    }
    const origSlider = document.getElementById('ub-mix-orig-input');
    const origLbl = document.getElementById('ub-mix-orig-lbl');
    if (origSlider && origLbl) {
      origSlider.value = D.duckLevel;
      origLbl.textContent = Math.round(D.duckLevel * 100) + '%';
    }
  }

  // ─── TOAST THÔNG BÁO VÀ PHỤ ĐỀ TIẾNG VIỆT NỔI TRÊN VIDEO ───
  function showToast(text, type = 'normal') {
    let toast = document.getElementById('ub-dub-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ub-dub-toast';
      toast.style.cssText = `
        position: absolute;
        bottom: 65px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 60;
        background: rgba(14, 14, 18, 0.92);
        color: #ffffff;
        backdrop-filter: blur(10px);
        border: 1.5px solid #00c853;
        border-radius: 10px;
        padding: 8px 18px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        font-weight: 600;
        text-align: center;
        max-width: 80%;
        box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 15px rgba(0, 200, 83, 0.3);
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (player) player.appendChild(toast);
    }

    const providerBadge = D.provider === 'gemini' ? 'Gemini AI' : 'Google';
    let icon = '🎙️';
    if (type === 'loading') icon = '⏳';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `
      <span style="font-size:16px;">${icon}</span>
      <span style="color:#00c853;font-size:11px;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;">[${providerBadge}]</span>
      <span style="line-height:1.4;">${text}</span>
    `;

    toast.style.opacity = '1';
    toast.style.display = 'flex';

    if (type !== 'speaking') {
      clearTimeout(window.__ub_toast_timer);
      window.__ub_toast_timer = setTimeout(() => {
        if (toast) toast.style.opacity = '0';
      }, 4000);
    }
  }

  function hideToast() {
    const toast = document.getElementById('ub-dub-toast');
    if (toast) {
      toast.style.opacity = '0';
      setTimeout(() => { toast.style.display = 'none'; }, 200);
    }
  }

  function ensureDubbingRunning() {
    initAudioCtx();
    bindVideoEvents();
    if (!D.cues || D.cues.length === 0) {
      loadSubtitlesForCurrentVideo();
    } else {
      const v = document.querySelector('video');
      preloadInitialBuffer(v);
    }
  }

  // ─── KHỞI TẠO TIỆN ÍCH ───
  function init() {
    syncSettings();
    observeVideoChanges();
    setInterval(() => {
      injectDubButton();
      injectFloatingDubPill();
      bindVideoEvents();
    }, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
