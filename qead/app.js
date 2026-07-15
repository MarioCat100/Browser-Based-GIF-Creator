// =========================================================================
// --- LIVE SUPABASE CLOUD CONNECTION ENGINE CONFIGURATION ---
// =========================================================================
const SUPABASE_URL = "https://zxrozrupbgbliuovmzgz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_x3p7Va4Unp2ldSNBH8VWRw_4wQQGc1g";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let globalSongsPool = []; // Holds structured song sets: { masterTitle, artist, difficulties: [...] }
let activeSelectedTrack = null;
let isPaused = false;
let currentCombo = 0;
let activeTimeline = [];
let nextNoteIndex = 0;
let gameAudio = null;
let mapLoaded = false;
let cachedRawNotes = []; 
let lastRenderedPercent = -1;
let showArtwork = localStorage.getItem('showArtwork') !== 'false';
let currentBgURL = "";

// DOM ELEMENT SELECTORS
const pauseOverlay = document.getElementById('pauseOverlay');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const comboDisplay = document.getElementById('comboDisplay');
const liveAccuracyDisplay = document.getElementById('liveAccuracyDisplay');
const songTitleDisplay = document.getElementById('songTitle');
const folderInput = document.getElementById('folderInput');
const resultsOverlay = document.getElementById('resultsOverlay');
const retryBtn = document.getElementById('retryBtn') || document.getElementById('playAgainBtn');
const pauseRetryBtn = document.getElementById('pauseRetryBtn'); // TARGETED PAUSE MENU RETRY ELEMENT
const homeBtn = document.getElementById('homeBtn');
const toggleBgBtn = document.getElementById('toggleBgBtn'); 

const songSelectScreen = document.getElementById('songSelectScreen');
const gameArena = document.getElementById('gameArena');
const songWheelList = document.getElementById('songWheelList');
const menuSongTitle = document.getElementById('menuSongTitle');
const menuSongArtist = document.getElementById('menuSongArtist');
const menuArtPreview = document.getElementById('menuArtPreview');
const menuPlayBtn = document.getElementById('menuPlayBtn');
const menuSearchInput = document.getElementById('menuSearchInput');

// PERFORMANCE COUNTERS MATRIX
const scoreStats = { count300: 0, count100: 0, count50: 0, countMiss: 0, maxCombo: 0 };
const userSettings = { topLeft: 'q', topRight: 'e', bottomLeft: 'a', bottomRight: 'd' };

const getActiveKeyMap = () => ({
    [userSettings.topLeft]: { element: document.getElementById('box-top-left'), color: '#00f2fe' },
    [userSettings.topRight]: { element: document.getElementById('box-top-right'), color: '#ff2e7e' },
    [userSettings.bottomLeft]: { element: document.getElementById('box-bottom-left'), color: '#ba49ff' },
    [userSettings.bottomRight]: { element: document.getElementById('box-bottom-right'), color: '#00ff88' }
});

// =========================================================================
// --- ZERO-LATENCY WEB AUDIO API STORAGE ENGINE ---
// =========================================================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

let hitSoundBuffer = null;
let missSoundBuffer = null;

// HIGH-PERFORMANCE AUDIO NODE POOL VARIABLES
const MAX_VOICES = 12; // Capped at the 12 hardware-channel sweet spot to prevent browser dropping
const activeVoices = [];

/**
 * Grabs an audio file, converts it to an array buffer, and decodes it straight to RAM.
 */
async function loadSoundToRAM(filePath) {
    try {
        const response = await fetch(filePath);
        const arrayBuffer = await response.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (err) {
        console.warn(`Could not load sound effect at ${filePath}. Playing silent fallback.`, err);
        return null;
    }
}

/**
 * Bootstraps the Web Audio buffers on startup.
 */
async function initRhythmAudioEngine() {
    hitSoundBuffer = await loadSoundToRAM('soft-hitnormal.wav');
    missSoundBuffer = await loadSoundToRAM('combobreak.wav');
    console.log("⚡ High-performance audio engine loaded successfully!");
}

// Kick off asset caching
initRhythmAudioEngine();

function playHitSound() {
    // Unblock the browser audio thread if paused/idle
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (!hitSoundBuffer) return;

    // VOICE STEALING: Force-stop the oldest active sound node to instantly free up a channel
    while (activeVoices.length >= MAX_VOICES) {
        const oldestVoice = activeVoices.shift();
        try { 
            oldestVoice.stop(); // Stops the audio node instantly
            oldestVoice.disconnect(); // Detaches it from the output to free RAM
        } catch(e) {
            // Ignore errors if the sound had already naturally ended
        }
    }

    // Build temporary memory nodes
    const source = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();

    source.buffer = hitSoundBuffer;
    gainNode.gain.value = 0.8; // Keeps your punchy volume!

    // Connect source -> volume slider -> audio device output
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Track this active voice so we can manage channel limits
    activeVoices.push(source);
    
    source.start(0); // Trigger instantly!

    // Remove from active pool when finished playing
    source.onended = () => {
        const index = activeVoices.indexOf(source);
        if (index > -1) {
            activeVoices.splice(index, 1);
            source.disconnect(); // Clean up connections to prevent memory leaks
        }
    };
}

function playMissSound() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (!missSoundBuffer) return;

    const source = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();

    source.buffer = missSoundBuffer;
    gainNode.gain.value = 0.9; // Scale volume to 60% now 90%

    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    source.start(0);
}

// =========================================================================
// --- ASYNCHRONOUS DATABASE FETCH GATEWAY ---
// =========================================================================
async function fetchTracksFromCloud() {
    if (songWheelList) {
        songWheelList.innerHTML = `<div style="color: #00f2fe; font-style: italic; padding: 20px; text-align:center;">Connecting to cloud matrix...</div>`;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('songs')
            .select('*')
            .order('title', { ascending: true });

        if (error) throw error;

        // Group rows that share the same base title layout
        const groups = {};

        data.forEach(row => {
            let baseTitle = row.title;
            let diffName = "Normal";
            const match = row.title.match(/^(.*)\s+\[(.*?)\]$/);
            if (match) {
                baseTitle = match[1].trim();
                diffName = match[2].trim();
            }

            if (!groups[baseTitle]) {
                groups[baseTitle] = {
                    masterTitle: baseTitle,
                    artist: row.artist,
                    bgSrc: row.bg_url,
                    difficulties: []
                };
            }

            groups[baseTitle].difficulties.push({
                id: row.id,
                fullTitle: row.title,
                artist: row.artist,
                diffName: diffName,
                stars: row.stars,
                durationText: row.duration_text,
                audioSrc: row.audio_url,
                bgSrc: row.bg_url,
                notes: typeof row.osu_notes === 'string' ? JSON.parse(row.osu_notes) : row.osu_notes
            });
        });

        // Loop inside each group and sort them strictly from lowest stars to highest stars
        Object.values(groups).forEach(group => {
            group.difficulties.sort((a, b) => {
                const valA = parseFloat(a.stars) || 0;
                const valB = parseFloat(b.stars) || 0;
                return valA - valB;
            });
        });

        globalSongsPool = Object.values(groups);
        buildSongWheelMenu();

    } catch (err) {
        console.error("Cloud pipeline fetch failure: ", err);
        if (songWheelList) {
            songWheelList.innerHTML = `<div style="color: #da3637; font-weight: bold; padding: 20px; text-align:center;">Failed to connect to backend server.</div>`;
        }
    }
}

// POPULATE WHEEL USING FILTER NESTED ACCORDION ENTRIES
function buildSongWheelMenu(filterQuery = "") {
    if (!songWheelList) return;
    songWheelList.innerHTML = ""; 

    const cleanQuery = filterQuery.toLowerCase().trim();

    globalSongsPool.forEach(group => {
        const matchTitle = group.masterTitle.toLowerCase().includes(cleanQuery);
        const matchArtist = group.artist.toLowerCase().includes(cleanQuery);
        if (cleanQuery && !matchTitle && !matchArtist) return; 

        const groupContainer = document.createElement('div');
        groupContainer.className = "song-group-container";

        const masterCard = document.createElement('div');
        masterCard.className = "song-card master-card";
        masterCard.innerHTML = `
            <div class="card-left">
                <div class="card-title">${group.masterTitle}</div>
                <div class="card-artist">${group.artist}</div>
            </div>
            <div class="card-meta-row">
                <span class="meta-badge count">${group.difficulties.length} Maps</span>
            </div>
        `;

        const diffListArea = document.createElement('div');
        diffListArea.className = "difficulty-sub-list";
        diffListArea.style.display = "none"; 

        group.difficulties.forEach(track => {
            const subCard = document.createElement('div');
            subCard.className = "sub-diff-card";
            
            if (activeSelectedTrack && activeSelectedTrack.id === track.id) {
                subCard.classList.add('active-sub-card');
                diffListArea.style.display = "flex"; 
            }

            subCard.innerHTML = `
                <div class="sub-card-title">✦ ${track.diffName}</div>
                <div class="sub-card-meta">
                    <span class="meta-badge difficulty">${track.stars}</span>
                    <span class="meta-badge duration">⏱ ${track.durationText}</span>
                </div>
            `;

            subCard.addEventListener('click', (e) => {
                e.stopPropagation(); 
                selectTrackFromWheel(track);
            });

            diffListArea.appendChild(subCard);
        });

        masterCard.addEventListener('click', () => {
            const isCurrentlyHidden = diffListArea.style.display === "none";
            document.querySelectorAll('.difficulty-sub-list').forEach(el => el.style.display = "none");
            diffListArea.style.display = isCurrentlyHidden ? "flex" : "none";
        });

        groupContainer.appendChild(masterCard);
        groupContainer.appendChild(diffListArea);
        songWheelList.appendChild(groupContainer);
    });

    if (globalSongsPool.length === 0) {
        songWheelList.innerHTML = `<div style="color: #555; font-style: italic; padding: 20px; text-align:center;">Database is empty. Add track data rows via admin module!</div>`;
    }
}

function selectTrackFromWheel(track) {
    activeSelectedTrack = track;
    buildSongWheelMenu(menuSearchInput ? menuSearchInput.value : "");

    if (menuSongTitle) menuSongTitle.innerText = track.fullTitle.toUpperCase();
    if (menuSongArtist) menuSongArtist.innerText = `${track.artist.toUpperCase()} [${track.stars}]`;
    
    if (menuArtPreview) {
        menuArtPreview.style.backgroundImage = track.bgSrc ? `url(${track.bgSrc})` : "";
        if (menuArtPreview.parentElement) {
            menuArtPreview.parentElement.style.backgroundImage = track.bgSrc ? `url(${track.bgSrc})` : "";
        }
    }
    if (menuPlayBtn) menuPlayBtn.style.display = "block";
}

if (menuSearchInput) {
    menuSearchInput.addEventListener('input', (e) => buildSongWheelMenu(e.target.value));
}

if (menuPlayBtn) {
    menuPlayBtn.addEventListener('click', () => {
        if (!activeSelectedTrack) return;
        
        songSelectScreen.style.display = "none";
        gameArena.style.display = "block";
        
        songTitleDisplay.innerText = `qead // ${activeSelectedTrack.fullTitle.toUpperCase()}`;
        currentBgURL = activeSelectedTrack.bgSrc;
        refreshBackgroundView();

        gameAudio = new Audio(activeSelectedTrack.audioSrc);
        gameAudio.crossOrigin = "anonymous"; 
        
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
    
    scoreStats.count300 = 0; scoreStats.count100 = 0; scoreStats.count50 = 0; scoreStats.countMiss = 0; scoreStats.maxCombo = 0;
    
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
    
    if (gameAudio.ended || (lastNote && (currentPlaybackTime > lastNote.time + 4000))) {
        triggerResultsScreen();
        return;
    }

    updateOsuProgressCircle();

    for (let i = nextNoteIndex; i < activeTimeline.length; i++) {
        const note = activeTimeline[i];
        const timeRemaining = note.time - currentPlaybackTime;

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
            if (currentCombo >= 20) playMissSound();

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
        const win100 = targetNote.isSpamDensity ? 250 : 150; // RESTORED SWEET SPOT: Extends registration to catch fast stream inputs cleanly

        if (offset <= win300) {
            scoreType = '300';
            scoreStats.count300++;
            playHitSound();
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
        if (currentCombo > scoreStats.maxCombo) scoreStats.maxCombo = currentCombo;

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

    let grade = 'D'; let gradeColor = '#f85149';
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
    pauseOverlay.style.display = 'none'; // Ensure the pause overlay is dismissed if retrying from pause screen

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

    activeTimeline = []; cachedRawNotes = []; mapLoaded = false; isPaused = false;
    songTitleDisplay.innerText = "qead // CHOOSE A TRACK";

    comboDisplay.style.display = 'none';
    liveAccuracyDisplay.style.display = 'none';
    resultsOverlay.style.display = 'none';
    gameArena.style.display = "none";
    songSelectScreen.style.display = "flex";

    document.body.style.backgroundImage = "";
    if (currentBgURL && !currentBgURL.startsWith('http')) URL.revokeObjectURL(currentBgURL);
    currentBgURL = "";

    const percentLabel = document.getElementById('progressPercent');
    if (percentLabel) percentLabel.innerText = "0%";
    const circleElement = document.getElementById('progressCircle');
    if (circleElement) {
        circleElement.style.background = `conic-gradient(#00f2fe 0%, #222 0%)`;
        circleElement.style.display = 'none';
    }
    folderInput.value = "";
    buildSongWheelMenu();
}

function refreshBackgroundView() {
    if (showArtwork && currentBgURL) {
        document.body.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)), url(${currentBgURL})`;
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
    const osuFile = files.find(f => f.name.toLowerCase().endsWith('.osu'));
    const audioFile = files.find(f => f.name.toLowerCase().endsWith('.mp3') && !f.name.toLowerCase().includes('hitsound'));

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

const keyMapConfig = getActiveKeyMap();
Object.keys(keyMapConfig).forEach(key => {
    const item = keyMapConfig[key];
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

if (retryBtn) retryBtn.addEventListener('click', handlePlayAgainRetry);
if (pauseRetryBtn) pauseRetryBtn.addEventListener('click', handlePlayAgainRetry); // BIND PAUSE RETRY TO IN-MEMORY MAP RESET
if (homeBtn) homeBtn.addEventListener('click', handleReturnToHome);

fetchTracksFromCloud();
