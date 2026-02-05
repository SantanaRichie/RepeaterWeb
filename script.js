// State variables (matching MainActivity.java)
let audio = new Audio();
let loopStart = 0; // in seconds
let loopEnd = 0;   // in seconds
let isLooping = false;
let currentFileName = null;
let animationFrameId;

// UI Elements
const fileNameView = document.getElementById('fileNameView');
const bpmView = document.getElementById('bpmView');
const fileInput = document.getElementById('fileInput');
const selectFileButton = document.getElementById('selectFileButton');
const tapTempoBtn = document.getElementById('tapTempoBtn');
const playButton = document.getElementById('playButton');
const pauseButton = document.getElementById('pauseButton');
const stopButton = document.getElementById('stopButton');
const rewindButton = document.getElementById('rewindButton');
const forwardButton = document.getElementById('forwardButton');
const currentTimeView = document.getElementById('currentTimeView');
const durationView = document.getElementById('durationView');
const startTimeView = document.getElementById('startTimeView');
const endTimeView = document.getElementById('endTimeView');
const seekBar = document.getElementById('seekBar');
const speedBar = document.getElementById('speedBar');
const speedValue = document.getElementById('speedValue');
const setStartButton = document.getElementById('setStartButton');
const setEndButton = document.getElementById('setEndButton');
const loopToggle = document.getElementById('loopToggle');
const recordButton = document.getElementById('recordButton');
const downloadButton = document.getElementById('downloadButton');
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

// Tap Tempo Logic
let tapTimes = [];
tapTempoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const now = Date.now();
    
    // Reset if pause is too long (2 seconds)
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
        tapTimes = [];
    }
    
    tapTimes.push(now);
    
    // Keep only the last 5 taps for better responsiveness
    if (tapTimes.length > 5) {
        tapTimes.shift();
    }

    if (tapTimes.length >= 5) {
        // Calculate intervals
        let intervals = [];
        for (let i = 1; i < tapTimes.length; i++) {
            intervals.push(tapTimes[i] - tapTimes[i - 1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        const bpm = Math.round(60000 / avgInterval);
        bpmView.textContent = bpm;
    } else {
        bpmView.textContent = 5 - tapTimes.length;
    }
});

// Playback Controls
playButton.addEventListener('click', () => {
    if (audio.src && currentFileName) {
        audio.play().then(() => {
            // Safari fix: Re-apply playback rate
            audio.playbackRate = parseFloat(speedBar.value);
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

rewindButton.addEventListener('click', () => {
    if (audio.src) {
        audio.currentTime -= 10;
        updateTimeDisplay();
        seekBar.value = audio.currentTime;
    }
});

forwardButton.addEventListener('click', () => {
    if (audio.src) {
        audio.currentTime += 10;
        updateTimeDisplay();
        seekBar.value = audio.currentTime;
    }
});

// Seek Bar
seekBar.addEventListener('input', () => {
    if (audio.src) {
        audio.currentTime = seekBar.value;
        updateTimeDisplay();
    }
});

// Speed Control
speedBar.addEventListener('input', () => {
    const speed = parseFloat(speedBar.value);
    audio.playbackRate = speed;
    audio.defaultPlaybackRate = speed; // changing defaultPlaybackRate allows Safari to remember the speed when pausing/playing
    speedValue.textContent = speed.toFixed(2) + "x";
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

// --- Recording Logic ---
let isRecording = false;
let mp3Encoder;
let processor;
let audioChunks = [];
let recordingUrl = null;
let audioSourceNode;

recordButton.addEventListener('click', async () => {
    if (isRecording) {
        // --- STOP RECORDING ---
        isRecording = false;
        recordButton.textContent = "Record Audio";
        recordButton.classList.remove("active");

        if (processor && mp3Encoder) {
            // Stop processing
            processor.disconnect();
            audioSourceNode.disconnect(processor);

            // Flush the last bit of audio
            const mp3Data = mp3Encoder.flush();
            if (mp3Data.length > 0) audioChunks.push(mp3Data);

            // Create MP3 Blob
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            if (recordingUrl) URL.revokeObjectURL(recordingUrl);
            recordingUrl = URL.createObjectURL(audioBlob);
            downloadButton.disabled = false;
            
            processor = null;
            mp3Encoder = null;
        }
    } else {
        // --- START RECORDING ---
        try {
            // Setup Web Audio API to capture the audio element
            if (!audioCtx) {
                initAudioContext();
                audioSourceNode = audioCtx.createMediaElementSource(audio);
                // Connect source to speakers so you can still hear it
                audioSourceNode.connect(audioCtx.destination);
            }
            if (audioCtx.state === 'suspended') await audioCtx.resume();

            // Initialize LameJS Encoder (Stereo, Sample Rate, 128kbps)
            mp3Encoder = new lamejs.Mp3Encoder(2, audioCtx.sampleRate, 128);
            audioChunks = [];

            // Create a ScriptProcessor to intercept audio
            processor = audioCtx.createScriptProcessor(4096, 2, 2);
            
            processor.onaudioprocess = (event) => {
                if (!isRecording) return;

                const left = event.inputBuffer.getChannelData(0);
                const right = event.inputBuffer.getChannelData(1);

                // Convert Float32 (-1 to 1) to Int16 for LameJS
                const samplesLeft = new Int16Array(left.length);
                const samplesRight = new Int16Array(right.length);

                for (let i = 0; i < left.length; i++) {
                    samplesLeft[i] = left[i] < 0 ? left[i] * 0x8000 : left[i] * 0x7FFF;
                    samplesRight[i] = right[i] < 0 ? right[i] * 0x8000 : right[i] * 0x7FFF;
                }

                // Encode buffer
                const mp3Data = mp3Encoder.encodeBuffer(samplesLeft, samplesRight);
                if (mp3Data.length > 0) audioChunks.push(mp3Data);

                // Mute output of processor to avoid feedback/doubling volume
                // (Since audioSourceNode is already connected to destination)
                const outputBuffer = event.outputBuffer;
                for (let ch = 0; ch < outputBuffer.numberOfChannels; ch++) {
                    outputBuffer.getChannelData(ch).fill(0);
                }
            };

            // Connect graph
            audioSourceNode.connect(processor);
            processor.connect(audioCtx.destination); // Required for Chrome to fire events

            isRecording = true;
            recordButton.textContent = "Stop Recording";
            recordButton.classList.add("active");
            downloadButton.disabled = true;
        } catch (err) {
            console.error("Error recording audio:", err);
            alert("Could not start recording.");
        }
    }
});

downloadButton.addEventListener('click', () => {
    if (recordingUrl) {
        const a = document.createElement('a');
        a.href = recordingUrl;
        a.download = `recording_${Date.now()}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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
        .then(() => console.log("Service Worker Registered"))
        .catch((err) => console.error("Service Worker Failed:", err));
}

// --- Core Logic ---

let audioCtx;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function loadAudioFile(file) {
    // Stop previous
    audio.pause();
    
    // Create object URL
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    currentFileName = file.name;
    fileNameView.textContent = currentFileName;
    
    // Reset BPM
    bpmView.textContent = "--";

    // Reset state
    audio.onloadedmetadata = () => {
        seekBar.max = audio.duration;
        durationView.textContent = `Duration: ${formatTime(audio.duration)}`;
        loopStart = 0;
        loopEnd = audio.duration;
        isLooping = false;
        loopToggle.textContent = "Loop: OFF";
        loopToggle.classList.remove("active");
        
        // Reset Speed
        audio.playbackRate = 1.0;
        speedBar.value = 1.0;
        speedValue.textContent = "1.00x";

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