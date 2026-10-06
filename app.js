/**
 * Main Application Logic (app.js)
 * Modular, DRY, and Functional architecture binding State, UI, Storage, Exporter, and Timer.
 * Supports Hybrid Folders (Filter Pills + Collapsible Folder Items with Sub-tasks),
 * Inline Renaming, Time Allocation, and Real-Time Minute Tracking.
 */

// --- 1. Initial State & Configuration Rules ---
const STORAGE_KEY = 'deepFocusState';

const DEFAULT_STATE = {
    // works items can be standalone tasks OR folders (isFolder: true or subtasks.length > 0)
    // { id, text, completed, completedAt, isSpoiler, allocatedMinutes, spentMinutes, isFolder, isCollapsed, subtasks: [] }
    works: [],
    thoughts: [], // { id, text, isSpoiler }
    trash: [],
    activeTaskId: null, // Can be a top-level work ID or a subtask ID
    activeFolderFilter: 'all', // 'all' or folder item ID
    stats: {
        pomodorosCompleted: 0,
        totalFocusedMinutes: 0,
        lastDate: new Date().toDateString()
    },
    timerSettings: { workTime: 25, restTime: 5 },
    spoilerAll: { works: false, thoughts: false }
};

// Configurable rules for the initial 10-second session preparation overlay
const SESSION_PREP_RULES = {
    durationSeconds: 10,
    steps: [
        '📵 برنامه‌های شبکه اجتماعی (<strong>Close Social Media Apps</strong>) و تب‌های اضافی که حواستان را پرت می‌کنند را ببندید.',
        '🌬️ چند نفس عمیق با بینی بکشید.',
        '💧 مقداری آب همراه خود در طول سشن داشته باشید و بنوشید.'
    ],
    closingWish: '✨ امیدواریم سشن تمرکز عمیق و خوبی را تجربه کنید.'
};

let appState = StorageHandler.load(STORAGE_KEY, DEFAULT_STATE);

// Backward-compatible state normalization
if (!Array.isArray(appState.works)) appState.works = [];
if (!Array.isArray(appState.thoughts)) appState.thoughts = [];
if (!Array.isArray(appState.trash)) appState.trash = [];
if (typeof appState.activeTaskId === 'undefined') appState.activeTaskId = null;
if (typeof appState.activeFolderFilter !== 'string') appState.activeFolderFilter = 'all';
if (!appState.stats) {
    appState.stats = { pomodorosCompleted: 0, totalFocusedMinutes: 0, lastDate: new Date().toDateString() };
}
if (typeof appState.stats.totalFocusedMinutes !== 'number') {
    appState.stats.totalFocusedMinutes = 0;
}
if (!appState.timerSettings) appState.timerSettings = { workTime: 25, restTime: 5 };
if (!appState.spoilerAll) appState.spoilerAll = { works: false, thoughts: false };

// Normalize existing work items & their subtasks
appState.works = appState.works.map(item => {
    const subtasks = Array.isArray(item.subtasks)
        ? item.subtasks.map(sub => ({
              ...sub,
              allocatedMinutes: typeof sub.allocatedMinutes === 'number' ? sub.allocatedMinutes : 0,
              spentMinutes: typeof sub.spentMinutes === 'number' ? sub.spentMinutes : 0,
              completed: Boolean(sub.completed),
              isSpoiler: Boolean(sub.isSpoiler)
          }))
        : [];
    return {
        ...item,
        allocatedMinutes: typeof item.allocatedMinutes === 'number' ? item.allocatedMinutes : 0,
        spentMinutes: typeof item.spentMinutes === 'number' ? item.spentMinutes : 0,
        isFolder: Boolean(item.isFolder || subtasks.length > 0),
        isCollapsed: Boolean(item.isCollapsed),
        subtasks
    };
});

// Timer operational state
let currentTimer = {
    mode: 'work',
    timeLeft: appState.timerSettings.workTime * 60,
    totalTime: appState.timerSettings.workTime * 60,
    isRunning: false,
    lastRecordedRemainingSeconds: appState.timerSettings.workTime * 60
};

// Transient UI states
let dragState = { groupKey: null, draggedId: null };
let editingState = { groupKey: null, itemId: null, parentId: null };
let openSubtaskFormForId = null; // Folder/Task ID currently showing the quick "+ subtask" form
let prepIntervalId = null;

// --- 2. DOM Elements & Modular Collection Rules ---
const DOM = {
    body: document.body,
    timeDisplay: document.getElementById('time-display'),
    modeDisplay: document.getElementById('mode-display'),
    dateShamsi: document.getElementById('date-shamsi'),
    dateGregorian: document.getElementById('date-gregorian'),
    timerCircle: document.getElementById('timer-circle'),
    btnToggle: document.getElementById('btn-toggle'),
    btnReset: document.getElementById('btn-reset'),
    statsCount: document.getElementById('stats-count'),
    inputWorkTime: document.getElementById('input-work-time'),
    inputRestTime: document.getElementById('input-rest-time'),
    spoilerGroupBtns: document.querySelectorAll('[data-spoiler-group]'),

    // Active Task Banner DOM Elements
    activeTaskBanner: document.getElementById('active-task-banner'),
    activeTaskName: document.getElementById('active-task-name'),
    activeTaskTime: document.getElementById('active-task-time'),
    btnClearActiveTask: document.getElementById('btn-clear-active-task'),

    // Folder Filter Bar & New Folder Form
    folderTabsBar: document.getElementById('folder-tabs-bar'),
    newFolderForm: document.getElementById('new-folder-form'),
    newFolderInput: document.getElementById('new-folder-input'),
    btnCancelFolder: document.getElementById('btn-cancel-folder'),

    // Exporter Button
    btnExportReport: document.getElementById('btn-export-report'),

    // Recycle Bin DOM Elements
    btnOpenTrash: document.getElementById('btn-open-trash'),
    btnCloseTrash: document.getElementById('btn-close-trash'),
    btnEmptyTrash: document.getElementById('btn-empty-trash'),
    trashModal: document.getElementById('trash-modal'),
    trashList: document.getElementById('trash-list'),
    trashCount: document.getElementById('trash-count'),

    // 10-Second Session Preparation Overlay Elements
    prepOverlay: document.getElementById('prep-overlay'),
    prepCountdown: document.getElementById('prep-countdown'),
    prepMessages: document.getElementById('prep-messages'),
    prepFooter: document.getElementById('prep-footer'),
    prepProgressBar: document.getElementById('prep-progress-bar'),
    btnSkipPrep: document.getElementById('btn-skip-prep'),

    // Collection-specific DOM references and rules
    collections: {
        works: {
            listEl: document.getElementById('works-list'),
            formEl: document.getElementById('work-form'),
            inputEl: document.getElementById('work-input'),
            timeInputEl: document.getElementById('work-time-input'),
            hasCheckbox: true,
            hasTimeAllocation: true,
            canFocus: true,
            canConvert: false,
            isSortable: true,
            autoSortCompleted: true
        },
        thoughts: {
            listEl: document.getElementById('thoughts-list'),
            formEl: document.getElementById('thought-form'),
            inputEl: document.getElementById('thought-input'),
            timeInputEl: null,
            hasCheckbox: false,
            hasTimeAllocation: false,
            canFocus: false,
            canConvert: true,
            isSortable: true,
            autoSortCompleted: false
        }
    }
};

// --- 3. Pure Functional Helpers (DRY State Transformers) ---

const createId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

const escapeHtml = (str = '') =>
    String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const getFormattedDates = (date = new Date()) => {
    const shamsi = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(date);

    const gregorian = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(date);

    return { shamsi, gregorian };
};

// Determine if a work item acts as a Folder
const isFolderItem = (item) =>
    Boolean(item && (item.isFolder || (Array.isArray(item.subtasks) && item.subtasks.length > 0)));

// Pure helper: Find a task or subtask by ID across works list (returns { task, parentFolder })
const findWorkOrSubtaskById = (works, targetId) => {
    if (!targetId) return null;
    for (const item of works) {
        if (item.id === targetId) return { task: item, parentFolder: null };
        if (Array.isArray(item.subtasks)) {
            const sub = item.subtasks.find(s => s.id === targetId);
            if (sub) return { task: sub, parentFolder: item };
        }
    }
    return null;
};

// Pure helper: Calculate effective allocated & spent minutes (rolls up subtasks if folder has subtasks)
const getEffectiveTimeTotals = (item) => {
    if (isFolderItem(item) && Array.isArray(item.subtasks) && item.subtasks.length > 0) {
        const subAllocated = item.subtasks.reduce((sum, s) => sum + (Number(s.allocatedMinutes) || 0), 0);
        const subSpent = item.subtasks.reduce((sum, s) => sum + (Number(s.spentMinutes) || 0), 0);
        return {
            allocated: subAllocated > 0 ? subAllocated : (Number(item.allocatedMinutes) || 0),
            spent: subSpent + (Number(item.spentMinutes) || 0)
        };
    }
    return {
        allocated: Math.max(0, Number(item.allocatedMinutes) || 0),
        spent: Math.max(0, Number(item.spentMinutes) || 0)
    };
};

// Pure helper to calculate task or folder progress percentage and formatted labels
const calculateTaskTimeMetrics = (item) => {
    const { allocated, spent } = getEffectiveTimeTotals(item);
    const hasTimeData = allocated > 0 || spent > 0;

    if (!hasTimeData) {
        return { hasTimeData: false, percentage: 0, badgeText: '', remainingText: '', isOverOrDone: false };
    }

    if (allocated > 0) {
        const percentage = Math.min(100, Math.round((spent / allocated) * 100));
        const remaining = Math.max(0, allocated - spent);
        const badgeText = `⏳ ${spent}m / ${allocated}m`;
        const remainingText = remaining > 0 ? `${remaining}m left` : 'Goal reached ✓';
        return {
            hasTimeData: true,
            percentage,
            badgeText,
            remainingText,
            isOverOrDone: spent >= allocated || Boolean(item.completed)
        };
    }

    return {
        hasTimeData: true,
        percentage: 100,
        badgeText: `⏱️ ${spent}m spent`,
        remainingText: 'Tracked',
        isOverOrDone: Boolean(item.completed)
    };
};

// Toggle a boolean property on a top-level or nested subtask item immutably
const toggleItemProp = (list, id, prop, parentId = null) =>
    list.map(item => {
        if (parentId && item.id === parentId && Array.isArray(item.subtasks)) {
            return {
                ...item,
                subtasks: item.subtasks.map(sub => (sub.id === id ? { ...sub, [prop]: !sub[prop] } : sub))
            };
        }
        return item.id === id ? { ...item, [prop]: !item[prop] } : item;
    });

// Pure function to update item or subtask text & allocatedMinutes immutably
const updateItemDetails = (list, id, newText, newAllocatedMinutes = null, parentId = null) =>
    list.map(item => {
        if (parentId && item.id === parentId && Array.isArray(item.subtasks)) {
            return {
                ...item,
                subtasks: item.subtasks.map(sub => {
                    if (sub.id !== id) return sub;
                    const updatedSub = { ...sub, text: newText };
                    if (newAllocatedMinutes !== null) {
                        updatedSub.allocatedMinutes = Math.max(0, parseInt(newAllocatedMinutes, 10) || 0);
                    }
                    return updatedSub;
                })
            };
        }
        if (item.id !== id) return item;
        const updated = { ...item, text: newText };
        if (newAllocatedMinutes !== null) {
            updated.allocatedMinutes = Math.max(0, parseInt(newAllocatedMinutes, 10) || 0);
        }
        return updated;
    });

// Pure function to increment spentMinutes on an active task or subtask immutably
// Pure function to increment spentMinutes and auto-complete task/subtask when allocated time is reached
const incrementTaskSpentMinutes = (list, targetId, minutesToAdd) =>
    list.map(item => {
        const now = Date.now();

        // 1. Direct match on a top-level task or folder
        if (item.id === targetId) {
            const nextSpent = (Number(item.spentMinutes) || 0) + minutesToAdd;
            const allocated = Number(item.allocatedMinutes) || 0;
            const reachedGoal = allocated > 0 && nextSpent >= allocated;
            const nextCompleted = Boolean(item.completed || reachedGoal);

            return {
                ...item,
                spentMinutes: nextSpent,
                completed: nextCompleted,
                completedAt: nextCompleted ? (item.completedAt || now) : null
            };
        }

        // 2. Match on a subtask inside a folder
        if (Array.isArray(item.subtasks) && item.subtasks.some(s => s.id === targetId)) {
            const updatedSubtasks = item.subtasks.map(sub => {
                if (sub.id !== targetId) return sub;
                const nextSpent = (Number(sub.spentMinutes) || 0) + minutesToAdd;
                const allocated = Number(sub.allocatedMinutes) || 0;
                const reachedGoal = allocated > 0 && nextSpent >= allocated;
                const nextCompleted = Boolean(sub.completed || reachedGoal);

                return {
                    ...sub,
                    spentMinutes: nextSpent,
                    completed: nextCompleted,
                    completedAt: nextCompleted ? (sub.completedAt || now) : null
                };
            });

            // Auto-complete parent folder if all its subtasks are now completed
            const allSubsDone = updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.completed);
            return {
                ...item,
                subtasks: updatedSubtasks,
                completed: allSubsDone,
                completedAt: allSubsDone ? (item.completedAt || now) : null
            };
        }

        return item;
    });

// Toggle completion state on a top-level task/folder or a subtask (with automatic folder sync)
const toggleTaskCompletion = (list, id, parentId = null) =>
    list.map(item => {
        // Case 1: Toggling a subtask inside a folder
        if (parentId && item.id === parentId && Array.isArray(item.subtasks)) {
            const updatedSubtasks = item.subtasks.map(sub => {
                if (sub.id !== id) return sub;
                const nextDone = !sub.completed;
                return { ...sub, completed: nextDone, completedAt: nextDone ? Date.now() : null };
            });
            const allSubsDone = updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.completed);
            return {
                ...item,
                subtasks: updatedSubtasks,
                completed: allSubsDone,
                completedAt: allSubsDone ? (item.completedAt || Date.now()) : null
            };
        }

        // Case 2: Toggling a top-level task or folder
        if (item.id !== id) return item;
        const nextCompleted = !item.completed;
        const now = Date.now();
        const syncedSubtasks = Array.isArray(item.subtasks)
            ? item.subtasks.map(sub => ({
                  ...sub,
                  completed: nextCompleted,
                  completedAt: nextCompleted ? (sub.completedAt || now) : null
              }))
            : [];
        return {
            ...item,
            completed: nextCompleted,
            completedAt: nextCompleted ? now : null,
            subtasks: syncedSubtasks
        };
    });

// Pure sorting rule: Undone tasks on top, earliest completed at the very bottom
const sortByCompletionRule = (list) =>
    [...list].sort((a, b) => {
        const aDone = Boolean(a.completed);
        const bDone = Boolean(b.completed);

        if (aDone !== bDone) {
            return aDone ? 1 : -1;
        }
        if (aDone && bDone) {
            return (b.completedAt || 0) - (a.completedAt || 0);
        }
        return 0;
    });

const applyCollectionRules = (groupKey, list) => {
    const config = DOM.collections[groupKey];
    return config && config.autoSortCompleted ? sortByCompletionRule(list) : list;
};

const setAllItemsProp = (list, prop, value) =>
    list.map(item => ({
        ...item,
        [prop]: value,
        ...(Array.isArray(item.subtasks)
            ? { subtasks: item.subtasks.map(sub => ({ ...sub, [prop]: value })) }
            : {})
    }));

const removeItemById = (list, id) =>
    list.filter(item => item.id !== id);

const archiveItemToTrash = (sourceList, trashList, groupKey, id) => {
    const item = sourceList.find(i => i.id === id);
    if (!item) return { nextSource: sourceList, nextTrash: trashList };

    const archivedEntry = {
        ...item,
        origin: groupKey,
        deletedAt: Date.now()
    };

    return {
        nextSource: removeItemById(sourceList, id),
        nextTrash: [archivedEntry, ...trashList]
    };
};

const reorderListById = (list, draggedId, targetId, insertAfter = false) => {
    if (draggedId === targetId) return list;
    const draggedIndex = list.findIndex(item => item.id === draggedId);
    const targetIndex = list.findIndex(item => item.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return list;

    const updated = [...list];
    const [movedItem] = updated.splice(draggedIndex, 1);
    const newTargetIndex = updated.findIndex(item => item.id === targetId);
    const insertionIndex = insertAfter ? newTargetIndex + 1 : newTargetIndex;

    updated.splice(insertionIndex, 0, movedItem);
    return updated;
};

const isItemBlurred = (item, groupSpoilerActive) =>
    Boolean(item.isSpoiler || groupSpoilerActive);

const persistState = () => StorageHandler.save(STORAGE_KEY, appState);

// --- 4. Timer, Real-Time Task Sync, Preparation Overlay & Stats Logic ---

const renderDates = () => {
    const { shamsi, gregorian } = getFormattedDates();
    if (DOM.dateShamsi) DOM.dateShamsi.textContent = shamsi;
    if (DOM.dateGregorian) DOM.dateGregorian.textContent = gregorian;
};

const checkDailyStats = () => {
    const today = new Date().toDateString();
    if (appState.stats.lastDate !== today) {
        appState.stats.pomodorosCompleted = 0;
        appState.stats.totalFocusedMinutes = 0;
        appState.stats.lastDate = today;
        persistState();
    }
    if (DOM.statsCount) DOM.statsCount.textContent = appState.stats.pomodorosCompleted;
    renderDates();
};

const renderActiveTaskBanner = () => {
    if (!DOM.activeTaskBanner || !DOM.activeTaskName) return;

    const match = findWorkOrSubtaskById(appState.works, appState.activeTaskId);
    if (!match) {
        if (appState.activeTaskId !== null) {
            appState.activeTaskId = null;
            persistState();
        }
        DOM.activeTaskBanner.classList.remove('has-active');
        DOM.activeTaskName.textContent = 'No task selected (Click 🎯 on a task)';
        DOM.activeTaskName.classList.remove('spoiler-text');
        if (DOM.activeTaskTime) DOM.activeTaskTime.classList.add('hidden');
        if (DOM.btnClearActiveTask) DOM.btnClearActiveTask.classList.add('hidden');
        return;
    }

    const { task, parentFolder } = match;
    const blurred = isItemBlurred(task, appState.spoilerAll.works) || (parentFolder && isItemBlurred(parentFolder, appState.spoilerAll.works));
    const displayTitle = parentFolder ? `📁 ${parentFolder.text} › ${task.text}` : task.text;

    DOM.activeTaskBanner.classList.add('has-active');
    DOM.activeTaskName.textContent = displayTitle;
    DOM.activeTaskName.classList.toggle('spoiler-text', blurred);

    if (DOM.activeTaskTime) {
        const metrics = calculateTaskTimeMetrics(task);
        DOM.activeTaskTime.textContent = metrics.hasTimeData ? metrics.badgeText : '0m spent';
        DOM.activeTaskTime.classList.remove('hidden');
    }

    if (DOM.btnClearActiveTask) {
        DOM.btnClearActiveTask.classList.remove('hidden');
    }
};

// Record real-time elapsed work minutes onto the active task & auto-complete if goal reached
const syncRealTimeElapsedMinutes = (currentRemainingSeconds) => {
    if (currentTimer.mode !== 'work') return;

    const elapsedSinceLastRecord = currentTimer.lastRecordedRemainingSeconds - currentRemainingSeconds;
    if (elapsedSinceLastRecord >= 60) {
        const newlyCompletedMinutes = Math.floor(elapsedSinceLastRecord / 60);
        currentTimer.lastRecordedRemainingSeconds -= newlyCompletedMinutes * 60;

        appState.stats.totalFocusedMinutes = (appState.stats.totalFocusedMinutes || 0) + newlyCompletedMinutes;

        if (appState.activeTaskId) {
            const updatedWorks = incrementTaskSpentMinutes(appState.works, appState.activeTaskId, newlyCompletedMinutes);
            appState.works = applyCollectionRules('works', updatedWorks);
        }

        persistState();
        renderCollection('works');
        renderActiveTaskBanner();
    }
};

const stopSessionPrep = () => {
    if (prepIntervalId) {
        clearInterval(prepIntervalId);
        prepIntervalId = null;
    }
    if (DOM.prepOverlay) DOM.prepOverlay.classList.add('hidden');
};

const startSessionPrep = () => {
    if (!DOM.prepOverlay) return;
    stopSessionPrep();

    let remaining = SESSION_PREP_RULES.durationSeconds;
    if (DOM.prepMessages) {
        DOM.prepMessages.innerHTML = SESSION_PREP_RULES.steps.map(step => `<li>${step}</li>`).join('');
    }
    if (DOM.prepFooter) DOM.prepFooter.textContent = SESSION_PREP_RULES.closingWish;
    if (DOM.prepCountdown) DOM.prepCountdown.textContent = remaining;
    if (DOM.prepProgressBar) DOM.prepProgressBar.style.width = '100%';

    DOM.prepOverlay.classList.remove('hidden');

    prepIntervalId = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            stopSessionPrep();
        } else {
            if (DOM.prepCountdown) DOM.prepCountdown.textContent = remaining;
            if (DOM.prepProgressBar) {
                const percentage = (remaining / SESSION_PREP_RULES.durationSeconds) * 100;
                DOM.prepProgressBar.style.width = `${percentage}%`;
            }
        }
    }, 1000);
};

const updateTimerUI = () => {
    const formatted = TimerEngine.formatTime(currentTimer.timeLeft);
    DOM.timeDisplay.textContent = formatted;
    const degrees = TimerEngine.calculateProgress(currentTimer.timeLeft, currentTimer.totalTime);
    const color = currentTimer.mode === 'work' ? 'var(--accent-blue)' : 'var(--accent-purple)';

    DOM.timerCircle.style.background = `conic-gradient(${color} ${degrees}deg, rgba(255,255,255,0.05) ${degrees}deg)`;
    DOM.modeDisplay.textContent = currentTimer.mode === 'work' ? 'Work Mode' : 'Rest Mode';
    DOM.btnToggle.textContent = currentTimer.isRunning ? 'Pause' : 'Start';
    DOM.body.classList.toggle('rest-mode', currentTimer.mode === 'rest');

    document.title = currentTimer.isRunning
        ? `(${formatted}) ${currentTimer.mode === 'work' ? 'Work' : 'Rest'} - Deep Focus`
        : 'Deep Focus Dashboard';
};

const handleTick = (remainingSeconds) => {
    currentTimer.timeLeft = remainingSeconds;
    syncRealTimeElapsedMinutes(remainingSeconds);
    updateTimerUI();
};

const handleTimerEnd = () => {
    stopSessionPrep();
    syncRealTimeElapsedMinutes(0);
    currentTimer.isRunning = false;

    if (currentTimer.mode === 'work') {
        appState.stats.pomodorosCompleted += 1;
        persistState();
        checkDailyStats();
        currentTimer.mode = 'rest';
        currentTimer.totalTime = appState.timerSettings.restTime * 60;
    } else {
        currentTimer.mode = 'work';
        currentTimer.totalTime = appState.timerSettings.workTime * 60;
    }

    currentTimer.timeLeft = currentTimer.totalTime;
    currentTimer.lastRecordedRemainingSeconds = currentTimer.totalTime;
    updateTimerUI();
};

// --- 5. Drag & Drop Event Handlers ---

const attachDragEvents = (li, groupKey, itemId) => {
    if (editingState.groupKey === groupKey && editingState.itemId === itemId) {
        li.setAttribute('draggable', 'false');
        return;
    }

    li.setAttribute('draggable', 'true');
    li.dataset.id = itemId;

    li.addEventListener('dragstart', (e) => {
        dragState = { groupKey, draggedId: itemId };
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => li.classList.add('dragging'), 0);
    });

    li.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragState.groupKey !== groupKey || dragState.draggedId === itemId) return;

        const rect = li.getBoundingClientRect();
        const isAfter = (e.clientY - rect.top) > (rect.height / 2);

        li.classList.toggle('drag-over-bottom', isAfter);
        li.classList.toggle('drag-over-top', !isAfter);
    });

    li.addEventListener('dragleave', () => {
        li.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over-top', 'drag-over-bottom');
        if (dragState.groupKey !== groupKey || dragState.draggedId === itemId) return;

        const rect = li.getBoundingClientRect();
        const insertAfter = (e.clientY - rect.top) > (rect.height / 2);

        const reordered = reorderListById(appState[groupKey], dragState.draggedId, itemId, insertAfter);
        appState[groupKey] = applyCollectionRules(groupKey, reordered);
        persistState();
        renderCollection(groupKey);
    });

    li.addEventListener('dragend', () => {
        li.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
        dragState = { groupKey: null, draggedId: null };
    });
};

// --- 6. Folder Filter Bar & Unified Collection Renderers ---

const renderFolderTabsBar = () => {
    if (!DOM.folderTabsBar) return;

    const folders = appState.works.filter(isFolderItem);
    // Reset filter to 'all' if active folder no longer exists
    if (appState.activeFolderFilter !== 'all' && !folders.some(f => f.id === appState.activeFolderFilter)) {
        appState.activeFolderFilter = 'all';
    }

    const activeFolderObj = folders.find(f => f.id === appState.activeFolderFilter);
    if (DOM.collections.works.inputEl) {
        DOM.collections.works.inputEl.placeholder = activeFolderObj
            ? `Add sub-task to 📁 ${activeFolderObj.text}...`
            : 'Add a new task...';
    }

    const allPillHtml = `
        <button type="button" class="folder-pill ${appState.activeFolderFilter === 'all' ? 'active' : ''}" onclick="selectFolderFilter('all')">
            All <span class="folder-pill-count">${appState.works.length}</span>
        </button>
    `;

    const folderPillsHtml = folders
        .map(folder => {
            const isSelected = appState.activeFolderFilter === folder.id;
            const subCount = Array.isArray(folder.subtasks) ? folder.subtasks.length : 0;
            const blurred = isItemBlurred(folder, appState.spoilerAll.works);
            return `
                <button type="button" class="folder-pill ${isSelected ? 'active' : ''}" onclick="selectFolderFilter('${folder.id}')">
                    📁 <span class="${blurred ? 'spoiler-text' : ''}">${escapeHtml(folder.text)}</span>
                    <span class="folder-pill-count">${subCount}</span>
                </button>
            `;
        })
        .join('');

    const addFolderBtnHtml = `
        <button type="button" class="folder-pill folder-pill-add" onclick="toggleNewFolderForm()" title="Create a new Folder">
            + 📁
        </button>
    `;

    DOM.folderTabsBar.innerHTML = allPillHtml + folderPillsHtml + addFolderBtnHtml;
};

const updateGroupSpoilerBtnUI = (groupKey) => {
    const btn = document.querySelector(`[data-spoiler-group="${groupKey}"]`);
    if (!btn) return;
    const isActive = Boolean(appState.spoilerAll[groupKey]);
    btn.classList.toggle('active', isActive);
    btn.textContent = isActive ? '👾 Unspoiler All' : '👁️ Spoiler All';
};

// Helper to build time progress bar HTML for any task, folder, or subtask
const buildTimeProgressHtml = (groupKey, item, parentId = null) => {
    const metrics = calculateTaskTimeMetrics(item);
    if (!metrics.hasTimeData) return '';
    const editCall = parentId
        ? `dispatchSubtaskAction('${parentId}', 'startEdit', '${item.id}')`
        : `dispatchItemAction('${groupKey}', 'startEdit', '${item.id}')`;

    return `
        <div class="task-time-meta">
            <div class="task-time-info">
                <span class="time-badge" onclick="${editCall}" title="Click to adjust time">${metrics.badgeText}</span>
                <span class="time-remaining-text">${metrics.remainingText}</span>
            </div>
            <div class="task-progress-track">
                <div class="task-progress-fill ${metrics.isOverOrDone ? 'completed-bar' : ''}" style="width: ${metrics.percentage}%"></div>
            </div>
        </div>
    `;
};

const renderCollection = (groupKey) => {
    const config = DOM.collections[groupKey];
    if (!config || !config.listEl) return;

    appState[groupKey] = applyCollectionRules(groupKey, appState[groupKey]);
    if (groupKey === 'works') {
        renderFolderTabsBar();
    }

    const allItems = appState[groupKey];
    const items =
        groupKey === 'works' && appState.activeFolderFilter !== 'all'
            ? allItems.filter(item => item.id === appState.activeFolderFilter)
            : allItems;

    const groupSpoilerActive = appState.spoilerAll[groupKey];

    config.listEl.innerHTML = '';
    updateGroupSpoilerBtnUI(groupKey);

    items.forEach(item => {
        const li = document.createElement('li');
        const itemIsFolder = groupKey === 'works' && isFolderItem(item);
        const isActiveFocus = config.canFocus && appState.activeTaskId === item.id;
        const isEditing =
            editingState.groupKey === groupKey &&
            editingState.itemId === item.id &&
            !editingState.parentId;

        li.className = `list-item ${itemIsFolder ? 'folder-item' : ''} ${item.completed ? 'completed' : ''} ${isActiveFocus ? 'active-focus-task' : ''}`;

        // Inline Edit Mode for top-level item/folder
        if (isEditing) {
            const timeEditInputHtml = config.hasTimeAllocation
                ? `<input type="number" id="edit-time-${item.id}" class="inline-edit-time" value="${item.allocatedMinutes || ''}" placeholder="Min" min="0" max="999" title="Allocated minutes">`
                : '';

            li.innerHTML = `
                <div class="inline-edit-group">
                    <input type="text" id="edit-text-${item.id}" class="inline-edit-input" value="${escapeHtml(item.text)}" autocomplete="off">
                    ${timeEditInputHtml}
                    <button type="button" class="action-btn save-edit-btn" onclick="saveInlineEdit('${groupKey}', '${item.id}')" title="Save (Enter)">✓</button>
                    <button type="button" class="action-btn cancel-edit-btn" onclick="cancelInlineEdit('${groupKey}')" title="Cancel (Esc)">✕</button>
                </div>
            `;

            config.listEl.appendChild(li);
            bindInlineEditKeys(groupKey, item.id, null);
            return;
        }

        const blurred = isItemBlurred(item, groupSpoilerActive);
        const dragHandleHtml = config.isSortable
            ? `<span class="drag-handle" title="Drag to reorder priority">⠿</span>`
            : '';

        // Left Section: Folder Header vs Regular Task
        let leftSectionHtml = '';
        const isCollapsed = Boolean(item.isCollapsed);

        if (itemIsFolder) {
            const subCount = Array.isArray(item.subtasks) ? item.subtasks.length : 0;
            const doneSubCount = Array.isArray(item.subtasks) ? item.subtasks.filter(s => s.completed).length : 0;

            leftSectionHtml = `
                <div class="item-left">
                    ${dragHandleHtml}
                    <input type="checkbox" ${item.completed ? 'checked' : ''} onchange="dispatchItemAction('${groupKey}', 'toggleComplete', '${item.id}')" title="Mark entire folder completed" style="cursor:pointer; width:16px; height:16px; accent-color:var(--accent-blue); flex-shrink:0;">
                    <div class="folder-title-trigger" onclick="dispatchItemAction('${groupKey}', 'toggleFolderCollapse', '${item.id}')" title="Click to expand/collapse folder">
                        <span class="folder-icon-badge">
                            📁 <span class="folder-chevron ${isCollapsed ? 'collapsed' : ''}">▾</span>
                        </span>
                        <span class="task-text folder-title-text ${blurred ? 'spoiler-text' : ''}">${escapeHtml(item.text)}</span>
                        <span class="folder-subcount">${doneSubCount}/${subCount}</span>
                    </div>
                </div>
            `;
        } else {
            const textHtml = `<span class="task-text ${blurred ? 'spoiler-text' : ''}" ondblclick="dispatchItemAction('${groupKey}', 'startEdit', '${item.id}')" title="Double-click to rename">${escapeHtml(item.text)}</span>`;
            const innerContentHtml = config.hasCheckbox
                ? `<label class="checkbox-container">
                       <input type="checkbox" ${item.completed ? 'checked' : ''} onchange="dispatchItemAction('${groupKey}', 'toggleComplete', '${item.id}')">
                       ${textHtml}
                   </label>`
                : textHtml;
            leftSectionHtml = `<div class="item-left">${dragHandleHtml}${innerContentHtml}</div>`;
        }

        const focusBtnHtml = config.canFocus
            ? `<button type="button" class="action-btn focus-btn ${isActiveFocus ? 'active' : ''}" onclick="dispatchItemAction('${groupKey}', 'setActiveTask', '${item.id}')" title="Focus timer on this item">🎯</button>`
            : '';

        const addSubtaskBtnHtml = groupKey === 'works'
            ? `<button type="button" class="action-btn subtask-trigger-btn" onclick="dispatchItemAction('works', 'toggleSubtaskInput', '${item.id}')" title="${itemIsFolder ? 'Add Sub-task to Folder' : 'Convert to Folder & Add Sub-task'}">➕</button>`
            : '';

        const editBtnHtml = `<button type="button" class="action-btn edit-btn" onclick="dispatchItemAction('${groupKey}', 'startEdit', '${item.id}')" title="Rename / Edit Time">✎</button>`;

        const convertBtnHtml = config.canConvert
            ? `<button type="button" class="action-btn convert-btn" onclick="dispatchItemAction('${groupKey}', 'convert', '${item.id}')" title="Move to Works">↗</button>`
            : '';

        const timeProgressSectionHtml = config.hasTimeAllocation
            ? buildTimeProgressHtml(groupKey, item, null)
            : '';

        // Sub-tasks List & Inline Add Sub-task Form
        // Strictly respects !isCollapsed so clicking the folder header ALWAYS collapses/expands cleanly
        let subtasksSectionHtml = '';
        const showSubtaskInput = openSubtaskFormForId === item.id;

        if (groupKey === 'works' && itemIsFolder && !isCollapsed) {
            const subtasks = Array.isArray(item.subtasks) ? item.subtasks : [];
            const subtaskItemsHtml = subtasks
                .map(sub => {
                    const isSubEditing =
                        editingState.groupKey === 'works' &&
                        editingState.parentId === item.id &&
                        editingState.itemId === sub.id;

                    if (isSubEditing) {
                        return `
                            <div class="subtask-item" draggable="false" ondragstart="event.stopPropagation()">
                                <div class="inline-edit-group">
                                    <input type="text" id="edit-text-${sub.id}" class="inline-edit-input" value="${escapeHtml(sub.text)}" autocomplete="off">
                                    <input type="number" id="edit-time-${sub.id}" class="inline-edit-time" value="${sub.allocatedMinutes || ''}" placeholder="Min" min="0" max="999">
                                    <button type="button" class="action-btn save-edit-btn" onclick="saveInlineEdit('works', '${sub.id}', '${item.id}')">✓</button>
                                    <button type="button" class="action-btn cancel-edit-btn" onclick="cancelInlineEdit('works')">✕</button>
                                </div>
                            </div>
                        `;
                    }

                    const subBlurred = isItemBlurred(sub, groupSpoilerActive) || blurred;
                    const subActiveFocus = appState.activeTaskId === sub.id;
                    const subTimeHtml = buildTimeProgressHtml('works', sub, item.id);

                    return `
                        <div class="subtask-item ${sub.completed ? 'completed' : ''} ${subActiveFocus ? 'active-focus-task' : ''}" draggable="false" ondragstart="event.stopPropagation()">
                            <div class="item-main-row">
                                <label class="checkbox-container">
                                    <input type="checkbox" ${sub.completed ? 'checked' : ''} onchange="dispatchSubtaskAction('${item.id}', 'toggleComplete', '${sub.id}')">
                                    <span class="task-text ${subBlurred ? 'spoiler-text' : ''}" ondblclick="dispatchSubtaskAction('${item.id}', 'startEdit', '${sub.id}')" title="Double-click to rename">${escapeHtml(sub.text)}</span>
                                </label>
                                <div class="item-actions">
                                    <button type="button" class="action-btn focus-btn ${subActiveFocus ? 'active' : ''}" onclick="dispatchSubtaskAction('${item.id}', 'setActiveTask', '${sub.id}')" title="Focus timer on this sub-task">🎯</button>
                                    <button type="button" class="action-btn edit-btn" onclick="dispatchSubtaskAction('${item.id}', 'startEdit', '${sub.id}')" title="Rename / Edit Time">✎</button>
                                    <button type="button" class="action-btn spoiler-btn ${subBlurred ? 'active' : ''}" onclick="dispatchSubtaskAction('${item.id}', 'toggleSpoiler', '${sub.id}')" title="Toggle Spoiler">${subBlurred ? '👾' : '👁️'}</button>
                                    <button type="button" class="action-btn delete-btn" onclick="dispatchSubtaskAction('${item.id}', 'delete', '${sub.id}')" title="Delete Sub-task">×</button>
                                </div>
                            </div>
                            ${subTimeHtml}
                        </div>
                    `;
                })
                .join('');

            const addFormHtml = showSubtaskInput
                ? `<form class="subtask-add-form" onsubmit="handleAddSubtask(event, '${item.id}')" ondragstart="event.stopPropagation()">
                       <input type="text" id="subtask-input-${item.id}" class="subtask-add-input" placeholder="Add sub-task to ${escapeHtml(item.text)}..." autocomplete="off">
                       <input type="number" id="subtask-time-${item.id}" class="subtask-time-input" placeholder="Min" min="1" max="999">
                       <button type="submit" class="btn primary subtask-add-btn">+</button>
                   </form>`
                : '';

            if (subtasks.length > 0 || showSubtaskInput) {
                subtasksSectionHtml = `
                    <div class="subtasks-container">
                        ${subtaskItemsHtml}
                        ${addFormHtml}
                    </div>
                `;
            }
        }

        li.innerHTML = `
            <div class="item-main-row">
                ${leftSectionHtml}
                <div class="item-actions">
                    ${addSubtaskBtnHtml}
                    ${focusBtnHtml}
                    ${editBtnHtml}
                    <button type="button" class="action-btn spoiler-btn ${blurred ? 'active' : ''}" onclick="dispatchItemAction('${groupKey}', 'toggleSpoiler', '${item.id}')" title="Toggle Spoiler">
                        ${blurred ? '👾' : '👁️'}
                    </button>
                    ${convertBtnHtml}
                    <button type="button" class="action-btn delete-btn" onclick="dispatchItemAction('${groupKey}', 'delete', '${item.id}')" title="Move to Recycle Bin">×</button>
                </div>
            </div>
            ${timeProgressSectionHtml}
            ${subtasksSectionHtml}
        `;

        if (config.isSortable) {
            attachDragEvents(li, groupKey, item.id);
        }

        config.listEl.appendChild(li);

        if (editingState.groupKey === 'works' && editingState.parentId === item.id) {
            bindInlineEditKeys('works', editingState.itemId, item.id);
        }
    });
};

const bindInlineEditKeys = (groupKey, itemId, parentId = null) => {
    const textInput = document.getElementById(`edit-text-${itemId}`);
    const timeInput = document.getElementById(`edit-time-${itemId}`);
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            window.saveInlineEdit(groupKey, itemId, parentId);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            window.cancelInlineEdit(groupKey);
        }
    };
    if (textInput) {
        textInput.focus();
        textInput.select();
        textInput.addEventListener('keydown', handleKeyDown);
    }
    if (timeInput) {
        timeInput.addEventListener('keydown', handleKeyDown);
    }
};

// Render Recycle Bin Modal List & Counter Badge
const renderTrash = () => {
    if (DOM.trashCount) DOM.trashCount.textContent = appState.trash.length;
    if (!DOM.trashList) return;

    DOM.trashList.innerHTML = '';

    if (appState.trash.length === 0) {
        DOM.trashList.innerHTML = `<li class="empty-state">Recycle bin is empty.</li>`;
        return;
    }

    appState.trash.forEach(item => {
        const li = document.createElement('li');
        li.className = `list-item ${item.completed ? 'completed' : ''}`;
        const originLabel = item.origin === 'works' ? 'Work' : 'Thought';
        const blurred = Boolean(item.isSpoiler);

        li.innerHTML = `
            <div class="item-main-row">
                <div class="item-left">
                    <span class="origin-badge origin-${item.origin}">${originLabel}</span>
                    <span class="task-text ${blurred ? 'spoiler-text' : ''}">${escapeHtml(item.text)}</span>
                </div>
                <div class="item-actions">
                    <button class="action-btn restore-btn" onclick="dispatchTrashAction('restore', '${item.id}')" title="Restore to ${originLabel}s">↩</button>
                    <button class="action-btn delete-btn" onclick="dispatchTrashAction('permanentDelete', '${item.id}')" title="Delete Permanently">×</button>
                </div>
            </div>
        `;
        DOM.trashList.appendChild(li);
    });
};

const renderAllCollections = () => {
    Object.keys(DOM.collections).forEach(renderCollection);
    renderTrash();
    renderActiveTaskBanner();
};

// --- 7. Unified Action Dispatchers, Folder Actions & Sub-task Handlers ---

window.selectFolderFilter = (folderId) => {
    appState.activeFolderFilter = folderId;
    if (folderId !== 'all') {
        // Ensure selected folder is expanded
        appState.works = appState.works.map(item =>
            item.id === folderId ? { ...item, isCollapsed: false } : item
        );
    }
    persistState();
    renderCollection('works');
};

window.toggleNewFolderForm = () => {
    if (!DOM.newFolderForm) return;
    const isHidden = DOM.newFolderForm.classList.contains('hidden');
    DOM.newFolderForm.classList.toggle('hidden', !isHidden);
    if (isHidden && DOM.newFolderInput) {
        DOM.newFolderInput.value = '';
        DOM.newFolderInput.focus();
    }
};

window.handleAddSubtask = (e, folderId) => {
    e.preventDefault();
    const textInput = document.getElementById(`subtask-input-${folderId}`);
    const timeInput = document.getElementById(`subtask-time-${folderId}`);
    if (!textInput) return;

    const text = textInput.value.trim();
    if (!text) return;

    const allocatedMinutes = timeInput ? Math.max(0, parseInt(timeInput.value, 10) || 0) : 0;
    const newSubtask = {
        id: createId(),
        text,
        completed: false,
        completedAt: null,
        allocatedMinutes,
        spentMinutes: 0,
        isSpoiler: Boolean(appState.spoilerAll.works)
    };

    appState.works = appState.works.map(item => {
        if (item.id !== folderId) return item;
        const nextSubtasks = [...(Array.isArray(item.subtasks) ? item.subtasks : []), newSubtask];
        return {
            ...item,
            isFolder: true,
            isCollapsed: false,
            completed: false,
            subtasks: nextSubtasks
        };
    });

    if (!appState.activeTaskId) {
        appState.activeTaskId = newSubtask.id;
    }

    persistState();
    renderCollection('works');
    renderActiveTaskBanner();

    const refreshedInput = document.getElementById(`subtask-input-${folderId}`);
    if (refreshedInput) refreshedInput.focus();
};

window.dispatchSubtaskAction = (parentId, action, subtaskId) => {
    switch (action) {
        case 'toggleComplete':
            const toggled = toggleTaskCompletion(appState.works, subtaskId, parentId);
            appState.works = applyCollectionRules('works', toggled);
            break;

        case 'setActiveTask':
            appState.activeTaskId = appState.activeTaskId === subtaskId ? null : subtaskId;
            break;

        case 'startEdit':
            editingState = { groupKey: 'works', itemId: subtaskId, parentId };
            renderCollection('works');
            return;

        case 'toggleSpoiler':
            appState.works = toggleItemProp(appState.works, subtaskId, 'isSpoiler', parentId);
            break;

        case 'delete':
            if (appState.activeTaskId === subtaskId) {
                appState.activeTaskId = null;
            }
            appState.works = appState.works.map(item => {
                if (item.id !== parentId || !Array.isArray(item.subtasks)) return item;
                return {
                    ...item,
                    subtasks: item.subtasks.filter(s => s.id !== subtaskId)
                };
            });
            break;
    }

    persistState();
    renderCollection('works');
    renderActiveTaskBanner();
};

window.saveInlineEdit = (groupKey, id, parentId = null) => {
    const textInput = document.getElementById(`edit-text-${id}`);
    const timeInput = document.getElementById(`edit-time-${id}`);
    if (!textInput) return;

    const nextText = textInput.value.trim();
    if (!nextText) return;

    const nextAllocated = timeInput ? Math.max(0, parseInt(timeInput.value, 10) || 0) : null;
    appState[groupKey] = updateItemDetails(appState[groupKey], id, nextText, nextAllocated, parentId);

    editingState = { groupKey: null, itemId: null, parentId: null };
    persistState();
    renderCollection(groupKey);
    renderActiveTaskBanner();
};

window.cancelInlineEdit = (groupKey) => {
    editingState = { groupKey: null, itemId: null, parentId: null };
    renderCollection(groupKey);
};

window.dispatchItemAction = (groupKey, action, id) => {
    switch (action) {
        case 'toggleComplete':
            const toggled = toggleTaskCompletion(appState[groupKey], id);
            appState[groupKey] = applyCollectionRules(groupKey, toggled);
            break;

        case 'toggleFolderCollapse':
                appState.works = appState.works.map(item => {
                if (item.id !== id) return item;
                const nextCollapsed = !Boolean(item.isCollapsed);
                if (nextCollapsed && openSubtaskFormForId === id) {
                    openSubtaskFormForId = null;
                }
                return { ...item, isCollapsed: nextCollapsed };
            });
            break;

        case 'toggleSubtaskInput':
            // Convert item into a folder if not already, expand it, and toggle the quick subtask input
            const targetFolder = appState.works.find(i => i.id === id);
            const isCurrentlyOpen = openSubtaskFormForId === id && targetFolder && !targetFolder.isCollapsed;

            if (isCurrentlyOpen) {
                openSubtaskFormForId = null;
            } else {
                openSubtaskFormForId = id;
                appState.works = appState.works.map(item =>
                    item.id === id ? { ...item, isFolder: true, isCollapsed: false } : item
                );
            }
            persistState();
            renderCollection('works');
            if (openSubtaskFormForId === id) {
                const subIn = document.getElementById(`subtask-input-${id}`);
                if (subIn) subIn.focus();
            }
            return;

        case 'setActiveTask':
            appState.activeTaskId = appState.activeTaskId === id ? null : id;
            break;

        case 'startEdit':
            editingState = { groupKey, itemId: id, parentId: null };
            renderCollection(groupKey);
            return;

        case 'toggleSpoiler':
            appState[groupKey] = toggleItemProp(appState[groupKey], id, 'isSpoiler');
            if (appState.spoilerAll[groupKey]) {
                appState.spoilerAll[groupKey] = false;
            }
            break;

        case 'delete':
            if (appState.activeTaskId === id) {
                appState.activeTaskId = null;
            }
            if (appState.activeFolderFilter === id) {
                appState.activeFolderFilter = 'all';
            }
            const { nextSource, nextTrash } = archiveItemToTrash(appState[groupKey], appState.trash, groupKey, id);
            appState[groupKey] = nextSource;
            appState.trash = nextTrash;
            renderTrash();
            break;

        case 'convert':
            const itemToMove = appState[groupKey].find(i => i.id === id);
            if (itemToMove) {
                const updatedWorks = [
                    ...appState.works,
                    {
                        id: createId(),
                        text: itemToMove.text,
                        completed: false,
                        completedAt: null,
                        allocatedMinutes: 0,
                        spentMinutes: 0,
                        isFolder: false,
                        isCollapsed: false,
                        subtasks: [],
                        isSpoiler: Boolean(itemToMove.isSpoiler || appState.spoilerAll.works)
                    }
                ];
                appState.works = applyCollectionRules('works', updatedWorks);
                appState[groupKey] = removeItemById(appState[groupKey], id);
                renderCollection('works');
            }
            break;
    }

    persistState();
    renderCollection(groupKey);
    renderActiveTaskBanner();
};

// Handle Recycle Bin Actions (Restore, Permanent Delete, Empty All)
window.dispatchTrashAction = (action, id = null) => {
    switch (action) {
        case 'restore':
            const itemToRestore = appState.trash.find(i => i.id === id);
            if (itemToRestore) {
                const targetGroup = DOM.collections[itemToRestore.origin] ? itemToRestore.origin : 'works';
                const { origin, deletedAt, ...cleanItem } = itemToRestore;
                appState[targetGroup] = applyCollectionRules(targetGroup, [...appState[targetGroup], cleanItem]);
                appState.trash = removeItemById(appState.trash, id);
                renderCollection(targetGroup);
            }
            break;

        case 'permanentDelete':
            appState.trash = removeItemById(appState.trash, id);
            break;

        case 'emptyAll':
            appState.trash = [];
            break;
    }

    persistState();
    renderTrash();
};

const toggleGroupSpoiler = (groupKey) => {
    const nextState = !appState.spoilerAll[groupKey];
    appState.spoilerAll[groupKey] = nextState;
    appState[groupKey] = setAllItemsProp(appState[groupKey], 'isSpoiler', nextState);
    persistState();
    renderCollection(groupKey);
    renderActiveTaskBanner();
};

const handleAddItem = (groupKey, e) => {
    e.preventDefault();
    const { inputEl, timeInputEl, hasCheckbox, hasTimeAllocation } = DOM.collections[groupKey];
    const text = inputEl.value.trim();
    if (!text) return;

    const allocatedMinutes = hasTimeAllocation && timeInputEl
        ? Math.max(0, parseInt(timeInputEl.value, 10) || 0)
        : 0;

    // If user is currently filtered inside a specific Folder in Works, add directly as a sub-task of that Folder
    if (groupKey === 'works' && appState.activeFolderFilter !== 'all') {
        const targetFolderId = appState.activeFolderFilter;
        const newSubtask = {
            id: createId(),
            text,
            completed: false,
            completedAt: null,
            allocatedMinutes,
            spentMinutes: 0,
            isSpoiler: Boolean(appState.spoilerAll.works)
        };

        appState.works = appState.works.map(item => {
            if (item.id !== targetFolderId) return item;
            return {
                ...item,
                isFolder: true,
                isCollapsed: false,
                completed: false,
                subtasks: [...(Array.isArray(item.subtasks) ? item.subtasks : []), newSubtask]
            };
        });

        inputEl.value = '';
        if (timeInputEl) timeInputEl.value = '';
        if (!appState.activeTaskId) appState.activeTaskId = newSubtask.id;

        persistState();
        renderCollection('works');
        renderActiveTaskBanner();
        return;
    }

    // Standard top-level item creation
    const newItem = {
        id: createId(),
        text,
        isSpoiler: Boolean(appState.spoilerAll[groupKey]),
        ...(hasCheckbox ? { completed: false, completedAt: null } : {}),
        ...(hasTimeAllocation
            ? { allocatedMinutes, spentMinutes: 0, isFolder: false, isCollapsed: false, subtasks: [] }
            : {})
    };

    const updatedList = [...appState[groupKey], newItem];
    appState[groupKey] = applyCollectionRules(groupKey, updatedList);
    inputEl.value = '';
    if (timeInputEl) timeInputEl.value = '';

    if (groupKey === 'works' && !appState.activeTaskId) {
        appState.activeTaskId = newItem.id;
    }

    persistState();
    renderCollection(groupKey);
    renderActiveTaskBanner();
};

// --- 8. Event Listeners Initialization ---

const setupEvents = () => {

    // Smooth horizontal mouse-wheel scrolling for Folder Filter Pills Bar on desktop
    if (DOM.folderTabsBar) {
        DOM.folderTabsBar.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                DOM.folderTabsBar.scrollLeft += e.deltaY;
            }
        }, { passive: false });
    }
    // Master Spoiler Buttons
    DOM.spoilerGroupBtns.forEach(btn => {
        const groupKey = btn.dataset.spoilerGroup;
        btn.addEventListener('click', () => toggleGroupSpoiler(groupKey));
    });

    // New Folder Form Submission ([ + 📁 ] in Filter Bar)
    if (DOM.newFolderForm && DOM.newFolderInput) {
        DOM.newFolderForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const folderName = DOM.newFolderInput.value.trim();
            if (!folderName) return;

            const newFolder = {
                id: createId(),
                text: folderName,
                completed: false,
                completedAt: null,
                allocatedMinutes: 0,
                spentMinutes: 0,
                isFolder: true,
                isCollapsed: false,
                subtasks: [],
                isSpoiler: Boolean(appState.spoilerAll.works)
            };

            appState.works = applyCollectionRules('works', [...appState.works, newFolder]);
            appState.activeFolderFilter = newFolder.id;
            openSubtaskFormForId = newFolder.id;

            DOM.newFolderInput.value = '';
            DOM.newFolderForm.classList.add('hidden');
            persistState();
            renderCollection('works');
        });
    }

    if (DOM.btnCancelFolder && DOM.newFolderForm) {
        DOM.btnCancelFolder.addEventListener('click', () => {
            DOM.newFolderForm.classList.add('hidden');
        });
    }

    // Clear Active Task Button on Banner
    if (DOM.btnClearActiveTask) {
        DOM.btnClearActiveTask.addEventListener('click', () => {
            appState.activeTaskId = null;
            persistState();
            renderCollection('works');
            renderActiveTaskBanner();
        });
    }

    // Collection Add Forms
    Object.keys(DOM.collections).forEach(groupKey => {
        const formEl = DOM.collections[groupKey].formEl;
        if (formEl) {
            formEl.addEventListener('submit', (e) => handleAddItem(groupKey, e));
        }
    });

    // Export Daily Report Image (PNG)
    if (DOM.btnExportReport) {
        DOM.btnExportReport.addEventListener('click', () => {
            if (typeof ReportExporter !== 'undefined') {
                ReportExporter.exportDailyReport({
                    works: appState.works,
                    stats: appState.stats,
                    dates: getFormattedDates(),
                    spoilerAllWorks: appState.spoilerAll.works
                });
            }
        });
    }

    // Recycle Bin Modal Events
    if (DOM.btnOpenTrash && DOM.trashModal) {
        DOM.btnOpenTrash.addEventListener('click', () => DOM.trashModal.classList.remove('hidden'));
    }
    if (DOM.btnCloseTrash && DOM.trashModal) {
        DOM.btnCloseTrash.addEventListener('click', () => DOM.trashModal.classList.add('hidden'));
    }
    if (DOM.btnEmptyTrash) {
        DOM.btnEmptyTrash.addEventListener('click', () => window.dispatchTrashAction('emptyAll'));
    }
    if (DOM.trashModal) {
        DOM.trashModal.addEventListener('click', (e) => {
            if (e.target === DOM.trashModal) DOM.trashModal.classList.add('hidden');
        });
    }

    // 10-Second Preparation Overlay Skip Button
    if (DOM.btnSkipPrep) {
        DOM.btnSkipPrep.addEventListener('click', stopSessionPrep);
    }

    // Timer Start / Pause Button
    DOM.btnToggle.addEventListener('click', () => {
        const isFreshWorkSession =
            !currentTimer.isRunning &&
            currentTimer.mode === 'work' &&
            currentTimer.timeLeft === currentTimer.totalTime;

        currentTimer.isRunning = !currentTimer.isRunning;

        if (currentTimer.isRunning) {
            if (isFreshWorkSession) {
                currentTimer.lastRecordedRemainingSeconds = currentTimer.timeLeft;
                startSessionPrep();
            }
            TimerEngine.start(currentTimer.timeLeft, handleTick, handleTimerEnd);
        } else {
            stopSessionPrep();
            TimerEngine.stop();
        }
        updateTimerUI();
    });

    // Timer Reset Button
    DOM.btnReset.addEventListener('click', () => {
        stopSessionPrep();
        TimerEngine.stop();
        currentTimer.isRunning = false;
        currentTimer.mode = 'work';
        currentTimer.totalTime = appState.timerSettings.workTime * 60;
        currentTimer.timeLeft = currentTimer.totalTime;
        currentTimer.lastRecordedRemainingSeconds = currentTimer.totalTime;
        updateTimerUI();
    });

    // Timer Duration Inputs
    const bindTimeInput = (inputEl, settingKey, targetMode) => {
        if (!inputEl) return;
        inputEl.value = appState.timerSettings[settingKey];
        inputEl.addEventListener('change', (e) => {
            const val = Math.max(1, parseInt(e.target.value) || DEFAULT_STATE.timerSettings[settingKey]);
            appState.timerSettings[settingKey] = val;
            if (currentTimer.mode === targetMode && !currentTimer.isRunning) {
                currentTimer.totalTime = val * 60;
                currentTimer.timeLeft = val * 60;
                currentTimer.lastRecordedRemainingSeconds = val * 60;
                updateTimerUI();
            }
            persistState();
        });
    };

    bindTimeInput(DOM.inputWorkTime, 'workTime', 'work');
    bindTimeInput(DOM.inputRestTime, 'restTime', 'rest');
};

// --- 9. Initialization ---
const initApp = () => {
    checkDailyStats();
    setupEvents();
    renderAllCollections();
    updateTimerUI();
};

initApp();