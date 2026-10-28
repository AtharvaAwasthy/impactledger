# ImpactLedger API

A REST API prototype for project fund allocation, expenditure tracking, financial journal entries, and audit transparency.

## Overview

ImpactLedger is designed to demonstrate how financial activity associated with projects can be recorded and inspected through an API. It includes endpoints for managing organizations, projects, accounts, allocations, expenditures, journal entries, and audit logs.

## Core Features

- **Organization management:** Create organizations.
- **Project management:** Create and list projects.
- **Account management:** Create and list financial accounts.
- **Journal entries:** Record balanced debit and credit entries.
- **Fund allocation:** Allocate funds from an account to a project.
- **Expenditure tracking:** Record project expenditures against configured accounts.
- **Transparency reporting:** Retrieve project budgets, allocations, spending, and remaining balances.
- **Audit logging:** Inspect recorded financial actions.
- **Health monitoring:** Check API availability.

## Technology

- Python
- FastAPI
- Uvicorn
- OpenAPI / Swagger UI
- JSON over HTTP

Confirm the exact dependencies and versions against the project configuration before publishing.

## Getting Started

### Prerequisites

- Python 3.10 or later, subject to the project's actual requirements
- pip
- A terminal

### Installation

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_PROJECT_DIRECTORY>
```

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install the project's dependencies:

```bash
pip install -r requirements.txt
```

### Run the API

If the FastAPI application object is named `app` in `main.py`, run:

```bash
uvicorn main:app --reload
```

Adjust the module path if your application entry point has a different filename.

### Open Swagger UI

Visit:

```text
http://127.0.0.1:8000/docs
```

Check the API health endpoint:

```text
GET /health
```

A successful response should resemble:

```json
{
  "status": "ok"
}
```

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Check API health |
| POST | `/organizations` | Create an organization |
| GET | `/projects` | List projects |
| POST | `/projects` | Create a project |
| GET | `/accounts` | List accounts |
| POST | `/accounts` | Create an account |
| GET | `/journal-entries` | List journal entries |
| POST | `/journal-entries` | Post a journal entry |
| POST | `/allocations` | Allocate project funds |
| POST | `/expenditures` | Record an expenditure |
| GET | `/transparency/projects` | Retrieve project financial summaries |
| GET | `/audit-logs` | Inspect audit events |

Use Swagger UI to inspect request schemas, required fields, response models, and validation errors.

## Financial Integrity

The API has been exercised with test requests covering journal posting, fund allocation, expenditure recording, transparency reporting, and audit logs.

The journal validation test checks that total debits equal total credits and that both totals are positive. The API has also returned a validation error for an expenditure referencing an account that was not configured as an expense account.

Amounts use a field named `amount_minor` or `debit_minor` / `credit_minor`. Confirm the currency and minor-unit convention in the implementation before presenting monetary values to users.

## Testing

Manual tests have exercised the main API workflows through Swagger UI.

Before treating the project as production-ready, add automated tests for:

- Balanced and unbalanced journal entries
- Invalid organization, project, and account references
- Invalid account types
- Allocation and expenditure limits
- Transparency calculations
- Audit-log consistency
- Data persistence and error handling

## Limitations

This project is a prototype until persistence guarantees, automated test coverage, authorization, input validation, and deployment security have been independently verified.

## License

Add a license if you intend to distribute the project publicly.
