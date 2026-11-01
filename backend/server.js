
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Medicine Schema
const medicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      required: true,
      trim: true
    },
    batchNumber: {
      type: String,
      required: true,
      trim: true
    },
    currentStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    minimumStock: {
      type: Number,
      required: true,
      min: 0,
      default: 10
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: 0
    },
    sellingPrice: {
      type: Number,
      required: true,
      min: 0
    },
    expiryDate: {
      type: Date,
      required: true
    },
    supplier: {
      type: String,
      trim: true,
      default: "Unknown"
    }
  },
  { timestamps: true }
);

const Medicine = mongoose.model("Medicine", medicineSchema);

// Helper: Validate MongoDB ID
const isValidId = (id) => mongoose.isValidObjectId(id);

// Welcome Route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to Kairos AI Backend",
    status: "running"
  });
});

// Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Kairos AI API is working",
    database: mongoose.connection.readyState === 1
      ? "connected"
      : "disconnected"
  });
});

// Test Route
app.get("/api/test-route", (req, res) => {
  res.json({
    success: true,
    message: "Correct server file is running."
  });
});

// GET All Medicines
app.get("/api/medicines", async (req, res) => {
  try {
    const medicines = await Medicine.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: medicines.length,
      data: medicines
    });
  } catch (error) {
    console.error("Medicine fetch error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch medicines."
    });
  }
});

// GET Medicine by ID
app.get("/api/medicines/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid medicine ID."
      });
    }

    const medicine = await Medicine.findById(id);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found."
      });
    }

    res.status(200).json({
      success: true,
      data: medicine
    });
  } catch (error) {
    console.error("Medicine fetch error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch medicine."
    });
  }
});

// ADD Medicine
app.post("/api/medicines", async (req, res) => {
  try {
    const medicine = await Medicine.create(req.body);

    res.status(201).json({
      success: true,
      message: "Medicine added successfully.",
      data: medicine
    });
  } catch (error) {
    console.error("Medicine creation error:", error.message);

    res.status(error.name === "ValidationError" ||
      error.name === "CastError" ? 400 : 500).json({
      success: false,
      message: error.message
    });
  }
});

// UPDATE Medicine
app.put("/api/medicines/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid medicine ID."
      });
    }

    const allowedFields = [
      "name",
      "category",
      "batchNumber",
      "currentStock",
      "minimumStock",
      "purchasePrice",
      "sellingPrice",
      "expiryDate",
      "supplier"
    ];

    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update."
      });
    }

    const medicine = await Medicine.findByIdAndUpdate(
      id,
      { $set: updates },
      {
        new: true,
        runValidators: true
      }
    );

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found."
      });
    }

    res.status(200).json({
      success: true,
      message: "Medicine updated successfully.",
      data: medicine
    });
  } catch (error) {
    console.error("Medicine update error:", error.message);

    res.status(error.name === "ValidationError" ||
      error.name === "CastError" ? 400 : 500).json({
      success: false,
      message: error.message
    });
  }
});

// DELETE Medicine
app.delete("/api/medicines/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid medicine ID."
      });
    }

    const medicine = await Medicine.findByIdAndDelete(id);

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: "Medicine not found."
      });
    }

    res.status(200).json({
      success: true,
      message: "Medicine deleted successfully."
    });
  } catch (error) {
    console.error("Medicine deletion error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete medicine."
    });
  }
});

// GET Low-Stock Medicines
app.get("/api/medicines/low-stock", async (req, res) => {
  try {
    const medicines = await Medicine.find({
      $expr: {
        $lte: ["$currentStock", "$minimumStock"]
      }
    }).sort({ currentStock: 1 });

    res.status(200).json({
      success: true,
      count: medicines.length,
      data: medicines
    });
  } catch (error) {
    console.error("Low-stock fetch error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch low-stock medicines."
    });
  }
});

// GET Medicines Approaching Expiry
app.get("/api/medicines/expiring", async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;

    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        message: "Days must be between 1 and 365."
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiryLimit = new Date(today);
    expiryLimit.setDate(expiryLimit.getDate() + days);

    const medicines = await Medicine.find({
      expiryDate: {
        $gte: today,
        $lte: expiryLimit
      },
      currentStock: { $gt: 0 }
    }).sort({ expiryDate: 1 });

    res.status(200).json({
      success: true,
      count: medicines.length,
      data: medicines
    });
  } catch (error) {
    console.error("Expiry fetch error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expiring medicines."
    });
  }
});

// GET Expired Medicines
app.get("/api/medicines/expired", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const medicines = await Medicine.find({
      expiryDate: { $lt: today },
      currentStock: { $gt: 0 }
    }).sort({ expiryDate: 1 });

    res.status(200).json({
      success: true,
      count: medicines.length,
      data: medicines
    });
  } catch (error) {
    console.error("Expired medicine fetch error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expired medicines."
    });
  }
});

// Start Server
async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from the .env file.");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB Atlas connected successfully.");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Kairos AI backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

startServer();

