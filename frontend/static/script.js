const dropZone = document.getElementById('dropZone');
const consoleSection = document.getElementById('consoleSection');
const consoleOutput = document.getElementById('consoleOutput');
const clearConsoleBtn = document.getElementById('clearConsole');
const fileInput = document.getElementById('fileInput');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const statusMsg = document.getElementById('statusMsg');
const timerMsg = document.getElementById('timerMsg');
const resultsSection = document.getElementById('resultsSection');
const resultsList = document.getElementById('resultsList');

// Advanced UI Elements
const fabMain = document.getElementById('fabMain');
const fabContainer = document.querySelector('.fab-container');
const fabTheme = document.getElementById('fabTheme');
const fabSettings = document.getElementById('fabSettings');
const fabFullscreen = document.getElementById('fabFullscreen');
const fabHelp = document.getElementById('fabHelp');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const exportBtn = document.getElementById('exportBtn');
const toggleTimelineBtn = document.getElementById('toggleTimelineBtn');
const timelineContainer = document.getElementById('timelineContainer');
const timelineCanvas = document.getElementById('timelineCanvas');

// Settings Inputs
const settingSound = document.getElementById('settingSound');
const settingAutoScroll = document.getElementById('settingAutoScroll');
const settingStrength = document.getElementById('settingStrength');
const settingDuplicates = document.getElementById('settingDuplicates');
const settingNotifications = document.getElementById('settingNotifications');

// State
let scanStartTime = null;
let timerInterval = null;
let totalDetections = 0;
let scanDuration = '00:00';
let currentResults = null;
let isTimelineVisible = false;

// Default Settings
const settings = {
    sound: true,
    autoScroll: true,
    showStrength: true,
    groupDuplicates: true,
    notifications: false,
    theme: 'dark'
};

// Load Settings from LocalStorage
function loadSettings() {
    const saved = localStorage.getItem('detectorSettings');
    if (saved) {
        Object.assign(settings, JSON.parse(saved));
        settingSound.checked = settings.sound;
        settingAutoScroll.checked = settings.autoScroll;
        settingStrength.checked = settings.showStrength;
        settingDuplicates.checked = settings.groupDuplicates;
        settingNotifications.checked = settings.notifications && Notification.permission === 'granted';

        if (settings.theme === 'light') {
            document.body.classList.add('light-theme');
        }
    }
}

// Save Settings
function saveSettings() {
    settings.sound = settingSound.checked;
    settings.autoScroll = settingAutoScroll.checked;
    settings.showStrength = settingStrength.checked;
    settings.groupDuplicates = settingDuplicates.checked;
    settings.notifications = settingNotifications.checked;

    // Theme is saved separately when toggled
    settings.theme = document.body.classList.contains('light-theme') ? 'light' : 'dark';

    localStorage.setItem('detectorSettings', JSON.stringify(settings));

    // Refresh results if available to apply new settings
    if (currentResults) {
        displayResults(currentResults);
    }
    showToast('Settings saved', 'success');
}

// Initial Load
loadSettings();

// Event Listeners for Settings
[settingSound, settingAutoScroll, settingStrength, settingDuplicates].forEach(el => {
    el.addEventListener('change', saveSettings);
});

settingNotifications.addEventListener('change', () => {
    if (settingNotifications.checked) {
        if (!("Notification" in window)) {
            showToast("This browser does not support desktop notification", "error");
            settingNotifications.checked = false;
        } else if (Notification.permission !== "granted") {
            Notification.requestPermission().then(permission => {
                if (permission !== "granted") {
                    settingNotifications.checked = false;
                }
                saveSettings();
            });
        }
    } else {
        saveSettings();
    }
});

// FAB Interactions
fabMain.addEventListener('click', () => {
    fabContainer.classList.toggle('active');
    fabMain.classList.toggle('active');
});

// Close FAB when clicking outside
document.addEventListener('click', (e) => {
    if (!fabContainer.contains(e.target)) {
        fabContainer.classList.remove('active');
        fabMain.classList.remove('active');
    }
});

// Theme Toggle
fabTheme.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    settings.theme = isLight ? 'light' : 'dark';
    localStorage.setItem('detectorSettings', JSON.stringify(settings));
    showToast(isLight ? 'Switched to Light Mode' : 'Switched to Dark Mode', 'success');
});

// Settings Modal
fabSettings.addEventListener('click', () => settingsModal.classList.add('active'));
closeSettings.addEventListener('click', () => settingsModal.classList.remove('active'));
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove('active');
});

// Fullscreen Toggle
fabFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

// Help Toast
fabHelp.addEventListener('click', () => {
    showToast('Upload a video to start scanning for credentials', 'info');
});

// Export JSON
exportBtn.addEventListener('click', () => {
    if (!currentResults) {
        showToast('No results to export', 'error');
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentResults, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "scan_results_" + Date.now() + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();

    showToast('Results exported to JSON', 'success');
});

// Toggle Timeline
toggleTimelineBtn.addEventListener('click', () => {
    isTimelineVisible = !isTimelineVisible;
    timelineContainer.style.display = isTimelineVisible ? 'block' : 'none';
    if (isTimelineVisible && currentResults) {
        drawTimeline(currentResults);
    }
});

// Console logging
function logToConsole(message, type = 'normal') {
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    consoleOutput.appendChild(line);

    if (settings.autoScroll) {
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
}

// Sound Notification
function playSound(type = 'success') {
    if (!settings.sound) return;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.2);
    }

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
}

// Utility: Check Password Strength
function checkStrength(password) {
    if (password.length < 8) return { label: 'Weak', class: 'strength-weak' };
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNum = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    const score = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0) + (hasNum ? 1 : 0) + (hasSpecial ? 1 : 0);

    if (score < 3) return { label: 'Medium', class: 'strength-medium' };
    return { label: 'Strong', class: 'strength-strong' };
}

// Stop Scan
const stopScanBtn = document.getElementById('stopScanBtn');
let activeFileId = null;

stopScanBtn.addEventListener('click', async () => {
    if (!activeFileId) return;
    try {
        logToConsole('✋ Stopping scan...', 'stage');
        await fetch(`/cancel/${activeFileId}`, { method: 'POST' });
        stopScanBtn.disabled = true;
        stopScanBtn.innerText = 'Stopping...';
    } catch (e) {
        logToConsole('Error stopping scan: ' + e.message, 'error');
    }
});

// Clear console
clearConsoleBtn.addEventListener('click', () => {
    consoleOutput.innerHTML = '<div class="console-line">Console cleared.</div>';
    showToast('Console cleared', 'success');
});

// File upload handlers
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        uploadFile(e.target.files[0]);
    }
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#6366f1';
    dropZone.style.transform = 'scale(1.02)';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    dropZone.style.transform = 'scale(1)';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    dropZone.style.transform = 'scale(1)';
    if (e.dataTransfer.files.length > 0) {
        uploadFile(e.dataTransfer.files[0]);
    }
});

async function uploadFile(file) {
    progressContainer.style.display = 'block';
    consoleSection.style.display = 'block';
    resultsSection.style.display = 'none';
    progressBar.style.width = '10%';
    statusMsg.innerText = 'Uploading video...';
    timerMsg.innerText = '00:00';

    // Reset stop button
    stopScanBtn.style.display = 'inline-block';
    stopScanBtn.disabled = false;
    stopScanBtn.innerText = 'STOP';

    // Reset stats
    totalDetections = 0;
    scanDuration = '00:00';
    currentResults = null;

    consoleOutput.innerHTML = '';
    logToConsole('📤 Starting upload: ' + file.name, 'stage');
    logToConsole('File size: ' + (file.size / 1024 / 1024).toFixed(2) + ' MB');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const { id } = await response.json();
        activeFileId = id;
        logToConsole('✅ Upload complete! Task ID: ' + id, 'success');
        logToConsole('🚀 Starting analysis...', 'stage');
        playSound('success');

        // Start timer
        startScanTimer();
        pollStatus(id);
    } catch (err) {
        statusMsg.innerText = 'Error: ' + err.message;
        progressBar.style.background = '#ef4444';
        logToConsole('❌ Error: ' + err.message, 'error');
        stopScanTimer();
        showToast('Upload failed: ' + err.message, 'error');
        playSound('error');
    }
}

function startScanTimer() {
    scanStartTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - scanStartTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        scanDuration = `${mins}:${secs}`;
        timerMsg.innerText = scanDuration;
    }, 1000);
}


function stopScanTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

// Helper: Send Desktop Notification
function sendDesktopNotification(title, body) {
    if (settings.notifications && Notification.permission === "granted") {
        try {
            new Notification(title, { body: body });
        } catch (e) {
            console.error("Notification error:", e);
        }
    }
}

async function pollStatus(id) {
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`/status/${id}`);
            const data = await response.json();

            if (data.status === 'complete') {
                clearInterval(interval);
                stopScanTimer();
                stopScanBtn.style.display = 'none';
                progressBar.style.width = '100%';
                statusMsg.innerText = '✅ Analysis complete!';
                logToConsole('✅ Analysis complete!', 'success');
                if (data.result && data.result.detections) {
                    totalDetections = data.result.detections.length;
                    logToConsole(`Found ${totalDetections} detection(s)`, 'success');
                    playSound('success');
                    sendDesktopNotification('Scan Complete', `Found ${totalDetections} credentials.`);
                } else {
                    sendDesktopNotification('Scan Complete', 'No credentials found.');
                }
                displayResults(data.result);
                showToast('Analysis complete!', 'success');
            } else if (data.status === 'error') {
                clearInterval(interval);
                stopScanTimer();
                stopScanBtn.style.display = 'none';
                statusMsg.innerText = '❌ Error: ' + data.message;
                progressBar.style.background = '#ef4444';
                logToConsole('❌ Error: ' + data.message, 'error');
                showToast('Analysis failed: ' + data.message, 'error');
                playSound('error');
                sendDesktopNotification('Scan Error', data.message);
            } else if (data.status === 'processing') {
                // Update progress bar
                progressBar.style.width = data.percent + '%';

                // Update status message with stage info
                const stageEmoji = {
                    'upload': '📤',
                    'extraction': '🎬',
                    'filtering': '🔍',
                    'ocr': '🤖',
                    'complete': '✅'
                };
                const emoji = stageEmoji[data.stage] || '⚙️';
                statusMsg.innerText = `${emoji} ${data.message}`;

                // Log to console
                if (data.stage && (!window.lastLoggedStage || window.lastLoggedStage !== data.stage)) {
                    logToConsole(`${emoji} ${data.message}`, 'stage');
                    window.lastLoggedStage = data.stage;
                }

                // Show debug info if available
                if (data.total_frames) {
                    statusMsg.innerText += ` (${data.total_frames} frames)`;
                    if (!window.loggedFrameCount) {
                        logToConsole(`Total frames extracted: ${data.total_frames}`);
                        window.loggedFrameCount = true;
                    }
                } else if (data.candidates) {
                    statusMsg.innerText += ` (${data.candidates} candidates)`;
                    if (!window.loggedCandidates) {
                        logToConsole(`OCR candidates selected: ${data.candidates}`);
                        window.loggedCandidates = true;
                    }
                }

                // NEW: Real-time results display
                if (data.current_detections && data.current_detections.length > 0) {
                    // Check if new detections found to avoid constant re-rendering
                    if (!window.lastDetectionCount || data.current_detections.length > window.lastDetectionCount) {
                        // Create a result object wrapper that mimics the final structure
                        const interimResult = {
                            file: 'Scanning...',
                            fps: 0,
                            detections: data.current_detections
                        };
                        displayResults(interimResult);
                        window.lastDetectionCount = data.current_detections.length;
                        playSound('success');
                        showToast(`Found detection ${window.lastDetectionCount}!`, 'success');
                        sendDesktopNotification('Credential Detection!', `Found detection #${window.lastDetectionCount}`);
                    }
                }
            }
        } catch (err) {
            clearInterval(interval);
            stopScanTimer();
            statusMsg.innerText = '❌ Connection lost.';
            logToConsole('❌ Connection lost while polling status.', 'error');
            showToast('Connection lost', 'error');
            playSound('error');
        }
    }, 500); // Poll every 500ms for smooth updates
}

function displayResults(result) {
    resultsSection.style.display = 'block';
    resultsList.innerHTML = '';

    // Store for export/timeline
    currentResults = result;

    // Add stats section
    const statsSection = createStatsSection();
    resultsList.appendChild(statsSection);

    if (!result.detections || result.detections.length === 0) {
        const noResultsMsg = document.createElement('p');
        noResultsMsg.style.cssText = 'grid-column: 1/-1; text-align: center; color: #10b981; font-size: 1.2rem; padding: 2rem;';
        noResultsMsg.innerHTML = '✅ No sensitive credentials detected in this video.';
        resultsList.appendChild(noResultsMsg);
        logToConsole('No credentials detected', 'success');
        return;
    }

    logToConsole(`----- Detection Report -----`, 'stage');

    // Process detections (filter duplicates if enabled)
    let detections = result.detections;
    if (settings.groupDuplicates) {
        // Simple deduplication based on frame proximity and values
        // Implementation note: Fully robust deduplication would be complex, 
        // here we rely on the backend output or simple display logic.
        // For now, we'll just display all but could add grouping logic here.
    }

    detections.forEach((det, index) => {
        const item = document.createElement('div');
        item.className = 'result-item';

        const userList = det.user && det.user.length > 0 ? det.user.join(', ') : 'N/A';
        const passList = det.pass && det.pass.length > 0 ? det.pass.join(', ') : 'N/A';

        // Extracted actual values
        const userValues = det.user_values && det.user_values.length > 0 ? det.user_values.join(', ') : '';
        const passValues = det.pass_values && det.pass_values.length > 0 ? det.pass_values.join(', ') : '';

        // Password strength analysis
        let strengthHtml = '';
        if (settings.showStrength && passValues) {
            const strength = checkStrength(passValues);
            strengthHtml = `<span style="font-size: 0.75rem; margin-left: 8px; padding: 2px 6px; border-radius: 4px; border: 1px solid currentColor;" class="${strength.class}">${strength.label}</span>`;
        }

        // Log to console (only if not re-displaying from settings change)
        // Note: we might want to avoid re-logging on setting changes, strictly speaking.

        item.innerHTML = `
            ${det.image ? `<img src="${det.image}" alt="Frame ${det.frame}" 
                style="width: 100%; border-radius: 12px; margin-bottom: 12px; border: 2px solid rgba(99, 102, 241, 0.3);" 
                onclick="openLightbox('${det.image}')">` : ''}
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <span class="ts">⏰ ${det.timestamp}</span>
                <span style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Frame ${det.frame}</span>
            </div>
            <div class="match" style="margin-bottom: 8px;">
                <div style="color: #60a5fa; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
                    <span>👤 User: <span style="color: #fff;">${userList}</span></span>
                </div>
                <div style="color: #f87171; display: flex; align-items: center; justify-content: space-between;">
                    <span>🔐 Pass: <span style="color: #fff;">${passList}</span> ${strengthHtml}</span>
                </div>
            </div>
            ${userValues || passValues ? `
                <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 12px; margin-top: 12px;">
                    <div style="font-size: 0.75rem; color: #10b981; margin-bottom: 6px; font-weight: 600;">✓ Extracted Values</div>
                    ${userValues ? `
                        <div style="color: #60a5fa; font-size: 0.85rem; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
                            <span>Username: <span style="color: #fff; font-weight: 600;">${userValues}</span></span>
                            <button class="copy-btn" onclick="copyToClipboard('${userValues.replace(/'/g, "\\'")}', 'Username')">📋 Copy</button>
                        </div>
                    ` : ''}
                    ${passValues ? `
                        <div style="color: #f87171; font-size: 0.85rem; display: flex; align-items: center; justify-content: space-between;">
                            <span>Password: <span style="color: #fff; font-weight: 600;">${passValues}</span></span>
                            <button class="copy-btn" onclick="copyToClipboard('${passValues.replace(/'/g, "\\'")}', 'Password')">📋 Copy</button>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        `;
        resultsList.appendChild(item);
    });

    // Draw timeline if visible
    if (isTimelineVisible) {
        drawTimeline(result);
    }
}

// Draw Timeline
function drawTimeline(result) {
    if (!result || !result.detections || result.detections.length === 0) return;

    // Resize canvas
    timelineCanvas.width = timelineContainer.clientWidth;
    timelineCanvas.height = timelineContainer.clientHeight;

    const ctx = timelineCanvas.getContext('2d');
    const width = timelineCanvas.width;
    const height = timelineCanvas.height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw baseline
    ctx.beginPath();
    ctx.moveTo(20, height / 2);
    ctx.lineTo(width - 20, height / 2);
    ctx.strokeStyle = '#rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Get time range (approximate from frames if time parsing is hard, or assume relative)
    const detections = result.detections;
    const lastFrame = detections[detections.length - 1].frame;
    const firstFrame = detections[0].frame;
    const range = Math.max(lastFrame - firstFrame, 100); // Avoid division by zero

    // Draw points
    detections.forEach(det => {
        const x = 20 + ((det.frame - firstFrame) / range) * (width - 40);
        const y = height / 2;

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#6366f1';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw frame label above
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px Arial';
        ctx.fillText(det.timestamp, x - 15, y - 15);
    });
}

// Create stats section
function createStatsSection() {
    const statsDiv = document.createElement('div');
    statsDiv.className = 'stats-section';
    statsDiv.style.gridColumn = '1 / -1';

    statsDiv.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${totalDetections}</div>
            <div class="stat-label">Total Detections</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${scanDuration}</div>
            <div class="stat-label">Scan Duration</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${totalDetections > 0 ? '⚠️' : '✅'}</div>
            <div class="stat-label">Security Status</div>
        </div>
    `;

    return statsDiv;
}

// Copy to clipboard function
function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`${label} copied to clipboard!`, 'success');
        logToConsole(`📋 Copied ${label}: ${text}`, 'success');
    }).catch(err => {
        showToast('Failed to copy to clipboard', 'error');
        logToConsole(`❌ Failed to copy: ${err.message}`, 'error');
    });
}

// Toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    if (type === 'error') {
        toast.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    } else if (type === 'success') {
        toast.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    } else {
        toast.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Image lightbox
function openLightbox(imageSrc) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');

    lightboxImg.src = imageSrc;
    lightbox.classList.add('active');

    logToConsole(`🖼️ Opened image preview: ${imageSrc}`, 'stage');
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Escape to close lightbox
    if (e.key === 'Escape') {
        closeLightbox();
        settingsModal.classList.remove('active');
        fabContainer.classList.remove('active');
        fabMain.classList.remove('active');
    }

    // Ctrl+K to clear console
    if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        clearConsoleBtn.click();
    }
});

// Smooth scroll to results when they appear
function scrollToResults() {
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Initialize
logToConsole('🚀 System initialized and ready', 'success');
logToConsole('💡 Tip: Press Ctrl+K to clear console', 'stage');
