// Google Sheet CSV link
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRMDh2FHRk4aiCq83pTnqvq7BIL1N6eWqjblQetiTT_pHkxdBkwV0C6KwtolOmy45yrfr5F7dWUEKjc/pub?output=csv";

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
        0 = Timestamp (ignored)
        1 = Time Stamp
        2 = Owl Number
        3 = Temperature
        4 = Weather
        */

        document.getElementById("owl-count").textContent =
            latest[2] + " 🦉";

        document.getElementById("temperature").textContent =
            latest[3] + "°F";

        document.getElementById("weather").textContent =
            latest[4];

        document.getElementById("updated").textContent =
            latest[1];

        createCharts(data);

    } catch (error) {

        console.error("Error loading spreadsheet:", error);

        document.getElementById("owl-count").textContent = "Error";

    }

}

function createCharts(data) {

    const hourlyCounts = new Array(24).fill(0);

    const temperatureTimes = [];
    const temperatures = [];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    data.forEach(row => {

        const timestamp = new Date(row[1]);

        const owlNumber = Number(row[2]);
        const temperature = Number(row[3]);

        // Temperature chart
        temperatureTimes.push(row[1]);
        temperatures.push(temperature);

        // Owl activity chart (last 7 days)
        if (!isNaN(timestamp.getTime()) && timestamp >= sevenDaysAgo) {

            hourlyCounts[timestamp.getHours()] += owlNumber;

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

                datasets: [{

                    label: "Owls Detected (Last 7 Days)",

                    data: hourlyCounts,

                    borderWidth: 1,

                    borderRadius: 6

                }]

            },

            options: {

                responsive: true,

                plugins: {

                    title: {

                        display: true,

                        text: "Owl Activity by Hour (Last 7 Days)"

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

// Initial load
loadData();

// Refresh every minute
setInterval(loadData, 60000);
