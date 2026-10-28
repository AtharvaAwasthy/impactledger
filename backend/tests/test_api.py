import os
import pytest
from fastapi.testclient import TestClient

@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    import importlib
    import app.database, app.models, app.main
    importlib.reload(app.database)
    importlib.reload(app.models)
    importlib.reload(app.main)
    app.database.Base.metadata.create_all(bind=app.database.engine)
    with TestClient(app.main.app) as c:
        yield c
    app.database.Base.metadata.drop_all(bind=app.database.engine)

def setup(client):
    org = client.post("/organizations", json={"name":"Test NGO"}).json()
    project = client.post("/projects", json={"organization_id":org["id"],"name":"School Kits","budget_minor":1000000}).json()
    cash = client.post("/accounts", json={"organization_id":org["id"],"code":"1000","name":"Bank","account_type":"asset"}).json()
    revenue = client.post("/accounts", json={"organization_id":org["id"],"code":"4000","name":"Restricted donations","account_type":"revenue","restricted":True}).json()
    expense = client.post("/accounts", json={"organization_id":org["id"],"code":"5000","name":"Program expense","account_type":"expense","project_id":project["id"]}).json()
    donation = client.post("/journal-entries", json={"organization_id":org["id"],"reference":"DON-1","description":"Donation",
        "lines":[{"account_id":cash["id"],"debit_minor":500000},{"account_id":revenue["id"],"credit_minor":500000}]})
    assert donation.status_code == 201, donation.text
    return org, project, cash, expense

def test_health(client):
    assert client.get("/health").json() == {"status":"ok"}

def test_rejects_unbalanced_journal(client):
    org, project, cash, expense = setup(client)
    revenue = client.get("/accounts").json()[1]
    r = client.post("/journal-entries", json={"organization_id":org["id"],"reference":"BAD-1","description":"Bad",
        "lines":[{"account_id":cash["id"],"debit_minor":10000},{"account_id":revenue["id"],"credit_minor":9000}]})
    assert r.status_code == 422

def test_allocation_and_expenditure(client):
    org, project, cash, expense = setup(client)
    r = client.post("/allocations", json={"organization_id":org["id"],"project_id":project["id"],
        "source_account_id":cash["id"],"amount_minor":200000,"note":"School kits"})
    assert r.status_code == 201, r.text
    r = client.post("/expenditures", json={"organization_id":org["id"],"project_id":project["id"],
        "expense_account_id":expense["id"],"cash_account_id":cash["id"],"amount_minor":50000,
        "category":"Learning materials","vendor_reference":"INV-1"})
    assert r.status_code == 201, r.text
    summary = client.get("/transparency/projects").json()[0]
    assert summary["allocated_minor"] == 200000
    assert summary["spent_minor"] == 50000
    assert summary["remaining_allocation_minor"] == 150000

def test_rejects_overallocation(client):
    org, project, cash, expense = setup(client)
    r = client.post("/allocations", json={"organization_id":org["id"],"project_id":project["id"],
        "source_account_id":cash["id"],"amount_minor":600000})
    assert r.status_code == 422
