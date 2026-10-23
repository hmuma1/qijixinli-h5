/* ============================================================
   心li篝火 · 交互逻辑
   流程：封面 → 写下 → 点火仪式 → 火苗与回应 → 海报
   纯前端，无后端，无账号
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 工具 ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var rand = function (min, max) { return min + Math.random() * (max - min); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  /* ---------- 内置兜底签库（quotes-data.js 加载失败时保底） ---------- */
  var FALLBACK = {
    farewell: [
      '翻过这一页，去往下一篇',
      '不是忘记，是清理',
      '火光收下了，你安心睡',
      '这件事到此为止，剩下的交给时间',
      '你已经在谷底了，往后每一步都是向上'
    ],
    wish: [
      '你正在去往更好的地方，慢一点也算',
      '先把今晚睡好，世界明天再见',
      '你想要的生活，正在赶来的路上',
      '你会被温柔接住的，再等等',
      '心亮了，路就亮了'
    ]
  };

  /* ---------- 数据 ---------- */
  function poolOf(mode) {
    var q = window.QUOTES;
    if (q && q[mode] && q[mode].length) return q[mode];
    return FALLBACK[mode] || FALLBACK.farewell;
  }

  /* ---------- 火苗编码：无语义、纯随机、不重复观感 ---------- */
  var CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 去掉 0/O/1/I/L，防看错
  function makeCode() {
    var out = '';
    if (window.crypto && crypto.getRandomValues) {
      var buf = new Uint8Array(6);
      crypto.getRandomValues(buf);
      for (var i = 0; i < 6; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    } else {
      for (var j = 0; j < 6; j++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return out;
  }

  /* ============================================================
     音效：Web Audio 现场合成（零音频文件，无加载失败风险）
     - 环境燃烧声：白噪声 + 低通 + 缓慢起伏（火的呼吸感）
     - 点火「噗」：噪声 + 低通下滑 + 快速衰减
     - 火星噼啪：随机短脉冲（高通噪声 burst）
     ============================================================ */
  var AudioFX = {
    ctx: null, master: null, ambGain: null, enabled: true, crackleTimer: null,
    ensure: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        return true;
      } catch (e) { return false; }
    },
    noiseBuffer: function (sec) {
      var n = Math.floor(this.ctx.sampleRate * (sec || 2));
      var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    },
    ambience: function () {
      if (!this.ctx || this.ambGain) return;
      var src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(2); src.loop = true;
      var lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
      var g = this.ctx.createGain(); g.gain.value = 0.1;
      /* LFO：音量缓慢起伏 = 火焰呼吸 */
      var lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.22;
      var lfoG = this.ctx.createGain(); lfoG.gain.value = 0.045;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      src.connect(lp); lp.connect(g); g.connect(this.master);
      src.start(); lfo.start();
      this.ambGain = g;
    },
    stopAmbience: function () {
      if (this.ambGain) {
        try { this.ambGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.8); } catch (e) {}
      }
      if (this.crackleTimer) { clearTimeout(this.crackleTimer); this.crackleTimer = null; }
    },
    ambienceDown: function () {
      if (this.ambGain && this.ctx) {
        try { this.ambGain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.5); } catch (e) {}
      }
    },
    ambienceUp: function () {
      if (this.ambGain && this.ctx && this.enabled) {
        try { this.ambGain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.6); } catch (e) {}
      }
    },
    /* 提交「嗖」：噪声带通频率上扬 + 缓入缓出（信封起飞感，不生硬） */
    whoosh: function () {
      if (!this.ctx || !this.enabled) return;
      var t = this.ctx.currentTime;
      var src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(1.2);
      var bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(420, t);
      bp.frequency.exponentialRampToValueAtTime(3600, t + 0.9);
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.14);
      g.gain.setValueAtTime(0.32, t + 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 1.15);
    },
    /* 纸裂小爆：每字碎裂一声，短促高频 */
    crack: function () {
      if (!this.ctx || !this.enabled) return;
      var t = this.ctx.currentTime;
      var src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(0.05);
      var bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.value = 1600 + Math.random() * 2400;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14 + Math.random() * 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.07);
    },
    /* 金光「叮」：双正弦清亮泛音，心愿模式金光起时 */
    chime: function () {
      if (!this.ctx || !this.enabled) return;
      var t = this.ctx.currentTime;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      g.connect(this.master);
      [1318.5, 1975.5].forEach(function (f) {
        var o = this.ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f;
        o.connect(g); o.start(t); o.stop(t + 0.95);
      }, this);
    },
    /* 心愿飘出：轻量上升气声 */
    swooshUp: function (v) {
      if (!this.ctx || !this.enabled) return;
      var t = this.ctx.currentTime;
      var src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(1);
      var bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 1.5;
      bp.frequency.setValueAtTime(700, t);
      bp.frequency.exponentialRampToValueAtTime(4200, t + 0.85);
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v || 0.18, t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 1.05);
    },
    /* 星闪「铃」：大三和弦泛音 + 长衰减，心愿化作星星时（v1.4） */
    twinkle: function () {
      if (!this.ctx || !this.enabled) return;
      var t = this.ctx.currentTime;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      g.connect(this.master);
      [2093, 2637, 3136].forEach(function (f) {
        var o = this.ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f;
        var og = this.ctx.createGain();
        og.gain.value = f === 2093 ? 1 : 0.5;
        o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.9);
      }, this);
    },
    crackle: function () {
      if (!this.ctx || !this.enabled) return;
      var t = this.ctx.currentTime;
      var src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(0.05);
      var hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2600;
      var g = this.ctx.createGain();
      var v = 0.04 + Math.random() * 0.1;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hp); hp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.06);
      this.crackleTimer = setTimeout((function (self) {
        return function () { self.crackle(); };
      })(this), 120 + Math.random() * 900);
    },
    toggle: function () {
      this.enabled = !this.enabled;
      var b = $('btn-sound');
      if (this.enabled) {
        b.textContent = '音效 · 开'; b.classList.remove('off');
        if (this.ctx && this.ambGain) {
          try { this.ambGain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.4); } catch (e) {}
          var self = this; if (!this.crackleTimer) this.crackle();
        }
      } else {
        b.textContent = '音效 · 关'; b.classList.add('off');
        this.stopAmbience();
      }
      return this.enabled;
    }
  };

  /* ============================================================
     星空 + 城市边缘夜景（远山剪影 + 地平线城市灯火）
     ============================================================ */
  var starsCanvas = $('stars-canvas'), sctx = starsCanvas.getContext('2d');
  var stars = [], cityLights = [];
  function sizeStars() {
    starsCanvas.width = innerWidth;
    starsCanvas.height = innerHeight;
    var horizon = innerHeight * 0.7;
    stars = [];
    var n = Math.floor(innerWidth * innerHeight / 6500);
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight * 0.66,
        r: rand(0.4, 1.6),
        p: Math.random() * Math.PI * 2,
        sp: rand(0.008, 0.03)
      });
    }
    /* 城市灯火：贴着地平线，疏落暖黄，微微闪 */
    cityLights = [];
    var m = Math.floor(innerWidth / 15);
    for (var j = 0; j < m; j++) {
      cityLights.push({
        x: Math.random() * innerWidth,
        y: horizon - rand(-4, innerHeight * 0.05),
        r: rand(0.7, 1.5),
        p: Math.random() * Math.PI * 2,
        sp: rand(0.01, 0.045),
        a: rand(0.35, 0.85)
      });
    }
  }
  function drawStars() {
    var w = starsCanvas.width, h = starsCanvas.height;
    var horizon = h * 0.7;
    sctx.clearRect(0, 0, w, h);

    /* 1. 星星（只在地平线以上） */
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.p += s.sp;
      var a = 0.28 + 0.5 * (0.5 + 0.5 * Math.sin(s.p));
      sctx.beginPath();
      sctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      sctx.fillStyle = 'rgba(255, 244, 225,' + a.toFixed(3) + ')';
      sctx.fill();
    }

    /* 2. 远山剪影（城市边缘） */
    sctx.beginPath();
    sctx.moveTo(0, horizon);
    sctx.bezierCurveTo(w * 0.14, horizon - h * 0.055, w * 0.22, horizon - h * 0.015, w * 0.36, horizon - h * 0.04);
    sctx.bezierCurveTo(w * 0.5, horizon - h * 0.075, w * 0.62, horizon + h * 0.012, w * 0.76, horizon - h * 0.02);
    sctx.bezierCurveTo(w * 0.88, horizon - h * 0.05, w * 0.95, horizon, w, horizon - h * 0.012);
    sctx.lineTo(w, h);
    sctx.lineTo(0, h);
    sctx.closePath();
    sctx.fillStyle = 'rgba(7, 4, 14, 0.94)';
    sctx.fill();

    /* 3. 城市灯火（山脊线上，远处万家灯火） */
    for (var k = 0; k < cityLights.length; k++) {
      var c = cityLights[k];
      c.p += c.sp;
      var la = c.a * (0.55 + 0.45 * Math.sin(c.p));
      sctx.beginPath();
      sctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      sctx.fillStyle = 'rgba(255, 214, 160,' + la.toFixed(3) + ')';
      sctx.fill();
      /* 灯光晕 */
      sctx.beginPath();
      sctx.arc(c.x, c.y, c.r * 3.2, 0, Math.PI * 2);
      sctx.fillStyle = 'rgba(255, 190, 120,' + (la * 0.12).toFixed(3) + ')';
      sctx.fill();
    }

    requestAnimationFrame(drawStars);
  }
  sizeStars();
  drawStars();
  addEventListener('resize', sizeStars);

  /* ============================================================
     篝火粒子（常驻锚点 + 仪式增强）
     ============================================================ */
  function Fire(canvas, opts) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width = opts.w;
    this.h = canvas.height = opts.h;
    this.cx = this.w / 2;
    this.base = this.h * (opts.baseRatio || 0.9);
    this.spread = opts.spread || this.w * 0.11;
    this.boost = 1;
    this.parts = [];
    this.sparks = [];
    this.dead = false;
    var self = this;
    function loop() {
      if (self.dead) return;
      self.step();
      requestAnimationFrame(loop);
    }
    loop();
  }
  /* 画柴堆：三根交叉圆木，火从柴后头冒出来（深棕粗木，和火光强对比） */
  function drawLogs(ctx, cx, base, s) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(44, 26, 14, 0.96)';
    ctx.lineWidth = 7.5 * s;
    ctx.beginPath(); ctx.moveTo(cx - 26 * s, base + 6); ctx.lineTo(cx + 22 * s, base - 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 22 * s, base - 12); ctx.lineTo(cx + 26 * s, base + 6); ctx.stroke();
    ctx.strokeStyle = 'rgba(60, 37, 21, 0.96)';
    ctx.lineWidth = 9.5 * s;
    ctx.beginPath(); ctx.moveTo(cx - 30 * s, base + 11); ctx.lineTo(cx + 30 * s, base + 3); ctx.stroke();
    /* 柴头炭火 */
    ctx.fillStyle = 'rgba(255, 120, 40, 0.55)';
    ctx.beginPath(); ctx.arc(cx - 26 * s, base + 6, 3.2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 26 * s, base + 6, 3.2 * s, 0, Math.PI * 2); ctx.fill();
  }

  Fire.prototype.step = function () {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    /* 柴堆（先画，火粒子盖中部，两头露出来） */
    drawLogs(ctx, this.cx, this.base, this.w / 220);

    // 主火苗粒子（v1.6 自然火形：上尖下宽 + 热流摆动 + 参差顶端）
    var rate = 3 + this.boost * 2;
    for (var i = 0; i < rate; i++) {
      var vy = rand(-1.1, -3.8) * (0.75 + this.boost * 0.3);
      /* 飞得越高的粒子出生越居中——火舌自然向上收尖 */
      var narrow = (vy + 1.1) / 2.7;
      var xr = rand(-this.spread, this.spread) * (1 - 0.5 * narrow) * (0.5 + 0.5 * Math.random());
      this.parts.push({
        x: this.cx + xr,
        y: this.base + rand(-10, 4),
        vx: rand(-0.15, 0.15),
        vy: vy,
        wob: rand(0.02, 0.06),       /* 热流摆动频率 */
        wobA: rand(0.08, 0.3),       /* 摆幅（收敛：火体不横向铺满画布） */
        ph: rand(0, Math.PI * 2),    /* 相位 */
        age: 0,
        life: 1,
        decay: rand(0.009, 0.03) / (0.8 + this.boost * 0.2),
        size: rand(9, 22) * (0.75 + this.boost * 0.22)
      });
    }

    // 火星（仪式时向上喷）
    if (this.boost > 1.5 && Math.random() < 0.35 * this.boost) {
      this.sparks.push({
        x: this.cx + rand(-this.spread, this.spread),
        y: this.base,
        vx: rand(-0.5, 0.5),
        vy: rand(-2.2, -4.2),
        life: 1,
        decay: rand(0.008, 0.02)
      });
    }

    var p, k;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i];
      p.age++;
      /* 横向热流摆动 + 上升减速，火舌扭动不呆板 */
      p.x += p.vx + Math.sin(p.age * p.wob + p.ph) * p.wobA;
      p.y += p.vy;
      p.vy *= 0.995;
      p.life -= p.decay;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      // 颜色：亮金 → 橙 → 深红 → 透明（提高橙色占比，小温暖感）
      var l = p.life;
      if (l > 0.66) k = 'rgba(255,214,140,' + (0.85 * l).toFixed(3) + ')';
      else if (l > 0.36) k = 'rgba(255,157,69,' + (0.7 * l).toFixed(3) + ')';
      else k = 'rgba(216,70,30,' + (0.5 * l).toFixed(3) + ')';
      /* 上升中粒子收缩：火舌向顶端收细，末端渐隐 */
      var r = p.size * (0.14 + l * 0.86);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, k);
      g.addColorStop(1, 'rgba(216,70,30,0)');
      ctx.fillStyle = g;
      ctx.fill();
    }

    for (i = this.sparks.length - 1; i >= 0; i--) {
      p = this.sparks[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.008; p.life -= p.decay;
      if (p.life <= 0) { this.sparks.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6 * p.life + 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,200,107,' + (0.9 * p.life).toFixed(3) + ')';
      ctx.fill();
    }

    // 底部余烬光（与地面衔接）
    var glow = ctx.createRadialGradient(this.cx, this.base, 0, this.cx, this.base, 90 * this.boost);
    glow.addColorStop(0, 'rgba(255,140,50,0.22)');
    glow.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.w, this.h);

    /* 四边柔化（v1.8）：把画布自身 alpha 按渐变乘掉——火苗四面化入环境。
       不用 CSS mask：mask-composite:add 是并集语义，横/纵不透明区互相抵消，
       中部的底边 fade 被中间列盖住，余光画到画布底边成一条硬横线（v1.7 教训）。
       destination-in 相乘语义 = 四边各自独立淡出，最可靠 */
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    var ft = ctx.createLinearGradient(0, 0, 0, this.h * 0.16);
    ft.addColorStop(0, 'rgba(0,0,0,0)');
    ft.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = ft;
    ctx.fillRect(0, 0, this.w, this.h * 0.16);
    var fb = ctx.createLinearGradient(0, this.h * 0.64, 0, this.h);
    fb.addColorStop(0, 'rgba(0,0,0,1)');
    fb.addColorStop(0.92, 'rgba(0,0,0,0.25)');
    fb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fb;
    ctx.fillRect(0, this.h * 0.64, this.w, this.h * 0.36);
    var fx = ctx.createLinearGradient(0, 0, this.w, 0);
    fx.addColorStop(0, 'rgba(0,0,0,0)');
    fx.addColorStop(0.3, 'rgba(0,0,0,1)');
    fx.addColorStop(0.7, 'rgba(0,0,0,1)');
    fx.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fx;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  };
  Fire.prototype.setBoost = function (v) { this.boost = v; };

  var fire = new Fire($('fire-canvas'), { w: 260, h: 300, baseRatio: 0.88 });
  var fireGlow = $('fire-glow');

  /* 仪式时：火焰适度放大（依然克制，不暴涨），环境光晕同步增强。
     铁律：不改 canvas 的 CSS 宽高——模拟空间必须等于显示空间，
     一旦拉伸，粒子会被拉成竖椭圆、火体横向顶到遮罩羽化起点显出方框边 */
  function fireGrow() {
    fire.setBoost(1.5);
    if (fireGlow) fireGlow.style.opacity = '1';
  }
  function fireCalm() {
    fire.setBoost(1);
    if (fireGlow) fireGlow.style.opacity = '';
  }

  /* ============================================================
     屏幕切换
     ============================================================ */
  var current = 's-intro';
  function show(id) {
    var el = $(id);
    if (!el || id === current) return;
    $(current).classList.remove('active');
    el.classList.add('active');
    current = id;
  }

  /* ============================================================
     交互
     ============================================================ */
  var mode = 'farewell';
  var input = $('write-input');
  var btnIgnite = $('btn-ignite');
  var charCount = $('char-count');

  var PROMPTS = {
    farewell: '今晚你想烧掉什么？',
    wish: '今晚你有什么心愿？'
  };
  var PLACEHOLDERS = {
    farewell: '写下一件具体的事，越具体，火越烧得干净',
    wish: '写下一个具体的心愿，越具体越好'
  };

  /* 模式切换 */
  var modeBtns = document.querySelectorAll('.mode-btn');
  Array.prototype.forEach.call(modeBtns, function (b) {
    b.addEventListener('click', function () {
      if (b.classList.contains('active')) return;
      Array.prototype.forEach.call(modeBtns, function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      mode = b.getAttribute('data-mode');
      $('write-prompt').textContent = PROMPTS[mode];
      input.placeholder = PLACEHOLDERS[mode];
      input.focus();
    });
  });

  /* 字数与点火按钮 */
  input.addEventListener('input', function () {
    var len = input.value.length;
    charCount.textContent = len + ' / 140';
    btnIgnite.disabled = len < 2;
  });

  /* 开始：进入火边，环境燃烧声起（用户手势内初始化，符合微信播放政策） */
  $('btn-start').addEventListener('click', function () {
    show('s-write');
    if (AudioFX.ensure() && AudioFX.enabled) {
      AudioFX.ambience();
      AudioFX.crackle();
    }
    setTimeout(function () { input.focus(); }, 400);
  });

  /* ============================================================
     点火仪式：倒计时 → 文字化火 → 结果
     ============================================================ */
  var cdEl = $('countdown');
  var burnLine = $('burn-line');
  var busy = false;

  function runCountdown(done) {
    var seq = ['3', '2', '1'];
    var i = 0;
    cdEl.textContent = '';
    (function next() {
      if (i >= seq.length) { cdEl.textContent = ''; done(); return; }
      cdEl.textContent = seq[i];
      cdEl.classList.remove('tick');
      void cdEl.offsetWidth; /* 重启动画 */
      cdEl.classList.add('tick');
      i++;
      setTimeout(next, 1000);
    })();
  }

  /* ============================================================
     仪式核心：双模式（v1.8 每字独立碎裂下落 / 每字独立上飘 / 火四面柔化）
     布局铁律：文字在火堆上空燃烧/升飘，不与火苗重叠，内容始终清晰
     - 烧掉：大字停留 4s → 逐字独立：烘烤（近黑→深灰→暖灰）→ 碎裂，
       原字隐去、**字本身随机裂成 6-9 个小碎块**，一裂开就连贯下落
       （重力加速、边落边炭化，不停留），没有额外的纸屑
     - 心愿：大字停留 3.5s → 整行渐亮（暗→金→白金）→ 每个字独立缓慢
       上飘（有高有低、有左有右、各自路径与时长）→ 淡出（不烧）
     全部音效均在「点火」手势链内触发，合规
     ============================================================ */
  /* 随机碎裂轮廓：把字形横向随机切成 n 段（部分段再左右切），
     合起来完整覆盖——碎裂瞬间视觉无缝，每字裂法都不同 */
  function randomFragBands(n) {
    var cuts = [];
    var prev = 0.1;
    for (var i = 1; i < n; i++) {
      prev = prev + (1 - prev) * (0.35 + Math.random() * 0.5);
      cuts.push(prev);
    }
    var bands = [];
    var top = 0;
    for (var j = 0; j < cuts.length; j++) {
      var bot = cuts[j];
      if (Math.random() < 0.3) {
        /* 这一条再左右切两半，裂得更碎 */
        var mid = 30 + Math.random() * 40;
        bands.push('inset(' + (top * 100).toFixed(1) + '% ' + (100 - mid).toFixed(1) + '% ' + ((1 - bot) * 100).toFixed(1) + '% 0)');
        bands.push('inset(' + (top * 100).toFixed(1) + '% 0 ' + ((1 - bot) * 100).toFixed(1) + '% ' + mid.toFixed(1) + '%)');
      } else {
        bands.push('inset(' + (top * 100).toFixed(1) + '% 0 ' + ((1 - bot) * 100).toFixed(1) + '% 0)');
      }
      top = bot;
    }
    /* 最后一条（cuts 末尾到 100%） */
    if (Math.random() < 0.3) {
      var mid2 = 30 + Math.random() * 40;
      bands.push('inset(' + (top * 100).toFixed(1) + '% ' + (100 - mid2).toFixed(1) + '% 0 0)');
      bands.push('inset(' + (top * 100).toFixed(1) + '% 0 0 ' + mid2.toFixed(1) + '%)');
    } else {
      bands.push('inset(' + (top * 100).toFixed(1) + '% 0 0 0)');
    }
    return bands;
  }

  function ritualText(text, done) {
    burnLine.innerHTML = '';
    burnLine.className = 'burn-line';
    /* 仪式大字：短文本字巨大，长文本自动收缩不炸屏 */
    var len = text.length;
    burnLine.classList.add(len <= 8 ? 'big-xl' : len <= 16 ? 'big-lg' : len <= 40 ? 'big-md' : 'big-sm');

    /* 两种模式都逐字独立成 span：烧掉=每字独立碎裂；心愿=每字独立上飘 */
    var chars = text.split('');
    var frag = document.createDocumentFragment();
    var spans = [];
    for (var i = 0; i < chars.length; i++) {
      var s = document.createElement('span');
      s.className = 'ch';
      /* 原字包一层 .glyph：碎裂时可单独隐去（裸文本节点无法单独隐藏，
         而隐藏父级 .ch 会把碎块子树一起透明掉） */
      var g = document.createElement('span');
      g.className = 'glyph';
      g.textContent = chars[i];
      s.appendChild(g);
      frag.appendChild(s);
      spans.push(s);
    }
    burnLine.appendChild(frag);

    if (mode === 'wish') {
      /* 心愿不烧：停留 → 渐亮 → 每字独立路径缓慢上飘，飞向远方天空（v1.8 删星） */
      setTimeout(function () {
        burnLine.classList.add('glow');
        AudioFX.chime();
      }, 3500);
      spans.forEach(function (s, i) {
        setTimeout(function () {
          s.classList.add('rising');
          s.style.setProperty('--rise', (200 + Math.random() * 220).toFixed(0) + 'px');     /* 上飘 200-420px：有高有低 */
          s.style.setProperty('--drift', (Math.random() * 120 - 60).toFixed(0) + 'px');     /* 横向 ±60：有左有右 */
          s.style.setProperty('--rdur', (2600 + Math.random() * 1600).toFixed(0) + 'ms');   /* 2.6-4.2s：各自节奏 */
          s.style.setProperty('--rrot', (Math.random() * 24 - 12).toFixed(1) + 'deg');
          if (i === 0) AudioFX.swooshUp(0.14);
        }, 4800 + Math.random() * 1300);   /* 0-1.3s 错峰起飞，不排成一行往上冲 */
      });
      /* 心愿飘到高处：一声远去的铃 */
      setTimeout(function () { AudioFX.twinkle(); }, 7800);
      setTimeout(done, 10600);
      return;
    }

    /* 烧掉：每字独立——烘烤 → 碎裂成小块 → 立即连贯下落 */
    var hold = 4000;                           /* 大字停留时长 */
    var toast = 900;                           /* 烘烤（炭化渐变）时长 */
    var stagger = chars.length > 20 ? 30 : 70; /* 每字启动间隔，一张一张；长文自动加快 */
    chars.forEach(function (c, i) {
      /* ① 烘烤：颜色从近黑慢慢焙成暖灰 */
      setTimeout(function () {
        spans[i].classList.add('toasting');
        fire.setBoost(1.9);
      }, hold + i * stagger + (Math.random() * 60 - 30));
      /* ② 碎裂：原字隐去，字本身随机裂成小块，立即连贯下落 */
      setTimeout(function () {
        var s = spans[i];
        s.classList.remove('toasting');
        s.classList.add('cracking');
        /* 原字当场隐去（碎块同位置同色接棒，视觉无缝） */
        var gl = s.querySelector('.glyph');
        if (gl) gl.style.opacity = '0';
        /* 字本身裂成 6-9 块（长文 4-6 块，防低端机卡顿）：随机横切+部分左右切 */
        var n = chars.length > 20 ? 4 + Math.floor(Math.random() * 3) : 6 + Math.floor(Math.random() * 4);
        var bands = randomFragBands(n);
        for (var k = 0; k < bands.length; k++) {
          var fr = document.createElement('span');
          fr.className = 'frag';
          fr.textContent = c;
          fr.style.clipPath = bands[k];
          fr.style.setProperty('--fdx', (Math.random() * 200 - 100).toFixed(0) + 'px');       /* 横向 ±100 */
          fr.style.setProperty('--fdy', (150 + Math.random() * 130).toFixed(0) + 'px');       /* 连贯下落 150-280px */
          fr.style.setProperty('--frot', (Math.random() * 900 - 450).toFixed(0) + 'deg');     /* 翻滚 */
          fr.style.setProperty('--fdur', (2400 + Math.random() * 1200).toFixed(0) + 'ms');    /* 2.4-3.6s */
          fr.style.animationDelay = (Math.random() * 0.1).toFixed(2) + 's';
          s.appendChild(fr);
        }
        AudioFX.crack();
      }, hold + i * stagger + toast + (Math.random() * 60 - 30));
    });

    /* 末字碎裂瞬间：火星脉冲（火焰短暂窜高，仍克制） */
    var lastAt = hold + chars.length * stagger + toast + 60;
    setTimeout(function () { fire.setBoost(2.4); }, lastAt);
    /* 碎块连贯下落 + 余量后收尾 */
    setTimeout(done, lastAt + 3800);
  }

  btnIgnite.addEventListener('click', function () {
    if (busy) return;
    var text = input.value.trim();
    if (text.length < 2) return;
    busy = true;
    /* 音效：环境声应已在（点「点燃篝火」时起）；此处补点火「噗」，没有环境声则兜底起 */
    if (AudioFX.ensure() && AudioFX.enabled) {
      if (!AudioFX.ambGain) { AudioFX.ambience(); AudioFX.crackle(); }
      AudioFX.whoosh();
    }
    show('s-fire');
    fireGrow();
    runCountdown(function () {
      ritualText(text, function () {
        fireCalm();
        busy = false;
        /* 仪式结束：环境声压低但不熄，留在背景 */
        AudioFX.ambienceDown();
        showResult(text);
      });
    });
  });

  /* ============================================================
     结果：火苗编码 + 一句回应
     ============================================================ */
  var lastQuote = '';

  function showResult(text) {
    var code = makeCode();
    var pool = poolOf(mode);
    var quote = pick(pool);
    /* 避免同一次会话连续两句完全相同 */
    var guard = 0;
    while (pool.length > 1 && quote === lastQuote && guard++ < 5) quote = pick(pool);
    lastQuote = quote;

    $('fire-code').textContent = '#' + code;

    /* 回应淡入 */
    var qEl = $('quote-text');
    qEl.textContent = '';
    qEl.style.opacity = '0';
    setTimeout(function () {
      qEl.textContent = quote;
      qEl.style.transition = 'opacity 1.2s ease';
      qEl.style.opacity = '1';
    }, 500);

    /* 访问计数（本地真实计数） */
    var key = 'xinli_bonfire_count';
    var n = 0;
    try { n = (parseInt(localStorage.getItem(key), 10) || 0) + 1; localStorage.setItem(key, String(n)); } catch (e) {}
    $('visit-count').textContent = n > 1 ? '这是你第 ' + n + ' 次点燃篝火' : '';

    /* 供海报使用 */
    $('poster-code').textContent = '#' + code;
    $('poster-quote').textContent = quote;

    show('s-result');
  }

  /* 再点一次 */
  $('btn-again').addEventListener('click', function () {
    input.value = '';
    charCount.textContent = '0 / 140';
    btnIgnite.disabled = true;
    AudioFX.ambienceUp();
    show('s-write');
    setTimeout(function () { input.focus(); }, 400);
  });

  /* 音效开关 */
  $('btn-sound').addEventListener('click', function () {
    var on = AudioFX.toggle();
    /* 首次开启时若 AudioContext 未建（无手势历史），补一个手势内初始化 */
    if (on) { AudioFX.ensure(); AudioFX.ambience(); }
  });

  /* ============================================================
     海报生成
     ============================================================ */
  var posterModal = $('poster-modal');
  var posterImg = $('poster-img');

  function renderPoster() {
    if (typeof html2canvas === 'undefined') {
      alert('海报组件加载失败，直接截图保存也可以');
      return;
    }
    html2canvas($('poster-card'), {
      scale: 1,
      useCORS: true,
      backgroundColor: '#0b0714',
      logging: false
    }).then(function (cv) {
      posterImg.src = cv.toDataURL('image/png');
      posterModal.classList.add('show');
    }).catch(function () {
      alert('海报生成失败，截图保存也可以');
    });
  }

  /* 海报离屏区里也画一堆火（静态几帧即可，html2canvas 拍的是当前帧） */
  var posterFire = $('poster-fire');
  (function drawPosterFire() {
    var ctx = posterFire.getContext('2d');
    posterFire.width = 460; posterFire.height = 560;
    var w = 460, h = 560;
    /* 预渲染 60 帧粒子后的静态火 */
    var parts = [];
    for (var f = 0; f < 60; f++) {
      for (var i = 0; i < 6; i++) {
        parts.push({
          x: w / 2 + rand(-60, 60),
          y: h * 0.86,
          vx: rand(-0.3, 0.3),
          vy: rand(-1.4, -3.0),
          life: 1,
          decay: rand(0.012, 0.026),
          size: rand(7, 19)
        });
      }
    }
    ctx.clearRect(0, 0, w, h);
    /* 柴堆 */
    drawLogs(ctx, w / 2, h * 0.86, w / 220);
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      var l = p.life;
      var col = l > 0.66 ? 'rgba(255,214,140,' + (0.8 * l) + ')'
              : l > 0.36 ? 'rgba(255,157,69,' + (0.65 * l) + ')'
              : 'rgba(216,70,30,' + (0.45 * l) + ')';
      ctx.beginPath();
      ctx.arc(p.x + p.vx * 40, p.y + p.vy * 40, p.size * (0.4 + l * 0.6), 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }
    var glow = ctx.createRadialGradient(w / 2, h * 0.88, 0, w / 2, h * 0.88, 130);
    glow.addColorStop(0, 'rgba(255,140,50,0.25)');
    glow.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  })();

  $('btn-poster').addEventListener('click', function () {
    /* 等结果文字稳定一帧再拍 */
    setTimeout(renderPoster, 150);
  });
  $('btn-close-poster').addEventListener('click', function () {
    posterModal.classList.remove('show');
  });
  posterModal.addEventListener('click', function (e) {
    if (e.target === posterModal) posterModal.classList.remove('show');
  });

})();
