// ====================================================
// UltraBlock Pro - Context Menu Translator (Dịch Chuột Phải)
// Bôi đen chữ -> Bấm chuột phải -> Chọn "Dịch sang Tiếng Việt"
// ====================================================
(function () {
  'use strict';

  // ─── TẠO BONG BÓNG HIỂN THỊ KẾT QUẢ DỊCH ───
  let bubble = null;

  function ensureBubble() {
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = 'ub-translator-bubble';
      bubble.style.cssText = `
        position: fixed !important;
        z-index: 2147483647 !important;
        background: #111116 !important;
        color: #ffffff !important;
        border: 2px solid #00e676 !important;
        border-radius: 8px !important;
        padding: 9px 15px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        box-shadow: 0 10px 30px rgba(0,0,0,0.95), 0 0 15px rgba(0,230,118,0.4) !important;
        display: none !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        user-select: none !important;
        max-width: 420px !important;
        line-height: 1.4 !important;
        white-space: normal !important;
      `;
    }
    const container = document.body || document.documentElement;
    if (container && !container.contains(bubble)) {
      container.appendChild(bubble);
    }
    return bubble;
  }

  function hideBubble() {
    if (bubble) bubble.style.display = 'none';
  }

  window.addEventListener('mousedown', (e) => {
    if (bubble && !bubble.contains(e.target)) {
      hideBubble();
    }
  }, true);

  // ─── GHI NHẬN TỌA ĐỘ KHI BẤM CHUỘT PHẢI ───
  let lastRightClickX = 200;
  let lastRightClickY = 200;

  window.addEventListener('contextmenu', (e) => {
    lastRightClickX = e.clientX;
    lastRightClickY = e.clientY;
  }, true);

  // ─── LẮNG NGHE KẾT QUẢ DỊCH TỪ CONTEXT MENU (CHUỘT PHẢI) ───
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'CONTEXT_TRANSLATE_RESULT') {
      const { originalText, translatedText } = msg;
      if (!translatedText) return;

      const selection = window.getSelection();
      let top = lastRightClickY - 50;
      let left = lastRightClickX - 20;

      // Nếu có range selection, căn toạ độ theo vùng bôi đen
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          top = rect.top - 50;
          left = rect.left + (rect.width / 2) - 40;
        }
      }

      // Tránh tràn viền màn hình
      if (top < 10) top = lastRightClickY + 20;
      if (left < 10) left = 10;
      if (left + 260 > window.innerWidth) left = window.innerWidth - 270;

      const b = ensureBubble();
      b.style.top = `${top}px`;
      b.style.left = `${left}px`;
      b.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="color:#00e676;font-size:16px;">🇻🇳</span>
          <span style="color:#ffffff;font-size:14px;font-weight:700;">${translatedText}</span>
          <span style="font-size:11px;color:#aaa;background:#25252c;padding:3px 8px;border-radius:4px;border:1px solid #444;" title="Click để thay thế chữ">Đổi chữ</span>
        </div>
      `;
      b.style.display = 'block';

      // ─── TỰ ĐỘNG THAY THẾ CHỮ TẠI CHỖ TRÊN TRANG ───
      function replaceText() {
        try {
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const activeEl = document.activeElement;
            const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

            if (isInput) {
              document.execCommand('insertText', false, translatedText);
            } else {
              range.deleteContents();
              range.insertNode(document.createTextNode(translatedText));
            }
          }
        } catch (e) {
          // Dự phòng thay thế text trong node
          try {
            const range = selection.getRangeAt(0);
            const node = range.startContainer;
            if (node && node.nodeType === Node.TEXT_NODE) {
              const val = node.nodeValue;
              node.nodeValue = val.slice(0, range.startOffset) + translatedText + val.slice(range.endOffset);
            }
          } catch(err) {}
        }
      }

      // Tự động đổi chữ gốc sang tiếng Việt
      replaceText();

      // Click vào bong bóng cũng đổi chữ và đóng
      b.onclick = (e) => {
        e.stopPropagation();
        replaceText();
        hideBubble();
      };
    }
  });

})();
