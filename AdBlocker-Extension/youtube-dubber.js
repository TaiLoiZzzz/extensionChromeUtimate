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
    provider: 'gemini', // 'gemini' | 'google'
    geminiApiKey: 'AIzaSyCklhdUMekEOmueB6uqa7B7_SKdnMKFu1M',
    voice: 'vi-VN-HoaiMyNeural', // 'vi-VN-HoaiMyNeural' (Nữ) | 'vi-VN-NamMinhNeural' (Nam)
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
      if (data.dubbingDuckLevel !== undefined) D.duckLevel = parseFloat(data.dubbingDuckLevel) || 0.15;
      if (data.dubbingVolume !== undefined) {
        D.dubVolume = parseFloat(data.dubbingVolume) || 1.0;
        if (D.dubGainNode && D.audioCtx) {
          D.dubGainNode.gain.setValueAtTime(D.dubVolume, D.audioCtx.currentTime);
        }
      }
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
    }
  });

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

  // ─── BỘ PHÂN TÍCH PHỤ ĐỀ ĐA ĐỊNH DẠNG (JSON3 & XML TIMEDTEXT) ───
  function parseAnySubtitles(raw) {
    if (!raw) return [];

    // 1. Thử phân tích JSON3
    try {
      const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (json && Array.isArray(json.events) && json.events.length > 0) {
        const cues = [];
        json.events.forEach((ev, idx) => {
          if (!ev.segs || !ev.segs.length) return;
          const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
          if (!text || text === '\n') return;
          const start = (ev.tStartMs || 0) / 1000;
          const duration = (ev.dDurationMs || 1500) / 1000;
          cues.push({
            id: idx,
            start: start,
            duration: duration,
            end: start + duration,
            text: text,
            viText: '',
            audioBuffer: null,
            translating: false,
            synthesizing: false
          });
        });
        if (cues.length > 0) return cues;
      }
    } catch (e) {}

    // 2. Thử phân tích XML TimedText (<p t="..." d="..."> hoặc <text start="..." dur="...">)
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, 'text/xml');
      const cues = [];

      const pTags = doc.querySelectorAll('p');
      if (pTags && pTags.length > 0) {
        pTags.forEach((p, idx) => {
          const text = (p.textContent || '').replace(/\n/g, ' ').trim();
          if (!text) return;
          const start = (parseFloat(p.getAttribute('t')) || 0) / 1000;
          const duration = (parseFloat(p.getAttribute('d')) || 1500) / 1000;
          cues.push({
            id: idx,
            start: start,
            duration: duration,
            end: start + duration,
            text: text,
            viText: '',
            audioBuffer: null,
            translating: false,
            synthesizing: false
          });
        });
        if (cues.length > 0) return cues;
      }

      const textTags = doc.querySelectorAll('text');
      if (textTags && textTags.length > 0) {
        textTags.forEach((t, idx) => {
          const text = (t.textContent || '').replace(/\n/g, ' ').trim();
          if (!text) return;
          const start = parseFloat(t.getAttribute('start')) || 0;
          const duration = parseFloat(t.getAttribute('dur')) || 1.5;
          cues.push({
            id: idx,
            start: start,
            duration: duration,
            end: start + duration,
            text: text,
            viText: '',
            audioBuffer: null,
            translating: false,
            synthesizing: false
          });
        });
        if (cues.length > 0) return cues;
      }
    } catch (e) {}

    return [];
  }

  // ─── TẢI PHỤ ĐỀ TỪ YOUTUBE TIMEDTEXT API (ĐA TẦNG DÒ TÌM) ───
  async function loadSubtitlesForCurrentVideo() {
    const videoId = getVideoId();
    if (!videoId) return;
    D.currentVideoId = videoId;
    D.cues = [];
    showToast('Đang kết nối phụ đề...', 'loading');

    // 1. Dò tìm danh sách track từ main world (thử tối đa 8 lần = 2.4s)
    let tracks = D.captionTracks || [];
    for (let attempt = 1; attempt <= 8; attempt++) {
      if (tracks && tracks.length > 0) break;
      window.postMessage({ type: 'UB_GET_CAPTIONS' }, '*');
      await new Promise(r => setTimeout(r, 300));
      tracks = D.captionTracks || [];
    }

    if (!tracks || tracks.length === 0) {
      showToast('Video không có phụ đề hoặc đang tải...', 'error');
      return;
    }

    // 2. Xếp thứ tự ưu tiên các track:
    // Priority 1: Tiếng Việt (nếu có sẵn tiếng Việt, khỏi cần dịch máy)
    // Priority 2: Tiếng Anh chuẩn (manual)
    // Priority 3: Tiếng Anh tự động (ASR)
    // Priority 4: Bất kỳ ngôn ngữ nào có sẵn
    const viTrack = tracks.find(t => t.languageCode === 'vi' || (t.vssId && t.vssId.includes('.vi')));
    const enManual = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
    const enAsr = tracks.find(t => t.languageCode === 'en' || (t.vssId && t.vssId.includes('en')));
    const fallbackTrack = tracks[0];

    const chosenTrack = viTrack || enManual || enAsr || fallbackTrack;
    const isAlreadyVietnamese = Boolean(viTrack && chosenTrack === viTrack);

    showToast(`Đã tìm thấy phụ đề: ${chosenTrack.name?.simpleText || chosenTrack.languageCode || 'Gốc'}`, 'loading');

    // 3. Các định dạng URL cần thử lấy dữ liệu
    const base = chosenTrack.baseUrl;
    const urlsToTry = [
      base.includes('fmt=json3') ? base : (base + '&fmt=json3'),
      base.replace(/&fmt=[^&]+/, '') // raw XML
    ];

    // Nếu là track ngôn ngữ khác và có cờ isTranslatable:
    if (!isAlreadyVietnamese && chosenTrack.isTranslatable) {
      urlsToTry.unshift(base + '&tlang=vi&fmt=json3'); // YouTube auto-translate sang Tiếng Việt
      urlsToTry.push(base + '&tlang=en&fmt=json3');   // YouTube auto-translate sang Tiếng Anh
    }

    let parsedCues = [];
    for (const url of urlsToTry) {
      // Thử 1: Fetch trực tiếp từ Main World (Có đủ cookie session của YouTube)
      let raw = await fetchSubtitlesFromMainWorld(url);
      if (!raw) {
        // Thử 2: Fetch qua Background Service Worker
        raw = await fetchSubtitlesFromBackground(url);
      }

      if (raw) {
        parsedCues = parseAnySubtitles(raw);
        if (parsedCues.length > 0) {
          if (url.includes('tlang=vi') || isAlreadyVietnamese) {
            parsedCues.forEach(c => { c.viText = c.text; });
          }
          break;
        }
      }
    }

    if (!parsedCues || parsedCues.length === 0) {
      showToast('Không tải được nội dung phụ đề', 'error');
      return;
    }

    // 4. Áp dụng thuật toán đo thời lượng 4 lớp (Effective Target & Max Syllables)
    for (let i = 0; i < parsedCues.length; i++) {
      const cue = parsedCues[i];
      const nextStart = parsedCues[i + 1] ? parsedCues[i + 1].start : (cue.end + 2.0);
      cue.gap = Math.max(0, nextStart - cue.end);
      cue.effectiveTarget = cue.duration + Math.min(0.7 * cue.gap, 0.6);
      cue.maxSyllables = Math.max(3, Math.round(cue.effectiveTarget * 4.0));
    }

    D.cues = parsedCues;
    showToast(`Đã sẵn sàng lồng tiếng (${D.cues.length} câu)`, 'success');

    // Bắt đầu xử lý hàng đợi câu nói ngay
    const video = document.querySelector('video');
    if (video) processQueue(video.currentTime);
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

  // ─── HÀM TẠO SEC-MS-GEC TOKEN CHO EDGE-TTS WEBSOCKET ───
  async function generateSecMsGec() {
    const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    const WIN_EPOCH = 11644473600000000n;
    const timestampTicks = BigInt(Math.floor(Date.now() / 1000)) * 10000000n + WIN_EPOCH;
    const roundedTicks = timestampTicks - (timestampTicks % 3000000000n);
    const strToHash = `${roundedTicks}${TRUSTED_CLIENT_TOKEN}`;
    const msgBuffer = new TextEncoder().encode(strToHash);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  // ─── TỔNG HỢP GIỌNG ĐỌC MICROSOFT EDGE-TTS QUA WEBSOCKET ───
  async function fetchEdgeTTSAudio(text, voice) {
    return new Promise(async (resolve, reject) => {
      try {
        const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
        const secGec = await generateSecMsGec();
        const requestId = crypto.randomUUID().replace(/-/g, '');
        const wssUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secGec}&Sec-MS-GEC-Version=1-130.0.2849.68&ConnectionId=${requestId}`;

        const ws = new WebSocket(wssUrl);
        ws.binaryType = 'arraybuffer';
        const audioChunks = [];
        let isDone = false;

        const timer = setTimeout(() => {
          if (!isDone) {
            try { ws.close(); } catch(e) {}
            reject(new Error('Edge-TTS connection timeout'));
          }
        }, 3000);

        ws.onopen = () => {
          const configMsg = `Content-Type:application/json;charset=utf-8\r\nPath:speech.config\r\n\r\n` +
            JSON.stringify({
              context: {
                synthesis: {
                  audio: {
                    metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                    outputFormat: "audio-24khz-48kbitrate-mono-mp3"
                  }
                }
              }
            });
          ws.send(configMsg);

          const safeText = text.replace(/[<>&"']/g, '');
          const voiceName = voice || 'vi-VN-HoaiMyNeural';
          const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'>` +
            `<voice name='${voiceName}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${safeText}</prosody></voice></speak>`;
          const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
          ws.send(ssmlMsg);
        };

        ws.onmessage = event => {
          if (typeof event.data === 'string') {
            if (event.data.includes('Path:turn.end')) {
              isDone = true;
              clearTimeout(timer);
              ws.close();

              if (audioChunks.length === 0) {
                reject(new Error('No audio received'));
                return;
              }

              const totalLen = audioChunks.reduce((acc, c) => acc + c.byteLength, 0);
              const merged = new Uint8Array(totalLen);
              let offset = 0;
              for (const c of audioChunks) {
                merged.set(new Uint8Array(c), offset);
                offset += c.byteLength;
              }
              resolve(merged.buffer);
            }
          } else if (event.data instanceof ArrayBuffer) {
            // Tách header 2 bytes
            if (event.data.byteLength > 2) {
              const view = new DataView(event.data);
              const headerLen = view.getInt16(0);
              if (event.data.byteLength > headerLen + 2) {
                audioChunks.push(event.data.slice(headerLen + 2));
              }
            }
          }
        };

        ws.onerror = err => {
          clearTimeout(timer);
          reject(err);
        };
      } catch (e) {
        reject(e);
      }
    });
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

  // ─── DỰ PHÒNG TỔNG HỢP TIẾNG QUA GOOGLE TTS HTTP ───
  async function fetchGoogleTTSAudio(text) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Google TTS failed');
    return await res.arrayBuffer();
  }

  // ─── QUẢN LÝ HÀNG ĐỢI DỊCH VÀ TỔNG HỢP TRƯỚC (PRE-FETCH BUFFER 15 GIÂY) ───
  function processQueue(currentTime) {
    if (!D.enabled || !D.cues || D.cues.length === 0) return;

    // Lọc các câu sắp nói trong khoảng từ currentTime đến currentTime + 18s
    const upcomingCues = D.cues.filter(c => c.start >= currentTime - 1 && c.start <= currentTime + 18);

    for (const cue of upcomingCues) {
      // 1. Dịch văn bản nếu chưa dịch
      if (!cue.viText && !cue.translating) {
        cue.translating = true;
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
          } else {
            cue.viText = cue.text; // Giữ nguyên nếu lỗi
          }
        });
      }

      // 2. Tổng hợp giọng đọc Edge-TTS nếu đã dịch xong và chưa có AudioBuffer
      if (cue.viText && !cue.audioBuffer && !cue.synthesizing) {
        cue.synthesizing = true;
        fetchEdgeTTSAudio(cue.viText, D.voice)
          .then(decodeAudioData)
          .then(buffer => {
            cue.synthesizing = false;
            cue.audioBuffer = buffer;
          })
          .catch(() => {
            // Dự phòng 1: Google TTS Audio
            fetchGoogleTTSAudio(cue.viText)
              .then(decodeAudioData)
              .then(buffer => {
                cue.synthesizing = false;
                cue.audioBuffer = buffer;
              })
              .catch(() => {
                cue.synthesizing = false;
              });
          });
      }
    }
  }

  // ─── LỚP 3 & 4: PHÁT ÂM THANH ĐỒNG BỘ THỜI GIAN THỰC + DUCKING NHẠC NỀN ───
  function playCueAudio(cue) {
    initAudioCtx();
    stopCurrentAudio();

    D.isSpeaking = true;
    showToast(cue.viText || cue.text, 'speaking');

    // 1. Kích hoạt Audio Ducking: Hạ âm lượng video YouTube gốc xuống 15%
    window.postMessage({ type: 'UB_AUDIO_DUCK', duck: true, level: D.duckLevel }, '*');

    // 2. Tính toán tỷ lệ co giãn thời gian (Time-Stretching)
    if (cue.audioBuffer && D.audioCtx && D.dubGainNode) {
      const audioDuration = cue.audioBuffer.duration;
      const targetDuration = cue.effectiveTarget || cue.duration || 1.5;
      
      // Tỷ lệ R = Thời lượng âm thanh thực / Thời lượng cho phép
      const R = audioDuration / targetDuration;
      
      // Co giãn tốc độ mượt mà từ 1.0x đến 1.35x
      let rate = 1.0;
      if (R > 1.05 && R <= 1.35) {
        rate = R;
      } else if (R > 1.35) {
        rate = 1.35; // Khống chế trần để giọng không bị biến dạng
      }

      const source = D.audioCtx.createBufferSource();
      source.buffer = cue.audioBuffer;
      source.playbackRate.setValueAtTime(rate, D.audioCtx.currentTime);
      source.connect(D.dubGainNode);

      source.onended = () => {
        D.isSpeaking = false;
        D.currentSource = null;
        // Trả lại âm lượng gốc 100%
        window.postMessage({ type: 'UB_AUDIO_DUCK', duck: false }, '*');
      };

      D.currentSource = source;
      source.start(0);

    } else {
      // Dự phòng 2: Web Speech API (Native Browser SpeechSynthesis)
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(cue.viText || cue.text);
        utter.lang = 'vi-VN';
        utter.rate = 1.15;
        utter.volume = D.dubVolume;
        utter.onend = () => {
          D.isSpeaking = false;
          window.postMessage({ type: 'UB_AUDIO_DUCK', duck: false }, '*');
        };
        utter.onerror = () => {
          D.isSpeaking = false;
          window.postMessage({ type: 'UB_AUDIO_DUCK', duck: false }, '*');
        };
        window.speechSynthesis.speak(utter);
      }
    }
  }

  function stopCurrentAudio() {
    if (D.currentSource) {
      try { D.currentSource.stop(); } catch (e) {}
      D.currentSource = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    D.isSpeaking = false;
    window.postMessage({ type: 'UB_AUDIO_DUCK', duck: false }, '*');
  }

  function stopAllDubbing() {
    stopCurrentAudio();
    hideToast();
    updateDubButtonUI();
  }

  // ─── VÒNG LẶP ĐỒNG BỘ THEO PLAYER CLOCK (TIMEUPDATE / RAF) ───
  let boundVideoElement = null;

  function bindVideoEvents() {
    const video = document.querySelector('video');
    if (!video || boundVideoElement === video) return;
    boundVideoElement = video;

    video.addEventListener('timeupdate', () => {
      if (!D.enabled || !D.cues || D.cues.length === 0) return;
      const t = video.currentTime;

      // Xử lý nạp dữ liệu phía trước
      processQueue(t);

      // Tìm câu tương ứng với thời điểm hiện tại
      const cueIndex = D.cues.findIndex(c => t >= c.start && t < (c.end + (c.gap || 0.2)));

      if (cueIndex !== -1 && cueIndex !== D.activeCueIndex) {
        D.activeCueIndex = cueIndex;
        playCueAudio(D.cues[cueIndex]);
      }
    });

    video.addEventListener('seeking', () => {
      stopCurrentAudio();
      D.activeCueIndex = -1;
      if (D.enabled) processQueue(video.currentTime);
    });

    video.addEventListener('pause', () => {
      if (D.audioCtx && D.audioCtx.state === 'running') {
        D.audioCtx.suspend().catch(() => {});
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.pause();
      }
    });

    video.addEventListener('play', () => {
      initAudioCtx();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
      }
    });
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

  // ─── GIAO DIỆN NÚT BẤM TRÊN THANH ĐIỀU KHIỂN YOUTUBE ───
  function injectDubButton() {
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls || document.getElementById('ub-ytp-dub-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'ub-ytp-dub-btn';
    btn.className = 'ytp-button';
    btn.setAttribute('title', 'Lồng tiếng Tiếng Việt AI (Dubbing)');
    btn.style.cssText = `
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 100%;
      vertical-align: top;
      cursor: pointer;
      user-select: none;
      transition: all 0.2s;
    `;

    btn.innerHTML = `
      <div id="ub-dub-icon-box" style="
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 3px 6px;
        border-radius: 6px;
        background: ${D.enabled ? 'rgba(0, 200, 83, 0.2)' : 'rgba(255,255,255,0.1)'};
        border: 1px solid ${D.enabled ? '#00c853' : 'rgba(255,255,255,0.2)'};
        transition: all 0.2s;
      ">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="${D.enabled ? '#00c853' : '#fff'}">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
        <span id="ub-dub-btn-label" style="
          font-size: 11px;
          font-weight: 800;
          color: ${D.enabled ? '#00c853' : '#fff'};
          letter-spacing: 0.5px;
        ">VI</span>
      </div>
    `;

    btn.onclick = () => {
      initAudioCtx();
      const newEnabled = !D.enabled;
      chrome.storage.local.set({ dubbingEnabled: newEnabled });
    };

    // Chèn trước nút cài đặt hoặc toàn màn hình
    const settingsBtn = rightControls.querySelector('.ytp-settings-button');
    if (settingsBtn) {
      rightControls.insertBefore(btn, settingsBtn);
    } else {
      rightControls.prepend(btn);
    }
  }

  function updateDubButtonUI() {
    const box = document.getElementById('ub-dub-icon-box');
    const label = document.getElementById('ub-dub-btn-label');
    const svgPath = document.querySelector('#ub-dub-icon-box svg path');
    if (!box || !label) return;

    if (D.enabled) {
      box.style.background = 'rgba(0, 200, 83, 0.25)';
      box.style.borderColor = '#00c853';
      box.style.boxShadow = '0 0 8px rgba(0, 200, 83, 0.5)';
      label.style.color = '#00c853';
      if (svgPath) svgPath.style.fill = '#00c853';
    } else {
      box.style.background = 'rgba(255,255,255,0.1)';
      box.style.borderColor = 'rgba(255,255,255,0.2)';
      box.style.boxShadow = 'none';
      label.style.color = '#ffffff';
      if (svgPath) svgPath.style.fill = '#ffffff';
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
    }
  }

  // ─── KHỞI TẠO TIỆN ÍCH ───
  function init() {
    syncSettings();
    observeVideoChanges();
    setInterval(() => {
      injectDubButton();
      bindVideoEvents();
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
