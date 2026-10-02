// ==========================
// NestMetrics - script.js
// ==========================

// Google Sheet CSV link (a page can override this with <body data-sheet="...">)
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIDCT6OHYQGa_YHxcmMhp1IZuUfJzBqbV5n1MlZqvBzfM4zWyvd4jyo5Gi2vPgoGeCVXbmRwOU0jnx/pub?output=csv";
const sheetURL = document.body.dataset.sheet || DEFAULT_SHEET_URL;

const MAX_TEMP_POINTS = 100; // how many recent readings to show on the temperature chart

let owlChart;
let tempChart;

/*
Sheet columns:
0 = Timestamp      (form submit time, ignored)
1 = Time           (capture time, "MM-DD-YYYY H:MM AM/PM")
2 = Falcon_Count
3 = Confidence     (percent)
4 = Temperature    (°F)
5 = Weather
*/

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

// Parses "MM-DD-YYYY H:MM AM/PM" (also accepts "/" separators and 24-hour times)
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

// Turn raw CSV rows into clean records, sorted oldest -> newest
function toRecords(rows) {
    return rows
        .slice(1) // drop header
        .map(r => ({
            label: (r[1] || "").trim(),
            time: parseSheetTimestamp(r[1]),
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
        const records = toRecords(parseCSV(csvText));

        if (records.length === 0) {
            setText("owl-count", "No data");
            setText("adult-owl-count", "--");
            setText("updated", "--");
            setText("temperature", "--");
            setText("weather", "--");
            return;
        }

        const latest = records[records.length - 1];

        setText("owl-count", latest.count + " 🦅");
        setText("adult-owl-count", isNaN(latest.confidence) ? "--" : latest.confidence + "%");
        setText("temperature", isNaN(latest.temperature) ? "--" : latest.temperature.toFixed(1) + "°F");
        setText("weather", latest.weather || "--");
        setText("updated", latest.label);

        createCharts(records);
    } catch (error) {
        console.error("Error loading spreadsheet:", error);
        setText("owl-count", "Error");
        setText("adult-owl-count", "Error");
        setText("updated", "Error");
        setText("temperature", "Error");
        setText("weather", "Error");
    }
}

// Build a sortable "YYYY-M-D" key for a date
function dayKey(d) {
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function createCharts(records) {
    // ---- Daily peak falcon count, 7 days ending on the newest reading ----
    // (anchored to the data rather than "today" so a timezone difference between
    // the camera and the viewer can't push the newest day off the chart)
    const lastDay = new Date(records[records.length - 1].time);
    lastDay.setHours(0, 0, 0, 0);

    const dailyMax = {};
    records.forEach(rec => {
        const key = dayKey(rec.time);
        if (!(key in dailyMax) || rec.count > dailyMax[key]) {
            dailyMax[key] = rec.count;
        }
    });

    const labels = [];
    const peakCounts = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(lastDay);
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
        peakCounts.push(dailyMax[dayKey(d)] || 0);
    }

    // ---- Temperature history (most recent readings) ----
    const recent = records.slice(-MAX_TEMP_POINTS);
    const temperatureTimes = recent.map(r => r.label);
    const temperatures = recent.map(r => (isNaN(r.temperature) ? null : r.temperature));

    // Destroy old charts before redrawing
    if (owlChart) owlChart.destroy();
    if (tempChart) tempChart.destroy();

    // Falcon activity chart
    owlChart = new Chart(document.getElementById("owlChart"), {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Peak Falcon Count",
                data: peakCounts,
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: "Falcon Count Over the Last 7 Days (Daily Peak)"
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });

    // Temperature chart
    tempChart = new Chart(document.getElementById("tempChart"), {
        type: "line",
        data: {
            labels: temperatureTimes,
            datasets: [{
                label: "Temperature (°F)",
                data: temperatures,
                tension: 0.3,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { ticks: { maxTicksLimit: 8 } }
            }
        }
    });
}

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

// Refresh every minute
setInterval(loadData, 60000);
