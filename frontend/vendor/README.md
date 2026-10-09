# Lokal mitgelieferte Bibliotheken

Diese Dateien liegen bewusst im Repository und werden mit dem Frontend-Container
ausgeliefert – zur Laufzeit wird nichts aus dem Internet geladen.

| Datei | Bibliothek | Version | Lizenz |
|---|---|---|---|
| `zxing.min.js` | [@zxing/library](https://github.com/zxing-js/library) (UMD-Build `umd/index.min.js`) | 0.21.3 | Apache-2.0 (`zxing.LICENSE`) |

`zxing.min.js` dient als Barcode-Erkennung für Browser ohne eingebauten
`BarcodeDetector` (siehe `../barcode-scanner.js`).
