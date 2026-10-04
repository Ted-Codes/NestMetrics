// ==========================
// NestMetrics - peaks.js (Stream 2, Derbyshire UK)
// ==========================

const DEFAULT_SHEET_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSr18vuowtUDnqE_Sn2b9d_7lvAmGSvnPYaixiMnlhtWXSndXgcKQPn6NDmAtKmVkRf0_rw6Jr3ctIS/pub?output=csv";
const sheetURL = document.body.dataset.sheet || DEFAULT_SHEET_URL;

// ---------- CONFIG ----------
const LOCAL_LABEL = "UK";
const CALI_LABEL = "California";
const TEMP_UNIT = "°F";

// How often a reading is logged. If your sheet logs more/less often, change this.
const READING_INTERVAL_MS = 30 * 60 * 1000;
// Readings further apart than 3 intervals are shown as a gap, not a fake "empty"
const GAP_MS = READING_INTERVAL_MS * 3;
const REFRESH_MS = 5 * 60 * 1000;

const RANGES = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000
};
const TEMP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/*
Sheet columns:
0 = Timestamp (form submit time = California time, "M/D/YYYY H:MM:SS")
1 = Time (capture time = UK time, "MM-DD-YYYY H:MM AM/PM")
2 = Baby Owl Number (ignored)
3 = Occupancy ("Occupied" or anything else = empty)
4 = Confidence (percent)
5 = Temperature
6 = Weather
*/

let owlChart;
let tempChart;
let allRecords = [];
let currentRange = "24h";

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// CSV parser (quotes, commas in quotes, newlines in quoted headers, \r\n)
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];

        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else field += c;
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

    row.push(field);
    if (row.some(cell => cell.trim() !== "")) rows.push(row);
    return rows;
}

// Handles "MM-DD-YYYY H:MM AM/PM" and "M/D/YYYY H:MM:SS" (Safari-safe)
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
        if (!isPM && hours === 12) hours = 0;
    }

    return new Date(Number(year), Number(month) - 1, Number(day), hours, Number(minutes), 0);
}

function formatTime(date) {
    if (!date || isNaN(date.getTime())) return "--";
    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function formatDuration(ms) {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return mins + " min";
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return hrs + "h " + (mins % 60) + "m";
    return Math.floor(hrs / 24) + " days";
}

// Raw rows -> clean records, oldest -> newest (by UK capture time)
function toRecords(rows) {
    return rows
        .slice(1) // header
        .filter(r => (r[3] || "").trim() !== "") // skip rows with no occupancy value
        .map(r => ({
            submitted: parseSheetTimestamp(r[0]),   // California
            time: parseSheetTimestamp(r[1]),        // UK
            occupied: (r[3] || "").trim().toLowerCase() === "occupied",
            confidence: parseFloat(r[4]),           // NaN if blank
            temperature: parseFloat(r[5]),          // NaN if blank
            weather: (r[6] || "").trim()
        }))
        .filter(rec => !isNaN(rec.time.getTime()))
        .sort((a, b) => a.time - b.time);
}

async function loadData() {
    try {
        const response = await fetch(sheetURL + "&cache=" + Date.now());
        if (!response.ok) throw new Error("HTTP " + response.status);

        allRecords = toRecords(parseCSV(await response.text()));

        if (allRecords.length === 0) {
            setText("owl-count", "No data");
            return;
        }

        updateCards();
    } catch (error) {
        console.error("Error loading spreadsheet:", error);
        setText("owl-count", "Error");
        setText("adult-owl-count", "Error");
        setText("updated-local", "Error");
        setText("temperature", "Error");
        setText("weather", "Error");
        return;
    }

    // Charts are separate so a chart problem never blanks the cards
    try {
        createCharts(allRecords);
    } catch (error) {
        console.error("Error drawing charts:", error);
    }
}

function updateCards() {
    const latest = allRecords[allRecords.length - 1];

    setText("owl-count", latest.occupied ? "Occupied 🦉" : "Unoccupied");

    let activity = "In the box now";
    if (!latest.occupied) {
        const lastOcc = [...allRecords].reverse().find(r => r.occupied);
        activity = lastOcc
            ? "Last seen " + formatDuration(latest.time - lastOcc.time) + " before the latest reading"
            : "No owl seen yet";
    }
    setText("adult-owl-count", activity);

    setText("updated-local", LOCAL_LABEL + ": " + formatTime(latest.time));
    setText("updated-cali", CALI_LABEL + ": " + formatTime(latest.submitted));

    setText("temperature", isNaN(latest.temperature) ? "--" : latest.temperature.toFixed(1) + TEMP_UNIT);
    setText("weather", latest.weather || "--");

    const raining = latest.weather.toLowerCase().includes("rain");
    setText(
        "rain-status",
        (raining ? "☔ Raining" : "☀️ Not raining") + " — " + (latest.occupied ? "Owl in box" : "Box unoccupied")
    );
}

// {x, y} points; inserts a null point wherever data is missing so Chart.js draws a gap
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

function timeScale(start, end, unit) {
    return {
        type: "time",
        min: start,
        max: end,
        time: {
            unit: unit,
            tooltipFormat: "MMM d, h:mm a",
            displayFormats: { hour: "h a", day: "EEE MMM d" }
        },
        ticks: { maxTicksLimit: 8, autoSkip: true, maxRotation: 0 },
        title: { display: true, text: "Time (" + LOCAL_LABEL + ")" }
    };
}

function createCharts(records) {
    if (typeof Chart === "undefined") {
        console.error("Chart.js did not load");
        return;
    }

    // Windows are anchored to the newest reading, not "now"
    const end = records[records.length - 1].time.getTime();
    const start = end - RANGES[currentRange];
    const inRange = records.filter(r => r.time.getTime() >= start);
    const showDots = currentRange === "24h";

    // Summary line
    const occCount = inRange.filter(r => r.occupied).length;
    const pct = Math.round((occCount / inRange.length) * 100);
    setText(
        "chart-summary",
        "Readings: " + inRange.length + "  ·  Owl present in " + pct + "% of readings (" + occCount + " of " + inRange.length + ")"
    );

    if (owlChart) owlChart.destroy();
    if (tempChart) tempChart.destroy();

    // ==========================
    // Occupancy over time (step chart: Empty = 0, Occupied = 1)
    // ==========================
    const owlCanvas = document.getElementById("owlChart");
    if (owlCanvas) {
        owlChart = new Chart(owlCanvas, {
            type: "line",
            data: {
                datasets: [
                    {
                        label: "Occupancy",
                        data: buildSeries(inRange, r => (r.occupied ? 1 : 0)),
                        yAxisID: "y",
                        stepped: "middle",
                        borderColor: "#dc2626",
                        backgroundColor: "rgba(220, 38, 38, 0.15)",
                        borderWidth: 2,
                        fill: true,
                        pointRadius: showDots ? 3 : 0,
                        pointHoverRadius: 5,
                        spanGaps: false
                    },
                    {
                        // Click "Confidence" in the legend to show/hide
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
                            ? "Owl Box Occupancy - Last 24 Hours"
                            : "Owl Box Occupancy - Last 7 Days"
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                if (ctx.parsed.y === null) return "";
                                return ctx.dataset.yAxisID === "y2"
                                    ? "Confidence: " + ctx.parsed.y + "%"
                                    : (ctx.parsed.y === 1 ? "Occupied" : "Empty");
                            }
                        }
                    }
                },
                scales: {
                    x: timeScale(start, end, currentRange === "24h" ? "hour" : "day"),
                    y: {
                        min: 0,
                        max: 1,
                        ticks: {
                            stepSize: 1,
                            callback: v => (v === 1 ? "Occupied" : v === 0 ? "Empty" : "")
                        },
                        title: { display: true, text: "Box status" }
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
    // Temperature (always the last 3 days)
    // ==========================
    const tempStart = end - TEMP_WINDOW_MS;
    const tempInRange = records.filter(r => r.time.getTime() >= tempStart);
    const tempCanvas = document.getElementById("tempChart");
    if (tempCanvas) {
        tempChart = new Chart(tempCanvas, {
            type: "line",
            data: {
                datasets: [{
                    label: "Temperature (" + TEMP_UNIT + ")",
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
                            label: ctx => (ctx.parsed.y === null ? "" : ctx.parsed.y.toFixed(1) + TEMP_UNIT)
                        }
                    }
                },
                scales: {
                    x: timeScale(tempStart, end, "day"),
                    y: { title: { display: true, text: TEMP_UNIT } }
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

if (shareBtn && !navigator.share) {
    shareBtn.style.display = "none";
}

if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
        try {
            await navigator.share({ title: document.title, url: window.location.href });
        } catch (err) {
            console.log("Share canceled or failed:", err);
        }
    });
}

// Initial load + refresh
loadData();
setInterval(loadData, REFRESH_MS);
