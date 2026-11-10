(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const scoreEl = $('score'), livesEl = $('lives'), levelEl = $('level');
  const overlay = $('overlay'), overlayTitle = $('overlayTitle'), overlayText = $('overlayText');
  const playButton = $('playButton'), statusText = $('statusText'), toast = $('toast');
  const progress = $('levelProgress').firstElementChild;
  const MAX_BALLS = 42, TOTAL_WAVES = 5;
  let W = 1, H = 1, dpr = 1, lastTime = 0, state = 'ready';
  let paddle, balls = [], bricks = [], particles = [], stars = [], score = 0, lives = 3, wave = 1;
  let soundOn = true, audioContext = null, pointerX = null, leftHeld = false, rightHeld = false;
  let combo = 0, comboTimer = 0, serveX = 0.5, toastTimer = 0, shake = 0, streak = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const colors = ['#55e4d7', '#8ba8ff', '#a88bff', '#f28bdc', '#ffc777', '#e4eea0'];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    W = rect.width / rect.height;
    H = 1;
    if (paddle) {
      paddle.x = clamp(paddle.x, bounds().left + paddle.w / 2, bounds().right - paddle.w / 2);
      if (state === 'ready') serveX = paddle.x;
    }
    ctx.setTransform(canvas.height, 0, 0, canvas.height, 0, 0);
    makeStars();
  }
  function bounds() { return { left: W * .045, right: W * .955, top: .035, bottom: .982 }; }
  function makeStars() {
    stars = Array.from({ length: Math.max(34, Math.round(W * 70)) }, () => ({ x: rand(0, W), y: rand(0, 1), s: rand(.0008, .0022), p: rand(0, Math.PI * 2) }));
  }
  function newPaddle() { paddle = { x: W / 2, y: .91, w: W * .19, h: .018, target: W / 2, speed: W * 1.9 }; }
  function resetBall() { balls = [{ x: paddle.x, y: paddle.y - .027, vx: 0, vy: 0, r: .0115, trail: [], hue: 0 }]; serveX = paddle.x; }
  function makeBricks() {
    const rows = 5 + Math.min(1, Math.floor((wave - 1) / 3));
    const cols = W < .7 ? 7 : 9;
    const margin = W * .085, gap = W * .009;
    const bw = (W - margin * 2 - gap * (cols - 1)) / cols;
    const bh = .033, gy = .012;
    bricks = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (wave > 1 && ((row * 3 + col + wave) % (wave === 2 ? 11 : 13) === 0)) continue;
        let hp = (wave >= 3 && row < 2 && (col + row) % 4 === 0) ? 2 : 1;
        bricks.push({ x: margin + col * (bw + gap), y: .105 + row * (bh + gy), w: bw, h: bh, hp, maxHp: hp, color: colors[(row + wave + Math.floor(col / 3)) % colors.length], flash: 0, alive: true });
      }
    }
    updateProgress();
  }
  function updateProgress() { progress.style.width = `${bricks.length ? (bricks.filter(b => b.alive).length / bricks.length) * 100 : 0}%`; }
  function formatScore(n) { return String(n).padStart(6, '0'); }
  function updateHud() {
    scoreEl.textContent = formatScore(score);
    levelEl.innerHTML = `${String(wave).padStart(2, '0')} <small>/ ${String(TOTAL_WAVES).padStart(2, '0')}</small>`;
    const dots = [...livesEl.children];
    dots.forEach((dot, i) => dot.classList.toggle('lost', i >= lives));
    livesEl.setAttribute('aria-label', `${lives} ${lives === 1 ? 'life' : 'lives'}`);
    $('ballCountRail').textContent = `BALLS — ${String(balls.length).padStart(2, '0')}`;
  }
  function showOverlay(title, text, button, hint = '') {
    overlayTitle.textContent = title;
    overlayText.innerHTML = text;
    playButton.querySelector('span').textContent = button;
    $('keyHint').innerHTML = hint;
    overlay.classList.remove('hidden');
  }
  function startRun() {
    if (state === 'gameover' || state === 'won') { score = 0; lives = 3; wave = 1; newPaddle(); makeBricks(); resetBall(); updateHud(); }
    state = 'ready';
    statusText.textContent = 'TAP TO LAUNCH';
    showOverlay('FRACTURE', 'Every collision creates another ball.<br>Keep the swarm alive. Clear the grid.', 'START RUN', '<span>←</span><span>→</span> MOVE <i>OR</i> DRAG ANYWHERE');
    playButton.onclick = launch;
  }
  function launch() {
    if (state === 'paused') { state = 'playing'; overlay.classList.add('hidden'); statusText.textContent = 'IN MOTION'; lastTime = performance.now(); return; }
    if (state === 'gameover' || state === 'won') { startRun(); }
    if (state !== 'ready') return;
    state = 'playing'; overlay.classList.add('hidden'); statusText.textContent = 'IN MOTION';
    const ball = balls[0];
    const angle = rand(-.36, .36);
    const speed = W * .48;
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    lastTime = performance.now();
    chirp(460, .045, 'sine', .025);
  }
  function togglePause() {
    if (state === 'playing') {
      state = 'paused'; statusText.textContent = 'RUN PAUSED';
      showOverlay('PAUSED', 'Take a breath. The pattern can wait.', 'RESUME', '<span>Ⅱ</span> PRESS P TO CONTINUE');
      playButton.onclick = launch;
    } else if (state === 'paused') launch();
  }
  function setupWave() {
    wave++;
    if (wave > TOTAL_WAVES) {
      state = 'won'; statusText.textContent = 'PATTERN BROKEN';
      showOverlay('YOU DID IT', `The grid is gone. You scored <b>${formatScore(score)}</b>.`, 'PLAY AGAIN', '✦ YOU MADE YOUR OWN PATTERN');
      playButton.onclick = launch; return;
    }
    makeBricks(); balls = [{ x: paddle.x, y: paddle.y - .027, vx: 0, vy: 0, r: .0115, trail: [], hue: 0 }];
    state = 'ready'; statusText.textContent = `WAVE ${String(wave).padStart(2, '0')} — READY`;
    showOverlay(`WAVE ${String(wave).padStart(2, '0')}`, 'A fresh pattern. Same rule:<br>every hit makes the swarm grow.', 'NEXT WAVE', '<span>←</span><span>→</span> MOVE <i>OR</i> DRAG ANYWHERE');
    playButton.onclick = launch;
  }
  function chirp(freq = 500, duration = .05, type = 'sine', volume = .035) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator(), gain = audioContext.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * .68), audioContext.currentTime + duration);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
    } catch (_) { /* Audio is an optional flourish. */ }
  }
  function popToast(label, value) {
    toast.innerHTML = `${label} <b>${value}</b>`;
    toast.classList.add('show'); toastTimer = 1.25;
  }
  function burst(x, y, color, count = 8, force = .23) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(force * .3, force);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(.3, .75), max: .75, size: rand(.0015, .0045), color });
    }
  }
  function splitBall(ball, angle, speed, color = '#61efe2') {
    const count = balls.length;
    const offsets = count >= MAX_BALLS ? [0, Math.PI] : [-.23, .23];
    if (count >= MAX_BALLS) {
      // At the swarm ceiling, replace the source with two fresh branches; the split still happens.
      const idx = balls.indexOf(ball);
      if (idx >= 0) balls.splice(idx, 1);
      const removeCount = Math.max(0, balls.length - (MAX_BALLS - 2));
      if (removeCount) balls.splice(0, removeCount);
    } else {
      const idx = balls.indexOf(ball);
      if (idx >= 0) balls.splice(idx, 1);
    }
    const newSpeed = Math.min(W * .82, speed * 1.035);
    for (const turn of offsets) {
      const a = angle + turn;
      balls.push({ x: ball.x + Math.cos(a) * .001, y: ball.y + Math.sin(a) * .001, vx: Math.cos(a) * newSpeed, vy: Math.sin(a) * newSpeed, r: ball.r, trail: [], hue: Math.random() * 360 });
    }
    burst(ball.x, ball.y, color, 5, .11);
    streak++;
    if (streak === 4 || streak === 12 || streak === 24) popToast('SWARM GROWING', `×${Math.min(99, balls.length)}`);
  }
  function collide(ball, dt) {
    const b = bounds();
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    let hit = false;
    if (ball.x - ball.r < b.left) { ball.x = b.left + ball.r; ball.vx = Math.abs(ball.vx); hit = true; }
    else if (ball.x + ball.r > b.right) { ball.x = b.right - ball.r; ball.vx = -Math.abs(ball.vx); hit = true; }
    if (ball.y - ball.r < b.top) { ball.y = b.top + ball.r; ball.vy = Math.abs(ball.vy); hit = true; }
    if (hit) {
      const speed = Math.hypot(ball.vx, ball.vy), angle = Math.atan2(ball.vy, ball.vx);
      chirp(610, .035, 'triangle', .016); splitBall(ball, angle, speed);
      return;
    }
    // Paddle collision: aim responds to where the ball meets the paddle.
    if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y - ball.r < paddle.y + paddle.h && ball.x >= paddle.x - paddle.w / 2 - ball.r && ball.x <= paddle.x + paddle.w / 2 + ball.r) {
      ball.y = paddle.y - ball.r - .001;
      const impact = clamp((ball.x - paddle.x) / (paddle.w * .5), -.92, .92);
      const angle = -Math.PI / 2 + impact * .95;
      const speed = Math.min(W * .78, Math.hypot(ball.vx, ball.vy) * 1.015);
      chirp(250 + Math.abs(impact) * 160, .06, 'sine', .035);
      burst(ball.x, paddle.y, '#62e9dd', 5, .09);
      splitBall(ball, angle, speed);
      return;
    }
    // Each brick is one collision; durable bricks need two clean hits.
    for (let i = 0; i < bricks.length; i++) {
      const brick = bricks[i]; if (!brick.alive) continue;
      const closestX = clamp(ball.x, brick.x, brick.x + brick.w);
      const closestY = clamp(ball.y, brick.y, brick.y + brick.h);
      const dx = ball.x - closestX, dy = ball.y - closestY;
      if (dx * dx + dy * dy > ball.r * ball.r) continue;
      const fromX = ball.x - ball.vx * dt, fromY = ball.y - ball.vy * dt;
      const wasSide = fromX < brick.x || fromX > brick.x + brick.w;
      if (wasSide) ball.vx *= -1; else ball.vy *= -1;
      if (wasSide) ball.x = fromX < brick.x ? brick.x - ball.r - .001 : brick.x + brick.w + ball.r + .001;
      else ball.y = fromY < brick.y ? brick.y - ball.r - .001 : brick.y + brick.h + ball.r + .001;
      brick.hp--; brick.flash = .16;
      combo++; comboTimer = 2.1;
      if (brick.hp <= 0) {
        brick.alive = false;
        score += 100 * wave + Math.min(combo, 20) * 5;
        burst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 10, .2);
        updateProgress();
      } else {
        score += 40 * wave;
        burst(ball.x, ball.y, brick.color, 5, .13);
      }
      updateHud();
      chirp(350 + wave * 45 + (i % 5) * 35, .065, 'triangle', .03);
      const angle = Math.atan2(ball.vy, ball.vx), speed = Math.hypot(ball.vx, ball.vy);
      splitBall(ball, angle, speed, brick.color);
      if (bricks.every(br => !br.alive)) { state = 'waveclear'; setTimeout(() => { if (state === 'waveclear') setupWave(); }, 950); }
      return;
    }
  }
  function update(dt) {
    const b = bounds();
    if (state === 'playing') {
      const target = pointerX == null ? paddle.target : pointerX;
      const step = paddle.speed * dt;
      paddle.x += clamp(target - paddle.x, -step, step);
      if (leftHeld) paddle.x -= step;
      if (rightHeld) paddle.x += step;
      paddle.x = clamp(paddle.x, b.left + paddle.w / 2, b.right - paddle.w / 2);
      const steps = Math.max(1, Math.ceil(dt / .008));
      const subDt = dt / steps;
      for (let n = 0; n < steps; n++) {
        const snapshot = balls.slice();
        for (const ball of snapshot) if (balls.includes(ball)) collide(ball, subDt);
      }
      const before = balls.length;
      balls = balls.filter(ball => {
        if (ball.y - ball.r > 1.03) { burst(ball.x, .98, '#a88bff', 5, .11); return false; }
        return true;
      });
      if (balls.length < before) {
        streak = 0; chirp(170, .12, 'sine', .028);
        if (!balls.length) {
          lives--;
          if (lives <= 0) {
            state = 'gameover'; statusText.textContent = 'RUN ENDED';
            showOverlay('RUN OVER', `You scored <b>${formatScore(score)}</b>.<br>The pattern is still waiting.`, 'TRY AGAIN', '✦ EVERY HIT STARTS A NEW RUN');
            playButton.onclick = startRun;
          } else {
            state = 'ready'; resetBall(); statusText.textContent = `${lives} ${lives === 1 ? 'LIFE' : 'LIVES'} LEFT — TAP TO SERVE`;
            showOverlay('ONE MORE', `${lives} ${lives === 1 ? 'life' : 'lives'} left. The swarm resets.<br>Make this one count.`, 'SERVE', '<span>←</span><span>→</span> MOVE <i>OR</i> DRAG ANYWHERE');
            playButton.onclick = launch;
          }
        }
      }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }
      if (shake > 0) shake = Math.max(0, shake - dt * 2.7);
    } else if (state === 'ready') {
      paddle.x += (paddle.target - paddle.x) * Math.min(1, dt * 12);
      paddle.x = clamp(paddle.x, b.left + paddle.w / 2, b.right - paddle.w / 2);
      if (balls[0]) { balls[0].x = paddle.x; balls[0].y = paddle.y - .027; }
    }
    for (const brick of bricks) if (brick.flash > 0) brick.flash = Math.max(0, brick.flash - dt);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy *= .985; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    for (const ball of balls) {
      if (Math.hypot(ball.vx, ball.vy) > 0) {
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 9) ball.trail.shift();
      }
    }
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) toast.classList.remove('show');
    updateHud();
  }
  function roundedRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  }
  function drawBackground(time) {
    const grad = ctx.createLinearGradient(0, 0, W, 1);
    grad.addColorStop(0, '#0b1021'); grad.addColorStop(.52, '#10152a'); grad.addColorStop(1, '#0a1021');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 1);
    const glow = ctx.createRadialGradient(W * .5, .36, 0, W * .5, .36, W * .65);
    glow.addColorStop(0, 'rgba(77,82,151,.14)'); glow.addColorStop(1, 'rgba(8,12,25,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 1);
    for (const star of stars) {
      const alpha = .18 + .24 * (Math.sin(time * .001 + star.p) + 1) / 2;
      ctx.fillStyle = `rgba(174,199,255,${alpha})`; ctx.beginPath(); ctx.arc(star.x, star.y, star.s, 0, Math.PI * 2); ctx.fill();
    }
    // Fine perspective guides and the beveled arena edge give the flat field depth.
    ctx.lineWidth = .0008; ctx.strokeStyle = 'rgba(118,139,203,.09)';
    for (let i = 1; i < 10; i++) { const y = .48 + i * .05; ctx.beginPath(); ctx.moveTo(W * .055, y); ctx.lineTo(W * .945, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(104,132,203,.11)';
    for (let i = 0; i <= 12; i++) { const x = W * (.055 + i * .89 / 12); ctx.beginPath(); ctx.moveTo(W * .5 + (x - W * .5) * .4, .04); ctx.lineTo(x, .98); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(104,231,222,.25)'; ctx.lineWidth = .0015;
    ctx.beginPath(); ctx.moveTo(W * .045, .035); ctx.lineTo(W * .955, .035); ctx.lineTo(W * .955, .982); ctx.stroke();
    ctx.strokeStyle = 'rgba(168,139,255,.22)'; ctx.beginPath(); ctx.moveTo(W * .045, .035); ctx.lineTo(W * .045, .982); ctx.lineTo(W * .955, .982); ctx.stroke();
    // Tiny corner registration marks.
    ctx.lineWidth = .002; ctx.strokeStyle = 'rgba(116,230,220,.54)';
    for (const [x, y, sx, sy] of [[W*.045,.035,1,1],[W*.955,.035,-1,1],[W*.045,.982,1,-1],[W*.955,.982,-1,-1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + sy * .018); ctx.lineTo(x, y); ctx.lineTo(x - sx * W * .018, y); ctx.stroke();
    }
  }
  function drawBrick(brick, time) {
    const { x, y, w, h, color } = brick;
    const depth = .006, lift = .005;
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = brick.flash ? .018 : .009;
    ctx.fillStyle = color; ctx.globalAlpha = .26 + (brick.flash ? .55 : 0); ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - depth, y + h); ctx.lineTo(x - depth, y + h); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = brick.flash ? '#f5ffff' : '#182440';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, brick.flash ? '#fff' : color + '88'); g.addColorStop(.2, '#1b2541'); g.addColorStop(1, '#10172d');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = brick.flash ? '#fff' : color; ctx.globalAlpha = brick.flash ? 1 : .63; ctx.lineWidth = .0013; ctx.stroke();
    // Top bevel / inset status line.
    ctx.globalAlpha = .36; ctx.strokeStyle = '#fff'; ctx.lineWidth = .001;
    ctx.beginPath(); ctx.moveTo(x + .005, y + lift); ctx.lineTo(x + w - .005, y + lift); ctx.stroke();
    ctx.globalAlpha = .55; ctx.fillStyle = color;
    for (let i = 0; i < brick.hp; i++) ctx.fillRect(x + w * .5 + (i - (brick.hp - 1) / 2) * .012, y + h * .53, .003, .003);
    ctx.restore();
  }
  function drawPaddle(time) {
    const x = paddle.x - paddle.w / 2, y = paddle.y, w = paddle.w, h = paddle.h;
    ctx.save(); ctx.shadowColor = '#55e4d7'; ctx.shadowBlur = .024;
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#d8fffb'); grad.addColorStop(.24, '#64e9dc'); grad.addColorStop(1, '#269b9b');
    roundedRect(x, y, w, h, .007); ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.72)'; roundedRect(x + w * .42, y + h * .16, w * .16, h * .19, .002); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(196,255,248,.58)'; ctx.lineWidth = .001; roundedRect(x, y, w, h, .007); ctx.stroke();
    // Faint afterglow under the paddle.
    const glow = ctx.createRadialGradient(paddle.x, y + .02, 0, paddle.x, y + .02, w * .75);
    glow.addColorStop(0, 'rgba(65,227,218,.12)'); glow.addColorStop(1, 'rgba(65,227,218,0)');
    ctx.fillStyle = glow; ctx.fillRect(paddle.x - w, y, w * 2, .07);
    ctx.restore();
  }
  function drawBall(ball) {
    ctx.save();
    for (let i = 0; i < ball.trail.length; i++) {
      const p = ball.trail[i], a = (i + 1) / ball.trail.length * .22;
      ctx.fillStyle = `rgba(91,236,227,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, ball.r * (.25 + i / ball.trail.length * .5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowColor = '#9bfff2'; ctx.shadowBlur = .027;
    const g = ctx.createRadialGradient(ball.x - ball.r * .3, ball.y - ball.r * .35, ball.r * .08, ball.x, ball.y, ball.r * 1.3);
    g.addColorStop(0, '#fff'); g.addColorStop(.25, '#eaffff'); g.addColorStop(.68, '#70efe1'); g.addColorStop(1, '#55bbb8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function draw(time) {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake) * .004, rand(-shake, shake) * .004);
    drawBackground(time);
    for (const brick of bricks) if (brick.alive) drawBrick(brick, time);
    // Wave index / atmosphere in the lower play zone.
    ctx.save(); ctx.globalAlpha = .14; ctx.fillStyle = '#9eabc8'; ctx.font = `500 ${W * .012}px "DM Mono", monospace`;
    ctx.textAlign = 'left'; ctx.fillText(`AFTERLIGHT  /  ${String(wave).padStart(2, '0')}`, W * .065, .075);
    ctx.textAlign = 'right'; ctx.fillText(`${String(bricks.filter(b => b.alive).length).padStart(2, '0')} TARGETS`, W * .935, .075); ctx.restore();
    drawPaddle(time);
    for (const ball of balls) drawBall(ball);
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = .012;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }
  function frame(now) {
    const dt = lastTime ? Math.min((now - lastTime) / 1000, .04) : 0;
    lastTime = now;
    update(dt); draw(now); requestAnimationFrame(frame);
  }
  function moveTo(clientX) {
    const rect = canvas.getBoundingClientRect();
    pointerX = clamp((clientX - rect.left) / rect.height, bounds().left + paddle.w / 2, bounds().right - paddle.w / 2);
    paddle.target = pointerX;
  }
  canvas.addEventListener('pointermove', e => { moveTo(e.clientX); });
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); moveTo(e.clientX); if (state === 'ready') launch(); });
  canvas.addEventListener('pointerup', () => { pointerX = null; });
  canvas.addEventListener('pointercancel', () => { pointerX = null; });
  function bindControl(id, side) {
    const button = $(id);
    button.addEventListener('pointerdown', e => { e.preventDefault(); side === 'left' ? leftHeld = true : rightHeld = true; button.setPointerCapture?.(e.pointerId); });
    const off = () => { leftHeld = false; rightHeld = false; };
    button.addEventListener('pointerup', off); button.addEventListener('pointercancel', off); button.addEventListener('lostpointercapture', off);
  }
  bindControl('leftControl', 'left'); bindControl('rightControl', 'right');
  window.addEventListener('pointerup', () => { leftHeld = false; rightHeld = false; });
  window.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') leftHeld = true;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') rightHeld = true;
    if (e.key === ' ' || e.key === 'Enter') { if (state === 'ready') launch(); else if (state === 'paused') launch(); }
    if (e.key.toLowerCase() === 'p' || e.key === 'Escape') togglePause();
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') leftHeld = false;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') rightHeld = false;
  });
  $('pauseButton').addEventListener('click', togglePause);
  $('soundButton').addEventListener('click', () => {
    soundOn = !soundOn; $('soundButton').classList.toggle('muted', !soundOn);
    $('soundIcon').textContent = soundOn ? '♫' : '♪'; $('soundButton').querySelector('.sound-label').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    if (soundOn) chirp(520, .06);
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') togglePause(); });

  newPaddle(); resize(); makeBricks(); resetBall(); updateHud();
  playButton.onclick = launch;
  requestAnimationFrame(frame);
})();
