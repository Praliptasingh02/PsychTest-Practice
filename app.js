// ==================== STATE ====================
let sessionWords = [];
let currentWordIndex = 0;
let timerInterval = null;
let timeLeft = 15;
let isPaused = false;
let isFocusMode = false;
let isCountdownMode = false;
let customWords = [];   // words loaded from uploaded file or manual list
let sessionHistory = JSON.parse(localStorage.getItem('wat_history') || '[]');

// ==================== FIREBASE STATE ====================
let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;
let isFirebaseActive = false;

// ==================== TRAINING STATE ====================
let trainingCategory = 'positive';
let trainingTimerSeconds = 15;
let trainingWordCount = 5;
let trainingCustomWordsList = [];
let trainingSessionWords = [];
let trainingCurrentWordIndex = 0;
let trainingTimerInterval = null;
let trainingTimeLeft = 15;
let currentWordAIAnswers = [];

// ==================== NAVIGATION ====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) { el.classList.add('active'); el.scrollTop = 0; }
}

// ==================== HOME STATS ====================
function updateHomeStats() {
  const sessionsVal = document.getElementById('stat-sessions-val');
  const bestVal = document.getElementById('stat-best-val');
  const avgVal = document.getElementById('stat-avg-val');
  if (sessionsVal) sessionsVal.textContent = sessionHistory.length;
  if (sessionHistory.length === 0) {
    if (bestVal) bestVal.textContent = '—';
    if (avgVal) avgVal.textContent = '—';
  } else {
    const scores = sessionHistory.map(s => s.score);
    if (bestVal) bestVal.textContent = Math.max(...scores);
    if (avgVal) avgVal.textContent = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
  }
}

// ==================== FILE & MANUAL UPLOAD ====================
function parseWordList(text) {
  const raw = text.split(/[\n\r,\t]+/);
  const parsed = [];
  raw.forEach(line => {
    // Remove leading numbers like "1." "1)" "1:"
    const cleaned = line.replace(/^\s*\d+[.):\-\s]+/, '').trim();
    // Remove trailing _1 _2 style suffixes
    const word = cleaned.replace(/_\d+$/, '').trim();
    if (word.length > 1 && word.length < 40 && /^[A-Za-z\s\-_]+$/.test(word)) {
      // Normalize camelCase and remove suffixes
      let cleanedWord = word.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
      cleanedWord = cleanedWord.replace(/\s+/g, ' ');
      parsed.push(cleanedWord);
    }
  });
  return [...new Set(parsed.map(w => w.trim()).filter(Boolean))];
}

function handleWordFileUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const unique = parseWordList(e.target.result);
    if (unique.length < 1) {
      alert('Could not find any valid words in the file. Please check the format.');
      return;
    }
    customWords = unique;
    const badge = document.getElementById('upload-badge');
    badge.textContent = `✓ ${unique.length} words loaded from file`;
    badge.classList.add('loaded');
    document.getElementById('btn-clear-upload').style.display = 'inline-flex';
  };
  reader.readAsText(file);
}

function handleManualWordInput() {
  const text = document.getElementById('manual-words-input').value;
  const unique = parseWordList(text);
  if (unique.length < 1) {
    alert('Please enter at least one valid word.');
    return;
  }
  customWords = unique;
  const badge = document.getElementById('upload-badge');
  badge.textContent = `✓ ${unique.length} words loaded manually`;
  badge.classList.add('loaded');
  document.getElementById('btn-clear-upload').style.display = 'inline-flex';
}

function switchUploadMode(mode) {
  const modeFile = document.getElementById('mode-file-content');
  const modeManual = document.getElementById('mode-manual-content');
  const btnFile = document.getElementById('tab-btn-file');
  const btnManual = document.getElementById('tab-btn-manual');

  if (mode === 'file') {
    modeFile.style.display = 'block';
    modeManual.style.display = 'none';
    btnFile.classList.add('active');
    btnManual.classList.remove('active');
  } else {
    modeFile.style.display = 'none';
    modeManual.style.display = 'block';
    btnFile.classList.remove('active');
    btnManual.classList.add('active');
  }
}

function clearUpload() {
  customWords = [];
  document.getElementById('word-file-input').value = '';
  const badge = document.getElementById('upload-badge');
  badge.textContent = 'No file loaded — using default word bank';
  badge.classList.remove('loaded');
  document.getElementById('btn-clear-upload').style.display = 'none';
}

// ==================== NORMAL SESSION ====================
function startSession() {
  // Query backend for words dynamically based on upload state
  let url = `/api/words?count=60`;
  if (customWords.length > 0) {
    // If user has custom words uploaded, we send them to the backend or use them directly
    sessionWords = [...customWords];
    if (sessionWords.length < 60) {
      // pad with random default words via API
      fetch(`/api/words?category=random&count=${60 - sessionWords.length}`)
        .then(r => r.json())
        .then(data => {
          sessionWords = [...sessionWords, ...data.words.map(w => w.word)];
          sessionWords = sessionWords.sort(() => Math.random() - 0.5);
          launchSession();
        });
      return;
    } else {
      sessionWords = sessionWords.slice(0, 60).sort(() => Math.random() - 0.5);
      launchSession();
      return;
    }
  }

  // default session words
  fetch(`/api/words?category=random&count=60`)
    .then(r => r.json())
    .then(data => {
      sessionWords = data.words.map(w => w.word);
      launchSession();
    });
}

function launchSession() {
  currentWordIndex = 0;
  isPaused = false;
  showScreen('session-wat');
  startCountdown();
}

function startCountdown() {
  const overlay = document.getElementById('countdown-overlay');
  const number = document.getElementById('countdown-number');
  overlay.classList.remove('hidden');
  isCountdownMode = true;
  
  let count = 5;
  number.textContent = count;
  number.style.fontSize = '8rem';
  
  const intv = setInterval(() => {
    count--;
    if (count > 0) {
      number.textContent = count;
    } else if (count === 0) {
      number.textContent = "START!";
      number.style.fontSize = '5rem';
    } else {
      clearInterval(intv);
      overlay.classList.add('hidden');
      isCountdownMode = false;
      loadWord(0);
    }
  }, 1000);
}

function loadWord(idx) {
  if (idx >= sessionWords.length) { endSession(); return; }
  currentWordIndex = idx;
  const word = sessionWords[idx];
  const total = sessionWords.length;
  const progress = (idx / total) * 100;

  document.getElementById('word-text').textContent = word.toUpperCase();
  document.getElementById('word-number').textContent = '#' + String(idx + 1).padStart(2, '0');
  document.getElementById('hud-word-num').textContent = (idx + 1) + ' / ' + total;
  document.getElementById('session-progress-fill').style.width = progress + '%';
  document.getElementById('focus-word').textContent = word.toUpperCase();

  // Reanimate word card
  const card = document.getElementById('word-card');
  card.style.animation = 'none';
  card.offsetHeight; // reflow
  card.style.animation = '';

  startTimer();
}

function startTimer() {
  clearInterval(timerInterval);
  timeLeft = 15;
  updateTimerUI(15);
  timerInterval = setInterval(() => {
    if (isPaused) return;
    timeLeft--;
    updateTimerUI(timeLeft);
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      nextWord();
    }
  }, 1000);
}

function updateTimerUI(t) {
  const el = document.getElementById('timer-val');
  const prog = document.getElementById('timer-progress');
  const circ = 339.29;
  const offset = circ - (t / 15) * circ;
  prog.style.strokeDashoffset = offset;
  el.textContent = t;
  document.getElementById('focus-timer').textContent = t;

  prog.classList.remove('warn','danger');
  el.classList.remove('warn','danger');

  if (t <= 5) {
    prog.classList.add('danger'); el.classList.add('danger');
  } else if (t <= 8) {
    prog.classList.add('warn'); el.classList.add('warn');
  }
}

function nextWord() {
  loadWord(currentWordIndex + 1);
}

function pauseSession() {
  if (isCountdownMode) return;
  isPaused = true;
  document.getElementById('pause-modal').classList.remove('hidden');
}

function resumeSession() {
  isPaused = false;
  document.getElementById('pause-modal').classList.add('hidden');
}

function endSession() {
  clearInterval(timerInterval);
  buildReviewScreen();
  showScreen('review-wat');
}

// ==================== FOCUS MODE ====================
function enterFocusMode() {
  if (isCountdownMode) return;
  isFocusMode = true;
  document.getElementById('focus-overlay').classList.remove('hidden');
  document.getElementById('focus-word').textContent = document.getElementById('word-text').textContent;
}

function exitFocusMode() {
  isFocusMode = false;
  document.getElementById('focus-overlay').classList.add('hidden');
}

// ==================== REVIEW ====================
function buildReviewScreen() {
  const grid = document.getElementById('review-grid');
  grid.innerHTML = '';
  sessionWords.forEach((word, i) => {
    const div = document.createElement('div');
    div.className = 'review-word';
    div.dataset.idx = i;
    div.innerHTML = `<span class="word-idx">${String(i+1).padStart(2,'0')}</span>${word}`;
    div.addEventListener('click', () => toggleAttempted(div));
    grid.appendChild(div);
  });
  updateReviewStats();
}

function toggleAttempted(el) {
  el.classList.toggle('attempted');
  updateReviewStats();
}

function updateReviewStats() {
  const attempted = document.querySelectorAll('#review-grid .review-word.attempted').length;
  const total = sessionWords.length;
  const skipped = total - attempted;
  const pct = Math.round((attempted / total) * 100);
  document.getElementById('rs-attempted').textContent = attempted;
  document.getElementById('rs-skipped').textContent = skipped;
  document.getElementById('rs-percent').textContent = pct + '%';
}

function selectAll() {
  document.querySelectorAll('#review-grid .review-word').forEach(el => el.classList.add('attempted'));
  updateReviewStats();
}

function submitReview() {
  const attemptedCount = document.querySelectorAll('#review-grid .review-word.attempted').length;
  const total = sessionWords.length;
  const pct = Math.round((attemptedCount / total) * 100);
  const entry = {
    date: new Date().toISOString(),
    score: attemptedCount,
    total: total,
    percent: pct,
    words: sessionWords,
    attempted: [...document.querySelectorAll('#review-grid .review-word.attempted')].map(e => parseInt(e.dataset.idx))
  };
  sessionHistory.push(entry);
  localStorage.setItem('wat_history', JSON.stringify(sessionHistory));

  if (isFirebaseActive && currentUser) {
    firebaseDb.collection('users').doc(currentUser.uid).collection('wat_history')
      .add(entry)
      .then(() => {
        console.log("WAT history entry synced to Firestore.");
        loadHistoryState();
      })
      .catch(err => {
        console.error("Firestore WAT save error:", err);
        buildAnalysisScreen(entry);
        showScreen('analysis-wat');
      });
  }

  buildAnalysisScreen(entry);
  showScreen('analysis-wat');
}

// ==================== ANALYSIS ====================
function buildAnalysisScreen(entry) {
  const { score, total, percent, words, attempted } = entry;

  // Score circle
  document.getElementById('score-big').textContent = score;
  document.getElementById('score-pct').textContent = percent + '%';
  const circ = 534;
  const offset = circ - (score / total) * circ;
  setTimeout(() => {
    document.getElementById('score-arc').style.strokeDashoffset = offset;
  }, 300);

  // Grade
  let grade, label, color;
  if (percent >= 90) { grade='A+'; label='Outstanding!'; color='#2ed573'; }
  else if (percent >= 80) { grade='A'; label='Excellent'; color='#2ed573'; }
  else if (percent >= 70) { grade='B+'; label='Very Good'; color='#d4af37'; }
  else if (percent >= 60) { grade='B'; label='Good'; color='#d4af37'; }
  else if (percent >= 50) { grade='C'; label='Average'; color='#ffa502'; }
  else { grade='D'; label='Keep Practicing'; color='#ff4757'; }

  document.getElementById('grade-letter').textContent = grade;
  document.getElementById('grade-letter').style.color = color;
  document.getElementById('grade-label').textContent = label;

  // Comparison
  const compSection = document.getElementById('comparison-section');
  const compBars = document.getElementById('comparison-bars');
  compBars.innerHTML = '';

  if (sessionHistory.length > 1) {
    compSection.style.display = '';
    const prev = sessionHistory[sessionHistory.length - 2];
    const diff = score - prev.score;
    const items = [
      { label: 'Previous', val: prev.score, color: '#8899aa' },
      { label: 'Current', val: score, color: color }
    ];
    items.forEach(item => {
      const pct = (item.val / total) * 100;
      compBars.innerHTML += `
        <div class="comp-bar-wrap">
          <span class="comp-bar-label">${item.label}</span>
          <div class="comp-bar-track"><div class="comp-bar-fill" style="width:0%;background:${item.color}" data-pct="${pct}"></div></div>
          <span class="comp-bar-val">${item.val}/${total}</span>
        </div>`;
    });
    setTimeout(() => {
      document.querySelectorAll('.comp-bar-fill').forEach(el => {
        el.style.width = el.dataset.pct + '%';
      });
    }, 400);

    const note = document.createElement('p');
    note.style.cssText = 'margin-top:12px;font-size:.9rem;text-align:center;';
    note.style.color = diff >= 0 ? '#2ed573' : '#ff4757';
    note.textContent = diff === 0 ? 'Same as last session.' : (diff > 0 ? `▲ +${diff} words better than last session!` : `▼ ${Math.abs(diff)} words fewer than last session.`);
    compBars.appendChild(note);
  } else {
    compSection.style.display = 'none';
  }

  // Trend Chart
  drawTrendChart();

  // Breakdown
  const grid = document.getElementById('breakdown-grid');
  grid.innerHTML = '';
  words.forEach((w, i) => {
    const done = attempted.includes(i);
    grid.innerHTML += `<div class="bd-word ${done?'done':'skip'}">${done?'✓':''} ${w}</div>`;
  });
}

function drawTrendChart() {
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 700;
  const H = 180;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const data = sessionHistory.slice(-10).map(s => s.score);
  if (data.length < 1) return;

  const pad = { top: 20, right: 20, bottom: 30, left: 40 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const maxVal = 60;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  [0,20,40,60].forEach(v => {
    const y = pad.top + ch - (v / maxVal) * ch;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = 'rgba(136,153,170,0.8)';
    ctx.font = '10px Orbitron, monospace';
    ctx.fillText(v, 4, y + 4);
  });

  if (data.length === 1) {
    const x = pad.left + cw / 2;
    const y = pad.top + ch - (data[0] / maxVal) * ch;
    ctx.fillStyle = '#d4af37';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2); ctx.fill();
    return;
  }

  const pts = data.map((v, i) => ({
    x: pad.left + (i / (data.length - 1)) * cw,
    y: pad.top + ch - (v / maxVal) * ch
  }));

  // Area fill
  const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
  grad.addColorStop(0, 'rgba(212,175,55,0.3)');
  grad.addColorStop(1, 'rgba(212,175,55,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H - pad.bottom);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, H - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Dots
  pts.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
    ctx.fillStyle = '#d4af37'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Exo2, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data[i], p.x, p.y - 10);
  });

  // X labels
  ctx.fillStyle = 'rgba(136,153,170,0.8)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
pts.forEach((p, i) => {
    ctx.fillText(`S${sessionHistory.length - data.length + i + 1}`, p.x, H - 6);
  });
}

// ==================== DYNAMIC MODEL ANSWERS (NORMAL SESSION) ====================
function buildAnswersSection(words) {
  const grid = document.getElementById('answers-grid');
  if (!grid) return;
  grid.innerHTML = '';
  
  words.forEach((word, i) => {
    const card = document.createElement('div');
    card.className = 'answer-card';
    card.style.cssText = "margin-bottom:15px; background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:15px;";
    card.innerHTML = `
      <div class="answer-card-header" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="toggleModelAnswerOnDemand('${word}', this, ${i})">
        <div class="answer-word" style="display:flex; align-items:center; gap:10px;">
          <span class="answer-idx" style="font-family:Orbitron; color:var(--gold); font-size:1.1rem;">${String(i+1).padStart(2,'0')}</span>
          <span class="answer-wordtext" style="font-family:Orbitron; font-weight:700; font-size:1.2rem; letter-spacing:1px; color:#fff;">${word.toUpperCase()}</span>
        </div>
        <button class="btn-toggle-model-answers" style="font-family:'Exo 2'; font-size:0.8rem; background:rgba(212,175,55,0.1); border:1px solid rgba(212,175,55,0.3); color:var(--gold); padding:6px 12px; border-radius:4px; cursor:pointer; transition:0.2s;">Show Model Answers 🔍</button>
      </div>
      <div class="model-answers-drawer-container hidden" style="margin-top:12px; border-top:1px dashed rgba(255,255,255,0.06); padding-top:12px;">
        <div class="loading-placeholder" style="display:flex; flex-direction:column; align-items:center; padding:15px 0;">
          <div style="width: 20px; height: 20px; border: 2.5px solid var(--gold); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 8px;"></div>
          <p style="font-size:0.75rem;color:var(--text-dim);font-family:'Exo 2';">Psychologist is compiling dynamic model answers...</p>
        </div>
        <div class="drawer-answers-grid"></div>
      </div>
    `;
    grid.appendChild(card);
  });
}

window.toggleModelAnswerOnDemand = function(word, headerEl, idx) {
  const container = headerEl.nextElementSibling;
  const button = headerEl.querySelector('.btn-toggle-model-answers');
  
  if (!container.classList.contains('hidden')) {
    container.classList.add('hidden');
    button.textContent = 'Show Model Answers 🔍';
    return;
  }
  
  container.classList.remove('hidden');
  button.textContent = 'Hide Model Answers ✕';
  
  const grid = container.querySelector('.drawer-answers-grid');
  const loading = container.querySelector('.loading-placeholder');
  
  if (grid.children.length > 0) return; // already loaded
  
  fetch('/api/model-answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word: word })
  })
  .then(res => res.json())
  .then(data => {
    loading.classList.add('hidden');
    grid.innerHTML = '';
    const answers = data.model_answers || [];
    if (answers.length === 0) {
      grid.innerHTML = `<p style="font-size:0.8rem;color:var(--text-dim);">No model answers found. Spontaneous thinking reflects positive attitude.</p>`;
      return;
    }
    answers.forEach(ans => {
      grid.innerHTML += `
        <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed rgba(255,255,255,0.04);">
          <p class="answer-text" style="font-size: 1.05rem; color: #fff; margin-bottom: 8px;">${ans.sentence}</p>
          <div class="model-olqs-row" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            ${ans.olqs.map(o => `<span class="olq-badge" style="font-size:0.75rem; background:rgba(212,175,55,0.1); color:var(--gold); border:1px solid rgba(212,175,55,0.2); padding:2px 8px; border-radius:4px;">${o}</span>`).join('')}
            <button class="btn-toggle-explanation" onclick="toggleNormalExplanation(this)" style="font-size: 0.75rem; background: transparent; border: none; color: var(--text-dim); text-decoration: underline; cursor: pointer;">Show Explanation</button>
          </div>
          <div class="model-explanation-box hidden" style="margin-top: 8px; padding: 10px; background: rgba(255,255,255,0.02); border-left: 2px solid var(--gold); font-size: 0.85rem; color: var(--text-dim); font-family: 'Exo 2'; line-height: 1.4;">
            ${ans.explanation}
          </div>
        </div>`;
    });
  })
  .catch(() => {
    loading.classList.add('hidden');
    grid.innerHTML = `<p style="font-size:0.8rem;color:var(--text-dim);">Failed to fetch answers. Spontaneous thought shows immediate response.</p>`;
  });
};

function toggleNormalExplanation(btn) {
  const box = btn.parentElement.nextElementSibling;
  if (box.classList.contains('hidden')) {
    box.classList.remove('hidden');
    btn.textContent = 'Hide Explanation';
  } else {
    box.classList.add('hidden');
    btn.textContent = 'Show Explanation';
  }
}


// ==================== WAT TRAINING SESSION WORKFLOW ====================
let trainingSessionAttempts = []; // store candidate responses & score for report

function selectTrainingCategory(cat, btn) {
  trainingCategory = cat;
  document.querySelectorAll('.cat-select-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const customArea = document.getElementById('custom-word-group');
  const countGroup = document.getElementById('training-count-group');
  if (cat === 'custom') {
    customArea.classList.remove('hidden');
    countGroup.classList.add('hidden'); // count is determined by entered custom list size
  } else {
    customArea.classList.add('hidden');
    countGroup.classList.remove('hidden');
  }
}

function updateTrainingTimerLabel(val) {
  trainingTimerSeconds = parseInt(val);
  document.getElementById('training-timer-val').textContent = val + 's';
}

function selectTrainingCount(count, btn) {
  trainingWordCount = count;
  document.querySelectorAll('.count-select-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function startTrainingSession() {
  trainingSessionAttempts = []; // reset
  if (trainingCategory === 'custom') {
    const raw = document.getElementById('training-custom-words').value;
    trainingCustomWordsList = parseWordList(raw);
    if (trainingCustomWordsList.length < 1) {
      alert('Please type or paste at least one custom word to practice!');
      return;
    }
    trainingSessionWords = [...trainingCustomWordsList];
    trainingWordCount = trainingSessionWords.length;
    launchTraining();
  } else {
    // Load words from backend based on positive/negative/neutral/random filter
    fetch(`/api/words?category=${trainingCategory}&count=${trainingWordCount}`)
      .then(r => r.json())
      .then(data => {
        trainingSessionWords = data.words.map(w => w.word);
        launchTraining();
      })
      .catch(() => {
        alert('Failed to connect to word bank server. Running standard positive bank instead.');
        trainingSessionWords = ["Ability", "Aplomb", "Brave", "Command", "Duty"].slice(0, trainingWordCount);
        launchTraining();
      });
  }
}

function launchTraining() {
  trainingCurrentWordIndex = 0;
  showScreen('session-wat-training');
  loadTrainingWord(0);
}

function loadTrainingWord(idx) {
  if (idx >= trainingSessionWords.length) {
    endTrainingSession();
    return;
  }
  trainingCurrentWordIndex = idx;
  const word = trainingSessionWords[idx];
  const total = trainingSessionWords.length;
  const progress = (idx / total) * 100;

  // Reset inputs & panel states
  document.getElementById('training-answer-input').value = '';
  document.getElementById('training-answer-input').disabled = false;
  document.getElementById('btn-training-submit').disabled = false;
  document.getElementById('training-feedback-panel').classList.add('hidden');
  document.getElementById('btn-training-next').classList.add('hidden');
  document.getElementById('training-model-answers-drawer').classList.add('hidden');

  const showModelBtn = document.getElementById('btn-show-model-answers');
  showModelBtn.textContent = '🔍 Show 3 Model Answers';
  showModelBtn.classList.remove('hidden');

  // Load text display
  document.getElementById('training-word-text').textContent = word.toUpperCase();
  document.getElementById('training-word-number').textContent = '#' + String(idx + 1).padStart(2, '0');
  document.getElementById('training-hud-word-num').textContent = (idx + 1) + ' / ' + total;
  document.getElementById('training-progress-fill').style.width = progress + '%';

  // Category label
  const catBadge = document.getElementById('training-category-badge');
  catBadge.textContent = trainingCategory.toUpperCase();

  // Reset SVG & interactive countdown
  startTrainingTimer();
}

function startTrainingTimer() {
  clearInterval(trainingTimerInterval);
  trainingTimeLeft = trainingTimerSeconds;
  updateTrainingTimerUI(trainingTimeLeft);

  trainingTimerInterval = setInterval(() => {
    trainingTimeLeft--;
    updateTrainingTimerUI(trainingTimeLeft);
    if (trainingTimeLeft <= 0) {
      clearInterval(trainingTimerInterval);
      // Under training session guidelines, when timer expires:
      // The word does NOT change automatically. We allow candidate to type their spontaneous answer.
      // We just alert visually.
    }
  }, 1000);
}

function updateTrainingTimerUI(t) {
  const el = document.getElementById('training-timer-val');
  const prog = document.getElementById('training-timer-progress');
  const circ = 339.29;
  const pct = Math.max(0, t) / trainingTimerSeconds;
  const offset = circ - pct * circ;
  
  if (prog) prog.style.strokeDashoffset = offset;
  if (el) el.textContent = Math.max(0, t);

  if (prog) {
    prog.classList.remove('warn','danger');
    if (t <= 5) prog.classList.add('danger');
    else if (t <= 8) prog.classList.add('warn');
  }
}

function submitTrainingAnswer() {
  const text = document.getElementById('training-answer-input').value.trim();
  if (text.length === 0) {
    alert('Spontaneous response cannot be blank! Type your initial thought.');
    return;
  }

  // Stop timer completely
  clearInterval(trainingTimerInterval);

  // Show psychologist loading screen overlay
  const overlay = document.getElementById('training-loading-overlay');
  overlay.classList.remove('hidden');

  const word = trainingSessionWords[trainingCurrentWordIndex];
  
  fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      word: word,
      answer: text,
      category: trainingCategory
    })
  })
  .then(res => res.json())
  .then(data => {
    overlay.classList.add('hidden');
    if (data.error) {
      alert(`API key issue: ${data.error}. Check your .env file or try again.`);
      return;
    }
    
    // [ignoring loop detection]
    // Track attempts for report generation
    trainingSessionAttempts.push({
      word: word,
      answer: text,
      score: data.score || 7,
      assessment: data.assessment || 'Spontaneous response shows officer like potential.'
    });

    displayTrainingFeedback(data);
  })
  .catch(() => {
    overlay.classList.add('hidden');
    alert('Network failure evaluating response. Displaying sandbox simulated score.');
    const fallback = {
      score: 8,
      naturalness: 'Natural',
      dominant_olqs: ['Effective Intelligence', 'Social Adaptability', 'Courage'],
      weaknesses: [],
      improved_version: 'Spontaneous action yields clear results in dynamic scenarios.',
      assessment: 'Spontaneous, positive, and demonstrates prompt decision-making skills under stress.'
    };
    
    trainingSessionAttempts.push({
      word: word,
      answer: text,
      score: 8,
      assessment: fallback.assessment
    });
    displayTrainingFeedback(fallback);
  });
}

function displayTrainingFeedback(data) {
  // Lock inputs
  document.getElementById('training-answer-input').disabled = true;
  document.getElementById('btn-training-submit').disabled = true;

  // Reveal results card
  const panel = document.getElementById('training-feedback-panel');
  panel.classList.remove('hidden');
  document.getElementById('btn-training-next').classList.remove('hidden');

  // Fill values
  document.getElementById('feedback-score-val').textContent = data.score;
  document.getElementById('feedback-psych-text').textContent = data.assessment;

  // Naturalness
  const natTag = document.getElementById('feedback-nat-tag');
  natTag.textContent = data.naturalness.toUpperCase();
  natTag.className = 'feedback-naturalness-tag';
  if (data.naturalness.toLowerCase() === 'natural') {
    natTag.classList.add('natural');
  } else {
    natTag.classList.add('unnatural');
  }

  // Metrics Pills (Score details)
  const metricsGrid = document.getElementById('feedback-metrics-grid');
  metricsGrid.innerHTML = '';
  
  // Custom metrics generated by psychologist
  const metrics = [
    { name: 'Positivity', val: data.score >= 8 ? 'High' : (data.score >= 5 ? 'Medium' : 'Low') },
    { name: 'Practicality', val: data.score >= 6 ? 'Strong' : 'Average' },
    { name: 'Clarity', val: 'Excellent' }
  ];
  metrics.forEach(m => {
    metricsGrid.innerHTML += `
      <div class="metric-pill">
        <span class="metric-name">${m.name}</span>
        <span class="metric-score">${m.val}</span>
      </div>`;
  });

  // OLQs Badges
  const olqBox = document.getElementById('feedback-olq-container');
  olqBox.innerHTML = '';
  if (data.dominant_olqs && data.dominant_olqs.length > 0) {
    data.dominant_olqs.forEach(o => {
      olqBox.innerHTML += `<span class="olq-badge">${o}</span>`;
    });
  } else {
    olqBox.innerHTML = `<span class="olq-badge" style="background:rgba(255,255,255,0.05);color:var(--text-dim);">General OLQ</span>`;
  }

  // Weaknesses
  const weaknessList = document.getElementById('feedback-weakness-list');
  weaknessList.innerHTML = '';
  if (data.weaknesses && data.weaknesses.length > 0) {
    data.weaknesses.forEach(w => {
      weaknessList.innerHTML += `<li>${w}</li>`;
    });
  } else {
    weaknessList.innerHTML = `<li>None detected. Excellent officer-like orientation.</li>`;
  }

  // Improved recommendation
  document.getElementById('feedback-improved-text').textContent = `"${data.improved_version}"`;
}

function revealTrainingModelAnswers() {
  const drawer = document.getElementById('training-model-answers-drawer');
  const btn = document.getElementById('btn-show-model-answers');
  
  drawer.classList.remove('hidden');
  btn.classList.add('hidden');

  fetchTrainingModelAnswers();
}

function fetchTrainingModelAnswers() {
  const grid = document.getElementById('training-model-grid');
  grid.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <div style="width: 25px; height: 25px; border: 3px solid var(--gold); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
      <p style="font-size:0.8rem;color:var(--text-dim);">Generating model answers...</p>
    </div>
  `;

  const word = trainingSessionWords[trainingCurrentWordIndex];
  
  fetch('/api/model-answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      word: word,
      category: trainingCategory
    })
  })
  .then(res => res.json())
  .then(data => {
    grid.innerHTML = '';
    currentWordAIAnswers = data.model_answers || [];
    
    if (currentWordAIAnswers.length === 0) {
      grid.innerHTML = `<p style="font-size:0.8rem;color:var(--text-dim);text-align:center;">No answers found.</p>`;
      return;
    }

    currentWordAIAnswers.forEach((ans, i) => {
      const card = document.createElement('div');
      card.className = 'model-answer-card';
      card.innerHTML = `
        <p class="model-sentence">"${ans.sentence}"</p>
        <div class="model-olqs-row">
          ${ans.olqs.map(o => `<span class="olq-badge" style="font-size:0.7rem;padding:2px 6px;">${o}</span>`).join('')}
          <button class="btn-toggle-explanation" onclick="toggleExplanationBox(this)">Show Explanation</button>
        </div>
        <div class="model-explanation-box hidden">
          ${ans.explanation}
        </div>
      `;
      grid.appendChild(card);
    });
  })
  .catch(() => {
    grid.innerHTML = `<p style="font-size:0.8rem;color:var(--text-dim);text-align:center;">Failed to generate model answers. Try again.</p>`;
  });
}

function toggleExplanationBox(btn) {
  const box = btn.parentElement.nextElementSibling;
  if (box.classList.contains('hidden')) {
    box.classList.remove('hidden');
    btn.textContent = 'Hide Explanation';
  } else {
    box.classList.add('hidden');
    btn.textContent = 'Show Explanation';
  }
}

function refreshTrainingModelAnswers() {
  fetchTrainingModelAnswers();
}

function nextTrainingWord() {
  loadTrainingWord(trainingCurrentWordIndex + 1);
}

// Add custom word during session
window.addWordToSession = function() {
  const input = document.getElementById('add-word-input');
  const text = input.value.trim();
  if (text.length === 0) return;

  const parsed = parseWordList(text);
  if (parsed.length === 0) {
    alert('Please enter a valid word (alphabets only).');
    return;
  }

  const newWord = parsed[0];
  // Insert right after current active word index
  trainingSessionWords.splice(trainingCurrentWordIndex + 1, 0, newWord);
  
  // Clear input
  input.value = '';
  
  // Visual toast
  const label = document.querySelector('.add-word-label');
  const orig = label.textContent;
  label.textContent = `✓ "${newWord}" added!`;
  label.style.color = 'var(--success)';
  setTimeout(() => {
    label.textContent = orig;
    label.style.color = '';
  }, 2000);

  // Update HUD
  const total = trainingSessionWords.length;
  document.getElementById('training-hud-word-num').textContent = (trainingCurrentWordIndex + 1) + ' / ' + total;
};

// End active training session and load summary card
window.endTrainingSession = function() {
  clearInterval(trainingTimerInterval);

  if (trainingSessionAttempts.length === 0) {
    alert('No words practiced yet! Submit at least one answer before ending.');
    return;
  }

  // Hide report card
  document.getElementById('report-card').classList.add('hidden');
  document.getElementById('btn-generate-report').classList.remove('hidden');

  // Compute stats
  const totalAttempted = trainingSessionAttempts.length;
  const avg = Math.round(trainingSessionAttempts.reduce((acc, x) => acc + x.score, 0) / totalAttempted);
  
  let grade = 'D';
  if (avg >= 9) grade = 'A+';
  else if (avg >= 8) grade = 'A';
  else if (avg >= 7) grade = 'B+';
  else if (avg >= 6) grade = 'B';
  else if (avg >= 5) grade = 'C';

  // Fill stats UI
  document.getElementById('tr-words-attempted').textContent = totalAttempted;
  document.getElementById('tr-avg-score').textContent = avg + '/10';
  document.getElementById('tr-grade').textContent = grade;

  // Build list accordion
  const box = document.getElementById('training-history-box');
  box.innerHTML = '';
  trainingSessionAttempts.forEach((x, i) => {
    box.innerHTML += `
      <div class="training-history-item" style="margin-bottom: 12px; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); border-radius: 6px;">
        <div class="tr-hist-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <span class="tr-hist-word" style="font-family:Orbitron; font-weight:700; color:var(--gold);">${i + 1}. ${x.word.toUpperCase()}</span>
          <span class="tr-hist-score" style="font-family:Orbitron; font-size:0.9rem; background:rgba(212,175,55,0.1); color:var(--gold); padding:2px 8px; border-radius:4px;">Score: ${x.score}/10</span>
        </div>
        <p class="tr-hist-answer" style="font-size:0.95rem; color:#fff; margin-bottom:4px;">"${x.answer}"</p>
        <p style="font-size:0.8rem; color:var(--text-dim); font-style:italic;">Psychologist: ${x.assessment}</p>
      </div>`;
  });

  showScreen('training-results');
};

// Generate Psychologist Report (CONCISE ~100 words covering goods, bads, improvements)
window.generateTrainingReport = function() {
  const reportCard = document.getElementById('report-card');
  const loading = document.getElementById('report-loading');
  const content = document.getElementById('report-content');
  const btn = document.getElementById('btn-generate-report');

  btn.classList.add('hidden');
  reportCard.classList.remove('hidden');
  loading.classList.remove('hidden');
  content.classList.add('hidden');

  fetch('/api/training-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses: trainingSessionAttempts })
  })
  .then(res => res.json())
  .then(data => {
    loading.classList.add('hidden');
    if (data.error) {
      alert(`API key issue: ${data.error}. Running local backup report.`);
      data = {
        goods: "The candidate shows high liveliness and power of expression. Sentences demonstrate high emotional control under speed pressure.",
        bads: "Some responses reflect passive or general themes rather than proactive personal leadership actions.",
        improvement: "Focus on using positive active verbs and placing oneself in roles that showcase responsibility and initiative."
      };
    }
    
    document.getElementById('report-goods').textContent = data.goods;
    document.getElementById('report-bads').textContent = data.bads;
    document.getElementById('report-improvement').textContent = data.improvement;
    content.classList.remove('hidden');
  })
  .catch(() => {
    loading.classList.add('hidden');
    // Simulated psychologist report fallback
    document.getElementById('report-goods').textContent = "Strong emotional stability and practical focus demonstrated. Clear structure observed in short sentences.";
    document.getElementById('report-bads').textContent = "Lacks initiative in custom words. Escapist tendency observed when encountering difficult words.";
    document.getElementById('report-improvement').textContent = "Develop proactive action loops. Connect responses to active group leadership scenarios rather than solitary thoughts.";
    content.classList.remove('hidden');
  });
};

// Download dynamic psychological report in TXT format
window.downloadTrainingReport = function() {
  if (trainingSessionAttempts.length === 0) {
    alert("No training session attempts recorded.");
    return;
  }

  const totalAttempted = trainingSessionAttempts.length;
  const avg = Math.round(trainingSessionAttempts.reduce((acc, x) => acc + x.score, 0) / totalAttempted);
  
  let grade = 'D';
  if (avg >= 9) grade = 'A+';
  else if (avg >= 8) grade = 'A';
  else if (avg >= 7) grade = 'B+';
  else if (avg >= 6) grade = 'B';
  else if (avg >= 5) grade = 'C';

  let txt = `==================================================\n`;
  txt += `        INDIAN ARMED FORCES - SSB WAT REPORT      \n`;
  txt += `==================================================\n\n`;
  txt += `Date/Time  : ${new Date().toLocaleString()}\n`;
  txt += `Category   : ${trainingCategory.toUpperCase()}\n`;
  txt += `Words Done : ${totalAttempted}\n`;
  txt += `Avg Score  : ${avg}/10\n`;
  txt += `Grade      : ${grade}\n\n`;
  txt += `--------------------------------------------------\n`;
  txt += `          PSYCHOLOGIST OVERALL ASSESSMENT         \n`;
  txt += `--------------------------------------------------\n`;
  
  const reportCard = document.getElementById('report-card');
  const hasReport = reportCard && !reportCard.classList.contains('hidden');
  
  if (hasReport) {
    txt += `[GOODS (Personality Strengths)]\n`;
    txt += `${document.getElementById('report-goods').textContent}\n\n`;
    txt += `[BADS (Personality Concerns)]\n`;
    txt += `${document.getElementById('report-bads').textContent}\n\n`;
    txt += `[IMPROVEMENT RECOMMENDED]\n`;
    txt += `${document.getElementById('report-improvement').textContent}\n\n`;
  } else {
    txt += `(Note: Psychologist Detailed Report was not generated during session.)\n\n`;
  }

  txt += `--------------------------------------------------\n`;
  txt += `            DETAILED WORD HISTORY & SCORES       \n`;
  txt += `--------------------------------------------------\n`;
  
  trainingSessionAttempts.forEach((item, idx) => {
    txt += `${idx + 1}. WORD: ${item.word.toUpperCase()} (Score: ${item.score}/10)\n`;
    txt += `   Response: "${item.answer}"\n`;
    txt += `   Feedback: ${item.assessment}\n\n`;
  });
  
  txt += `==================================================\n`;
  txt += `           END OF OFFICERS SELECTION REPORT       \n`;
  txt += `==================================================\n`;

  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SSB_WAT_Psychological_Report_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

function confirmExitTraining() {
  if (confirm('Are you sure you want to end this training session? Progress will be lost.')) {
    clearInterval(trainingTimerInterval);
    showScreen('home-wat');
  }
}

// ==================== HISTORY SCREEN ====================
function buildHistoryScreen() {
  const list = document.getElementById('history-list');
  if (sessionHistory.length === 0) {
    list.innerHTML = '<p class="history-empty">No sessions yet. Start your first WAT session!</p>';
    return;
  }
  list.innerHTML = [...sessionHistory].reverse().map((s, i) => {
    const d = new Date(s.date);
    const dateStr = d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
    return `<div class="history-item">
      <div>
        <div class="hi-date">${dateStr} · ${timeStr}</div>
        <div style="font-size:.8rem;color:var(--text-dim);margin-top:4px;">${getGrade(s.percent)} · ${getGradeLabel(s.percent)}</div>
      </div>
      <div style="text-align:right">
        <div class="hi-score">${s.score}/${s.total}</div>
        <div class="hi-pct">${s.percent}%</div>
      </div>
    </div>`;
  }).join('');
}

function getGrade(pct) {
  if (pct>=90) return 'A+'; if (pct>=80) return 'A';
  if (pct>=70) return 'B+'; if (pct>=60) return 'B';
  if (pct>=50) return 'C'; return 'D';
}
function getGradeLabel(pct) {
  if (pct>=90) return 'Outstanding'; if (pct>=80) return 'Excellent';
  if (pct>=70) return 'Very Good'; if (pct>=60) return 'Good';
  if (pct>=50) return 'Average'; return 'Keep Practicing';
}

// ==================== BACKGROUND PARTICLES ====================
function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  for (let i = 0; i < 30; i++) {
    const dot = document.createElement('div');
    const size = Math.random() * 3 + 1;
    dot.style.cssText = `
      position:absolute;
      width:${size}px;height:${size}px;
      border-radius:50%;
      background:rgba(212,175,55,${Math.random()*0.3+0.05});
      left:${Math.random()*100}%;
      top:${Math.random()*100}%;
      animation:float-particle ${Math.random()*20+15}s linear infinite;
      animation-delay:-${Math.random()*20}s;
    `;
    container.appendChild(dot);
  }
}

// ==================== TABS ====================
function switchTab(tabId) {
  document.querySelectorAll('.analysis-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.analysis-tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
  if (tabId === 'answers' && sessionWords.length) buildAnswersSection(sessionWords);
}

// ==================== DUMMY INTERACTIVE HANDLERS FOR TRAINING FORM SETUP ====================
// These simple bindings bridge inline attributes inside merged index.html
window.selectTrainingCategory = selectTrainingCategory;
window.selectTrainingCount = selectTrainingCount;
window.updateTrainingTimerLabel = updateTrainingTimerLabel;
window.startTrainingSession = startTrainingSession;
window.submitTrainingAnswer = submitTrainingAnswer;
window.revealTrainingModelAnswers = revealTrainingModelAnswers;
window.refreshTrainingModelAnswers = refreshTrainingModelAnswers;
window.toggleExplanationBox = toggleExplanationBox;
window.nextTrainingWord = nextTrainingWord;
window.confirmExitTraining = confirmExitTraining;
window.showScreen = showScreen;
window.addWordToSession = addWordToSession;
window.endTrainingSession = endTrainingSession;
window.generateTrainingReport = generateTrainingReport;
window.downloadTrainingReport = downloadTrainingReport;

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  updateHomeStats();

  // File upload
  const fileInput = document.getElementById('word-file-input');
  const dropzone = document.getElementById('upload-dropzone');

  if (fileInput) fileInput.addEventListener('change', e => handleWordFileUpload(e.target.files[0]));
  const clearBtn = document.getElementById('btn-clear-upload');
  if (clearBtn) clearBtn.addEventListener('click', clearUpload);

  if (dropzone) {
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault(); dropzone.classList.remove('drag-over');
      handleWordFileUpload(e.dataTransfer.files[0]);
    });
    dropzone.addEventListener('click', () => fileInput.click());
  }

  // Mode switching for manual apply
  const btnFile = document.getElementById('tab-btn-file');
  const btnManual = document.getElementById('tab-btn-manual');
  if (btnFile) btnFile.addEventListener('click', () => switchUploadMode('file'));
  if (btnManual) btnManual.addEventListener('click', () => switchUploadMode('manual'));
  
  const saveManualBtn = document.getElementById('btn-save-manual');
  if (saveManualBtn) saveManualBtn.addEventListener('click', handleManualWordInput);

  // Home controls
  const startBtn = document.getElementById('btn-start');
  if (startBtn) startBtn.addEventListener('click', startSession);
  
  const historyBtn = document.getElementById('btn-history');
  if (historyBtn) historyBtn.addEventListener('click', () => {
    buildHistoryScreen();
    showScreen('history-wat');
  });

  const backHistBtn = document.getElementById('btn-back-history');
  if (backHistBtn) backHistBtn.addEventListener('click', () => showScreen('home-wat'));

  // Pause menu binding
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) pauseBtn.addEventListener('click', pauseSession);
  const resumeBtn = document.getElementById('btn-resume');
  if (resumeBtn) resumeBtn.addEventListener('click', resumeSession);
  const quitBtn = document.getElementById('btn-quit');
  if (quitBtn) quitBtn.addEventListener('click', pauseSession);

  const confirmQuitBtn = document.getElementById('btn-quit-confirm');
  if (confirmQuitBtn) confirmQuitBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    document.getElementById('pause-modal').classList.add('hidden');
    sessionWords = sessionWords.slice(0, currentWordIndex + 1);
    buildReviewScreen();
    showScreen('review-wat');
  });

  const discardBtn = document.getElementById('btn-discard-session');
  if (discardBtn) discardBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    document.getElementById('pause-modal').classList.add('hidden');
    showScreen('home-wat');
    updateHomeStats();
  });

  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (isCountdownMode) return;
    clearInterval(timerInterval);
    nextWord();
  });

  const focusBtn = document.getElementById('btn-focus');
  if (focusBtn) focusBtn.addEventListener('click', enterFocusMode);
  const focusOverlay = document.getElementById('focus-overlay');
  if (focusOverlay) focusOverlay.addEventListener('click', exitFocusMode);

  const selectAllBtn = document.getElementById('btn-select-all');
  if (selectAllBtn) selectAllBtn.addEventListener('click', selectAll);
  const submitReviewBtn = document.getElementById('btn-submit-review');
  if (submitReviewBtn) submitReviewBtn.addEventListener('click', submitReview);

  // Analysis tabs
  document.querySelectorAll('.analysis-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  const newSessBtn = document.getElementById('btn-new-session');
  if (newSessBtn) newSessBtn.addEventListener('click', () => {
    updateHomeStats();
    switchTab('results');
    showScreen('home-wat');
  });
  
  const viewHistBtn = document.getElementById('btn-view-history');
  if (viewHistBtn) viewHistBtn.addEventListener('click', () => {
    buildHistoryScreen();
    showScreen('history-wat');
  });

  // Global key listening for focus mode toggles
  document.addEventListener('keydown', e => {
    const sessionActive = document.getElementById('screen-session-wat').classList.contains('active');
    if (!sessionActive || isCountdownMode) return;
    
    if (e.key === 'Escape' && isFocusMode) exitFocusMode();
    if (e.key === 'Escape' && !isFocusMode && !isPaused) pauseSession();
    if ((e.key === 'ArrowRight' || e.key === ' ') && !isPaused && !isFocusMode) {
      e.preventDefault();
      clearInterval(timerInterval);
      nextWord();
    }
    if (e.key === 'f' && !isFocusMode) enterFocusMode();
  });

  // Start Firebase Initialization
  initFirebase();

  // Intercept back button to prevent accidental exit
  window.history.pushState({ page: 1 }, null, window.location.href);
  window.addEventListener("popstate", function(event) {
    if (!confirm("Are you sure you want to exit the site?")) {
      // User cancelled: trap them again by pushing state forward
      window.history.pushState({ page: 1 }, null, window.location.href);
    }
    // If they confirmed, do nothing — the browser already went back.
  });
});

// ==================== FIREBASE FUNCTIONALITY ====================
function initFirebase() {
  fetch('/api/firebase-config')
    .then(res => res.json())
    .then(config => {
      if (!config.apiKey || !config.projectId) {
        console.warn("Firebase configuration is incomplete. App is running in Local Sandbox mode.");
        // In sandbox mode, skip login gate and show app directly
        document.getElementById('login-gate').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        loadHistoryState();
        return;
      }
      
      // Initialize Firebase Compat
      firebase.initializeApp(config);
      firebaseAuth = firebase.auth();
      firebaseDb = firebase.firestore();
      isFirebaseActive = true;
      console.log("Firebase initialized successfully in Cloud mode!");
      
      // Set up Google Auth Provider
      const provider = new firebase.auth.GoogleAuthProvider();

      // Helper to trigger sign-in popup
      function doGoogleSignIn() {
        firebaseAuth.signInWithPopup(provider)
          .then(result => {
            console.log("User successfully signed in:", result.user.displayName);
          })
          .catch(err => {
            console.error("Google Authentication error:", err);
            alert("Sign-In failed: " + err.message);
          });
      }
      
      // Bind gate login button (the big one on the login screen)
      const gateLoginBtn = document.getElementById('btn-gate-login');
      if (gateLoginBtn) gateLoginBtn.addEventListener('click', doGoogleSignIn);

      // Bind header login button (small one inside app)
      const loginBtn = document.getElementById('btn-google-login');
      if (loginBtn) loginBtn.addEventListener('click', doGoogleSignIn);
      
      // Bind logout — signs out and returns to the login gate
      const logoutBtn = document.getElementById('btn-google-logout');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          if (confirm("Are you sure you want to sign out?")) {
            firebaseAuth.signOut()
              .then(() => {
                currentUser = null;
                updateAuthUI(null);
              })
              .catch(err => console.error("Logout error:", err));
          }
        });
      }
      
      // Auth state observer — controls gate visibility
      firebaseAuth.onAuthStateChanged(user => {
        const gate = document.getElementById('login-gate');
        const app = document.getElementById('app');

        if (user) {
          currentUser = user;
          updateAuthUI(user);
          // Hide gate, show app
          gate.classList.add('hidden');
          app.classList.remove('hidden');
          syncOfflineHistoryToFirebase(user);
          loadHistoryState();
          if (window.loadTatHistoryState) window.loadTatHistoryState();
        } else {
          currentUser = null;
          updateAuthUI(null);
          // Show gate, hide app
          gate.classList.remove('hidden');
          app.classList.add('hidden');
        }
      });
    })
    .catch(err => {
      console.error("Failed to load Firebase config:", err);
      loadHistoryState();
    });
}

function updateAuthUI(user) {
  const unsignedDiv = document.getElementById('auth-status-unsigned');
  const signedDiv = document.getElementById('auth-status-signed');
  const avatarImg = document.getElementById('user-avatar');
  const nameSpan = document.getElementById('user-display-name');
  
  if (user) {
    if (unsignedDiv) unsignedDiv.classList.add('hidden');
    if (signedDiv) signedDiv.classList.remove('hidden');
    if (avatarImg) avatarImg.src = user.photoURL || 'https://www.gravatar.com/avatar/?d=mp';
    if (nameSpan) nameSpan.textContent = user.displayName || 'Candidate';
  } else {
    if (unsignedDiv) unsignedDiv.classList.remove('hidden');
    if (signedDiv) signedDiv.classList.add('hidden');
  }
}

function loadHistoryState() {
  if (isFirebaseActive && currentUser) {
    firebaseDb.collection('users').doc(currentUser.uid).collection('wat_history')
      .orderBy('date', 'desc')
      .get()
      .then(snapshot => {
        sessionHistory = snapshot.docs.map(doc => doc.data());
        updateHomeStats();
        buildHistoryScreen();
      })
      .catch(err => {
        console.error("Error fetching Firestore WAT history:", err);
        sessionHistory = JSON.parse(localStorage.getItem('wat_history') || '[]');
        updateHomeStats();
        buildHistoryScreen();
      });
  } else {
    sessionHistory = JSON.parse(localStorage.getItem('wat_history') || '[]');
    updateHomeStats();
    buildHistoryScreen();
  }
}

function syncOfflineHistoryToFirebase(user) {
  if (!isFirebaseActive || !user) return;
  
  // Sync WAT offline data
  const localWat = JSON.parse(localStorage.getItem('wat_history') || '[]');
  if (localWat.length > 0) {
    const watCollection = firebaseDb.collection('users').doc(user.uid).collection('wat_history');
    watCollection.get().then(snapshot => {
      const dbDates = new Set(snapshot.docs.map(doc => doc.data().date));
      localWat.forEach(entry => {
        if (!dbDates.has(entry.date)) {
          watCollection.add(entry)
            .then(() => console.log("Migrated local WAT entry to Firestore:", entry.date))
            .catch(err => console.error("Error migrating local WAT entry:", err));
        }
      });
    });
  }
  
  // Sync TAT offline data
  const localTat = JSON.parse(localStorage.getItem('tat_history') || '[]');
  if (localTat.length > 0) {
    const tatCollection = firebaseDb.collection('users').doc(user.uid).collection('tat_history');
    tatCollection.get().then(snapshot => {
      const dbDates = new Set(snapshot.docs.map(doc => doc.data().date));
      localTat.forEach(entry => {
        if (!dbDates.has(entry.date)) {
          tatCollection.add(entry)
            .then(() => console.log("Migrated local TAT entry to Firestore:", entry.date))
            .catch(err => console.error("Error migrating local TAT entry:", err));
        }
      });
    });
  }
}

