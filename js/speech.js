// speech.js — 명령을 읽어 주는 TTS와 화면 하단 자막
// 자막은 한 글자씩 찍되 TTS보다 앞서지 않는다:
//  · 기본 속도를 TTS보다 느리게 잡고 (CPS)
//  · 음성이 단어 경계(onboundary)를 알려 주면 지금 읽는 단어 끝을 넘지 않는다
//  · 다 읽고 나면 남은 글자를 빠르게 채우고, 잠깐 뒤 사라진다
window.BW = window.BW || {};
(function (BW) {
  const synth = window.speechSynthesis || null;
  const CPS = 5;       // 1배속에서 자막이 1초에 찍는 글자 수 (한국어 TTS는 보통 6~7자)
  const HOLD = 650;    // 다 읽은 뒤 자막이 남아 있는 시간(ms)
  const keep = [];     // 크롬은 읽는 중인 utterance가 GC되면 onend를 부르지 않는다
  let voice = null;
  let current = null;
  const voiceListeners = [];

  function pickVoice() {
    if (!synth) return;
    const ko = synth.getVoices().filter((v) => /^ko([-_]|$)/i.test(v.lang));
    voice = ko.find((v) => /natural/i.test(v.name)) || ko.find((v) => v.localService) || ko[0] || null;
    voiceListeners.forEach((fn) => fn());
  }
  if (synth) {
    pickVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
    else synth.onvoiceschanged = pickVoice;
  }

  const syllables = (t) => t.replace(/[\s,.!?~·"']/g, '').length;
  const wordEnd = (text, i) => { const j = text.indexOf(' ', i); return j < 0 ? text.length : j; };

  // 읽기 시작. 돌려주는 ctl: started · ended · done(Promise) · boundEnd(지금 읽는 단어 끝)
  function say(text, rate) {
    stop();
    const ctl = { text, rate, started: false, ended: false, virtual: false, boundEnd: -1, startedAt: 0 };
    let resolve;
    ctl.done = new Promise((r) => (resolve = r));
    ctl.finish = () => {
      if (ctl.ended) return;
      ctl.ended = true;
      clearTimeout(ctl.t1);
      clearTimeout(ctl.t2);
      resolve();
    };
    const est = (syllables(text) / (CPS * rate)) * 1000 + 250;
    // 소리를 껐거나 한국어 음성이 없으면 자막 속도에 맞춰 '읽은 셈' 친다
    const goVirtual = () => {
      ctl.virtual = true;
      if (!ctl.started) { ctl.started = true; ctl.startedAt = performance.now(); }
      clearTimeout(ctl.t2);
      ctl.t2 = setTimeout(ctl.finish, Math.max(0, est - (performance.now() - ctl.startedAt)));
    };
    current = ctl;

    const vol = BW.sound.ttsVolume();
    if (!synth || !voice || !vol) { goVirtual(); return ctl; }

    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    u.volume = vol;
    u.onstart = () => {
      if (ctl.virtual || ctl.ended) return;
      ctl.started = true;
      ctl.startedAt = performance.now();
      clearTimeout(ctl.t1);
      ctl.t2 = setTimeout(ctl.finish, est * 2.5 + 2500); // onend가 끝내 안 오는 브라우저 대비
    };
    u.onboundary = (e) => {
      if (ctl.virtual || (e.name && e.name !== 'word')) return;
      const end = e.charLength ? e.charIndex + e.charLength : wordEnd(text, e.charIndex);
      if (end > ctl.boundEnd) ctl.boundEnd = end;
    };
    u.onend = u.onerror = () => { if (!ctl.virtual) ctl.finish(); };
    keep.push(u);
    if (keep.length > 6) keep.shift();
    // 음성이 시작하지 않으면 자막만으로 진행한다
    ctl.t1 = setTimeout(() => {
      if (ctl.started || ctl.ended) return;
      ctl.virtual = true;
      try { synth.cancel(); } catch {}
      goVirtual();
    }, 1500);
    synth.speak(u);
    return ctl;
  }

  function stop() {
    if (current) {
      const c = current;
      current = null;
      c.virtual = true;
      c.finish();
    }
    if (synth && (synth.speaking || synth.pending)) { try { synth.cancel(); } catch {} }
  }

  // iOS 사파리는 첫 발화가 사용자 탭 안에서 일어나야 이후 소리가 난다
  function unlock() {
    if (!synth || !BW.sound.ttsVolume()) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      keep.push(u);
      synth.speak(u);
    } catch {}
  }

  BW.speech = {
    say,
    stop,
    unlock,
    hasVoice: () => !!(synth && voice),
    onVoices: (fn) => voiceListeners.push(fn),
  };

  // ── 자막 ──
  const cap = { el: null, on: null, off: null, text: '', shown: 0, acc: 0, ctl: null, doneAt: 0 };

  function bind(el) {
    cap.el = el;
    el.innerHTML = '<span class="cap-on"></span><span class="cap-off"></span>';
    cap.on = el.firstChild;
    cap.off = el.lastChild;
  }
  function render() {
    cap.on.textContent = cap.text.slice(0, cap.shown);
    cap.off.textContent = cap.text.slice(cap.shown); // 안 보이는 나머지로 줄 길이를 미리 잡아 둔다
  }
  // 자막 줄은 음성이 실제로 시작될 때 나타나고, 첫 글자는 그때 바로 찍힌다
  function show(text, ctl) {
    Object.assign(cap, { text, ctl, shown: 0, acc: Infinity, doneAt: 0 });
    render();
    cap.el.classList.remove('is-on');
  }
  function hide() {
    cap.ctl = null;
    if (cap.el) cap.el.classList.remove('is-on');
  }
  function tick(dt, now) {
    const c = cap.ctl;
    if (!c || !c.started) return;
    const len = cap.text.length;
    if (cap.shown < len) {
      const pace = c.ended ? 28 : 1000 / (CPS * c.rate);
      if (cap.acc === Infinity) { cap.acc = pace; cap.el.classList.add('is-on'); }
      else cap.acc += dt;
      let moved = false;
      while (cap.shown < len && cap.acc >= pace) {
        // 음성이 아직 이 단어까지 오지 않았으면 기다린다
        if (!c.ended && !c.virtual && c.boundEnd >= 0 && cap.shown >= c.boundEnd) { cap.acc = pace; break; }
        cap.shown++;
        cap.acc -= pace;
        moved = true;
        while (cap.shown < len && /\s/.test(cap.text[cap.shown])) cap.shown++;
      }
      if (moved) render();
    } else if (c.ended) {
      if (!cap.doneAt) cap.doneAt = now;
      else if (now - cap.doneAt >= HOLD) hide();
    }
  }

  BW.caption = { bind, show, hide, tick };
})(window.BW);
