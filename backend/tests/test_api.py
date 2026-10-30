
import importlib
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """
    Give every test its own SQLite database so tests remain isolated.
    """
    monkeypatch.setenv(
        "DATABASE_URL",
        f"sqlite:///{tmp_path / 'test.db'}",
    )

    import app.database
    import app.models
    import app.main

    importlib.reload(app.database)
    importlib.reload(app.models)
    importlib.reload(app.main)

    app.database.Base.metadata.create_all(
        bind=app.database.engine
    )

    with TestClient(app.main.app) as test_client:
        yield test_client

    app.database.Base.metadata.drop_all(
        bind=app.database.engine
    )
    app.database.engine.dispose()


def setup(client):
    """
    Create an organization, project, accounts and an initial
    donation of 500,000 minor units.
    """
    response = client.post(
        "/organizations",
        json={"name": "Test NGO"},
    )
    assert response.status_code == 201, response.text
    org = response.json()

    response = client.post(
        "/projects",
        json={
            "organization_id": org["id"],
            "name": "School Kits",
            "description": "Providing school supplies",
            "budget_minor": 500000,
        },
    )
    assert response.status_code == 201, response.text
    project = response.json()

    response = client.post(
        "/accounts",
        json={
            "organization_id": org["id"],
            "code": "1000",
            "name": "Bank Account",
            "account_type": "asset",
            "restricted": False,
        },
    )
    assert response.status_code == 201, response.text
    cash = response.json()

    response = client.post(
        "/accounts",
        json={
            "organization_id": org["id"],
            "code": "4000",
            "name": "Restricted Donations",
            "account_type": "revenue",
            "restricted": True,
        },
    )
    assert response.status_code == 201, response.text
    revenue = response.json()

    response = client.post(
        "/accounts",
        json={
            "organization_id": org["id"],
            "code": "5000",
            "name": "Program Expenses",
            "account_type": "expense",
            "restricted": False,
            "project_id": project["id"],
        },
    )
    assert response.status_code == 201, response.text
    expense = response.json()

    response = client.post(
        "/journal-entries",
        json={
            "organization_id": org["id"],
            "reference": "DONATION-001",
            "description": "Initial donation",
            "lines": [
                {
                    "account_id": cash["id"],
                    "debit_minor": 500000,
                    "credit_minor": 0,
                    "project_id": project["id"],
                    "memo": "Donation received",
                },
                {
                    "account_id": revenue["id"],
                    "debit_minor": 0,
                    "credit_minor": 500000,
                    "project_id": project["id"],
                    "memo": "Donation income",
                },
            ],
        },
    )
    assert response.status_code == 201, response.text

    return org, project, cash, expense


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_rejects_unbalanced_journal(client):
    org, project, cash, expense = setup(client)

    response = client.post(
        "/journal-entries",
        json={
            "organization_id": org["id"],
            "reference": "INVALID-001",
            "description": "Unbalanced journal",
            "lines": [
                {
                    "account_id": expense["id"],
                    "debit_minor": 10000,
                    "credit_minor": 0,
                    "project_id": project["id"],
                },
                {
                    "account_id": cash["id"],
                    "debit_minor": 0,
                    "credit_minor": 5000,
                    "project_id": project["id"],
                },
            ],
        },
    )

    assert response.status_code == 422


def test_allocation_and_expenditure(client):
    org, project, cash, expense = setup(client)

    response = client.post(
        "/allocations",
        json={
            "organization_id": org["id"],
            "project_id": project["id"],
            "source_account_id": cash["id"],
            "amount_minor": 200000,
            "note": "School kits",
        },
    )

    assert response.status_code == 201, response.text

    response = client.post(
        "/expenditures",
        json={
            "organization_id": org["id"],
            "project_id": project["id"],
            "expense_account_id": expense["id"],
            "cash_account_id": cash["id"],
            "amount_minor": 50000,
            "category": "Learning materials",
            "vendor_reference": "INV-1",
        },
    )

    assert response.status_code == 201, response.text

    transparency = client.get("/transparency/projects")
    assert transparency.status_code == 200

    project_data = next(
        item
        for item in transparency.json()
        if item["project_id"] == project["id"]
    )

    assert project_data["allocated_minor"] == 200000
    assert project_data["spent_minor"] == 50000
    assert project_data["remaining_allocation_minor"] == 150000


def test_rejects_overallocation(client):
    org, project, cash, expense = setup(client)

    response = client.post(
        "/allocations",
        json={
            "organization_id": org["id"],
            "project_id": project["id"],
            "source_account_id": cash["id"],
            "amount_minor": 600000,
            "note": "Exceeds available funds",
        },
    )

    assert response.status_code == 422


def test_expenditure_rollback_on_audit_failure(client, monkeypatch):
    import app.main as main

    org, project, cash, expense = setup(client)

    allocation = client.post(
        "/allocations",
        json={
            "organization_id": org["id"],
            "project_id": project["id"],
            "source_account_id": cash["id"],
            "amount_minor": 200000,
            "note": "Rollback test",
        },
    )
    assert allocation.status_code == 201, allocation.text

    def failing_audit(db, org_id, action, kind, entity_id, details):
        from app.models import AuditLog

        db.add(
            AuditLog(
                organization_id=org_id,
                action=action,
                entity_type=kind,
                entity_id=str(entity_id),
                details="{}",
            )
        )
        raise RuntimeError("Simulated audit failure")

    monkeypatch.setattr(main, "audit", failing_audit)

    with pytest.raises(RuntimeError, match="Simulated audit failure"):
        client.post(
            "/expenditures",
            json={
                "organization_id": org["id"],
                "project_id": project["id"],
                "expense_account_id": expense["id"],
                "cash_account_id": cash["id"],
                "amount_minor": 50000,
                "category": "Rollback test",
                "vendor_reference": "ROLLBACK-1",
            },
        )

    journals = client.get("/journal-entries")
    assert journals.status_code == 200

    expenditure_journals = [
        entry
        for entry in journals.json()
        if entry["reference"].startswith("EXP-")
    ]
    assert expenditure_journals == []

    transparency = client.get("/transparency/projects")
    project_data = next(
        item
        for item in transparency.json()
        if item["project_id"] == project["id"]
    )

    assert project_data["spent_minor"] == 0
    assert project_data["remaining_allocation_minor"] == 200000

    audit_logs = client.get("/audit-logs")
    assert audit_logs.status_code == 200

    expenditure_audits = [
        item
        for item in audit_logs.json()
        if item["action"] == "expenditure.recorded"
    ]
    assert expenditure_audits == []


def test_expenditure_idempotency(client):
    org, project, cash, expense = setup(client)

    allocation = client.post(
        "/allocations",
        json={
            "organization_id": org["id"],
            "project_id": project["id"],
            "source_account_id": cash["id"],
            "amount_minor": 200000,
            "note": "Idempotency test",
        },
    )
    assert allocation.status_code == 201, allocation.text

    payload = {
        "organization_id": org["id"],
        "project_id": project["id"],
        "expense_account_id": expense["id"],
        "cash_account_id": cash["id"],
        "amount_minor": 50000,
        "category": "Learning materials",
        "vendor_reference": "INV-IDEMPOTENT",
    }

    headers = {"Idempotency-Key": "test-expenditure-001"}

    first = client.post(
        "/expenditures",
        json=payload,
        headers=headers,
    )
    assert first.status_code == 201, first.text

    second = client.post(
        "/expenditures",
        json=payload,
        headers=headers,
    )
    assert second.status_code == 201, second.text

    assert first.json()["id"] == second.json()["id"]

    transparency = client.get("/transparency/projects")
    project_data = next(
        item
        for item in transparency.json()
        if item["project_id"] == project["id"]
    )

    assert project_data["spent_minor"] == 50000
    assert project_data["remaining_allocation_minor"] == 150000

    different_payload = {
        **payload,
        "amount_minor": 60000,
    }

    conflict = client.post(
        "/expenditures",
        json=different_payload,
        headers=headers,
    )

    assert conflict.status_code == 409


def test_concurrent_expenditures_cannot_overspend_allocation(client):
    import app.main as main

    org, project, cash, expense = setup(client)

    allocation = client.post(
        "/allocations",
        json={
            "organization_id": org["id"],
            "project_id": project["id"],
            "source_account_id": cash["id"],
            "amount_minor": 100000,
            "note": "Concurrency test allocation",
        },
    )
    assert allocation.status_code == 201, allocation.text

    barrier = Barrier(2)

    def make_expenditure(reference):
        payload = {
            "organization_id": org["id"],
            "project_id": project["id"],
            "expense_account_id": expense["id"],
            "cash_account_id": cash["id"],
            "amount_minor": 70000,
            "category": "Concurrency test",
            "vendor_reference": reference,
        }

        # Each worker uses its own TestClient and therefore its own
        # request/session context, while sharing the same test database.
        with TestClient(main.app) as worker_client:
            barrier.wait(timeout=10)
            return worker_client.post(
                "/expenditures",
                json=payload,
            )

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(make_expenditure, "CONCURRENT-1"),
            executor.submit(make_expenditure, "CONCURRENT-2"),
        ]

        responses = [future.result(timeout=30) for future in futures]

    statuses = sorted(response.status_code for response in responses)

    assert statuses == [201, 422], [
        (response.status_code, response.text)
        for response in responses
    ]

    transparency = client.get("/transparency/projects")
    assert transparency.status_code == 200

    project_data = next(
        item
        for item in transparency.json()
        if item["project_id"] == project["id"]
    )

    assert project_data["spent_minor"] == 70000
    assert project_data["remaining_allocation_minor"] == 30000
