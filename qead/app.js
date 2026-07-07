const pauseOverlay = document.getElementById('pauseOverlay');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const comboDisplay = document.getElementById('comboDisplay');
const liveAccuracyDisplay = document.getElementById('liveAccuracyDisplay');
const songTitleDisplay = document.getElementById('songTitle');
const folderInput = document.getElementById('folderInput');
const uploadZone = document.getElementById('uploadZone');
const resultsOverlay = document.getElementById('resultsOverlay');
const retryBtn = document.getElementById('retryBtn') || document.getElementById('playAgainBtn');
const homeBtn = document.getElementById('homeBtn');
const toggleBgBtn = document.getElementById('toggleBgBtn'); 

// DASHBOARD VIEW SELECTORS
const songSelectScreen = document.getElementById('songSelectScreen');
const gameArena = document.getElementById('gameArena');
const songWheelList = document.getElementById('songWheelList');
const menuSongTitle = document.getElementById('menuSongTitle');
const menuSongArtist = document.getElementById('menuSongArtist');
const menuArtPreview = document.getElementById('menuArtPreview');
const menuPlayBtn = document.getElementById('menuPlayBtn');
const menuSearchInput = document.getElementById('menuSearchInput'); // NEW SEARCH SELECTOR

let isPaused = false;
let currentCombo = 0;
let activeTimeline = [];
let nextNoteIndex = 0;
let gameAudio = null;
let mapLoaded = false;
let cachedRawNotes = []; 
let currentBgURL = ""; 
let lastRenderedPercent = -1;
let showArtwork = localStorage.getItem('showArtwork') !== 'false';

// MOCK POOL: Updated with song duration strings and difficulty star ratings
const localSongsPool = [
    {
        id: "mock-1",
        title: "FREEDOM DIVE",
        artist: "xi",
        stars: "5.4★",
        durationText: "4:22",
        audioSrc: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", 
        bgSrc: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500", 
        notes: [{time: 1000, targetId: 'box-top-left'}, {time: 2000, targetId: 'box-top-right'}, {time: 3000, targetId: 'box-bottom-left'}]
    },
    {
        id: "mock-2",
        title: "BRAIN POWER",
        artist: "NOMA",
        stars: "4.2★",
        durationText: "2:15",
        audioSrc: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        bgSrc: "https://images.unsplash.com/photo-1614741118887-7a4ee193a5fa?w=500",
        notes: [{time: 1000, targetId: 'box-bottom-right'}, {time: 1500, targetId: 'box-top-left'}, {time: 2000, targetId: 'box-top-right'}]
    }
];

let activeSelectedTrack = null;

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

// POPULATE WHEEL WITH REAL-TIME FILTER REGEX CHECK MATCHES
function buildSongWheelMenu(filterQuery = "") {
    if (!songWheelList) return;
    songWheelList.innerHTML = ""; // Wipe grid cards clean

    const cleanQuery = filterQuery.toLowerCase().trim();

    localSongsPool.forEach(song => {
        // Query filter checking rules (checks title match or artist match matches)
        const matchTitle = song.title.toLowerCase().includes(cleanQuery);
        const matchArtist = song.artist.toLowerCase().includes(cleanQuery);
        
        if (cleanQuery && !matchTitle && !matchArtist) return; // Skip if filter fails

        const card = document.createElement('div');
        card.className = "song-card";
        card.id = `card-${song.id}`;
        
        // Injected layout logic to draw the custom metric badges inside the card
        card.innerHTML = `
            <div class="card-title">${song.title}</div>
            <div class="card-artist">${song.artist}</div>
            <div class="card-meta-row">
                <span class="meta-badge difficulty">${song.stars}</span>
                <span class="meta-badge duration">⏱ ${song.durationText}</span>
            </div>
        `;
        
        // Maintain active persistent tracking selection visuals on filter refreshes
        if (activeSelectedTrack && activeSelectedTrack.id === song.id) {
            card.classList.add('active-card');
        }
        
        card.addEventListener('click', () => selectTrackFromWheel(song));
        songWheelList.appendChild(card);
    });

    // Edge check notice if search queries filter out every track card entry
    if (songWheelList.children.length === 0) {
        songWheelList.innerHTML = `<div style="color: #555; font-style: italic; padding: 20px; text-align:center;">No tracks match your query...</div>`;
    }
}

function selectTrackFromWheel(song) {
    activeSelectedTrack = song;
    
    document.querySelectorAll('.song-card').forEach(c => c.classList.remove('active-card'));
    const targetedCard = document.getElementById(`card-${song.id}`);
    if (targetedCard) targetedCard.classList.add('active-card');

    menuSongTitle.innerText = song.title.toUpperCase();
    menuSongArtist.innerText = `${song.artist.toUpperCase()} [${song.stars}]`;
    
    menuArtPreview.parentElement.style.backgroundImage = `url(${song.bgSrc})`;
    menuPlayBtn.style.display = "block";
}

// SETUP LIVE CAPTURE INPUT EVENT TRACKER FOR THE SEARCH BAR
if (menuSearchInput) {
    menuSearchInput.addEventListener('input', (e) => {
        buildSongWheelMenu(e.target.value);
    });
}

if (menuPlayBtn) {
    menuPlayBtn.addEventListener('click', () => {
        if (!activeSelectedTrack) return;
        
        songSelectScreen.style.display = "none";
        gameArena.style.display = "block";
        
        songTitleDisplay.innerText = `qead // ${activeSelectedTrack.title.toUpperCase()}`;
        currentBgURL = activeSelectedTrack.bgSrc;
        refreshBackgroundView();

        gameAudio = new Audio(activeSelectedTrack.audioSrc);
        
        const circleElement = document.getElementById('progressCircle');
        if (circleElement) circleElement.style.display = 'flex';
        lastRenderedPercent = -1;

        gameAudio.addEventListener('canplaythrough', () => {
            setTimeout(() => {
                gameAudio.play();
                cachedRawNotes = JSON.stringify(activeSelectedTrack.notes);
                startGameLoop(JSON.parse(cachedRawNotes));
            }, 3000); 
        }, { once: true });
    });
}

const hitSoundFile = new Audio('soft-hitnormal.wav'); 
hitSoundFile.preload = 'auto';

function playHitSound() {
    const soundClone = hitSoundFile.cloneNode();
    soundClone.volume = 0.5;
    soundClone.play().catch(err => console.log("Audio pipeline muted: ", err));
}

const missSoundFile = new Audio('combobreak.mp3'); 
missSoundFile.preload = 'auto';

function playMissSound() {
    const soundClone = missSoundFile.cloneNode();
    soundClone.volume = 0.6; 
    soundClone.play().catch(err => console.log("Miss clip blocked: ", err));
}

if (toggleBgBtn) {
    toggleBgBtn.innerText = showArtwork ? "ARTWORK: ON" : "ARTWORK: OFF";
}

function togglePause() {
    if (!mapLoaded || resultsOverlay.style.display === 'flex') return;
    isPaused = !isPaused;
    pauseOverlay.style.display = isPaused ? 'flex' : 'none';
    if (gameAudio) {
        if (isPaused) gameAudio.pause();
        else gameAudio.play();
    }
}

function updateLiveAccuracy() {
    const totalProcessed = scoreStats.count300 + scoreStats.count100 + scoreStats.count50 + scoreStats.countMiss;
    if (totalProcessed === 0) {
        liveAccuracyDisplay.innerText = "100.00%";
        return;
    }
    const currentPointsEarned = (scoreStats.count300 * 300) + (scoreStats.count100 * 100) + (scoreStats.count50 * 50);
    const maxPossiblePoints = totalProcessed * 300;
    const currentAccuracy = (currentPointsEarned / maxPossiblePoints) * 100;
    
    liveAccuracyDisplay.innerText = `${currentAccuracy.toFixed(2)}%`;
}

function parseOsuFile(rawText) {
    const lines = rawText.split('\n');
    let isHitObjectsSection = false;
    let isEventsSection = false;
    let rawNotes = [];
    let cleanTitle = "UNKNOWN MAP";
    let bgFilename = "";

    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('//')) return;

        if (line.startsWith('Title:')) {
            cleanTitle = line.split(':')[1].trim();
            songTitleDisplay.innerText = `qead // ${cleanTitle.toUpperCase()}`;
        }
        
        if (line === '[Events]') {
            isEventsSection = true;
            isHitObjectsSection = false;
            return;
        }

        if (line === '[HitObjects]') {
            isHitObjectsSection = true;
            isEventsSection = false;
            return;
        }

        if (isEventsSection) {
            const parts = line.split(',');
            if (parts[0] === '0' && parts[1] === '0' && parts[2]) {
                bgFilename = parts[2].replace(/"/g, '').trim();
            }
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

                rawNotes.push({ time, targetId, visualTriggered: false, flashed: false, hit: false, missed: false, isSpamDensity: false });
            }
        }
    });

    rawNotes.sort((a, b) => a.time - b.time);

    const densityThresholdMS = 150;
    for (let i = 0; i < rawNotes.length; i++) {
        const prev = rawNotes[i - 1];
        const next = rawNotes[i + 1];
        
        if ((prev && (rawNotes[i].time - prev.time <= densityThresholdMS)) || 
            (next && (next.time - rawNotes[i].time <= densityThresholdMS))) {
            rawNotes[i].isSpamDensity = true;
        }
    }

    cachedRawNotes = JSON.stringify(rawNotes);

    return { notes: rawNotes, title: cleanTitle, bgFilename: bgFilename };
}

function startGameLoop(parsedNotes) {
    activeTimeline = parsedNotes;
    nextNoteIndex = 0;
    currentCombo = 0;
    
    scoreStats.count300 = 0;
    scoreStats.count100 = 0;
    scoreStats.count50 = 0;
    scoreStats.countMiss = 0;
    scoreStats.maxCombo = 0;
    
    comboDisplay.innerText = "0x";
    comboDisplay.style.display = 'block';
    liveAccuracyDisplay.innerText = "100.00%";
    liveAccuracyDisplay.style.display = 'block';
    
    mapLoaded = true;
    isPaused = false;
    requestAnimationFrame(updateEngineClock);
}

function updateOsuProgressCircle() {
    if (!gameAudio || isPaused) return;

    const currentSeconds = gameAudio.currentTime;
    const totalSeconds = gameAudio.duration || 0;
    if (totalSeconds === 0) return;

    const progressPercent = Math.floor((currentSeconds / totalSeconds) * 100);
    if (progressPercent === lastRenderedPercent) return;
    lastRenderedPercent = progressPercent;

    const percentLabel = document.getElementById('progressPercent');
    if (percentLabel) percentLabel.innerText = `${progressPercent}%`;

    const circleElement = document.getElementById('progressCircle');
    if (circleElement) {
        circleElement.style.background = `conic-gradient(#00f2fe ${progressPercent}%, #222 ${progressPercent}%)`;
    }
}

function updateEngineClock() {
    if (isPaused || !gameAudio) {
        requestAnimationFrame(updateEngineClock);
        return;
    }

    const currentPlaybackTime = gameAudio.currentTime * 1000;
    const lastNote = activeTimeline[activeTimeline.length - 1];
    
    const trackFinishedNaturally = gameAudio.ended;
    const safetyBufferReached = lastNote && (currentPlaybackTime > lastNote.time + 4000);

    if (trackFinishedNaturally || safetyBufferReached) {
        triggerResultsScreen();
        return;
    }

    updateOsuProgressCircle();

    for (let i = nextNoteIndex; i < activeTimeline.length; i++) {
        const note = activeTimeline[i];

        if (currentPlaybackTime >= note.time - 501 && currentPlaybackTime < note.time && !note.visualTriggered) {
            const el = document.getElementById(note.targetId);
            const keyMap = getActiveKeyMap();
            const matchingKeyData = Object.values(keyMap).find(item => item.element.id === note.targetId);
            
            const pulse = document.createElement('div');
            pulse.className = 'note-pulse';
            
            if (note.isSpamDensity) {
                pulse.style.color = '#fff600'; 
                pulse.style.boxShadow = '0 0 12px #ffffff, inset 0 0 12px #fff600';
            } else {
                pulse.style.color = matchingKeyData.color; 
            }
            
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

        const missBoundary = note.isSpamDensity ? 250 : 180;

        if (currentPlaybackTime > note.time + missBoundary && !note.hit && !note.missed) {
            note.missed = true;
            if (note.pulseElement) note.pulseElement.remove();
            
            if (currentCombo >= 5) {
                playMissSound();
            }

            scoreStats.countMiss++;
            currentCombo = 0;
            comboDisplay.innerText = `${currentCombo}x`;
            
            updateLiveAccuracy();
            
            const el = document.getElementById(note.targetId);
            el.style.borderColor = '#da3637';
            setTimeout(() => el.style.borderColor = '', 100);
            triggerJudgmentBurst(el, 'X', '#da3637');

            nextNoteIndex = i + 1;
        }
    }
    requestAnimationFrame(updateEngineClock);
}

function handleInputHit(targetId) {
    if (!gameAudio) return;
    const currentPlaybackTime = gameAudio.currentTime * 1000;
    const keyMap = getActiveKeyMap();
    let match = Object.values(keyMap).find(item => item.element.id === targetId);

    const targetNote = activeTimeline.find(note => {
        if (note.targetId !== targetId || note.hit || note.missed) return false;
        const offset = Math.abs(currentPlaybackTime - note.time);
        const currentMaxWindow = note.isSpamDensity ? 250 : 180;
        return offset <= currentMaxWindow;
    });

    if (targetNote) {
        targetNote.hit = true;
        if (targetNote.pulseElement) targetNote.pulseElement.remove();

        const offset = Math.abs(currentPlaybackTime - targetNote.time);
        let scoreType = '300';
        let burstColor = match.color;
        
        const win300 = targetNote.isSpamDensity ? 140 : 90;
        const win100 = targetNote.isSpamDensity ? 200 : 150;

        if (offset <= win300) {
            scoreType = '300';
            scoreStats.count300++;
        } else if (offset <= win100) {
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
        comboDisplay.classList.remove('bump');
        void comboDisplay.offsetWidth; 
        comboDisplay.classList.add('bump');

        updateLiveAccuracy();
        triggerJudgmentBurst(match.element, scoreType, burstColor);
        
        match.element.classList.remove('hit-flash');
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

function triggerResultsScreen() {
    isPaused = true;
    if (gameAudio) gameAudio.pause();

    const totalNotes = scoreStats.count300 + scoreStats.count100 + scoreStats.count50 + scoreStats.countMiss;
    
    let accuracy = 100.00;
    if (totalNotes > 0) {
        const totalPointsEarned = (scoreStats.count300 * 300) + (scoreStats.count100 * 100) + (scoreStats.count50 * 50);
        const maxPossiblePoints = totalNotes * 300;
        accuracy = (totalPointsEarned / maxPossiblePoints) * 100;
    }

    let grade = 'D';
    let gradeColor = '#f85149';

    if (accuracy === 100) { grade = 'SS'; gradeColor = '#f1c40f'; }
    else if (accuracy >= 95) { grade = 'S'; gradeColor = '#f39c12'; }
    else if (accuracy >= 90) { grade = 'A'; gradeColor = '#2ecc71'; }
    else if (accuracy >= 80) { grade = 'B'; gradeColor = '#3498db'; }
    else if (accuracy >= 70) { grade = 'C'; gradeColor = '#9b59b6'; }

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

function handlePlayAgainRetry() {
    if (!cachedRawNotes || !gameAudio) return;

    document.querySelectorAll('.note-pulse').forEach(p => p.remove());
    document.querySelectorAll('.judgment-burst').forEach(b => b.remove());
    resultsOverlay.style.display = 'none';

    gameAudio.currentTime = 0;
    const freshTimelineCopy = JSON.parse(cachedRawNotes);

    const circleElement = document.getElementById('progressCircle');
    if (circleElement) circleElement.style.display = 'flex';
    
    lastRenderedPercent = -1; 

    setTimeout(() => {
        gameAudio.play();
        startGameLoop(freshTimelineCopy);
    }, 3000); 
}

function handleReturnToHome() {
    if (gameAudio) {
        gameAudio.pause();
        gameAudio.src = "";
        gameAudio = null;
    }

    document.querySelectorAll('.note-pulse').forEach(p => p.remove());
    document.querySelectorAll('.judgment-burst').forEach(b => b.remove());

    activeTimeline = [];
    cachedRawNotes = [];
    mapLoaded = false;
    isPaused = false;

    songTitleDisplay.innerText = "qead // CHOOSE A TRACK";

    comboDisplay.style.display = 'none';
    liveAccuracyDisplay.style.display = 'none';
    resultsOverlay.style.display = 'none';
    gameArena.style.display = "none";

    songSelectScreen.style.display = "flex";

    document.body.style.backgroundImage = "";
    if (currentBgURL && !currentBgURL.startsWith('http')) {
        URL.revokeObjectURL(currentBgURL);
    }
    currentBgURL = "";

    const percentLabel = document.getElementById('progressPercent');
    if (percentLabel) percentLabel.innerText = "0%";
    const circleElement = document.getElementById('progressCircle');
    if (circleElement) {
        circleElement.style.background = `conic-gradient(#00f2fe 0%, #222 0%)`;
        circleElement.style.display = 'none';
    }

    folderInput.value = "";
}

function refreshBackgroundView() {
    if (showArtwork && currentBgURL) {
        document.body.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)), url(${currentBgURL})`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
    } else {
        document.body.style.backgroundImage = "";
    }
}

if (toggleBgBtn) {
    toggleBgBtn.addEventListener('click', () => {
        showArtwork = !showArtwork;
        localStorage.setItem('showArtwork', showArtwork);
        toggleBgBtn.innerText = showArtwork ? "ARTWORK: ON" : "ARTWORK: OFF";
        refreshBackgroundView();
    });
}

folderInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const osuFile = files.find(f => f.name.endsWith('.osu'));
    const audioFile = files.find(f => f.name.endsWith('.mp3'));

    if (!osuFile || !audioFile) {
        alert("Missing files! Make sure the folder contains a .osu and a .mp3 file.");
        return;
    }

    songSelectScreen.style.display = "none";
    gameArena.style.display = "block";

    const rawDataProfile = parseOsuFile(await osuFile.text());
    document.getElementById('resSongTitle').innerText = rawDataProfile.title;

    if (rawDataProfile.bgFilename) {
        const matchImageFile = files.find(f => f.name.toLowerCase().endsWith(rawDataProfile.bgFilename.toLowerCase()));
        if (matchImageFile) {
            currentBgURL = URL.createObjectURL(matchImageFile);
            refreshBackgroundView(); 
        }
    }

    const audioURL = URL.createObjectURL(audioFile);
    gameAudio = new Audio(audioURL);

    gameAudio.addEventListener('canplaythrough', () => {
        const circleElement = document.getElementById('progressCircle');
        if (circleElement) circleElement.style.display = 'flex';
        lastRenderedPercent = -1;

        setTimeout(() => {
            gameAudio.play();
            startGameLoop(rawDataProfile.notes);
        }, 3000);
    }, { once: true });
});

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
    let activeTouches = new Set();

    item.element.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (isPaused) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touchId = e.changedTouches[i].identifier;
            if (!activeTouches.has(touchId)) {
                activeTouches.add(touchId);
                item.element.classList.add('active-press');
                handleInputHit(item.element.id);
            }
        }
    });

    item.element.addEventListener('touchend', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            activeTouches.delete(e.changedTouches[i].identifier);
        }
        if (activeTouches.size === 0) {
            item.element.classList.remove('active-press');
        }
    });

    item.element.addEventListener('mousedown', (e) => {
        if (isPaused) return;
        item.element.classList.add('active-press');
        handleInputHit(item.element.id);
    });
    item.element.addEventListener('mouseup', () => item.element.classList.remove('active-press'));
    item.element.addEventListener('mouseleave', () => item.element.classList.remove('active-press'));
});

pauseBtn.addEventListener('click', togglePause);
resumeBtn.addEventListener('click', togglePause);

if (retryBtn) {
    retryBtn.addEventListener('click', handlePlayAgainRetry);
}

if (homeBtn) {
    homeBtn.addEventListener('click', handleReturnToHome);
}

// INITIATE ENGINE SETUP
buildSongWheelMenu();
