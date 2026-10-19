// store.js — 기록과 설정은 localStorage (막혀 있어도 게임은 돌아간다)
window.BW = window.BW || {};
(function (BW) {
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  BW.store = {
    // best: 최고 점수 · bestStage: 도달한 가장 높은 단계(0부터) · games: 끝까지 한 판 수
    stats() { return Object.assign({ best: 0, bestStage: 0, games: 0 }, get('bw-stats') || {}); },
    saveStats(s) { set('bw-stats', s); },
    startStage() { const v = get('bw-start'); return Number.isInteger(v) && v >= 0 ? v : 0; },
    setStartStage(v) { set('bw-start', v); },
    soundLevel() { const v = get('bw-sound'); return v === 0 || v === 1 || v === 2 ? v : 2; },
    setSoundLevel(v) { set('bw-sound', v); },
  };
})(window.BW);
