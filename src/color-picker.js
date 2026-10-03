/**
 * Caveman Notes - Brutalist Color Picker
 * Zero-dependency, lightweight, standalone color picker
 */

export class ColorPicker {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.hsv = { h: 0, s: 1, v: 1 };
    this.currentHex = '#141414';
    this.isOpen = false;
    this.onSelect = null;
    this.onClose = null;
    this.anchorEl = null;

    this.presets = [
      '#141414', '#ffffff', '#a18a5e', '#f0ede9',
      '#e06c75', '#ff7b72', '#d19a66', '#e5c07b',
      '#98c379', '#56b6c2', '#61afef', '#c678dd'
    ];

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.popover = document.createElement('div');
    this.popover.id = 'color-picker-popover';
    this.popover.className = 'color-picker-popover hidden';

    this.popover.innerHTML = `
      <div class="cp-header">
        <div class="cp-header-left">
          <span class="cp-preview-chip"></span>
          <span class="cp-preview-hex">#141414</span>
        </div>
        <button type="button" class="cp-close-btn" title="Close">×</button>
      </div>

      <div class="cp-sat-val-wrap">
        <div class="cp-sat-val">
          <div class="cp-sat-val-white"></div>
          <div class="cp-sat-val-black"></div>
          <div class="cp-crosshair"></div>
        </div>
      </div>

      <div class="cp-hue-slider-wrap">
        <div class="cp-hue-slider">
          <div class="cp-hue-thumb"></div>
        </div>
      </div>

      <div class="cp-presets-grid">
        ${this.presets.map(c => `<button type="button" class="cp-preset-chip" data-color="${c}" style="background-color: ${c};" title="${c}"></button>`).join('')}
      </div>

      <div class="cp-footer">
        <input type="text" class="cp-hex-input" spellcheck="false" maxlength="7" value="#141414" placeholder="#HEX" />
        <button type="button" class="cp-eyedropper-btn" title="System Eyedropper / Native Picker">⌖</button>
        <input type="color" class="cp-native-input" style="position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none;" />
        <button type="button" class="cp-apply-btn">APPLY</button>
      </div>
    `;

    this.container.appendChild(this.popover);

    this.previewChip = this.popover.querySelector('.cp-preview-chip');
    this.previewHex = this.popover.querySelector('.cp-preview-hex');
    this.closeBtn = this.popover.querySelector('.cp-close-btn');
    this.satValBox = this.popover.querySelector('.cp-sat-val');
    this.crosshair = this.popover.querySelector('.cp-crosshair');
    this.hueSlider = this.popover.querySelector('.cp-hue-slider');
    this.hueThumb = this.popover.querySelector('.cp-hue-thumb');
    this.hexInput = this.popover.querySelector('.cp-hex-input');
    this.eyedropperBtn = this.popover.querySelector('.cp-eyedropper-btn');
    this.nativeInput = this.popover.querySelector('.cp-native-input');
    this.applyBtn = this.popover.querySelector('.cp-apply-btn');
  }

  bindEvents() {
    this.closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    this.applyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    // Saturation / Value Dragging
    const handleSatVal = (e) => {
      const rect = this.satValBox.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      let x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      let y = Math.max(0, Math.min(rect.height, clientY - rect.top));

      this.hsv.s = x / rect.width;
      this.hsv.v = 1 - (y / rect.height);

      this.updateUI(true);
    };

    let isDraggingSatVal = false;
    this.satValBox.addEventListener('pointerdown', (e) => {
      isDraggingSatVal = true;
      this.satValBox.setPointerCapture(e.pointerId);
      handleSatVal(e);
    });

    this.satValBox.addEventListener('pointermove', (e) => {
      if (isDraggingSatVal) handleSatVal(e);
    });

    const stopSatVal = (e) => {
      if (isDraggingSatVal) {
        isDraggingSatVal = false;
        try { this.satValBox.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    this.satValBox.addEventListener('pointerup', stopSatVal);
    this.satValBox.addEventListener('pointercancel', stopSatVal);

    // Hue Slider Dragging
    const handleHue = (e) => {
      const rect = this.hueSlider.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      let x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      this.hsv.h = (x / rect.width) * 360;
      this.updateUI(true);
    };

    let isDraggingHue = false;
    this.hueSlider.addEventListener('pointerdown', (e) => {
      isDraggingHue = true;
      this.hueSlider.setPointerCapture(e.pointerId);
      handleHue(e);
    });

    this.hueSlider.addEventListener('pointermove', (e) => {
      if (isDraggingHue) handleHue(e);
    });

    const stopHue = (e) => {
      if (isDraggingHue) {
        isDraggingHue = false;
        try { this.hueSlider.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    this.hueSlider.addEventListener('pointerup', stopHue);
    this.hueSlider.addEventListener('pointercancel', stopHue);

    // Preset Chips
    this.popover.querySelectorAll('.cp-preset-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const color = chip.getAttribute('data-color');
        if (color) {
          this.setColor(color, true);
        }
      });
    });

    // Manual Hex Input
    this.hexInput.addEventListener('input', () => {
      let val = (this.hexInput.value || '').trim();
      if (!val) return;
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9a-fA-F]{3,6}$/.test(val)) {
        this.setColor(val, true, false);
      }
    });

    this.hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.close();
      }
    });

    // Eyedropper / Native Color Picker
    this.eyedropperBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.EyeDropper) {
        try {
          const eyeDropper = new window.EyeDropper();
          const result = await eyeDropper.open();
          if (result && result.sRGBHex) {
            this.setColor(result.sRGBHex, true);
          }
        } catch (_) {
          // Eyedropper cancelled or failed, fallback to native picker
          this.nativeInput.click();
        }
      } else {
        this.nativeInput.click();
      }
    });

    this.nativeInput.addEventListener('input', (e) => {
      this.setColor(e.target.value, true);
    });

    // Click Outside listener
    document.addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      if (this.popover && this.popover.contains(e.target)) return;
      if (this.anchorEl && typeof this.anchorEl.contains === 'function' && this.anchorEl.contains(e.target)) return;
      this.close();
    });

    // Keydown Esc listener
    document.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        this.close();
      }
    });
  }

  open({ anchorEl, anchorRect, initialColor, onSelect, onClose }) {
    this.anchorEl = (anchorEl && typeof anchorEl.contains === 'function') ? anchorEl : null;
    this.anchorRect = anchorRect || (anchorEl && typeof anchorEl.getBoundingClientRect === 'function' ? anchorEl.getBoundingClientRect() : null);
    this.onSelect = onSelect;
    this.onClose = onClose;
    this.isOpen = true;

    const startColor = initialColor && typeof initialColor === 'string' && initialColor.startsWith('#') ? initialColor : '#141414';
    this.setColor(startColor, false);

    this.popover.classList.remove('hidden');
    this.positionPopover();
  }

  positionPopover() {
    let rect = this.anchorRect;
    if (!rect && this.anchorEl && typeof this.anchorEl.getBoundingClientRect === 'function') {
      rect = this.anchorEl.getBoundingClientRect();
    }
    if (!rect) return;
    const popWidth = 252;
    const popHeight = 300;

    let left = rect.left;
    let top = (rect.bottom !== undefined ? rect.bottom : rect.top) + 6;

    // Boundary checks
    if (left + popWidth > window.innerWidth - 12) {
      left = window.innerWidth - popWidth - 12;
    }
    if (left < 12) left = 12;

    if (top + popHeight > window.innerHeight - 12) {
      // Flip above
      top = rect.top - popHeight - 6;
    }
    if (top < 12) top = 12;

    this.popover.style.left = `${Math.round(left)}px`;
    this.popover.style.top = `${Math.round(top)}px`;
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.popover.classList.add('hidden');
    if (this.onClose) {
      this.onClose(this.currentHex);
    }
  }

  setColor(hex, triggerCallback = false, updateHexInput = true) {
    if (!hex || typeof hex !== 'string') hex = '#141414';
    let cleanHex = hex.trim();
    if (!cleanHex.startsWith('#')) cleanHex = '#' + cleanHex;
    if (cleanHex.length === 4) {
      // expand #rgb to #rrggbb
      cleanHex = '#' + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2] + cleanHex[3] + cleanHex[3];
    }

    const rgb = this.hexToRgb(cleanHex);
    if (rgb) {
      this.hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
      this.currentHex = cleanHex.toUpperCase();
      this.updateUI(triggerCallback, updateHexInput);
    }
  }

  updateUI(triggerCallback = false, updateHexInput = true) {
    const rgb = this.hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v);
    this.currentHex = this.rgbToHex(rgb.r, rgb.g, rgb.b);

    // Update sat/val box background hue
    this.satValBox.style.backgroundColor = `hsl(${Math.round(this.hsv.h)}, 100%, 50%)`;

    // Update crosshair position
    const satPercent = this.hsv.s * 100;
    const valPercent = (1 - this.hsv.v) * 100;
    this.crosshair.style.left = `${satPercent}%`;
    this.crosshair.style.top = `${valPercent}%`;

    // Update hue slider thumb
    const huePercent = (this.hsv.h / 360) * 100;
    this.hueThumb.style.left = `${huePercent}%`;

    // Update chip & labels
    this.previewChip.style.backgroundColor = this.currentHex;
    this.previewHex.textContent = this.currentHex;
    if (updateHexInput && document.activeElement !== this.hexInput) {
      this.hexInput.value = this.currentHex;
    }
    this.nativeInput.value = this.currentHex;

    if (triggerCallback && this.onSelect) {
      this.onSelect(this.currentHex);
    }
  }

  // Math Helpers
  hexToRgb(hex) {
    const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return res ? {
      r: parseInt(res[1], 16),
      g: parseInt(res[2], 16),
      b: parseInt(res[3], 16)
    } : null;
  }

  rgbToHex(r, g, b) {
    const toHex = (c) => {
      const h = Math.round(c).toString(16);
      return h.length === 1 ? '0' + h : h;
    };
    return (`#${toHex(r)}${toHex(g)}${toHex(b)}`).toUpperCase();
  }

  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
      h = 0;
    } else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h, s, v };
  }

  hsvToRgb(h, s, v) {
    let r = 0, g = 0, b = 0;
    const i = Math.floor((h / 60) % 6);
    const f = (h / 60) - Math.floor(h / 60);
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }
}
