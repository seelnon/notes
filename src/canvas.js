export class CanvasLite {
  constructor(canvasContainerId, onChangeCallback) {
    this.container = document.getElementById(canvasContainerId);
    this.canvas = document.getElementById('canvas-lite');
    this.ctx = this.canvas.getContext('2d');
    this.onChange = onChangeCallback;
    
    this.boxes = [];
    this.arrows = [];
    this.isDragging = false;
    this.isResizing = false;
    this.isPanning = false;
    this.dragTarget = null;
    this.offset = { x: 0, y: 0 };
    
    this.viewport = { x: 0, y: 0, scale: 1 };
    this.panningWithSpace = false;
    this.lastMousePos = { x: 0, y: 0 };
    
    this.mode = 'select'; // 'select', 'panning', 'connecting', 'marquee'
    this.selectedBox = null;
    this.selectedBoxes = [];
    this.marqueeStart = null;
    this.marqueeEnd = null;
    this.lastCanvasMousePos = { x: 0, y: 0 };
    this.selectedArrow = null;
    this.connectingFrom = null;
    this.tempConnectionEnd = null;
    this.editingBox = null;
    this.activePeeks = new Map(); // boxId -> peekElement

    this.toolbar = document.getElementById('canvas-toolbar');
    this.inlineEditor = document.getElementById('canvas-inline-editor');
    this.peeksLayer = document.getElementById('canvas-peeks-layer');
    this.boxInput = document.getElementById('canvas-box-input');
    this.boxLink = document.getElementById('canvas-box-link');
    this.peekTemplate = document.getElementById('canvas-peek-window'); // Keep reference to old one as template
    this.peekClose = document.getElementById('peek-close'); // This might be used for template close btn

    this.history = [];
    this.historyIndex = -1;

    this.init();
    this.saveHistory(false); 
  }

  getData() {
    return {
      boxes: this.boxes.map(b => ({
        id: b.id,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        text: b.text || "",
        linkedNote: b.linkedNote || null,
        image: typeof b.image === "string" ? b.image : null,
        color: b.color || null,
        emoji: b.emoji || null,
        customTitle: b.customTitle || null
      })),
      arrows: this.arrows.map(a => ({
        from: a.from,
        to: a.to
      })),
      viewport: {
        x: this.viewport.x,
        y: this.viewport.y,
        scale: this.viewport.scale
      }
    };
  }

  setData(data) {
    this.currentSessionId = Date.now();
    this.closeAllPeeks();
    this.selectedBox = null;
    this.selectedBoxes = [];
    this.selectedArrow = null;
    this.editingBox = null;
    this.inlineEditor.classList.add('hidden');
    this.updateToolbarPos();

    if (!data) {
      this.boxes = [];
      this.arrows = [];
      this.viewport = { x: 0, y: 0, scale: 1 };
    } else {
      this.boxes = (data.boxes || []).map(b => ({
        ...b,
        color: b.color || null,
        emoji: b.emoji || null,
        customTitle: b.customTitle || null
      }));
      this.arrows = data.arrows || [];
      this.viewport = data.viewport || { x: 0, y: 0, scale: 1 };
    }
    
    // Clear image cache when setting new data
    this.boxes.forEach(b => {
      b._imgCached = null;
      b._imgLoaded = false;
    });

    this.history = [];
    this.historyIndex = -1;
    this.saveHistory(false);
    this.render();
  }

  saveHistory(shouldTriggerChange = true) {
    const data = this.getData();
    const state = JSON.stringify({
      boxes: data.boxes,
      arrows: data.arrows
    });

    if (this.historyIndex >= 0 && this.history[this.historyIndex] === state) return;

    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(state);
    this.historyIndex++;
    
    if (this.history.length > 50) {
      this.history.shift();
      this.historyIndex--;
    }

    if (shouldTriggerChange && this.onChange) {
      this.onChange(data);
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.applyState(this.history[this.historyIndex]);
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.applyState(this.history[this.historyIndex]);
    }
  }

  applyState(json) {
    const state = JSON.parse(json);
    this.boxes = state.boxes;
    this.arrows = state.arrows;
    this.selectedBox = null;
    this.selectedBoxes = [];
    this.selectedArrow = null;
    this.closeEditor();
    this.closeAllPeeks();
    this.render();

    // Notify app of history changes (Undo/Redo)
    if (this.onChange) {
      this.onChange(this.getData());
    }
  }

  init() {
    window.addEventListener('resize', () => this.onResize());
    this.onResize();

    if (document.fonts) {
      document.fonts.ready.then(() => {
        this.render();
      });
      document.fonts.addEventListener('loadingdone', () => {
        this.render();
      });
    }
    
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    
    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.handleMouseDown(this.touchToMouse(e.touches[0]));
      } else if (e.touches.length === 2) {
        this.lastPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const rect = this.canvas.getBoundingClientRect();
        this.pinchCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        };
      }
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        this.handleMouseMove(this.touchToMouse(e.touches[0]));
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / this.lastPinchDist;
        this.lastPinchDist = dist;
        
        const newScale = Math.min(Math.max(0.1, this.viewport.scale * factor), 5);
        this.viewport.x = this.pinchCenter.x - (this.pinchCenter.x - this.viewport.x) * (newScale / this.viewport.scale);
        this.viewport.y = this.pinchCenter.y - (this.pinchCenter.y - this.viewport.y) * (newScale / this.viewport.scale);
        this.viewport.scale = newScale;
        
        this.render();
      }
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      this.handleMouseUp(null);
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeEditor();
        this.closeAllPeeks();
      }

      // Undo / Redo
      const isZ = e.key.toLowerCase() === 'z';
      if ((e.ctrlKey || e.metaKey) && isZ) {
        if (e.shiftKey || e.key === 'Z') { // Shift+Z or Ctrl+Y often used for Redo
          this.redo();
        } else {
          this.undo();
        }
        e.preventDefault();
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        this.redo();
        e.preventDefault();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.editingBox) return; 
        if (this.selectedBox) this.deleteSelectedBox();
        else if (this.selectedArrow) this.deleteSelectedArrow();
      }
      if (e.code === 'Space') {
        this.panningWithSpace = true;
        this.canvas.style.cursor = 'grab';
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.panningWithSpace = false;
        this.canvas.style.cursor = 'crosshair';
      }
    });

    window.addEventListener('paste', (e) => this.handlePaste(e));
    window.addEventListener('copy', (e) => this.handleCopy(e));

    document.getElementById('canvas-add-box').addEventListener('click', () => this.addBox());
    document.getElementById('canvas-add-image').addEventListener('click', () => this.triggerImageUpload());
    
    // Toolbar buttons
    document.getElementById('toolbar-delete').addEventListener('click', () => this.deleteSelectedBox());
    document.getElementById('toolbar-rename').addEventListener('click', () => this.openEditor(this.selectedBox));
    document.getElementById('toolbar-peek').addEventListener('click', () => this.peekLink(this.selectedBox));

    // Editor events
    this.boxInput.addEventListener('input', () => {
      if (this.editingBox) {
        this.editingBox.text = this.boxInput.value;
        this.render();
      }
    });
    this.boxLink.addEventListener('input', () => {
      if (this.editingBox) {
        this.editingBox.linkedNote = this.boxLink.value;
        this.render();
      }
    });
    
    const emojiInput = document.getElementById('canvas-box-emoji');
    if (emojiInput) {
      emojiInput.addEventListener('input', () => {
        if (this.editingBox) {
          this.editingBox.emoji = emojiInput.value.trim() || null;
          this.render();
        }
      });
    }

    const titleInput = document.getElementById('canvas-box-title');
    if (titleInput) {
      titleInput.addEventListener('input', () => {
        if (this.editingBox) {
          this.editingBox.customTitle = titleInput.value.trim() || null;
          this.render();
        }
      });
    }

    this.canvasPalette = document.getElementById('canvas-palette');

    this.render();
  }

  handlePaste(e) {
    // If we are typing in an input or textarea (like the editor), don't trigger canvas paste
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    // Only handle if canvas is likely active view
    if (window.app && window.app.viewMode !== 'canvas') return;

    // 1. Try to handle Box Paste (JSON payload)
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      try {
        const payload = JSON.parse(text);
        if (payload && payload.type === 'caveman-canvas-box') {
          const data = payload.data;
          // Offset the new box slightly from current selection if possible
          const newBox = {
            id: Date.now(),
            x: this.selectedBox ? this.selectedBox.x + 20 : (this.canvas.width/2 - this.viewport.x)/this.viewport.scale - data.w/2,
            y: this.selectedBox ? this.selectedBox.y + 20 : (this.canvas.height/2 - this.viewport.y)/this.viewport.scale - data.h/2,
            w: data.w,
            h: data.h,
            text: data.text,
            linkedNote: data.linkedNote,
            image: data.image
          };
          this.boxes.push(newBox);
          this.selectedBox = newBox;
          this.saveHistory();
          this.render();
          e.preventDefault();
          return;
        }
      } catch(err) {
        // Not a box payload
      }
    }

    // 2. Try to handle Image Paste
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const sessionIdOnStart = this.currentSessionId;
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          if (this.currentSessionId !== sessionIdOnStart) return; 

          if (this.selectedBox) {
            this.selectedBox.image = event.target.result;
            this.saveHistory();
            this.render();
          } else {
            this.addBox(event.target.result);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  }

  handleCopy(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (window.app && window.app.viewMode !== 'canvas') return;
    if (!this.selectedBox) return;

    const boxData = {
      type: 'caveman-canvas-box',
      data: {
        w: this.selectedBox.w,
        h: this.selectedBox.h,
        text: this.selectedBox.text,
        linkedNote: this.selectedBox.linkedNote,
        image: this.selectedBox.image
      }
    };

    e.clipboardData.setData('text/plain', JSON.stringify(boxData));
    e.preventDefault();
  }

  triggerImageUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target.result;
          if (this.selectedBox) {
            this.selectedBox.image = dataUrl;
            this.saveHistory();
            this.render();
          } else {
            this.addBox(dataUrl);
          }
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }

  peekLink(box) {
    if (!box || !box.linkedNote) return;
    if (this.activePeeks.has(box.id)) {
      this.closePeek(box.id);
      return;
    }

    const notes = window.app?.notes || [];
    const note = notes.find(n => n.title === box.linkedNote);
    
    const peek = document.createElement('div');
    peek.className = 'canvas-peek-window';
    peek.innerHTML = `
      <div class="peek-header">
        <span class="peek-title">${box.linkedNote}</span>
        <button class="peek-close">×</button>
      </div>
      <div class="peek-content markdown-body"></div>
    `;

    const closeBtn = peek.querySelector('.peek-close');
    const content = peek.querySelector('.peek-content');
    
    closeBtn.onclick = () => this.closePeek(box.id);
    
    this.peeksLayer.appendChild(peek);
    this.activePeeks.set(box.id, peek);
    
    if (note) {
      if (window.marked && window.app?.editorModule) {
        window.app.editorModule.processMarkdown(note.content).then(html => {
          content.innerHTML = html;
          
          if (window.app && window.app.loadLazyImage) {
            content.querySelectorAll('.lazy-vault-img').forEach(img => {
              window.app.loadLazyImage(img);
            });
          }
          this.updatePeekPos(); 
        });
      } else {
        content.innerText = note.content;
      }
    } else {
      content.innerHTML = `<p><i>Note not found: "${box.linkedNote}"</i></p>`;
    }
    
    this.updatePeekPos();
  }

  closePeek(boxId) {
    const peek = this.activePeeks.get(boxId);
    if (peek) {
      peek.remove();
      this.activePeeks.delete(boxId);
    }
  }

  closeAllPeeks() {
    this.activePeeks.forEach((peek) => peek.remove());
    this.activePeeks.clear();
  }

  updatePeekPos() {
    if (this.peeksLayer) {
      this.peeksLayer.style.transform = `translate(${this.viewport.x}px, ${this.viewport.y}px) scale(${this.viewport.scale})`;
    }

    this.activePeeks.forEach((peek, boxId) => {
      const box = this.boxes.find(b => b.id === boxId);
      if (!box) {
        this.closePeek(boxId);
        return;
      }

      // Position in RAW canvas coordinates (the layer handles viewport transform)
      let targetX = box.x + box.w + 10;
      let targetY = box.y;
      
      // We don't flip for screen space here because the layer is zoomed
      // but we could still check boundaries if we wanted.
      
      peek.style.left = `${targetX}px`;
      peek.style.top = `${targetY}px`;
    });
  }

  openEditor(box) {
    if (!box) return;
    this.editingBox = box;
    this.inlineEditor.classList.remove('hidden');
    this.boxInput.value = box.text;
    this.boxLink.value = box.linkedNote || '';
    
    const emojiInput = document.getElementById('canvas-box-emoji');
    const titleInput = document.getElementById('canvas-box-title');
    if (emojiInput) emojiInput.value = box.emoji || '';
    if (titleInput) titleInput.value = box.customTitle || '';

    this.updateEditorPos();
    this.boxInput.focus();
  }

  closeEditor() {
    if (this.editingBox) {
      const emojiInput = document.getElementById('canvas-box-emoji');
      const titleInput = document.getElementById('canvas-box-title');
      if (emojiInput) this.editingBox.emoji = emojiInput.value.trim() || null;
      if (titleInput) this.editingBox.customTitle = titleInput.value.trim() || null;
      this.editingBox.text = this.boxInput.value;
      this.editingBox.linkedNote = this.boxLink.value || null;
      this.saveHistory();
    }
    this.editingBox = null;
    this.inlineEditor.classList.add('hidden');
    this.updateToolbarPos();
    this.render();
  }

  updateEditorPos() {
    if (!this.editingBox) return;
    const minW = 180;
    const minH = 120;
    const editorWidth = Math.max(minW, this.editingBox.w);
    const editorHeight = Math.max(minH, this.editingBox.h);

    this.inlineEditor.style.left = `${this.editingBox.x + this.editingBox.w / 2}px`;
    this.inlineEditor.style.top = `${this.editingBox.y + this.editingBox.h + 10}px`;
    this.inlineEditor.style.width = `${editorWidth}px`;
    this.inlineEditor.style.height = `${editorHeight}px`;
  }

  updateToolbarPos() {
    if (!this.selectedBox || this.editingBox) {
      this.toolbar.classList.add('hidden');
      return;
    }
    this.toolbar.classList.remove('hidden');
    
    const peekBtn = document.getElementById('toolbar-peek');
    if (this.selectedBox.linkedNote) {
      peekBtn.classList.remove('hidden');
    } else {
      peekBtn.classList.add('hidden');
    }

    this.toolbar.style.left = `${this.selectedBox.x + this.selectedBox.w/2}px`;
    this.toolbar.style.top = `${this.selectedBox.y - 40}px`;
    this.updatePeekPos();
  }

  touchToMouse(touch) {
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      preventDefault: () => {}
    };
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.viewport.x) / this.viewport.scale;
    const y = (e.clientY - rect.top - this.viewport.y) / this.viewport.scale;
    return { x, y };
  }

  handleWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const factor = Math.exp(delta * zoomSpeed);
    
    const newScale = Math.min(Math.max(0.1, this.viewport.scale * factor), 5);
    
    // Zoom centered on mouse
    this.viewport.x = mouseX - (mouseX - this.viewport.x) * (newScale / this.viewport.scale);
    this.viewport.y = mouseY - (mouseY - this.viewport.y) * (newScale / this.viewport.scale);
    this.viewport.scale = newScale;
    
    this.saveHistory();
    this.updateToolbarPos();
    this.updateEditorPos();
    this.render();
  }

  handleMouseDown(e) {
    this.closeEditor();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    this.lastMousePos = { x: mouseX, y: mouseY };

    if (this.panningWithSpace || e.button === 1) {
      this.isPanning = true;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    const pos = this.getMousePos(e);
    this.lastCanvasMousePos = pos;
    const { x, y } = pos;

    // Check for "Wire" handle (ONLY IF SELECTED)
    if (this.selectedBox) {
      const handleX = this.selectedBox.x + this.selectedBox.w + 10;
      const handleY = this.selectedBox.y + this.selectedBox.h/2;
      if (Math.hypot(x - handleX, y - handleY) < 12) {
        this.mode = 'connecting';
        this.connectingFrom = this.selectedBox;
        this.tempConnectionEnd = { x, y };
        this.render();
        return;
      }
    }

    // Check if the topmost box under the mouse is selected and the click is precisely on its bottom-right resize handle
    const topmostBox = [...this.boxes].reverse().find(b => 
      x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
    );

    let resizableBox = null;
    if (topmostBox) {
      const isSelected = (this.selectedBox && this.selectedBox.id === topmostBox.id) || 
                          (this.selectedBoxes && this.selectedBoxes.some(b => b.id === topmostBox.id));
      if (isSelected) {
        const dx = (topmostBox.x + topmostBox.w) - x;
        const dy = (topmostBox.y + topmostBox.h) - y;
        // Check if click matches the visual 15px bottom-right right-angle triangle
        if (dx >= 0 && dx <= 15 && dy >= 0 && dy <= 15 && (dx + dy) <= 15) {
          resizableBox = topmostBox;
        }
      }
    }

    if (resizableBox) {
      this.isResizing = true;
      this.dragTarget = resizableBox;
      this.selectedBox = resizableBox;
      this.selectedBoxes = [resizableBox];
      this.selectedArrow = null;
      this.updateToolbarPos();
      this.render();
      return;
    }

    // Check for box click in reverse order (topmost first)
    const clickedBox = [...this.boxes].reverse().find(b => 
      x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
    );

    if (clickedBox) {
      this.isDragging = true;
      this.dragTarget = clickedBox;
      if (!this.selectedBoxes.some(b => b.id === clickedBox.id)) {
        this.selectedBox = clickedBox;
        this.selectedBoxes = [clickedBox];
      } else {
        this.selectedBox = clickedBox;
      }
      this.selectedArrow = null;
      this.offset.x = x - clickedBox.x;
      this.offset.y = y - clickedBox.y;
    } else {
      // Check for arrow click
      const clickedArrow = this.findArrowAt(x, y);
      if (clickedArrow) {
        this.selectedArrow = clickedArrow;
        this.selectedBox = null;
        this.selectedBoxes = [];
      } else {
        // Clicked on empty space -> Start Marquee selection!
        this.mode = 'marquee';
        this.marqueeStart = { x, y };
        this.marqueeEnd = { x, y };
        this.selectedBox = null;
        this.selectedBoxes = [];
        this.selectedArrow = null;
      }
    }
    this.updateToolbarPos();
    this.render();
  }

  getArrowAnchors(from, to) {
    const anchorsFrom = [
      { x: from.x + from.w/2, y: from.y, dir: { x: 0, y: -1 } },
      { x: from.x + from.w/2, y: from.y + from.h, dir: { x: 0, y: 1 } },
      { x: from.x, y: from.y + from.h/2, dir: { x: -1, y: 0 } },
      { x: from.x + from.w, y: from.y + from.h/2, dir: { x: 1, y: 0 } }
    ];
    const anchorsTo = [
      { x: to.x + to.w/2, y: to.y, dir: { x: 0, y: -1 } },
      { x: to.x + to.w/2, y: to.y + to.h, dir: { x: 0, y: 1 } },
      { x: to.x, y: to.y + to.h/2, dir: { x: -1, y: 0 } },
      { x: to.x + to.w, y: to.y + to.h/2, dir: { x: 1, y: 0 } }
    ];

    let bestDist = Infinity;
    let start = anchorsFrom[0];
    let end = anchorsTo[0];

    anchorsFrom.forEach(a1 => {
      anchorsTo.forEach(a2 => {
        const d = Math.hypot(a1.x - a2.x, a1.y - a2.y);
        if (d < bestDist) {
          bestDist = d;
          start = a1;
          end = a2;
        }
      });
    });

    return { start, end };
  }

  findArrowAt(x, y) {
    const threshold = Math.max(12, 16 / this.viewport.scale);
    for (const arrow of this.arrows) {
      const from = this.boxes.find(b => b.id === arrow.from);
      const to = this.boxes.find(b => b.id === arrow.to);
      if (!from || !to) continue;

      const { start, end } = this.getArrowAnchors(from, to);
      if (!start || !end) continue;

      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      const bend = Math.min(dist / 2, 40);
      const alignedX = Math.abs(start.x - end.x) < 5;
      const alignedY = Math.abs(start.y - end.y) < 5;

      const samples = 12;
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        let px, py;
        if (alignedX || alignedY) {
          px = start.x + (end.x - start.x) * t;
          py = start.y + (end.y - start.y) * t;
        } else {
          const cp1x = start.x + start.dir.x * bend;
          const cp1y = start.y + start.dir.y * bend;
          const cp2x = end.x + end.dir.x * bend;
          const cp2y = end.y + end.dir.y * bend;

          const mt = 1 - t;
          px = mt*mt*mt*start.x + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*end.x;
          py = mt*mt*mt*start.y + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*end.y;
        }

        if (Math.hypot(x - px, y - py) < threshold) return arrow;
      }
    }
    return null;
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (this.isPanning) {
      this.viewport.x += mouseX - this.lastMousePos.x;
      this.viewport.y += mouseY - this.lastMousePos.y;
      this.lastMousePos = { x: mouseX, y: mouseY };
      this.saveHistory();
      this.updateToolbarPos();
      this.updateEditorPos();
      this.render();
      return;
    }

    const pos = this.getMousePos(e);
    const { x, y } = pos;

    if (this.mode === 'connecting') {
      this.tempConnectionEnd = { x, y };
      this.render();
    } else if (this.mode === 'marquee') {
      this.marqueeEnd = { x, y };
      this.render();
    } else if (this.isResizing && this.dragTarget) {
      this.dragTarget.w = Math.max(50, x - this.dragTarget.x);
      this.dragTarget.h = Math.max(30, y - this.dragTarget.y);
      this.updateToolbarPos();
      this.updateEditorPos();
      this.render();
    } else if (this.isDragging && this.dragTarget) {
      const dx = x - this.lastCanvasMousePos.x;
      const dy = y - this.lastCanvasMousePos.y;
      if (this.selectedBoxes && this.selectedBoxes.includes(this.dragTarget)) {
        this.selectedBoxes.forEach(b => {
          b.x += dx;
          b.y += dy;
        });
      } else {
        this.dragTarget.x += dx;
        this.dragTarget.y += dy;
      }
      this.updateToolbarPos();
      this.updateEditorPos();
      this.render();
    }
    this.lastMousePos = { x: mouseX, y: mouseY };
    this.lastCanvasMousePos = pos;
  }

  handleMouseUp(e) {
    if (this.mode === 'connecting' && this.connectingFrom) {
      const pos = e ? this.getMousePos(e) : { 
        x: (this.lastMousePos.x - this.viewport.x) / this.viewport.scale, 
        y: (this.lastMousePos.y - this.viewport.y) / this.viewport.scale 
      };
      const { x, y } = pos;
      const targetBox = this.boxes.find(b => 
        x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
      );

      if (targetBox && targetBox.id !== this.connectingFrom.id) {
        const exists = this.arrows.find(a => a.from === this.connectingFrom.id && a.to === targetBox.id);
        if (!exists) {
          this.arrows.push({ from: this.connectingFrom.id, to: targetBox.id });
          this.saveHistory();
        }
      }
      this.mode = 'select';
      this.connectingFrom = null;
      this.tempConnectionEnd = null;
      this.render();
    }

    if (this.mode === 'marquee') {
      if (this.marqueeStart && this.marqueeEnd) {
        const minX = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
        const maxX = Math.max(this.marqueeStart.x, this.marqueeEnd.x);
        const minY = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
        const maxY = Math.max(this.marqueeStart.y, this.marqueeEnd.y);
        
        const insideBoxes = this.boxes.filter(b => {
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
        });
        
        this.selectedBoxes = insideBoxes;
        if (insideBoxes.length === 1) {
          this.selectedBox = insideBoxes[0];
        } else {
          this.selectedBox = null;
        }
      }
      this.marqueeStart = null;
      this.marqueeEnd = null;
      this.mode = 'select';
      this.render();
    }

    if (this.isDragging || this.isResizing) {
      if (e) this.saveHistory();
      else this.saveHistory(true); // Touch usually doesn't have multiple 'history' states during move
    }

    this.isDragging = false;
    this.isResizing = false;
    this.isPanning = false;
    this.dragTarget = null;
    if (!this.panningWithSpace) {
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.canvas.style.cursor = 'grab';
    }
    this.updateToolbarPos();
  }

  handleDoubleClick(e) {
    const pos = this.getMousePos(e);
    const { x, y } = pos;

    const clickedBox = [...this.boxes].reverse().find(b => 
      x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
    );

    if (clickedBox) {
      this.isDragging = false;
      this.dragTarget = null;
      this.openEditor(clickedBox);
    }
  }

  deleteSelectedBox() {
    if (this.selectedBoxes && this.selectedBoxes.length > 0) {
      const idsToDelete = new Set(this.selectedBoxes.map(b => b.id));
      this.boxes = this.boxes.filter(b => !idsToDelete.has(b.id));
      this.arrows = this.arrows.filter(a => !idsToDelete.has(a.from) && !idsToDelete.has(a.to));
      this.selectedBoxes = [];
      this.selectedBox = null;
    } else if (this.selectedBox) {
      this.boxes = this.boxes.filter(b => b.id !== this.selectedBox.id);
      this.arrows = this.arrows.filter(a => a.from !== this.selectedBox.id && a.to !== this.selectedBox.id);
      this.selectedBox = null;
    } else {
      return;
    }
    this.updateToolbarPos();
    this.saveHistory();
    this.render();
  }

  deleteSelectedArrow() {
    if (!this.selectedArrow) return;
    this.arrows = this.arrows.filter(a => a !== this.selectedArrow);
    this.selectedArrow = null;
    this.updateToolbarPos();
    this.saveHistory();
    this.render();
  }

  onResize() {
    if (!this.container) return;
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;
    this.updateToolbarPos();
    this.updateEditorPos();
    this.render();
  }

  addBox(image = null) {
    const box = {
      id: Date.now(),
      x: (this.canvas.width/2 - this.viewport.x) / this.viewport.scale - (image ? 100 : 60),
      y: (this.canvas.height/2 - this.viewport.y) / this.viewport.scale - (image ? 75 : 30),
      w: image ? 200 : 120,
      h: image ? 150 : 60,
      text: image ? '' : 'New Idea',
      linkedNote: null,
      image: image
    };
    this.boxes.push(box);
    this.selectedBox = box;
    this.selectedBoxes = [box];
    this.selectedArrow = null;
    this.updateToolbarPos();
    this.saveHistory();
    this.render();
  }

  render() {
    this.updatePeekPos();
    this.renderCanvasPalette();
    const isNight = document.body.classList.contains('night-mode');
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.ctx.save();
    this.ctx.translate(this.viewport.x, this.viewport.y);
    this.ctx.scale(this.viewport.scale, this.viewport.scale);

    const mainColor = isNight ? '#a18a5e' : '#1c1814';
    const bgBox = isNight ? '#1c1814' : '#fff';
    const highlightColor = isNight ? '#ffbb00' : '#cc0000';

    // Draw Grid
    const gridSize = 40;
    const startX = -Math.ceil(this.viewport.x / this.viewport.scale / gridSize) * gridSize;
    const startY = -Math.ceil(this.viewport.y / this.viewport.scale / gridSize) * gridSize;
    const endX = startX + this.canvas.width / this.viewport.scale + gridSize;
    const endY = startY + this.canvas.height / this.viewport.scale + gridSize;

    this.ctx.strokeStyle = isNight ? 'rgba(161, 138, 94, 0.15)' : 'rgba(0,0,0,0.06)';
    this.ctx.lineWidth = 1 / this.viewport.scale;
    this.ctx.beginPath();
    for(let i = startX; i < endX; i += gridSize) {
      this.ctx.moveTo(i, startY); this.ctx.lineTo(i, endY);
    }
    for(let j = startY; j < endY; j += gridSize) {
      this.ctx.moveTo(startX, j); this.ctx.lineTo(endX, j);
    }
    this.ctx.stroke();

    // Draw Arrows
    this.arrows.forEach(arrow => {
      const from = this.boxes.find(b => b.id === arrow.from);
      const to = this.boxes.find(b => b.id === arrow.to);
      const isSelected = this.selectedArrow === arrow;
      if (from && to) {
        this.drawSmartArrow(from, to, isSelected ? highlightColor : mainColor, isSelected);
      }
    });

    // Draw Temporary Connection
    if (this.mode === 'connecting' && this.connectingFrom && this.tempConnectionEnd) {
      this.ctx.strokeStyle = highlightColor;
      this.ctx.setLineDash([5, 5]);
      this.ctx.beginPath();
      this.ctx.moveTo(this.connectingFrom.x + this.connectingFrom.w + 10, this.connectingFrom.y + this.connectingFrom.h/2);
      this.ctx.lineTo(this.tempConnectionEnd.x, this.tempConnectionEnd.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Draw Boxes
    this.boxes.forEach(box => {
      const isSelected = (this.selectedBox && this.selectedBox.id === box.id) || 
                          (this.selectedBoxes && this.selectedBoxes.some(b => b.id === box.id));
      
      const textFillColor = mainColor;

      this.ctx.fillStyle = bgBox;
      this.ctx.strokeStyle = isSelected ? highlightColor : mainColor;
      this.ctx.lineWidth = 2 / this.viewport.scale;
      
      // Brutalist Shadow
      const shadowOffset = 4;
      this.ctx.fillStyle = isNight ? '#a18a5e' : '#000';
      this.ctx.fillRect(box.x + shadowOffset, box.y + shadowOffset, box.w, box.h);
      
      this.ctx.fillStyle = bgBox;
      this.ctx.strokeRect(box.x, box.y, box.w, box.h);
      this.ctx.fillRect(box.x, box.y, box.w, box.h);

      if (box.color) {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'multiply';
        this.ctx.globalAlpha = isNight ? 1.0 : 0.25;
        this.ctx.fillStyle = box.color;
        this.ctx.fillRect(box.x, box.y, box.w, box.h);
        this.ctx.restore();
      }
      
      // Draw image if exists
      if (box.image) {
        const isVaultImg = typeof box.image === 'string' && box.image.includes('![[');
        const imgSrc = isVaultImg ? this.extractImgId(box.image) : box.image;
 
        if (!box._imgCached || box._imgSource !== box.image) {
          box._imgSource = box.image;
          box._imgLoaded = false;
          box._imgCached = new Image();
          box._imgCached.referrerPolicy = "no-referrer";
          
          if (isVaultImg && window.app?.vault) {
            window.app.vault.getImage(imgSrc).then(data => {
              if (data) {
                box._imgCached.src = data;
              }
            });
          } else {
            box._imgCached.src = box.image;
          }
 
          box._imgCached.onload = () => {
            box._imgLoaded = true;
            this.render();
          };
        }
        if (box._imgLoaded) {
          this.ctx.drawImage(box._imgCached, box.x + 2, box.y + 2, box.w - 4, box.h - 4);
        }
      }

      // Draw Emoji Icon & Custom Title Badge Header if present
      const hasHeader = box.emoji || box.customTitle;
      const headerHeight = 22;
      if (hasHeader) {
        // Draw divider line
        this.ctx.strokeStyle = isSelected ? highlightColor : mainColor;
        this.ctx.lineWidth = 1 / this.viewport.scale;
        this.ctx.beginPath();
        this.ctx.moveTo(box.x, box.y + headerHeight);
        this.ctx.lineTo(box.x + box.w, box.y + headerHeight);
        this.ctx.stroke();

        this.ctx.save();
        this.ctx.fillStyle = textFillColor;
        this.ctx.font = `800 10px "Inter"`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        
        let headerText = '';
        if (box.emoji) headerText += box.emoji + ' ';
        if (box.customTitle) headerText += box.customTitle;
        
        this.ctx.fillText(headerText, box.x + 8, box.y + headerHeight / 2);
        this.ctx.restore();
      }
      
      // Wire Handle (ONLY IF SELECTED)
      if (isSelected) {
        this.ctx.beginPath();
        this.ctx.arc(box.x + box.w + 10, box.y + box.h/2, 6, 0, Math.PI * 2);
        this.ctx.fillStyle = isNight ? '#333' : '#eee';
        this.ctx.fill();
        this.ctx.strokeStyle = mainColor;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        // Resize handle
        this.ctx.fillStyle = highlightColor;
        this.ctx.beginPath();
        this.ctx.moveTo(box.x + box.w, box.y + box.h - 15);
        this.ctx.lineTo(box.x + box.w, box.y + box.h);
        this.ctx.lineTo(box.x + box.w - 15, box.y + box.h);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Resize iconic lines
        this.ctx.strokeStyle = isNight ? '#000' : '#fff';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(box.x + box.w - 10, box.y + box.h - 2);
        this.ctx.lineTo(box.x + box.w - 2, box.y + box.h - 10);
        this.ctx.moveTo(box.x + box.w - 6, box.y + box.h - 2);
        this.ctx.lineTo(box.x + box.w - 2, box.y + box.h - 6);
        this.ctx.stroke();
      }
 
      this.ctx.fillStyle = textFillColor;
      this.ctx.font = `800 12px "Inter"`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
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
        this.ctx.fillText(displayText, box.x + box.w/2, lineY);
      });
      
      if (box.linkedNote) {
        this.ctx.font = `italic 9px monospace`;
        this.ctx.globalAlpha = 0.6;
        this.ctx.fillStyle = textFillColor;
        this.ctx.fillText(`[[${box.linkedNote}]]`, box.x + box.w/2, box.y + box.h - 8);
        this.ctx.globalAlpha = 1.0;
      }
    });

    // Draw Marquee selection box
    if (this.mode === 'marquee' && this.marqueeStart && this.marqueeEnd) {
      this.ctx.strokeStyle = highlightColor;
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([4, 4]);
      const x = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
      const y = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
      const w = Math.abs(this.marqueeStart.x - this.marqueeEnd.x);
      const h = Math.abs(this.marqueeStart.y - this.marqueeEnd.y);
      this.ctx.strokeRect(x, y, w, h);
      
      this.ctx.fillStyle = isNight ? 'rgba(255, 187, 0, 0.08)' : 'rgba(204, 0, 0, 0.04)';
      this.ctx.fillRect(x, y, w, h);
      this.ctx.setLineDash([]);
    }
 
    this.ctx.restore();

    // Help Text
    this.ctx.fillStyle = mainColor;
    this.ctx.font = '10px monospace';
    this.ctx.globalAlpha = 0.5;
    this.ctx.textAlign = 'left';
    this.ctx.fillText('SPACE + DRAG to Pan • WHEEL to Zoom • DRAG SIDE CIRCLE to Connect • DEL to Delete', 20, this.canvas.height - 20);
    this.ctx.globalAlpha = 1.0;
  }

  extractImgId(text) {
    const match = text.match(/!\[\[(.*?)\]\]/);
    return match ? match[1] : text;
  }

  drawSmartArrow(from, to, color, isSelected = false) {
    const { start, end } = this.getArrowAnchors(from, to);
    if (!start || !end) return;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = isSelected ? 3 : 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);

    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    const bend = Math.min(dist / 2, 40);

    const alignedX = Math.abs(start.x - end.x) < 5;
    const alignedY = Math.abs(start.y - end.y) < 5;

    if (alignedX || alignedY) {
      this.ctx.lineTo(end.x, end.y);
    } else {
      const cp1x = start.x + start.dir.x * bend;
      const cp1y = start.y + start.dir.y * bend;
      const cp2x = end.x + end.dir.x * bend;
      const cp2y = end.y + end.dir.y * bend;
      this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);
    }
    this.ctx.stroke();

    // Arrow head
    const angle = Math.atan2(end.y - (alignedY || alignedX ? start.y : (end.y + end.dir.y * bend)), end.x - (alignedY || alignedX ? start.x : (end.x + end.dir.x * bend)));
    const headlen = 10;
    this.ctx.beginPath();
    this.ctx.moveTo(end.x, end.y);
    this.ctx.lineTo(end.x - headlen * Math.cos(angle - Math.PI / 6), end.y - headlen * Math.sin(angle - Math.PI / 6));
    this.ctx.moveTo(end.x, end.y);
    this.ctx.lineTo(end.x - headlen * Math.cos(angle + Math.PI / 6), end.y - headlen * Math.sin(angle + Math.PI / 6));
    this.ctx.stroke();
  }

  renderCanvasPalette() {
    if (!this.canvasPalette) return;
    this.canvasPalette.innerHTML = '';
    
    const colors = [
      '#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff',
      '#a0c4ff', '#bdb2ff', '#ffc6ff', '#ffffff', ''
    ];
    
    colors.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = `canvas-color-swatch ${(!c) ? 'empty' : ''}`;
      if (c) swatch.style.backgroundColor = c;
      swatch.title = c ? `Tint color: ${c}` : 'Clear Tint';
      
      if (this.selectedBox && (this.selectedBox.color || '') === c) {
        swatch.classList.add('active');
      } else if (!this.selectedBox && !c) {
        // No active selected box
      }
      
      swatch.onclick = (e) => {
        e.stopPropagation();
        if (this.selectedBoxes && this.selectedBoxes.length > 0) {
          this.selectedBoxes.forEach(box => {
            box.color = c || null;
          });
          this.saveHistory();
          this.render();
        } else if (this.selectedBox) {
          this.selectedBox.color = c || null;
          this.saveHistory();
          this.render();
        }
      };
      this.canvasPalette.appendChild(swatch);
    });
  }
}

window.CanvasLite = CanvasLite;
