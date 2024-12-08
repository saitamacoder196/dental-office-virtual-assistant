const express = require("express");
const app = express();
const bodyParser = require("body-parser");

// Middleware configuration for parsing JSON
app.use(bodyParser.json());
app.use(express.json());

// Mock Data Constants
const MOCK_AVAILABLE_SLOTS = {
    date: "2024-12-10",
    available_slots: [
        "09:00", "10:00", "11:00",
        "14:00", "15:00", "16:00"
    ]
};

const MOCK_APPOINTMENT = {
    id: 123,
    patientName: "John Doe",
    date: "2024-12-10",
    time: "09:00",
    serviceId: 1,
    status: "confirmed"
};

const MOCK_SERVICES = [
    { id: 1, name: "Cleaning", duration: 60, price: 100 },
    { id: 2, name: "Checkup", duration: 30, price: 50 },
    { id: 3, name: "Whitening", duration: 90, price: 200 },
    { id: 4, name: "Root Canal", duration: 120, price: 500 }
];

const MOCK_INSURANCE = [
    { id: 1, name: "BlueCross", coverage: "80%" },
    { id: 2, name: "Aetna", coverage: "75%" },
    { id: 3, name: "Cigna", coverage: "70%" }
];

const MOCK_SERVICE_PRICE = {
    service: "Cleaning",
    price: 100,
    currency: "USD"
};

const MOCK_INSURANCE_VERIFY = {
    verified: true,
    provider: "BlueCross",
    coverage: "80%"
};

// API Endpoints
// Endpoint to get available appointment slots
app.get("/api/availability", (req, res) => {
    console.log('📅 Returning mock available slots for the date:', MOCK_AVAILABLE_SLOTS.date);
    res.json(MOCK_AVAILABLE_SLOTS);
});

// Endpoint to create a new appointment
app.post("/api/appointments", (req, res) => {
    console.log('📝 Creating mock appointment with data:', req.body);
    res.status(201).json(MOCK_APPOINTMENT);
});

// Endpoint to cancel an appointment
app.delete("/api/appointments/:id", (req, res) => {
    console.log('🗑️ Simulating appointment cancellation for ID:', req.params.id);
    res.json({ 
        message: "Appointment successfully canceled",
        id: req.params.id 
    });
});

// Endpoint to get the list of services
app.get("/api/services", (req, res) => {
    console.log('🏥 Returning mock services list');
    res.json(MOCK_SERVICES);
});

// Endpoint to get the price of a specific service
app.get("/api/services/:id/price", (req, res) => {
    console.log('💰 Returning mock price for service ID:', req.params.id);
    res.json(MOCK_SERVICE_PRICE);
});

// Endpoint to get the list of insurance providers
app.get("/api/insurance", (req, res) => {
    console.log('🏥 Returning mock insurance providers list');
    res.json(MOCK_INSURANCE);
});

// Endpoint to verify insurance
app.post("/api/insurance/verify", (req, res) => {
    console.log('✅ Returning mock insurance verification for insurance ID:', req.body.insuranceId);
    res.json(MOCK_INSURANCE_VERIFY);
});

// Server configuration
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
});
