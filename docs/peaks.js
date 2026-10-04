// ============================================================
// NESTMETRICS - OWL BOX ANALYTICS
// ============================================================

// ---------- CONFIG (change these per stream page) ----------
const sheetURL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSr18vuowtUDnqE_Sn2b9d_7lvAmGSvnPYaixiMnlhtWXSndXgcKQPn6NDmAtKmVkRf0_rw6Jr3ctIS/pub?output=csv";

const LOCAL_LABEL = "UK";          // timezone of the owl box (sheet column 2)
const CALI_LABEL  = "California";  // sheet column 1
const TEMP_DAYS   = 3;             // temperature graph window
const TEMP_UNIT   = "°F";

/*
 GOOGLE SHEET COLUMNS
 0 = Timestamp, California time (e.g. 8/16/2026 20:46:17)
 1 = Time, local time at the box  (e.g. 08-17-2026 04:46 AM)
 2 = Baby Owl Number  (ignored)
 3 = Occupancy ("Occupied" / anything else = unoccupied)
 4 = Confidence       (ignored)
 5 = Temperature
 6 = Weather
*/

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let owlChart, tempChart;
let rows = [];            // cleaned, sorted rows
let occupancyZone = "local";
let occupancyMeta = { occ: [], total: [] };


// ============================================================
// CSV PARSER (handles quotes, commas and newlines in fields)
// ============================================================

function parseCSV(text) {
    const out = [];
    let row = [], field = "", inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i], next = text[i + 1];

        if (inQuotes) {
            if (c === '"' && next === '"') { field += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\r") { /* ignore */ }
        else if (c === "\n") { row.push(field); field = ""; out.push(row); row = []; }
        else field += c;
    }

    if (field.length > 0 || row.length > 0) { row.push(field); out.push(row); }
    return out.filter(r => r.some(cell => cell.trim() !== ""));
}


// ============================================================
// TIME HELPERS
// ============================================================
// Timestamps are stored as "wall clock" milliseconds (built with
// Date.UTC) so the viewer's own timezone / DST never shifts them.
// Accepts M/D/YYYY or MM-DD-YYYY, 24h or AM/PM, optional seconds.
// ============================================================

function parseTimestamp(str) {
    if (!str) return null;

    const m = str.trim().match(
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
    );
    if (!m) return null;

    const [, mo, d, y, rawH, mi, s, ap] = m;
    let h = Number(rawH);

    if (ap) {
        const pm = ap.toUpperCase() === "PM";
        if (pm && h !== 12) h += 12;
        if (!pm && h === 12) h = 0;
    }

    return Date.UTC(Number(y), Number(mo) - 1, Number(d), h, Number(mi), Number(s || 0));
}

function fmtTime(ms) {
    if (ms == null) return "N/A";
    const dt = new Date(ms);
    let h = dt.getUTCHours();
    const ap = h < 12 ? "AM" : "PM";
    h = h % 12 || 12;
    const min = String(dt.getUTCMinutes()).padStart(2, "0");
    return `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${h}:${min} ${ap}`;
}

function fmtHour(h) {
    return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

function fmtDuration(ms) {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return `${hrs}h ${mins % 60}m`;
    return `${Math.floor(hrs / 24)} days`;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}


// ============================================================
// LOAD DATA
// ============================================================

async function loadData() {
    try {
        const response = await fetch(sheetURL + "&cache=" + Date.now());
        if (!response.ok) throw new Error("HTTP " + response.status);

        const data = parseCSV(await response.text());
        data.shift(); // header row

        rows = data
            .map(r => ({
                cali: parseTimestamp(r[0]),
                local: parseTimestamp(r[1]),
                occupied: (r[3] || "").trim().toLowerCase() === "occupied",
                temp: parseFloat(r[5]),               // NaN if blank
                weather: (r[6] || "").trim()
            }))
            .filter(r => r.local !== null)
            .sort((a, b) => a.local - b.local);       // newest = last, always

        if (rows.length === 0) {
            console.error("No usable spreadsheet data found.");
            setText("owl-count", "No data");
            return;
        }

        updateCurrent();
        renderOccupancyChart();
        renderTempChart();

    } catch (error) {
        console.error("Error loading spreadsheet:", error);
        setText("owl-count", "Error");
    }
}


// ============================================================
// CURRENT STATUS CARDS
// ============================================================

function updateCurrent() {
    const latest = rows[rows.length - 1];

    // Nest box status
    setText("owl-count", latest.occupied ? "Occupied 🦉" : "Unoccupied");

    // Owl activity: when was an owl last seen?
    let activity;
    if (latest.occupied) {
        activity = "In the box now";
    } else {
        let lastOcc = null;
        for (let i = rows.length - 1; i >= 0; i--) {
            if (rows[i].occupied) { lastOcc = rows[i]; break; }
        }
        activity = lastOcc
            ? `Last seen ${fmtDuration(latest.local - lastOcc.local)} before the latest reading`
            : "No owl seen yet";
    }
    setText("adult-owl-count", activity);

    // Last updated, both timezones
    setText("updated-local", `${LOCAL_LABEL}: ${fmtTime(latest.local)}`);
    setText("updated-cali", `${CALI_LABEL}: ${fmtTime(latest.cali)}`);

    // Temperature (skip blanks)
    setText("temperature", Number.isFinite(latest.temp) ? latest.temp + TEMP_UNIT : "N/A");

    // Weather
    setText("weather", latest.weather || "N/A");

    // Rain + occupancy
    const raining = latest.weather.toLowerCase().includes("rain");
    const box = latest.occupied ? "Owl in box" : "Box unoccupied";
    setText("rain-status", `${raining ? "☔ Raining" : "☀️ Not raining"} — ${box}`);
}


// ============================================================
// OCCUPANCY CHART
// ============================================================
// Raw counts per hour are misleading (an hour with more
// readings always looks "busier"). Instead we plot the
// PERCENTAGE of readings in each hour that showed an owl.
// ============================================================

function renderOccupancyChart() {
    const total = new Array(24).fill(0);
    const occ = new Array(24).fill(0);

    rows.forEach(r => {
        const t = r[occupancyZone === "local" ? "local" : "cali"];
        if (t == null) return;
        const h = new Date(t).getUTCHours();
        total[h]++;
        if (r.occupied) occ[h]++;
    });

    occupancyMeta = { occ, total };

    const pct = total.map((n, i) => (n ? Math.round((occ[i] / n) * 1000) / 10 : null));
    const zoneName = occupancyZone === "local" ? LOCAL_LABEL : CALI_LABEL;
    const labels = Array.from({ length: 24 }, (_, h) => fmtHour(h));

    if (!owlChart) {
        const el = document.getElementById("owlChart");
        if (!el) return;

        owlChart = new Chart(el, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "% of readings occupied",
                    data: pct,
                    backgroundColor: "rgba(220, 38, 38, 0.7)",
                    borderColor: "rgba(220, 38, 38, 1)",
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: { display: true, text: "" },
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const i = ctx.dataIndex;
                                return `${ctx.parsed.y}% occupied (${occupancyMeta.occ[i]} of ${occupancyMeta.total[i]} readings)`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: v => v + "%" },
                        title: { display: true, text: "Readings with owl present" }
                    },
                    x: { title: { display: true, text: "" } }
                }
            }
        });
    } else {
        owlChart.data.datasets[0].data = pct;
    }

    owlChart.options.plugins.title.text = `Owl Box Occupancy by Hour (${zoneName} time)`;
    owlChart.options.scales.x.title.text = `Hour of day, ${zoneName} time`;
    owlChart.update();

    // Toggle button highlight
    document.querySelectorAll("[data-zone]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.zone === occupancyZone);
    });
}


// ============================================================
// TEMPERATURE CHART (last N days, true time spacing)
// ============================================================

function renderTempChart() {
    const newest = rows[rows.length - 1].local;
    const cutoff = newest - TEMP_DAYS * 24 * 60 * 60 * 1000;

    const points = rows
        .filter(r => r.local >= cutoff && Number.isFinite(r.temp))
        .map(r => ({ x: r.local, y: r.temp }));

    if (!tempChart) {
        const el = document.getElementById("tempChart");
        if (!el) return;

        tempChart = new Chart(el, {
            type: "line",
            data: {
                datasets: [{
                    label: `Temperature (${TEMP_UNIT})`,
                    data: points,
                    borderColor: "rgba(37, 99, 235, 1)",
                    backgroundColor: "rgba(37, 99, 235, 0.15)",
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Temperature, last ${TEMP_DAYS} days (${LOCAL_LABEL} time)`
                    },
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: items => fmtTime(items[0].parsed.x),
                            label: ctx => `${ctx.parsed.y}${TEMP_UNIT}`
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        ticks: { maxTicksLimit: 8, callback: v => fmtTime(v) }
                    },
                    y: { title: { display: true, text: `Temperature (${TEMP_UNIT})` } }
                }
            }
        });
    } else {
        tempChart.data.datasets[0].data = points;
        tempChart.update();
    }
}


// ============================================================
// BUTTONS
// ============================================================

document.querySelectorAll("[data-zone]").forEach(btn => {
    btn.addEventListener("click", () => {
        occupancyZone = btn.dataset.zone;
        if (rows.length) renderOccupancyChart();
    });
});

const shareBtn = document.getElementById("nativeShareBtn");

if (shareBtn && !navigator.share) shareBtn.style.display = "none";

shareBtn?.addEventListener("click", async () => {
    try {
        await navigator.share({ title: document.title, url: window.location.href });
    } catch (err) {
        console.log("Share canceled or failed:", err);
    }
});


// ============================================================
// INITIAL LOAD + REFRESH EVERY MINUTE
// ============================================================

loadData();
setInterval(loadData, 60000);
