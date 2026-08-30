// ============================================================
// OWL BOX WEBSITE - SCRIPT
// ============================================================

// Google Sheet CSV link
const sheetURL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSr18vuowtUDnqE_Sn2b9d_7lvAmGSvnPYaixiMnlhtWXSndXgcKQPn6NDmAtKmVkRf0_rw6Jr3ctIS/pub?output=csv";

let owlChart;
let tempChart;


// ============================================================
// LOAD DATA FROM GOOGLE SHEETS
// ============================================================

async function loadData() {
    try {
        // Add timestamp to prevent browser caching
        const response = await fetch(
            sheetURL + "&cache=" + Date.now()
        );

        const csvText = await response.text();

        // Split CSV into rows
        const rows = csvText.trim().split("\n");

        // Convert rows into arrays
        const data = rows.map(row => row.split(","));

        // Remove header row
        data.shift();

        // Make sure there is data
        if (data.length === 0) {
            console.error("No data found in spreadsheet.");
            return;
        }

        // Get newest row
        const latest = data[data.length - 1];


        /*
        ========================================================
        GOOGLE SHEET COLUMNS
        ========================================================

        0 = Timestamp
        1 = Time Stamp
        2 = Occupancy
        3 = Temperature
        4 = Weather
        ========================================================
        */


        // ----------------------------------------------------
        // Get latest values
        // ----------------------------------------------------

        const occupancy = (latest[2] || "").trim();
        const temperature = latest[3] || "";
        const weather = latest[4] || "";


        // ----------------------------------------------------
        // Determine whether box is occupied
        // ----------------------------------------------------

        const isOccupied =
            occupancy.toLowerCase() === "occupied";


        // ====================================================
        // UPDATE WEBSITE
        // ====================================================


        // Occupancy card
        const owlCountElement =
            document.getElementById("owl-count");

        if (owlCountElement) {
            if (isOccupied) {
                owlCountElement.textContent = "Occupied 🦉";
            } else {
                owlCountElement.textContent = "Unoccupied";
            }
        }


        // Secondary occupancy display
        const occupancyElement =
            document.getElementById("adult-owl-count");

        if (occupancyElement) {
            occupancyElement.textContent =
                isOccupied ? "Occupied" : "Unoccupied";
        }


        // Temperature
        const temperatureElement =
            document.getElementById("temperature");

        if (temperatureElement) {
            temperatureElement.textContent =
                temperature + "°F";
        }


        // Weather
        const weatherElement =
            document.getElementById("weather");

        if (weatherElement) {
            weatherElement.textContent =
                weather;
        }


        // Last updated
        const updatedElement =
            document.getElementById("updated");

        if (updatedElement) {
            updatedElement.textContent =
                latest[1];
        }


        // ====================================================
        // RAIN + OCCUPANCY STATUS
        // ====================================================

        const isRaining =
            weather.toLowerCase().includes("rain");

        const rainStatusElement =
            document.getElementById("rain-status");


        if (rainStatusElement) {

            if (isRaining && isOccupied) {

                rainStatusElement.textContent =
                    "☔ Raining — Owl in box";

            } else if (isRaining && !isOccupied) {

                rainStatusElement.textContent =
                    "☔ Raining — Box unoccupied";

            } else if (!isRaining && isOccupied) {

                rainStatusElement.textContent =
                    "☀️ Not raining — Owl in box";

            } else {

                rainStatusElement.textContent =
                    "☀️ Not raining — Box unoccupied";
            }
        }


        // ====================================================
        // CREATE / UPDATE CHARTS
        // ====================================================

        createCharts(data);


    } catch (error) {

        console.error(
            "Error loading spreadsheet:",
            error
        );

        const owlCountElement =
            document.getElementById("owl-count");

        if (owlCountElement) {
            owlCountElement.textContent =
                "Error";
        }
    }
}



// ============================================================
// PARSE GOOGLE SHEETS TIMESTAMP
// ============================================================

function parseSheetTimestamp(str) {

    if (!str) {
        return new Date(NaN);
    }

    const trimmed = str.trim();

    const match = trimmed.match(
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i
    );

    if (!match) {
        return new Date(NaN);
    }


    const [
        ,
        month,
        day,
        year,
        rawHours,
        minutes,
        meridiem
    ] = match;


    let hours = Number(rawHours);


    // Convert 12-hour time to 24-hour time
    if (meridiem) {

        const isPM =
            meridiem.toUpperCase() === "PM";

        if (isPM && hours !== 12) {
            hours += 12;
        }

        if (!isPM && hours === 12) {
            hours = 0;
        }
    }


    return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        hours,
        Number(minutes)
    );
}



// ============================================================
// CREATE CHARTS
// ============================================================

function createCharts(data) {


    // ========================================================
    // OCCUPANCY BY HOUR
    // ========================================================

    const occupiedByHour =
        new Array(24).fill(0);


    // ========================================================
    // TEMPERATURE DATA
    // ========================================================

    const temperatureTimes = [];
    const temperatures = [];


    // ========================================================
    // PROCESS EVERY ROW
    // ========================================================

    data.forEach(row => {

        // Parse timestamp
        const timestamp =
            parseSheetTimestamp(row[1]);


        // Get occupancy
        const occupancy =
            (row[2] || "").trim();


        // Get temperature
        const temperature =
            Number(row[3]);


        // ----------------------------------------------------
        // Temperature chart
        // ----------------------------------------------------

        if (!isNaN(temperature)) {

            temperatureTimes.push(row[1]);
            temperatures.push(temperature);
        }


        // ----------------------------------------------------
        // Occupancy chart
        // ----------------------------------------------------

        if (
            !isNaN(timestamp.getTime()) &&
            occupancy.toLowerCase() === "occupied"
        ) {

            occupiedByHour[
                timestamp.getHours()
            ]++;
        }

    });


    // ========================================================
    // BUILD TIME LABELS
    // ========================================================

    const labels = [];


    for (let h = 0; h < 24; h++) {

        const period =
            h < 12 ? "AM" : "PM";

        const hour12 =
            h % 12 === 0
                ? 12
                : h % 12;

        labels.push(
            `${hour12} ${period}`
        );
    }



    // ========================================================
    // DESTROY OLD CHARTS
    // ========================================================

    if (owlChart) {
        owlChart.destroy();
    }

    if (tempChart) {
        tempChart.destroy();
    }



    // ========================================================
    // OCCUPANCY CHART
    // ========================================================

    const owlChartElement =
        document.getElementById("owlChart");


    if (owlChartElement) {

        owlChart = new Chart(
            owlChartElement,
            {
                type: "bar",

                data: {

                    labels: labels,

                    datasets: [

                        {
                            label: "Occupied Readings",

                            data: occupiedByHour,

                            backgroundColor:
                                "rgba(220, 38, 38, 0.7)",

                            borderColor:
                                "rgba(220, 38, 38, 1)",

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

                            text:
                                "Owl Box Occupancy by Hour"
                        }

                    },


                    scales: {

                        y: {

                            beginAtZero: true,

                            ticks: {
                                precision: 0
                            },

                            title: {

                                display: true,

                                text:
                                    "Occupied Readings"
                            }
                        },


                        x: {

                            title: {

                                display: true,

                                text:
                                    "Hour of Day"
                            }
                        }

                    }

                }

            }
        );
    }



    // ========================================================
    // TEMPERATURE CHART
    // ========================================================

    const tempChartElement =
        document.getElementById("tempChart");


    if (tempChartElement) {

        tempChart = new Chart(
            tempChartElement,
            {
                type: "line",

                data: {

                    labels:
                        temperatureTimes,

                    datasets: [

                        {

                            label:
                                "Temperature (°F)",

                            data:
                                temperatures,

                            tension: 0.3
                        }

                    ]
                },


                options: {

                    responsive: true

                }

            }
        );
    }

}



// ============================================================
// NATIVE SHARE BUTTON
// ============================================================

const shareBtn =
    document.getElementById(
        "nativeShareBtn"
    );


// Hide button if browser doesn't support
// native sharing

if (
    shareBtn &&
    !navigator.share
) {

    shareBtn.style.display =
        "none";
}


// Share website

shareBtn?.addEventListener(
    "click",
    async () => {

        try {

            await navigator.share({

                title:
                    document.title,

                url:
                    window.location.href

            });

        } catch (err) {

            console.log(
                "Share canceled or failed:",
                err
            );
        }

    }
);



// ============================================================
// INITIAL LOAD
// ============================================================

loadData();



// ============================================================
// REFRESH EVERY MINUTE
// ============================================================

setInterval(
    loadData,
    60000
);
```
