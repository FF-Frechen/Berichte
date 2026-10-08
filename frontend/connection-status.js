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
  // Ein einzelner Fehlversuch löst noch kein rotes Banner aus: Beim Öffnen des
  // Browsers / Aufwachen des Tablets ist das WLAN oft ein paar Sekunden weg.
  // Erst wenn auch der Bestätigungs-Check fehlschlägt, gilt der Server als weg.
  const FAILURES_BEFORE_OFFLINE = 2;
  const CONFIRM_DELAY_MS = 3000;
  const WAKE_DELAY_MS = 2000;      // nach Aufwachen/online-Event dem WLAN Zeit geben
  const OFFLINE_RETRY_MS = 5000;   // im Offline-Zustand schneller erneut prüfen

  let online = true;               // angezeigter Status (rotes Banner nur bei false)
  let consecutiveFailures = 0;
  let failureReported = false;     // eine Seite hat einen fehlgeschlagenen Aufruf gemeldet
  let offlineSince = null;
  let banner = null;
  let hideTimer = null;
  let scheduledCheck = null;
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

  function runReconnectCallbacks() {
    reconnectCallbacks.forEach(cb => {
      try { cb(); } catch (e) { console.error('onReconnect-Callback Fehler:', e); }
    });
  }

  // Server hat geantwortet
  function handleSuccess() {
    consecutiveFailures = 0;
    clearTimeout(scheduledCheck);
    scheduledCheck = null;
    if (!online) {
      // Es war wirklich das rote Banner zu sehen → grün melden
      online = true;
      showRecovered();
      failureReported = false;
      runReconnectCallbacks();
    } else if (failureReported) {
      // Nur ein kurzer Aussetzer – kein Banner, aber ausstehende
      // Speicherungen der Seite trotzdem nachholen lassen
      failureReported = false;
      runReconnectCallbacks();
    }
  }

  // Health-Check fehlgeschlagen
  function handleFailure(reason) {
    consecutiveFailures++;
    if (consecutiveFailures >= FAILURES_BEFORE_OFFLINE) {
      online = false;
      showOffline(reason);
      scheduleCheck(OFFLINE_RETRY_MS);
    } else {
      // Erst bestätigen, bevor Alarm geschlagen wird
      scheduleCheck(CONFIRM_DELAY_MS);
    }
  }

  // Einen Check einplanen. Ein bereits geplanter Check wird nicht nach hinten
  // verschoben (sonst würde z. B. jede Eingabe den Check endlos verzögern).
  function scheduleCheck(delayMs) {
    if (scheduledCheck) return;
    scheduledCheck = setTimeout(() => {
      scheduledCheck = null;
      check();
    }, delayMs);
  }

  async function check() {
    if (checking) return;
    checking = true;
    const startedAt = Date.now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetch(`${HEALTH_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (res.ok) handleSuccess();
      else handleFailure(`Server antwortet mit Fehler ${res.status}`);
    } catch (e) {
      const elapsed = Date.now() - startedAt;
      if (e && e.name === 'AbortError' && elapsed > TIMEOUT_MS + 2000) {
        // Der Tab war eingefroren (Tablet im Standby) und der Abbruch-Timer hat
        // beim Aufwachen sofort gefeuert – das sagt nichts über den Server aus.
        scheduleCheck(WAKE_DELAY_MS);
      } else {
        handleFailure(navigator.onLine === false ? 'Tablet ist offline' : 'keine Antwort vom Server');
      }
    } finally {
      if (timer) clearTimeout(timer);
      checking = false;
    }
  }

  window.ConnectionStatus = {
    reportOk() { handleSuccess(); },
    reportFailure(reason) {
      // Ein fehlgeschlagener Aufruf der Seite ist nur ein Verdacht – der
      // Health-Check entscheidet (zweimal hintereinander fehlgeschlagen = offline).
      failureReported = true;
      if (!online && reason) showOffline(reason);
      scheduleCheck(online ? 0 : OFFLINE_RETRY_MS);
    },
    onReconnect(cb) { if (typeof cb === 'function') reconnectCallbacks.push(cb); },
    isOnline() { return online; },
    check
  };

  function init() {
    injectStyles();
    ensureBanner();
    check();
    setInterval(() => {
      // Im Hintergrund nicht prüfen – Android drosselt/friert Hintergrund-Tabs ein
      if (document.visibilityState !== 'hidden') check();
    }, POLL_INTERVAL_MS);
    window.addEventListener('online', () => scheduleCheck(WAKE_DELAY_MS));
    window.addEventListener('offline', () => scheduleCheck(CONFIRM_DELAY_MS));
    // Tablet aus dem Standby geweckt / Browser geöffnet → kurz warten, dann prüfen
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleCheck(WAKE_DELAY_MS);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
