export class GraphModule {
  constructor(app) {
    this.app = app;
    this.menuEl = document.getElementById('graph-menu');
    this.waterEl = document.getElementById('graph-water');
    this.canvas = document.getElementById('graph-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    // Wave Sim State
    this.gridW = 0;
    this.gridH = 0;
    this.water = null;
    this.velocity = null;
    this.charW = 10;
    this.charH = 15;
    
    // Physics State
    this.nodes = [];
    this.mouse = { x: -1000, y: -1000, down: false };
    this.isActive = false;
    
    this.damping = 0.99;
    this.dt = 0.05;
    this.charMap = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'];
    
    this.initEvents();
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.measureChars();
      this.resize();
    });
    
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.mouse.x = x;
      this.mouse.y = y;
      this.addRipple(x, y, 4);
    });

    this.canvas.addEventListener('mousedown', () => this.mouse.down = true);
    window.addEventListener('mouseup', () => this.mouse.down = false);

    this.canvas.addEventListener('click', (e) => {
      const node = this.getNodeAt(this.mouse.x, this.mouse.y);
      if (node) {
        this.close();
        this.app.selectNote(node.note);
      }
    });

    // Close on ESC
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.menuEl.classList.contains('hidden')) {
        this.close();
      }
    });
  }

  measureChars() {
    const temp = document.createElement('span');
    temp.style.fontFamily = 'monospace';
    temp.style.fontSize = '10px';
    temp.style.lineHeight = '15px';
    temp.style.visibility = 'hidden';
    temp.style.position = 'absolute';
    temp.style.whiteSpace = 'pre';
    temp.textContent = 'MMMMMMMMMM';
    document.body.appendChild(temp);
    const rect = temp.getBoundingClientRect();
    this.charW = rect.width / 10;
    this.charH = 11; // Reduced from 15 to fix vertical elongation
    document.body.removeChild(temp);
  }

  resize() {
    if (!this.isActive) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    
    // Align grid to parent dimensions
    this.gridW = Math.floor(rect.width / this.charW);
    this.gridH = Math.floor(rect.height / this.charH);
    
    // CRITICAL: Set canvas to match the character grid pixel-for-pixel
    this.canvas.width = this.gridW * this.charW;
    this.canvas.height = this.gridH * this.charH;
    
    this.water = new Float32Array(this.gridW * this.gridH);
    this.nextWater = new Float32Array(this.gridW * this.gridH);
    this.velocity = new Float32Array(this.gridW * this.gridH);
  }

  open() {
    this.isActive = true;
    this.menuEl.classList.remove('hidden');
    this.measureChars();
    this.resize();
    this.buildGraph();
    this.loop();
  }

  close() {
    this.isActive = false;
    this.menuEl.classList.add('hidden');
    if (this.app.graphBtn) this.app.graphBtn.classList.remove('active');
  }

  buildGraph() {
    const current = this.app.currentNote;
    if (!current) return;

    // Find links
    const linkedTo = this.app.notes.filter(n => {
      if (n.id === current.id) return false;
      return current.content.includes(`[[${n.title}]]`);
    });

    const linkedFrom = this.app.notes.filter(n => {
      if (n.id === current.id) return false;
      return n.content.includes(`[[${current.title}]]`);
    });

    const neighbors = Array.from(new Set([...linkedTo, ...linkedFrom]));

    const w = this.canvas.width;
    const h = this.canvas.height;

    this.nodes = [];
    
    // Main Node (Core of the graph)
    this.nodes.push({
      id: current.id,
      note: current,
      x: w / 2,
      y: h / 2,
      vx: 0, vy: 0,
      isMain: true,
      label: current.title
    });

    // Surroundings
    neighbors.forEach((note, i) => {
      const angle = (i / neighbors.length) * Math.PI * 2;
      const radius = Math.min(w, h) * 0.25;
      this.nodes.push({
        id: note.id,
        note: note,
        x: w/2 + Math.cos(angle) * (radius + Math.random() * 50),
        y: h/2 + Math.sin(angle) * (radius + Math.random() * 50),
        vx: (Math.random() - 0.5) * 2, 
        vy: (Math.random() - 0.5) * 2,
        isMain: false,
        label: note.title
      });
    });
  }

  addRipple(x, y, strength) {
    if (!this.water) return;
    // Map pixels to character grid 1:1 (removing offsets to fix desync)
    const gx = Math.floor(x / this.charW);
    const gy = Math.floor(y / this.charH);
    
    if (gx > 1 && gx < this.gridW - 2 && gy > 1 && gy < this.gridH - 2) {
      const i = gy * this.gridW + gx;
      this.water[i] += strength;
      const rippleSpread = strength * 0.4;
      this.water[i - 1] += rippleSpread;
      this.water[i + 1] += rippleSpread;
      this.water[i - this.gridW] += rippleSpread;
      this.water[i + this.gridW] += rippleSpread;
    }
  }

  updatePhysics() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const mainNode = this.nodes.find(n => n.isMain);

    this.nodes.forEach((n1, i) => {
      // 1. HUB ANCHOR (Ported from ai_app.js)
      // Only apply central pull to the main node (the center point)
      if (mainNode && n1.id === mainNode.id) {
        const centerX = w / 2;
        const centerY = h / 2;
        const dx_center = centerX - n1.x;
        const dy_center = centerY - n1.y;

        const mdx = n1.x - this.mouse.x;
        const mdy = n1.y - this.mouse.y;
        const distMouse = Math.hypot(mdx, mdy);
        const interactionRadius = 30;

        if (distMouse > interactionRadius && !this.mouse.down) {
          const anchorStrength = 0.0007; // Very gentle pull back to center
          n1.vx += dx_center * anchorStrength;
          n1.vy += dy_center * anchorStrength;
        }
      }

      // 2. MOUSE ATTRACTION/DEADZONE (Slightly more intimate)
      const dx_mouse = this.mouse.x - n1.x;
      const dy_mouse = this.mouse.y - n1.y;
      const dist_mouse = Math.hypot(dx_mouse, dy_mouse);
      const attraction_radius = 180; // Reduced radius for closer interaction
      const deadzone_radius = 20;
      const attraction_strength = 0.001; // Reduced pull strength

      // Slow Playful Drift (Wind/Water currents)
      const time = Date.now() * 0.001;
      n1.vx += Math.sin(time + i) * 0.015;
      n1.vy += Math.cos(time * 0.8 + i) * 0.015;

      if (dist_mouse > deadzone_radius && dist_mouse < attraction_radius) {
          const effective_dist = dist_mouse - deadzone_radius;
          const effective_radius = attraction_radius - deadzone_radius;

          const force = (effective_radius - effective_dist) * attraction_strength;
          n1.vx += (dx_mouse / dist_mouse) * force;
          n1.vy += (dy_mouse / dist_mouse) * force;

          // Side-friction inside gravity field
          const frictionFactor = (attraction_radius - dist_mouse) / attraction_radius;
          const frictionStrength = 0.15;
          n1.vx *= (1 - frictionFactor * frictionStrength);
          n1.vy *= (1 - frictionFactor * frictionStrength);
      } else if (dist_mouse <= deadzone_radius) {
          // Deadzone stability
          const deadzoneDamping = 0.8;
          n1.vx *= (1 - deadzoneDamping);
          n1.vy *= (1 - deadzoneDamping);
      }

      // 3. NODE-TO-NODE & TETHERS
      for (let j = i + 1; j < this.nodes.length; j++) {
        const n2 = this.nodes[j];
        const dx_nodes = n1.x - n2.x;
        const dy_nodes = n1.y - n2.y;
        const dist_nodes = Math.hypot(dx_nodes, dy_nodes);

        if (dist_nodes === 0) continue;

        const ux = dx_nodes / dist_nodes;
        const uy = dy_nodes / dist_nodes;

        // Repulsion (Softer)
        const repulsion_const = 50; 
        const rForce = repulsion_const / Math.max(10, dist_nodes * dist_nodes);
        n1.vx += ux * rForce;
        n1.vy += uy * rForce;
        n2.vx -= ux * rForce;
        n2.vy -= uy * rForce;

        // Hooke's Law Tether (Chill attraction)
        const isMainN1 = n1.id === mainNode?.id;
        const isMainN2 = n2.id === mainNode?.id;
        
        if (isMainN1 || isMainN2) {
          const spring_k = 0.0005; // Half strength
          const rest_length = 200; 
          const extension = dist_nodes - rest_length;
          const aForce = -spring_k * extension;

          n1.vx += ux * aForce;
          n1.vy += uy * aForce;
          n2.vx -= ux * aForce;
          n2.vy -= uy * aForce;
        }
      }

      // 4. DAMPING & POSITION (Balanced speed feel)
      n1.vx *= 0.95;
      n1.vy *= 0.95;
      
      const speedLimit = 3.0; // Restored and increased speed limit
      const speed = Math.hypot(n1.vx, n1.vy);
      if (speed > speedLimit) {
        n1.vx = (n1.vx / speed) * speedLimit;
        n1.vy = (n1.vy / speed) * speedLimit;
      }

      n1.x += n1.vx; 
      n1.y += n1.vy;
      
      if (speed > 0.1) {
        this.addRipple(n1.x, n1.y, Math.min(speed * 3.5, 8));
      }
    });
  }

  updateWater() {
    // Ported from water_pool.js "perfect" logic
    for (let i = this.gridW + 1; i < this.gridW * this.gridH - this.gridW - 1; i++) {
        const x = i % this.gridW;
        const y = Math.floor(i / this.gridW);
        
        const w_negX = this.water[i - 1];
        const w_posX = this.water[i + 1];
        const w_negY = this.water[i - this.gridW];
        const w_posY = this.water[i + this.gridW];

        const avgHeight = (w_negY + w_posY + w_negX + w_posX) * 0.25;
        const acceleration = (avgHeight - this.water[i]) * 9.81;
        this.velocity[i] += acceleration * this.dt;
        this.velocity[i] *= this.damping;
        this.nextWater[i] = this.water[i] + this.velocity[i] * this.dt;
        
        // Slight natural drain
        this.nextWater[i] *= 0.98;
    }

    let temp = this.water;
    this.water = this.nextWater;
    this.nextWater = temp;
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const isNight = document.body.classList.contains('night-mode');

    // 1. Connection Lines (Spider Web)
    const mainNode = this.nodes.find(n => n.isMain);
    if (mainNode) {
      this.ctx.strokeStyle = isNight ? 'rgba(161, 138, 94, 0.15)' : 'rgba(255,255,255,0.08)'; // Muted brown spiderweb for coffee theme
      this.ctx.lineWidth = 1;
      this.nodes.forEach(n => {
        if (n === mainNode) return;
        this.ctx.beginPath();
        this.ctx.moveTo(mainNode.x, mainNode.y);
        this.ctx.lineTo(n.x, n.y);
        this.ctx.stroke();
      });
    }

    // 2. ASCII Wave Rendering
    let asciiContent = '';
    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        const val = this.water[y * this.gridW + x];
        const absVal = Math.abs(val);
        
        if (absVal < 0.05) {
          asciiContent += ' ';
        } else {
          // Night mode uses "bubbles", normal uses classic lines
          const coffeeChars = [' ', '.', 'o', 'o', 'O', '0', '0', '@', '#', '%'];
          const activeMap = isNight ? coffeeChars : this.charMap;
          
          const charIdx = Math.min(Math.floor(absVal * 6) + 1, activeMap.length - 1);
          asciiContent += activeMap[charIdx];
        }
      }
      asciiContent += '\n';
    }
    this.waterEl.textContent = asciiContent;
    this.waterEl.style.color = isNight ? 'rgba(161, 138, 94, 0.6)' : 'rgba(255, 255, 255, 0.4)'; // Muted brown ripples
    this.waterEl.style.textShadow = isNight ? '0 0 2px rgba(0, 0, 0, 0.8)' : '0 0 4px rgba(0,0,0,0.8)';

    // 3. Node Rendering (@ symbols as Boats)
    this.nodes.forEach(n => {
      const hover = Math.hypot(n.x - this.mouse.x, n.y - this.mouse.y) < 25;
      
      // Node Colors - Theme Aware
      const mainColor = isNight ? '#bdab84' : '#d4af37'; // Slightly brighter muted paper color for main node
      const nodeColor = isNight ? '#a18a5e' : '#fff';
      const highlightColor = isNight ? '#fff' : '#fff';

      this.ctx.fillStyle = n.isMain ? mainColor : nodeColor;
      if (hover) this.ctx.fillStyle = highlightColor;
      
      // Node Core (@)
      this.ctx.font = 'bold 16px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('@', n.x, n.y);
      
      // Label
      this.ctx.fillStyle = hover ? highlightColor : (isNight ? '#a18a5e' : 'rgba(255,255,255,0.6)');
      this.ctx.font = '10px monospace';
      this.ctx.fillText(n.label.toUpperCase(), n.x, n.y + 24);
      
      // Boat Hull (Square/Square outline)
      this.ctx.strokeStyle = n.isMain ? mainColor : (isNight ? 'rgba(161, 138, 94, 0.5)' : 'rgba(255,255,255,0.2)');
      if (hover) this.ctx.strokeStyle = highlightColor;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(n.x - 12, n.y - 12, 24, 24);
      
      // Hover Glow
      if (hover) {
        this.ctx.strokeStyle = isNight ? 'rgba(161, 138, 94, 0.3)' : 'rgba(255,255,255,0.1)';
        this.ctx.beginPath();
        this.ctx.arc(n.x, n.y, 18, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    });
  }

  loop() {
    if (!this.isActive) return;
    this.updatePhysics();
    this.updateWater();
    this.draw();
    requestAnimationFrame(() => this.loop());
  }

  getNodeAt(x, y) {
    return this.nodes.find(n => Math.hypot(n.x - x, n.y - y) < 20);
  }
}
