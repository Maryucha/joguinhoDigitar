(function(){
  const WORDS = [
    "casa","bola","gato","pato","foca","peixe","uva","mala","pipa","fada","dado","riso","rua",
    "vaca","sapo","lobo","vila","moto","fogo","pao","suco","tatu","mato","pulo","pelo","dedo",
    "lima","copo","pera","cafe","logo","joia","areia","ninho","noite","dia","sol","lua",
    "verde","amarelo","azul","rosa","cabelo","nariz","dente","livro","papel","lapis","folha"
  ];

  const el = (id)=>document.getElementById(id);
  const playerNameInput = el('playerName');
  const modeSel = el('mode');
  const secondsInput = el('seconds');
  const startBtn = el('startBtn');
  const resetBtn = el('resetBtn');
  const skipBtn = el('skipBtn');
  const typebox = el('typebox');
  const promptEl = el('prompt');
  const wordChars = el('wordChars');
  const scoreEl = el('score');
  const hitsEl = el('hits');
  const missesEl = el('misses');
  const timeLeftEl = el('timeLeft');
  const bar = el('bar');
  const statusEl = el('status');
  const bubble = el('bubble');
  const confetti = el('confetti');
  const soundToggle = el('soundToggle');
  const speakBtn = el('speakBtn');
  const rankList = el('rankList');
  const rankModeBadge = el('rankModeBadge');

  let mode = 'letters';
  let target = '';
  let score = 0, hits = 0, misses = 0;
  let totalTime = 120, timeLeft = 120, timer = null, running = false;

  const MAX_ATTEMPTS = 3;
  let attemptsLeft = MAX_ATTEMPTS;

  const LS_NAME = 'typingGame.playerName';
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

  // ======= Sons (Web Audio) =======
  let audioCtx = null;
  function ensureAudio(){
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // tipos: 'ok' (acerto), 'err' (erro), 'show' (apareceu nova letra/palavra)
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
    o.start(now);
    o.stop(now + 0.25);
  }

  // ======= Falar (Speech Synthesis) =======
  function speakTarget(){
    const t = target.toUpperCase();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'pt-BR';
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ======= Util =======
  function pickLetter(){
    const code = 97 + Math.floor(Math.random()*26);
    return String.fromCharCode(code);
  }
  function pickWord(){ return WORDS[Math.floor(Math.random()*WORDS.length)] }

  function setMode(m){
    mode = m;
    promptEl.classList.toggle('letter', mode==='letters');
    promptEl.classList.toggle('word', mode==='words');
    wordChars.hidden = mode!=='words';
    wordChars.setAttribute('aria-hidden', mode!=='words');
    typebox.placeholder = mode==='letters' ? 'Digite a letra…' : 'Digite a palavra…';
    // Reset TOTAL ao trocar modalidade
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
      msgNeutral(`Qual é a letra? Você tem ${attemptsLeft} tentativas.`);
    }else{
      target = pickWord();
      promptEl.textContent = target.toUpperCase();
      renderWordCharacters();
      msgNeutral('Digite devagar, sem pressa 😊');
    }
    if(resetInput) typebox.value = '';
    // Som ao aparecer nova letra/palavra
    playTone('show');
    // 👇 FALAR AUTOMATICAMENTE TODA VEZ QUE APARECER
    // pequena espera para garantir atualização visual antes da fala
    setTimeout(speakTarget, 60);
  }

  function start(){
    let n = (playerNameInput.value || '').trim();
    if(!n){
      n = prompt('Qual é o seu nome?');
      if(!n || !n.trim()){
        msgBad('Precisamos do seu nome para começar 😊');
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
    statusEl.textContent = 'Valendo! ⏱️';

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
    statusEl.textContent = `Fim! Pontos: ${score}. Acertos: ${hits}, Erros: ${misses}.`;
    msgNeutral('Acabou o tempo! Quer jogar de novo?');

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
    statusEl.textContent = 'Aguardando início…';
    msgNeutral('Pronto para jogar 🎯');
  }

  function setProgress(p){ bar.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})` }
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)) }

  function msgGood(text){ bubble.className='status-bubble good'; bubble.textContent=text }
  function msgBad(text){ bubble.className='status-bubble bad'; bubble.textContent=text }
  function msgNeutral(text){ bubble.className='status-bubble'; bubble.textContent=text }

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
      confetti.appendChild(d);
      setTimeout(()=>d.remove(), 900);
    }
  }

  function normalize(s){
    return s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
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
        playTone('ok');
        celebrate();
        nextTarget(true); // falará automaticamente
      }else{
        attemptsLeft--;
        misses++; missesEl.textContent = misses;
        promptEl.classList.add('shake');
        setTimeout(()=>promptEl.classList.remove('shake'), 200);
        playTone('err');
        if(attemptsLeft>0){
          msgBad(`Ops, tente de novo! (${MAX_ATTEMPTS - attemptsLeft}/${MAX_ATTEMPTS})`);
          typebox.value = '';
        }else{
          msgBad(`Quase! Era "${target.toUpperCase()}". Vamos para a próxima!`);
          nextTarget(true); // falará automaticamente
        }
      }
    }else{
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
        msgBad('Tem algo diferente… tente devagar 😊');
        playTone('err');
      }else if(awarded>0){
        msgGood('Isso! Continue…');
        playTone('ok');
      }

      if(value === target){
        celebrate();
        setTimeout(()=> nextTarget(true), 300); // falará automaticamente
      }
    }
  }

  function skip(){
    if(!running) return;
    msgNeutral('Pulou. Sem pontos nem penalidade.');
    nextTarget(true); // falará automaticamente
  }

  // ======= Eventos =======
  startBtn.addEventListener('click', start);
  resetBtn.addEventListener('click', hardReset);
  skipBtn.addEventListener('click', skip);
  modeSel.addEventListener('change', ()=> setMode(modeSel.value));
  typebox.addEventListener('input', onInput);
  typebox.addEventListener('blur', ()=>{ if(running) typebox.focus() });
  speakBtn.addEventListener('click', speakTarget);
  playerNameInput.addEventListener('change', savePlayerName);

  // ======= Inicial =======
  loadPlayerName();
  setMode(modeSel.value);
  setProgress(1);
  timeLeftEl.textContent = 120;

})();
