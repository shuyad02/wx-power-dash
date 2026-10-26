# WindWatch — UK Day-Ahead Wind Forecast & Procurement Platform

> **Live Application**: [https://wx-power-dash.vercel.app](https://wx-power-dash.vercel.app)  
> **Target Delivery Period**: January 2026 (GB National Grid)  
> **Data Authority**: Elexon BMRS Insights Solution API (`FUELHH` & `WINDFOR`)

---

## 1. Executive Summary & Problem Setting

In Great Britain's deregulated wholesale electricity market, energy utilities must buy power ahead of time to reliably serve customer demand. Decisions to purchase supplemental energy—primarily flexible thermal generation (such as Combined Cycle Gas Turbines - CCGT)—are finalized in the **UK Day-Ahead Auction** (operated by EPEX SPOT and Nord Pool UK) which closes daily around **11:00–12:00 UTC on Delivery Day − 1 (D-1)**.

Because wind generation is weather-dependent and non-dispatchable:
1. **Decision Dependency**: Energy traders cannot wait for real-time wind outturn; they must commit to power purchase volumes at D-1 12:00 UTC based solely on available meteorological wind forecasts.
2. **Imbalance Penalty Risk**: Under Elexon's Balancing and Settlement Code (BSC), physical deviations between contracted power and actual customer demand settle at the **System Imbalance Price (Cash-out price)**. A short position during system stress can expose utilities to catastrophic prices (£300 to £1,000+/MWh).
3. **The Solution**: **WindWatch** ingests national wind forecasts and outturn from Elexon BMRS, isolates the **exact decision-relevant D-1 forecast**, and computes quantified error bounds (MAE, RMSE, Bias, and diurnal profiles) so traders can procure optimal thermal capacity and operating reserves without over-paying or taking imbalance penalties.

---

## 2. System Architecture

```
                          ┌──────────────────────────────────────┐
                          │         Elexon BMRS Stream           │
                          │   FUELHH (Actuals) & WINDFOR (Fcst)  │
                          └──────────────────┬───────────────────┘
                                             │ HTTP/REST (JSON)
                                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        FastAPI Backend (Python 3.12)                   │
│                                                                        │
│   ┌────────────────────┐   ┌───────────────────┐   ┌────────────────┐  │
│   │   ElexonClient     │   │ Analytics Engine  │   │ In-Memory      │  │
│   │   (Async HTTPX)    ├──►│ (Pandas / NumPy)  ├──►│ TTLCache       │  │
│   │                    │   │   D-1 Cutoff Rule │   │ (10 min TTL)   │  │
│   └────────────────────┘   └───────────────────┘   └────────────────┘  │
│            ▲                         ▲                      ▲          │
│            │                         │                      │          │
│   ┌────────┴───────────┐   ┌─────────┴─────────┐   ┌────────┴───────┐  │
│   │  GET /api/actuals  │   │ GET /api/forecasts│   │GET/api/accuracy│  │
│   └────────────────────┘   └───────────────────┘   └────────────────┘  │
└────────────────────────────────────▲───────────────────────────────────┘
                                     │ JSON REST API
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        React 18 Frontend (Vite)                        │
│                                                                        │
│   ┌────────────────────┐   ┌───────────────────┐   ┌────────────────┐  │
│   │    Dashboard       │   │ Forecast Explorer │   │Accuracy Analysis│ │
│   │   KPIs + Outturn   │   │ Evolution & HH 48 │   │Diurnal & Scatter│ │
│   │   Overlay Chart    │   │ Procurement Table │   │Trading Guidance│  │
│   └────────────────────┘   └───────────────────┘   └────────────────┘  │
│   Tailwind CSS Dark Theme  ·  Recharts Visuals  ·  TanStack React Query │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Analytical Logic & Methodology

### 3.1 The Day-Ahead Decision Rule
Elexon's `WINDFOR` dataset continuously publishes rolling wind forecasts multiple times daily. To isolate the exact forecast an operator had available when submitting day-ahead market orders:

$$\text{Decision Cutoff} = (\text{Delivery Date} - 1 \text{ day}) + \text{12:00:00 UTC}$$

For each half-hour settlement slot $T$, the platform selects the **latest forecast published with $\text{publishTime} \le \text{Decision Cutoff}$**.

### 3.2 Quantified Error Metrics
For actual generation $A_t$ and forecast $F_t$ across $N$ settlement periods in January 2026:
- **Mean Absolute Error (MAE)**: $\frac{1}{N} \sum_{t=1}^N |F_t - A_t|$  
  *Operational interpretation: The average size of required flexible/thermal reserve buffer.*
- **Root Mean Squared Error (RMSE)**: $\sqrt{\frac{1}{N} \sum_{t=1}^N (F_t - A_t)^2}$  
  *Operational interpretation: Penalizes severe tail forecasting failures during sudden storm front transitions.*
- **Systematic Bias**: $\frac{1}{N} \sum_{t=1}^N (F_t - A_t)$  
  *Operational interpretation: A positive bias indicates persistent over-forecasting, warning traders that relying on raw forecasts will consistently leave them short in real time.*
- **Mean Absolute Percentage Error (MAPE)**: $\frac{1}{N} \sum_{t=1}^N \frac{|F_t - A_t|}{A_t} \times 100\%$

---

## 4. Repository & File Structure

```
gridbricks-challenge/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI entrypoint, CORS, lifespan, routes
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── actuals.py        # GET /api/actuals (FUELHH stream wind actuals)
│   │   │   ├── forecasts.py      # GET /api/forecasts, /latest, /evolution
│   │   │   └── accuracy.py       # GET /api/accuracy (January 2026 evaluation)
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── elexon.py         # Async httpx client with in-memory TTLCache
│   │       └── analytics.py      # D-1 matching rule, MAE/RMSE/Bias/diurnal math
│   ├── Dockerfile                # Multi-stage production Python container
│   ├── Procfile                  # Heroku / Railway web process entry
│   ├── runtime.txt               # Python runtime specification
│   └── requirements.txt          # Production dependencies
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.js         # Axios instance with error interceptors
│   │   │   └── endpoints.js      # Typed API service wrappers
│   │   ├── components/
│   │   │   ├── Layout.jsx        # Responsive navigation sidebar & header
│   │   │   ├── KPICard.jsx       # Themed KPI metric cards with accents
│   │   │   ├── LoadingSpinner.jsx# Skeleton loaders and indicators
│   │   │   └── ErrorBoundary.jsx # React error boundary with retry logic
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx     # Overview KPIs & Outturn overlay chart
│   │   │   ├── ForecastExplorer.jsx # Forecast evolution & 48-HH procurement schedule
│   │   │   └── AccuracyAnalysis.jsx # Diurnal error bars, timeline, scatter plot
│   │   ├── utils/
│   │   │   └── formatters.js     # MW/GW, percentage, and UK settlement formatting
│   │   ├── App.jsx               # React Router configuration
│   │   ├── index.css             # Tailwind base & custom dark styling
│   │   └── main.jsx              # Application bootstrap & React Query provider
│   ├── Dockerfile                # Production Node builder + Nginx image
│   ├── nginx.conf                # Nginx SPA fallback & backend API proxy
│   ├── package.json              # React 18, Vite, Recharts, Tailwind dependencies
│   ├── tailwind.config.js        # Dark mode color palette
│   ├── vite.config.js            # Vite build & development proxy setup
│   └── vercel.json               # Vercel deployment routing configuration
│
├── docker-compose.yml            # Complete one-command containerized stack
├── .gitignore                    # Repository cleanliness rules
└── README.md                     # Technical & business documentation
```

---

## 5. How to Run the Application

### Option A: Using Docker (Recommended)
Make sure Docker Desktop is running, then run:

```bash
docker compose up --build
```

- **Frontend Application**: `http://localhost:3000`
- **Backend API**: `http://localhost:8000`
- **Swagger Interactive API Docs**: `http://localhost:8000/docs`

---

### Option B: Local Development (Manual)

#### 1. Backend Setup (Python 3.11+)
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Backend will be live at `http://localhost:8000`.

#### 2. Frontend Setup (Node.js 18+)
In another terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 6. Cloud Deployment

### Frontend on Vercel
1. Import the repository into [Vercel](https://vercel.com).
2. Set Root Directory to `frontend`.
3. Set Framework Preset to **Vite**.
4. Configure Environment Variable:
   - `VITE_API_URL`: URL of your deployed backend (e.g. `https://your-backend.onrender.com/api`).
5. Deploy.

### Backend on Heroku / Render / Railway
1. Point your service to the `backend/` directory.
2. For Heroku, the included `Procfile` and `runtime.txt` will automatically configure `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
3. Set environment variable `PYTHONUNBUFFERED=1`.

---

## 7. Demo Video & Presentation

Watch the comprehensive 10-minute presentation demonstrating both commercial trading value and the technical engineering implementation:

📺 **[Watch Full Video Walkthrough (YouTube)](https://youtu.be/DEMO_LINK_HERE)**

### Video Structure
- **Part 1 (0:00 – 4:50) · Client Demonstration & Procurement Desk Pitch**
  - UK Day-Ahead power market context and Elexon Cash-out imbalance exposure.
  - Live walkthrough of the WindWatch Dashboard, interactive half-hourly evolution, and the 48-period settlement schedule.
  - Diurnal risk modeling and automated procurement guidance for energy traders.
- **Part 2 (4:50 – 9:50) · Technical Architecture & Engineering Deep-Dive**
  - Decoupled FastAPI and React 18 architecture with Elexon BMRS streaming ingestion.
  - Implementation of the strict D-1 12:00 UTC auction gate closure cutoff logic.
  - Performance optimization via in-memory TTLCache and vectorized NumPy/Pandas computation.
  - Multi-stage Docker containerization, health checks, and cloud deployment setup.

---

## 8. AI Tools Disclosure

As explicitly permitted in the assignment brief, this application was developed with the assistance of modern AI agentic workflows (DeepMind Antigravity / Claude 3.7 / Gemini) for architectural scaffolding, rapid API schema validation, automated test harness generation, and CSS design system styling. All data transformations, market cutoff algorithms, and statistical accuracy metrics were verified against official Elexon BMRS regulatory specifications.
