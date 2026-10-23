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
    whoosh: function () {
      if (!this.ctx || !this.enabled) return;
      var t = this.ctx.currentTime;
      var src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(1);
      var lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(180, t + 0.7);
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      src.connect(lp); lp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.9);
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
    this.spread = opts.spread || this.w * 0.16;
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
  /* 画柴堆：三根交叉圆木，火从柴后头冒出来 */
  function drawLogs(ctx, cx, base, s) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(52, 32, 18, 0.95)';
    ctx.lineWidth = 6.5 * s;
    ctx.beginPath(); ctx.moveTo(cx - 24 * s, base + 5); ctx.lineTo(cx + 20 * s, base - 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 20 * s, base - 11); ctx.lineTo(cx + 24 * s, base + 5); ctx.stroke();
    ctx.strokeStyle = 'rgba(64, 40, 22, 0.95)';
    ctx.lineWidth = 8 * s;
    ctx.beginPath(); ctx.moveTo(cx - 28 * s, base + 9); ctx.lineTo(cx + 28 * s, base + 2); ctx.stroke();
    /* 柴头炭火光 */
    ctx.fillStyle = 'rgba(255, 120, 40, 0.5)';
    ctx.beginPath(); ctx.arc(cx - 24 * s, base + 5, 3 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 24 * s, base + 5, 3 * s, 0, Math.PI * 2); ctx.fill();
  }

  Fire.prototype.step = function () {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    /* 柴堆（先画，火粒子盖中部，两头露出来） */
    drawLogs(ctx, this.cx, this.base, this.w / 220);

    // 主火苗粒子
    var rate = 3 + this.boost * 2;
    for (var i = 0; i < rate; i++) {
      this.parts.push({
        x: this.cx + rand(-this.spread, this.spread) * (0.6 + 0.4 * Math.random()),
        y: this.base + rand(-6, 6),
        vx: rand(-0.35, 0.35),
        vy: rand(-1.5, -3.4) * (0.7 + this.boost * 0.35),
        life: 1,
        decay: rand(0.012, 0.026) / (0.75 + this.boost * 0.25),
        size: rand(7, 20) * (0.8 + this.boost * 0.3)
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
      p.x += p.vx; p.y += p.vy; p.life -= p.decay;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      // 颜色：亮金 → 橙 → 深红 → 透明（提高橙色占比，小温暖感）
      var l = p.life;
      if (l > 0.66) k = 'rgba(255,214,140,' + (0.85 * l).toFixed(3) + ')';
      else if (l > 0.36) k = 'rgba(255,157,69,' + (0.7 * l).toFixed(3) + ')';
      else k = 'rgba(216,70,30,' + (0.5 * l).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + l * 0.6), 0, Math.PI * 2);
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (0.4 + l * 0.6));
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

    // 底部余烬光
    var glow = ctx.createRadialGradient(this.cx, this.base, 0, this.cx, this.base, 90 * this.boost);
    glow.addColorStop(0, 'rgba(255,140,50,0.22)');
    glow.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.w, this.h);
  };
  Fire.prototype.setBoost = function (v) { this.boost = v; };

  var fire = new Fire($('fire-canvas'), { w: 220, h: 270, baseRatio: 0.92 });

  /* 仪式时：火焰放大（中景小火堆 → 依然克制，不暴涨） */
  function fireGrow() {
    $('fire-canvas').style.transition = 'width .9s ease, height .9s ease';
    $('fire-canvas').style.width = '330px';
    $('fire-canvas').style.height = '410px';
    fire.setBoost(1.7);
  }
  function fireCalm() {
    $('fire-canvas').style.width = '';
    $('fire-canvas').style.height = '';
    fire.setBoost(1);
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
    farewell: '今晚，想烧掉什么？',
    wish: '今晚，心里有什么心愿？'
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

  /* 开始 */
  $('btn-start').addEventListener('click', function () {
    show('s-write');
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

  function burnText(text, done) {
    burnLine.innerHTML = '';
    var chars = text.split('');
    var frag = document.createDocumentFragment();
    var spans = [];
    for (var i = 0; i < chars.length; i++) {
      var s = document.createElement('span');
      s.className = 'ch';
      s.textContent = chars[i];
      s.style.animationDelay = (i * 42) + 'ms';
      frag.appendChild(s);
      spans.push(s);
    }
    burnLine.appendChild(frag);
    /* 全部字烧完（含最后一个字的动画时长） */
    var total = chars.length * 42 + 1150;
    setTimeout(done, total);
  }

  btnIgnite.addEventListener('click', function () {
    if (busy) return;
    var text = input.value.trim();
    if (text.length < 2) return;
    busy = true;
    /* 音效：用户手势内初始化（微信自动播放政策要求），点火「噗」+ 环境声 + 噼啪 */
    if (AudioFX.ensure() && AudioFX.enabled) {
      AudioFX.ambience();
      AudioFX.whoosh();
      AudioFX.crackle();
    }
    show('s-fire');
    fireGrow();
    runCountdown(function () {
      burnText(text, function () {
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
