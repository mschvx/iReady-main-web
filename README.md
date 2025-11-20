
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
