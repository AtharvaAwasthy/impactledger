# ImpactLedger

**A nonprofit fund transparency prototype for project allocations, expenditure tracking, double-entry journal records, and financial audit trails.**

ImpactLedger is a full-stack application designed to demonstrate how financial activity associated with nonprofit projects can be recorded, validated, and inspected through a REST API and a web dashboard.

## Overview

Nonprofit organizations need clear records of how funds are allocated and spent. ImpactLedger explores a software-based approach to making project-level financial activity easier to inspect.

The application combines a FastAPI backend with a React and TypeScript dashboard. Its backend provides endpoints for managing organizations, projects, accounts, journal entries, allocations, expenditures, transparency summaries, and audit logs.

> **Project status:** Prototype. This project is intended for learning and demonstration, not for managing real funds or production financial records.

## Features

- **Organization and project management:** Create organizations and manage project records.
- **Account management:** Create and list financial accounts.
- **Journal entries:** Validate that journal entry debits and credits balance.
- **Fund allocation:** Record allocations from accounts to projects.
- **Expenditure tracking:** Record project expenditures against configured accounts.
- **Transparency reporting:** Retrieve project budgets, allocated funds, spending, and remaining balances.
- **Audit logging:** Inspect recorded financial actions.
- **Web dashboard:** View project-level financial summaries through a React interface.
- **API documentation:** Explore request schemas and endpoints using Swagger UI.
- **Automated tests:** Test key API workflows and financial validation rules.

## Technology Stack

| Component | Technology |
|---|---|
| Backend | Python, FastAPI |
| ASGI server | Uvicorn |
| Data models and persistence | SQLAlchemy |
| Request validation | Pydantic |
| Database | SQLite for local development |
| Frontend | React, TypeScript |
| Frontend tooling | Vite |
| API documentation | OpenAPI / Swagger UI |
| Testing | pytest |

## Project Structure

```text
impactledger/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── database.py
│   │   ├── main.py
│   │   └── models.py
│   ├── tests/
│   │   └── test_api.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.10 or later, compatible with the dependencies in `backend/requirements.txt`
- Node.js and npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/AtharvaAwasthy/impactledger.git
cd impactledger
```

### 2. Set up the backend

From the project root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Start the API:

```bash
uvicorn app.main:app --reload
```

The API should be available at `http://127.0.0.1:8000`.

### 3. Explore the API

Open Swagger UI in your browser:

`http://127.0.0.1:8000/docs`

Check the health endpoint:

```http
GET /health
```

Expected response:

```json
{
  "status": "ok"
}
```

### 4. Start the frontend

Open a second terminal at the project root:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, typically `http://localhost:5173`.

The backend must be running for the dashboard to retrieve live project summaries.

### 5. Run the backend tests

In a terminal:

```bash
cd backend
source .venv/bin/activate
python -m pytest -v
```

The current backend test suite has passed four tests in local development. Run the suite again after making changes to confirm the current result.

## API Endpoints

The following endpoints cover the main application workflows. Use Swagger UI to inspect their request and response schemas.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Check API availability |
| POST | `/organizations` | Create an organization |
| GET | `/projects` | List projects |
| POST | `/projects` | Create a project |
| GET | `/accounts` | List accounts |
| POST | `/accounts` | Create an account |
| GET | `/journal-entries` | List journal entries |
| POST | `/journal-entries` | Post a journal entry |
| POST | `/allocations` | Allocate funds to a project |
| POST | `/expenditures` | Record a project expenditure |
| GET | `/transparency/projects` | Retrieve project financial summaries |
| GET | `/audit-logs` | Inspect audit events |

## Financial Integrity

The prototype includes validation for key financial workflows:

- Journal entries must have equal, positive total debits and credits.
- Expenditures must reference appropriately configured accounts.
- Allocation and expenditure workflows update project-level financial summaries.
- Financial actions generate audit events that can be inspected through the API.

Amounts are represented using integer fields such as `amount_minor`, `debit_minor`, and `credit_minor`, avoiding floating-point arithmetic for stored monetary amounts.

**Currency convention:** Confirm the currency and minor-unit interpretation in the implementation before using reported values in a real financial context.

These controls demonstrate selected validation rules; they do not constitute a complete accounting compliance or financial security system.

## Current Limitations

ImpactLedger is an early-stage prototype. Before production use, it would require additional work, including:

- Authentication, authorization, and organization-level access controls
- Stronger transaction and concurrency guarantees
- More comprehensive validation and automated test coverage
- Database migration and backup procedures
- Audit-log integrity and tamper-resistance controls
- Production configuration, deployment security, and monitoring
- Independent verification of accounting rules and reporting calculations

The current local development setup uses SQLite. The local database file is excluded from version control; a fresh installation should be tested to verify database initialization and the setup workflow.

## Future Improvements

Potential next steps include role-based access control, richer financial reporting, exportable transparency reports, a production