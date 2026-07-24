// Google Sheet CSV link
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSr18vuowtUDnqE_Sn2b9d_7lvAmGSvnPYaixiMnlhtWXSndXgcKQPn6NDmAtKmVkRf0_rw6Jr3ctIS/pub?output=csv";

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
        const beforebabyCount = Number(latest[3]);
        const beforeadultCount = Number(latest[4]);

        const babyCount = beforebabyCount;
        const adultCount = beforeadultCount;

        const temperature = latest[5];
        const weather = latest[6] || "";

        document.getElementById("owl-count").textContent =
            babyCount + " 🦉";
        document.getElementById("adult-owl-count").textContent =
            adultCount + "%";
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
    // Track owl sightings by hour of day (0–23), across all available data
    const sightingsByHour = new Array(24).fill(0);

    const temperatureTimes = [];
    const temperatures = [];

    data.forEach(row => {
        const timestamp = new Date(row[1]);
        const owlNumber = Number(row[3]); // Adult Owl Number — matches "Estimated Owl Count" card
        const temperature = Number(row[5]);

        // Temperature chart (unchanged)
        temperatureTimes.push(row[1]);
        temperatures.push(temperature);

        // Count a sighting whenever an owl was present, bucketed by hour of day
        if (!isNaN(timestamp.getTime()) && owlNumber > 0) {
            sightingsByHour[timestamp.getHours()]++;
        }
    });

    // Build 12 AM–11 PM hour labels
    const labels = [];
    for (let h = 0; h < 24; h++) {
        const period = h < 12 ? "AM" : "PM";
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        labels.push(`${hour12} ${period}`);
    }

    // Destroy old charts before redrawing
    if (owlChart) owlChart.destroy();
    if (tempChart) tempChart.destroy();

    // ==========================
    // Owl Sightings by Hour Chart
    // ==========================
    owlChart = new Chart(
        document.getElementById("owlChart"),
        {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Owl Sightings",
                        data: sightingsByHour,
                        backgroundColor: "rgba(220, 38, 38, 0.7)",
                        borderColor: "rgba(220, 38, 38, 1)",
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
                        text: "Owl Sightings in the Box by Hour of Day"
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 }
                    },
                    x: {
                        title: { display: true, text: "Hour of Day" }
                    }
                }
            }
        }
    );

    // ==========================
    // Temperature Chart (unchanged)
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
