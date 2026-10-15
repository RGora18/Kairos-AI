
/* Import React hooks for state management and API fetching. */
import { useEffect, useState } from "react";

/* Import the stylesheet for the Kairos AI dashboard. */
import "./App.css";

/* Define the sidebar pages. */
const pages = [
  "Overview",
  "Sales Analytics",
  "Demand Forecast",
  "Inventory",
  "Expiry Intelligence",
  "Suppliers",
  "AI Assistant",
  "Reports",
];

/* Display a reusable dashboard metric card. */
function MetricCard({ title, value, note, icon }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <p className="metric-title">{title}</p>
      <h2 className="metric-value">{value}</h2>
      <p className="metric-note">{note}</p>
    </article>
  );
}

/* Display the medicine stock status. */
function StockStatus({ stock, reorder }) {
  if (stock <= 10) {
    return <span className="status critical">Critical</span>;
  }

  if (stock <= reorder) {
    return <span className="status low">Low stock</span>;
  }

  return <span className="status healthy">Healthy</span>;
}

/* Main Kairos AI application component. */
export default function App() {
  /* Store the currently selected sidebar page. */
  const [activePage, setActivePage] = useState("Overview");

  /* Store the medicine search text. */
  const [search, setSearch] = useState("");

  /* Store the selected dashboard reporting period. */
  const [period, setPeriod] = useState("7 days");

  /* Store medicine records retrieved from the backend. */
  const [medicines, setMedicines] = useState([]);

  /* Track whether the medicine request is in progress. */
  const [loadingMedicines, setLoadingMedicines] = useState(true);

  /* Store any medicine API error. */
  const [apiError, setApiError] = useState("");

  /* Fetch medicines from the existing Kairos backend when the app loads. */
  useEffect(() => {
    let ignore = false;

    async function fetchMedicines() {
      try {
        setLoadingMedicines(true);
        setApiError("");

        const apiUrl = import.meta.env.VITE_API_URL;

        if (!apiUrl) {
          throw new Error(
            "API URL is missing. Check the frontend .env file."
          );
        }

        const response = await fetch(
          `${apiUrl.replace(/\/+$/, "")}/api/medicines`
        );

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success || !Array.isArray(result.data)) {
          throw new Error("The medicines API returned an unexpected response.");
        }

        /* Convert backend field names into the names used by this dashboard. */
        const formattedMedicines = result.data.map((medicine) => ({
          ...medicine,
          id: medicine._id || medicine.id,
          name: medicine.name || "Unnamed medicine",
          category: medicine.category || "Uncategorised",
          stock: Number(medicine.currentStock ?? medicine.stock ?? 0),
          reorder: Number(medicine.minimumStock ?? medicine.reorder ?? 0),
          expiry: medicine.expiryDate
            ? new Date(medicine.expiryDate).toLocaleDateString("en-IN", {
                month: "short",
                year: "numeric",
              })
            : medicine.expiry || "—",
        }));

        if (!ignore) {
          setMedicines(formattedMedicines);
        }
      } catch (error) {
        if (!ignore) {
          setApiError(
            error.message || "Unable to load medicines from the backend."
          );
        }
      } finally {
        if (!ignore) {
          setLoadingMedicines(false);
        }
      }
    }

    fetchMedicines();

    /* Prevent an old request from updating state after cleanup. */
    return () => {
      ignore = true;
    };
  }, []);

  /* Filter medicines by name or category. */
  const filteredMedicines = medicines.filter((medicine) =>
    `${medicine.name} ${medicine.category}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  /* Count medicines at or below their reorder threshold. */
  const lowStockCount = medicines.filter(
    (medicine) => medicine.stock <= medicine.reorder
  ).length;

  /* Change the active sidebar page. */
  function handleNavigation(page) {
    setActivePage(page);
  }

  /* Render the selected page. */
  function renderPage() {
    /* Display the inventory page. */
    if (activePage === "Inventory") {
      return (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Medicine Inventory</h2>
              <p>Check available stock and reorder levels.</p>
            </div>
          </div>

          {loadingMedicines && (
            <p role="status">Loading medicines from the backend...</p>
          )}

          {apiError && (
            <p className="demo-note" role="alert">
              Unable to load live medicines: {apiError}
            </p>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Reorder Level</th>
                  <th>Expiry</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {!loadingMedicines &&
                  !apiError &&
                  filteredMedicines.map((medicine) => (
                    <tr key={medicine.id}>
                      <td>{medicine.name}</td>
                      <td>{medicine.category}</td>
                      <td>{medicine.stock} units</td>
                      <td>{medicine.reorder} units</td>
                      <td>{medicine.expiry}</td>
                      <td>
                        <StockStatus
                          stock={medicine.stock}
                          reorder={medicine.reorder}
                        />
                      </td>
                    </tr>
                  ))}

                {!loadingMedicines &&
                  !apiError &&
                  filteredMedicines.length === 0 && (
                    <tr>
                      <td colSpan="6">
                        {search
                          ? "No medicines match your search."
                          : "No medicines in the database yet."}
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>

          <p className="demo-note">
            Inventory records are fetched from the Kairos backend.
          </p>
        </section>
      );
    }

    /* Display the AI Assistant placeholder. */
    if (activePage === "AI Assistant") {
      return (
        <section className="panel">
          <h2>Kairos AI Assistant</h2>
          <p>
            Ask questions about stock, expiry, and purchasing decisions.
          </p>
          <p className="demo-note">
            AI responses will be available when the assistant endpoint is
            integrated.
          </p>
        </section>
      );
    }

    /* Display a placeholder for pages that are not implemented yet. */
    if (activePage !== "Overview") {
      return (
        <section className="panel page-placeholder">
          <h2>{activePage}</h2>
          <p>This section is ready for feature implementation.</p>
          <p className="demo-note">
            Live business data for this section has not been integrated yet.
          </p>
        </section>
      );
    }

    /* Display the Overview dashboard. */
    return (
      <>
        <div className="metrics-grid">
          <MetricCard
            icon="₹"
            title="Sales Revenue"
            value="₹48,250"
            note="Illustrative demo value"
          />

          <MetricCard
            icon="▤"
            title="Orders Processed"
            value="1,284"
            note="Illustrative demo value"
          />

          <MetricCard
            icon="Rx"
            title="Medicines Tracked"
            value={loadingMedicines ? "…" : medicines.length}
            note="Live backend records"
          />

          <MetricCard
            icon="!"
            title="Low Stock Items"
            value={loadingMedicines ? "…" : lowStockCount}
            note="Based on current inventory"
          />
        </div>

        {apiError && (
          <section className="panel" role="alert">
            <h2>Backend connection issue</h2>
            <p>{apiError}</p>
            <p className="demo-note">
              Check that the backend is running and both laptops are on the
              same network.
            </p>
          </section>
        )}

        <div className="content-grid">
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Sales Overview</h2>
                <p>Sample pharmacy business performance</p>
              </div>
            </div>

            <div className="sales-summary">
              <span>Illustrative revenue</span>
              <strong>₹48,250</strong>
            </div>

            <div className="simple-chart">
              {[45, 65, 50, 78, 58, 88, 70].map((height, index) => (
                <div className="chart-column" key={index}>
                  <div
                    className="chart-bar"
                    style={{ height: `${height}%` }}
                  />
                  <span>{["M", "T", "W", "T", "F", "S", "S"][index]}</span>
                </div>
              ))}
            </div>

            <p className="demo-note">
              Illustrative chart, not live sales analytics.
            </p>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Action Centre</h2>
                <p>Items to review</p>
              </div>
            </div>

            {loadingMedicines && (
              <p role="status">Checking medicine stock...</p>
            )}

            {!loadingMedicines &&
              !apiError &&
              medicines.filter((medicine) => medicine.stock <= medicine.reorder)
                .length === 0 && (
                <p>No low-stock medicines found in the current inventory.</p>
              )}

            {medicines
              .filter((medicine) => medicine.stock <= medicine.reorder)
              .map((medicine) => (
                <div className="action-item" key={medicine.id}>
                  <span className="action-alert">!</span>
                  <div>
                    <strong>{medicine.name}</strong>
                    <p>
                      {medicine.stock} units left · Reorder level:{" "}
                      {medicine.reorder}
                    </p>
                  </div>
                </div>
              ))}
          </section>
        </div>
      </>
    );
  }

  /* Render the complete application layout. */
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            K<span>.</span>
          </div>

          <div className="brand-copy">
            <strong>
              Kairos<span> AI</span>
            </strong>
            <small>PHARMACY INTELLIGENCE</small>
          </div>
        </div>

        <p className="workspace-label">WORKSPACE</p>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {pages.map((page) => (
            <button
              key={page}
              className={`nav-item ${activePage === page ? "active" : ""}`}
              onClick={() => handleNavigation(page)}
            >
              {page}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <strong>Better decisions,</strong>
          <strong>right on time.</strong>
          <p>Smarter stock. Better timing.</p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace / <strong>{activePage}</strong>
          </div>
          <span className="demo-indicator">● Demo environment</span>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <span className="eyebrow">
                PHARMACY BUSINESS INTELLIGENCE
              </span>

              <h1>
                {activePage === "Overview" ? "Good evening, Admin" : activePage}
                <span className="heading-period">.</span>
              </h1>

              <p>
                Understand your stock and make informed business decisions.
              </p>
            </div>

            <label className="period-select">
              <span className="sr-only">Select dashboard period</span>
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              >
                <option>7 days</option>
                <option>30 days</option>
                <option>90 days</option>
              </select>
            </label>
          </section>

          <div className="search-row">
            <span className="search-icon">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search medicines or categories..."
              aria-label="Search medicines or categories"
            />
          </div>

          <div className="demo-banner">
            <strong>Demo data:</strong> Sales figures and chart values are
            illustrative. Medicine inventory is loaded from the backend.
          </div>

          {renderPage()}

          <footer className="page-footer">
            <span>© 2026 Kairos AI</span>
            <span>Smarter Stock. Better Timing. Stronger Business.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
