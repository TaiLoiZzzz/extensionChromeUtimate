// ====================================================
// UltraBlock Pro v2 - Content Script (FIXED)
// Không còn setInterval throttle gây hỏng YouTube player
// ====================================================
(function () {
  'use strict';

  // Không chạy trong iframe của YouTube player
  if (window.self !== window.top && location.hostname.includes('youtube.com')) return;

  let blockedCount = 0;
  let settings = {};
  chrome.storage.local.get(null, s => { settings = s; });

  // ─── AD SELECTORS ────────────────────────────────
  const AD_SELECTORS = [
    'ins.adsbygoogle','[id^="google_ads"]','[id^="div-gpt-ad"]',
    '[class*="google-ad"]','[class*="googlead"]','[data-ad-client]',
    '[data-adsbygoogle-status]','[class*="ad-banner"]','[class*="ad-container"]',
    '[class*="ad-wrapper"]','[class*="ad-slot"]','[class*="ad-unit"]',
    '[class*="adBlock"]','[class*="adContainer"]','[class*="adWrapper"]',
    '[class*="adBanner"]','[id*="ad-banner"]','[id*="ad-container"]',
    '[id*="ad-wrapper"]','[id*="ad-slot"]','[id*="ad_unit"]',
    // Betting
    '[href*="vsbet"]','[src*="vsbet"]','[href*="colascore"]','[src*="colascore"]',
    '[href*="fb88"]','[href*="88bet"]','[href*="w88"]','[href*="m88"]',
    '[href*="fun88"]','[href*="bet365"]','[href*="1xbet"]','[href*="bk8"]',
    '[href*="jun88"]','[href*="hi88"]','[href*="123b"]','[href*="shbet"]',
    // Popup/Overlay
    '[class*="popup-ad"]','[class*="ad-popup"]','[class*="overlay-ad"]',
    '[class*="ad-overlay"]','[id*="popup-ad"]','[id*="ad-popup"]',
    // Native ads
    '[class*="taboola"]','[class*="outbrain"]','[class*="revcontent"]',
    '[class*="mgid"]','[id*="taboola"]','[id*="outbrain"]',
    '[data-native-ad]','[data-sponsored]','[class*="sponsored"]','[class*="sponsor-"]',
    // iFrame ads
    'iframe[src*="doubleclick"]','iframe[src*="googlesyndication"]',
    'iframe[src*="advertising"]','iframe[src*="adnxs"]',
    'iframe[src*="amazon-adsystem"]','iframe[src*="moatads"]',
    'iframe[src*="exoclick"]','iframe[src*="propellerads"]',
    'iframe[src*="trafficjunky"]','iframe[src*="colascore"]','iframe[src*="vsbet"]',
    '[data-ad-format]','[data-ad-layout]','[data-full-width-responsive]',
  ];

  const SOCIAL_SELECTORS = [
    'iframe[src*="facebook.com/plugins"]','iframe[src*="platform.twitter.com"]',
    'iframe[src*="tiktok.com/embed"]','.fb-like','.fb-share-button','.fb-comments',
  ];

  const COOKIE_SELECTORS = [
    '[id*="cookie-banner"]','[id*="cookie-notice"]','[id*="cookie-consent"]',
    '[id*="gdpr"]','[class*="cookie-banner"]','[class*="cookie-notice"]',
    '[class*="cookie-bar"]','[class*="gdpr-banner"]','[class*="cc-banner"]',
    '#onetrust-banner-sdk','#cookiebanner','.cookie-law-info-bar',
  ];

  function hideEl(el) {
    if (!el || el.dataset.ub2) return;
    el.dataset.ub2 = '1';
    el.style.cssText += ';display:none!important;height:0!important;overflow:hidden!important;';
    blockedCount++;
  }

  function scan(sels) {
    sels.forEach(sel => {
      try { document.querySelectorAll(sel).forEach(hideEl); } catch(e) {}
    });
  }

  function scanAndBlock() {
    scan(AD_SELECTORS);
    if (settings.blockSocialWidgets !== false) scan(SOCIAL_SELECTORS);
    if (settings.removeCookieBanners !== false) scan(COOKIE_SELECTORS);

    // Betting keyword scan
    if (settings.blockBetting !== false) {
      document.querySelectorAll('a[href],img[src]').forEach(el => {
        const val = (el.href || el.src || '').toLowerCase();
        const kws = ['vsbet','colascore','fb88','w88','m88','fun88','1xbet','bk8','jun88','shbet'];
        if (kws.some(k => val.includes(k))) {
          hideEl(el.closest('div,section,article,aside,figure') || el);
        }
      });
    }

    if (blockedCount > 0) {
      chrome.runtime.sendMessage({ type:'AD_BLOCKED', count:blockedCount, kb:blockedCount*1.5 });
      blockedCount = 0;
    }
  }

  // ─── BLOCK POPUPS ────────────────────────────────
  const _open = window.open;
  window.open = function(url = '', ...a) {
    if (settings.blockPopups === false) return _open.apply(window, [url, ...a]);
    const bad = ['doubleclick','googlesyndication','adnxs','vsbet','colascore',
                 'exoclick','propellerads','trafficjunky','popcash','popads'];
    if (url && bad.some(k => url.toLowerCase().includes(k))) return null;
    return _open.apply(window, [url, ...a]);
  };

  // ─── BLOCK AD CLICK REDIRECTS ────────────────────
  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.href || '';
    const bad = ['doubleclick','googlesyndication','googleadservices','adnxs',
                 'vsbet','colascore','exoclick','propellerads','trafficjunky'];
    if (bad.some(d => href.includes(d))) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // ─── PASSIVE SCROLL EVENTS ───────────────────────
  // (chỉ áp dụng trên NON-YouTube để không phá player)
  if (!location.hostname.includes('youtube.com')) {
    const _ael = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, fn, opts) {
      if (['touchstart','touchmove','wheel','scroll'].includes(type)) {
        if (typeof opts !== 'object') opts = { passive: true, capture: !!opts };
        else if (opts.passive === undefined) opts = { ...opts, passive: true };
      }
      return _ael.call(this, type, fn, opts);
    };
  }

  // ─── LAZY IMAGES (non-YouTube) ───────────────────
  if (!location.hostname.includes('youtube.com') && settings.lazyImages !== false) {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('img:not([loading])').forEach(img => {
        img.loading = 'lazy';
        img.decoding = 'async';
      });
    });
  }

  // ─── MUTATION OBSERVER ───────────────────────────
  let scanPending = false;
  const observer = new MutationObserver(() => {
    if (scanPending) return;
    scanPending = true;
    requestAnimationFrame(() => {
      scanAndBlock();
      scanPending = false;
    });
  });

  function init() {
    scanAndBlock();
    observer.observe(document.documentElement, { childList:true, subtree:true });
    // Backup scan mỗi 4s (không quá thường để không ngốn CPU)
    setInterval(scanAndBlock, 4000);
  }

  scanAndBlock();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
