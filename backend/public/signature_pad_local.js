/**
 * Simple Canvas-based Signature Pad
 * Offline-fähige Alternative zu signature_pad Library
 * Keine externen Abhängigkeiten
 */

class SignaturePad {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = {
      backgroundColor: options.backgroundColor || 'rgb(255, 255, 255)',
      penColor: options.penColor || 'rgb(0, 0, 0)',
      minWidth: options.minWidth || 0.5,
      maxWidth: options.maxWidth || 2.5
    };

    this.isDrawing = false;
    this._isEmpty = true;
    this.points = [];
    this.strokes = []; // Speichert alle Strokes für toData/fromData

    this._setupCanvas();
    this._attachEventListeners();
  }

  _setupCanvas() {
    // Setze Canvas-Hintergrund
    this.ctx.fillStyle = this.options.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Stift-Einstellungen
    this._applyPenStyle();
  }

  _attachEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', this._handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this._handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this._handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this._handleMouseUp.bind(this));

    // Touch events für mobile Geräte
    this.canvas.addEventListener('touchstart', this._handleTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this._handleTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this._handleTouchEnd.bind(this), { passive: false });
    this.canvas.addEventListener('touchcancel', this._handleTouchEnd.bind(this), { passive: false });
  }

  _applyPenStyle() {
    this.ctx.strokeStyle = this.options.penColor;
    this.ctx.lineWidth = (this.options.minWidth + this.options.maxWidth) / 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  _getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  _getTouchPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const touch = e.touches[0];
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }

  _handleMouseDown(e) {
    e.preventDefault();
    this.isDrawing = true;
    this._isEmpty = false;
    const pos = this._getMousePos(e);
    this._startStroke(pos);
  }

  _handleMouseMove(e) {
    if (!this.isDrawing) return;
    e.preventDefault();
    const pos = this._getMousePos(e);
    this._drawPoint(pos);
  }

  _handleMouseUp(e) {
    if (!this.isDrawing) return;
    e.preventDefault();
    this.isDrawing = false;
    this._endStroke();
  }

  _handleTouchStart(e) {
    e.preventDefault();
    this.isDrawing = true;
    this._isEmpty = false;
    const pos = this._getTouchPos(e);
    this._startStroke(pos);
  }

  _handleTouchMove(e) {
    if (!this.isDrawing) return;
    e.preventDefault();
    const pos = this._getTouchPos(e);
    this._drawPoint(pos);
  }

  _handleTouchEnd(e) {
    if (!this.isDrawing) return;
    e.preventDefault();
    this.isDrawing = false;
    this._endStroke();
  }

  _startStroke(point) {
    this.ctx.beginPath();
    this.ctx.moveTo(point.x, point.y);
    this.points = [point];
  }

  _drawPoint(point) {
    this.ctx.lineTo(point.x, point.y);
    this.ctx.stroke();
    this.points.push(point);
  }

  _endStroke() {
    // Speichere den aktuellen Stroke
    if (this.points.length > 0) {
      this.strokes.push([...this.points]);
    }
    this.points = [];
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.options.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // Stift-Stil nach Resize/Reset wiederherstellen, sonst zeichnet der nächste
    // Strich mit Default-Werten (dünn, kantig).
    this._applyPenStyle();
    this._isEmpty = true;
    this.strokes = [];
  }

  toDataURL(type = 'image/png') {
    return this.canvas.toDataURL(type);
  }

  fromDataURL(dataURL) {
    // Lädt eine gespeicherte Unterschrift als Bild ins Canvas zurück.
    // Kompatibel zur signature_pad-Library-API.
    return new Promise((resolve, reject) => {
      if (!dataURL) {
        this.clear();
        resolve();
        return;
      }

      const image = new Image();
      image.onload = () => {
        this.clear();
        // clear() setzt _isEmpty=true und leert strokes – wir markieren das Pad
        // wieder als nicht leer, damit saveSignature() nicht abbricht.
        this._isEmpty = false;
        this.ctx.drawImage(
          image,
          0,
          0,
          this.canvas.width,
          this.canvas.height
        );
        // Stift-Stil nach drawImage wiederherstellen für nachfolgende Striche
        this._applyPenStyle();
        resolve();
      };
      image.onerror = (err) => {
        // Fehler beim Laden nicht eskalieren – Modal bleibt nutzbar, Pad bleibt leer.
        console.warn('SignaturePad.fromDataURL: Bild konnte nicht geladen werden', err);
        this.clear();
        resolve();
      };
      image.src = dataURL;
    });
  }

  isEmpty() {
    return this._isEmpty;
  }

  toData() {
    // Gibt alle Strokes zurück (kompatibel mit signature_pad Library)
    return this.strokes.map(stroke => ({
      points: stroke,
      penColor: this.options.penColor,
      minWidth: this.options.minWidth,
      maxWidth: this.options.maxWidth
    }));
  }

  fromData(data) {
    // Zeichnet gespeicherte Strokes (kompatibel mit signature_pad Library)
    if (!data || data.length === 0) return;

    this.clear();
    this._isEmpty = false;

    data.forEach(strokeData => {
      const points = strokeData.points || strokeData;

      if (points.length === 0) return;

      this.ctx.beginPath();
      this.ctx.moveTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length; i++) {
        this.ctx.lineTo(points[i].x, points[i].y);
      }

      this.ctx.stroke();

      // Speichere Stroke auch in this.strokes
      this.strokes.push([...points]);
    });
  }
}

// Kompatibilität für bestehenden Code
if (typeof window !== 'undefined') {
  window.SignaturePad = SignaturePad;
}
