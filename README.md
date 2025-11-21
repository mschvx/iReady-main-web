# iReady — Risk Hierarchy Random Forest

This repository contains code and datasets used to compute a risk hierarchy for barangay-level administrative codes (`adm4_pcode`) in the Philippines using a Random Forest model.

What I added
- `Model/risk_random_forest.py`: script to load datasets, compute features (wealth, health access, IMF indicators, distance to cyclone tracks), create a proxy risk label (4 levels), train a Random Forest classifier, and save predictions and model.
- `requirements.txt`: Python packages used for development.

Outputs
- `Model/risk_predictions.csv`: per-`adm4_pcode` predicted risk level and confidence.
- `Model/rf_risk_model.joblib`: saved model bundle (model, scaler, feature list).

Prerequisites
- Python 3.8+ (3.10/3.11/3.12 tested). Use the interpreter you run in VS Code or the terminal.
- Recommended: use Miniconda/Conda for easier installation of geospatial packages on Windows.

Install (recommended — Conda)
1. Create a conda environment and install packages (recommended for Windows):

```powershell
conda create -n iready python=3.10 -y
conda activate iready
conda install -c conda-forge scikit-learn pandas numpy joblib geopandas shapely pyproj rtree -y
```

Install (pip-only)
1. Create and activate a venv (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install Python packages with pip:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Notes on geospatial packages
- `geopandas` and `shapely` are optional. If they are not available, `Model/risk_random_forest.py` falls back to a haversine-based distance computation (uses track vertices) which does not require `geopandas`.
- On Windows, installing `geopandas` via `conda` (`-c conda-forge`) avoids compilation headaches.

Run the risk pipeline
1. From the repository root (PowerShell):

```powershell
# activate your environment (see install steps)
python .\Model\risk_random_forest.py
```

2. Expected behavior:
 - The script reads CSVs and the cyclone track GeoJSON in `Datasets/Datasets/`.
 - It builds features and a proxy risk label (4 quantile bins: `0=low` ... `3=high`).
 - It trains a Random Forest to reproduce the proxy label, saves the model, and writes `Model/risk_predictions.csv`.

Customizing the proxy risk
- The script computes a `proxy_risk_score` from several features (inverse wealth, low health access, INFORM vulnerability/coping, ND-GAIN vulnerability metrics, distance to track inverse, storms). Weights are applied in `compute_proxy_risk()` inside `Model/risk_random_forest.py` — adjust them if you want different emphasis.

Troubleshooting
- If the script errors on importing `sklearn` or other packages, ensure you installed them in the same Python environment used to run the script. Verify with:

```powershell
python -c "import sklearn, pandas, numpy; print('sklearn', sklearn.__version__)"
```

- If distance calculation returns no values, check that `Datasets/Datasets/CCHAIN/brgy_geography.csv` contains latitude/longitude columns whose names include `lat` and `lon` (or `lng`). If not available, the script will still run but will omit distance features.

Next steps I can help with
- Run the script here and upload the generated `Model/risk_predictions.csv` if you want (I can execute it if you confirm). 
- Add a small Jupyter notebook to visualize predicted risk on the map.
- Tune proxy weights and retrain with cross-validation.

If you'd like, I can commit these changes and open a PR with the README and the model files. Tell me which next step you want.

---
Generated: automatically by the project assistant.

# 🌀 iReady

### 📘 A Submission for PJDSC 2025

### 👥 Team SUSpension

- **Aaron Kyle Santos**
- **Allane Lee Castro**
- **Jodi Antonette Calleja**
- **Ljiel Saplan**
- **Mari Gabriel De Leon**

### 💡 About iReady

**iReady** is a web-based application designed to assist Local Government Units (LGUs) in enhancing their recovery and response efforts during times of calamities.

By integrating pre-storm relief planning and logistics optimization, iReady aims to improve community resilience and ensure that aid and resources are allocated efficiently and effectively before disasters strike.

### 🧭 Project Goals

- Strengthen preparedness through data-driven planning
- Optimize logistics and resource distribution
- Support LGUs with real-time, accessible dashboards
- Improve resilience and coordination before and after storms

### 🧩 Tech Stack

This project is a full-stack web application with a Python-based modelling component. The tech stack includes:

- Frontend
  - React 18 (via Vite)
  - TypeScript
  - TailwindCSS (with plugins like `@tailwindcss/typography`)
  - React ecosystem: `react-dom`, `@tanstack/react-query` (react-query), `react-hook-form`, `react-leaflet`, `recharts`, `framer-motion`, `lucide-react`, `react-icons`
  - Radix UI primitives (several `@radix-ui/*` packages)
  - `wouter` for client routing

- Backend
  - Node.js + Express (TypeScript)
  - Vite used as dev server and build pipeline for the client
  - `esbuild` for bundling the server during production builds
  - Session and auth: `express-session`, `passport`, `passport-local`, `connect-pg-simple`, `memorystore`
  - Drizzle ORM and `drizzle-kit` for database migrations/schema

- Data & Model
  - Python 3 scripts for Random Forest model (pandas, numpy; scikit-learn implied)

### 📁 File / Directory Structure

The following is an extracted and slightly annotated view of the repository structure to help reviewers navigate the project:

- `Data/` (where Python script output is stored)
  - `ToReceive.json`

- `Datasets/` (raw/processed CSV datasets used for modelling)
  - `CCHAIN/`
    - `disease_index.csv`
    - `health_facility_evacuation_center_proximity_population.csv`
    - `wealth_index.csv`
  - `CLIMAP/`
    - `laguna_rainfall.csv`
    - `metro_manila_rainfall.csv`
  - `IMF/`
    - `13_Forest_and_Carbon.csv`
    - `14_Climate-related_Disasters_Frequency.csv`
    - `15_Climate-driven_INFORM_Risk.csv`
    - `23_Annual_Surface_Temperature_Change.csv`
    - `26_Land_Cover_Accounts.csv`

- `Landing/` (main application root)
  - `client/` (frontend app)
    - `index.html`
    - `public/`
      - `ToReceive.json`
      - `figmaAssets/`
    - `src/`
      - `App.tsx`
      - `main.tsx`
      - `index.css`
      - `components/`
      - `hooks/`
      - `lib/`
      - `pages/`
  - `server/`
    - `index.ts`
    - `routes.ts`
    - `storage.ts`
    - `vite.ts`
    - `data/`
      - `navotas_pois.json`
  - `shared/`
    - `schema.ts`
  - `attached_assets/`
  - `package.json`
  - `tsconfig.json`
  - `vite.config.ts`

- `Model/`
  - `RForest_train.py`
  - `RForest_predict_supplies.py`

### 🏆 Acknowledgment

Developed as part of the **Philippine Junior Data Science Challenge (PJDSC) 2025**.

### 🌲 How to Open the Website
1. Download the codebase and extract
2. Open terminal and `cd` to folder `Landing`
3. Type `npm install` if not installed prior to downloading
4. Type `npm run dev` to open the localhost website

