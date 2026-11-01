// ============================================================
// Kairos AI - seed.js
// Adds 30 days of DEMO sales history so dashboards have data.
// Safe to run many times: it deletes old demo sales first.
// Run with:  node seed.js
// ============================================================
require("dotenv").config();
const mongoose = require("mongoose");

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB Atlas connected successfully.");

  const medicines = await mongoose.connection.collection("medicines").find({}).toArray();
  if (medicines.length === 0) {
    console.log("No medicines found. Add medicines first.");
    process.exit(0);
  }

  const salesCollection = mongoose.connection.collection("sales");

  // Remove old demo sales (real sales are never touched)
  await salesCollection.deleteMany({ isDemo: true });

  const demoSales = [];
  const now = new Date();

  for (let daysAgo = 30; daysAgo >= 1; daysAgo--) {
    const billsToday = 2 + Math.floor(Math.random() * 3); // 2 to 4 bills per day

    for (let b = 0; b < billsToday; b++) {
      const saleDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - daysAgo,
        9 + Math.floor(Math.random() * 10), // between 9:00 and 18:59
        Math.floor(Math.random() * 60)
      );

      // Pick 1 to 3 random medicines for this bill
      const itemCount = 1 + Math.floor(Math.random() * Math.min(3, medicines.length));
      const chosen = [...medicines].sort(() => Math.random() - 0.5).slice(0, itemCount);

      const items = chosen.map((m) => {
        const quantity = 1 + Math.floor(Math.random() * 4); // 1 to 4 units
        return {
          medicineId: m._id,
          medicineName: m.name,
          batchNumber: m.batchNumber,
          quantity,
          unitSellingPrice: m.sellingPrice,
          unitPurchaseCost: m.purchasePrice,
          subtotal: round2(quantity * m.sellingPrice),
        };
      });

      const totalAmount = round2(items.reduce((sum, i) => sum + i.subtotal, 0));
      const totalCost = round2(items.reduce((sum, i) => sum + i.quantity * i.unitPurchaseCost, 0));

      demoSales.push({
        billNumber: `DEMO-D${daysAgo}-B${b}`,
        items,
        totalAmount,
        totalCost,
        grossProfit: round2(totalAmount - totalCost),
        paymentMethod: ["Cash", "UPI", "Card"][Math.floor(Math.random() * 3)],
        customerName: "Demo Customer",
        saleDate,
        createdAt: saleDate,
        updatedAt: saleDate,
        isDemo: true,
        __v: 0,
      });
    }
  }

  await salesCollection.insertMany(demoSales);
  console.log(`Inserted ${demoSales.length} demo sales covering the last 30 days.`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seeding failed:", err.message);
  process.exit(1);
});