
import json
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.database import Base, engine, get_db
from app.models import (
    Organization, Project, Account, JournalEntry, JournalLine,
    Allocation, Expenditure, AuditLog
)
from fastapi import FastAPI, Depends, HTTPException, Header
from sqlalchemy.exc import IntegrityError

Base.metadata.create_all(bind=engine)

app = FastAPI(title="ImpactLedger API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"]
)


class OrgIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class ProjectIn(BaseModel):
    organization_id: int
    name: str = Field(min_length=2, max_length=160)
    description: str = ""
    budget_minor: int = Field(ge=0)


class AccountIn(BaseModel):
    organization_id: int
    code: str
    name: str
    account_type: str
    restricted: bool = False
    project_id: int | None = None


class LineIn(BaseModel):
    account_id: int
    debit_minor: int = Field(default=0, ge=0)
    credit_minor: int = Field(default=0, ge=0)
    project_id: int | None = None
    memo: str = ""


class JournalIn(BaseModel):
    organization_id: int
    reference: str
    description: str
    lines: list[LineIn] = Field(min_length=2)


class AllocationIn(BaseModel):
    organization_id: int
    project_id: int
    source_account_id: int
    amount_minor: int = Field(gt=0)
    note: str = ""


class ExpenditureIn(BaseModel):
    organization_id: int
    project_id: int
    expense_account_id: int
    cash_account_id: int
    amount_minor: int = Field(gt=0)
    category: str
    vendor_reference: str = ""


def audit(db, org_id, action, kind, entity_id, details):
    db.add(
        AuditLog(
            organization_id=org_id,
            action=action,
            entity_type=kind,
            entity_id=str(entity_id),
            details=json.dumps(details, sort_keys=True)
        )
    )


def balance(db, account):
    rows = db.execute(
        select(
            func.coalesce(func.sum(JournalLine.debit_minor), 0),
            func.coalesce(func.sum(JournalLine.credit_minor), 0)
        ).where(JournalLine.account_id == account.id)
    ).one()

    debit, credit = int(rows[0]), int(rows[1])

    return (
        debit - credit
        if account.account_type in ("asset", "expense")
        else credit - debit
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/organizations", status_code=201)
def create_org(payload: OrgIn, db: Session = Depends(get_db)):
    if db.scalar(
        select(Organization.id).where(Organization.name == payload.name)
    ):
        raise HTTPException(409, "Organization already exists")

    obj = Organization(name=payload.name)
    db.add(obj)
    db.commit()
    db.refresh(obj)

    audit(
        db, obj.id, "organization.created",
        "organization", obj.id, {"name": obj.name}
    )
    db.commit()

    return {"id": obj.id, "name": obj.name}


@app.post("/projects", status_code=201)
def create_project(payload: ProjectIn, db: Session = Depends(get_db)):
    if not db.get(Organization, payload.organization_id):
        raise HTTPException(404, "Organization not found")

    obj = Project(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)

    audit(
        db, obj.organization_id, "project.created",
        "project", obj.id, {"name": obj.name}
    )
    db.commit()

    return {
        "id": obj.id,
        "organization_id": obj.organization_id,
        "name": obj.name,
        "description": obj.description,
        "budget_minor": obj.budget_minor,
        "active": obj.active
    }


@app.get("/projects")
def list_projects(db: Session = Depends(get_db)):
    return [
        {
            "id": p.id,
            "organization_id": p.organization_id,
            "name": p.name,
            "description": p.description,
            "budget_minor": p.budget_minor,
            "active": p.active
        }
        for p in db.scalars(
            select(Project).order_by(Project.id)
        ).all()
    ]


@app.post("/accounts", status_code=201)
def create_account(payload: AccountIn, db: Session = Depends(get_db)):
    allowed = {"asset", "liability", "equity", "revenue", "expense"}

    if payload.account_type not in allowed:
        raise HTTPException(422, "Invalid account_type")

    if not db.get(Organization, payload.organization_id):
        raise HTTPException(404, "Organization not found")

    obj = Account(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)

    audit(
        db, obj.organization_id, "account.created",
        "account", obj.id,
        {"code": obj.code, "name": obj.name}
    )
    db.commit()

    return {
        "id": obj.id,
        "code": obj.code,
        "name": obj.name,
        "account_type": obj.account_type,
        "restricted": obj.restricted
    }


@app.get("/accounts")
def list_accounts(db: Session = Depends(get_db)):
    return [
        {
            "id": a.id,
            "organization_id": a.organization_id,
            "code": a.code,
            "name": a.name,
            "account_type": a.account_type,
            "restricted": a.restricted,
            "project_id": a.project_id
        }
        for a in db.scalars(
            select(Account).order_by(Account.id)
        ).all()
    ]


@app.post("/journal-entries", status_code=201)
def post_journal(payload: JournalIn, db: Session = Depends(get_db)):
    if not db.get(Organization, payload.organization_id):
        raise HTTPException(404, "Organization not found")

    if db.scalar(
        select(JournalEntry.id).where(
            JournalEntry.reference == payload.reference
        )
    ):
        raise HTTPException(409, "Journal reference already exists")

    debits = sum(x.debit_minor for x in payload.lines)
    credits = sum(x.credit_minor for x in payload.lines)

    if debits <= 0 or debits != credits:
        raise HTTPException(
            422,
            "Journal entry must have equal, positive total debits and credits"
        )

    for line in payload.lines:
        if (line.debit_minor > 0) == (line.credit_minor > 0):
            raise HTTPException(
                422,
                "Each line must contain exactly one positive debit or credit"
            )

        acct = db.get(Account, line.account_id)

        if not acct or acct.organization_id != payload.organization_id or not acct.active:
            raise HTTPException(422, f"Invalid account_id {line.account_id}")

        if line.project_id and not db.get(Project, line.project_id):
            raise HTTPException(422, "Invalid project_id")

    entry = JournalEntry(
        organization_id=payload.organization_id,
        reference=payload.reference,
        description=payload.description,
        status="posted"
    )

    entry.lines = [
        JournalLine(
            account_id=x.account_id,
            debit_minor=x.debit_minor,
            credit_minor=x.credit_minor,
            project_id=x.project_id,
            memo=x.memo
        )
        for x in payload.lines
    ]

    db.add(entry)
    db.flush()

    audit(
        db, payload.organization_id, "journal.posted",
        "journal_entry", entry.id,
        {
            "reference": entry.reference,
            "debits_minor": debits,
            "credits_minor": credits
        }
    )

    db.commit()
    db.refresh(entry)

    return {
        "id": entry.id,
        "reference": entry.reference,
        "description": entry.description,
        "status": entry.status
    }


@app.get("/journal-entries")
def journals(db: Session = Depends(get_db)):
    entries = db.scalars(
        select(JournalEntry).order_by(JournalEntry.id.desc())
    ).all()

    return [
        {
            "id": e.id,
            "organization_id": e.organization_id,
            "reference": e.reference,
            "description": e.description,
            "status": e.status,
            "created_at": e.created_at.isoformat(),
            "lines": [
                {
                    "account_id": l.account_id,
                    "debit_minor": l.debit_minor,
                    "credit_minor": l.credit_minor,
                    "project_id": l.project_id,
                    "memo": l.memo
                }
                for l in e.lines
            ]
        }
        for e in entries
    ]


@app.post("/allocations", status_code=201)
def allocate(payload: AllocationIn, db: Session = Depends(get_db)):
    project = db.get(Project, payload.project_id)
    acct = db.get(Account, payload.source_account_id)

    if not project or project.organization_id != payload.organization_id:
        raise HTTPException(404, "Project not found in organization")

    if not acct or acct.organization_id != payload.organization_id or acct.account_type != "asset":
        raise HTTPException(
            422,
            "Source must be an asset account in this organization"
        )

    cash_available = balance(db, acct)

    reserved = db.scalar(
        select(func.coalesce(func.sum(Allocation.amount_minor), 0)).where(
            Allocation.source_account_id == acct.id
        )
    ) or 0

    if payload.amount_minor > cash_available - int(reserved):
        raise HTTPException(
            422,
            "Allocation exceeds available unallocated cash"
        )

    obj = Allocation(
        organization_id=payload.organization_id,
        project_id=project.id,
        source_account_id=acct.id,
        amount_minor=payload.amount_minor,
        note=payload.note
    )

    db.add(obj)
    db.flush()

    audit(
        db, payload.organization_id, "funds.allocated",
        "allocation", obj.id,
        {
            "project_id": project.id,
            "amount_minor": payload.amount_minor,
            "source_account_id": acct.id
        }
    )

    db.commit()
    db.refresh(obj)

    return {
        "id": obj.id,
        "project_id": obj.project_id,
        "amount_minor": obj.amount_minor,
        "note": obj.note
    }

@app.post("/expenditures", status_code=201)
def spend(
    payload: ExpenditureIn,
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(
        default=None,
        alias="Idempotency-Key"
    )
):
    if idempotency_key is not None:
        idempotency_key = idempotency_key.strip()

        if not idempotency_key or len(idempotency_key) > 100:
            raise HTTPException(
                422,
                "Idempotency-Key must contain 1 to 100 characters"
            )

        existing = db.scalar(
            select(Expenditure).where(
                Expenditure.organization_id == payload.organization_id,
                Expenditure.idempotency_key == idempotency_key
            )
        )

        if existing:
            same_request = (
                existing.project_id == payload.project_id
                and existing.expense_account_id == payload.expense_account_id
                and existing.cash_account_id == payload.cash_account_id
                and existing.amount_minor == payload.amount_minor
                and existing.category == payload.category
                and existing.vendor_reference == payload.vendor_reference
            )

            if not same_request:
                raise HTTPException(
                    409,
                    "Idempotency key was already used with different expenditure details"
                )

            return {
                "id": existing.id,
                "project_id": existing.project_id,
                "amount_minor": existing.amount_minor,
                "category": existing.category,
                "journal_entry_id": existing.journal_entry_id
            }

    project = db.get(Project, payload.project_id)
    expense = db.get(Account, payload.expense_account_id)
    cash = db.get(Account, payload.cash_account_id)

    if not project or project.organization_id != payload.organization_id:
        raise HTTPException(404, "Project not found")

    if (
        not expense
        or expense.organization_id != payload.organization_id
        or expense.account_type != "expense"
    ):
        raise HTTPException(
            422,
            "Expense account must be an expense account in this organization"
        )

    if (
        not cash
        or cash.organization_id != payload.organization_id
        or cash.account_type != "asset"
    ):
        raise HTTPException(
            422,
            "Cash account must be an asset account in this organization"
        )

    allocated = db.scalar(
        select(func.coalesce(func.sum(Allocation.amount_minor), 0)).where(
            Allocation.project_id == project.id
        )
    ) or 0

    spent = db.scalar(
        select(func.coalesce(func.sum(Expenditure.amount_minor), 0)).where(
            Expenditure.project_id == project.id
        )
    ) or 0

    if payload.amount_minor > int(allocated) - int(spent):
        raise HTTPException(
            422,
            "Expenditure exceeds remaining project allocation"
        )

    if payload.amount_minor > balance(db, cash):
        raise HTTPException(422, "Expenditure exceeds cash balance")

    try:
        entry = JournalEntry(
            organization_id=payload.organization_id,
            reference=(
                f"EXP-{payload.organization_id}-"
                f"{payload.project_id}-"
                f"{db.query(Expenditure).count() + 1}"
            ),
            description=f"Project expenditure: {payload.category}",
            status="posted",
            lines=[
                JournalLine(
                    account_id=expense.id,
                    debit_minor=payload.amount_minor,
                    credit_minor=0,
                    project_id=project.id,
                    memo=payload.category
                ),
                JournalLine(
                    account_id=cash.id,
                    debit_minor=0,
                    credit_minor=payload.amount_minor,
                    project_id=project.id,
                    memo=payload.vendor_reference
                )
            ]
        )

        db.add(entry)
        db.flush()

        obj = Expenditure(
            organization_id=payload.organization_id,
            project_id=project.id,
            expense_account_id=expense.id,
            cash_account_id=cash.id,
            amount_minor=payload.amount_minor,
            category=payload.category,
            vendor_reference=payload.vendor_reference,
            journal_entry_id=entry.id,
            idempotency_key=idempotency_key
        )

        db.add(obj)
        db.flush()

        audit(
            db,
            payload.organization_id,
            "expenditure.recorded",
            "expenditure",
            obj.id,
            {
                "project_id": project.id,
                "amount_minor": payload.amount_minor,
                "category": payload.category
            }
        )

        db.commit()

    except IntegrityError:
        db.rollback()

        # Another request may have committed the same key first.
        if idempotency_key:
            existing = db.scalar(
                select(Expenditure).where(
                    Expenditure.organization_id == payload.organization_id,
                    Expenditure.idempotency_key == idempotency_key
                )
            )

            if existing:
                same_request = (
                    existing.project_id == payload.project_id
                    and existing.expense_account_id == payload.expense_account_id
                    and existing.cash_account_id == payload.cash_account_id
                    and existing.amount_minor == payload.amount_minor
                    and existing.category == payload.category
                    and existing.vendor_reference == payload.vendor_reference
                )

                if same_request:
                    return {
                        "id": existing.id,
                        "project_id": existing.project_id,
                        "amount_minor": existing.amount_minor,
                        "category": existing.category,
                        "journal_entry_id": existing.journal_entry_id
                    }

                raise HTTPException(
                    409,
                    "Idempotency key was already used with different expenditure details"
                )

        raise

    except Exception:
        db.rollback()
        raise

    db.refresh(obj)

    return {
        "id": obj.id,
        "project_id": obj.project_id,
        "amount_minor": obj.amount_minor,
        "category": obj.category,
        "journal_entry_id": obj.journal_entry_id
    }



@app.get("/transparency/projects")
def transparency(db: Session = Depends(get_db)):
    result = []

    for p in db.scalars(
        select(Project).where(Project.active.is_(True)).order_by(Project.id)
    ).all():

        allocated = db.scalar(
            select(func.coalesce(func.sum(Allocation.amount_minor), 0)).where(
                Allocation.project_id == p.id
            )
        ) or 0

        spent = db.scalar(
            select(func.coalesce(func.sum(Expenditure.amount_minor), 0)).where(
                Expenditure.project_id == p.id
            )
        ) or 0

        result.append({
            "project_id": p.id,
            "name": p.name,
            "budget_minor": p.budget_minor,
            "allocated_minor": int(allocated),
            "spent_minor": int(spent),
            "remaining_allocation_minor": int(allocated) - int(spent),
            "budget_remaining_minor": p.budget_minor - int(spent)
        })

    return result


@app.get("/audit-logs")
def audit_logs(db: Session = Depends(get_db)):
    rows = db.scalars(
        select(AuditLog).order_by(AuditLog.id.desc()).limit(200)
    ).all()

    return [
        {
            "id": r.id,
            "organization_id": r.organization_id,
            "actor": r.actor,
            "action": r.action,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "details": r.details,
            "created_at": r.created_at.isoformat()
        }
        for r in rows
    ]
