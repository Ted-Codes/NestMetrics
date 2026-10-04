// ==========================
// NestMetrics - script.js
// ==========================

// Google Sheet CSV link (a page can override this with <body data-sheet="...">)
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIDCT6OHYQGa_YHxcmMhp1IZuUfJzBqbV5n1MlZqvBzfM4zWyvd4jyo5Gi2vPgoGeCVXbmRwOU0jnx/pub?output=csv";
const sheetURL = document.body.dataset.sheet || DEFAULT_SHEET_URL;

/*
Sheet columns:
0 = Timestamp      (form submit time = California time, "M/D/YYYY H:MM:SS")
1 = Time           (capture time = Orange, AUS time, "MM-DD-YYYY H:MM AM/PM")
2 = Falcon_Count
3 = Confidence     (percent)
4 = Temperature    (°F)
5 = Weather
*/

// Data is collected every 30 minutes, so there's no point refreshing every minute
const REFRESH_MS = 5 * 60 * 1000;
const READING_INTERVAL_MS = 30 * 60 * 1000;
// If two readings are more than 3 intervals apart, break the line (shows a gap, not a fake 0)
const GAP_MS = READING_INTERVAL_MS * 3;

const RANGES = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000
};

// Temperature history always shows the last 3 days (independent of the falcon chart toggle)
const TEMP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

let owlChart;
let tempChart;
let allRecords = [];
let currentRange = "24h";

// Small helper: set text on an element if it exists
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Proper CSV parser (handles quoted fields, commas inside quotes, \r\n line endings)
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];

        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') {
                inQuotes = false;
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            row.push(field);
            field = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field);
            field = "";
            if (row.some(cell => cell.trim() !== "")) rows.push(row);
            row = [];
        } else {
            field += c;
        }
    }

    // Last row without trailing newline
    row.push(field);
    if (row.some(cell => cell.trim() !== "")) rows.push(row);

    return rows;
}

// Parses "MM-DD-YYYY H:MM AM/PM" and "M/D/YYYY H:MM:SS" style timestamps
// manually, because Safari's Date() parsing is much stricter than Chrome's
function parseSheetTimestamp(str) {
    if (!str) return new Date(NaN);

    const match = str.trim().match(
        /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i
    );
    if (!match) return new Date(NaN);

    const [, month, day, year, rawHours, minutes, meridiem] = match;
    let hours = Number(rawHours);

    if (meridiem) {
        const isPM = meridiem.toUpperCase() === "PM";
        if (isPM && hours !== 12) hours += 12;
        if (!isPM && hours === 12) hours = 0; // 12 AM = midnight
    }

    return new Date(Number(year), Number(month) - 1, Number(day), hours, Number(minutes), 0);
}

// Friendly display, e.g. "Oct 2, 2026, 12:29 PM"
function formatTime(date, fallback) {
    if (!date || isNaN(date.getTime())) return fallback || "--";
    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

// Turn raw CSV rows into clean records, sorted oldest -> newest (by Orange capture time)
function toRecords(rows) {
    return rows
        .slice(1) // drop header
        .map(r => ({
            submitted: parseSheetTimestamp(r[0]), // California time
            label: (r[1] || "").trim(),
            time: parseSheetTimestamp(r[1]),      // Orange time
            count: Number(r[2]),
            confidence: Number(r[3]),
            temperature: Number(r[4]),
            weather: (r[5] || "").trim()
        }))
        .filter(rec => !isNaN(rec.time.getTime()) && !isNaN(rec.count))
        .sort((a, b) => a.time - b.time);
}

// Load data from Google Sheets
async function loadData() {
    try {
        const response = await fetch(sheetURL + "&cache=" + Date.now());
        if (!response.ok) throw new Error("HTTP " + response.status);

        const csvText = await response.text();
        allRecords = toRecords(parseCSV(csvText));

        if (allRecords.length === 0) {
            setText("owl-count", "No data");
            setText("adult-owl-count", "--");
            setText("updated", "--");
            setText("updated-cali", "--");
            setText("temperature", "--");
            setText("weather", "--");
            return;
        }

        const latest = allRecords[allRecords.length - 1];

        setText("owl-count", latest.count + " 🦅");
        setText("adult-owl-count", isNaN(latest.confidence) ? "--" : latest.confidence + "%");
        setText("temperature", isNaN(latest.temperature) ? "--" : latest.temperature.toFixed(1) + "°F");
        setText("weather", latest.weather || "--");
        setText("updated", "Orange: " + formatTime(latest.time, latest.label));
        setText("updated-cali", "California: " + formatTime(latest.submitted));
    } catch (error) {
        console.error("Error loading spreadsheet:", error);
        setText("owl-count", "Error");
        setText("adult-owl-count", "Error");
        setText("updated", "Error");
        setText("updated-cali", "Error");
        setText("temperature", "Error");
        setText("weather", "Error");
        return;
    }

    // Charts are separate so a chart problem never blanks the cards above
    try {
        createCharts(allRecords);
    } catch (error) {
        console.error("Error drawing charts:", error);
    }
}

// Turn records into {x, y} points; inserts a null point wherever data is missing
// so Chart.js draws a gap instead of connecting across it
function buildSeries(records, valueFn) {
    const points = [];
    records.forEach((rec, i) => {
        if (i > 0) {
            const prev = records[i - 1].time.getTime();
            const curr = rec.time.getTime();
            if (curr - prev > GAP_MS) {
                points.push({ x: Math.round((prev + curr) / 2), y: null });
            }
        }
        points.push({ x: rec.time.getTime(), y: valueFn(rec) });
    });
    return points;
}

// Shared x-axis: a real time axis in Orange time
function timeScale(start, end, unit) {
    return {
        type: "time",
        min: start,
        max: end,
        time: {
            unit: unit,
            tooltipFormat: "MMM d, h:mm a",
            displayFormats: {
                hour: "h a",
                day: "EEE MMM d"
            }
        },
        ticks: {
            maxTicksLimit: 8,
            autoSkip: true,
            maxRotation: 0
        },
        title: {
            display: true,
            text: "Time (Orange, AUS)"
        }
    };
}

function createCharts(records) {
    if (typeof Chart === "undefined") {
        console.error("Chart.js did not load");
        return;
    }

    // Window anchored to the newest reading (not "now"), so the timezone gap
    // between the camera and the viewer can't cut off the latest data
    const end = records[records.length - 1].time.getTime();
    const start = end - RANGES[currentRange];
    const inRange = records.filter(r => r.time.getTime() >= start);
    const showDots = currentRange === "24h";

    // ---- Summary line under the falcon chart ----
    const counts = inRange.map(r => r.count);
    const peak = Math.max(...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const seenPct = Math.round((counts.filter(c => c > 0).length / counts.length) * 100);
    setText(
        "chart-summary",
        "Readings: " + counts.length + "  ·  Peak: " + peak +
        "  ·  Average: " + avg.toFixed(1) + "  ·  Falcon(s) seen in " + seenPct + "% of readings"
    );

    // Destroy old charts before redrawing
    if (owlChart) owlChart.destroy();
    if (tempChart) tempChart.destroy();

    // ==========================
    // Falcon count over time (step chart)
    // ==========================
    const owlCanvas = document.getElementById("owlChart");
    if (owlCanvas) {
        owlChart = new Chart(owlCanvas, {
            type: "line",
            data: {
                datasets: [
                    {
                        label: "Falcon count",
                        data: buildSeries(inRange, r => r.count),
                        yAxisID: "y",
                        // 'middle' = the count changes halfway between two readings,
                        // since we only know it changed sometime in that 30-minute window
                        stepped: "middle",
                        borderColor: "#2f6fed",
                        backgroundColor: "rgba(47, 111, 237, 0.15)",
                        borderWidth: 2,
                        fill: true,
                        pointRadius: showDots ? 3 : 0,
                        pointHoverRadius: 5,
                        spanGaps: false
                    },
                    {
                        // Click "Confidence" in the legend to show/hide this line
                        label: "Confidence (%)",
                        data: buildSeries(inRange, r => (isNaN(r.confidence) ? null : r.confidence)),
                        yAxisID: "y2",
                        hidden: false,
                        borderColor: "rgba(230, 126, 34, 0.85)",
                        borderDash: [5, 4],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        spanGaps: false
                    }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: "nearest", axis: "x", intersect: false },
                plugins: {
                    title: {
                        display: true,
                        text: currentRange === "24h"
                            ? "Falcons Detected - Last 24 Hours"
                            : "Falcons Detected - Last 7 Days"
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                if (ctx.parsed.y === null) return "";
                                return ctx.dataset.yAxisID === "y2"
                                    ? "Confidence: " + ctx.parsed.y + "%"
                                    : "Falcons: " + ctx.parsed.y;
                            }
                        }
                    }
                },
                scales: {
                    x: timeScale(start, end, currentRange === "24h" ? "hour" : "day"),
                    y: {
                        beginAtZero: true,
                        suggestedMax: Math.max(1, peak) + 1,
                        ticks: { stepSize: 1, precision: 0 },
                        title: { display: true, text: "Falcons detected" }
                    },
                    y2: {
                        display: "auto",
                        position: "right",
                        min: 0,
                        max: 100,
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: "Confidence (%)" }
                    }
                }
            }
        });
    }

    // ==========================
    // Temperature over time (always the last 3 days)
    // ==========================
    const tempStart = end - TEMP_WINDOW_MS;
    const tempInRange = records.filter(r => r.time.getTime() >= tempStart);
    const tempCanvas = document.getElementById("tempChart");
    if (tempCanvas) {
        tempChart = new Chart(tempCanvas, {
            type: "line",
            data: {
                datasets: [{
                    label: "Temperature (°F)",
                    data: buildSeries(tempInRange, r => (isNaN(r.temperature) ? null : r.temperature)),
                    borderColor: "#e4572e",
                    backgroundColor: "rgba(228, 87, 46, 0.12)",
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    spanGaps: false
                }]
            },
            options: {
                responsive: true,
                interaction: { mode: "nearest", axis: "x", intersect: false },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: ctx => (ctx.parsed.y === null ? "" : ctx.parsed.y.toFixed(1) + "°F")
                        }
                    }
                },
                scales: {
                    x: timeScale(tempStart, end, "day"),
                    y: {
                        title: { display: true, text: "°F" }
                    }
                }
            }
        });
    }
}

// ==========================
// Range toggle (24 hours / 7 days)
// ==========================
document.querySelectorAll(".range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        currentRange = btn.dataset.range;

        document.querySelectorAll(".range-btn").forEach(b => {
            b.classList.toggle("active", b === btn);
        });

        if (allRecords.length > 0) {
            try {
                createCharts(allRecords);
            } catch (error) {
                console.error("Error drawing charts:", error);
            }
        }
    });
});

// ==========================
// Share button
// ==========================
const shareBtn = document.getElementById("nativeShareBtn");

// Hide the button if the browser doesn't support native sharing
if (shareBtn && !navigator.share) {
    shareBtn.style.display = "none";
}

// Trigger the native device share menu when clicked
if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
        try {
            await navigator.share({
                title: document.title,
                url: window.location.href
            });
        } catch (err) {
            console.log("Share canceled or failed:", err);
        }
    });
}

// Initial load
loadData();

// Refresh every 5 minutes
setInterval(loadData, REFRESH_MS);;
