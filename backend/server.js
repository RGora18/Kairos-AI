// ============================================================
// Kairos AI - Backend (server.js)
// Medicines, Sales, Purchases with automatic stock updates
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(express.json());

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

// Custom error that carries an HTTP status code
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Round money to 2 decimal places
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Validate the "items" array sent in sales and purchase requests
function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "items must be a non-empty array");
  }
  const seen = new Set();
  for (const item of items) {
    if (!mongoose.isValidObjectId(item.medicineId)) {
      throw new HttpError(400, `Invalid medicineId: ${item.medicineId}`);
    }
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new HttpError(400, "quantity must be a whole number greater than 0");
    }
    // Do not allow the same medicine twice in one request
    if (seen.has(String(item.medicineId))) {
      throw new HttpError(400, "Same medicine appears twice in items");
    }
    seen.add(String(item.medicineId));
  }
}

// ------------------------------------------------------------
// Models
// ------------------------------------------------------------

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "General" },
    batchNumber: { type: String, trim: true },
    currentStock: { type: Number, required: true, min: 0, default: 0 },
    minimumStock: { type: Number, min: 0, default: 0 },
    purchasePrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, required: true },
    supplier: { type: String, trim: true },
  },
  { timestamps: true }
);
const Medicine = mongoose.model("Medicine", medicineSchema);

const saleItemSchema = new mongoose.Schema(
  {
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
    medicineName: String,
    batchNumber: String,
    quantity: { type: Number, required: true },
    unitSellingPrice: { type: Number, required: true },
    unitPurchaseCost: { type: Number, required: true },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    billNumber: { type: String, required: true, unique: true },
    items: { type: [saleItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    grossProfit: { type: Number, required: true },
    paymentMethod: { type: String, default: "Cash" },
    customerName: { type: String, default: "Walk-in Customer" },
    saleDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
const Sale = mongoose.model("Sale", saleSchema);

const purchaseItemSchema = new mongoose.Schema(
  {
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
    medicineName: String,
    batchNumber: String,
    quantity: { type: Number, required: true },
    unitPurchasePrice: { type: Number, required: true },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: { type: String, required: true, unique: true },
    supplier: { type: String, required: true, trim: true },
    items: { type: [purchaseItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    purchaseDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
const Purchase = mongoose.model("Purchase", purchaseSchema);

// ------------------------------------------------------------
// General routes
// ------------------------------------------------------------

app.get("/", (req, res) => {
  res.send("Welcome to Kairos AI backend");
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "OK",
    database: mongoose.connection.readyState === 1 ? "connected" : "not connected",
  });
});

app.get("/api/test-route", (req, res) => {
  res.json({ success: true, message: "Test route is working (new server.js)" });
});

// ------------------------------------------------------------
// Medicine routes
// NOTE: fixed routes (low-stock, expiring, expired) must come
// BEFORE the "/:id" route, otherwise "low-stock" is treated as an id.
// ------------------------------------------------------------

// Medicines where current stock is at or below minimum stock
app.get("/api/medicines/low-stock", async (req, res, next) => {
  try {
    const medicines = await Medicine.find({
      $expr: { $lte: ["$currentStock", "$minimumStock"] },
    }).sort({ currentStock: 1 });
    res.json({ success: true, count: medicines.length, data: medicines });
  } catch (err) {
    next(err);
  }
});

// Medicines expiring within the next N days (default 30)
app.get("/api/medicines/expiring", async (req, res, next) => {
  try {
    const days = Number(req.query.days) || 30;
    const now = new Date();
    const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const medicines = await Medicine.find({
      expiryDate: { $gt: now, $lte: limit },
    }).sort({ expiryDate: 1 });
    res.json({ success: true, count: medicines.length, days, data: medicines });
  } catch (err) {
    next(err);
  }
});

// Medicines that are already expired
app.get("/api/medicines/expired", async (req, res, next) => {
  try {
    const medicines = await Medicine.find({
      expiryDate: { $lte: new Date() },
    }).sort({ expiryDate: 1 });
    res.json({ success: true, count: medicines.length, data: medicines });
  } catch (err) {
    next(err);
  }
});

// Get all medicines
app.get("/api/medicines", async (req, res, next) => {
  try {
    const medicines = await Medicine.find().sort({ name: 1 });
    res.json({ success: true, count: medicines.length, data: medicines });
  } catch (err) {
    next(err);
  }
});

// Add a medicine
app.post("/api/medicines", async (req, res, next) => {
  try {
    const medicine = await Medicine.create(req.body);
    res.status(201).json({ success: true, data: medicine });
  } catch (err) {
    next(err);
  }
});

// Get one medicine by id
app.get("/api/medicines/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new HttpError(400, "Invalid medicine id");
    }
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) throw new HttpError(404, "Medicine not found");
    res.json({ success: true, data: medicine });
  } catch (err) {
    next(err);
  }
});

// Update a medicine
app.put("/api/medicines/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new HttpError(400, "Invalid medicine id");
    }
    const medicine = await Medicine.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!medicine) throw new HttpError(404, "Medicine not found");
    res.json({ success: true, data: medicine });
  } catch (err) {
    next(err);
  }
});

// Delete a medicine
app.delete("/api/medicines/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new HttpError(400, "Invalid medicine id");
    }
    const medicine = await Medicine.findByIdAndDelete(req.params.id);
    if (!medicine) throw new HttpError(404, "Medicine not found");
    res.json({ success: true, message: "Medicine deleted", data: medicine });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------
// Sales routes
// Request body example:
// {
//   "customerName": "Ravi",
//   "paymentMethod": "Cash",
//   "items": [ { "medicineId": "<id>", "quantity": 2 } ]
// }
// ------------------------------------------------------------

app.post("/api/sales", async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { items, customerName, paymentMethod } = req.body;
    validateItems(items);

    let sale;

    // Everything inside withTransaction is saved together or rolled back together
    await session.withTransaction(async () => {
      const saleItems = [];

      for (const item of items) {
        const qty = Number(item.quantity);

        const medicine = await Medicine.findById(item.medicineId).session(session);
        if (!medicine) {
          throw new HttpError(404, `Medicine not found: ${item.medicineId}`);
        }
        if (medicine.expiryDate <= new Date()) {
          throw new HttpError(400, `${medicine.name} is expired and cannot be sold`);
        }

        // Deduct stock only if enough stock is available (prevents negative stock)
        const updated = await Medicine.findOneAndUpdate(
          { _id: medicine._id, currentStock: { $gte: qty } },
          { $inc: { currentStock: -qty } },
          { session, new: true }
        );
        if (!updated) {
          throw new HttpError(
            400,
            `Insufficient stock for ${medicine.name}. Available: ${medicine.currentStock}, requested: ${qty}`
          );
        }

        saleItems.push({
          medicineId: medicine._id,
          medicineName: medicine.name,
          batchNumber: medicine.batchNumber,
          quantity: qty,
          unitSellingPrice: medicine.sellingPrice,
          unitPurchaseCost: medicine.purchasePrice,
          subtotal: round2(qty * medicine.sellingPrice),
        });
      }

      const totalAmount = round2(saleItems.reduce((sum, i) => sum + i.subtotal, 0));
      const totalCost = round2(
        saleItems.reduce((sum, i) => sum + i.quantity * i.unitPurchaseCost, 0)
      );

      const created = await Sale.create(
        [
          {
            billNumber: `BILL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            items: saleItems,
            totalAmount,
            totalCost,
            grossProfit: round2(totalAmount - totalCost),
            paymentMethod: paymentMethod || "Cash",
            customerName: customerName || "Walk-in Customer",
          },
        ],
        { session }
      );
      sale = created[0];
    });

    res.status(201).json({ success: true, data: sale });
  } catch (err) {
    next(err);
  } finally {
    await session.endSession();
  }
});

app.get("/api/sales", async (req, res, next) => {
  try {
    const sales = await Sale.find().sort({ saleDate: -1 });
    res.json({ success: true, count: sales.length, data: sales });
  } catch (err) {
    next(err);
  }
});

app.get("/api/sales/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new HttpError(400, "Invalid sale id");
    }
    const sale = await Sale.findById(req.params.id);
    if (!sale) throw new HttpError(404, "Sale not found");
    res.json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------
// Purchase routes
// Request body example:
// {
//   "supplier": "MedLife Distributors",
//   "items": [ { "medicineId": "<id>", "quantity": 50, "purchasePrice": 1.6 } ]
// }
// purchasePrice is optional (the medicine's current price is used if missing)
// ------------------------------------------------------------

app.post("/api/purchases", async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { items, supplier } = req.body;
    if (!supplier || !String(supplier).trim()) {
      throw new HttpError(400, "supplier is required");
    }
    validateItems(items);

    let purchase;

    await session.withTransaction(async () => {
      const purchaseItems = [];

      for (const item of items) {
        const qty = Number(item.quantity);

        const medicine = await Medicine.findById(item.medicineId).session(session);
        if (!medicine) {
          throw new HttpError(404, `Medicine not found: ${item.medicineId}`);
        }

        const unitPrice =
          item.purchasePrice !== undefined ? Number(item.purchasePrice) : medicine.purchasePrice;
        if (Number.isNaN(unitPrice) || unitPrice < 0) {
          throw new HttpError(400, `Invalid purchasePrice for ${medicine.name}`);
        }

        // Increase stock and remember latest purchase price and supplier
        await Medicine.updateOne(
          { _id: medicine._id },
          {
            $inc: { currentStock: qty },
            $set: { purchasePrice: unitPrice, supplier: String(supplier).trim() },
          },
          { session }
        );

        purchaseItems.push({
          medicineId: medicine._id,
          medicineName: medicine.name,
          batchNumber: medicine.batchNumber,
          quantity: qty,
          unitPurchasePrice: unitPrice,
          subtotal: round2(qty * unitPrice),
        });
      }

      const totalAmount = round2(purchaseItems.reduce((sum, i) => sum + i.subtotal, 0));

      const created = await Purchase.create(
        [
          {
            purchaseNumber: `PUR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            supplier: String(supplier).trim(),
            items: purchaseItems,
            totalAmount,
          },
        ],
        { session }
      );
      purchase = created[0];
    });

    res.status(201).json({ success: true, data: purchase });
  } catch (err) {
    next(err);
  } finally {
    await session.endSession();
  }
});

app.get("/api/purchases", async (req, res, next) => {
  try {
    const purchases = await Purchase.find().sort({ purchaseDate: -1 });
    res.json({ success: true, count: purchases.length, data: purchases });
  } catch (err) {
    next(err);
  }
});

app.get("/api/purchases/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new HttpError(400, "Invalid purchase id");
    }
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) throw new HttpError(404, "Purchase not found");
    res.json({ success: true, data: purchase });
  } catch (err) {
    next(err);
  }
});
// ------------------------------------------------------------
// Dashboard and report routes
// ------------------------------------------------------------

// Total bills, revenue and profit for sales on or after a date
async function salesTotals(fromDate) {
  const result = await Sale.aggregate([
    { $match: { saleDate: { $gte: fromDate } } },
    {
      $group: {
        _id: null,
        bills: { $sum: 1 },
        revenue: { $sum: "$totalAmount" },
        profit: { $sum: "$grossProfit" },
      },
    },
  ]);
  const t = result[0] || { bills: 0, revenue: 0, profit: 0 };
  return { bills: t.bills, revenue: round2(t.revenue), profit: round2(t.profit) };
}

// Main dashboard numbers
app.get("/api/dashboard/summary", async (req, res, next) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [today, last30Days, stock, lowStockCount, expiringCount, expiredCount] =
      await Promise.all([
        salesTotals(startOfToday),
        salesTotals(thirtyDaysAgo),
        Medicine.aggregate([
          {
            $group: {
              _id: null,
              totalMedicines: { $sum: 1 },
              totalUnits: { $sum: "$currentStock" },
              inventoryValue: { $sum: { $multiply: ["$currentStock", "$purchasePrice"] } },
            },
          },
        ]),
        Medicine.countDocuments({ $expr: { $lte: ["$currentStock", "$minimumStock"] } }),
        Medicine.countDocuments({ expiryDate: { $gt: now, $lte: in30Days } }),
        Medicine.countDocuments({ expiryDate: { $lte: now } }),
      ]);

    const s = stock[0] || { totalMedicines: 0, totalUnits: 0, inventoryValue: 0 };

    res.json({
      success: true,
      data: {
        today,
        last30Days,
        inventory: {
          totalMedicines: s.totalMedicines,
          totalUnits: s.totalUnits,
          inventoryValue: round2(s.inventoryValue),
          lowStockCount,
          expiringSoonCount: expiringCount,
          expiredCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// Best-selling medicines (default: last 30 days, top 5)
app.get("/api/dashboard/top-selling", async (req, res, next) => {
  try {
    const days = Number(req.query.days) || 30;
    const limit = Number(req.query.limit) || 5;
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await Sale.aggregate([
      { $match: { saleDate: { $gte: fromDate } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.medicineId",
          medicineName: { $first: "$items.medicineName" },
          unitsSold: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.subtotal" },
        },
      },
      { $sort: { unitsSold: -1 } },
      { $limit: limit },
    ]);

    res.json({ success: true, days, count: data.length, data });
  } catch (err) {
    next(err);
  }
});

// Daily sales report between two dates
// Example: /api/reports/sales?from=2026-10-01&to=2026-10-31
app.get("/api/reports/sales", async (req, res, next) => {
  try {
    const now = new Date();
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : now;
    const from = req.query.from
      ? new Date(`${req.query.from}T00:00:00.000`)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new HttpError(400, "Invalid date. Use the format YYYY-MM-DD");
    }

    const data = await Sale.aggregate([
      { $match: { saleDate: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$saleDate", timezone: "Asia/Kolkata" } },
          bills: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
          profit: { $sum: "$grossProfit" },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: "$_id", bills: 1, revenue: { $round: ["$revenue", 2] }, profit: { $round: ["$profit", 2] } } },
    ]);

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
});
// ------------------------------------------------------------
// Recommendations: reorder suggestions and expiry risk
// Example: /api/recommendations/reorder?days=30&leadTimeDays=7&coverDays=30
//   days         = how many days of sales history to use for demand
//   leadTimeDays = how many days a supplier delivery takes
//   coverDays    = how many days of stock we want after delivery
// ------------------------------------------------------------
app.get("/api/recommendations/reorder", async (req, res, next) => {
  try {
    const DAY = 24 * 60 * 60 * 1000;
    const days = Number(req.query.days) || 30;
    const leadTimeDays = Number(req.query.leadTimeDays) || 7;
    const coverDays = Number(req.query.coverDays) || 30;
    const now = new Date();
    const fromDate = new Date(now.getTime() - days * DAY);
    const round1 = (n) => Math.round(n * 10) / 10;

    // Step 1: units sold per medicine in the chosen period
    const sold = await Sale.aggregate([
      { $match: { saleDate: { $gte: fromDate } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.medicineId", unitsSold: { $sum: "$items.quantity" } } },
    ]);
    const soldMap = new Map(sold.map((s) => [String(s._id), s.unitsSold]));

    // Step 2: look at every medicine that has not expired yet
    const medicines = await Medicine.find({ expiryDate: { $gt: now } });

    const data = medicines.map((m) => {
      const unitsSold = soldMap.get(String(m._id)) || 0;
      const avgDailyDemand = unitsSold / days;
      const daysToExpiry = Math.floor((m.expiryDate - now) / DAY);
      const daysOfStockLeft =
        avgDailyDemand > 0 ? round1(m.currentStock / avgDailyDemand) : null;

      // Reorder when stock is at or below: demand during delivery + minimum stock
      const reorderPoint = Math.ceil(avgDailyDemand * leadTimeDays) + (m.minimumStock || 0);

      // Never plan to stock more than can be sold before the expiry date
      const horizonDays = Math.min(leadTimeDays + coverDays, daysToExpiry);
      const targetStock = Math.ceil(avgDailyDemand * horizonDays);

      let suggestedOrderQty = 0;
      let status = "OK";
      if (m.currentStock <= reorderPoint) {
        suggestedOrderQty = Math.max(0, targetStock - m.currentStock);
        if (suggestedOrderQty > 0) {
          const runsOutBeforeDelivery =
            daysOfStockLeft !== null && daysOfStockLeft < leadTimeDays;
          status = runsOutBeforeDelivery || m.currentStock === 0 ? "CRITICAL" : "REORDER";
        }
      }

      // Expiry risk: units that will probably not sell before the expiry date
      let unitsAtRisk = 0;
      if (daysToExpiry <= 90) {
        const expectedSales = Math.floor(avgDailyDemand * daysToExpiry);
        unitsAtRisk = Math.max(0, m.currentStock - expectedSales);
      }
      const valueAtRisk = round2(unitsAtRisk * m.purchasePrice);

      // Plain-language advice (the chatbot and dashboard can show this)
      const advice = [];
      if (suggestedOrderQty > 0) {
        advice.push(
          `Order about ${suggestedOrderQty} units of ${m.name}. Current stock lasts about ${daysOfStockLeft} days and delivery takes ${leadTimeDays} days.`
        );
      }
      if (unitsAtRisk > 0) {
        advice.push(
          `About ${unitsAtRisk} units of ${m.name} may expire unsold in ${daysToExpiry} days. Consider a discount or returning them to the supplier.`
        );
      }
      if (advice.length === 0) advice.push(`Stock level of ${m.name} is healthy.`);

      return {
        medicineId: m._id,
        name: m.name,
        currentStock: m.currentStock,
        minimumStock: m.minimumStock,
        avgDailyDemand: round1(avgDailyDemand),
        daysOfStockLeft,
        reorderPoint,
        status,
        suggestedOrderQty,
        daysToExpiry,
        unitsAtRisk,
        valueAtRisk,
        supplier: m.supplier,
        advice,
      };
    });

    // Most urgent first
    const rank = { CRITICAL: 0, REORDER: 1, OK: 2 };
    data.sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        (a.daysOfStockLeft ?? Infinity) - (b.daysOfStockLeft ?? Infinity)
    );

    res.json({
      success: true,
      params: { days, leadTimeDays, coverDays },
      summary: {
        critical: data.filter((d) => d.status === "CRITICAL").length,
        reorder: data.filter((d) => d.status === "REORDER").length,
        withExpiryRisk: data.filter((d) => d.unitsAtRisk > 0).length,
      },
      count: data.length,
      data,
    });
  } catch (err) {
    next(err);
  }
});
// ------------------------------------------------------------
// Error handler (always returns JSON)
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ success: false, message: `Invalid value for ${err.path}` });
  }
  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

// ------------------------------------------------------------
// Connect to MongoDB, then start the server
// ------------------------------------------------------------
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB Atlas connected successfully.");
    app.listen(PORT, () => {
      console.log(`Kairos AI backend running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });