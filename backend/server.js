
const express = require("express"); // Import Express to create the API server.
const cors = require("cors"); // Import CORS to allow frontend requests.
const mongoose = require("mongoose"); // Import Mongoose to connect to MongoDB.
require("dotenv").config(); // Load environment variables from the .env file.

const app = express(); // Create the Express application.
const PORT = process.env.PORT || 5000; // Set the server port.

// Configure middleware.
app.use(cors()); // Allow cross-origin requests.
app.use(express.json()); // Parse incoming JSON request bodies.

// Define the medicine schema.
const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // Store the medicine name.
    category: { type: String, required: true, trim: true }, // Store its category.
    batchNumber: { type: String, required: true, trim: true }, // Store its batch number.
    currentStock: { type: Number, required: true, min: 0, default: 0 }, // Store current quantity.
    minimumStock: { type: Number, required: true, min: 0, default: 10 }, // Store the low-stock threshold.
    purchasePrice: { type: Number, required: true, min: 0 }, // Store the purchase price in rupees.
    sellingPrice: { type: Number, required: true, min: 0 }, // Store the selling price in rupees.
    expiryDate: { type: Date, required: true }, // Store the expiry date.
    supplier: { type: String, trim: true, default: "Unknown" }, // Store the supplier name.
  },
  { timestamps: true } // Automatically record creation and update times.
);

// Create the medicine model after defining its schema.
const Medicine = mongoose.model("Medicine", medicineSchema);

// Welcome endpoint.
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Kairos AI Backend",
    status: "running",
  });
});

// Temporary diagnostic route to check route registration.
app.get("/api/test-route", (req, res) => {
  res.json({
    success: true,
    message: "Correct server file is running.",
  });
});

// Health-check endpoint.
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Kairos AI API is working",
  });
});

// Fetch all medicine records.
app.get("/api/medicines", async (req, res) => {
  try {
    const medicines = await Medicine.find().sort({ createdAt: -1 }); // Fetch newest records first.

    res.status(200).json({
      success: true,
      count: medicines.length,
      data: medicines,
    });
  } catch (error) {
    console.error("Medicine fetch failed:", error.message); // Log the internal error.
    res.status(500).json({
      success: false,
      message: "Failed to fetch medicines.",
    });
  }
});

// Add a medicine record.
app.post("/api/medicines", async (req, res) => {
  try {
    const medicine = await Medicine.create(req.body); // Validate and save the medicine.

    res.status(201).json({
      success: true,
      message: "Medicine added successfully.",
      data: medicine,
    });
  } catch (error) {
    const isValidationError = error.name === "ValidationError"; // Check for invalid input.

    res.status(isValidationError ? 400 : 500).json({
      success: false,
      message: isValidationError ? error.message : "Failed to add medicine.",
    });
  }
});

// Start the server only after connecting to MongoDB.
async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from the .env file.");
    }

    await mongoose.connect(process.env.MONGODB_URI); // Connect to MongoDB Atlas.
    console.log("MongoDB Atlas connected successfully."); // Confirm database connection.

    
      // Listen on all network interfaces so Sakshi's laptop can reach the backend.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Kairos AI backend running at http://localhost:${PORT}`);
});
  } catch (error) {
    console.error("Backend startup failed:", error.message); // Display startup errors.
    process.exit(1); // Stop if the backend cannot start correctly.
  }
}

startServer(); // Run the startup function.
