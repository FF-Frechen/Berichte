/**
 * Barcode-Scanner über die Tablet-Kamera
 *
 * Liest z. B. die Einsatznummer vom Barcode der Depesche. Alles läuft lokal:
 * - bevorzugt der im Browser eingebaute BarcodeDetector (Chrome auf Android,
 *   Erkennung direkt auf dem Gerät),
 * - sonst die mitgelieferte ZXing-Bibliothek (/vendor/zxing.min.js), die erst
 *   beim Öffnen des Scanners nachgeladen wird.
 * Das Kamerabild wird nur im Browser ausgewertet, nie gespeichert oder gesendet.
 *
 * API:
 *   BarcodeScanner.isSupported()   – Kamera nutzbar (HTTPS + getUserMedia)?
 *   BarcodeScanner.open(onResult)  – Scanner öffnen, onResult(text) bei Treffer
 *   BarcodeScanner.close()         – Scanner schließen, Kamera stoppen
 */
(function () {
  const ZXING_URL = '/vendor/zxing.min.js';
  const SCAN_INTERVAL_MS = 250;

  let overlay = null;
  let video = null;
  let statusEl = null;
  let stream = null;
  let scanTimer = null;
  let active = false;
  let zxingPromise = null;

  function isSupported() {
    return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function injectStyles() {
    if (document.getElementById('barcode-scanner-styles')) return;
    const style = document.createElement('style');
    style.id = 'barcode-scanner-styles';
    style.textContent = `
      .bs-overlay {
        position: fixed; inset: 0; z-index: 20000; background: #000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
      }
      .bs-video-wrap { position: relative; width: 100%; max-width: 900px; flex: 1; overflow: hidden; }
      .bs-video { width: 100%; height: 100%; object-fit: cover; }
      .bs-frame {
        position: absolute; left: 10%; right: 10%; top: 35%; height: 30%;
        border: 3px solid #fff; border-radius: 8px;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.45);
      }
      .bs-frame::after {
        content: ''; position: absolute; left: 4%; right: 4%; top: 50%;
        border-top: 2px solid #d62828; opacity: 0.9;
      }
      .bs-bar { width: 100%; max-width: 900px; padding: 14px 16px 20px; box-sizing: border-box; text-align: center; }
      .bs-status { color: #fff; font-size: 17px; margin-bottom: 12px; font-family: Arial, sans-serif; }
      .bs-status.error { color: #ffb4b4; font-weight: bold; }
      .bs-cancel {
        background: #fff; color: #003049; border: none; border-radius: 6px;
        font-size: 17px; font-weight: bold; padding: 12px 28px; min-height: 48px; cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function buildOverlay() {
    injectStyles();
    overlay = document.createElement('div');
    overlay.className = 'bs-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Barcode scannen');

    const wrap = document.createElement('div');
    wrap.className = 'bs-video-wrap';
    video = document.createElement('video');
    video.className = 'bs-video';
    video.setAttribute('playsinline', '');
    video.muted = true;
    video.autoplay = true;
    const frame = document.createElement('div');
    frame.className = 'bs-frame';
    wrap.appendChild(video);
    wrap.appendChild(frame);

    const bar = document.createElement('div');
    bar.className = 'bs-bar';
    statusEl = document.createElement('div');
    statusEl.className = 'bs-status';
    statusEl.textContent = 'Kamera wird gestartet…';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'bs-cancel';
    cancel.textContent = 'Abbrechen';
    cancel.addEventListener('click', close);
    bar.appendChild(statusEl);
    bar.appendChild(cancel);

    overlay.appendChild(wrap);
    overlay.appendChild(bar);
    document.body.appendChild(overlay);
  }

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'bs-status' + (isError ? ' error' : '');
  }

  function stopCamera() {
    clearTimeout(scanTimer);
    scanTimer = null;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (video) video.srcObject = null;
  }

  function close() {
    active = false;
    stopCamera();
    if (overlay) overlay.remove();
    overlay = video = statusEl = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', close);
  }

  // Tablet gesperrt / App gewechselt → Kamera nicht weiterlaufen lassen
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') close();
  }

  function loadZxing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!zxingPromise) {
      zxingPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = ZXING_URL;
        s.onload = () => (window.ZXing ? resolve(window.ZXing) : reject(new Error('ZXing nicht verfügbar')));
        s.onerror = () => { zxingPromise = null; reject(new Error('ZXing konnte nicht geladen werden')); };
        document.head.appendChild(s);
      });
    }
    return zxingPromise;
  }

  // Erkennung über den eingebauten BarcodeDetector (falls vorhanden und nutzbar)
  async function createNativeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (!formats || formats.length === 0) return null;
      const detector = new window.BarcodeDetector({ formats });
      return async (videoEl) => {
        const codes = await detector.detect(videoEl);
        return codes.length ? codes[0].rawValue : null;
      };
    } catch (e) {
      console.warn('BarcodeDetector nicht nutzbar, verwende ZXing:', e);
      return null;
    }
  }

  // Erkennung über die lokal mitgelieferte ZXing-Bibliothek
  async function createZxingDetector() {
    const ZXing = await loadZxing();
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.CODE_93,
      ZXing.BarcodeFormat.ITF, ZXing.BarcodeFormat.CODABAR,
      ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.QR_CODE, ZXing.BarcodeFormat.DATA_MATRIX, ZXing.BarcodeFormat.PDF_417
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    const reader = new ZXing.MultiFormatReader();
    reader.setHints(hints);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    return async (videoEl) => {
      const w = videoEl.videoWidth, h = videoEl.videoHeight;
      if (!w || !h) return null;
      // Auf max. 1280 px Breite verkleinern – reicht für Barcodes, schont das Tablet
      const scale = Math.min(1, 1280 / w);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      try {
        const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
        const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
        return reader.decode(bitmap).getText();
      } catch (e) {
        return null; // in diesem Bild kein Barcode erkannt
      } finally {
        reader.reset();
      }
    };
  }

  async function open(onResult) {
    if (active) return;
    if (!isSupported()) {
      alert('Die Kamera ist nur über eine sichere Verbindung (HTTPS) nutzbar.');
      return;
    }
    active = true;
    buildOverlay();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', close);

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
    } catch (e) {
      console.error('Kamera konnte nicht gestartet werden:', e);
      if (!active) return;
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        setStatus('Kamerazugriff verweigert. Bitte in den Browser-Einstellungen die Kamera für diese Seite erlauben.', true);
      } else if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) {
        setStatus('Keine Kamera gefunden.', true);
      } else if (e && e.name === 'NotReadableError') {
        setStatus('Die Kamera wird gerade von einer anderen App verwendet. Bitte diese schließen und erneut versuchen.', true);
      } else {
        setStatus('Kamera konnte nicht gestartet werden.', true);
      }
      return;
    }
    if (!active) { stopCamera(); return; } // inzwischen abgebrochen

    video.srcObject = stream;
    try { await video.play(); } catch (_) { /* autoplay ist muted, sollte gehen */ }

    let detect = await createNativeDetector();
    if (!detect) {
      try {
        detect = await createZxingDetector();
      } catch (e) {
        console.error(e);
        if (active) setStatus('Barcode-Erkennung konnte nicht geladen werden.', true);
        return;
      }
    }
    if (!active) return;
    setStatus('Barcode der Depesche in den Rahmen halten');

    const tick = async () => {
      if (!active) return;
      let text = null;
      try {
        if (video && video.readyState >= 2) text = await detect(video);
      } catch (e) {
        console.warn('Fehler bei der Barcode-Erkennung:', e);
      }
      if (!active) return;
      if (text) {
        if (navigator.vibrate) navigator.vibrate(100);
        close();
        try { onResult(String(text)); } catch (e) { console.error(e); }
        return;
      }
      scanTimer = setTimeout(tick, SCAN_INTERVAL_MS);
    };
    tick();
  }

  window.BarcodeScanner = { isSupported, open, close };
})();
