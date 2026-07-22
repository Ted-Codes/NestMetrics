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
    const hourlyBabyCounts = new Array(24).fill(0);
    const hourlyAdultCounts = new Array(24).fill(0);
    const temperatureTimes = [];
    const temperatures = [];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    data.forEach(row => {
        const timestamp = new Date(row[1]);
        const babyNumber = Number(row[2]);
        const adultNumber = Number(row[3]);
        const temperature = Number(row[5]);

        // Temperature chart
        temperatureTimes.push(row[1]);
        temperatures.push(temperature);

        // Owl activity chart (last 7 days)
        if (!isNaN(timestamp.getTime()) && timestamp >= sevenDaysAgo) {
            hourlyBabyCounts[timestamp.getHours()] += babyNumber;
            hourlyAdultCounts[timestamp.getHours()] += adultNumber;
        }
    });

    // Destroy old charts before redrawing
    if (owlChart) owlChart.destroy();
    if (tempChart) tempChart.destroy();

    // ==========================
    // Owl Activity Chart
    // ==========================
    owlChart = new Chart(
        document.getElementById("owlChart"),
        {
            type: "bar",
            data: {
                labels: [
                    "12 AM","1 AM","2 AM","3 AM","4 AM","5 AM",
                    "6 AM","7 AM","8 AM","9 AM","10 AM","11 AM",
                    "12 PM","1 PM","2 PM","3 PM","4 PM","5 PM",
                    "6 PM","7 PM","8 PM","9 PM","10 PM","11 PM"
                ],
                datasets: [
                    {
                        label: "Baby Owls Detected (Last 7 Days)",
                        data: hourlyBabyCounts,
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: "Adult Owls Detected (Last 7 Days)",
                        data: hourlyAdultCounts,
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
                        text: "Owlet Count Over the Last 7 Days"
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
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
