// game.js — 디럭스 청기백기 본체: 물건 · 명령 · 판정 · 효과
//
// 흐름: 명령을 만든다 → 읽어 준다(자막) → 다 읽은 순간부터 유예 시간을 잰다
//       → 모든 물건이 '기대 상태'와 같아지면 성공, 시간이 다 되면 실패
// 기대 상태 = 직전 판정 뒤의 상태(base) + 이번 명령. 그래서 명령 없이 건드린 것도 틀린다
window.BW = window.BW || {};
(function (BW) {
  const { FLAGS, NAMES, SLOT, PIVOT, MEAT, DRINK, svg } = BW.obj;

  const LIVES = 3;
  const STAGE_CLEARS = 6;          // 이만큼 맞히면 다음 단계
  const SHUFFLE_EVERY = 3;         // 이만큼 명령하면 물건 자리를 섞는다
  const COOK_SEC = 5;              // 한 면이 이만큼 구워지면 익고(1.0) 두 배면 탄다(2.0)
  const ROT_SPEED = 180 / 260;     // 깃발 막대 회전 속도 (도/ms) — 반 바퀴 0.26초
  const FLIP_MS = 240;
  // 한 줄 배치: 물건이 가장 많을 때(8칸) 줄이 판 폭의 ROW_FILL, 높이는 판의 H_FILL을 넘지 않는다
  const SLOT_GAP = 14, N_REF = 8, ROW_FILL = 0.84, H_FILL = 0.4;
  const FLAG_KEYS = ['blue', 'white', 'red', 'black'];
  const SPECIAL = ['elec', 'humid', 'meat', 'drunk'];
  const ORD = ['가장', '두', '세', '네', '다섯', '여섯', '일곱', '여덟'];
  // 다 읽고 난 뒤 주어지는 시간(ms) — 위치로 부르면 조금 더, 속도가 오르면 줄어든다
  const GRACE = { flag: 1500, elec: 1400, humid: 1400, meat: 2800, drunkup: 4600, drunkdown: 1900 };
  const POS_EXTRA = 300;

  const STAGES = [
    { name: '청기 · 백기', add: ['blue', 'white'], say: '청기 백기, 시작!' },
    { name: '적기 · 흑기', add: ['red', 'black'], say: '적기, 흑기 등장!', hint: '명령 3번마다 자리 섞기' },
    { name: '위치 명령', pos: true, say: '이제 위치로도 불러요!', hint: '양쪽에서 네 번째까지' },
    { name: '전기', add: ['elec'], say: '전기 등장!' },
    { name: '습기', add: ['humid'], say: '습기 등장!' },
    { name: '고기', add: ['meat'], say: '고기 등장!', hint: '한 면 5초 익음 · 10초 탐' },
    { name: '취기', add: ['drunk'], say: '취기 등장!', hint: '물은 내려 명령 때만' },
  ];
  BW.STAGES = STAGES;

  const rand = Math.random;
  const flip = (d) => (d === 'up' ? 'down' : 'up');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const verb = (d, last) => (d === 'up' ? (last ? '올려' : '올리고') : last ? '내려' : '내리고');
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // 고기 색: 날것 → 익음(1) → 탐(2)
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const RAW = hex('#e2646c'), DONE = hex('#a8643a'), BURNT = hex('#22150f');
  const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
  const meatColor = (c) => (c <= 1 ? mix(RAW, DONE, c) : mix(DONE, BURNT, Math.pow(clamp(c - 1, 0, 1), 1.6)));

  const G = { alive: false, token: 0, phase: 'idle', raf: 0 };
  let bodies = {};   // 키 → 몸체 { el, x, y, w, h, hx, hy(제자리), vx, vy, fixed }
  let el = null;

  // ── 준비 ──
  function init() {
    const q = (id) => document.getElementById(id);
    el = {
      app: q('app'), card: q('card'), wrap: q('stage-wrap'), stage: q('stage'), vapor: q('vapor'),
      score: q('score'), best: q('best'), badge: q('stage-badge'), lives: q('lives'),
      timer: q('timer'), timerFill: q('timer-fill'), caption: q('caption'),
      mark: q('mark'), markIcon: q('mark-icon'), markText: q('mark-text'), toast: q('toast'),
      pause: q('pause'), over: q('over'), overScore: q('over-score'), overBadge: q('over-badge'), overStage: q('over-stage'),
    };
    BW.caption.bind(el.caption);
    el.wrap.addEventListener('pointerdown', onDown);
    el.wrap.addEventListener('pointermove', onMove);
    el.wrap.addEventListener('pointerup', onUp);
    el.wrap.addEventListener('pointercancel', onUp);
    el.wrap.addEventListener('contextmenu', (e) => e.preventDefault());
    if (window.ResizeObserver) new ResizeObserver(() => { if (G.alive) fit(); }).observe(el.wrap);
    else window.addEventListener('resize', () => { if (G.alive) fit(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  }

  function start(startStage) {
    if (!el) init();
    stop();
    startStage = clamp(startStage | 0, 0, STAGES.length - 1);
    Object.assign(G, {
      alive: true, phase: 'intro', stage: startStage, stageClears: 0, score: 0, lives: LIVES, streak: 0,
      unlocked: new Set(), posOn: startStage >= 2, flagOrder: [], flags: {},
      elecOn: true, humidOn: false, drunk: false,
      meat: { loc: 'plate', from: 'plate', held: false, top: 0, bottom: 0, flipT: 0, x: 0, y: 0 },
      bottle: { held: false, x: 0, y: 0, tilt: 0, pouring: false, placed: false }, shot: 0, water: 1,
      slots: [], sinceShuffle: 0,
      base: {}, expected: null, cmd: null, since: { elec: 0, humid: 0, meat: 0, drunk: 0 }, lastText: '',
      wobA: 0, wobT: 0, vapor: [], vaporAcc: 0, smoke: [], smokeAcc: 0, drag: null,
      best: BW.store.stats().best,
    });
    for (let i = 0; i <= startStage; i++) for (const k of STAGES[i].add || []) G.unlocked.add(k);
    G.flagOrder = FLAG_KEYS.filter((k) => G.unlocked.has(k));
    ensureObjects();
    G.slots = shuffle(Object.keys(bodies));
    fit();
    rebase();
    hud();
    el.over.hidden = true;
    el.pause.hidden = true;
    el.vapor.hidden = false;
    G.last = performance.now();
    if (!G.raf) G.raf = requestAnimationFrame(frame);
    const intro = startStage === 0 ? STAGES[0] : { say: `${startStage + 1}단계부터, 시작!`, hint: STAGES[startStage].hint };
    runLoop(++G.token, intro);
  }

  // 게임을 접는다 (홈으로 나가거나 새 판 직전)
  function stop() {
    if (!el) return;
    if (G.alive && G.phase !== 'over') saveStats(false);
    G.alive = false;
    G.token++;
    G.phase = 'idle';
    G.drag = null;
    BW.speech.stop();
    BW.caption.hide();
    setTimer(null);
    el.app.classList.remove('is-blackout');
    el.wrap.classList.remove('is-drunk');
    clearParticles();
    el.stage.innerHTML = '';
    bodies = {};
    el.mark.className = 'mark';
    el.toast.classList.remove('is-on');
  }

  function saveStats(finished) {
    const s = BW.store.stats();
    if (finished) s.games++;
    const isBest = G.score > s.best;
    s.best = Math.max(s.best, G.score);
    s.bestStage = Math.max(s.bestStage || 0, Math.min(G.stage, STAGES.length - 1));
    BW.store.saveStats(s);
    return { s, isBest };
  }

  // ── 물건 만들기 ──
  function addBody(key, kind, html, hit) {
    const d = document.createElement('div');
    d.className = `obj obj-${kind} is-new`;
    if (hit) d.dataset.hit = hit;
    d.innerHTML = html;
    const s = SLOT;
    d.style.width = s.w + 'px';
    d.style.height = s.h + 'px';
    el.stage.appendChild(d);
    setTimeout(() => d.classList.remove('is-new'), 600);
    return (bodies[key] = { key, kind, el: d, w: s.w, h: s.h, x: 0, y: 0, hx: 0, hy: 0, vx: 0, vy: 0, sp: 0, th: 0, placed: false, fixed: false });
  }
  function addItem(kind, html, hit) {
    const d = document.createElement('div');
    d.className = `item item-${kind}`;
    if (hit) d.dataset.hit = hit;
    d.innerHTML = html;
    el.stage.appendChild(d);
    return d;
  }

  function ensureObjects() {
    if (!G.smokeLayer || !G.smokeLayer.isConnected) {
      G.smokeLayer = document.createElement('div');
      G.smokeLayer.className = 'smoke-layer';
      el.stage.appendChild(G.smokeLayer);
      G.fxLayer = document.createElement('div');
      G.fxLayer.className = 'fx-layer';
      el.stage.appendChild(G.fxLayer);
    }
    for (const k of G.flagOrder) {
      if (bodies[k]) continue;
      const b = addBody(k, 'flag', svg.flag(k), 'flag:' + k);
      b.pole = b.el.querySelector('.pole');
      G.flags[k] = { angle: 180, target: 180, drawn: 180 };
    }
    if (G.unlocked.has('elec') && !bodies.elec) addBody('elec', 'elec', svg.elec(), 'elec');
    if (G.unlocked.has('humid') && !bodies.humid) addBody('humid', 'humid', svg.humid(), 'humid');
    if (G.unlocked.has('meat') && !bodies.meat) {
      addBody('meat', 'meat', svg.meatStation());
      G.meatEl = addItem('meat', svg.meat(), 'meat');
      G.meatG = G.meatEl.querySelector('.meat-g');
      G.meatBody = G.meatEl.querySelector('.meat-body');
      G.meatMarks = G.meatEl.querySelector('.meat-marks');
    }
    if (G.unlocked.has('drunk') && !bodies.drunk) {
      const b = addBody('drunk', 'drink', svg.drink());
      b.fixed = true; // 술상은 취해도 제자리
      b.waterLiq = b.el.querySelector('.water-liq');
      b.shotLiq = b.el.querySelector('.shot-liq');
      G.bottleEl = addItem('bottle', svg.bottle(), 'bottle');
      G.streamEl = document.createElement('div');
      G.streamEl.className = 'stream';
      el.stage.appendChild(G.streamEl);
    }
  }

  // ── 배치: 모든 물건이 같은 칸 크기로 한 줄에 선다 (G.slots 순서) ──
  // 무대 크기는 물건이 가장 많을 때(8칸)를 기준으로 정해서, 물건이 늘어도 크기가 그대로다
  function fit() {
    const cw = el.wrap.clientWidth, ch = el.wrap.clientHeight;
    if (!cw || !ch) return;
    const rowRef = N_REF * SLOT.w + (N_REF - 1) * SLOT_GAP;
    const fill = cw < ch ? 0.97 : ROW_FILL; // 세로 화면은 폭이 빠듯해서 줄을 거의 끝까지 쓴다
    const W = Math.max(rowRef / fill, ((SLOT.h / H_FILL) * cw) / ch, cw / 1.7);
    G.W = W; G.H = (W * ch) / cw; G.cw = cw; G.ch = ch; G.scale = cw / W;
    el.stage.style.width = W + 'px';
    el.stage.style.height = G.H + 'px';
    const n = G.slots.length;
    const x0 = (W - (n * SLOT.w + (n - 1) * SLOT_GAP)) / 2;
    const y0 = (G.H - SLOT.h) / 2;
    G.slots.forEach((k, i) => {
      const b = bodies[k];
      if (!b) return;
      b.hx = x0 + i * (SLOT.w + SLOT_GAP);
      b.hy = y0;
      if (!b.placed) { b.x = b.hx; b.y = b.hy; b.placed = true; }
    });
    const wr = el.wrap.getBoundingClientRect(), vr = el.vapor.getBoundingClientRect();
    G.wrapOff = { x: wr.left - vr.left, y: wr.top - vr.top };
    G.vw = vr.width; G.vh = vr.height;
    updateView(0);
  }

  // ── 상태 ──
  // moving: 돌아가는 중인 깃발 · 들고 있는 고기는 올려도 내려도 아니다
  function stateOf(snap) {
    const s = {};
    for (const k of G.flagOrder) {
      const f = G.flags[k];
      const t = f.target === 0 ? 'up' : 'down';
      s[k] = snap || f.angle === f.target ? t : 'moving';
    }
    if (bodies.elec) s.elec = G.elecOn ? 'up' : 'down';
    if (bodies.humid) s.humid = G.humidOn ? 'up' : 'down';
    if (bodies.meat) {
      const loc = G.meat.held ? G.meat.from : G.meat.loc;
      s.meat = G.meat.held && !snap ? 'moving' : loc === 'grill' ? 'up' : 'down';
    }
    if (bodies.drunk) s.drunk = G.drunk ? 'up' : 'down';
    return s;
  }
  function rebase() {
    const s = stateOf(true);
    for (const k of SPECIAL) if (k in s && s[k] !== G.base[k]) G.since[k] = 0;
    G.base = s;
  }
  // 명령과 상관없이 정당하게 바뀐 상태 (다 익은 고기를 내림, 탄 고기 치움)
  function setBase(k, v) {
    if (G.base[k] !== v) G.since[k] = 0;
    G.base[k] = v;
    if (G.expected) G.expected[k] = v;
  }
  const commandActive = () => G.cmd && (G.phase === 'speaking' || G.phase === 'waiting');
  const cmdHas = (key, dir) => commandActive() && G.cmd.parts.some((p) => p.key === key && p.dir === dir && !p.neg);
  const playable = () => G.alive && G.phase !== 'paused' && G.phase !== 'over' && G.phase !== 'idle';

  // ── 명령 만들기 ──
  // 위치는 지금 왼쪽부터 늘어선 순서 (깃발이든 다른 물건이든)
  const byX = () => Object.keys(bodies).sort((a, b) => bodies[a].x - bodies[b].x);
  function posKey(side, n) {
    const o = byX();
    return side === 'left' ? o[n - 1] : o[o.length - n];
  }
  function posNoun(side, n) {
    const s = side === 'left' ? '왼쪽' : '오른쪽';
    return n === 1 ? `가장 ${s}` : `${s} ${ORD[n - 1]} 번째`;
  }
  const isFlag = (k) => !!FLAGS[k];
  const kindOf = (k) => (isFlag(k) ? 'flag' : k);

  // 무엇을 부를지: 깃발 전체가 3, 특수 물건은 지금 상태에 따라 (켜 둔 지 오래면 끄라고 할 확률이 오른다)
  function keyWeights(withHeavy) {
    const list = G.flagOrder.map((k) => ({ k, w: 3 / G.flagOrder.length }));
    const b = G.base, s = G.since;
    if (bodies.elec) list.push({ k: 'elec', w: b.elec === 'up' ? 1.3 : 1.5 + 0.6 * s.elec });
    if (bodies.humid) list.push({ k: 'humid', w: b.humid === 'up' ? 1.5 + 0.6 * s.humid : 1.3 });
    if (withHeavy && bodies.meat) list.push({ k: 'meat', w: b.meat === 'up' ? (s.meat >= 2 ? 0.5 + 0.25 * s.meat : 0.1) : 1.6 });
    if (withHeavy && bodies.drunk) list.push({ k: 'drunk', w: b.drunk === 'up' ? 0.5 + 0.5 * s.drunk : 1.2 });
    return list;
  }
  // 어느 쪽으로: 대개는 지금과 반대, 가끔은 이미 그런 상태 (가만히 있어야 하는 명령)
  function dirFor(k) {
    const cur = G.base[k];
    const pChange = { flag: 0.72, elec: cur === 'up' ? 0.8 : 0.88, humid: cur === 'up' ? 0.88 : 0.8, meat: 0.89, drunk: 0.91 }[kindOf(k)];
    return rand() < pChange ? flip(cur) : cur;
  }
  function weighted(list) {
    let t = list.reduce((s, x) => s + x.w, 0) * rand();
    for (const x of list) if ((t -= x.w) <= 0) return x;
    return list[list.length - 1];
  }
  // 고른 물건을 이름(대부분)이나 위치로 부른다. 위치는 어느 쪽에서든 네 번째까지만
  function describe(key) {
    if (G.posOn && rand() < 0.22) {
      const o = byX(), i = o.indexOf(key);
      const sides = [];
      if (i + 1 <= 4) sides.push(['left', i + 1]);
      if (o.length - i <= 4) sides.push(['right', o.length - i]);
      if (sides.length) {
        const [side, n] = sides[Math.floor(rand() * sides.length)];
        return { kind: 'pos', side, n, noun: posNoun(side, n) };
      }
    }
    return { kind: kindOf(key), noun: NAMES[key] };
  }
  function makePart(withHeavy) {
    const key = weighted(keyWeights(withHeavy)).k;
    return { ...describe(key), key, dir: dirFor(key) };
  }
  // "청기 올리지 말고 ~": 지금과 반대로 바꾸지 말라는 함정 — 그대로 둬야 맞다
  function makeNegPart() {
    const key = weighted(keyWeights(true)).k;
    return { ...describe(key), key, dir: G.base[key], neg: true };
  }
  function compose(parts) {
    const last = parts.length - 1;
    const say = (p, i) => (p.neg ? `${p.dir === 'up' ? '내리지' : '올리지'} 말고` : verb(p.dir, i === last));
    return { parts, text: parts.map((p, i) => `${p.noun} ${say(p, i)}`).join(' ') };
  }
  // 명령 한 줄 = ("A 올리지 말고") + 할 일 1~3개, 모두 합쳐 3개까지
  //  · 말고: 적기·흑기 단계부터  · 두 개짜리: 위치 명령 단계부터  · 세 개짜리: 전기 단계부터
  //  · 고기 · 취기는 할 일이 하나일 때만
  function genOnce() {
    const s = G.stage;
    const p3 = s >= 3 ? Math.min(0.28, 0.12 + 0.03 * (s - 3)) : 0;
    const p2 = s >= 2 ? Math.min(0.4, 0.22 + 0.03 * (s - 2)) : 0;
    const pn = s >= 1 ? Math.min(0.42, 0.26 + 0.03 * (s - 1)) : 0;
    const r = rand();
    let n = r < p3 ? 3 : r < p3 + p2 ? 2 : 1;
    const neg = rand() < pn;
    if (neg && n === 3) n = 2;
    const parts = [];
    const add = (make) => {
      for (let t = 0; t < 10; t++) {
        const p = make();
        if (!parts.some((q) => q.key === p.key)) { parts.push(p); return; }
      }
    };
    if (neg) add(makeNegPart);
    for (let i = 0; i < n; i++) add(() => makePart(n === 1));
    if (!parts.some((p) => !p.neg)) return compose([makePart(true)]);
    return compose(parts);
  }
  function makeCommand() {
    let c = genOnce();
    for (let t = 0; t < 5 && c.text === G.lastText; t++) c = genOnce();
    G.lastText = c.text;
    for (const k in G.since) G.since[k]++;
    return c;
  }

  // ── 속도 ──
  const speedLv = () => Math.max(0, G.stage - (STAGES.length - 1));
  const ttsRate = () => Math.min(1.6, 1.08 + 0.02 * Math.min(G.stage, STAGES.length - 1) + 0.07 * speedLv());
  const graceFactor = () => Math.max(0.55, 1 - 0.06 * speedLv());
  const gapMs = () => Math.max(280, 700 - 50 * speedLv());
  function graceMs(cmd) {
    const act = cmd.parts.filter((p) => !p.neg);
    const each = act.map((p) => {
      const kind = kindOf(p.key);
      return GRACE[kind === 'drunk' ? 'drunk' + p.dir : kind] + (p.kind === 'pos' ? POS_EXTRA : 0);
    });
    // 할 일마다 시간을 그대로 더한다 → 명령이 길수록 시간이 늘어난다
    const sum = each.reduce((a, b) => a + b, 0);
    const negExtra = 350 * (cmd.parts.length - act.length); // "~하지 말고"를 알아듣는 시간
    return (sum + negExtra) * graceFactor();
  }

  // ── 진행 ──
  function speak(text) {
    const ctl = BW.speech.say(text, ttsRate());
    BW.caption.show(text, ctl);
    return ctl;
  }
  async function announce(text, hint) {
    const t = G.token;
    if (hint) toast(hint, 5200);
    await speak(text).done;
    if (t !== G.token) return;
    await sleep(hint ? 900 : 450);
  }

  async function runLoop(token, intro) {
    const alive = () => token === G.token && G.alive;
    if (intro) {
      G.phase = 'intro';
      await sleep(400);
      if (!alive()) return;
      await announce(intro.say, intro.hint);
    }
    while (alive()) {
      if (G.stageClears >= STAGE_CLEARS) {
        G.phase = 'intro';
        await sleep(500);
        if (!alive()) return;
        await stageUp();
        if (!alive()) return;
      } else if (G.sinceShuffle >= SHUFFLE_EVERY && G.slots.length > 2) {
        G.phase = 'intro';
        reshuffle();
        await sleep(1100); // 자리 바뀌는 걸 볼 시간
        if (!alive()) return;
      }
      G.sinceShuffle++;
      const cmd = makeCommand();
      G.cmd = cmd;
      G.expected = null;
      G.phase = 'speaking';
      await speak(cmd.text).done;
      if (!alive()) return;
      // 위치 명령은 다 읽은 순간의 깃발 순서로 정한다 (취하면 깃발이 떠다닌다)
      for (const p of cmd.parts) {
        if (p.kind === 'pos') p.key = posKey(p.side, p.n);
        if (p.neg) p.dir = G.base[p.key]; // "~하지 말고" = 그대로 둔다
      }
      const exp = Object.assign({}, G.base);
      for (const p of cmd.parts) exp[p.key] = p.dir;
      G.expected = exp;
      G.graceTotal = graceMs(cmd);
      G.deadline = performance.now() + G.graceTotal;
      G.phase = 'waiting';
      await new Promise((r) => { G.resolve = r; });
      if (!alive()) return;
      G.phase = 'gap';
      G.cmd = null;
      G.expected = null;
      await sleep(gapMs());
    }
  }

  async function stageUp() {
    G.stage++;
    G.stageClears = 0;
    const def = STAGES[G.stage];
    if (def) {
      const add = (def.add || []).filter((k) => !G.unlocked.has(k));
      add.forEach((k) => G.unlocked.add(k));
      G.flagOrder = FLAG_KEYS.filter((k) => G.unlocked.has(k));
      if (def.pos) G.posOn = true;
      ensureObjects();
      reshuffle(); // 새 물건도 아무 자리에나 끼운다
      rebase();
    }
    saveStats(false);
    hud();
    BW.sound.levelUp();
    await announce(def ? def.say : '속도 업!', def && def.hint);
  }

  // 물건 자리를 섞는다: 여러 번 섞어 본 것 중 자리를 옮긴 물건이 가장 많은 순서 (4분의 3 이상을 노린다)
  // 몸체는 새 자리로 미끄러져 간다
  function reshuffle() {
    const keys = Object.keys(bodies);
    const before = G.slots.filter((k) => bodies[k]);
    const moved = (o) => o.filter((k, i) => before[i] !== k).length;
    let next = shuffle(keys.slice());
    for (let t = 0; t < 24 && moved(next) < Math.max(2, Math.ceil(keys.length * 0.75)); t++) {
      const cand = shuffle(keys.slice());
      if (moved(cand) > moved(next)) next = cand;
    }
    G.slots = next;
    G.sinceShuffle = 0;
    fit();
    BW.sound.shuffle();
    // 자리가 바뀌는 걸 볼 수 있게 전기는 저절로 켜진다 (그 상태가 새 기준)
    if (bodies.elec && !G.elecOn) {
      setElec(true);
      setBase('elec', 'up');
    }
  }

  // ── 판정 ──
  function judgeTick(now) {
    if (G.phase !== 'waiting') return;
    const left = G.deadline - now;
    setTimer(left / G.graceTotal);
    const st = stateOf(false);
    const wrong = Object.keys(G.expected).filter((k) => st[k] !== G.expected[k]);
    if (!wrong.length) finish(true, left);
    else if (left <= 0) finish(false, 0, wrong);
  }
  function finish(ok, left, wrong) {
    G.phase = 'judged';
    setTimer(null);
    if (ok) {
      G.streak++;
      G.stageClears++;
      const pts = Math.round((100 + 60 * clamp(left / G.graceTotal, 0, 1)) * (1 + 0.1 * Math.min(G.streak - 1, 10)));
      addScore(pts);
      BW.sound.ok();
      mark(true, G.streak >= 3 ? `+${pts} · ${G.streak}연속` : `+${pts}`);
    } else {
      const exp = G.expected;
      loseLife('정답: ' + wrong.map((k) => `${NAMES[k]} ${verb(exp[k], true)}`).join(' · '), wrong);
    }
    rebase();
    if (G.phase === 'judged' && G.resolve) G.resolve(ok);
  }
  function loseLife(msg, keys) {
    if (G.phase === 'over') return;
    G.lives--;
    G.streak = 0;
    hud();
    BW.sound.bad();
    mark(false, msg);
    flashWrong(keys);
    if (G.lives <= 0) gameOver();
  }
  function addScore(n) {
    G.score += n;
    el.score.textContent = G.score;
    el.best.textContent = Math.max(G.best, G.score);
  }

  function gameOver() {
    G.token++;
    G.phase = 'over';
    cancelDrag();
    BW.speech.stop();
    BW.caption.hide();
    setTimer(null);
    const { s, isBest } = saveStats(true);
    const reached = STAGES[G.stage] ? `${G.stage + 1}단계 · ${STAGES[G.stage].name}까지` : `마지막 단계 · 속도 ${speedLv()}까지`;
    setTimeout(() => {
      if (G.phase !== 'over' || !G.alive) return;
      el.app.classList.remove('is-blackout');
      el.wrap.classList.remove('is-drunk');
      clearParticles();
      el.overScore.textContent = G.score;
      const best = isBest && G.score > 0;
      el.overBadge.textContent = best ? '최고 기록!' : `최고 ${s.best}`;
      el.overBadge.dataset.status = best ? 'solved' : '';
      el.overStage.textContent = reached;
      el.over.hidden = false;
    }, 1100);
  }

  function pause() {
    if (!G.alive || G.phase === 'paused' || G.phase === 'over' || G.phase === 'idle') return;
    G.token++;
    const was = G.phase;
    G.phase = 'paused';
    cancelDrag();
    BW.speech.stop();
    BW.caption.hide();
    setTimer(null);
    // 진행 중이던 명령은 버린다. 그사이 바꾼 것도 그대로 인정
    if (was === 'speaking' || was === 'waiting') rebase();
    G.cmd = null;
    G.expected = null;
    el.pause.hidden = false;
    el.vapor.hidden = true;
  }
  function resume() {
    if (G.phase !== 'paused') return;
    el.pause.hidden = true;
    el.vapor.hidden = false;
    G.phase = 'gap';
    G.last = performance.now();
    runLoop(++G.token, { say: '다시, 시작!' });
  }

  // ── 조작 ──
  function toStage(e) {
    const r = el.wrap.getBoundingClientRect();
    const p = G.inv.transformPoint(new DOMPoint(e.clientX - r.left, e.clientY - r.top));
    return { x: p.x, y: p.y };
  }

  function onDown(e) {
    if (!playable()) return;
    const hitEl = e.target.closest && e.target.closest('[data-hit]');
    if (!hitEl) return;
    e.preventDefault();
    BW.sound.unlock();
    const h = hitEl.dataset.hit;
    if (h.startsWith('flag:')) return toggleFlag(h.slice(5));
    if (h === 'elec') return toggleElec();
    if (h === 'humid') return toggleHumid();
    if (h === 'shot') return drinkShot(hitEl);
    if (h === 'water') return drinkWater(hitEl);
    if (G.drag) return;
    const p = toStage(e);
    if (h === 'meat') {
      if (G.meat.flipT > 0) return;
      G.drag = { what: 'meat', id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    } else if (h === 'bottle') {
      const b = G.bottle;
      G.drag = { what: 'bottle', id: e.pointerId, dx: p.x - b.x, dy: p.y - b.y, moved: true };
      b.held = true;
    } else return;
    try { el.wrap.setPointerCapture(e.pointerId); } catch {}
  }

  function onMove(e) {
    const d = G.drag;
    if (!d || d.id !== e.pointerId) return;
    const p = toStage(e);
    if (d.what === 'meat') {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return;
        d.moved = true;
        G.meat.held = true;
        G.meat.from = G.meat.loc;
      }
      G.meat.x = p.x;
      G.meat.y = p.y;
    } else {
      G.bottle.x = p.x - d.dx;
      G.bottle.y = p.y - d.dy;
    }
  }

  function onUp(e) {
    const d = G.drag;
    if (!d || d.id !== e.pointerId) return;
    G.drag = null;
    if (d.what === 'meat') {
      if (!d.moved) { if (G.meat.loc === 'grill' && playable()) flipMeat(); return; }
      dropMeat(toStage(e), e.type === 'pointercancel');
    } else {
      G.bottle.held = false;
    }
  }

  function cancelDrag() {
    const d = G.drag;
    G.drag = null;
    if (!d) return;
    if (d.what === 'meat' && G.meat.held) { G.meat.held = false; G.meat.loc = G.meat.from; }
    if (d.what === 'bottle') G.bottle.held = false;
  }

  function toggleFlag(k) {
    const f = G.flags[k];
    f.target = f.target === 0 ? 180 : 0; // 돌아가는 중에 누르면 되돌아간다
    BW.sound.flag();
  }
  function setElec(on) {
    G.elecOn = on;
    bodies.elec.el.classList.toggle('is-off', !on);
    el.app.classList.toggle('is-blackout', !on);
  }
  function toggleElec() {
    setElec(!G.elecOn);
    BW.sound.toggle();
  }
  function toggleHumid() {
    G.humidOn = !G.humidOn;
    bodies.humid.el.classList.toggle('is-on', G.humidOn);
    BW.sound.hum(G.humidOn);
  }

  // 고기
  function resetMeat() {
    Object.assign(G.meat, { loc: 'plate', from: 'plate', held: false, top: 0, bottom: 0, flipT: 0 });
  }
  function flipMeat() {
    G.meat.flipT = FLIP_MS;
    BW.sound.flip();
  }
  function dropMeat(p, cancel) {
    const m = G.meat;
    const b = bodies.meat;
    m.held = false;
    const lx = p.x - b.x, ly = p.y - b.y;
    let to = m.from;
    if (!cancel && playable() && lx > -10 && lx < SLOT.w + 10) {
      if (ly > -6 && ly < 86) to = 'grill';
      else if (ly >= 86 && ly < SLOT.h + 8) to = 'plate';
    }
    if (to === m.from) { m.loc = m.from; return; }
    if (to === 'grill') { m.loc = 'grill'; BW.sound.sizzle(); return; }
    serveMeat();
  }
  function serveMeat() {
    const m = G.meat;
    const cooked = m.top >= 1 && m.bottom >= 1;
    const commanded = cmdHas('meat', 'down');
    resetMeat();
    if (commanded) return; // 내려 명령: 굽기 상관없이 접시로 → 판정에서 성공
    // 명령 없이 내렸다: 양면이 다 익었으면 보너스, 아니면 실패
    setBase('meat', 'down');
    if (cooked) {
      addScore(300);
      BW.sound.bonus();
      mark(true, '+300');
    } else {
      loseLife('고기 덜 익음', ['meat']);
    }
  }
  // 한 면이 익는 순간: 고기가 번쩍이고 반짝이가 튄다
  function cookedFlash() {
    const b = bodies.meat;
    const cx = b.x + MEAT.grill.x, cy = b.y + MEAT.grill.y;
    const ring = document.createElement('span');
    ring.className = 'spark-ring';
    ring.style.left = cx + 'px';
    ring.style.top = cy + 'px';
    G.fxLayer.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rand() * 0.4;
      const r = 34 + rand() * 30;
      const s = document.createElement('span');
      s.className = 'spark' + (i % 3 === 0 ? ' is-dot' : '');
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.setProperty('--dx', (Math.cos(a) * r).toFixed(1) + 'px');
      s.style.setProperty('--dy', (Math.sin(a) * r * 0.8 - 10).toFixed(1) + 'px');
      s.style.animationDelay = (rand() * 80).toFixed(0) + 'ms';
      G.fxLayer.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
    G.meatEl.classList.remove('is-flash');
    void G.meatEl.offsetWidth;
    G.meatEl.classList.add('is-flash');
    BW.sound.cooked();
  }
  function meatBurnt() {
    for (let i = 0; i < 8; i++) spawnSmoke(true);
    resetMeat();
    setBase('meat', 'down');
    loseLife('고기 탐', ['meat']);
  }

  // 술 · 물
  function nope(hitEl) {
    hitEl.classList.remove('is-nope');
    void hitEl.getBoundingClientRect();
    hitEl.classList.add('is-nope');
    BW.sound.nope();
  }
  function drinkShot(hitEl) {
    if (G.shot < 1) return nope(hitEl);
    G.shot = 0;
    BW.sound.gulp();
    setDrunk(true);
  }
  function drinkWater(hitEl) {
    if (!cmdHas('drunk', 'down')) return nope(hitEl); // 물은 내려 명령 때만
    G.water = 0.12;
    BW.sound.gulp();
    setDrunk(false);
  }
  function setDrunk(v) {
    G.drunk = v;
    el.wrap.classList.toggle('is-drunk', v);
  }

  // ── 매 프레임 ──
  function frame(now) {
    if (!G.alive) { G.raf = 0; return; }
    const dt = Math.min(50, now - G.last);
    G.last = now;
    const live = G.phase !== 'paused' && G.phase !== 'over';
    if (live) {
      updateFlags(dt);
      updateMeat(dt);
      updateBottle(dt);
      updateBodies(dt);
      updateSmoke(dt);
      updateVapor(dt);
    }
    updateView(dt);
    render();
    BW.caption.tick(dt, now);
    judgeTick(now);
    G.raf = requestAnimationFrame(frame);
  }

  function updateFlags(dt) {
    for (const k of G.flagOrder) {
      const f = G.flags[k];
      if (f.angle === f.target) continue;
      const step = ROT_SPEED * dt;
      f.angle = f.angle < f.target ? Math.min(f.target, f.angle + step) : Math.max(f.target, f.angle - step);
    }
  }

  function updateMeat(dt) {
    if (!bodies.meat) return;
    const m = G.meat;
    if (m.flipT > 0) {
      const prev = m.flipT;
      m.flipT = Math.max(0, m.flipT - dt);
      if (prev > FLIP_MS / 2 && m.flipT <= FLIP_MS / 2) [m.top, m.bottom] = [m.bottom, m.top];
    }
    if (m.loc === 'grill' && !m.held) {
      const before = m.bottom;
      m.bottom += dt / 1000 / COOK_SEC; // 불판에 닿은 면만 익는다
      if (m.bottom >= 2) return meatBurnt();
      if (before < 1 && m.bottom >= 1) cookedFlash(); // 이 면이 딱 익었다
      G.smokeAcc += (dt / 1000) * (0.8 + 2.6 * m.bottom);
      while (G.smokeAcc >= 1) { G.smokeAcc--; spawnSmoke(m.bottom > 1.45); }
    }
  }

  function updateBottle(dt) {
    if (!bodies.drunk) return;
    const b = G.bottle, st = bodies.drunk;
    const hx = st.x + DRINK.bottleHome.x, hy = st.y + DRINK.bottleHome.y;
    if (!b.placed) { b.x = hx; b.y = hy; b.placed = true; }
    if (!b.held) {
      const k = 1 - Math.exp(-dt / 90);
      b.x += (hx - b.x) * k;
      b.y += (hy - b.y) * k;
    }
    // 다 기울이면(-115°) 주둥이는 몸통 가운데에서 (-0.906R, +0.423R). 그 자리가 술잔 위면 기울여 따른다
    const gx = st.x + DRINK.shotTop.x, gy = st.y + DRINK.shotTop.y;
    const mx = b.x - 0.906 * DRINK.R, my = b.y + 0.423 * DRINK.R;
    const over = b.held && Math.abs(mx - gx) < 22 && my > gy - 52 && my < gy + 6;
    b.tilt += ((over ? -115 : 0) - b.tilt) * (1 - Math.exp(-dt / 70));
    b.pouring = over && b.tilt < -95 && G.shot < 1;
    if (b.pouring) {
      G.shot = Math.min(1, G.shot + dt / 900);
      BW.sound.pour();
    }
    if (G.water < 1) G.water = Math.min(1, G.water + dt / 2600);
  }

  // 취하면 술상만 빼고 모두 천천히 떠다니며 벽에 부딪혀 튕긴다. 깨면 제자리로
  // 좌우로는 자기 칸(옆 칸과의 경계선)을 넘지 않아서 순서가 바뀌지 않는다
  function updateBodies(dt) {
    const list = Object.values(bodies);
    const s = dt / 1000;
    if (G.drunk) {
      const pull = 1 - Math.exp(-dt / 200);
      for (const b of list) {
        if (b.fixed) { // 술상은 떠다니지 않고 자기 자리로만 간다
          b.x += (b.hx - b.x) * pull;
          b.y += (b.hy - b.y) * pull;
          continue;
        }
        if (!b.sp) {
          b.sp = 26 + rand() * 22;
          b.th = rand() * Math.PI * 2;
          b.vx = Math.cos(b.th) * b.sp;
          b.vy = Math.sin(b.th) * b.sp;
        }
        b.th += (rand() - 0.5) * s * 3;
        const k = Math.min(1, s * 1.2);
        b.vx += (Math.cos(b.th) * b.sp - b.vx) * k;
        b.vy += (Math.sin(b.th) * b.sp - b.vy) * k;
        b.x += b.vx * s;
        b.y += b.vy * s;
        const laneL = b.hx - SLOT_GAP / 2, laneR = b.hx + SLOT_GAP / 2; // 몸체 왼쪽 끝이 움직일 수 있는 범위
        // 자리가 섞여 칸이 바뀌었으면 새 칸으로 부드럽게 끌려간다
        if (b.x < laneL) { b.x += (laneL - b.x) * (b.x < laneL - 1 ? pull : 1); bounceX(b, 1); }
        else if (b.x > laneR) { b.x += (laneR - b.x) * (b.x > laneR + 1 ? pull : 1); bounceX(b, -1); }
        if (b.y < 0) { b.y = 0; bounceY(b, 1); } else if (b.y + b.h > G.H) { b.y = G.H - b.h; bounceY(b, -1); }
      }
    } else {
      const k = 1 - Math.exp(-dt / 260);
      for (const b of list) {
        b.sp = 0;
        b.x += (b.hx - b.x) * k;
        b.y += (b.hy - b.y) * k;
      }
    }
  }
  function bounceX(b, dir) { b.vx = dir * Math.abs(b.vx); b.th = Math.atan2(b.vy, b.vx); }
  function bounceY(b, dir) { b.vy = dir * Math.abs(b.vy); b.th = Math.atan2(b.vy, b.vx); }

  // 취기: 무대 전체가 출렁인다. 포인터 좌표는 이 행렬의 역행렬로 무대 좌표가 된다
  function updateView(dt) {
    const target = G.drunk && G.phase !== 'over' ? 1 : 0;
    G.wobA += (target - G.wobA) * (1 - Math.exp(-dt / 600));
    if (G.phase !== 'paused') G.wobT += dt / 1000;
    const A = G.wobA, t = G.wobT;
    const rot = A * 2.6 * Math.sin(t * 1.3);
    const dx = A * 14 * Math.sin(t * 0.9), dy = A * 9 * Math.sin(t * 1.7 + 1);
    const sk = A * 2.4 * Math.sin(t * 1.05 + 0.5);
    const sc = G.scale * (1 + A * 0.025 * Math.sin(t * 0.8));
    const m = new DOMMatrix().translate(G.cw / 2 + dx, G.ch / 2 + dy).rotate(rot).skewX(sk).scale(sc).translate(-G.W / 2, -G.H / 2);
    G.matrix = m;
    G.inv = m.inverse();
    el.stage.style.transform = m.toString();
  }

  function render() {
    for (const k in bodies) {
      const b = bodies[k];
      b.el.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`;
    }
    for (const k of G.flagOrder) {
      const f = G.flags[k];
      if (f.drawn === f.angle) continue;
      bodies[k].pole.setAttribute('transform', `rotate(${f.angle.toFixed(1)} ${PIVOT.x} ${PIVOT.y})`);
      f.drawn = f.angle;
    }
    if (bodies.meat) renderMeat();
    if (bodies.drunk) renderDrinks();
  }

  function renderMeat() {
    const m = G.meat, b = bodies.meat;
    let cx, cy;
    if (m.held) { cx = m.x; cy = m.y; }
    else { const at = MEAT[m.loc]; cx = b.x + at.x; cy = b.y + at.y; }
    G.meatEl.style.transform = `translate(${(cx - MEAT.w / 2).toFixed(1)}px, ${(cy - MEAT.h / 2).toFixed(1)}px)`;
    G.meatEl.classList.toggle('is-held', m.held);
    G.meatEl.classList.toggle('is-ready', m.top >= 1 && m.bottom >= 1); // 양면 다 익음 → 금빛
    // 윗면은 고기 색으로, 밑면은 가장자리 색으로 보인다
    G.meatBody.style.fill = meatColor(m.top);
    G.meatBody.style.stroke = meatColor(m.bottom);
    G.meatMarks.style.opacity = clamp((m.top - 0.35) / 0.6, 0, 1).toFixed(2);
    const sc = m.flipT > 0 ? Math.abs(Math.cos((1 - m.flipT / FLIP_MS) * Math.PI)) : 1;
    G.meatG.style.transform = `scaleY(${sc.toFixed(3)})`;
    b.el.classList.toggle('is-cooking', m.loc === 'grill' && !m.held);
  }

  function renderDrinks() {
    const st = bodies.drunk, bt = G.bottle;
    const sh = G.shot * 24, wa = G.water * 44;
    st.shotLiq.setAttribute('y', (DRINK.bottom - sh).toFixed(1));
    st.shotLiq.setAttribute('height', sh.toFixed(1));
    st.waterLiq.setAttribute('y', (DRINK.bottom - wa).toFixed(1));
    st.waterLiq.setAttribute('height', wa.toFixed(1));
    G.bottleEl.style.transform = `translate(${(bt.x - DRINK.bottleW / 2).toFixed(1)}px, ${(bt.y - DRINK.bottleH / 2).toFixed(1)}px) rotate(${bt.tilt.toFixed(1)}deg)`;
    G.bottleEl.classList.toggle('is-held', bt.held);
    if (bt.pouring) {
      const r = (bt.tilt * Math.PI) / 180;
      const mx = bt.x + DRINK.R * Math.sin(r), my = bt.y - DRINK.R * Math.cos(r);
      const bottom = st.y + DRINK.bottom - sh;
      G.streamEl.style.display = 'block';
      G.streamEl.style.transform = `translate(${(mx - 2).toFixed(1)}px, ${my.toFixed(1)}px)`;
      G.streamEl.style.height = Math.max(0, bottom - my).toFixed(1) + 'px';
    } else {
      G.streamEl.style.display = 'none';
    }
  }

  // ── 연기 (무대 안, 같이 출렁인다) ──
  function spawnSmoke(dark) {
    const b = bodies.meat;
    if (!b) return;
    if (G.smoke.length >= 34) G.smoke.shift().el.remove();
    const e = document.createElement('div');
    e.className = 'smoke' + (dark ? ' dark' : '');
    G.smokeLayer.appendChild(e);
    const base = G.meat.loc === 'grill' ? MEAT.grill : MEAT.plate;
    G.smoke.push({
      el: e, x: b.x + base.x + (rand() - 0.5) * 36, y: b.y + base.y - 6,
      vx: (rand() - 0.5) * 16, vy: -(28 + rand() * 22), age: 0, life: 1200 + rand() * 700, s1: 0.9 + rand() * 0.6,
    });
  }
  function updateSmoke(dt) {
    for (let i = G.smoke.length - 1; i >= 0; i--) {
      const p = G.smoke[i];
      p.age += dt;
      if (p.age >= p.life) { p.el.remove(); G.smoke.splice(i, 1); continue; }
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      const t = p.age / p.life;
      p.el.style.transform = `translate(${(p.x - 20).toFixed(1)}px, ${(p.y - 20).toFixed(1)}px) scale(${(0.35 + t * p.s1).toFixed(2)})`;
      p.el.style.opacity = (Math.min(1, t * 6) * (1 - t) * 0.9).toFixed(2);
    }
  }

  // ── 수증기 (화면 전체를 덮는다, 부드럽게 아무 데로나 흘러가다 사라진다) ──
  // 작은 구름 조각을 많이: 처음엔 빠르게 사방으로 퍼지고, 점점 느려지며 둥실 떠 있다 사라진다
  const PUFF = 120; // .puff 크기(px)
  function spawnVapor() {
    if (G.vapor.length >= 170) G.vapor.shift().el.remove();
    const b = bodies.humid;
    const q = G.matrix.transformPoint(new DOMPoint(b.x + 45, b.y + 18));
    const e = document.createElement('div');
    e.className = 'puff';
    el.vapor.appendChild(e);
    const sp = 50 + rand() * 110;
    G.vapor.push({
      el: e, x: q.x + G.wrapOff.x + (rand() - 0.5) * 16, y: q.y + G.wrapOff.y,
      th: -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.7, sp0: sp, sp,
      age: 0, life: 7000 + rand() * 4500, s1: 0.7 + rand() * 0.8, ax: 1 + rand() * 0.6, op: 0.38 + rand() * 0.3,
    });
  }
  function updateVapor(dt) {
    if (G.humidOn && bodies.humid) {
      G.vaporAcc += dt * 0.014;
      while (G.vaporAcc >= 1) { G.vaporAcc--; spawnVapor(); }
    }
    for (let i = G.vapor.length - 1; i >= 0; i--) {
      const p = G.vapor[i];
      p.age += dt;
      if (p.age >= p.life) { p.el.remove(); G.vapor.splice(i, 1); continue; }
      p.th += (rand() - 0.5) * dt * 0.006;
      p.sp = p.sp0 * (0.3 + 0.7 * Math.exp(-p.age / 2200));
      p.x += (Math.cos(p.th) * p.sp * dt) / 1000;
      p.y += (Math.sin(p.th) * p.sp * dt) / 1000;
      if (p.x < 0 || p.x > G.vw) { p.x = clamp(p.x, 0, G.vw); p.th = Math.PI - p.th; }
      if (p.y < 0 || p.y > G.vh) { p.y = clamp(p.y, 0, G.vh); p.th = -p.th; }
      const g = Math.min(1, p.age / 2000);
      const s = 0.2 + (p.s1 - 0.2) * (1 - (1 - g) * (1 - g));
      const o = Math.min(1, p.age / 500) * Math.min(1, (p.life - p.age) / 2200) * p.op;
      p.el.style.transform = `translate(${(p.x - PUFF / 2).toFixed(1)}px, ${(p.y - PUFF / 2).toFixed(1)}px) scale(${(s * p.ax).toFixed(3)}, ${s.toFixed(3)})`;
      p.el.style.opacity = o.toFixed(3);
    }
  }
  function clearParticles() {
    (G.vapor || []).forEach((p) => p.el.remove());
    (G.smoke || []).forEach((p) => p.el.remove());
    G.vapor = [];
    G.smoke = [];
  }

  // ── 화면 표시 ──
  function hud() {
    el.score.textContent = G.score;
    el.best.textContent = Math.max(G.best, G.score);
    const def = STAGES[G.stage];
    el.badge.textContent = def ? `${G.stage + 1}단계 · ${def.name}` : `속도 ${speedLv()}`;
    el.lives.innerHTML = Array.from({ length: LIVES }, (_, i) => `<span class="${i < G.lives ? '' : 'is-lost'}">♥</span>`).join('');
  }
  function setTimer(f) {
    if (!el) return;
    if (f == null) { el.timer.classList.remove('is-on'); return; }
    f = clamp(f, 0, 1);
    el.timer.classList.add('is-on');
    el.timerFill.style.transform = `scaleX(${f.toFixed(3)})`;
    el.timer.classList.toggle('is-low', f < 0.3);
  }
  function mark(ok, text) {
    el.markIcon.textContent = ok ? '✓' : '✗';
    el.markText.textContent = text || '';
    el.mark.className = 'mark';
    void el.mark.offsetWidth;
    el.mark.className = 'mark ' + (ok ? 'is-ok' : 'is-bad');
  }
  function toast(text, ms) {
    el.toast.textContent = text;
    el.toast.classList.add('is-on');
    clearTimeout(G.toastT);
    G.toastT = setTimeout(() => el.toast.classList.remove('is-on'), ms);
  }
  function flashWrong(keys) {
    for (const k of keys) {
      const b = bodies[k];
      if (!b) continue;
      b.el.classList.remove('is-wrong');
      void b.el.offsetWidth;
      b.el.classList.add('is-wrong');
      setTimeout(() => b.el.classList.remove('is-wrong'), 950);
    }
  }

  BW.game = { start, stop, pause, resume, get running() { return G.alive; }, debug: () => ({ G, bodies }) };
})(window.BW);
