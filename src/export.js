export class ExportMenu {
  constructor(app) {
    this.app = app;
    this.modal = null;
    this.aspectRatio = 1;
    this.baseW = 800;
    this.baseH = 600;
    this.bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    this.currentFormat = 'png';
  }

  init() {
    if (document.getElementById('canvas-export-menu')) {
      this.modal = document.getElementById('canvas-export-menu');
      return;
    }
    this.injectHTML();
    this.bindEvents();
  }

  injectHTML() {
    if (document.getElementById('canvas-export-menu')) return;

    const overlay = document.createElement('div');
    overlay.id = 'canvas-export-menu';
    overlay.className = 'overlay hidden';
    overlay.innerHTML = `
      <style>
        #canvas-export-menu .overlay-content {
          position: relative;
          width: 440px;
          max-width: 90vw;
          background: var(--bg-main);
          color: var(--text-primary);
          border: 3px solid var(--text-primary);
          box-shadow: 10px 10px 0px #000;
          padding: 32px;
          font-family: var(--font-sans);
          box-sizing: border-box;
        }
        #canvas-export-menu .overlay-content h3 {
          border-bottom: 2px solid var(--text-primary);
          padding-bottom: 8px;
          margin-bottom: 24px;
          margin-top: 0;
          font-weight: 800;
          font-size: 1.1rem;
        }
        #canvas-export-menu .export-close-btn {
          position: absolute;
          top: 16px;
          right: 20px;
          font-size: 26px;
          font-weight: 800;
          cursor: pointer;
          border: none;
          background: transparent;
          line-height: 1;
          padding: 4px;
          color: var(--text-primary);
          transition: transform 0.1s;
        }
        #canvas-export-menu .export-close-btn:hover {
          transform: scale(1.2);
        }
        #canvas-export-menu .control-group {
          margin-bottom: 20px;
        }
        #canvas-export-menu .control-group > label {
          display: block;
          font-size: 10px;
          font-weight: 800;
          margin-bottom: 6px;
          opacity: 0.7;
          text-transform: uppercase;
        }
        #canvas-export-menu input[type="number"] {
          width: 100%;
          box-sizing: border-box;
          padding: 10px;
          border: 2px solid var(--text-primary);
          background: var(--bg-workspace);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 13px;
          outline: none;
          border-radius: 0;
          -moz-appearance: textfield; /* Firefox */
        }
        #canvas-export-menu input[type="number"]::-webkit-outer-spin-button,
        #canvas-export-menu input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none; /* Chrome, Safari, Edge, Opera */
          margin: 0;
        }
        #canvas-export-menu #export-bounds-info {
          font-family: var(--font-mono);
          font-size: 11px;
          margin-bottom: 8px;
          border: 2px solid var(--text-primary);
          padding: 10px;
          background: var(--bg-workspace);
          color: var(--text-primary);
          line-height: 1.4;
        }
        #canvas-export-menu .zoom-btn {
          flex: 1;
          text-align: center;
          height: 32px;
          font-size: 11px;
          font-weight: 800;
          border: 2px solid var(--text-primary);
          background: var(--bg-main);
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.1s;
          border-radius: 0;
          text-transform: uppercase;
        }
        #canvas-export-menu .zoom-btn.active {
          background: var(--text-primary);
          color: var(--bg-main);
        }
        #canvas-export-menu .zoom-btn:hover {
          opacity: 0.9;
        }
        #canvas-export-menu #export-confirm-btn {
          width: 100%;
          padding: 12px;
          border: 2px solid var(--text-primary);
          background: var(--text-primary);
          color: var(--bg-main);
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
          box-shadow: 4px 4px 0 #000;
          font-family: var(--font-sans);
          transition: all 0.1s;
          letter-spacing: 1px;
          text-transform: uppercase;
          border-radius: 0;
        }
        #canvas-export-menu #export-confirm-btn:hover {
          transform: translate(-2px, -2px);
          box-shadow: 6px 6px 0 #000;
        }
        #canvas-export-menu #export-confirm-btn:active {
          transform: translate(0px, 0px);
          box-shadow: 2px 2px 0 #000;
        }
        #canvas-export-menu input[type="checkbox"] {
          background: var(--bg-workspace);
        }
        #canvas-export-menu input[type="checkbox"]:checked {
          background: var(--text-primary) !important;
        }
        #canvas-export-menu input[type="checkbox"]:checked::after {
          content: 'X';
          color: var(--bg-main) !important;
        }
        body.night-mode #canvas-export-menu input[type="checkbox"]:checked::after {
          color: #1c1814 !important;
        }
      </style>

      <div class="overlay-content">
        <button class="export-close-btn" id="export-close-btn" title="Close">&times;</button>
        <h3>EXPORT CANVAS (.PNG)</h3>
        
        <div class="control-group">
          <label>MAP BOUNDS</label>
          <div id="export-bounds-info">
            Calculating...
          </div>
        </div>

        <div class="control-group">
          <label>PADDING AROUND BOUNDS (PX)</label>
          <input type="number" id="export-padding" value="40" min="0" max="500" />
        </div>

        <div class="control-group">
          <label>RESOLUTION PRESET</label>
          <div class="btn-row" style="display: flex; gap: 8px;">
            <button id="preset-1x" class="zoom-btn">1x</button>
            <button id="preset-2x" class="zoom-btn active">2x</button>
            <button id="preset-4x" class="zoom-btn">4x</button>
            <button id="preset-8x" class="zoom-btn">8x</button>
          </div>
        </div>

        <div class="control-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label>WIDTH (PX)</label>
            <input type="number" id="export-width" />
          </div>
          <div>
            <label>HEIGHT (PX)</label>
            <input type="number" id="export-height" />
          </div>
        </div>

        <div class="control-group">
          <label class="checkbox-container" style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 11px;">
            <input type="checkbox" id="export-lock-aspect" checked />
            <span>Keep Aspect Ratio</span>
          </label>
        </div>

        <div class="control-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <label class="checkbox-container" style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 11px;">
            <input type="checkbox" id="export-transparent" />
            <span>Transparent BG</span>
          </label>
          <label class="checkbox-container" style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 11px;">
            <input type="checkbox" id="export-grid" />
            <span>Include Grid</span>
          </label>
        </div>

        <div class="control-group" style="margin-bottom: 16px;">
          <label>FORMAT</label>
          <div class="btn-row" style="display: flex; gap: 8px;">
            <button id="format-png" class="zoom-btn active">PNG</button>
            <button id="format-jpg" class="zoom-btn">JPEG</button>
          </div>
        </div>

        <div class="control-group" id="jpeg-quality-group" style="display: none; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label style="margin: 0;">JPEG QUALITY</label>
            <span id="export-quality-val" style="font-family: var(--font-mono); font-size: 11px; font-weight: bold;">0.95</span>
          </div>
          <input type="range" id="export-quality" min="0.1" max="1.0" step="0.05" value="0.95" style="width: 100%; accent-color: var(--text-primary);" />
        </div>

        <div style="display: flex; justify-content: center; margin-top: 24px;">
          <button id="export-confirm-btn">EXPORT IMAGE</button>
        </div>
      </div>
    `;

    document.getElementById('app').appendChild(overlay);
    this.modal = overlay;
  }

  bindEvents() {
    const closeBtn = this.modal.querySelector('#export-close-btn');
    const confirmBtn = this.modal.querySelector('#export-confirm-btn');
    const widthInput = this.modal.querySelector('#export-width');
    const heightInput = this.modal.querySelector('#export-height');
    const lockCheck = this.modal.querySelector('#export-lock-aspect');
    const paddingInput = this.modal.querySelector('#export-padding');
    const transparentCheck = this.modal.querySelector('#export-transparent');
    const gridCheck = this.modal.querySelector('#export-grid');
    const qualityInput = this.modal.querySelector('#export-quality');
    const qualityVal = this.modal.querySelector('#export-quality-val');
    const qualityGroup = this.modal.querySelector('#jpeg-quality-group');

    // Preset buttons
    const presets = {
      '1': this.modal.querySelector('#preset-1x'),
      '2': this.modal.querySelector('#preset-2x'),
      '4': this.modal.querySelector('#preset-4x'),
      '8': this.modal.querySelector('#preset-8x')
    };

    // Format buttons
    const formatPng = this.modal.querySelector('#format-png');
    const formatJpg = this.modal.querySelector('#format-jpg');

    closeBtn.addEventListener('click', () => this.close());
    
    // Close on clicking outside content
    this.modal.addEventListener('mousedown', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // Padding input change updates bounds and scale
    paddingInput.addEventListener('input', () => {
      this.recalculateDimensions();
    });

    // Preset selection
    Object.entries(presets).forEach(([multStr, btn]) => {
      btn.addEventListener('click', () => {
        Object.values(presets).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const mult = parseFloat(multStr);
        widthInput.value = Math.round(this.baseW * mult);
        heightInput.value = Math.round(this.baseH * mult);
      });
    });

    // Custom width / height input with ratio lock
    widthInput.addEventListener('input', () => {
      Object.values(presets).forEach(b => b.classList.remove('active'));
      if (lockCheck.checked && this.aspectRatio) {
        heightInput.value = Math.round(parseFloat(widthInput.value || 0) / this.aspectRatio);
      }
    });

    heightInput.addEventListener('input', () => {
      Object.values(presets).forEach(b => b.classList.remove('active'));
      if (lockCheck.checked && this.aspectRatio) {
        widthInput.value = Math.round(parseFloat(heightInput.value || 0) * this.aspectRatio);
      }
    });

    // Transparency toggles grid options (optional but useful warning)
    transparentCheck.addEventListener('change', () => {
      if (transparentCheck.checked && this.currentFormat === 'jpg') {
        // JPEG doesn't support transparency!
        transparentCheck.checked = false;
        alert("JPEG format does not support transparency. Select PNG to enable transparent background.");
      }
    });

    // Format switching
    formatPng.addEventListener('click', () => {
      formatPng.classList.add('active');
      formatJpg.classList.remove('active');
      this.currentFormat = 'png';
      qualityGroup.style.display = 'none';
      this.modal.querySelector('h3').textContent = 'EXPORT CANVAS (.PNG)';
    });

    formatJpg.addEventListener('click', () => {
      formatJpg.classList.add('active');
      formatPng.classList.remove('active');
      this.currentFormat = 'jpg';
      qualityGroup.style.display = 'block';
      transparentCheck.checked = false; // JPEGs can't be transparent
      this.modal.querySelector('h3').textContent = 'EXPORT CANVAS (.JPEG)';
    });

    qualityInput.addEventListener('input', () => {
      qualityVal.textContent = qualityInput.value;
    });

    confirmBtn.addEventListener('click', () => this.executeExport());
  }

  open() {
    this.init(); // Make sure it's injected
    this.recalculateDimensions();
    this.modal.classList.remove('hidden');
    
    // Default preset 2x
    this.modal.querySelector('#preset-2x').click();
  }

  close() {
    if (this.modal) {
      this.modal.classList.add('hidden');
    }
  }

  recalculateDimensions() {
    const canvasModule = this.app.canvasModule;
    if (!canvasModule) return;

    const boxes = canvasModule.boxes || [];
    const padding = parseInt(this.modal.querySelector('#export-padding').value || 0, 10);

    if (boxes.length === 0) {
      this.bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      this.baseW = 800;
      this.baseH = 600;
      this.aspectRatio = 800 / 600;
      
      this.modal.querySelector('#export-bounds-info').innerHTML = 
        `No boxes found on canvas.<br/>Using default grid bounds: 800 x 600 px`;
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    boxes.forEach(box => {
      const shadow = 4;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w + shadow);
      maxY = Math.max(maxY, box.y + box.h + shadow);
    });

    // Apply padding
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const w = maxX - minX;
    const h = maxY - minY;

    this.bounds = { minX, minY, maxX, maxY };
    this.baseW = w;
    this.baseH = h;
    this.aspectRatio = w / h;

    this.modal.querySelector('#export-bounds-info').innerHTML = 
      `Map Extent: [${Math.round(minX)}, ${Math.round(minY)}] to [${Math.round(maxX)}, ${Math.round(maxY)}]<br/>` +
      `Original Size (with padding): <strong>${Math.round(w)} x ${Math.round(h)} px</strong> (Aspect: ${this.aspectRatio.toFixed(2)})`;

    // Update custom inputs to reflect current original
    const widthInput = this.modal.querySelector('#export-width');
    const heightInput = this.modal.querySelector('#export-height');
    
    // Find active multiplier preset button if any
    const activePresetBtn = this.modal.querySelector('.btn-row .zoom-btn.active');
    if (activePresetBtn) {
      let mult = 2;
      if (activePresetBtn.id === 'preset-1x') mult = 1;
      else if (activePresetBtn.id === 'preset-4x') mult = 4;
      else if (activePresetBtn.id === 'preset-8x') mult = 8;
      
      widthInput.value = Math.round(w * mult);
      heightInput.value = Math.round(h * mult);
    } else {
      // Keep ratio if custom edits exist
      if (this.modal.querySelector('#export-lock-aspect').checked) {
        heightInput.value = Math.round(parseFloat(widthInput.value || 0) / this.aspectRatio);
      }
    }
  }

  executeExport() {
    const canvasModule = this.app.canvasModule;
    if (!canvasModule) return;

    const exportW = parseInt(this.modal.querySelector('#export-width').value || 0, 10);
    const exportH = parseInt(this.modal.querySelector('#export-height').value || 0, 10);

    if (exportW <= 0 || exportH <= 0) {
      alert("Invalid custom dimensions specified.");
      return;
    }

    const transparent = this.modal.querySelector('#export-transparent').checked;
    const includeGrid = this.modal.querySelector('#export-grid').checked;
    const quality = parseFloat(this.modal.querySelector('#export-quality').value || 0.95);

    // Create offscreen canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportW;
    exportCanvas.height = exportH;
    const ctx = exportCanvas.getContext('2d');

    const isNight = document.body.classList.contains('night-mode');
    const mainColor = isNight ? '#a18a5e' : '#1c1814';
    const bgBox = isNight ? '#1c1814' : '#fff';
    const shadowColor = isNight ? '#a18a5e' : '#000';

    // 1. Draw Background
    if (!transparent) {
      ctx.fillStyle = isNight ? '#14110e' : '#fdfdfd';
      ctx.fillRect(0, 0, exportW, exportH);
    } else {
      ctx.clearRect(0, 0, exportW, exportH);
    }

    // Scale ratio from original bounds to exported size
    const scale = exportW / this.baseW;
    const { minX, minY, maxX, maxY } = this.bounds;

    // 2. Optional Grid
    if (includeGrid) {
      ctx.strokeStyle = isNight ? 'rgba(161, 138, 94, 0.15)' : 'rgba(0,0,0,0.06)';
      ctx.lineWidth = Math.max(0.5, 1 * scale);
      ctx.beginPath();
      const gridSize = 40;
      
      const startGridX = Math.floor(minX / gridSize) * gridSize;
      const startGridY = Math.floor(minY / gridSize) * gridSize;
      
      for (let xCoord = startGridX; xCoord <= maxX; xCoord += gridSize) {
        const px = (xCoord - minX) * scale;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, exportH);
      }
      for (let yCoord = startGridY; yCoord <= maxY; yCoord += gridSize) {
        const py = (yCoord - minY) * scale;
        ctx.moveTo(0, py);
        ctx.lineTo(exportW, py);
      }
      ctx.stroke();
    }

    // 3. Draw Arrows (Connections)
    const arrows = canvasModule.arrows || [];
    const boxes = canvasModule.boxes || [];

    arrows.forEach(arrow => {
      const from = boxes.find(b => b.id === arrow.from);
      const to = boxes.find(b => b.id === arrow.to);
      if (from && to) {
        const { start, end } = canvasModule.getArrowAnchors(from, to);
        if (start && end) {
          ctx.strokeStyle = mainColor;
          ctx.lineWidth = 1.5 * scale;
          ctx.beginPath();
          ctx.moveTo((start.x - minX) * scale, (start.y - minY) * scale);

          const dist = Math.hypot(end.x - start.x, end.y - start.y);
          const bend = Math.min(dist / 2, 40);

          const alignedX = Math.abs(start.x - end.x) < 5;
          const alignedY = Math.abs(start.y - end.y) < 5;

          if (alignedX || alignedY) {
            ctx.lineTo((end.x - minX) * scale, (end.y - minY) * scale);
          } else {
            const cp1x = start.x + start.dir.x * bend;
            const cp1y = start.y + start.dir.y * bend;
            const cp2x = end.x + end.dir.x * bend;
            const cp2y = end.y + end.dir.y * bend;
            ctx.bezierCurveTo(
              (cp1x - minX) * scale, (cp1y - minY) * scale,
              (cp2x - minX) * scale, (cp2y - minY) * scale,
              (end.x - minX) * scale, (end.y - minY) * scale
            );
          }
          ctx.stroke();

          // Arrow head
          const angle = Math.atan2(
            end.y - (alignedY || alignedX ? start.y : (end.y + end.dir.y * bend)),
            end.x - (alignedY || alignedX ? start.x : (end.x + end.dir.x * bend))
          );
          const headlen = 10 * scale;
          ctx.beginPath();
          ctx.moveTo((end.x - minX) * scale, (end.y - minY) * scale);
          ctx.lineTo(
            (end.x - minX) * scale - headlen * Math.cos(angle - Math.PI / 6),
            (end.y - minY) * scale - headlen * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo((end.x - minX) * scale, (end.y - minY) * scale);
          ctx.lineTo(
            (end.x - minX) * scale - headlen * Math.cos(angle + Math.PI / 6),
            (end.y - minY) * scale - headlen * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
      }
    });

    // 4. Draw Boxes (Cards)
    boxes.forEach(box => {
      const shadowOffset = 4;
      const x = (box.x - minX) * scale;
      const y = (box.y - minY) * scale;
      const w = box.w * scale;
      const h = box.h * scale;

      // Brutalist Shadow
      ctx.fillStyle = shadowColor;
      ctx.fillRect(x + shadowOffset * scale, y + shadowOffset * scale, w, h);

      // Card Base Box
      ctx.fillStyle = bgBox;
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2 * scale;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      // Color Tint Overlay
      if (box.color) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = isNight ? 1.0 : 0.15;
        ctx.fillStyle = box.color;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
      }

      // Image attachment
      if (box.image && box._imgLoaded && box._imgCached) {
        ctx.drawImage(box._imgCached, x + 2 * scale, y + 2 * scale, w - 4 * scale, h - 4 * scale);
      }

      // Headers (Emoji / Custom Title)
      const hasHeader = box.emoji || box.customTitle;
      const headerHeight = 22;
      if (hasHeader) {
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.moveTo(x, y + headerHeight * scale);
        ctx.lineTo(x + w, y + headerHeight * scale);
        ctx.stroke();

        ctx.save();
        ctx.fillStyle = mainColor;
        ctx.font = `800 ${10 * scale}px "Inter", sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        let headerText = '';
        if (box.emoji) headerText += box.emoji + ' ';
        if (box.customTitle) headerText += box.customTitle;
        ctx.fillText(headerText, x + 8 * scale, y + (headerHeight / 2) * scale);
        ctx.restore();
      }

      // Multiline Text
      ctx.save();
      ctx.fillStyle = mainColor;
      ctx.font = `800 ${12 * scale}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const rawText = box.text || '';
      const lines = rawText.split(/\r?\n|\\n|<br\s*\/?>/i);

      const remainingHeight = box.h - (hasHeader ? headerHeight : 0) - (box.linkedNote ? 16 : 0);
      const centerY = box.y + (hasHeader ? headerHeight : 0) + remainingHeight / 2;

      const lineHeight = 16;
      const totalTextHeight = lines.length * lineHeight;

      lines.forEach((line, index) => {
        let displayText = line;
        if (box.linkedNote && index === lines.length - 1) {
          displayText += ' 🔗';
        }
        const lineY = centerY - (totalTextHeight - lineHeight) / 2 + index * lineHeight;
        ctx.fillText(displayText, x + w / 2, (lineY - minY) * scale);
      });
      ctx.restore();

      // Linked note bracket reference at bottom
      if (box.linkedNote) {
        ctx.save();
        ctx.font = `italic ${9 * scale}px monospace`;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = mainColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`[[${box.linkedNote}]]`, x + w / 2, y + h - 8 * scale);
        ctx.restore();
      }
    });

    // 5. Trigger download
    const noteName = this.app.currentNote ? this.app.currentNote.title : 'Canvas';
    const cleanNoteName = noteName.toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
    const filename = `${cleanNoteName}_canvas.${this.currentFormat}`;

    let dataUrl;
    if (this.currentFormat === 'jpg') {
      dataUrl = exportCanvas.toDataURL('image/jpeg', quality);
    } else {
      dataUrl = exportCanvas.toDataURL('image/png');
    }

    const downloadLink = document.createElement('a');
    downloadLink.href = dataUrl;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    this.close();
  }
}
