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
    this.isEmpty = true;
    this.points = [];

    this._setupCanvas();
    this._attachEventListeners();
  }

  _setupCanvas() {
    // Setze Canvas-Hintergrund
    this.ctx.fillStyle = this.options.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Stift-Einstellungen
    this.ctx.strokeStyle = this.options.penColor;
    this.ctx.lineWidth = (this.options.minWidth + this.options.maxWidth) / 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
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
    this.canvas.addEventListener('touchend', this._handleTouchEnd.bind(this));
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
    this.isEmpty = false;
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
    this.isEmpty = false;
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
    this.points = [];
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.options.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.isEmpty = true;
  }

  toDataURL(type = 'image/png') {
    return this.canvas.toDataURL(type);
  }

  isEmpty() {
    return this.isEmpty;
  }
}

// Kompatibilität für bestehenden Code
if (typeof window !== 'undefined') {
  window.SignaturePad = SignaturePad;
}
