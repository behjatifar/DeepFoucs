/**
 * Report Exporter Module
 * Generates a high-resolution PNG daily report card using native HTML5 Canvas API.
 * Supports standalone tasks, folders, and completed sub-tasks with time metrics.
 */

const ReportExporter = (() => {
    // --- 1. Visual & Layout Configuration Rules ---
    const CONFIG = {
        width: 820,
        baseHeight: 450,
        rowHeight: 58,
        padding: 50,
        colors: {
            bg: '#0a0a0a',
            cardBg: 'rgba(255, 255, 255, 0.04)',
            cardBorder: 'rgba(255, 255, 255, 0.1)',
            textMain: '#f3f4f6',
            textMuted: '#9ca3af',
            accentBlue: '#3b82f6',
            accentPurple: '#8b5cf6',
            successGreen: '#10b981'
        },
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    };

    // Flatten completed works & completed subtasks for the daily report
    const extractCompletedReportEntries = (works = []) => {
        const entries = [];
        works.forEach(item => {
            const hasSubtasks = Array.isArray(item.subtasks) && item.subtasks.length > 0;
            if (hasSubtasks) {
                item.subtasks.forEach(sub => {
                    if (sub.completed) {
                        entries.push({
                            text: `[${item.text}] ${sub.text}`,
                            isSpoiler: Boolean(sub.isSpoiler || item.isSpoiler),
                            spentMinutes: Number(sub.spentMinutes) || 0,
                            allocatedMinutes: Number(sub.allocatedMinutes) || 0
                        });
                    }
                });
            } else if (item.completed) {
                entries.push({
                    text: item.text,
                    isSpoiler: Boolean(item.isSpoiler),
                    spentMinutes: Number(item.spentMinutes) || 0,
                    allocatedMinutes: Number(item.allocatedMinutes) || 0
                });
            }
        });
        return entries;
    };

    // Sum all spent minutes across both top-level tasks and nested subtasks
    const calculateTotalTasksSpentMinutes = (works = []) =>
        works.reduce((total, item) => {
            const topSpent = Number(item.spentMinutes) || 0;
            const subSpent = Array.isArray(item.subtasks)
                ? item.subtasks.reduce((sTotal, sub) => sTotal + (Number(sub.spentMinutes) || 0), 0)
                : 0;
            return total + topSpent + subSpent;
        }, 0);

    const formatTaskText = (entry, globalSpoiler) => {
        if (entry.isSpoiler || globalSpoiler) {
            return '•••••••••••••••••••••••• (Spoiler)';
        }
        return entry.text.length > 46 ? `${entry.text.substring(0, 46)}...` : entry.text;
    };

    const formatTaskTimeLabel = (entry) => {
        const spent = Math.max(0, Number(entry.spentMinutes) || 0);
        const allocated = Math.max(0, Number(entry.allocatedMinutes) || 0);
        if (allocated > 0) return `${spent}m / ${allocated}m`;
        if (spent > 0) return `${spent}m spent`;
        return '';
    };

    const formatTotalDuration = (totalMinutes = 0) => {
        const mins = Math.max(0, Number(totalMinutes) || 0);
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };

    const drawRoundedRect = (ctx, x, y, width, height, radius, fillStyle, strokeStyle = null) => {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
        if (fillStyle) {
            ctx.fillStyle = fillStyle;
            ctx.fill();
        }
        if (strokeStyle) {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    };

    const drawAmbientBackground = (ctx, width, height) => {
        ctx.fillStyle = CONFIG.colors.bg;
        ctx.fillRect(0, 0, width, height);

        const blueGlow = ctx.createRadialGradient(width * 0.15, height * 0.15, 20, width * 0.15, height * 0.15, 420);
        blueGlow.addColorStop(0, 'rgba(59, 130, 246, 0.28)');
        blueGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = blueGlow;
        ctx.fillRect(0, 0, width, height);

        const purpleGlow = ctx.createRadialGradient(width * 0.85, height * 0.85, 20, width * 0.85, height * 0.85, 420);
        purpleGlow.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
        purpleGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = purpleGlow;
        ctx.fillRect(0, 0, width, height);
    };

    // --- 2. Main Canvas Generator & Downloader ---
    const exportDailyReport = ({ works = [], stats = {}, dates = {}, spoilerAllWorks = false }) => {
        const completedEntries = extractCompletedReportEntries(works);
        const taskCount = Math.max(1, completedEntries.length);
        const canvasHeight = CONFIG.baseHeight + (taskCount * CONFIG.rowHeight);

        const tasksTotalSpent = calculateTotalTasksSpentMinutes(works);
        const totalFocusMins = Math.max(Number(stats.totalFocusedMinutes) || 0, tasksTotalSpent);

        const canvas = document.createElement('canvas');
        const scale = 2;
        canvas.width = CONFIG.width * scale;
        canvas.height = canvasHeight * scale;

        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        // 1. Background & Outer Glass Card
        drawAmbientBackground(ctx, CONFIG.width, canvasHeight);
        drawRoundedRect(
            ctx,
            CONFIG.padding,
            CONFIG.padding,
            CONFIG.width - CONFIG.padding * 2,
            canvasHeight - CONFIG.padding * 2,
            24,
            CONFIG.colors.cardBg,
            CONFIG.colors.cardBorder
        );

        const innerX = CONFIG.padding + 36;
        const innerWidth = CONFIG.width - (CONFIG.padding + 36) * 2;
        let currentY = CONFIG.padding + 55;

        // 2. Header Title
        ctx.fillStyle = CONFIG.colors.textMain;
        ctx.font = `700 28px ${CONFIG.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.fillText('Deep Focus — Daily Report', innerX, currentY);

        // 3. Dates (Shamsi & Gregorian)
        currentY += 34;
        ctx.fillStyle = CONFIG.colors.textMain;
        ctx.font = `500 16px ${CONFIG.fontFamily}`;
        ctx.fillText(`${dates.shamsi || ''}   |   ${dates.gregorian || ''}`, innerX, currentY);

        // 4. Stats Summary Badges (3 Columns)
        currentY += 30;
        const gap = 16;
        const badgeWidth = (innerWidth - gap * 2) / 3;

        // Box 1: Pomodoros Completed
        drawRoundedRect(ctx, innerX, currentY, badgeWidth, 85, 16, 'rgba(59, 130, 246, 0.12)', 'rgba(59, 130, 246, 0.35)');
        ctx.fillStyle = CONFIG.colors.accentBlue;
        ctx.font = `700 30px ${CONFIG.fontFamily}`;
        ctx.fillText(`${stats.pomodorosCompleted || 0}`, innerX + 20, currentY + 46);
        ctx.fillStyle = CONFIG.colors.textMuted;
        ctx.font = `500 13px ${CONFIG.fontFamily}`;
        ctx.fillText('Pomodoros Done', innerX + 20, currentY + 68);

        // Box 2: Total Focus Time
        const secondBadgeX = innerX + badgeWidth + gap;
        drawRoundedRect(ctx, secondBadgeX, currentY, badgeWidth, 85, 16, 'rgba(16, 185, 129, 0.12)', 'rgba(16, 185, 129, 0.35)');
        ctx.fillStyle = CONFIG.colors.successGreen;
        ctx.font = `700 30px ${CONFIG.fontFamily}`;
        ctx.fillText(formatTotalDuration(totalFocusMins), secondBadgeX + 20, currentY + 46);
        ctx.fillStyle = CONFIG.colors.textMuted;
        ctx.font = `500 13px ${CONFIG.fontFamily}`;
        ctx.fillText('Total Focus Time', secondBadgeX + 20, currentY + 68);

        // Box 3: Completed Tasks Count
        const thirdBadgeX = secondBadgeX + badgeWidth + gap;
        drawRoundedRect(ctx, thirdBadgeX, currentY, badgeWidth, 85, 16, 'rgba(139, 92, 246, 0.12)', 'rgba(139, 92, 246, 0.35)');
        ctx.fillStyle = CONFIG.colors.accentPurple;
        ctx.font = `700 30px ${CONFIG.fontFamily}`;
        ctx.fillText(`${completedEntries.length}`, thirdBadgeX + 20, currentY + 46);
        ctx.fillStyle = CONFIG.colors.textMuted;
        ctx.font = `500 13px ${CONFIG.fontFamily}`;
        ctx.fillText('Tasks Accomplished', thirdBadgeX + 20, currentY + 68);

        // 5. Completed Tasks List Section
        currentY += 125;
        ctx.fillStyle = CONFIG.colors.textMuted;
        ctx.font = `600 15px ${CONFIG.fontFamily}`;
        ctx.fillText('COMPLETED WORKS & TIME SPENT', innerX, currentY);

        currentY += 20;

        if (completedEntries.length === 0) {
            drawRoundedRect(ctx, innerX, currentY, innerWidth, 46, 12, 'rgba(255, 255, 255, 0.02)');
            ctx.fillStyle = CONFIG.colors.textMuted;
            ctx.font = `italic 15px ${CONFIG.fontFamily}`;
            ctx.fillText('No completed tasks recorded yet today.', innerX + 20, currentY + 28);
        } else {
            completedEntries.forEach((entry) => {
                drawRoundedRect(ctx, innerX, currentY, innerWidth, 46, 12, 'rgba(0, 0, 0, 0.3)', 'rgba(255, 255, 255, 0.06)');

                ctx.fillStyle = CONFIG.colors.successGreen;
                ctx.font = `700 16px ${CONFIG.fontFamily}`;
                ctx.textAlign = 'left';
                ctx.fillText('✓', innerX + 18, currentY + 29);

                const displayText = formatTaskText(entry, spoilerAllWorks);
                ctx.fillStyle = CONFIG.colors.textMain;
                ctx.font = `500 15px ${CONFIG.fontFamily}`;
                ctx.fillText(displayText, innerX + 44, currentY + 29);

                const timeLabel = formatTaskTimeLabel(entry);
                if (timeLabel) {
                    ctx.font = `600 13px ${CONFIG.fontFamily}`;
                    const textWidth = ctx.measureText(timeLabel).width;
                    const pillWidth = textWidth + 20;
                    const pillX = innerX + innerWidth - pillWidth - 14;
                    const pillY = currentY + 10;

                    drawRoundedRect(ctx, pillX, pillY, pillWidth, 26, 8, 'rgba(59, 130, 246, 0.15)', 'rgba(59, 130, 246, 0.35)');
                    ctx.fillStyle = '#93c5fd';
                    ctx.textAlign = 'center';
                    ctx.fillText(timeLabel, pillX + pillWidth / 2, currentY + 28);
                    ctx.textAlign = 'left';
                }

                currentY += CONFIG.rowHeight;
            });
        }

        // 6. Trigger Instant PNG Download
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const safeDate = new Date().toISOString().slice(0, 10);
        link.download = `deep-focus-report-${safeDate}.png`;
        link.href = dataUrl;
        link.click();
    };

    return { exportDailyReport };
})();