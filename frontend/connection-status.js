/**
 * Verbindungsstatus-Anzeige
 *
 * Wird von nginx ausgeliefert (nicht vom Backend), damit die Anzeige auch dann
 * funktioniert, wenn nur das Backend ausgefallen ist. Zeigt ein rotes Banner,
 * sobald der Server nicht erreichbar ist – vorher sah man auf dem Tablet nichts,
 * weil die Seite aus dem Cache kam und Speicherfehler verschluckt wurden.
 *
 * API für die Seiten:
 *   ConnectionStatus.reportOk()            – ein Server-Aufruf war erfolgreich
 *   ConnectionStatus.reportFailure(reason) – ein Server-Aufruf ist fehlgeschlagen
 *   ConnectionStatus.onReconnect(cb)       – cb wird nach Wiederverbindung aufgerufen
 *   ConnectionStatus.isOnline()            – letzter bekannter Status
 */
(function () {
  const HEALTH_URL = '/api/health';
  const POLL_INTERVAL_MS = 15000;
  const TIMEOUT_MS = 5000;
  const RECOVERED_SHOW_MS = 4000;

  let online = true;
  let offlineSince = null;
  let banner = null;
  let hideTimer = null;
  let checking = false;
  const reconnectCallbacks = [];

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .connection-banner {
        position: fixed; top: 0; left: 0; right: 0; z-index: 10000;
        padding: 12px 16px; text-align: center; font-weight: bold; font-size: 16px;
        color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: none;
      }
      .connection-banner.offline { display: block; background-color: #d62828; }
      .connection-banner.recovered { display: block; background-color: #198754; }
      .connection-banner small { display: block; font-weight: normal; font-size: 13px; margin-top: 2px; }
      body.connection-offline { padding-top: 64px; }
      /* Speicher-Hinweis (Doku-Seite) nicht unter dem Banner verstecken */
      body.connection-offline .save-notification { top: 80px; }
      @media print { .connection-banner { display: none !important; } }
    `;
    document.head.appendChild(style);
  }

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.className = 'connection-banner';
    banner.setAttribute('role', 'alert');
    document.body.appendChild(banner);
    return banner;
  }

  function showOffline(reason) {
    const b = ensureBanner();
    clearTimeout(hideTimer);
    b.className = 'connection-banner offline';
    b.textContent = '⚠ Server nicht erreichbar – Eingaben werden NICHT auf dem Server gespeichert';
    const small = document.createElement('small');
    if (!offlineSince) offlineSince = new Date();
    const time = offlineSince.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    small.textContent = `Seit ${time}${reason ? ' · ' + reason : ''} – bitte WLAN/Server prüfen, nicht neu laden`;
    b.appendChild(small);
    document.body.classList.add('connection-offline');
  }

  function showRecovered() {
    const b = ensureBanner();
    b.className = 'connection-banner recovered';
    b.textContent = '✓ Verbindung wiederhergestellt';
    offlineSince = null;
    document.body.classList.remove('connection-offline');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { b.className = 'connection-banner'; }, RECOVERED_SHOW_MS);
  }

  function setOnline(value, reason) {
    if (value === online) {
      // Offline-Text trotzdem aktualisieren (neuer Grund)
      if (!value && reason) showOffline(reason);
      return;
    }
    online = value;
    if (!value) {
      showOffline(reason);
    } else {
      showRecovered();
      reconnectCallbacks.forEach(cb => {
        try { cb(); } catch (e) { console.error('onReconnect-Callback Fehler:', e); }
      });
    }
  }

  async function check() {
    if (checking) return;
    checking = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetch(`${HEALTH_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (res.ok) setOnline(true);
      else setOnline(false, `Server antwortet mit Fehler ${res.status}`);
    } catch (e) {
      setOnline(false, navigator.onLine === false ? 'Tablet ist offline' : 'keine Antwort vom Server');
    } finally {
      if (timer) clearTimeout(timer);
      checking = false;
    }
  }

  window.ConnectionStatus = {
    reportOk() { setOnline(true); },
    reportFailure(reason) {
      setOnline(false, reason);
      // Sofort gegenprüfen – ein einzelner Fehler kann auch ein Server-Fehler
      // bei intaktem Netz sein; der Health-Check entscheidet.
      check();
    },
    onReconnect(cb) { if (typeof cb === 'function') reconnectCallbacks.push(cb); },
    isOnline() { return online; },
    check
  };

  function init() {
    injectStyles();
    ensureBanner();
    check();
    setInterval(check, POLL_INTERVAL_MS);
    window.addEventListener('online', check);
    window.addEventListener('offline', () => setOnline(false, 'Tablet ist offline'));
    // Tablet aus dem Standby geweckt → sofort prüfen
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
