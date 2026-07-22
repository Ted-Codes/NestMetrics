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
