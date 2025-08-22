/* ======================================================================
   JOGUINHOS DA TIA UXA — ARQUIVO ÚNICO
   - Abas (tabs) e utilidades
   - Jogo de Digitação (Letras A–Z / Palavras simples)
   - Jogo de Sílabas (arrastar e montar)
   Observações:
   • Usa o mesmo controle de som (#soundToggle) para tudo.
   • Não depende de nenhum toggle/checkbox extra além do que está no seu HTML.
   • IDs batem com o seu index.html.
====================================================================== */


/* =========================
   1) ABAS (TABS) + PEQUENAS UTILS
========================= */
(function tabsAndSound(){
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach(t => {
    t.addEventListener('click', ()=>{
      const key = t.dataset.tab;
      tabs.forEach(x => x.classList.toggle('active', x===t));
      panels.forEach(p => p.classList.toggle('active', p.id === `panel-${key}`));
      // foco amigável ao trocar para sílabas
      if(key === 'syllables'){
        const btn = document.getElementById('btnPlayWord');
        btn && btn.focus();
      }
    });
  });
})();


/* =========================
   2) JOGO DE DIGITAÇÃO
   (Letras A–Z e Palavras simples)
========================= */
(function typingGame(){
  // Palavras simples para o modo "words"
  const WORDS = [
    "casa","bola","gato","pato","foca","peixe","uva","mala","pipa","fada","dado","riso","rua",
    "vaca","sapo","lobo","vila","moto","fogo","pao","suco","tatu","mato","pulo","pelo","dedo",
    "lima","copo","pera","cafe","logo","joia","areia","ninho","noite","dia","sol","lua",
    "verde","amarelo","azul","rosa","cabelo","nariz","dente","livro","papel","lapis","folha"
  ];

  // ===== Refs do DOM (IDs batendo com seu HTML) =====
  const el = (id)=>document.getElementById(id);
  const playerNameInput = el('playerName');
  const modeSel       = el('mode');          // <select> (letters | words)
  const secondsInput  = el('seconds');
  const startBtn      = el('startBtn');
  const resetBtn      = el('resetBtn');
  const skipBtn       = el('skipBtn');
  const typebox       = el('typebox');
  const promptEl      = el('prompt');
  const wordChars     = el('wordChars');
  const scoreEl       = el('score');
  const hitsEl        = el('hits');
  const missesEl      = el('misses');
  const timeLeftEl    = el('timeLeft');
  const bar           = el('bar');
  const footerStatus  = el('status');        // no rodapé
  const bubble        = el('bubble');
  const confettiLocal = el('confettiLocal'); // confete local do typing
  const soundToggle   = el('soundToggle');   // mesmo do cabeçalho
  const speakBtn      = el('speakBtn');
  const rankList      = el('rankList');
  const rankModeBadge = el('rankModeBadge');

  // ===== Estado =====
  let mode   = 'letters'; // 'letters' | 'words'
  let target = '';
  let score = 0, hits = 0, misses = 0;
  let totalTime = 120, timeLeft = 120, timer = null, running = false;

  const MAX_ATTEMPTS = 3;
  let attemptsLeft = MAX_ATTEMPTS;

  // ===== Ranking/Storage =====
  const LS_NAME   = 'typingGame.playerName';
  const LS_SCORES = 'typingGame.scores';

  function loadPlayerName(){
    const n = localStorage.getItem(LS_NAME) || '';
    playerNameInput.value = n;
  }
  function savePlayerName(){
    const n = (playerNameInput.value || '').trim();
    if(n) localStorage.setItem(LS_NAME, n);
  }
  function loadScores(){
    try{
      const raw = localStorage.getItem(LS_SCORES);
      if(!raw) return { letters: [], words: [] };
      const parsed = JSON.parse(raw);
      return {
        letters: Array.isArray(parsed.letters) ? parsed.letters : [],
        words: Array.isArray(parsed.words) ? parsed.words : [],
      };
    }catch{ return { letters: [], words: [] } }
  }
  function saveScore(currentMode, name, scoreValue){
    const data = loadScores();
    const arr = data[currentMode] || [];
    const idx = arr.findIndex(x => x.name === name);
    const entry = { name, score: scoreValue, date: Date.now() };
    if(idx >= 0) arr[idx] = entry; else arr.push(entry);
    if(arr.length > 50) arr.shift();
    data[currentMode] = arr;
    localStorage.setItem(LS_SCORES, JSON.stringify(data));
  }
  function getRanking(currentMode){
    const data = loadScores();
    const arr = data[currentMode] || [];
    return [...arr].sort((a,b)=> (b.score - a.score) || (b.date - a.date)).slice(0, 10);
  }
  function renderRanking(){
    rankModeBadge.textContent = (mode === 'letters') ? 'Letras (A–Z)' : 'Palavras simples';
    const ranking = getRanking(mode);
    rankList.innerHTML = '';
    if(ranking.length === 0){
      const li = document.createElement('li');
      li.className='rank-item';
      li.innerHTML = `<span class="who">Sem pontuações ainda</span><span class="pts">—</span>`;
      rankList.appendChild(li);
      return;
    }
    for(const r of ranking){
      const li = document.createElement('li');
      li.className='rank-item';
      const when = new Date(r.date).toLocaleDateString('pt-BR');
      li.innerHTML = `<span class="who">${escapeHtml(r.name)} <small>(${when})</small></span><span class="pts">${r.score} pts</span>`;
      rankList.appendChild(li);
    }
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // ===== Sons (Web Audio) =====
  let audioCtx = null;
  function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  function playTone(type='ok'){
    if(!soundToggle.checked) return;
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = type==='ok' ? 880 : (type==='err' ? 220 : 660);
    g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (type==='ok' ? 0.18 : (type==='err' ? 0.22 : 0.16)));
    o.start(now); o.stop(now + 0.25);
  }

  // ===== Falar (Speech Synthesis) =====
  function speakTarget(){
    if(!soundToggle.checked) return;
    const t = target.toUpperCase();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'pt-BR';
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ===== Util =====
  function pickLetter(){ const code = 97 + Math.floor(Math.random()*26); return String.fromCharCode(code); }
  function pickWord(){ return WORDS[Math.floor(Math.random()*WORDS.length)] }
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)) }
  function setProgress(p){ bar.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})` }
  function msgGood(text){ bubble.className='status-bubble good'; bubble.textContent=text }
  function msgBad(text){ bubble.className='status-bubble bad'; bubble.textContent=text }
  function msgNeutral(text){ bubble.className='status-bubble'; bubble.textContent=text }
  function normalize(s){ return s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase(); }

  function celebrate(){
    const colors = ['#bbf7d0','#a7f3d0','#bfdbfe','#fde68a','#fecaca'];
    for(let i=0;i<10;i++){
      const d = document.createElement('div');
      d.className='dot';
      const x = Math.random()*100;
      const xEnd = x + (Math.random()*20-10);
      const y = 200 + Math.random()*60;
      d.style.left = x+'%';
      d.style.setProperty('--x', '0px');
      d.style.setProperty('--x-end', (xEnd - x)*3 + 'px');
      d.style.setProperty('--y', y+'px');
      d.style.background = colors[i%colors.length];
      confettiLocal.appendChild(d);
      setTimeout(()=>d.remove(), 900);
    }
  }

  // ===== Lógica principal =====
  function setMode(m){
    mode = m;
    promptEl.classList.toggle('letter', mode==='letters');
    promptEl.classList.toggle('word', mode==='words');
    wordChars.hidden = mode!=='words';
    wordChars.setAttribute('aria-hidden', mode!=='words');
    typebox.placeholder = mode==='letters' ? 'Digite a letra…' : 'Digite a palavra…';
    hardReset();
    renderRanking();
  }

  function renderWordCharacters(){
    wordChars.innerHTML = '';
    [...target].forEach((ch, i)=>{
      const span = document.createElement('span');
      span.className = 'c';
      span.textContent = ch.toUpperCase();
      span.dataset.pos = i;
      wordChars.appendChild(span);
    });
  }

  function nextTarget(resetInput=false){
    if(mode==='letters'){
      attemptsLeft = MAX_ATTEMPTS;
      target = pickLetter();
      promptEl.textContent = target.toUpperCase();
      msgNeutral(`Qual é a letra?`);
    }else{
      target = pickWord();
      promptEl.textContent = target.toUpperCase();
      renderWordCharacters();
      msgNeutral('Digite devagar 😊');
    }
    if(resetInput) typebox.value = '';
    playTone('show');
    setTimeout(speakTarget, 60);
  }

  function start(){
    let n = (playerNameInput.value || '').trim();
    if(!n){
      n = prompt('Qual é o seu nome?');
      if(!n || !n.trim()){
        msgBad('Precisamos do seu nome 😊');
        playerNameInput.focus();
        return;
      }
      playerNameInput.value = n.trim();
    }
    savePlayerName();

    if(running) return;
    score = hits = misses = 0;
    scoreEl.textContent = score; hitsEl.textContent = hits; missesEl.textContent = misses;

    totalTime = clamp(parseInt(secondsInput.value,10) || 120, 30, 600);
    timeLeft = totalTime;
    timeLeftEl.textContent = timeLeft;
    setProgress(1);
    nextTarget(true);

    typebox.disabled = false;
    typebox.focus();
    running = true;
    footerStatus.textContent = 'Valendo! ⏱️';

    clearInterval(timer);
    timer = setInterval(()=>{
      timeLeft--;
      timeLeftEl.textContent = timeLeft;
      setProgress(timeLeft/totalTime);
      if(timeLeft<=0){ finish(); }
    }, 1000);
    ensureAudio();
  }

  function finish(){
    clearInterval(timer);
    running = false;
    typebox.disabled = true;
    setProgress(0);
    footerStatus.textContent = `Fim! Pontos: ${score}. Acertos: ${hits}, Erros: ${misses}.`;
    msgNeutral('Acabou! Quer jogar de novo?');

    const name = (playerNameInput.value || '').trim() || 'Jogador';
    saveScore(mode, name, score);
    renderRanking();
  }

  function softResetUIValues(){
    score = hits = misses = 0;
    scoreEl.textContent = score; hitsEl.textContent = hits; missesEl.textContent = misses;
    timeLeft = parseInt(secondsInput.value,10) || 120;
    timeLeftEl.textContent = timeLeft;
    setProgress(1);
    typebox.value = '';
  }

  function hardReset(){
    clearInterval(timer);
    running = false;
    softResetUIValues();
    typebox.disabled = true;
    promptEl.textContent = 'Digite seu nome e clique em “Começar”';
    wordChars.innerHTML = '';
    wordChars.hidden = (mode!=='words');
    footerStatus.textContent = 'Aguardando início…';
    msgNeutral('Pronto 🎯');
  }

  function onInput(){
    if(!running) return;
    const value = normalize(typebox.value);

    if(mode==='letters'){
      if(value.length===0) return;
      const typed = value[value.length-1];
      if(typed === target){
        hits++; score++;
        hitsEl.textContent = hits; scoreEl.textContent = score;
        msgGood('Muito bem! 🎉');
        promptEl.style.transform = 'scale(1.06)';
        setTimeout(()=>{ promptEl.style.transform='scale(1)'; }, 120);
        if(soundToggle.checked) celebrate();
        playTone('ok');
        nextTarget(true);
      }else{
        attemptsLeft--;
        misses++; missesEl.textContent = misses;
        promptEl.classList.add('shake');
        setTimeout(()=>promptEl.classList.remove('shake'), 200);
        playTone('err');
        if(attemptsLeft>0){
          msgBad('Ops, tente de novo!');
          typebox.value = '';
        }else{
          msgBad(`Quase! Era "${target.toUpperCase()}".`);
          nextTarget(true);
        }
      }
    }else{
      // modo 'words'
      let awarded = 0;
      for(let i=0; i<value.length; i++){
        const correct = target[i] || '';
        const typed = value[i];
        const cell = wordChars.children[i];
        if(!cell) continue;
        if(typed === correct){
          if(!cell.classList.contains('done')){
            score++; hits++; awarded++;
            cell.classList.add('done'); cell.classList.remove('bad');
          }
        }else{
          cell.classList.add('bad'); cell.classList.remove('done');
        }
      }
      scoreEl.textContent = score; hitsEl.textContent = hits;
      for(let i=value.length; i<target.length; i++){
        wordChars.children[i].classList.remove('done','bad');
      }
      const lastPos = value.length-1;
      if(lastPos>=0 && (value[lastPos] !== (target[lastPos]||''))){
        misses++; missesEl.textContent = misses;
        promptEl.classList.add('shake'); setTimeout(()=>promptEl.classList.remove('shake'), 160);
        msgBad('Tem algo diferente…');
        playTone('err');
      }else if(awarded>0){
        msgGood('Isso! Continue…');
        playTone('ok');
      }
      if(value === target){
        if(soundToggle.checked) celebrate();
        setTimeout(()=> nextTarget(true), 250);
      }
    }
  }

  // ===== Eventos =====
  startBtn.addEventListener('click', start);
  resetBtn.addEventListener('click', hardReset);
  skipBtn.addEventListener('click', ()=>{ if(!running) return; msgNeutral('Pulou 👍'); nextTarget(true); });
  modeSel.addEventListener('change', ()=> setMode(modeSel.value));
  typebox.addEventListener('input', onInput);
  typebox.addEventListener('blur', ()=>{ if(running) typebox.focus() });
  speakBtn.addEventListener('click', speakTarget);
  playerNameInput.addEventListener('change', savePlayerName);

  // ===== Init =====
  loadPlayerName();
  setMode(modeSel.value);
  setProgress(1);
  timeLeftEl.textContent = 120;
})();


/* =========================
   3) JOGO DE SÍLABAS (ARRASTAR)
========================= */

(function syllablesGame(){
  // ---------- Palavras (sílabas + emoji) ----------
  const SYLLABLE_WORDS = [
    { word: 'GATO', syllables: ['GA', 'TO'], emoji: '🐱' },
    { word: 'MALA', syllables: ['MA', 'LA'], emoji: '👜' },
    { word: 'SAPO', syllables: ['SA', 'PO'], emoji: '🐸' },
    { word: 'COCO', syllables: ['CO', 'CO'], emoji: '🥥' },
    { word: 'BOLO', syllables: ['BO', 'LO'], emoji: '🍰' },
    { word: 'PATO', syllables: ['PA', 'TO'], emoji: '🦆' },
    { word: 'FADA', syllables: ['FA', 'DA'], emoji: '🧚' },
    { word: 'BOLA', syllables: ['BO', 'LA'], emoji: '🏐' },
    { word: 'CAMA', syllables: ['CA', 'MA'], emoji: '🛏️' },
    { word: 'RATO', syllables: ['RA', 'TO'], emoji: '🐭' },
    { word: 'NAVE', syllables: ['NA', 'VE'], emoji: '🚀' },
    { word: 'PANELA', syllables: ['PA', 'NE', 'LA'], emoji: '🍲' },
    { word: 'AVE', syllables: ['A', 'VE'], emoji: '🦩' },
    { word: 'TUBA', syllables: ['TU', 'BA'], emoji: '🎺' },
    { word: 'FOGO', syllables: ['FO', 'GO'], emoji: '🔥' },
    { word: 'VACA', syllables: ['VA', 'CA'], emoji: '🐄' },
    { word: 'MOTO', syllables: ['MO', 'TO'], emoji: '🏍️' },
    { word: 'DADO', syllables: ['DA', 'DO'], emoji: '🎲' },
    { word: 'LUA', syllables: ['LU', 'A'], emoji: '🌙' },
    { word: 'PIPA', syllables: ['PI', 'PA'], emoji: '🪁' },
    { word: 'GALO', syllables: ['GA', 'LO'], emoji: '🐓' },
    { word: 'SINO', syllables: ['SI', 'NO'], emoji: '🔔' },
    { word: 'BIFE', syllables: ['BI', 'FE'], emoji: '🥩' },
    { word: 'FONE', syllables: ['FO', 'NE'], emoji: '🎧' },
    { word: 'MENINA', syllables: ['ME','NI', 'NA'], emoji: '💇‍♀️' },
    { word: 'CANOA', syllables: ['CA', 'NO', 'A'], emoji: '🛶' },
    { word: 'SABONETE', syllables: ['SA', 'BO', 'NE', 'TE'], emoji: '🧼' },
    { word: 'JACARE', syllables: ['JA', 'CA', 'RE'], emoji: '🐊' },
    { word: 'ABACAXI', syllables: ['A', 'BA', 'CA', 'XI'], emoji: '🍍' }
  ];

  // ---------- Distratores ----------
  const DISTRACTOR_POOL = [
    'LA','LE','LI','LO','LU',
    'BA','BE','BI','BU',
    'TA','TE','TI','TU',
    'RA','RE','RI','RO','RU',
    'FA','FE','FI','FO','FU',
    'NA','NE','NI','NO','NU',
    'GA','GE','GI','GO','GU',
    'CA','CE','CI','CO','CU',
    'PA','PE','PI','PO','PU',
    'VO','VA','VE','VI','VU',
    'A','E','I','O','U'
  ];

  // ---------- “Como falar” sílabas (pt-BR) ----------
  const SYLLABLE_SAY = {
    'A':'á','E':'é','I':'i','O':'ó','U':'u',
    'PA': 'pá', 'PE': 'pê', 'PI': 'pi', 'PO': 'pô', 'PU': 'pu',
    'BA': 'bá', 'BE': 'bê', 'BI': 'bi', 'BO': 'bô', 'BU': 'bu',
    'MA': 'má', 'ME': 'mê', 'MI': 'mi', 'MO': 'mô', 'MU': 'mu',
    'LA': 'lá', 'LE': 'lê', 'LI': 'li', 'LO': 'lô', 'LU': 'lu',
    'SA': 'sá', 'SE': 'sê', 'SI': 'si', 'SO': 'sô', 'SU': 'su',
    'GA': 'gá', 'GE': 'jê', 'GI': 'ji', 'GO': 'gô', 'GU': 'gu',
    'CA': 'cá', 'CE': 'cê', 'CI': 'ci', 'CO': 'cô', 'CU': 'cu',
    'DA': 'dá', 'DE': 'dê', 'DI': 'di', 'DO': 'dô', 'DU': 'du',
    'TA': 'tá', 'TE': 'tê', 'TI': 'tchi', 'TO': 'tô', 'TU': 'tu',
    'NA': 'ná', 'NE': 'nê', 'NI': 'ni', 'NO': 'nô', 'NU': 'nu',
    'RA': 'rá', 'RE': 'rê', 'RI': 'ri', 'RO': 'rô', 'RU': 'ru',
    'FA': 'fá', 'FE': 'fê', 'FI': 'fi', 'FO': 'fô', 'FU': 'fu',
    'VO': 'vô', 'VA': 'vá', 'VE': 'vê', 'VI': 'vi', 'VU': 'vu',
    'JA': 'já', 'JE': 'jê', 'JI': 'ji', 'JO': 'jô', 'JU': 'ju',
    'XI': 'xí'
  };

  // ---------- Helpers ----------
  const $ = (id)=>document.getElementById(id);

  // ---------- DOM refs (IDs do seu HTML) ----------
  const bank            = $('bank');
  const dropZone        = $('dropZone');
  const imageWrap       = $('imageWrap');
  const feedback        = $('feedback');
  const voiceHint       = $('voiceHint');
  const syllableDisplay = $('syllableDisplay');

  const btnPlayWord      = $('btnPlayWord');
  const btnPlaySyllables = $('btnPlaySyllables');
  const btnRepeat        = $('btnRepeat');
  const btnNext          = $('btnNext');
  const btnReset         = $('btnReset');

  const soundToggle      = $('soundToggle');

  // ---------- Confete tela cheia ----------
  const confettiCanvas = $('confetti');
  const ctx = confettiCanvas.getContext('2d');
  function resizeCanvas(){ confettiCanvas.width = window.innerWidth; confettiCanvas.height = window.innerHeight; }
  window.addEventListener('resize', resizeCanvas); resizeCanvas();

  function fireConfetti() {
    const colors = ['#10b981', '#22c55e', '#fde047', '#f59e0b', '#38bdf8', '#a78bfa'];
    const parts = Array.from({ length: 140 }, () => ({
      x: Math.random() * confettiCanvas.width,
      y: -10, w: 6 + Math.random() * 6, h: 8 + Math.random() * 10,
      c: colors[Math.floor(Math.random()*colors.length)], s: 2 + Math.random() * 4,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.2,
    }));

    let frames = 0;
    (function draw(){
      ctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
      parts.forEach(p => {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
        p.y += p.s; p.x += Math.sin(p.y/30) * 1.2; p.r += p.vr;
      });
      frames++; if (frames < 260) requestAnimationFrame(draw); else ctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
    })();
  }

  // ---------- Voz (Speech Synthesis) ----------
  let preferredVoice = null;
  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    preferredVoice =
      voices.find(v => /pt(-|_)BR/i.test(v.lang)) ||
      voices.find(v => v.lang.startsWith('pt')) ||
      voices[0] || null;
    voiceHint.textContent = preferredVoice ? `Voz: ${preferredVoice.name} (${preferredVoice.lang})` : '';
  }
  window.speechSynthesis.onvoiceschanged = pickVoice; pickVoice();

  function speak(text, rate = 0.9, pitch = 1) {
    if (!soundToggle?.checked) return;
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    if (preferredVoice) u.voice = preferredVoice;
    u.lang = preferredVoice?.lang || 'pt-BR';
    u.rate = rate; u.pitch = pitch;
    window.speechSynthesis.speak(u);
  }
  function speakAsync(text, rate = 0.9, pitch = 1) {
    return new Promise(resolve => {
      if (!soundToggle?.checked) return resolve();
      if (!('speechSynthesis' in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      if (preferredVoice) u.voice = preferredVoice;
      u.lang = preferredVoice?.lang || 'pt-BR';
      u.rate = rate; u.pitch = pitch;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  // ---------- Estado ----------
  let currentIndex = 0;
  let current = SYLLABLE_WORDS[currentIndex];
  let playSeqId = 0;

  // ---------- Utils ----------
  function shuffle(arr) { return arr.map(v => [Math.random(), v]).sort((a,b) => a[0]-b[0]).map(x => x[1]); }

  // Exibe as sílabas no painel superior (para piscar durante TTS)
  function buildSyllableDisplay() {
    syllableDisplay.innerHTML = '';
    current.syllables.forEach(syl => {
      const chip = document.createElement('div');
      chip.className = 'display-syllable';
      chip.dataset.displaySyl = syl;
      chip.textContent = syl;
      syllableDisplay.appendChild(chip);
    });
  }

  function makeDistractors(targetSyllables) {
    const need = Math.random() < 0.5 ? 1 : 2;
    const setTarget = new Set(targetSyllables);
    const pool = DISTRACTOR_POOL.filter(s => !setTarget.has(s));
    const picked = new Set();
    while (picked.size < need && pool.length > 0) {
      picked.add(pool[Math.floor(Math.random() * pool.length)]);
    }
    return [...picked];
  }

  // ---------- Narração sincronizada ----------
  async function playSyllablesSynced(sylls) {
    if (!soundToggle?.checked) return;
    window.speechSynthesis.cancel();
    const mySeq = ++playSeqId;

    const nodes = [...syllableDisplay.querySelectorAll('[data-display-syl]')];
    const poolBySyl = {};
    nodes.forEach(n => {
      const syl = n.dataset.displaySyl;
      (poolBySyl[syl] ||= []).push(n);
    });

    for (const syl of sylls) {
      if (mySeq !== playSeqId) return;
      const list = poolBySyl[syl] || [];
      const node = list.shift?.() || nodes.find(n => n.dataset.displaySyl === syl);

      if (node) node.classList.add('blink');
      await speakAsync((SYLLABLE_SAY[syl] || syl.toLowerCase()) + '.', 0.9, 1);
      if (node) node.classList.remove('blink');
    }
  }
  function saySyllable(syl) {
    const say = SYLLABLE_SAY[syl] || syl.toLowerCase();
    speak(say + '.', 0.9, 1);
  }
  function speakWord(word) {
    const pretty = {
      GATO:'gato', MALA:'mala', SAPO:'sapo', COCO:'coco', BOLO:'bolo', PATO:'pato',
      FADA:'fada', BOLA:'bola', CAMA:'cama', RATO:'rato', NAVE:'nave', AVE:'ave',
      TUBA:'tuba', FOGO:'fogo', VACA:'vaca', MOTO:'moto', DADO:'dado', LUA:'lua',
      PIPA:'pipa', GALO:'galo', SINO:'sino', BIFE:'bife', FONE:'fone',
      MENINA:'menina', CANOA:'canoa', SABONETE:'sabonete', JACARE:'jacaré',
      ABACAXI:'abacaxi'
    };
    return speakAsync(pretty[word] || word.toLowerCase(), 0.9, 1);
  }
  async function onPlayWord() {
    if (!soundToggle?.checked) return;
    window.speechSynthesis.cancel();
    const mySeq = ++playSeqId;

    const nodes = [...syllableDisplay.querySelectorAll('[data-display-syl]')];
    const poolBySyl = {};
    nodes.forEach(n => {
      const syl = n.dataset.displaySyl;
      (poolBySyl[syl] ||= []).push(n);
    });

    for (const syl of current.syllables) {
      if (mySeq !== playSeqId) return;
      const list = poolBySyl[syl] || [];
      const node = list.shift?.() || nodes.find(n => n.dataset.displaySyl === syl);

      if (node) node.classList.add('blink');
      await speakAsync((SYLLABLE_SAY[syl] || syl.toLowerCase()) + '.', 0.9, 1);
      if (node) node.classList.remove('blink');
    }
    if (mySeq !== playSeqId) return;
    await speakWord(current.word);
  }
  async function promptRepeat() {
    if (!soundToggle?.checked) return;
    window.speechSynthesis.cancel();
    await speakAsync('Agora, repita comigo.', 0.95, 1);
    await playSyllablesSynced(current.syllables);
  }

  // ---------- Drag & Drop ----------
  function createDropSlot(index) {
    const slot = document.createElement('div');
    slot.className = 'drop-slot';
    slot.dataset.index = index;

    // Desktop: DnD nativo
    slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('is-hover'); });
    slot.addEventListener('dragenter', (e) => { e.preventDefault(); }); // garante drop no Safari
    slot.addEventListener('dragleave', () => { slot.classList.remove('is-hover'); });
    slot.addEventListener('drop', (e) => {
      e.preventDefault(); slot.classList.remove('is-hover');
      const text = e.dataTransfer.getData('text/plain');
      if (!text) return;
      if (slot.firstChild) bank.appendChild(slot.firstChild);
      slot.textContent = '';
      slot.appendChild(createDraggable(text));
      slot.classList.add('filled');
      validateProgress();
    });

    return slot;
  }

  function createDraggable(text) {
    const el = document.createElement('button');
    el.textContent = text;
    el.className = 'syllable-card draggable';
    el.dataset.syllable = text;

    // SEMPRE marque como draggable (para desktop),
    // e implementamos Pointer Events para touch.
    el.draggable = true;

    // ===== Desktop: DnD nativo =====
    el.addEventListener('dragstart', (e) => {
      el.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', text); } catch {}
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('click', () => saySyllable(text));

    // ===== Touch: Pointer Events =====
    // (só acionamos se NÃO for mouse, pra não conflitar com o nativo)
    let ph = null, hoverSlot = null, moved = false, offX = 0, offY = 0;

    const onMove = (e) => {
      e.preventDefault();
      moved = true;
      const x = e.clientX, y = e.clientY;
      el.style.left = (x - offX) + 'px';
      el.style.top  = (y - offY) + 'px';

      const elBelow = document.elementFromPoint(x, y);
      const slot = elBelow && elBelow.closest('.drop-slot');
      if (slot !== hoverSlot) {
        if (hoverSlot) hoverSlot.classList.remove('is-hover');
        hoverSlot = slot || null;
        if (hoverSlot) hoverSlot.classList.add('is-hover');
      }
    };

    const finishDrag = (e) => {
      try { el.releasePointerCapture(e.pointerId); } catch {}
      el.removeEventListener('pointermove', onMove, { passive: false });
      el.removeEventListener('pointerup', finishDrag);
      el.removeEventListener('pointercancel', finishDrag);

      if (!moved) { saySyllable(text); }

      if (hoverSlot) {
        if (hoverSlot.firstChild) bank.appendChild(hoverSlot.firstChild);
        hoverSlot.textContent = '';
        el.classList.remove('dragging');
        el.style.position = '';
        el.style.left = el.style.top = el.style.width = el.style.height = '';
        hoverSlot.appendChild(el);
        hoverSlot.classList.add('filled');
        hoverSlot.classList.remove('is-hover');
      } else {
        el.classList.remove('dragging');
        el.style.position = '';
        el.style.left = el.style.top = el.style.width = el.style.height = '';
        bank.appendChild(el);
      }

      if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
      ph = null; hoverSlot = null; moved = false;
      validateProgress();
    };

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;     // deixa o nativo trabalhar
      if (e.button !== 0) return;

      const r = el.getBoundingClientRect();
      ph = document.createElement('span');
      ph.className = 'syllable-placeholder';
      ph.style.width = r.width + 'px';
      ph.style.height = r.height + 'px';
      el.parentNode.insertBefore(ph, el);

      el.classList.add('dragging');
      el.style.position = 'fixed';
      el.style.width = r.width + 'px';
      el.style.height = r.height + 'px';
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';

      offX = e.clientX - r.left;
      offY = e.clientY - r.top;

      document.body.appendChild(el);

      try { el.setPointerCapture(e.pointerId); } catch {}
      moved = false;
      el.addEventListener('pointermove', onMove, { passive: false });
      el.addEventListener('pointerup', finishDrag);
      el.addEventListener('pointercancel', finishDrag);

      onMove(e);
    }, { passive: false });

    return el;
  }

  // ---------- Validação ----------
  function validateProgress() {
    const slots = [...dropZone.children];
    const attempt = slots.map(s => s.querySelector('[data-syllable]')?.dataset.syllable || null);
    const done = attempt.every(Boolean);
    const correct = done && attempt.join('-') === current.syllables.join('-');

    if (correct) {
      feedback.className = 'feedback';
      feedback.textContent = 'Muito bem! Você formou a palavra!';
      speak('Muito bem! Você formou a palavra!');
      fireConfetti();
      setTimeout(nextWord, 700);
    } else if (done) {
      feedback.className = 'feedback';
      feedback.textContent = 'Quase! Troque a ordem.';
      speak('Quase. Tente outra ordem.');
    } else {
      feedback.textContent = '';
    }
  }

  // ---------- Round ----------
  function buildRound() {
    current = SYLLABLE_WORDS[currentIndex];
    imageWrap.textContent = current.emoji;
    feedback.textContent = '';

    // exibidor superior p/ piscar durante TTS
    buildSyllableDisplay();

    // slots alvo
    dropZone.innerHTML = '';
    current.syllables.forEach((_, i) => dropZone.appendChild(createDropSlot(i)));

    // banco: sílabas da palavra + distratores
    bank.innerHTML = '';
    const distractors = makeDistractors(current.syllables);
    const pool = shuffle([...current.syllables, ...distractors]);
    pool.forEach(s => bank.appendChild(createDraggable(s)));
  }

  async function setupRound() {
    buildRound();
    if (soundToggle?.checked) {
      await speakAsync('Observe a figura. Vamos montar a palavra.', 0.95, 1);
      await playSyllablesSynced(current.syllables);
    }
  }

  function nextWord() {
    currentIndex = (currentIndex + 1) % SYLLABLE_WORDS.length;
    setupRound();
  }

  // ---------- Eventos ----------
  btnPlayWord.addEventListener('click', onPlayWord);
  btnPlaySyllables.addEventListener('click', () => playSyllablesSynced(current.syllables));
  btnRepeat.addEventListener('click', promptRepeat);
  btnNext.addEventListener('click', nextWord);
  btnReset.addEventListener('click', setupRound);
  soundToggle?.addEventListener('change', () => { window.speechSynthesis.cancel(); });

  // ---------- Inicial ----------
  setupRound();
})();
