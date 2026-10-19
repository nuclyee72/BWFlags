// store.js — 기록과 설정은 localStorage (막혀 있어도 게임은 돌아간다)
window.BW = window.BW || {};
(function (BW) {
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  BW.store = {
    // 도전 기록 — best: 최고 점수 · games: 끝까지 한 판 수
    stats() { return Object.assign({ best: 0, games: 0 }, get('bw-stats') || {}); },
    saveStats(s) { set('bw-stats', { best: s.best, games: s.games }); },
    // 튜토리얼: 끝낸 단계 번호(0부터) 목록
    lessons() { const v = get('bw-lessons'); return Array.isArray(v) ? v.filter(Number.isInteger) : []; },
    markLesson(i) { const v = BW.store.lessons(); if (!v.includes(i)) set('bw-lessons', v.concat(i).sort()); },
    pickedLesson() { const v = get('bw-lesson'); return Number.isInteger(v) && v >= 0 ? v : null; },
    setPickedLesson(v) { set('bw-lesson', v); },
    soundLevel() { const v = get('bw-sound'); return v === 0 || v === 1 || v === 2 ? v : 2; },
    setSoundLevel(v) { set('bw-sound', v); },
  };
})(window.BW);
