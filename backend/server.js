
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ==============================
// MEDICINE MODEL
// ==============================

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    batchNumber: { type: String, required: true, trim: true },
    currentStock: { type: Number, required: true, min: 0, default: 0 },
    minimumStock: { type: Number, required: true, min: 0, default: 10 },
    purchasePrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, required: true },
    supplier: { type: String, trim: true, default: "Unknown" }
  },
  { timestamps: true }
);

const Medicine = mongoose.model("Medicine", medicineSchema);

// ==============================
// SALES MODEL
// ==============================

const saleSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true,
      unique: true
    },
    items: [
      {
        medicineId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Medicine",
          required: true
        },
        medicineName: { type: String, required: true },
        batchNumber: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        unitCost: { type: Number, required: true, min: 0 },
        subtotal: { type: Number, required: true, min: 0 }
      }
    ],
    totalAmount: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
    grossProfit: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ["Cash", "UPI", "Card", "Other"],
      default: "Cash"
    },
    customerName: { type: String, trim: true, default: "Walk-in Customer" },
    saleDate: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const Sale = mongoose.model("Sale", saleSchema);

// ==============================
// PURCHASE MODEL
// ==============================

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: {
      type: String,
      required: true,
      unique: true
    },
    supplier: {
      type: String,
      required: true,
      trim: true
    },
    items: [
      {
        medicineId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Medicine",
          required: true
        },
        medicineName: { type: String, required: true },
        batchNumber: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        subtotal: { type: Number, required: true, min: 0 }
      }
    ],
    totalAmount: { type: Number, required: true, min: 0 },
    purchaseDate: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const Purchase = mongoose.model("Purchase", purchaseSchema);

// ==============================
// HELPER FUNCTIONS
// ==============================

const isValidId = (id) => mongoose.isValidObjectId(id);

const isValidQuantity = (quantity) =>
  Number.isInteger(quantity) && quantity > 0;

const isValidPrice = (price) =>
  Number.isFinite(price) && price >= 0;

const roundMoney = (value) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const createReferenceNumber = (prefix) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const handleError = (res, error, defaultMessage) => {
  console.error(defaultMessage, error.message);

  const clientErrorNames = [
    "ValidationError",
    "CastError"
  ];

  const status = clientErrorNames.includes(error.name) ? 400 : 500;

  res.status(status).json({
    success: false,
    message: status === 400 ? error.message : defaultMessage
  });
};

// ==============================
// GENERAL ROUTES
// ==============================

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
    database:
      mongoose.connection.readyState === 1
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

// ==============================
// MEDICINE ROUTES
// ==============================

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
    handleError(res, error, "Failed to fetch medicines.");
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
    handleError(res, error, "Failed to fetch low-stock medicines.");
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
      expiryDate: { $gte: today, $lte: expiryLimit },
      currentStock: { $gt: 0 }
    }).sort({ expiryDate: 1 });

    res.status(200).json({
      success: true,
      count: medicines.length,
      data: medicines
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch expiring medicines.");
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
    handleError(res, error, "Failed to fetch expired medicines.");
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
    handleError(res, error, "Failed to fetch medicine.");
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
    handleError(res, error, "Failed to add medicine.");
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
      { new: true, runValidators: true }
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
    handleError(res, error, "Failed to update medicine.");
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
    handleError(res, error, "Failed to delete medicine.");
  }
});

// ==============================
// SALES ROUTES
// ==============================

// CREATE Sale with Multiple Medicines
app.post("/api/sales", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { items, paymentMethod, customerName } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "A sale must contain at least one medicine."
      });
    }

    const validPaymentMethods = ["Cash", "UPI", "Card", "Other"];

    if (
      paymentMethod !== undefined &&
      !validPaymentMethods.includes(paymentMethod)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method."
      });
    }

    const consolidatedItems = new Map();

    for (const item of items) {
      if (!item.medicineId || !isValidId(item.medicineId)) {
        return res.status(400).json({
          success: false,
          message: "Every sale item must have a valid medicine ID."
        });
      }

      if (!isValidQuantity(item.quantity)) {
        return res.status(400).json({
          success: false,
          message: "Medicine quantity must be a positive integer."
        });
      }

      const key = String(item.medicineId);

      consolidatedItems.set(
        key,
        (consolidatedItems.get(key) || 0) + item.quantity
      );
    }

    const saleItems = [];
    let totalAmount = 0;
    let totalCost = 0;

    await session.withTransaction(async () => {
      saleItems.length = 0;
      totalAmount = 0;
      totalCost = 0;

      for (const [medicineId, quantity] of consolidatedItems) {
        const medicine = await Medicine.findById(medicineId).session(session);

        if (!medicine) {
          throw new Error(`Medicine not found: ${medicineId}`);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (medicine.expiryDate < today) {
          throw new Error(
            `${medicine.name} is expired and cannot be sold.`
          );
        }

        if (medicine.currentStock < quantity) {
          throw new Error(
            `Insufficient stock for ${medicine.name}. Available: ${medicine.currentStock}, requested: ${quantity}.`
          );
        }

        const unitPrice =
          medicine.sellingPrice;

        const unitCost =
          medicine.purchasePrice;

        if (!isValidPrice(unitPrice) || !isValidPrice(unitCost)) {
          throw new Error(`Invalid price for ${medicine.name}.`);
        }

        const subtotal = roundMoney(unitPrice * quantity);
        const costSubtotal = roundMoney(unitCost * quantity);

        // Conditional stock deduction prevents negative stock.
        const stockUpdate = await Medicine.updateOne(
          {
            _id: medicineId,
            currentStock: { $gte: quantity }
          },
          {
            $inc: { currentStock: -quantity }
          },
          { session }
        );

        if (stockUpdate.modifiedCount !== 1) {
          throw new Error(
            `Stock changed while processing ${medicine.name}. Please retry.`
          );
        }

        saleItems.push({
          medicineId: medicine._id,
          medicineName: medicine.name,
          batchNumber: medicine.batchNumber,
          quantity,
          unitPrice,
          unitCost,
          subtotal
        });

        totalAmount += subtotal;
        totalCost += costSubtotal;
      }

      totalAmount = roundMoney(totalAmount);
      totalCost = roundMoney(totalCost);

      const grossProfit = roundMoney(totalAmount - totalCost);

      const billNumber = createReferenceNumber("BILL");

      const createdSales = await Sale.create(
        [
          {
            billNumber,
            items: saleItems,
            totalAmount,
            totalCost,
            grossProfit,
            paymentMethod: paymentMethod || "Cash",
            customerName: customerName || "Walk-in Customer"
          }
        ],
        { session }
      );

      saleItems.createdSale = createdSales[0];
    });

    res.status(201).json({
      success: true,
      message: "Sale recorded and stock updated successfully.",
      data: saleItems.createdSale
    });
  } catch (error) {
    console.error("Sale creation error:", error.message);

    res.status(
      error.name === "ValidationError" ||
      error.name === "CastError" ? 400 :
      error.message.includes("not found") ||
      error.message.includes("Insufficient") ||
      error.message.includes("expired") ||
      error.message.includes("Stock changed") ||
      error.message.includes("Invalid price") ? 400 : 500
    ).json({
      success: false,
      message: error.message || "Failed to record sale."
    });
  } finally {
    await session.endSession();
  }
});

// GET All Sales
app.get("/api/sales", async (req, res) => {
  try {
    const sales = await Sale.find().sort({ saleDate: -1 });

    res.status(200).json({
      success: true,
      count: sales.length,
      data: sales
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch sales.");
  }
});

// GET Sale by ID
app.get("/api/sales/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sale ID."
      });
    }

    const sale = await Sale.findById(id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale not found."
      });
    }

    res.status(200).json({
      success: true,
      data: sale
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch sale.");
  }
});

// ==============================
// PURCHASE ROUTES
// ==============================

// CREATE Purchase with Multiple Medicines
app.post("/api/purchases", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { supplier, items } = req.body;

    if (!supplier || !supplier.trim()) {
      return res.status(400).json({
        success: false,
        message: "Supplier name is required."
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "A purchase must contain at least one medicine."
      });
    }

    const purchaseItems = [];
    let totalAmount = 0;

    await session.withTransaction(async () => {
      purchaseItems.length = 0;
      totalAmount = 0;

      for (const item of items) {
        if (!item.medicineId || !isValidId(item.medicineId)) {
          throw new Error("Every purchase item needs a valid medicine ID.");
        }

        if (!isValidQuantity(item.quantity)) {
          throw new Error(
            "Purchase quantity must be a positive integer."
          );
        }

        const medicine = await Medicine.findById(item.medicineId).session(session);

        if (!medicine) {
          throw new Error(`Medicine not found: ${item.medicineId}`);
        }

        const unitPrice =
          item.unitPrice === undefined
            ? medicine.purchasePrice
            : Number(item.unitPrice);

        if (!isValidPrice(unitPrice)) {
          throw new Error(`Invalid purchase price for ${medicine.name}.`);
        }

        const subtotal = roundMoney(unitPrice * item.quantity);

        // Increase stock and update the latest purchase price.
        await Medicine.updateOne(
          { _id: medicine._id },
          {
            $inc: { currentStock: item.quantity },
            $set: {
              purchasePrice: unitPrice,
              supplier: supplier.trim()
            }
          },
          { session }
        );

        purchaseItems.push({
          medicineId: medicine._id,
          medicineName: medicine.name,
          batchNumber: medicine.batchNumber,
          quantity: item.quantity,
          unitPrice,
          subtotal
        });

        totalAmount += subtotal;
      }

      totalAmount = roundMoney(totalAmount);

      const purchaseNumber = createReferenceNumber("PUR");

      const createdPurchases = await Purchase.create(
        [
          {
            purchaseNumber,
            supplier: supplier.trim(),
            items: purchaseItems,
            totalAmount
          }
        ],
        { session }
      );

      purchaseItems.createdPurchase = createdPurchases[0];
    });

    res.status(201).json({
      success: true,
      message: "Purchase recorded and stock updated successfully.",
      data: purchaseItems.createdPurchase
    });
  } catch (error) {
    console.error("Purchase creation error:", error.message);

    res.status(
      error.name === "ValidationError" ||
      error.name === "CastError" ? 400 :
      error.message.includes("Medicine not found") ||
      error.message.includes("Invalid") ? 400 : 500
    ).json({
      success: false,
      message: error.message || "Failed to record purchase."
    });
  } finally {
    await session.endSession();
  }
});

// GET All Purchases
app.get("/api/purchases", async (req, res) => {
  try {
    const purchases = await Purchase.find().sort({ purchaseDate: -1 });

    res.status(200).json({
      success: true,
      count: purchases.length,
      data: purchases
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch purchases.");
  }
});

// GET Purchase by ID
app.get("/api/purchases/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid purchase ID."
      });
    }

    const purchase = await Purchase.findById(id);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found."
      });
    }

    res.status(200).json({
      success: true,
      data: purchase
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch purchase.");
  }
});

// ==============================
// START SERVER
// ==============================

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
