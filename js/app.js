// app.js — 화면 전환, 홈 기록 · 시작 단계, 소리 · 다크 모드 · 도움말
window.BW = window.BW || {};
(function (BW) {
  const $ = (s) => document.querySelector(s);
  const slide = $('#app');
  const card = $('#card');
  let startStage = 0;

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.dataset.screen !== name; });
    const game = name === 'game';
    slide.classList.toggle('is-game', game);
    card.classList.toggle('is-game', game);
    $('#help-pop').hidden = true;
  }

  // ── 홈 ──
  function homeStrip() {
    const keys = Object.keys(BW.obj.FLAGS);
    $('#home-strip').innerHTML = keys.map((k, i) => BW.obj.svg.flag(k, i % 2 ? 180 : 0)).join('');
  }

  function renderHome() {
    const s = BW.store.stats();
    const played = s.games > 0 || s.bestStage > 0;
    $('#stat-best').textContent = s.best;
    $('#stat-stage').textContent = played ? s.bestStage + 1 : '-';
    $('#stat-games').textContent = s.games;

    // 도달해 본 단계까지는 골라서 바로 시작할 수 있다
    const maxStart = Math.min(s.bestStage || 0, BW.STAGES.length - 1);
    startStage = Math.min(BW.store.startStage(), maxStart);
    const chips = $('#stage-chips');
    chips.innerHTML = '';
    BW.STAGES.forEach((st, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip stage-chip' + (i === startStage ? ' is-sel' : '');
      b.textContent = i + 1;
      b.title = `${i + 1}단계 · ${st.name}`;
      b.disabled = i > maxStart;
      b.addEventListener('click', () => { BW.store.setStartStage(i); renderHome(); });
      chips.appendChild(b);
    });
    $('#stage-name').textContent = `${startStage + 1}단계 · ${BW.STAGES[startStage].name}`;
    renderVoiceNote();
  }
  function renderVoiceNote() {
    $('#voice-note').hidden = BW.speech.hasVoice() || !BW.sound.level;
  }

  // ── 소리 버튼 ──
  const SPEAKER = '<path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" fill="currentColor"/>';
  const WAVES = [
    '<path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    '<path d="M15.6 9.4a3.6 3.6 0 0 1 0 5.2"/>',
    '<path d="M15.6 9.4a3.6 3.6 0 0 1 0 5.2"/><path d="M18.4 6.8a7.4 7.4 0 0 1 0 10.4"/>',
  ];
  function renderSound() {
    const lv = BW.sound.level;
    const icon = `<svg class="sound-svg" viewBox="0 0 24 24" aria-hidden="true">${SPEAKER}<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${WAVES[lv]}</g></svg>`;
    document.querySelectorAll('.sound-btn').forEach((b) => {
      const text = `소리: ${BW.sound.label()}`;
      b.innerHTML = b.classList.contains('icon-btn') ? icon : icon + `<span>소리 ${BW.sound.label()}</span>`;
      b.setAttribute('aria-label', text);
      b.title = text;
      b.classList.toggle('is-off', lv === 0);
    });
    renderVoiceNote();
  }
  document.querySelectorAll('.sound-btn').forEach((b) => b.addEventListener('click', () => BW.sound.cycle()));
  BW.sound.onChange(renderSound);
  BW.speech.onVoices(renderVoiceNote);

  // ── 버튼 ──
  function play() {
    BW.sound.unlock();
    BW.speech.unlock();
    show('game');
    BW.game.start(startStage);
  }
  function goHome() {
    BW.game.stop();
    show('home');
    renderHome();
  }
  $('#play-btn').addEventListener('click', play);
  $('#again-btn').addEventListener('click', play);
  $('#game-back-btn').addEventListener('click', goHome);
  $('#over-home-btn').addEventListener('click', goHome);
  $('#pause-home-btn').addEventListener('click', goHome);
  $('#pause-btn').addEventListener('click', () => BW.game.pause());
  $('#resume-btn').addEventListener('click', () => BW.game.resume());

  $('#help-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#help-pop').hidden = !$('#help-pop').hidden;
  });
  document.addEventListener('click', (e) => {
    const pop = $('#help-pop');
    if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true;
  });

  $('#dark-toggle').addEventListener('click', () => {
    const on = document.documentElement.getAttribute('data-theme') !== 'dark';
    if (on) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('daily-dark-mode', on ? '1' : '0'); } catch {}
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && BW.game.running) BW.game.pause();
  });

  homeStrip();
  renderSound();
  renderHome();
  show('home');
})(window.BW);
