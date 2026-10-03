/**
 * Fri-ren Notes - Vector Sketch Module (sketch.js)
 * Native, zero-dependency, high-performance vector sketching engine
 * Implements "Canvas Injection": An isolated, self-contained vector drawing canvas
 * that gets the space it needs as an opening in the editor while having zero messy
 * interactions with text editing.
 *
 * Default background is ALWAYS dark (#241f1a) for both normal and night mode,
 * with a "BG" button near the color wheel allowing users to customize background colors.
 */

export class SketchManager {
  constructor(app) {
    this.app = app;
    this.widgets = new Map(); // sketchId -> SketchWidget instance
    this.activeWidget = null;
    this.container = document.getElementById('editor-sketch-widgets');
    this.scrollPane = null;
    this.initContainer();
  }

  initContainer() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'editor-sketch-widgets';
      const wrapper = document.getElementById('editor-wrapper');
      if (wrapper) wrapper.appendChild(this.container);
    }
    let pane = this.container.querySelector('.sketch-scroll-pane');
    if (!pane) {
      pane = document.createElement('div');
      pane.className = 'sketch-scroll-pane';
      pane.style.transform = 'translate3d(0, 0, 0)';
      pane.style.willChange = 'transform';
      this.container.appendChild(pane);
    }
    this.scrollPane = pane;
  }

  getThemeBgColor() {
    return '#241f1a';
  }

  getSketchData(sketchId) {
    if (!this.app.currentNote) return null;
    if (!this.app.currentNote.sketches) {
      this.app.currentNote.sketches = {};
    }
    return this.app.currentNote.sketches[sketchId] || null;
  }

  saveSketchData(sketchId, data) {
    if (!this.app.currentNote) return;
    if (!this.app.currentNote.sketches) {
      this.app.currentNote.sketches = {};
    }
    this.app.currentNote.sketches[sketchId] = data;

    // Snapshot into history so text undo/redo preserves vector strokes and custom BG
    if (typeof this.app.pushHistory === 'function') {
      this.app.pushHistory();
    }

    // Cache SVG string in vault
    const isNight = document.body.classList.contains('night-mode');
    const svgStr = this.renderSVGString(data.width || 300, data.height || 300, data.strokes || [], isNight, data.bgColor);
    const svgDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr);
    if (this.app.vault) {
      this.app.vault.saveImage(sketchId, svgDataUrl).catch(() => {});
      this.app.vault.saveNote(this.app.currentNote).catch(() => {});
    }
  }

  parseSketchTag(tagLine) {
    if (!tagLine || typeof tagLine !== 'string') return null;
    // Matches anywhere in the line: [sketch], [sketch 300 300], [sketch:sk-123 400 300], etc.
    const m = tagLine.match(/\[sketch(?::([a-zA-Z0-9_-]+))?(?:\s+([a-zA-Z0-9_-]+))?(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+([a-zA-Z0-9_-]+))?\]/i);
    if (!m) return null;

    let id = m[1] || null;
    let width = 300;
    let height = 300;

    const tokens = [m[2], m[3], m[4], m[5]].filter(Boolean);
    const numTokens = [];
    const strTokens = [];

    for (const t of tokens) {
      if (/^\d+$/.test(t)) {
        numTokens.push(parseInt(t, 10));
      } else {
        strTokens.push(t);
      }
    }

    if (!id && strTokens.length > 0) {
      id = strTokens[0];
    }
    if (numTokens.length >= 2) {
      width = numTokens[0];
      height = numTokens[1];
    } else if (numTokens.length === 1) {
      width = numTokens[0];
      height = numTokens[0];
    }

    width = Math.max(100, Math.min(1600, width));
    height = Math.max(80, Math.min(2000, height));

    return { id, width, height };
  }

  syncWidgets(lines, lineTops) {
    if (!this.container || !this.scrollPane || !this.app.currentNote) {
      this.clearWidgets();
      return;
    }

    const activeSketchIds = new Set();
    const totalLines = lines.length;
    const lh = this.app.getLineHeight ? this.app.getLineHeight() : 24;

    for (let i = 0; i < totalLines; i++) {
      const line = lines[i];
      if (!line) continue;

      const parsed = this.parseSketchTag(line);
      if (parsed) {
        const startLine = i;
        let sketchId = parsed.id;
        if (!sketchId) {
          sketchId = 'sk-' + Math.random().toString(36).substring(2, 8);
        }

        activeSketchIds.add(sketchId);

        // Position injection row directly below the opening tag line (+ lineHeight)
        const lineTop = (lineTops ? (lineTops[startLine] || 0) : startLine * lh);
        const topPos = 32 + lineTop + lh;

        let widget = this.widgets.get(sketchId);
        if (!widget) {
          const initialData = this.getSketchData(sketchId) || {
            id: sketchId,
            width: parsed.width,
            height: parsed.height,
            bgColor: '#241f1a',
            strokes: []
          };
          widget = new SketchWidget(this, sketchId, parsed.width, parsed.height, initialData);
          this.widgets.set(sketchId, widget);
          this.scrollPane.appendChild(widget.el);
        } else {
          widget.updateDimensions(parsed.width, parsed.height);
          const savedData = this.getSketchData(sketchId);
          if (savedData) {
            if (savedData.bgColor && savedData.bgColor !== widget.bgColor) {
              widget.setBgColor(savedData.bgColor, false);
            }
            if (savedData.strokes && JSON.stringify(savedData.strokes) !== JSON.stringify(widget.strokes)) {
              widget.strokes = [...savedData.strokes];
              widget.redrawSVG();
            }
          }
        }

        widget.setPosition(topPos);
      }
    }

    // Cleanly destroy and remove DOM widgets that are no longer in the document
    for (const [id, widget] of this.widgets.entries()) {
      if (!activeSketchIds.has(id)) {
        if (this.activeWidget === widget) this.activeWidget = null;
        widget.destroy();
        this.widgets.delete(id);
      }
    }
  }

  deactivateAllExcept(activeWidget) {
    this.activeWidget = activeWidget;
    for (const widget of this.widgets.values()) {
      if (widget !== activeWidget && !widget.isBaked) {
        widget.bake();
      }
    }
  }

  bakeAll() {
    this.activeWidget = null;
    for (const widget of this.widgets.values()) {
      if (!widget.isBaked) {
        widget.bake();
      }
    }
  }

  clearWidgets() {
    this.activeWidget = null;
    for (const widget of this.widgets.values()) {
      widget.destroy();
    }
    this.widgets.clear();
    if (this.scrollPane) {
      this.scrollPane.innerHTML = '';
    }
  }

  updateTheme(isNightMode) {
    for (const widget of this.widgets.values()) {
      widget.updateTheme(isNightMode);
    }
  }

  syncScroll(scrollTop, scrollLeft) {
    if (this.scrollPane) {
      this.scrollPane.style.transform = `translate3d(${-scrollLeft}px, ${-scrollTop}px, 0)`;
    }
  }

  renderSVGString(width, height, strokes, isNightMode, customBg) {
    const bgColor = customBg || '#241f1a';
    let pathsHtml = '';

    for (const s of strokes) {
      let color = s.color;
      if (!color || color === 'theme-ink') {
        color = '#e5c07b';
      }
      const opacity = s.opacity !== undefined ? s.opacity : 1;
      const strokeWidth = s.width || 2.5;
      const d = s.d || this.pointsToPath(s.points);
      if (d) {
        pathsHtml += `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${opacity}" />`;
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color: ${bgColor}; width: 100%; height: auto; display: block; border-radius: 2px;">
      ${pathsHtml}
    </svg>`;
  }

  pointsToPath(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y}`;
    }
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      d += ` Q ${p1.x} ${p1.y}, ${mx} ${my}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
  }
}

export class SketchWidget {
  constructor(manager, sketchId, width, height, initialData) {
    this.manager = manager;
    this.sketchId = sketchId;
    this.width = width;
    this.height = height;
    this.bgColor = (initialData && initialData.bgColor) || '#241f1a';
    this.strokes = initialData && initialData.strokes ? [...initialData.strokes] : [];
    this.redoStack = [];

    // State: starts baked (dormant) by default to eliminate idle CPU overhead
    this.isBaked = true;
    this.isDrawing = false;
    this.currentPoints = [];
    this.activeTool = 'pen'; // 'pen', 'highlighter', 'eraser'
    this.activeColor = '#e5c07b'; // Crisp Altus Gold on dark background by default
    this.activeWidth = 3;
    this.colorWheelOpen = false;
    this.bgPopoverOpen = false;

    this.initDOM();
    this.initCanvas();
    this.bindEvents();
    this.redrawSVG();
    this.bake();
  }

  initDOM() {
    // Outer injection row wrapper: covers full editor line width with pointer-events: auto
    // so no click or caret can ever bleed through into the textarea opening!
    this.el = document.createElement('div');
    this.el.className = 'sketch-injection-row';
    this.el.style.height = `${this.height + 64}px`;

    // Inner card widget containing the canvas, header, toolbar and popover
    this.card = document.createElement('div');
    this.card.className = 'sketch-widget-card sketch-widget-block baked';
    this.card.style.width = `${this.width + 4}px`;

    this.card.innerHTML = `
      <div class="sketch-widget-header">
        <div class="sketch-widget-title">
          <span class="sketch-dot"></span>
          <button type="button" class="sketch-status-badge" title="Click to draw or edit">✎ DORMANT</button>
        </div>
        <div class="sketch-header-actions">
          <button type="button" class="sketch-btn sketch-undo-btn hidden" title="Undo (Ctrl+Z)">↶</button>
          <button type="button" class="sketch-btn sketch-redo-btn hidden" title="Redo (Ctrl+Y)">↷</button>
          <button type="button" class="sketch-btn sketch-clear-btn hidden" title="Clear Sketch">🗑</button>
          <button type="button" class="sketch-btn sketch-bake-btn hidden" title="Bake & Finish">✔ BAKE</button>
          <button type="button" class="sketch-btn sketch-copy-btn" title="Copy SVG">⤓</button>
        </div>
      </div>

      <div class="sketch-canvas-container" style="width: ${this.width}px; height: ${this.height}px; background-color: ${this.bgColor};">
        <svg class="sketch-svg-layer" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" style="width: 100%; height: 100%; display: block; background-color: ${this.bgColor};"></svg>
        <canvas class="sketch-active-canvas hidden" width="${this.width}" height="${this.height}" style="width: 100%; height: 100%; display: block;"></canvas>
        <div class="sketch-baked-overlay" title="Click to edit sketch"></div>
      </div>

      <div class="sketch-widget-toolbar hidden">
        <div class="sketch-tools-group">
          <button type="button" class="sketch-tool-btn active" data-tool="pen" title="Ink Pen">✒ Ink</button>
          <button type="button" class="sketch-tool-btn" data-tool="highlighter" title="Highlighter">🖌 Highlight</button>
          <button type="button" class="sketch-tool-btn" data-tool="eraser" title="Eraser">⌫ Erase</button>
        </div>

        <div class="sketch-sizes-group">
          <button type="button" class="sketch-size-btn" data-size="1.5" title="Fine (1.5px)"><span class="size-dot dot-sm"></span></button>
          <button type="button" class="sketch-size-btn active" data-size="3" title="Medium (3px)"><span class="size-dot dot-md"></span></button>
          <button type="button" class="sketch-size-btn" data-size="6" title="Thick (6px)"><span class="size-dot dot-lg"></span></button>
          <button type="button" class="sketch-size-btn" data-size="12" title="Marker (12px)"><span class="size-dot dot-xl"></span></button>
        </div>

        <div class="sketch-palette-group">
          <button type="button" class="sketch-swatch-chip active" data-color="#e5c07b" style="background-color: #e5c07b;" title="Altus Gold (Default Ink)"></button>
          <button type="button" class="sketch-swatch-chip" data-color="#d4af37" style="background-color: #d4af37;" title="Elden Gold"></button>
          <button type="button" class="sketch-swatch-chip" data-color="#e06c75" style="background-color: #e06c75;" title="Crimson"></button>
          <button type="button" class="sketch-swatch-chip" data-color="#61afef" style="background-color: #61afef;" title="Magic Blue"></button>
          <button type="button" class="sketch-swatch-chip" data-color="#98c379" style="background-color: #98c379;" title="Poison Green"></button>
          <button type="button" class="sketch-swatch-chip" data-color="#ffffff" style="background-color: #ffffff; border: 1px solid #777;" title="White"></button>
          
          <button type="button" class="sketch-color-wheel-btn" title="Color Wheel & Custom Picker">
            <span class="color-wheel-icon"></span>
          </button>

          <!-- BG Color Button -->
          <button type="button" class="sketch-bg-btn" title="Canvas Background Color">
            <span class="sketch-bg-preview" style="background-color: ${this.bgColor};"></span>
            <span class="sketch-bg-label">BG</span>
          </button>
        </div>
      </div>

      <!-- Circular Color Wheel Popover (for Ink) -->
      <div class="sketch-wheel-popover hidden">
        <div class="wheel-popover-header">
          <span>INK COLOR</span>
          <button type="button" class="wheel-close-btn">×</button>
        </div>
        <div class="wheel-canvas-wrap">
          <canvas class="wheel-disc-canvas" width="130" height="130"></canvas>
          <div class="wheel-disc-pin"></div>
        </div>
        <div class="wheel-slider-wrap">
          <label>LIGHTNESS</label>
          <input type="range" class="wheel-val-slider" min="0" max="100" value="100" />
        </div>
        <div class="wheel-footer">
          <span class="wheel-preview-chip"></span>
          <input type="text" class="wheel-hex-input" maxlength="7" value="${this.activeColor}" />
          <button type="button" class="wheel-apply-btn">OK</button>
        </div>
      </div>

      <!-- Background Color Popover -->
      <div class="sketch-bg-popover hidden">
        <div class="wheel-popover-header">
          <span>CANVAS BACKGROUND</span>
          <button type="button" class="bg-popover-close-btn">×</button>
        </div>
        <div class="bg-presets-label">PRESET BACKGROUNDS</div>
        <div class="bg-presets-grid">
          <button type="button" class="bg-swatch-chip ${this.bgColor === '#241f1a' ? 'active' : ''}" data-bg="#241f1a" style="background-color: #241f1a;" title="Dark Coffee (Default)"></button>
          <button type="button" class="bg-swatch-chip ${this.bgColor === '#1c1814' ? 'active' : ''}" data-bg="#1c1814" style="background-color: #1c1814;" title="Deep Workspace"></button>
          <button type="button" class="bg-swatch-chip ${this.bgColor === '#2e2821' ? 'active' : ''}" data-bg="#2e2821" style="background-color: #2e2821;" title="Bark Paper"></button>
          <button type="button" class="bg-swatch-chip ${this.bgColor === '#141414' ? 'active' : ''}" data-bg="#141414" style="background-color: #141414;" title="Pitch Black"></button>
          <button type="button" class="bg-swatch-chip ${this.bgColor === '#E4E3E0' ? 'active' : ''}" data-bg="#E4E3E0" style="background-color: #E4E3E0;" title="Parchment Light"></button>
          <button type="button" class="bg-swatch-chip ${this.bgColor === '#f0ede9' ? 'active' : ''}" data-bg="#f0ede9" style="background-color: #f0ede9;" title="Linen Gray"></button>
          <button type="button" class="bg-swatch-chip ${this.bgColor === '#ffffff' ? 'active' : ''}" data-bg="#ffffff" style="background-color: #ffffff; border: 1px solid #777;" title="Pure White"></button>
          <button type="button" class="bg-swatch-chip ${this.bgColor === '#1e293b' ? 'active' : ''}" data-bg="#1e293b" style="background-color: #1e293b;" title="Slate"></button>
        </div>
        <div class="wheel-canvas-wrap">
          <canvas class="bg-disc-canvas" width="130" height="130"></canvas>
          <div class="bg-disc-pin"></div>
        </div>
        <div class="wheel-slider-wrap">
          <label>LIGHTNESS</label>
          <input type="range" class="bg-val-slider" min="0" max="100" value="15" />
        </div>
        <div class="wheel-footer">
          <span class="bg-preview-chip" style="background-color: ${this.bgColor};"></span>
          <input type="text" class="bg-hex-input" maxlength="7" value="${this.bgColor}" />
          <button type="button" class="bg-apply-btn">OK</button>
        </div>
      </div>
    `;

    this.el.appendChild(this.card);

    // Prevent clicks inside the card from reaching the underlying textarea
    this.card.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    this.card.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    this.canvasContainer = this.card.querySelector('.sketch-canvas-container');
    this.svgLayer = this.card.querySelector('.sketch-svg-layer');
    this.activeCanvas = this.card.querySelector('.sketch-active-canvas');
    this.ctx = this.activeCanvas.getContext('2d');
    this.bakedOverlay = this.card.querySelector('.sketch-baked-overlay');
    this.statusBadge = this.card.querySelector('.sketch-status-badge');
    this.toolbar = this.card.querySelector('.sketch-widget-toolbar');

    this.undoBtn = this.card.querySelector('.sketch-undo-btn');
    this.redoBtn = this.card.querySelector('.sketch-redo-btn');
    this.clearBtn = this.card.querySelector('.sketch-clear-btn');
    this.bakeBtn = this.card.querySelector('.sketch-bake-btn');

    // Ink Wheel elements
    this.wheelPopover = this.card.querySelector('.sketch-wheel-popover');
    this.wheelCanvas = this.card.querySelector('.wheel-disc-canvas');
    this.wheelPin = this.card.querySelector('.wheel-disc-pin');
    this.wheelSlider = this.card.querySelector('.wheel-val-slider');
    this.wheelPreviewChip = this.card.querySelector('.wheel-preview-chip');
    this.wheelHexInput = this.card.querySelector('.wheel-hex-input');

    // BG elements
    this.bgBtn = this.card.querySelector('.sketch-bg-btn');
    this.bgBtnPreview = this.card.querySelector('.sketch-bg-preview');
    this.bgPopover = this.card.querySelector('.sketch-bg-popover');
    this.bgCanvas = this.card.querySelector('.bg-disc-canvas');
    this.bgPin = this.card.querySelector('.bg-disc-pin');
    this.bgSlider = this.card.querySelector('.bg-val-slider');
    this.bgPreviewChip = this.card.querySelector('.bg-preview-chip');
    this.bgHexInput = this.card.querySelector('.bg-hex-input');

    this.initWheelDisc();
    this.initBgDisc();
  }

  initCanvas() {
    this.activeCanvas.width = this.width;
    this.activeCanvas.height = this.height;
    this.svgLayer.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svgLayer.setAttribute('width', this.width);
    this.svgLayer.setAttribute('height', this.height);
  }

  setPosition(top) {
    this.el.style.top = `${top}px`;
  }

  updateDimensions(width, height) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.el.style.height = `${this.height + 64}px`;
    if (this.card) {
      this.card.style.width = `${this.width + 4}px`;
    }
    if (this.canvasContainer) {
      this.canvasContainer.style.width = `${this.width}px`;
      this.canvasContainer.style.height = `${this.height}px`;
    }
    this.initCanvas();
    this.redrawSVG();
  }

  updateTheme(isNightMode) {
    // Dark background and gold ink remain preserved regardless of overall app theme
    this.redrawSVG();
  }

  activate() {
    if (!this.isBaked) return;
    this.manager.deactivateAllExcept(this);
    this.isBaked = false;

    this.card.classList.remove('baked');
    this.card.classList.add('active-editing');
    if (this.bakedOverlay) this.bakedOverlay.style.display = 'none';
    if (this.activeCanvas) {
      this.activeCanvas.style.display = 'block';
      this.activeCanvas.classList.remove('hidden');
    }
    this.toolbar.classList.remove('hidden');
    this.undoBtn.classList.remove('hidden');
    this.redoBtn.classList.remove('hidden');
    this.clearBtn.classList.remove('hidden');
    this.bakeBtn.classList.remove('hidden');

    this.statusBadge.textContent = '● ACTIVE';
    this.statusBadge.classList.add('badge-active');

    this.initCanvas();
    this.redrawSVG();
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  bake() {
    if (this.isBaked) return;
    this.isBaked = true;

    this.closeWheelPopover();
    this.closeBgPopover();
    this.card.classList.add('baked');
    this.card.classList.remove('active-editing');
    if (this.bakedOverlay) this.bakedOverlay.style.display = 'flex';
    if (this.activeCanvas) {
      this.activeCanvas.style.display = 'none';
      this.activeCanvas.classList.add('hidden');
    }
    this.toolbar.classList.add('hidden');
    this.undoBtn.classList.add('hidden');
    this.redoBtn.classList.add('hidden');
    this.clearBtn.classList.add('hidden');
    this.bakeBtn.classList.add('hidden');

    this.statusBadge.textContent = '✎ DORMANT';
    this.statusBadge.classList.remove('badge-active');

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.redrawSVG();
    this.save();
  }

  initWheelDisc() {
    if (!this.wheelCanvas) return;
    const wCtx = this.wheelCanvas.getContext('2d');
    const size = 130;
    const radius = size / 2;
    const imgData = wCtx.createImageData(size, size);
    const data = imgData.data;

    const val = parseInt(this.wheelSlider.value, 10) / 100;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - radius;
        const dy = y - radius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;

        if (dist <= radius) {
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;
          const sat = dist / radius;

          const rgb = this.hsvToRgb(angle, sat, val);
          data[idx] = rgb.r;
          data[idx + 1] = rgb.g;
          data[idx + 2] = rgb.b;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    wCtx.putImageData(imgData, 0, 0);
  }

  initBgDisc() {
    if (!this.bgCanvas) return;
    const wCtx = this.bgCanvas.getContext('2d');
    const size = 130;
    const radius = size / 2;
    const imgData = wCtx.createImageData(size, size);
    const data = imgData.data;

    const val = parseInt(this.bgSlider.value, 10) / 100;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - radius;
        const dy = y - radius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;

        if (dist <= radius) {
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;
          const sat = dist / radius;

          const rgb = this.hsvToRgb(angle, sat, val);
          data[idx] = rgb.r;
          data[idx + 1] = rgb.g;
          data[idx + 2] = rgb.b;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    wCtx.putImageData(imgData, 0, 0);
  }

  hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
    else if (h >= 300 && h < 360) { r = c; g = 0; b = x; }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  bindEvents() {
    // Single click activation from dormant mode
    this.bakedOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      this.activate();
    });

    // Toggle button in header
    this.statusBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isBaked) {
        this.activate();
      } else {
        this.bake();
      }
    });

    this.bakeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.bake();
    });

    // Tool buttons
    this.card.querySelectorAll('.sketch-tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.card.querySelectorAll('.sketch-tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTool = btn.dataset.tool;
      });
    });

    // Size buttons
    this.card.querySelectorAll('.sketch-size-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.card.querySelectorAll('.sketch-size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeWidth = parseFloat(btn.dataset.size);
      });
    });

    // Swatches (Ink)
    this.card.querySelectorAll('.sketch-swatch-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        this.card.querySelectorAll('.sketch-swatch-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.setColor(chip.dataset.color);
      });
    });

    // Ink Color Wheel Button
    const wheelBtn = this.card.querySelector('.sketch-color-wheel-btn');
    wheelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeBgPopover();
      this.toggleWheelPopover();
    });

    const wheelClose = this.card.querySelector('.wheel-close-btn');
    wheelClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeWheelPopover();
    });

    const wheelApply = this.card.querySelector('.wheel-apply-btn');
    wheelApply.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setColor(this.wheelHexInput.value);
      this.closeWheelPopover();
    });

    this.wheelSlider.addEventListener('input', () => {
      this.initWheelDisc();
    });

    this.wheelHexInput.addEventListener('input', () => {
      let hex = (this.wheelHexInput.value || '').trim();
      if (!hex) return;
      if (!hex.startsWith('#')) hex = '#' + hex;
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        this.wheelPreviewChip.style.backgroundColor = hex;
      }
    });

    // Ink wheel disc click / drag
    let draggingWheel = false;
    const handleWheelDisc = (e) => {
      const rect = this.wheelCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const radius = 130 / 2;
      const x = clientX - rect.left - radius;
      const y = clientY - rect.top - radius;

      const dist = Math.min(radius, Math.sqrt(x * x + y * y));
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      const sat = dist / radius;
      const val = parseInt(this.wheelSlider.value, 10) / 100;
      const rgb = this.hsvToRgb(angle, sat, val);
      const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);

      const pinX = radius + Math.cos(angle * Math.PI / 180) * dist;
      const pinY = radius + Math.sin(angle * Math.PI / 180) * dist;
      this.wheelPin.style.left = `${pinX}px`;
      this.wheelPin.style.top = `${pinY}px`;
      this.wheelPin.style.display = 'block';

      this.wheelPreviewChip.style.backgroundColor = hex;
      this.wheelHexInput.value = hex;
    };

    this.wheelCanvas.addEventListener('pointerdown', (e) => {
      draggingWheel = true;
      this.wheelCanvas.setPointerCapture(e.pointerId);
      handleWheelDisc(e);
    });
    this.wheelCanvas.addEventListener('pointermove', (e) => {
      if (draggingWheel) handleWheelDisc(e);
    });
    const stopWheel = (e) => {
      if (draggingWheel) {
        draggingWheel = false;
        try { this.wheelCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    this.wheelCanvas.addEventListener('pointerup', stopWheel);
    this.wheelCanvas.addEventListener('pointercancel', stopWheel);

    // BG Button & Popover Events
    if (this.bgBtn) {
      this.bgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeWheelPopover();
        this.toggleBgPopover();
      });
    }

    const bgClose = this.card.querySelector('.bg-popover-close-btn');
    if (bgClose) {
      bgClose.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeBgPopover();
      });
    }

    // BG preset swatch buttons
    this.card.querySelectorAll('.bg-swatch-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedBg = chip.dataset.bg;
        if (selectedBg) {
          this.setBgColor(selectedBg);
        }
      });
    });

    const bgApply = this.card.querySelector('.bg-apply-btn');
    if (bgApply) {
      bgApply.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setBgColor(this.bgHexInput.value);
        this.closeBgPopover();
      });
    }

    if (this.bgSlider) {
      this.bgSlider.addEventListener('input', () => {
        this.initBgDisc();
      });
    }

    if (this.bgHexInput) {
      this.bgHexInput.addEventListener('input', () => {
        let hex = (this.bgHexInput.value || '').trim();
        if (!hex) return;
        if (!hex.startsWith('#')) hex = '#' + hex;
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
          this.bgPreviewChip.style.backgroundColor = hex;
        }
      });
    }

    // BG wheel disc click / drag
    let draggingBgWheel = false;
    const handleBgDisc = (e) => {
      const rect = this.bgCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const radius = 130 / 2;
      const x = clientX - rect.left - radius;
      const y = clientY - rect.top - radius;

      const dist = Math.min(radius, Math.sqrt(x * x + y * y));
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      const sat = dist / radius;
      const val = parseInt(this.bgSlider.value, 10) / 100;
      const rgb = this.hsvToRgb(angle, sat, val);
      const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);

      const pinX = radius + Math.cos(angle * Math.PI / 180) * dist;
      const pinY = radius + Math.sin(angle * Math.PI / 180) * dist;
      this.bgPin.style.left = `${pinX}px`;
      this.bgPin.style.top = `${pinY}px`;
      this.bgPin.style.display = 'block';

      this.bgPreviewChip.style.backgroundColor = hex;
      this.bgHexInput.value = hex;
    };

    if (this.bgCanvas) {
      this.bgCanvas.addEventListener('pointerdown', (e) => {
        draggingBgWheel = true;
        this.bgCanvas.setPointerCapture(e.pointerId);
        handleBgDisc(e);
      });
      this.bgCanvas.addEventListener('pointermove', (e) => {
        if (draggingBgWheel) handleBgDisc(e);
      });
      const stopBgWheel = (e) => {
        if (draggingBgWheel) {
          draggingBgWheel = false;
          try { this.bgCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      this.bgCanvas.addEventListener('pointerup', stopBgWheel);
      this.bgCanvas.addEventListener('pointercancel', stopBgWheel);
    }

    // Canvas pointer events for drawing
    this.activeCanvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onPointerDown(e);
    });
    this.activeCanvas.addEventListener('pointermove', (e) => {
      e.stopPropagation();
      this.onPointerMove(e);
    });
    this.activeCanvas.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      this.onPointerUp(e);
    });
    this.activeCanvas.addEventListener('pointercancel', (e) => {
      e.stopPropagation();
      this.onPointerUp(e);
    });

    // Header Actions
    this.undoBtn.addEventListener('click', (e) => { e.stopPropagation(); this.undo(); });
    this.redoBtn.addEventListener('click', (e) => { e.stopPropagation(); this.redo(); });
    this.clearBtn.addEventListener('click', (e) => { e.stopPropagation(); this.clear(); });
    this.card.querySelector('.sketch-copy-btn').addEventListener('click', (e) => { e.stopPropagation(); this.copySVG(); });
  }

  setColor(hex) {
    if (!hex || typeof hex !== 'string') {
      hex = '#e5c07b';
    }
    if (!hex.startsWith('#')) hex = '#' + hex;
    this.activeColor = hex;
    if (this.wheelPreviewChip) this.wheelPreviewChip.style.backgroundColor = hex;
    if (this.wheelHexInput) this.wheelHexInput.value = hex;

    let found = false;
    this.card.querySelectorAll('.sketch-swatch-chip').forEach(c => {
      const chipColor = c.dataset.color || '';
      if (chipColor.toLowerCase() === hex.toLowerCase()) {
        c.classList.add('active');
        found = true;
      } else {
        c.classList.remove('active');
      }
    });

    const wheelIcon = this.card.querySelector('.color-wheel-icon');
    if (wheelIcon && !found) {
      wheelIcon.style.borderColor = hex;
    }
  }

  setBgColor(hex, shouldSave = true) {
    if (!hex || typeof hex !== 'string') {
      hex = '#241f1a';
    }
    if (!hex.startsWith('#')) hex = '#' + hex;
    this.bgColor = hex;

    if (this.canvasContainer) this.canvasContainer.style.backgroundColor = hex;
    if (this.svgLayer) this.svgLayer.style.backgroundColor = hex;
    if (this.bgPreviewChip) this.bgPreviewChip.style.backgroundColor = hex;
    if (this.bgBtnPreview) this.bgBtnPreview.style.backgroundColor = hex;
    if (this.bgHexInput) this.bgHexInput.value = hex;

    this.card.querySelectorAll('.bg-swatch-chip').forEach(c => {
      const chipBg = c.dataset.bg || '';
      if (chipBg.toLowerCase() === hex.toLowerCase()) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    this.redrawSVG();
    if (shouldSave) {
      this.save();
    }
  }

  toggleWheelPopover() {
    this.colorWheelOpen = !this.colorWheelOpen;
    this.wheelPopover.classList.toggle('hidden', !this.colorWheelOpen);
    if (this.colorWheelOpen) {
      this.initWheelDisc();
      this.wheelPreviewChip.style.backgroundColor = this.activeColor;
      this.wheelHexInput.value = this.activeColor;
    }
  }

  closeWheelPopover() {
    this.colorWheelOpen = false;
    if (this.wheelPopover) this.wheelPopover.classList.add('hidden');
  }

  toggleBgPopover() {
    this.bgPopoverOpen = !this.bgPopoverOpen;
    if (this.bgPopover) this.bgPopover.classList.toggle('hidden', !this.bgPopoverOpen);
    if (this.bgPopoverOpen) {
      this.initBgDisc();
      if (this.bgPreviewChip) this.bgPreviewChip.style.backgroundColor = this.bgColor;
      if (this.bgHexInput) this.bgHexInput.value = this.bgColor;
    }
  }

  closeBgPopover() {
    this.bgPopoverOpen = false;
    if (this.bgPopover) this.bgPopover.classList.add('hidden');
  }

  getPointerPos(e) {
    const rect = this.activeCanvas.getBoundingClientRect();
    const scaleX = this.width / (rect.width || this.width);
    const scaleY = this.height / (rect.height || this.height);
    return {
      x: Math.max(0, Math.min(this.width, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(this.height, (e.clientY - rect.top) * scaleY))
    };
  }

  onPointerDown(e) {
    if (this.isBaked) {
      this.activate();
    }
    if (e.button !== 0) return;
    this.isDrawing = true;
    try { this.activeCanvas.setPointerCapture(e.pointerId); } catch (_) {}

    const pos = this.getPointerPos(e);

    if (this.activeTool === 'eraser') {
      this.eraseAt(pos.x, pos.y);
      return;
    }

    this.currentPoints = [pos];
    this.redoStack = [];

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawCurrentActiveStroke();
  }

  onPointerMove(e) {
    if (!this.isDrawing || this.isBaked) return;
    const pos = this.getPointerPos(e);

    if (this.activeTool === 'eraser') {
      this.eraseAt(pos.x, pos.y);
      return;
    }

    const last = this.currentPoints[this.currentPoints.length - 1];
    if (last) {
      const dist = Math.hypot(pos.x - last.x, pos.y - last.y);
      if (dist < 2) return;
    }

    this.currentPoints.push(pos);
    this.drawCurrentActiveStroke();
  }

  onPointerUp(e) {
    if (!this.isDrawing || this.isBaked) return;
    this.isDrawing = false;
    try { this.activeCanvas.releasePointerCapture(e.pointerId); } catch (_) {}

    if (this.activeTool === 'eraser') return;

    if (this.currentPoints.length > 0) {
      const d = this.manager.pointsToPath(this.currentPoints);
      const isHighlighter = this.activeTool === 'highlighter';

      const stroke = {
        d,
        points: this.currentPoints,
        color: this.activeColor,
        width: isHighlighter ? this.activeWidth * 3.5 : this.activeWidth,
        opacity: isHighlighter ? 0.35 : 1,
        tool: this.activeTool
      };

      this.strokes.push(stroke);
      this.currentPoints = [];
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.redrawSVG();
      this.save();
    }
  }

  eraseAt(x, y) {
    const threshold = this.activeWidth * 4;
    const beforeCount = this.strokes.length;

    this.strokes = this.strokes.filter(stroke => {
      if (!stroke.points) return true;
      for (const p of stroke.points) {
        if (Math.hypot(p.x - x, p.y - y) <= threshold) {
          return false;
        }
      }
      return true;
    });

    if (this.strokes.length !== beforeCount) {
      this.redrawSVG();
      this.save();
    }
  }

  drawCurrentActiveStroke() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    if (this.currentPoints.length === 0) return;

    const isHighlighter = this.activeTool === 'highlighter';
    const width = isHighlighter ? this.activeWidth * 3.5 : this.activeWidth;
    const opacity = isHighlighter ? 0.35 : 1;

    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.activeColor;
    this.ctx.lineWidth = width;
    this.ctx.globalAlpha = opacity;

    if (this.currentPoints.length === 1) {
      this.ctx.beginPath();
      this.ctx.arc(this.currentPoints[0].x, this.currentPoints[0].y, width / 2, 0, Math.PI * 2);
      this.ctx.fillStyle = this.activeColor;
      this.ctx.fill();
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(this.currentPoints[0].x, this.currentPoints[0].y);

      for (let i = 1; i < this.currentPoints.length - 1; i++) {
        const p1 = this.currentPoints[i];
        const p2 = this.currentPoints[i + 1];
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        this.ctx.quadraticCurveTo(p1.x, p1.y, mx, my);
      }

      const last = this.currentPoints[this.currentPoints.length - 1];
      this.ctx.lineTo(last.x, last.y);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  redrawSVG() {
    let pathsHtml = '';

    for (const s of this.strokes) {
      let color = s.color;
      if (!color || color === 'theme-ink') {
        color = '#e5c07b';
      }
      const opacity = s.opacity !== undefined ? s.opacity : 1;
      const strokeWidth = s.width || 2.5;
      const d = s.d || this.manager.pointsToPath(s.points);
      if (d) {
        pathsHtml += `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${opacity}" />`;
      }
    }

    const currentBg = this.bgColor || '#241f1a';
    this.svgLayer.innerHTML = pathsHtml;
    this.svgLayer.style.backgroundColor = currentBg;
    if (this.canvasContainer) {
      this.canvasContainer.style.backgroundColor = currentBg;
    }
  }

  undo() {
    if (this.strokes.length === 0) return;
    const stroke = this.strokes.pop();
    this.redoStack.push(stroke);
    if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
    this.redrawSVG();
    this.save();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const stroke = this.redoStack.pop();
    this.strokes.push(stroke);
    if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
    this.redrawSVG();
    this.save();
  }

  clear() {
    if (this.strokes.length === 0) return;
    this.redoStack = [...this.strokes];
    this.strokes = [];
    if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
    this.redrawSVG();
    this.save();
  }

  async copySVG() {
    const isNight = document.body.classList.contains('night-mode');
    const svgStr = this.manager.renderSVGString(this.width, this.height, this.strokes, isNight, this.bgColor);
    try {
      await navigator.clipboard.writeText(svgStr);
      if (this.manager.app.statusMessenger) {
        this.manager.app.statusMessenger.show('SVG copied to clipboard');
      }
    } catch (_) {}
  }

  save() {
    this.manager.saveSketchData(this.sketchId, {
      id: this.sketchId,
      width: this.width,
      height: this.height,
      bgColor: this.bgColor,
      strokes: this.strokes
    });
  }

  destroy() {
    this.closeWheelPopover();
    this.closeBgPopover();
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
