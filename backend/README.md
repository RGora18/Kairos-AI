# Kairos AI: Backend

**Smarter Stock. Better Timing. Stronger Business.**

Kairos AI is a business-intelligence backend for pharmacies and medical stores. It manages medicine inventory, sales and purchases, updates stock automatically, and turns the sales history into practical recommendations: what to reorder, how much, and which medicines may expire unsold.

All data in this project is **synthetic demo data**. No real patient or customer records are used.

**Live API:** https://kairos-ai-mlqp.onrender.com
(The free hosting plan sleeps when idle, so the first request can take up to a minute. Open `/api/health` first.)

## Tech stack

Node.js, Express, MongoDB Atlas with Mongoose, deployed on Render.

## Run locally

1. Go to the backend folder and install packages:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and put your MongoDB Atlas connection string in `MONGODB_URI`.
3. Start the server:
   ```bash
   npm start
   ```
   The API runs at `http://localhost:5000`.
4. (Optional) Add 30 days of demo sales history for the dashboard:
   ```bash
   node seed.js
   ```
   Demo sales are marked `isDemo` and are replaced each time the script runs. They do not change stock levels.

## API endpoints

| Area | Method and path | Purpose |
|---|---|---|
| General | GET `/api/health` | Server and database status |
| Medicines | GET `/api/medicines` | List all medicines |
| | POST `/api/medicines` | Add a medicine |
| | GET, PUT, DELETE `/api/medicines/:id` | Read, update, delete one medicine |
| | GET `/api/medicines/low-stock` | Stock at or below the minimum |
| | GET `/api/medicines/expiring?days=30` | Expiring within N days |
| | GET `/api/medicines/expired` | Already expired |
| Sales | POST `/api/sales` | Create a bill with one or more medicines |
| | GET `/api/sales`, `/api/sales/:id` | Sales history |
| Purchases | POST `/api/purchases` | Record incoming stock from a supplier |
| | GET `/api/purchases`, `/api/purchases/:id` | Purchase history |
| Dashboard | GET `/api/dashboard/summary` | Today and 30-day sales, inventory counts and value |
| | GET `/api/dashboard/top-selling?days=30&limit=5` | Best-selling medicines |
| Reports | GET `/api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` | Daily bills, revenue, profit |
| Recommendations | GET `/api/recommendations/reorder` | Reorder quantities and expiry risk |
| Assistant | POST `/api/assistant/ask` | Plain-language questions |

### Example: create a sale

```json
POST /api/sales
{
  "customerName": "Test Customer",
  "paymentMethod": "Cash",
  "items": [
    { "medicineId": "<medicine id>", "quantity": 3 },
    { "medicineId": "<medicine id>", "quantity": 2 }
  ]
}
```

### Example: create a purchase

```json
POST /api/purchases
{
  "supplier": "MedLife Distributors",
  "items": [
    { "medicineId": "<medicine id>", "quantity": 40, "purchasePrice": 2.2 }
  ]
}
```

### Example: ask the assistant

```json
POST /api/assistant/ask
{ "question": "What should I reorder?" }
```

## How it works

**Stock updates and transactions.** Sales and purchases use database transactions. A bill with several medicines is saved together with its stock changes, or not at all. Sales are rejected if stock is insufficient, a medicine is expired, or an ID or quantity is invalid, so stock can never go negative.

**Reorder recommendations.** For each medicine:

- average daily demand = units sold in the last N days / N
- reorder point = ceil(average daily demand x delivery days) + minimum stock
- suggested order = ceil(average daily demand x min(delivery days + cover days, days to expiry)) - current stock

The order quantity is capped by the expiry date, so the system never suggests stocking more than can be sold in time.

**Expiry risk.** For medicines expiring within 90 days, units at risk = current stock - expected sales until expiry. The result includes the cost value of those units.

**Assistant.** The assistant is rule-based: it recognises keywords in the question, calls the API endpoints above, and writes the answer from the real calculated data. It does not use a language model, so it never invents numbers. The same data could later be passed to an AI model for more natural phrasing.

## Limitations and future work

- One batch number per medicine; batch-level tracking with FEFO (first expiry, first out) is future work.
- No login or role-based access yet.
- Demand is estimated from average sales; seasonality is not modelled.
- Supplier comparison and a supplier module are planned.

## Team

Frontend: Sakshi, Rasika. Backend: Sankalp, Rutuja.