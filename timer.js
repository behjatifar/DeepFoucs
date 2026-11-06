/**
 * Timer Engine Module (timer.js)
 * Uses delta-time (Date.now()) instead of simple interval counting
 * to prevent timer drift or freezing when browser tabs are inactive/minimized.
 */

const TimerEngine = (() => {
    let intervalId = null;
    let targetEndTime = null;
    let activeTickCallback = null;
    let activeEndCallback = null;


    // Holds reference to the active AudioContext to allow immediate interruption
    let activeAudioCtx = null;

    /**
     * Immediately stops any ongoing alarm sound and releases audio resources.
     */
    const stopBeep = () => {
        if (activeAudioCtx) {
            activeAudioCtx.close().catch(() => {});
            activeAudioCtx = null;
        }
    };

    // Web Audio API for soft beep notification
const playBeep = () => {
        // Ensure any previous audio session is terminated before starting a new one
        stopBeep();

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        const audioContext = new AudioCtx();
        activeAudioCtx = audioContext;
        
        const duration = 10.0;
        const startTime = audioContext.currentTime;

        // 1. Master Volume Envelope (The Breathing Arc)
        const masterGain = audioContext.createGain();
        masterGain.gain.setValueAtTime(0, startTime);
        masterGain.gain.linearRampToValueAtTime(0.25, startTime + 4.0);
        masterGain.gain.linearRampToValueAtTime(0.08, startTime + 6.0);
        masterGain.gain.linearRampToValueAtTime(0.25, startTime + 9.0);
        masterGain.gain.linearRampToValueAtTime(0, startTime + duration);
        masterGain.connect(audioContext.destination);

        // 2. Crystal / Sci-Fi Bell Frequencies
        const frequencies = [1046.50, 2800.20];

        // 3. Schedule rhythmic pulses
        for (let i = 0; i < duration; i++) {
            [0, 0.2].forEach(pulseOffset => {
                const strikeTime = startTime + i + pulseOffset;
                if (strikeTime >= startTime + duration) return;

                frequencies.forEach((freq, index) => {
                    const osc = audioContext.createOscillator();
                    const strikeGain = audioContext.createGain();

                    osc.type = 'sine';
                    osc.frequency.value = freq;

                    strikeGain.gain.setValueAtTime(0, strikeTime);
                    const maxPulseVolume = 0.3 / (index + 1);
                    strikeGain.gain.linearRampToValueAtTime(maxPulseVolume, strikeTime + 0.02);
                    strikeGain.gain.exponentialRampToValueAtTime(0.001, strikeTime + 0.4);

                    osc.connect(strikeGain);
                    strikeGain.connect(masterGain);

                    osc.start(strikeTime);
                    osc.stop(strikeTime + 0.5);
                });
            });
        }
    };

    // Pure function: Calculate degrees (0-360) for circular progress bar
    const calculateProgress = (timeLeft, totalTime) => {
        return ((totalTime - timeLeft) / totalTime) * 360;
    };

    // Pure function: Format seconds into MM:SS string
    const formatTime = (seconds) => {
        const safeSeconds = Math.max(0, seconds);
        const m = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
        const s = (safeSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // Sync remaining time against real system clock
    const syncWithSystemClock = () => {
        if (!targetEndTime) return;

        const remainingMs = targetEndTime - Date.now();
        const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

        if (activeTickCallback) {
            activeTickCallback(remainingSeconds);
        }

        if (remainingSeconds <= 0) {
            const endCb = activeEndCallback;
            stop();
            playBeep();
            if (endCb) endCb();
        }
    };

    // Start countdown using exact target timestamp
    const start = (initialTimeLeftSeconds, tickCallback, endCallback) => {
        if (intervalId) return;

        targetEndTime = Date.now() + (initialTimeLeftSeconds * 1000);
        activeTickCallback = tickCallback;
        activeEndCallback = endCallback;

        // Run every 500ms for snappy UI updates and accurate drift correction
        intervalId = setInterval(syncWithSystemClock, 500);
    };

    // Stop/Pause countdown
    const stop = () => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        targetEndTime = null;
        activeTickCallback = null;
        activeEndCallback = null;
    };

    // Immediately recalculate time when user returns to the tab
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && intervalId) {
            syncWithSystemClock();
        }
    });

    return { start, stop, formatTime, calculateProgress, playBeep, stopBeep };
})();