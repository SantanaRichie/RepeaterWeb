// State variables (matching MainActivity.java)
let audio = new Audio();
let loopStart = 0; // in seconds
let loopEnd = 0;   // in seconds
let isLooping = false;
let currentFileName = null;
let animationFrameId;

// UI Elements
const fileNameView = document.getElementById('fileNameView');
const fileInput = document.getElementById('fileInput');
const selectFileButton = document.getElementById('selectFileButton');
const playButton = document.getElementById('playButton');
const pauseButton = document.getElementById('pauseButton');
const stopButton = document.getElementById('stopButton');
const currentTimeView = document.getElementById('currentTimeView');
const durationView = document.getElementById('durationView');
const startTimeView = document.getElementById('startTimeView');
const endTimeView = document.getElementById('endTimeView');
const seekBar = document.getElementById('seekBar');
const setStartButton = document.getElementById('setStartButton');
const setEndButton = document.getElementById('setEndButton');
const loopToggle = document.getElementById('loopToggle');
const installButton = document.getElementById('installButton');

// --- Initialization & Event Listeners ---

// File Selection
selectFileButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        loadAudioFile(file);
    }
});

// Playback Controls
playButton.addEventListener('click', () => {
    if (audio.src && currentFileName) {
        audio.play().then(() => {
            playButton.textContent = "Playing...";
            startUpdateLoop();
        }).catch(err => console.error("Playback error:", err));
    } else {
        alert("Please select a file first");
    }
});

pauseButton.addEventListener('click', () => {
    if (!audio.paused) {
        audio.pause();
        playButton.textContent = "Play";
        cancelAnimationFrame(animationFrameId);
    }
});

stopButton.addEventListener('click', () => {
    audio.pause();
    audio.currentTime = loopStart; // Jump to loop start on stop, similar to Android app
    playButton.textContent = "Play";
    cancelAnimationFrame(animationFrameId);
    updateTimeDisplay();
    seekBar.value = audio.currentTime;
});

// Seek Bar
seekBar.addEventListener('input', () => {
    if (audio.src) {
        audio.currentTime = seekBar.value;
        updateTimeDisplay();
    }
});

// Loop Controls
setStartButton.addEventListener('click', () => {
    if (audio.src) {
        loopStart = audio.currentTime;
        // Logic from MainActivity: if loopEnd < loopStart, set loopEnd to duration
        if (loopEnd < loopStart) {
            loopEnd = audio.duration;
        }
        updateLoopDisplay();
    }
});

setEndButton.addEventListener('click', () => {
    if (audio.src) {
        loopEnd = audio.currentTime;
        // Logic from MainActivity: if loopStart >= loopEnd, set loopStart to 0
        if (loopStart >= loopEnd) {
            loopStart = 0;
        }
        updateLoopDisplay();
    }
});

loopToggle.addEventListener('click', () => {
    isLooping = !isLooping;
    
    // Validation logic from MainActivity
    if (isLooping && (loopStart === 0 && loopEnd === 0 || loopEnd === 0)) {
        // If no loop points set (or only start set but end is 0/default), warn user
        // Note: In web audio, duration might not be ready immediately, but here we assume loaded.
        if (loopEnd === 0 && audio.duration) loopEnd = audio.duration;
        
        if (loopStart === 0 && loopEnd === 0) {
             alert("Please set loop points first");
             isLooping = false;
        }
    }

    // Update UI
    if (isLooping) {
        loopToggle.textContent = "Loop: ON";
        loopToggle.classList.add("active");
    } else {
        loopToggle.textContent = "Loop: OFF";
        loopToggle.classList.remove("active");
    }
});

// --- PWA Install Logic ---
let deferredPrompt;

// Check for iOS
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator.standalone);

// If on iOS and not already installed, show the button to give instructions
if (isIos && !isInStandaloneMode) {
    installButton.style.display = 'block';
}

window.addEventListener('beforeinstallprompt', (e) => {
    console.log("beforeinstallprompt fired");
    e.preventDefault();
    deferredPrompt = e;
    installButton.style.display = 'block';
});

installButton.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
    } else if (isIos) {
        alert("To install on iPhone/iPad:\n1. Tap the Share button (square with arrow)\n2. Scroll down and tap 'Add to Home Screen'");
    }
});

// Register Service Worker (Required for PWA installation)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log("Service Worker Registered"));
}

// --- Core Logic ---

function loadAudioFile(file) {
    // Stop previous
    audio.pause();
    
    // Create object URL
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    currentFileName = file.name;
    fileNameView.textContent = currentFileName;

    // Reset state
    audio.onloadedmetadata = () => {
        seekBar.max = audio.duration;
        durationView.textContent = `Duration: ${formatTime(audio.duration)}`;
        loopStart = 0;
        loopEnd = audio.duration;
        isLooping = false;
        loopToggle.textContent = "Loop: OFF";
        loopToggle.classList.remove("active");
        updateLoopDisplay();
        updateTimeDisplay();
    };
}

// The "Game Loop" / Handler replacement
function startUpdateLoop() {
    const update = () => {
        if (!audio.paused) {
            const currentPosition = audio.currentTime;

            // THE LOOPING MAGIC (Matches MainActivity logic)
            // If looping is ON and we've reached the end time
            if (isLooping && currentPosition >= loopEnd && loopEnd > loopStart) {
                audio.currentTime = loopStart;
            }

            // Update UI
            seekBar.value = currentPosition;
            updateTimeDisplay();

            // Schedule next frame (approx 60fps, smoother than Android's 100ms handler)
            animationFrameId = requestAnimationFrame(update);
        }
    };
    update();
}

function updateTimeDisplay() {
    currentTimeView.textContent = `Current: ${formatTime(audio.currentTime)}`;
}

function updateLoopDisplay() {
    startTimeView.textContent = `Start: ${formatTime(loopStart)}`;
    endTimeView.textContent = `End: ${formatTime(loopEnd)}`;
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const mStr = m < 10 ? "0" + m : m;
    const sStr = s < 10 ? "0" + s : s;
    return `${mStr}:${sStr}`;
}