const pauseOverlay = document.getElementById('pauseOverlay');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const comboDisplay = document.getElementById('comboDisplay');
const songTitleDisplay = document.getElementById('songTitle');
const folderInput = document.getElementById('folderInput');
const uploadZone = document.getElementById('uploadZone');
const resultsOverlay = document.getElementById('resultsOverlay');

let isPaused = false;
let currentCombo = 0;
let activeTimeline = [];
let nextNoteIndex = 0;
let gameAudio = null;
let mapLoaded = false;

// Performance Counters Matrix
const scoreStats = {
    count300: 0,
    count100: 0,
    count50: 0,
    countMiss: 0,
    maxCombo: 0
};

const userSettings = {
    topLeft: 'q',
    topRight: 'e',
    bottomLeft: 'a',
    bottomRight: 'd'
};

const getActiveKeyMap = () => ({
    [userSettings.topLeft]: { element: document.getElementById('box-top-left'), color: '#00f2fe' },
    [userSettings.topRight]: { element: document.getElementById('box-top-right'), color: '#ff2e7e' },
    [userSettings.bottomLeft]: { element: document.getElementById('box-bottom-left'), color: '#ba49ff' },
    [userSettings.bottomRight]: { element: document.getElementById('box-bottom-right'), color: '#00ff88' }
});

function togglePause() {
    if (!mapLoaded || resultsOverlay.style.display === 'flex') return;
    isPaused = !isPaused;
    pauseOverlay.style.display = isPaused ? 'flex' : 'none';
    if (gameAudio) {
        if (isPaused) gameAudio.pause();
        else gameAudio.play();
    }
}

// --- .osu File Parsing Matrix ---
function parseOsuFile(rawText) {
    const lines = rawText.split('\n');
    let isHitObjectsSection = false;
    const notes = [];
    let cleanTitle = "UNKNOWN MAP";

    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('//')) return;

        if (line.startsWith('Title:')) {
            cleanTitle = line.split(':')[1].trim();
            songTitleDisplay.innerText = `qead // ${cleanTitle.toUpperCase()}`;
        }
        
        if (line === '[HitObjects]') {
            isHitObjectsSection = true;
            return;
        }

        if (isHitObjectsSection) {
            const parts = line.split(',');
            if (parts.length >= 3) {
                const x = parseInt(parts[0]);
                const y = parseInt(parts[1]);
                const time = parseInt(parts[2]);

                let targetId = '';
                if (x < 256 && y < 192) targetId = 'box-top-left';
                else if (x >= 256 && y < 192) targetId = 'box-top-right';
                else if (x < 256 && y >= 192) targetId = 'box-bottom-left';
                else targetId = 'box-bottom-right';

                notes.push({ time, targetId, visualTriggered: false, flashed: false, hit: false, missed: false });
            }
        }
    });
    return { notes: notes.sort((a, b) => a.time - b.time), title: cleanTitle };
}

function startGameLoop(parsedNotes) {
    activeTimeline = parsedNotes;
    nextNoteIndex = 0;
    currentCombo = 0;
    
    // Reset performance tracking metrics
    scoreStats.count300 = 0;
    scoreStats.count100 = 0;
    scoreStats.count50 = 0;
    scoreStats.countMiss = 0;
    scoreStats.maxCombo = 0;
    
    mapLoaded = true;
    requestAnimationFrame(updateEngineClock);
}

// --- High-Speed Synchronization Engine Clock ---
function updateEngineClock() {
    if (isPaused || !gameAudio) {
        requestAnimationFrame(updateEngineClock);
        return;
    }

    const currentPlaybackTime = gameAudio.currentTime * 1000;

    // Check if the song has ended and all parsed map objects have cleared out past execution windows
    if (gameAudio.ended || (activeTimeline.length > 0 && currentPlaybackTime > activeTimeline[activeTimeline.length - 1].time + 500)) {
        triggerResultsScreen();
        return;
    }

    for (let i = nextNoteIndex; i < activeTimeline.length; i++) {
        const note = activeTimeline[i];

        if (currentPlaybackTime >= note.time - 400 && currentPlaybackTime < note.time && !note.visualTriggered) {
            const el = document.getElementById(note.targetId);
            const keyMap = getActiveKeyMap();
            const matchingKeyData = Object.values(keyMap).find(item => item.element.id === note.targetId);
            
            const pulse = document.createElement('div');
            pulse.className = 'note-pulse';
            pulse.style.color = matchingKeyData.color; 
            el.appendChild(pulse);
            
            note.pulseElement = pulse;
            note.visualTriggered = true;
        }

        if (currentPlaybackTime >= note.time && !note.flashed) {
            const el = document.getElementById(note.targetId);
            if (note.pulseElement) note.pulseElement.remove();

            el.classList.add('hit-flash');
            setTimeout(() => el.classList.remove('hit-flash'), 120);
            note.flashed = true;
        }

        // Miss Check Trail Boundary
        if (currentPlaybackTime > note.time + 150 && !note.hit && !note.missed) {
            note.missed = true;
            if (note.pulseElement) note.pulseElement.remove();
            
            scoreStats.countMiss++;
            currentCombo = 0;
            comboDisplay.innerText = `${currentCombo}x`;
            
            const el = document.getElementById(note.targetId);
            el.style.borderColor = '#da3637';
            setTimeout(() => el.style.borderColor = '', 100);
            triggerJudgmentBurst(el, 'X', '#da3637');

            nextNoteIndex = i + 1;
        }
    }
    requestAnimationFrame(updateEngineClock);
}

// --- High Precision Hit Registration ---
function handleInputHit(targetId) {
    if (!gameAudio) return;
    const currentPlaybackTime = gameAudio.currentTime * 1000;
    const keyMap = getActiveKeyMap();
    let match = Object.values(keyMap).find(item => item.element.id === targetId);

    const hitWindow = 150; 
    const targetNote = activeTimeline.find(note => 
        note.targetId === targetId && 
        !note.hit && 
        !note.missed &&
        Math.abs(currentPlaybackTime - note.time) <= hitWindow
    );

    if (targetNote) {
        targetNote.hit = true;
        if (targetNote.pulseElement) targetNote.pulseElement.remove();

        const offset = Math.abs(currentPlaybackTime - targetNote.time);
        let scoreType = '300';
        let burstColor = match.color;
        
        if (offset <= 50) {
            scoreType = '300';
            scoreStats.count300++;
        } else if (offset <= 100) {
            scoreType = '100';
            scoreStats.count100++;
            burstColor = '#e1b12c'; 
        } else {
            scoreType = '50';
            scoreStats.count50++;
            burstColor = '#7f8fa6'; 
        }

        currentCombo++;
        if (currentCombo > scoreStats.maxCombo) {
            scoreStats.maxCombo = currentCombo;
        }

        comboDisplay.innerText = `${currentCombo}x`;
        comboDisplay.style.display = 'block';
        comboDisplay.classList.remove('bump');
        void comboDisplay.offsetWidth; 
        comboDisplay.classList.add('bump');

        triggerJudgmentBurst(match.element, scoreType, burstColor);
    }
}

function triggerJudgmentBurst(element, text, color) {
    if (!element) return;
    const burst = document.createElement('div');
    burst.className = 'judgment-burst';
    burst.innerText = text;
    burst.style.color = color;
    element.appendChild(burst);
    setTimeout(() => burst.remove(), 400);
}

// --- Dynamic Scorecard Compiler ---
function triggerResultsScreen() {
    isPaused = true;
    if (gameAudio) gameAudio.pause();

    // Calculate accuracy percentage math equation profile
    const totalNotes = scoreStats.count300 + scoreStats.count100 + scoreStats.count50 + scoreStats.countMiss;
    
    let accuracy = 100.00;
    if (totalNotes > 0) {
        const totalPointsEarned = (scoreStats.count300 * 300) + (scoreStats.count100 * 100) + (scoreStats.count50 * 50);
        const maxPossiblePoints = totalNotes * 300;
        accuracy = (totalPointsEarned / maxPossiblePoints) * 100;
    }

    // Determine osu! structured letter grade tier rankings
    let grade = 'D';
    let gradeColor = '#f85149'; // Default Red

    if (accuracy === 100) { grade = 'SS'; gradeColor = '#f1c40f'; }
    else if (accuracy >= 95) { grade = 'S'; gradeColor = '#f39c12'; }
    else if (accuracy >= 90) { grade = 'A'; gradeColor = '#2ecc71'; }
    else if (accuracy >= 80) { grade = 'B'; gradeColor = '#3498db'; }
    else if (accuracy >= 70) { grade = 'C'; gradeColor = '#9b59b6'; }

    // Mount text properties directly to DOM targets inside the results screen
    document.getElementById('res300').innerText = scoreStats.count300;
    document.getElementById('res100').innerText = scoreStats.count100;
    document.getElementById('res50').innerText = scoreStats.count50;
    document.getElementById('resMiss').innerText = scoreStats.countMiss;
    document.getElementById('resMaxCombo').innerText = `${scoreStats.maxCombo}x`;
    document.getElementById('resAccuracy').innerText = `${accuracy.toFixed(2)}%`;
    
    const gradeBadge = document.getElementById('resGrade');
    gradeBadge.innerText = grade;
    gradeBadge.style.color = gradeColor;

    resultsOverlay.style.display = 'flex';
}

// --- Folder Load File Listener ---
folderInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const osuFile = files.find(f => f.name.endsWith('.osu'));
    const audioFile = files.find(f => f.name.endsWith('.mp3'));

    if (!osuFile || !audioFile) {
        alert("Missing files! Make sure the folder contains a .osu and a .mp3 file.");
        return;
    }

    uploadZone.style.display = 'none';

    const rawDataProfile = parseOsuFile(await osuFile.text());
    document.getElementById('resSongTitle').innerText = rawDataProfile.title;

    const audioURL = URL.createObjectURL(audioFile);
    gameAudio = new Audio(audioURL);

    gameAudio.addEventListener('canplaythrough', () => {
        setTimeout(() => {
            gameAudio.play();
            startGameLoop(rawDataProfile.notes);
        }, 1000);
    }, { once: true });
});

// --- Physical Input Handlers ---
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (e.key === 'Escape') { togglePause(); return; }

    const keyMap = getActiveKeyMap();
    if (keyMap[key] && !isPaused && !e.repeat) {
        const item = keyMap[key];
        item.element.classList.add('active-press');
        handleInputHit(item.element.id);
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    const keyMap = getActiveKeyMap();
    if (keyMap[key]) keyMap[key].element.classList.remove('active-press');
});

const keyMap = getActiveKeyMap();
Object.keys(keyMap).forEach(key => {
    const item = keyMap[key];
    
    const startPress = (e) => {
        e.preventDefault();
        if (isPaused) return;
        item.element.classList.add('active-press');
        handleInputHit(item.element.id);
    };

    const endPress = () => item.element.classList.remove('active-press');

    item.element.addEventListener('touchstart', startPress);
    item.element.addEventListener('touchend', endPress);
    item.element.addEventListener('mousedown', startPress);
    item.element.addEventListener('mouseup', endPress);
    item.element.addEventListener('mouseleave', endPress);
});

pauseBtn.addEventListener('click', togglePause);
resumeBtn.addEventListener('click', togglePause);
