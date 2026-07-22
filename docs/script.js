// Google Sheet CSV link
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQRn5zJpYlQn5Z4rgTvmzTYIwwYkcCXDXDETmUVSn8fMkUxJX_lVAzobr6ahJ8cwT_00rl9phb5gNjb/pub?output=csv";

let owlChart;
let tempChart;

// Load data from Google Sheets
async function loadData() {
    try {
        const response = await fetch(sheetURL + "&cache=" + Date.now());
        const csvText = await response.text();
        const rows = csvText.trim().split("\n");

        // Convert CSV rows into arrays
        const data = rows.map(row => row.split(","));

        // Remove header row
        data.shift();

        // Get newest row
        const latest = data[data.length - 1];

        /*
        Columns:
        0 = Timestamp (form submit time, ignored)
        1 = Time Stamp (capture time)
        2 = Baby Owl Number
        3 = Adult Owl Number
        4 = Confidence Percent
        5 = Temperature (Degrees)
        6 = Weather
        */
        const beforebabyCount = Number(latest[2]);
        const beforeadultCount = Number(latest[3]);

        const babyCount = beforebabyCount * 2;
        const adultCount = beforeadultCount * 2;

        const temperature = latest[5];
        const weather = latest[6] || "";

        document.getElementById("owl-count").textContent =
            babyCount + " 🦉";
        document.getElementById("adult-owl-count").textContent =
            adultCount + " 🦉";
        document.getElementById("temperature").textContent =
            temperature + "°F";
        document.getElementById("weather").textContent =
            weather;
        document.getElementById("updated").textContent =
            latest[1];

        // Rain / adult-in-box status
        const isRaining = weather.toLowerCase().includes("rain");
        const adultInBox = adultCount > 0;
        const rainStatusEl = document.getElementById("rain-status");
        if (rainStatusEl) {
            if (isRaining && adultInBox) {
                rainStatusEl.textContent = "☔ Raining — Adult in box";
            } else if (isRaining && !adultInBox) {
                rainStatusEl.textContent = "☔ Raining — Adult left box";
            } else if (adultInBox) {
                rainStatusEl.textContent = "☀️ Not raining — Adult in box";
            } else {
                rainStatusEl.textContent = "☀️ Not raining — Adult not in box";
            }
        }

        createCharts(data);
    } catch (error) {
        console.error("Error loading spreadsheet:", error);
        document.getElementById("owl-count").textContent = "Error";
    }
}

function createCharts(data) {
    // Track the peak owlet count per calendar day, for the last 7 days
    const dailyMaxBabies = {}; // "M/D/YYYY" -> max baby count that day
    const temperatureTimes = [];
    const temperatures = [];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    data.forEach(row => {
        const timestamp = new Date(row[1]);
        const babyNumber = Number(row[2]);
        const temperature = Number(row[5]);

        // Temperature chart
        temperatureTimes.push(row[1]);
        temperatures.push(temperature);

        // Owl activity: keep the largest reading per day
        if (!isNaN(timestamp.getTime()) && timestamp >= sevenDaysAgo) {
            const dayKey = timestamp.toLocaleDateString(); // e.g. "7/22/2026"
            if (!(dayKey in dailyMaxBabies) || babyNumber > dailyMaxBabies[dayKey]) {
                dailyMaxBabies[dayKey] = babyNumber;
            }
        }
    });

    // Build the last 7 calendar days in order, even if some have no data
    const labels = [];
    const peakCounts = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayKey = d.toLocaleDateString();
        labels.push(d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
        peakCounts.push(dailyMaxBabies[dayKey] || 0);
    }

    // Destroy old charts before redrawing
    if (owlChart) owlChart.destroy();
    if (tempChart) tempChart.destroy();

    // ==========================
    // Owl Activity Chart (daily peak)
    // ==========================
    owlChart = new Chart(
        document.getElementById("owlChart"),
        {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Peak Owlet Count",
                        data: peakCounts,
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Owlet Count Over the Last 7 Days (Daily Peak)"
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 }
                    }
                }
            }
        }
    );

    // ==========================
    // Temperature Chart
    // ==========================
    tempChart = new Chart(
        document.getElementById("tempChart"),
        {
            type: "line",
            data: {
                labels: temperatureTimes,
                datasets: [{
                    label: "Temperature (°F)",
                    data: temperatures,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true
            }
        }
    );
}

const shareBtn = document.getElementById('nativeShareBtn');

// Hide the button if the browser doesn't support native sharing
if (shareBtn && !navigator.share) {
  shareBtn.style.display = 'none';
}

// Trigger the native device share menu when clicked
shareBtn?.addEventListener('click', async () => {
  try {
    await navigator.share({
      title: document.title,
      url: window.location.href
    });
  } catch (err) {
    console.log('Share canceled or failed:', err);
  }
});

// Initial load
loadData();

// Refresh every minute
setInterval(loadData, 60000);
