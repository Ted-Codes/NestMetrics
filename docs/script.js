// Google Sheet CSV link
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRMDh2FHRk4aiCq83pTnqvq7BIL1N6eWqjblQetiTT_pHkxdBkwV0C6KwtolOmy45yrfr5F7dWUEKjc/pub?output=csv";

let owlChart;
let tempChart;


// Load data from Google Sheets
async function loadData() {

    try {

        const response = await fetch(sheetURL + "&cache=" + new Date().getTime());
        const csvText = await response.text();

        const rows = csvText.trim().split("\n");

        // Convert CSV rows into arrays
        const data = rows.map(row => row.split(","));

        // Remove header row
        const headers = data.shift();

        // Get newest entry
        const latest = data[data.length - 1];


        /*
        Columns:
        0 = Timestamp (ignored)
        1 = Time Stamp
        2 = Owl Number
        3 = Temperature (Degrees)
        4 = Weather
        */


        const time = latest[1];
        const owlNumber = latest[2];
        const temperature = latest[3];
        const weather = latest[4];


        // Update dashboard cards

        document.getElementById("owl-count").textContent =
            owlNumber + " 🦉";

        document.getElementById("temperature").textContent =
            temperature + "°F";

        document.getElementById("weather").textContent =
            weather;

        document.getElementById("updated").textContent =
            time;



        // Create charts

        createCharts(data);


    } catch(error) {

        console.error("Error loading spreadsheet:", error);

        document.getElementById("owl-count").textContent =
            "Error";

    }

}




function createCharts(data) {


    let times = [];
    let owlCounts = [];
    let temperatures = [];


    data.forEach(row => {

        times.push(row[1]);

        owlCounts.push(Number(row[2]));

        temperatures.push(Number(row[3]));

    });



    // Destroy old charts when refreshing

    if (owlChart) {
        owlChart.destroy();
    }

    if (tempChart) {
        tempChart.destroy();
    }



    // Owl chart

    owlChart = new Chart(
        document.getElementById("owlChart"),
        {

            type: "line",

            data: {

                labels: times,

                datasets: [{

                    label: "Owls Detected",

                    data: owlCounts,

                    tension: 0.3

                }]

            },

            options: {

                responsive: true

            }

        }

    );



    // Temperature chart

    tempChart = new Chart(
        document.getElementById("tempChart"),
        {

            type: "line",

            data: {

                labels: times,

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



// Load immediately
loadData();


// Refresh every minute
setInterval(loadData, 60000);
