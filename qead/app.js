const pauseOverlay = document.getElementById('pauseOverlay');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const comboDisplay = document.getElementById('comboDisplay');
const songTitleDisplay = document.getElementById('songTitle');
const folderInput = document.getElementById('folderInput');
const uploadZone = document.getElementById('uploadZone');

let isPaused = false;
let currentCombo = 0;
let activeTimeline = [];
let nextNoteIndex = 0;
let gameAudio = null;

// Custom Layout Settings
const userSettings = {
    topLeft: 'q',
    topRight: 'e',
    bottomLeft: 'a',
    bottomRight: 'd'
};

// Key-to-DOM Map using dynamic settings keys
const getActiveKeyMap = () => ({
    [userSettings.topLeft]: { element: document.getElementById('box-top-left'), color: '#00f2fe' },
    [userSettings.topRight]: { element: document.getElementById('box-top-right'), color: '#ff2e7e' },
    [userSettings.bottomLeft]: { element: document.getElementById('box-bottom-left'), color: '#ba49ff' },
    [userSettings.bottomRight]: { element: document.getElementById('box-bottom-right'), color: '#00ff88' }
});

function togglePause() {
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

    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('//')) return;

        if (line.startsWith('Title:')) {
            songTitleDisplay.innerText = `qead // ${line.split(':')[1].toUpperCase()}`;
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
    return notes.sort((a, b) => a.time - b.time);
}

// --- Engine Frame Loop ---
function startGameLoop(parsedNotes) {
    activeTimeline = parsedNotes;
    nextNoteIndex = 0;
    currentCombo = 0;
    requestAnimationFrame(updateEngineClock);
}

function updateEngineClock() {
    if (isPaused || !gameAudio) {
        requestAnimationFrame(updateEngineClock);
        return;
    }

    const currentPlaybackTime = gameAudio.currentTime * 1000;

    for (let i = nextNoteIndex; i < activeTimeline.length; i++) {
        const note = activeTimeline[i];

        // 1. Spawns the Shrinking Approach Ring (400ms warning window)
        if (currentPlaybackTime >= note.time - 400 && currentPlaybackTime < note.time && !note.visualTriggered) {
            const el = document.getElementById(note.targetId);
            const keyMap = getActiveKeyMap();
            const matchingKeyData = Object.values(keyMap).find(item => item.element.id === note.targetId);
            
            // Generate the dynamic approach ring DOM element
            const ring = document.createElement('div');
            ring.className = 'approach-ring';
            ring.style.color = matchingKeyData.color; // Color-match to the quadrant
            el.appendChild(ring);
            
            // Force reflow and trigger the linear shrink animation down to scale(1)
            setTimeout(() => {
                ring.style.transform = 'scale(1)';
                ring.style.opacity = '1';
            }, 10);
            
            // Store reference to clean it up later if player hits/misses
            note.ringElement = ring;
            note.visualTriggered = true;
        }

        // 1.5 The Exact Hit Flash (Blinding peak burst at 0ms)
        if (currentPlaybackTime >= note.time && !note.flashed) {
            const el = document.getElementById(note.targetId);
            
            // Remove the ring element instantly upon zero alignment
            if (note.ringElement) {
                note.ringElement.remove();
            }

            el.style.backgroundColor = '';
            el.style.borderColor = '';
            
            el.classList.add('hit-flash');
            setTimeout(() => {
                el.classList.remove('hit-flash');
            }, 120);
            note.flashed = true;
        }

        // 2. Strict Miss Window Check (150ms trailing deadline)
        if (currentPlaybackTime > note.time + 150 && !note.hit && !note.missed) {
            note.missed = true;
            
            if (note.ringElement) note.ringElement.remove();
            
            currentCombo = 0;
            comboDisplay.innerText = `${currentCombo}x`;
            
            const el = document.getElementById(note.targetId);
            el.style.transition = 'none';
            el.style.borderColor = '#da3637';
            setTimeout(() => { el.style.borderColor = ''; el.style.backgroundColor = ''; }, 100);

            triggerJudgmentBurst(el, 'X', '#da3637');
            nextNoteIndex = i + 1;
        }
    }
    requestAnimationFrame(updateEngineClock);
}

// --- Optimized Hit Registration ---
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
        
        // Remove approach ring instantly on active click registration
        if (targetNote.ringElement) {
            targetNote.ringElement.remove();
        }

        const offset = Math.abs(currentPlaybackTime - targetNote.time);
        let scoreType = '300';
        let burstColor = match.color;
        
        if (offset <= 50) {
            scoreType = '300';
        } else if (offset <= 100) {
            scoreType = '100';
            burstColor = '#e1b12c'; 
        } else {
            scoreType = '50';
            burstColor = '#7f8fa6'; 
        }

        currentCombo++;
        comboDisplay.innerText = `${currentCombo}x`;
        comboDisplay.style.display = 'block';
        comboDisplay.classList.remove('bump');
        void comboDisplay.offsetWidth; 
        comboDisplay.classList.add('bump');

        triggerJudgmentBurst(match.element, scoreType, burstColor);
        
        match.element.classList.remove('hit-flash');
        match.element.style.borderColor = '';
        match.element.style.backgroundColor = '';
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

// --- File Load Listener ---
folderInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const osuFile = files.find(f => f.name.endsWith('.osu'));
    const audioFile = files.find(f => f.name.endsWith('.mp3'));

    if (!osuFile || !audioFile) {
        alert("Missing files! Make sure the folder contains a .osu and a .mp3 file.");
        return;
    }

    uploadZone.style.display = 'none';

    const rawOsuText = await osuFile.text();
    const parsedNotes = parseOsuFile(rawOsuText);

    const audioURL = URL.createObjectURL(audioFile);
    gameAudio = new Audio(audioURL);

    gameAudio.addEventListener('canplaythrough', () => {
        setTimeout(() => {
            gameAudio.play();
            startGameLoop(parsedNotes);
        }, 1000);
    }, { once: true });
});

// --- Input Event Listeners ---
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

// Interactive touch bindings
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
