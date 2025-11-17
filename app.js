// Firebase Config
const firebaseConfig = {
   apiKey: "AIzaSyCBwA6F75b7gJvL_gsL68AE6xAYzQeDeUk",
  authDomain: "npl-fantasy.firebaseapp.com",
  databaseURL: "https://npl-fantasy-default-rtdb.firebaseio.com",
  projectId: "npl-fantasy",
  storageBucket: "npl-fantasy.firebasestorage.app",
  messagingSenderId: "52802710790",
  appId: "1:52802710790:web:315b07fb7c97fa8ba8c287",
  measurementId: "G-YKBTXSYMEK"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

// Global State
let currentUser = null;
let selected = [];
let captain = null;
let viceCaptain = null;
let isLocked = false;

// DOM Elements
const els = {
  googleSigninBtn: document.getElementById('google-signin-btn'),
  authError: document.getElementById('auth-error'),
  logoutBtn: document.getElementById('logout-btn'),
  createTeamBtn: document.getElementById('create-team-btn'),
  editTeamBtn: document.getElementById('edit-team-btn'),
  backHomeBtn: document.getElementById('back-home-btn'),
  matchTimer: document.getElementById('match-timer'),
  playerCount: document.getElementById('player-count'),
  creditsLeft: document.getElementById('credits-left'),
  foreignCount: document.getElementById('foreign-count'),
  roleTabs: document.getElementById('role-tabs'),
  playerList: document.getElementById('player-list'),
  saveTeamBtn: document.getElementById('save-team-btn'),
  teamDisplay: document.getElementById('team-display'),
  noTeam: document.getElementById('no-team'),
  previewModal: document.getElementById('preview-modal'),
  previewPlayers: document.getElementById('preview-players'),
  continueBtn: document.getElementById('continue-btn'),
  closePreviewBtn: document.getElementById('close-preview-btn')
};

// Screens
const screens = {
  login: document.getElementById('login-screen'),
  home: document.getElementById('home-screen'),
  select: document.getElementById('select-team-screen')
};

// Match Timer
const matchStart = new Date('2025-11-17T16:00:00+05:45'); // 4:00 PM NPT
function updateMatchTimer() {
  const now = new Date();
  const diff = matchStart - now;
  if (diff < 0) {
    els.matchTimer.textContent = 'Match Locked';
    isLocked = true;
    els.saveTeamBtn.disabled = true;
    return;
  }
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  els.matchTimer.textContent = `${hours}h ${minutes}m left`;
}
setInterval(updateMatchTimer, 60000);
updateMatchTimer();

// Google Sign-In
els.googleSigninBtn.onclick = () => {
  if (location.protocol === 'http:' && location.hostname !== 'localhost') {
    els.authError.textContent = 'HTTPS required.';
    return;
  }
  auth.signInWithPopup(provider).catch(err => {
    els.authError.textContent = err.message;
  });
};

els.logoutBtn.onclick = () => auth.signOut();

// Auth
auth.onAuthStateChanged(user => {
  currentUser = user;
  if (user) {
    loadUserTeam();
    showScreen('home');
  } else {
    showScreen('login');
  }
});

// Navigation
els.createTeamBtn.onclick = () => startTeamSelection();
els.editTeamBtn.onclick = () => startTeamSelection();
els.backHomeBtn.onclick = () => showScreen('home');

// Start Team Selection
function startTeamSelection() {
  selected = [];
  captain = viceCaptain = null;
  showScreen('select');
  renderRoleTabs();
  filterPlayers();
  updateStats();
}

// Role Tabs
let currentRole = 'BAT';
function renderRoleTabs() {
  const roles = ['WK', 'BAT', 'AR', 'BOWL'];
  els.roleTabs.innerHTML = roles.map(role => {
    const count = selected.filter(p => getPlayer(p).role === role).length;
    return `<button class="role-tab ${currentRole === role ? 'active' : ''}" data-role="${role}">
      ${role} (${count})
    </button>`;
  }).join('');
  els.roleTabs.onclick = e => {
    const tab = e.target.closest('.role-tab');
    if (tab) {
      currentRole = tab.dataset.role;
      renderRoleTabs();
      filterPlayers();
    }
  };
}

// Filter Players
function filterPlayers() {
  const players = nplPlayers
    .filter(p => p.role === currentRole)
    .sort((a, b) => b.credits - a.credits);

  els.playerList.innerHTML = players.map(player => {
    const isSelected = selected.includes(player.name);
    const canAdd = !isSelected && canAddPlayer(player);
    return `
      <div class="player ${isSelected ? 'selected' : ''}" data-name="${player.name}">
        <div class="player-avatar">
          ${player.name.split(' ').map(n => n[0]).join('')}
          <div class="availability-dot dot-${player.availability || 'playing'}"></div>
        </div>
        <div class="player-info">
          <div class="player-name">
            ${player.name}
            ${player.nationality === 'foreign' ? '<span class="foreign-icon">Airplane</span>' : ''}
          </div>
          <div class="player-team">${player.team}</div>
        </div>
        <div class="player-stats">
          <div><div class="stat-label">Credits</div><div class="stat-value">${player.credits}</div></div>
        </div>
        <button class="add-btn ${isSelected ? 'selected' : ''}" ${!canAdd && !isSelected ? 'disabled' : ''}>
          ${isSelected ? '✓' : '+'}
        </button>
      </div>
    `;
  }).join('');

  els.playerList.onclick = e => {
    const playerDiv = e.target.closest('.player');
    if (!playerDiv) return;
    const name = playerDiv.dataset.name;
    togglePlayer(name);
  };
}

// Toggle Player
function togglePlayer(name) {
  if (isLocked) return;
  const player = getPlayer(name);
  if (selected.includes(name)) {
    selected = selected.filter(p => p !== name);
    if (captain === name) captain = null;
    if (viceCaptain === name) viceCaptain = null;
  } else if (canAddPlayer(player)) {
    selected.push(name);
    if (selected.length === 11) openPreview();
  }
  filterPlayers();
  updateStats();
  renderRoleTabs();
}

// Validation
function canAddPlayer(player) {
  if (isLocked || selected.length >= 11) return false;
  const creditsUsed = selected.reduce((sum, n) => sum + getPlayer(n).credits, 0) + player.credits;
  if (creditsUsed > 100) return false;

  const temp = [...selected, player.name];
  const foreign = temp.filter(n => getPlayer(n).nationality === 'foreign').length;
  if (foreign > 4) return false;

  const teamCount = temp.reduce((acc, n) => {
    acc[getPlayer(n).team] = (acc[getPlayer(n).team] || 0) + 1;
    return acc;
  }, {});
  if (Object.values(teamCount).some(c => c > 7)) return false;

  if (temp.length === 11) {
    const roles = temp.reduce((acc, n) => {
      acc[getPlayer(n).role] = (acc[getPlayer(n).role] || 0) + 1;
      return acc;
    }, {});
    return (roles.WK || 0) >= 1 && (roles.BAT || 0) >= 3 && (roles.AR || 0) >= 1 && (roles.BOWL || 0) >= 3;
  }
  return true;
}

// Update Stats
function updateStats() {
  els.playerCount.textContent = `${selected.length}/11`;
  const credits = selected.reduce((sum, n) => sum + getPlayer(n).credits, 0);
  els.creditsLeft.textContent = 100 - credits;
  const foreign = selected.filter(n => getPlayer(n).nationality === 'foreign').length;
  els.foreignCount.textContent = `${foreign}/4`;

  const canSave = selected.length === 11 && captain && viceCaptain && captain !== viceCaptain && !isLocked;
  els.saveTeamBtn.disabled = !canSave;
  els.saveTeamBtn.textContent = canSave ? 'Save Team' : 'Complete C & VC';
}

// Preview Modal
function openPreview() {
  els.previewModal.classList.remove('hidden');
  renderPreview();
}

function renderPreview() {
  const groups = ['WK', 'BAT', 'AR', 'BOWL'].map(role => {
    const players = selected
      .filter(p => getPlayer(p).role === role)
      .map(name => {
        const p = getPlayer(name);
        const isCaptain = captain === name;
        const isViceCaptain = viceCaptain === name;

        return `
          <div class="preview-player">
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <div style="width:40px; height:40px; border-radius:0.5rem; background:linear-gradient(135deg, #a855f7, #f97316); color:white; font-weight:bold; display:flex; align-items:center; justify-content:center; font-size:0.75rem;">
                ${p.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <div style="font-weight:600;">${p.name}</div>
                <div style="font-size:0.75rem; color:#94a3b8;">${p.team}</div>
              </div>
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button class="cvc-btn c-btn ${isCaptain ? 'active' : ''}" data-name="${name}" data-type="c">C</button>
              <button class="cvc-btn vc-btn ${isViceCaptain ? 'active' : ''}" data-name="${name}" data-type="vc">VC</button>
            </div>
          </div>
        `;
      }).join('');
    return players ? `<div class="role-group"><div class="role-header">${role}</div>${players}</div>` : '';
  }).join('');
  els.previewPlayers.innerHTML = groups;
}

els.previewPlayers.onclick = e => {
  const btn = e.target.closest('.cvc-btn');
  if (!btn) return;
  const name = btn.dataset.name;
  const type = btn.dataset.type;
  if (type === 'c') {
    if (viceCaptain === name) viceCaptain = null;
    captain = captain === name ? null : name;
  } else {
    if (captain === name) captain = null;
    viceCaptain = viceCaptain === name ? null : name;
  }
  renderPreview();
  updateStats();
};

els.continueBtn.onclick = () => {
  if (captain && viceCaptain && captain !== viceCaptain) {
    els.previewModal.classList.add('hidden');
  }
};

els.closePreviewBtn.onclick = () => els.previewModal.classList.add('hidden');

// Save Team
els.saveTeamBtn.onclick = () => {
  if (!currentUser || isLocked) return;

  const teamData = {
    selected,
    captain,
    viceCaptain,
    updatedAt: new Date()
  };

  db.collection('teams').doc(currentUser.uid).set(teamData, { merge: true })
    .then(() => {
      alert('Team saved successfully!');
      showScreen('home');
      loadUserTeam();
    })
    .catch(err => alert('Save failed: ' + err.message));
};

// Load Team
function loadUserTeam() {
  if (!currentUser) return;
  db.collection('teams').doc(currentUser.uid).get()
    .then(doc => {
      if (doc.exists) {
        const data = doc.data();
        selected = data.selected || [];
        captain = data.captain || null;
        viceCaptain = data.viceCaptain || null;
        renderTeamDisplay();
        els.noTeam.classList.add('hidden');
        els.editTeamBtn.classList.remove('hidden');
      } else {
        els.noTeam.classList.remove('hidden');
        els.editTeamBtn.classList.add('hidden');
      }
    });
}

function renderTeamDisplay() {
  els.teamDisplay.innerHTML = selected.map(name => {
    const p = getPlayer(name);
    const isC = captain === name;
    const isVC = viceCaptain === name;
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem; background:#1e293b; border-radius:0.75rem; margin-bottom:0.5rem;">
        <div style="display:flex; gap:1rem; align-items:center;">
          <div style="width:40px; height:40px; border-radius:0.5rem; background:linear-gradient(135deg, #a855f7, #f97316); color:white; font-weight:bold; display:flex; align-items:center; justify-content:center;">
            ${p.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div>
            <div style="font-weight:600; display:flex; gap:0.5rem; align-items:center;">
              ${p.name}
              ${isC ? '<span style="color:#eab308; font-weight:bold;">C</span>' : ''}
              ${isVC ? '<span style="color:#fb923c; font-weight:bold;">VC</span>' : ''}
            </div>
            <div style="font-size:0.75rem; color:#94a3b8;">${p.team} • ${p.role}</div>
          </div>
        </div>
        <div style="font-weight:bold; color:#22c55e;">${p.credits}</div>
      </div>
    `;
  }).join('');
}

// Utils
function getPlayer(name) {
  return nplPlayers.find(p => p.name === name) || {};
}

function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}