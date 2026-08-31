// ============================================================
// NESTMETRICS - OWL BOX ANALYTICS
// ============================================================

// Google Sheet CSV link
const sheetURL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSr18vuowtUDnqE_Sn2b9d_7lvAmGSvnPYaixiMnlhtWXSndXgcKQPn6NDmAtKmVkRf0_rw6Jr3ctIS/pub?output=csv";

let owlChart;
let tempChart;


// ============================================================
// PROPER CSV PARSER
// ============================================================
// Handles quoted fields, commas inside quotes, and quoted
// fields that contain literal newlines (like your
// "Temperature\n" header). A naive .split("\n") /
// .split(",") breaks on all of these.
// ============================================================

function parseCSV(text) {

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {

        const char = text[i];
        const next = text[i + 1];

        if (inQuotes) {

            if (char === '"' && next === '"') {
                // Escaped quote inside a quoted field
                field += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                field += char;
            }

        } else {

            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(field);
                field = "";
            } else if (char === '\r') {
                // ignore, \n handles the line break
            } else if (char === '\n') {
                row.push(field);
                field = "";
                rows.push(row);
                row = [];
            } else {
                field += char;
            }
        }
    }

    // Push the last field/row if the file doesn't end with \n
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    // Drop any fully-empty trailing rows
    return rows.filter(r => r.some(cell => cell.trim() !== ""));
}



// ============================================================
// LOAD DATA
// ============================================================

async function loadData() {

    try {

        const response = await fetch(
            sheetURL + "&cache=" + Date.now()
        );

        const csvText = await response.text();

        const data = parseCSV(csvText);

        // Remove header row
        data.shift();

        // Make sure data exists
        if (data.length === 0) {
            console.error("No spreadsheet data found.");
            return;
        }

        // Newest row
        const latest = data[data.length - 1];


        /*
        ========================================================
        GOOGLE SHEET COLUMNS (confirmed from actual sheet)
        ========================================================

        0 = Timestamp (raw, e.g. 8/16/2026 20:46:17) → IGNORE
        1 = Time (formatted, e.g. 08-17-2026 04:46 AM) → USE
        2 = Baby Owl Number                            → IGNORE
        3 = Occupancy status ("Occupied"/etc.)         → USE
        4 = Confidence                                 → IGNORE
        5 = Temperature                                → USE
        6 = Weather                                    → USE

        Note: the sheet's header labels column 3 as
        "Adult Owl Number" but the actual values in that
        column are occupancy strings like "Occupied", so
        we read it as occupancy, same as before.

        ========================================================
        */


        // ----------------------------------------------------
        // Get latest values
        // ----------------------------------------------------

        const occupancy =
            (latest[3] || "").trim();

        const temperature =
            (latest[5] || "").trim();

        const weather =
            (latest[6] || "").trim();


        // ----------------------------------------------------
        // Determine occupancy
        // ----------------------------------------------------

        const isOccupied =
            occupancy.toLowerCase() === "occupied";


        // ====================================================
        // UPDATE OCCUPANCY
        // ====================================================

        const owlCountElement =
            document.getElementById("owl-count");

        if (owlCountElement) {

            owlCountElement.textContent =
                isOccupied ? "Occupied 🦉" : "Unoccupied";
        }


        // ====================================================
        // UPDATE SECONDARY OCCUPANCY DISPLAY
        // ====================================================

        const occupancyElement =
            document.getElementById("adult-owl-count");

        if (occupancyElement) {

            occupancyElement.textContent =
                isOccupied ? "Occupied" : "Unoccupied";
        }


        // ====================================================
        // UPDATE TEMPERATURE
        // ====================================================

        const temperatureElement =
            document.getElementById("temperature");

        if (temperatureElement) {

            temperatureElement.textContent =
                temperature !== "" ? temperature + "°F" : "N/A";
        }


        // ====================================================
        // UPDATE WEATHER
        // ====================================================

        const weatherElement =
            document.getElementById("weather");

        if (weatherElement) {

            weatherElement.textContent =
                weather !== "" ? weather : "N/A";
        }


        // ====================================================
        // UPDATE TIMESTAMP
        // ====================================================

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
        // CREATE CHARTS
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
// Handles both M/D/YYYY and MM-DD-YYYY, with optional
// leading zeros, followed by H:MM and an optional AM/PM.
// ============================================================

function parseSheetTimestamp(str) {

    if (!str) {
        return new Date(NaN);
    }

    const trimmed =
        str.trim();


    const match =
        trimmed.match(
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


    let hours =
        Number(rawHours);


    // Convert AM / PM
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
    // PROCESS DATA
    // ========================================================

    data.forEach(row => {


        // ----------------------------------------------------
        // Timestamp
        // ----------------------------------------------------

        const timestamp =
            parseSheetTimestamp(row[1]);


        // ----------------------------------------------------
        // Occupancy
        // ----------------------------------------------------

        const occupancy =
            (row[3] || "").trim();


        // ----------------------------------------------------
        // Temperature
        // ----------------------------------------------------

        const temperature =
            Number(row[5]);


        // ====================================================
        // TEMPERATURE GRAPH
        // ====================================================

        if (!isNaN(temperature)) {

            temperatureTimes.push(
                row[1]
            );

            temperatures.push(
                temperature
            );
        }


        // ====================================================
        // OCCUPANCY GRAPH
        // ====================================================

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
    // TIME LABELS
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
    // DESTROY PREVIOUS CHARTS
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

        owlChart =
            new Chart(
                owlChartElement,
                {

                    type: "bar",

                    data: {

                        labels: labels,

                        datasets: [

                            {

                                label:
                                    "Occupied Readings",

                                data:
                                    occupiedByHour,

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

        tempChart =
            new Chart(
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
// SHARE BUTTON
// ============================================================

const shareBtn =
    document.getElementById(
        "nativeShareBtn"
    );


// Hide share button if unsupported
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
