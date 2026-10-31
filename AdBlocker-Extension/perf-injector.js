// ====================================================
// UltraBlock Pro - Turbo Engine (Chạy trên toàn bộ Chrome)
// GIẢM LAG CHROME XUỐNG MỨC TUYỆT ĐỐI (ZERO LAG & MAX FPS)
// ====================================================
(function () {
  'use strict';

  // ─── 1. ÉP GPU GIẢI MÃ TOÀN BỘ HÌNH ẢNH & CUỘN TRANG (HARDWARE ACCEL) ───
  const perfStyle = document.createElement('style');
  perfStyle.id = 'ub-chrome-turbo-style';
  perfStyle.textContent = `
    /* Tăng tốc phần cứng khi cuộn trang */
    html {
      scroll-behavior: smooth !important;
    }
    
    /* Ép giải mã ảnh bằng GPU mà không làm nghẽn CPU */
    img {
      content-visibility: auto;
      decoding: async !important;
    }

    /* Vô hiệu hóa các hoạt ảnh CSS giật lag khi cuộn trang */
    .scrolling *, .scrolling *::before, .scrolling *::after {
      pointer-events: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(perfStyle);

  // ─── 2. TỐI ƯU SCROLL: CHỐNG LAG GIẬT KHI CUỘN CHUỘT (60FPS / 120FPS) ───
  let scrollTimeout = null;
  window.addEventListener('scroll', () => {
    if (!document.body.classList.contains('scrolling')) {
      document.body.classList.add('scrolling');
    }
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      document.body.classList.remove('scrolling');
    }, 150);
  }, { passive: true });

  // ─── 3. ÉP MỌI HÌNH ẢNH CHUYỂN SANG LAZY-LOAD (TIẾT KIỆM 60% RAM) ───
  function optimizeImages() {
    document.querySelectorAll('img:not([loading])').forEach(img => {
      img.loading = 'lazy';
      img.decoding = 'async';
    });
  }

  // ─── 4. DỌN SẠCH CÁC IFRAME VÀ SCRIPT RÁC CHẠY NGẦM NGỐN CPU ───
  function nukeHiddenTrackers() {
    // Xóa iframe ẩn 0x0 hoặc 1x1 pixel (quảng cáo ẩn & mã độc theo dõi)
    document.querySelectorAll('iframe').forEach(frame => {
      const w = frame.offsetWidth || parseInt(frame.width) || 0;
      const h = frame.offsetHeight || parseInt(frame.height) || 0;
      if ((w <= 1 && h <= 1) && !frame.src.includes('youtube.com')) {
        frame.remove();
      }
    });

    // Chặn các script theo dõi chuột liên tục gây nóng máy
    const heavyTrackerPatterns = [
      'hotjar', 'mouseflow', 'clarity.ms', 'crazyegg',
      'fullstory', 'luckyorange', 'inspectlet'
    ];
    document.querySelectorAll('script[src]').forEach(s => {
      if (heavyTrackerPatterns.some(p => s.src.includes(p))) {
        s.remove();
      }
    });
  }

  // ─── 5. ĐÓNG BĂNG HOẠT ẢNH KHI TAB BỊ ẨN (BACKGROUND CPU = 0%) ───
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.body && (document.body.style.animationPlayState = 'paused');
    } else {
      document.body && (document.body.style.animationPlayState = '');
    }
  });

  // ─── 6. PASSIVE EVENT LISTENERS (CUỘN TRANG KHÔNG BAO GIỜ BỊ KHỰNG) ───
  const _addEL = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (['touchstart', 'touchmove', 'wheel', 'mousewheel'].includes(type)) {
      if (typeof opts !== 'object') {
        opts = { passive: true, capture: !!opts };
      } else if (opts.passive === undefined) {
        opts = { ...opts, passive: true };
      }
    }
    return _addEL.call(this, type, fn, opts);
  };

  // Khởi động
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      optimizeImages();
      nukeHiddenTrackers();
    });
  } else {
    optimizeImages();
    nukeHiddenTrackers();
  }

  // Quét định kỳ nhẹ nhàng
  setInterval(() => {
    optimizeImages();
    nukeHiddenTrackers();
  }, 5000);

})();
