// ==================== TAT STATE & CONFIG ====================
const DEFAULT_TAT_IMAGES = Array.from({length: 15}, (_, i) => {
  if (i === 12) return `tat-images/TAT-PPD-Picture13.jpg`;
  return `tat-images/TAT-PPD-Picture-${i+1}.jpg`;
});

let tatSessionImages = [];
let tatCurrentIndex = 0;
let tatTimerInterval = null;
let tatTimeLeft = 0;
let tatPhase = 'countdown'; // 'countdown', 'view', 'write', 'blank'
let tatIsPaused = false;
let tatIsFocusMode = false;
let tatCustomImages = [];
let tatSessionHistory = JSON.parse(localStorage.getItem('tat_history') || '[]');

// ==================== TAT FILE UPLOAD ====================
function handleTatFileUpload(files) {
  if (!files || files.length === 0) return;
  tatCustomImages = [];
  
  Array.from(files).forEach(file => {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      tatCustomImages.push(url);
    }
  });

  const badge = document.getElementById('tat-upload-badge');
  badge.textContent = `✓ ${tatCustomImages.length} pictures loaded`;
  badge.classList.add('loaded');
  document.getElementById('btn-clear-tat-upload').style.display = 'inline-flex';
}

function clearTatUpload() {
  tatCustomImages = [];
  document.getElementById('tat-file-input').value = '';
  const badge = document.getElementById('tat-upload-badge');
  badge.textContent = 'No files loaded — using default pictures';
  badge.classList.remove('loaded');
  document.getElementById('btn-clear-tat-upload').style.display = 'none';
}

// ==================== TAT SESSION ====================
function startTatSession() {
  let pool = tatCustomImages.length > 0 ? tatCustomImages : DEFAULT_TAT_IMAGES;
  let shuffled = [...pool].sort(() => Math.random() - 0.5);
  
  // Need exactly 11 images + 1 blank. If custom has fewer than 11, pad with default.
  if (shuffled.length < 11) {
    let defaultShuffled = [...DEFAULT_TAT_IMAGES].sort(() => Math.random() - 0.5);
    while(shuffled.length < 11 && defaultShuffled.length > 0) {
      const img = defaultShuffled.pop();
      if (!shuffled.includes(img)) shuffled.push(img);
    }
  }
  
  tatSessionImages = shuffled.slice(0, 11);
  tatSessionImages.push('BLANK'); // 12th is blank
  
  tatCurrentIndex = 0;
  tatIsPaused = false;
  showScreen('session-tat');
  startTatCountdown();
}

function updateTatTimerUI(t, maxTime) {
  const el = document.getElementById('timer-val-tat');
  const unit = document.getElementById('timer-unit-tat');
  const prog = document.getElementById('timer-progress-tat');
  const circ = 339.29;
  
  let mins = Math.floor(t / 60);
  let secs = t % 60;
  
  if (mins > 0) {
    el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    unit.textContent = 'min';
  } else {
    el.textContent = t;
    unit.textContent = 'sec';
  }

  // Update central timer if it exists
  const centerTimer = document.getElementById('tat-center-timer');
  if (centerTimer) {
    centerTimer.textContent = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${t}s`;
  }

  const offset = circ - (t / maxTime) * circ;
  prog.style.strokeDashoffset = offset;

  prog.classList.remove('warn','danger');
  el.classList.remove('warn','danger');

  if (t <= 5 && mins === 0) {
    prog.classList.add('danger'); el.classList.add('danger');
  } else if (t <= 10 && mins === 0) {
    prog.classList.add('warn'); el.classList.add('warn');
  }
}

function runTatTimer(duration, callback) {
  clearInterval(tatTimerInterval);
  tatTimeLeft = duration;
  updateTatTimerUI(tatTimeLeft, duration);
  
  tatTimerInterval = setInterval(() => {
    if (tatIsPaused) return;
    tatTimeLeft--;
    updateTatTimerUI(tatTimeLeft, duration);
    if (tatTimeLeft <= 0) {
      clearInterval(tatTimerInterval);
      callback();
    }
  }, 1000);
}

function setTatInstruction(text, subtext="") {
  const overlay = document.getElementById('tat-instruction-overlay');
  const textEl = document.getElementById('tat-instruction-text');
  overlay.classList.remove('hidden');
  textEl.innerHTML = text + (subtext ? `<br><span style="font-size:2rem; color:#8899aa">${subtext}</span>` : "");
}

function hideTatInstruction() {
  document.getElementById('tat-instruction-overlay').classList.add('hidden');
}

function startTatCountdown() {
  tatPhase = 'countdown';
  const overlay = document.getElementById('tat-instruction-overlay');
  const textEl = document.getElementById('tat-instruction-text');
  overlay.classList.remove('hidden');
  
  let count = 5;
  textEl.innerHTML = `Get Ready<br><span style="font-size: 8rem; color: #d4af37">${count}</span>`;
  
  tatTimerInterval = setInterval(() => {
    if(tatIsPaused) return;
    count--;
    if (count > 0) {
      textEl.innerHTML = `Get Ready<br><span style="font-size: 8rem; color: #d4af37">${count}</span>`;
    } else {
      clearInterval(tatTimerInterval);
      textEl.textContent = "Session Starts";
      setTimeout(() => {
        if(tatIsPaused) return;
        runTatSequenceStep();
      }, 1000);
    }
  }, 1000);
}

function runTatSequenceStep() {
  // Sequence per image: 2s blank -> 30s view -> 2s blank start writing -> 4m write
  
  if (tatCurrentIndex >= tatSessionImages.length) {
    endTatSession();
    return;
  }
  
  const currentImage = tatSessionImages[tatCurrentIndex];
  const isBlankSlide = (currentImage === 'BLANK');
  
  document.getElementById('hud-tat-num').textContent = (tatCurrentIndex + 1) + ' / 12';
  
  const imgEl = document.getElementById('tat-image');
  const blankPlaceholder = document.getElementById('tat-blank-placeholder');
  
  if (isBlankSlide) {
    imgEl.style.display = 'none';
    blankPlaceholder.style.display = 'flex';
  } else {
    imgEl.src = currentImage;
    imgEl.style.display = 'block';
    blankPlaceholder.style.display = 'none';
  }

  // Step 1: 2s blank screen
  tatPhase = 'blank_pre_view';
  setTatInstruction(""); // black screen
  
  setTimeout(() => {
    if(tatIsPaused) return; // Note: setTimeout doesn't pause automatically, but we simplify here
    
    // Step 2: 30s view
    hideTatInstruction();
    tatPhase = 'view';
    document.getElementById('timer-ring-tat').style.visibility = 'visible';
    runTatTimer(30, () => {
      
      // Step 3: 2s blank "Start writing"
      tatPhase = 'blank_pre_write';
      setTatInstruction("Start Writing");
      
      setTimeout(() => {
        if(tatIsPaused) return;
        
        // Step 4: 4m (240s) write
        hideTatInstruction();
        tatPhase = 'write';
        // Hide upper timer during writing
        document.getElementById('timer-ring-tat').style.visibility = 'hidden';
        
        // Hide image and show blank grey screen for writing
        imgEl.style.display = 'none';
        blankPlaceholder.style.display = 'flex';
        blankPlaceholder.innerHTML = '<div style="display:flex; flex-direction:column; align-items:center"><span style="color: rgba(255,255,255,0.2); font-family: Orbitron; font-size: 2rem;">WRITING TIME</span><span id="tat-center-timer" style="color: #d4af37; font-family: Orbitron; font-size: 8rem; margin-top:20px;">4:00</span></div>';
        
        runTatTimer(240, () => {
          tatCurrentIndex++;
          runTatSequenceStep();
        });
        
      }, 2000);
    });
  }, 2000);
}

function pauseTatSession() {
  if (tatPhase === 'countdown') return;
  tatIsPaused = true;
  document.getElementById('pause-modal-tat').classList.remove('hidden');
}

function resumeTatSession() {
  tatIsPaused = false;
  document.getElementById('pause-modal-tat').classList.add('hidden');
}

function endTatSession() {
  clearInterval(tatTimerInterval);
  buildTatReviewScreen();
  showScreen('review-tat');
}

// ==================== TAT REVIEW & ANALYSIS ====================
function buildTatReviewScreen() {
  const grid = document.getElementById('review-grid-tat');
  grid.innerHTML = '';
  tatSessionImages.forEach((img, i) => {
    const div = document.createElement('div');
    div.className = 'review-word'; // reuse WAT class
    div.dataset.idx = i;
    div.innerHTML = `<span class="word-idx">${String(i+1).padStart(2,'0')}</span>Story ${i+1}`;
    div.addEventListener('click', () => {
      div.classList.toggle('attempted');
      updateTatReviewStats();
    });
    grid.appendChild(div);
  });
  updateTatReviewStats();
}

function updateTatReviewStats() {
  const attempted = document.querySelectorAll('#review-grid-tat .review-word.attempted').length;
  const skipped = 12 - attempted;
  document.getElementById('rs-attempted-tat').textContent = attempted;
  document.getElementById('rs-skipped-tat').textContent = skipped;
}

function submitTatReview() {
  const attempted = document.querySelectorAll('#review-grid-tat .review-word.attempted').length;
  const entry = {
    date: new Date().toISOString(),
    score: attempted,
    total: 12,
    percent: Math.round((attempted / 12) * 100)
  };
  tatSessionHistory.push(entry);
  localStorage.setItem('tat_history', JSON.stringify(tatSessionHistory));

  const firebaseAuth = window.firebase ? firebase.auth() : null;
  const firebaseDb = window.firebase ? firebase.firestore() : null;
  const currentUser = firebaseAuth ? firebaseAuth.currentUser : null;

  if (firebaseDb && currentUser) {
    firebaseDb.collection('users').doc(currentUser.uid).collection('tat_history')
      .add(entry)
      .then(() => {
        console.log("TAT history entry synced to Firestore.");
        window.loadTatHistoryState();
      })
      .catch(err => {
        console.error("Firestore TAT save error:", err);
        buildTatHistoryScreen();
        updateTatHomeStats();
        showScreen('history-tat');
      });
  } else {
    buildTatHistoryScreen();
    updateTatHomeStats();
    showScreen('history-tat');
  }
}

function updateTatHomeStats() {
  document.getElementById('stat-sessions-val-tat').textContent = tatSessionHistory.length;
  if (tatSessionHistory.length === 0) {
    document.getElementById('stat-best-val-tat').textContent = '—';
    document.getElementById('stat-avg-val-tat').textContent = '—';
  } else {
    const scores = tatSessionHistory.map(s => s.score);
    document.getElementById('stat-best-val-tat').textContent = Math.max(...scores);
    document.getElementById('stat-avg-val-tat').textContent = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
  }
}

function loadTatHistoryState() {
  const firebaseAuth = window.firebase ? firebase.auth() : null;
  const firebaseDb = window.firebase ? firebase.firestore() : null;
  const currentUser = firebaseAuth ? firebaseAuth.currentUser : null;

  if (firebaseDb && currentUser) {
    firebaseDb.collection('users').doc(currentUser.uid).collection('tat_history')
      .orderBy('date', 'desc')
      .get()
      .then(snapshot => {
        tatSessionHistory = snapshot.docs.map(doc => doc.data());
        updateTatHomeStats();
        buildTatHistoryScreen();
      })
      .catch(err => {
        console.error("Error loading Firestore TAT history:", err);
        tatSessionHistory = JSON.parse(localStorage.getItem('tat_history') || '[]');
        updateTatHomeStats();
        buildTatHistoryScreen();
      });
  } else {
    tatSessionHistory = JSON.parse(localStorage.getItem('tat_history') || '[]');
    updateTatHomeStats();
    buildTatHistoryScreen();
  }
}
window.loadTatHistoryState = loadTatHistoryState;

function buildTatHistoryScreen() {
  const list = document.getElementById('history-list-tat');
  if (tatSessionHistory.length === 0) {
    list.innerHTML = '<p class="history-empty">No TAT sessions yet. Start your first session!</p>';
    return;
  }
  list.innerHTML = [...tatSessionHistory].reverse().map((s, i) => {
    const d = new Date(s.date);
    const dateStr = d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
    return `<div class="history-item">
      <div>
        <div class="hi-date">${dateStr} · ${timeStr}</div>
      </div>
      <div style="text-align:right">
        <div class="hi-score">${s.score}/12</div>
        <div class="hi-pct">${s.percent}%</div>
      </div>
    </div>`;
  }).join('');
}


// ==================== EVENT LISTENERS (TAT) ====================
document.addEventListener('DOMContentLoaded', () => {
  updateTatHomeStats();

  const fileInput = document.getElementById('tat-file-input');
  const dropzone = document.getElementById('tat-upload-dropzone');

  fileInput.addEventListener('change', e => handleTatFileUpload(e.target.files));
  document.getElementById('btn-clear-tat-upload').addEventListener('click', clearTatUpload);

  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault(); dropzone.classList.remove('drag-over');
    handleTatFileUpload(e.dataTransfer.files);
  });
  dropzone.addEventListener('click', () => fileInput.click());

  document.getElementById('btn-start-tat').addEventListener('click', startTatSession);
  document.getElementById('btn-history-tat').addEventListener('click', () => {
    buildTatHistoryScreen();
    showScreen('history-tat');
  });

  document.getElementById('btn-pause-tat').addEventListener('click', pauseTatSession);
  document.getElementById('btn-resume-tat').addEventListener('click', resumeTatSession);
  document.getElementById('btn-quit-tat').addEventListener('click', pauseTatSession);
  document.getElementById('btn-quit-confirm-tat').addEventListener('click', () => {
    clearInterval(tatTimerInterval);
    document.getElementById('pause-modal-tat').classList.add('hidden');
    endTatSession();
  });

  document.getElementById('btn-discard-session-tat').addEventListener('click', () => {
    clearInterval(tatTimerInterval);
    document.getElementById('pause-modal-tat').classList.add('hidden');
    showScreen('home-tat');
  });

  document.getElementById('btn-select-all-tat').addEventListener('click', () => {
    document.querySelectorAll('#review-grid-tat .review-word').forEach(el => el.classList.add('attempted'));
    updateTatReviewStats();
  });
  document.getElementById('btn-submit-review-tat').addEventListener('click', submitTatReview);

  // Keyboard shortcut and Next button for TAT
  document.getElementById('btn-next-tat').addEventListener('click', () => {
    if (tatPhase === 'countdown') return;
    clearInterval(tatTimerInterval);
    tatCurrentIndex++;
    runTatSequenceStep();
  });

  function toggleTatFocusMode(forceState) {
    if (tatPhase === 'countdown') return;
    tatIsFocusMode = forceState !== undefined ? forceState : !tatIsFocusMode;
    const screen = document.getElementById('screen-session-tat');
    const hint = document.getElementById('tat-focus-hint');
    if (tatIsFocusMode) {
      screen.classList.add('tat-focus-active');
      hint.classList.remove('hidden');
      setTimeout(() => hint.classList.add('hidden'), 3000); // Hide hint after 3s
    } else {
      screen.classList.remove('tat-focus-active');
      hint.classList.add('hidden');
    }
  }

  document.getElementById('btn-focus-tat').addEventListener('click', () => toggleTatFocusMode());

  document.addEventListener('keydown', e => {
    if (tatPhase === 'countdown') return;
    if (document.getElementById('screen-session-tat').classList.contains('active')) {
      if (e.key === 'Escape') {
        if (tatIsFocusMode) {
          toggleTatFocusMode(false);
        } else if (!tatIsPaused) {
          pauseTatSession();
        }
      }
      if (e.key === 'f' && !tatIsFocusMode) {
        toggleTatFocusMode(true);
      }
      if (!tatIsPaused && !tatIsFocusMode) {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault();
          clearInterval(tatTimerInterval);
          tatCurrentIndex++;
          runTatSequenceStep();
        }
      }
    }
  });
});

window.pauseTatSession = pauseTatSession;
window.resumeTatSession = resumeTatSession;
window.endTatSession = endTatSession;
window.startTatSession = startTatSession;

