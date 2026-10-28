import { useEffect, useState } from "react";
import "./styles.css";

type Project = {
  project_id: number;
  name: string;
  budget_minor: number;
  allocated_minor: number;
  spent_minor: number;
  remaining_allocation_minor: number;
};

type AuditLog = {
  id: number;
  organization_id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: number;
  details: string | null;
  created_at: string;
};

const API = "http://127.0.0.1:8000";

function money(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function budgetUtilization(spent: number, budget: number) {
  if (budget <= 0) return 0;
  return (spent / budget) * 100;
}

function budgetStatus(spent: number, budget: number) {
  if (budget <= 0) return "No budget";
  const percentage = budgetUtilization(spent, budget);

  if (percentage >= 100) return "Budget exhausted";
  if (percentage >= 80) return "Near budget limit";
  return "On track";
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}


function readableAction(action: string) {
  return action.replace(/[._-]/g, " ");
}


function readableDetails(details: string | null) {
  if (!details) return "—";

  try {
    const parsed: unknown = JSON.parse(details);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return details;
    }

    return Object.entries(parsed as Record<string, unknown>)
      .map(([key, value]) => {
        const label = key
          .replace(/[_-]/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());

        const isAmount =
          key.endsWith("_minor") && typeof value === "number";

        const formattedValue = isAmount
          ? money(value)
          : value !== null && typeof value === "object"
            ? JSON.stringify(value)
            : String(value);

        return `${label}: ${formattedValue}`;
      })
      .join(" · ");
  } catch {
    return details;
  }
}

function getSpendingByCategory(logs: AuditLog[]) {
  const totals: Record<string, number> = {};

  for (const log of logs) {
    if (log.action !== "expenditure.recorded") continue;

    try {
      const details = JSON.parse(log.details || "{}") as {
        category?: string;
        amount_minor?: number;
      };

      const category = details.category || "Uncategorized";
      const amount = details.amount_minor;

      if (typeof amount === "number" && amount > 0) {
        totals[category] = (totals[category] || 0) + amount;
      }
    } catch {
      // Ignore malformed audit details.
    }
  }

  return Object.entries(totals).map(([category, amount]) => ({
    category,
    amount,
  }));
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectBudget, setProjectBudget] = useState("");
  const [projectMessage, setProjectMessage] = useState("");
  const [projectSubmitting, setProjectSubmitting] = useState(false);
  const [selectedAction, setSelectedAction] = useState("all");
  const [error, setError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseProjectId, setExpenseProjectId] = useState("1");
  const [expenseAccountId, setExpenseAccountId] = useState("4");
  const [cashAccountId, setCashAccountId] = useState("1");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseMessage, setExpenseMessage] = useState("");
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);
  

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setProjectMessage("");

  const budget = Number(projectBudget);

  if (!projectName.trim()) {
    setProjectMessage("Please enter a project name.");
    return;
  }

  if (!Number.isFinite(budget) || budget <= 0) {
    setProjectMessage("Enter a valid budget greater than zero.");
    return;
  }

  setProjectSubmitting(true);

  try {
    const response = await fetch(`${API}/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organization_id: 1,
        name: projectName.trim(),
        description: projectDescription.trim(),
        budget_minor: Math.round(budget * 100),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        body?.detail
          ? JSON.stringify(body.detail)
          : "Could not create project."
      );
    }

    setProjectName("");
    setProjectDescription("");
    setProjectBudget("");
    setProjectMessage("Project created successfully.");
    setShowProjectForm(false);

    await refreshDashboard();
  } catch (err) {
    setProjectMessage(
      err instanceof Error ? err.message : "Something went wrong."
    );
  } finally {
    setProjectSubmitting(false);
  }
}

  async function recordExpenditure(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setExpenseMessage("");

    const amount = Number(expenseAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setExpenseMessage("Enter an amount greater than zero.");
      return;
    }

    if (!expenseCategory.trim()) {
      setExpenseMessage("Enter an expenditure category.");
      return;
    }

    setExpenseSubmitting(true);

    try {
      const response = await fetch(`${API}/expenditures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: 1,
          project_id: Number(expenseProjectId),
          expense_account_id: Number(expenseAccountId),
          cash_account_id: Number(cashAccountId),
          amount_minor: Math.round(amount * 100),
          category: expenseCategory.trim(),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.detail
            ? JSON.stringify(body.detail)
            : "Could not record expenditure."
        );
      }

      setExpenseAmount("");
      setExpenseCategory("");
      setExpenseMessage("Expenditure recorded successfully.");

      await refreshDashboard();
    } catch (err) {
      setExpenseMessage(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setExpenseSubmitting(false);
    }
  }


function exportAuditLogs() {
  const headers = [
    "ID",
    "Action",
    "Actor",
    "Entity Type",
    "Entity ID",
    "Details",
    "Timestamp",
  ];

  const escapeCsv = (value: unknown) => {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  };

  const rows = auditLogs.map((log) => [
    log.id,
    log.action,
    log.actor,
    log.entity_type,
    log.entity_id,
    readableDetails(log.details),
    log.created_at,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\r\n");

  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "impactledger-audit-trail.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}


  async function loadProjects() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/transparency/projects`);

      if (!response.ok) {
        throw new Error("Could not load projects");
      }

      const data: Project[] = await response.json();
      setProjects(data);
    } catch {
      setError("Cannot connect to FastAPI. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAuditLogs() {
    setAuditLoading(true);
    setAuditError("");

    try {
      const response = await fetch(`${API}/audit-logs`);

      if (!response.ok) {
        throw new Error("Could not load audit logs");
      }

      const data: AuditLog[] = await response.json();
      setAuditLogs(data);
    } catch {
      setAuditError(
        "Could not load the audit trail. Check the backend and API configuration."
      );
    } finally {
      setAuditLoading(false);
    }
  }

  async function refreshDashboard() {
    await Promise.all([loadProjects(), loadAuditLogs()]);
  }

  useEffect(() => {
    void refreshDashboard();
  }, []);

  const totals = {
    budget: projects.reduce((sum, p) => sum + p.budget_minor, 0),
    allocated: projects.reduce((sum, p) => sum + p.allocated_minor, 0),
    spent: projects.reduce((sum, p) => sum + p.spent_minor, 0),
    remaining: projects.reduce(
      (sum, p) => sum + p.remaining_allocation_minor,
      0
    ),
  };

  const spendingByCategory = getSpendingByCategory(auditLogs);

    const totalCategorySpending = spendingByCategory.reduce(
      (sum, item) => sum + item.amount,
      0
  );


const actionTypes = Array.from(
  new Set(auditLogs.map((log) => log.action))
).sort();

const filteredAuditLogs =
  selectedAction === "all"
    ? auditLogs
    : auditLogs.filter((log) => log.action === selectedAction);


  return (
    <main className="dashboard">
      <header>
        <div>
          <p className="eyebrow">NONPROFIT FINANCE</p>
          <h1>ImpactLedger</h1>
          <p>Transparent funds. Accountable impact.</p>
        </div>

        <button onClick={() => void refreshDashboard()}>
          Refresh dashboard
        </button>
      </header>

      <section className="banner">
        <h2>Every rupee should be accountable.</h2>
        <p>Financial transparency, backed by recorded transactions.</p>
      </section>

      {error && <p className="error">{error}</p>}

      <h2>Financial overview</h2>

      <section className="stats">
        <article>
          <p>Project budgets</p>
          <strong>{money(totals.budget)}</strong>
        </article>
        <article>
          <p>Funds allocated</p>
          <strong>{money(totals.allocated)}</strong>
        </article>
        <article>
          <p>Funds spent</p>
          <strong>{money(totals.spent)}</strong>
        </article>
        <article>
          <p>Allocation remaining</p>
          <strong>{money(totals.remaining)}</strong>
        </article>
      </section>

      <section className="spending-section">
        <h2>Spending by Category</h2>
        <p>Recorded expenditure grouped by category.</p>

        {spendingByCategory.length === 0 ? (
          <p>No expenditure records available yet.</p>
        ) : (
          <div className="spending-list">
            {spendingByCategory.map((item) => {
              const percentage =
                totalCategorySpending > 0
                  ? (item.amount / totalCategorySpending) * 100
                  : 0;

              return (
                <article className="spending-item" key={item.category}>
                  <div className="spending-label">
                    <strong>{item.category}</strong>
                    <span>{money(item.amount)}</span>
                  </div>

                  <div className="spending-track">
                    <div
                      className="spending-fill"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  <small>{percentage.toFixed(1)}% of recorded spending</small>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="section-heading">
  <h2>Project transparency</h2>

  <button
    type="button"
    onClick={() => {
      setProjectMessage("");
      setShowProjectForm((current) => !current);
    }}
  >
    {showProjectForm ? "Cancel" : "+ Create Project"}
  </button>
</div>

{projectMessage && (
  <p role="status" className="project-message">
    {projectMessage}
  </p>
)}

{showProjectForm && (
  <form className="project-form" onSubmit={createProject}>
    <h3>Create a new project</h3>

    <label htmlFor="project-name">Project name</label>
    <input
      id="project-name"
      value={projectName}
      onChange={(event) => setProjectName(event.target.value)}
      placeholder="e.g. Rural Education Initiative"
      maxLength={160}
      required
    />

    <label htmlFor="project-description">Description</label>
    <textarea
      id="project-description"
      value={projectDescription}
      onChange={(event) => setProjectDescription(event.target.value)}
      placeholder="What will this project achieve?"
    />

      <label htmlFor="project-budget">Budget (₹)</label>
      <input
        id="project-budget"
        type="number"
        min="0.01"
        step="0.01"
        value={projectBudget}
        onChange={(event) => setProjectBudget(event.target.value)}
        placeholder="50000"
        required
      />

      <button type="submit" disabled={projectSubmitting}>
        {projectSubmitting ? "Creating..." : "Create Project"}
      </button>
    </form>
    )}

      {loading && <p>Loading projects...</p>}

      {!loading && !error && projects.length === 0 && (
        <p>No projects yet. Create one through the API documentation.</p>
      )}

    <div className="section-heading">
      <h2>Record spending</h2>
      <button
        type="button"
        onClick={() => {
          setExpenseMessage("");
          setShowExpenseForm((current) => !current);
        }}
      >
        {showExpenseForm ? "Cancel" : "+ Record Expenditure"}
      </button>
    </div>

    {expenseMessage && (
      <p role="status" className="project-message">
        {expenseMessage}
      </p>
    )}

    {showExpenseForm && (
      <form className="project-form" onSubmit={recordExpenditure}>
        <h3>Record a new expenditure</h3>

        <label htmlFor="expense-project">Project</label>
        <select
          id="expense-project"
          value={expenseProjectId}
          onChange={(event) => setExpenseProjectId(event.target.value)}
          required
        >
          {projects.map((project) => (
            <option key={project.project_id} value={project.project_id}>
              {project.name}
            </option>
          ))}
        </select>

        <label htmlFor="expense-amount">Amount (₹)</label>
        <input
          id="expense-amount"
          type="number"
          min="0.01"
          step="0.01"
          value={expenseAmount}
          onChange={(event) => setExpenseAmount(event.target.value)}
          placeholder="500"
          required
        />

        <label htmlFor="expense-category">Category</label>
        <input
          id="expense-category"
          value={expenseCategory}
          onChange={(event) => setExpenseCategory(event.target.value)}
          placeholder="Project Supplies"
          required
        />

        <label htmlFor="expense-account">Expense account ID</label>
        <input
          id="expense-account"
          type="number"
          min="1"
          value={expenseAccountId}
          onChange={(event) => setExpenseAccountId(event.target.value)}
          required
        />

        <label htmlFor="cash-account">Cash account ID</label>
        <input
          id="cash-account"
          type="number"
          min="1"
          value={cashAccountId}
          onChange={(event) => setCashAccountId(event.target.value)}
          required
        />

        <button type="submit" disabled={expenseSubmitting}>
          {expenseSubmitting ? "Recording..." : "Record Expenditure"}
        </button>
      </form>
    )}
      <section className="projects">
        {projects.map((project) => {
          const utilization = budgetUtilization(
            project.spent_minor,
            project.budget_minor
          );

          const progressWidth = Math.min(100, Math.max(0, utilization));
          const status = budgetStatus(
            project.spent_minor,
            project.budget_minor
          );

          const statusClass =
            status === "Budget exhausted"
              ? "budget-status exhausted"
              : status === "Near budget limit"
                ? "budget-status warning"
                : "budget-status healthy";

          return (
            <article className="project" key={project.project_id}>
              <div className="project-heading">
                <h3>{project.name}</h3>
                <span className={statusClass}>{status}</span>
              </div>

              <p>Budget: {money(project.budget_minor)}</p>
              <p>Allocated: {money(project.allocated_minor)}</p>
              <p>Spent: {money(project.spent_minor)}</p>
              <p>
                Remaining allocation:{" "}
                {money(project.remaining_allocation_minor)}
              </p>

              <div className="budget-progress-heading">
                <span>Budget utilization</span>
                <strong>
                  {project.budget_minor > 0
                    ? `${utilization.toFixed(1)}%`
                    : "N/A"}
                </strong>
              </div>

              <div
                className="budget-progress-track"
                role="progressbar"
                aria-label={`${project.name} budget utilization`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressWidth}
              >
                <div
                  className={`budget-progress-fill ${
                    utilization >= 100
                      ? "exhausted"
                      : utilization >= 80
                        ? "warning"
                        : ""
                  }`}
                  style={{ width: `${progressWidth}%` }}
                />
              </div>

              {utilization > 100 && (
                <p className="budget-overrun">
                  Spending exceeds the project budget by{" "}
                  {money(project.spent_minor - project.budget_minor)}.
                </p>
              )}

              <button
  type="button"
  className="details-button"
  onClick={() =>
    setExpandedProjectId((current) =>
      current === project.project_id ? null : project.project_id
    )
  }
>
  {expandedProjectId === project.project_id
    ? "Hide details"
    : "View project details"}
</button>

{expandedProjectId === project.project_id && (
  <div className="project-details">
    <h4>Financial details</h4>

    <p>
      Budget utilization:{" "}
      {project.budget_minor > 0
        ? ((project.spent_minor / project.budget_minor) * 100).toFixed(2)
        : "0.00"}
      %
    </p>

    <p>
      Unallocated budget:{" "}
      {money(project.budget_minor - project.allocated_minor)}
    </p>

    <p>
      Unspent allocation:{" "}
      {money(project.allocated_minor - project.spent_minor)}
    </p>

    <p>Project ID: {project.project_id}</p>
  </div>
)}
            </article>
            
          );
        })}
      </section>


      <section className="audit-section">
        <div className="audit-heading">
          <div>
            <p className="eyebrow">ACCOUNTABILITY</p>
            <h2>Audit Trail</h2>
            <p>A chronological record of actions stored by the system.</p>
          </div>
          
          <div className="audit-controls">
            <label htmlFor="audit-action-filter">Filter by action</label>
            <select
              id="audit-action-filter"
              value={selectedAction}
              onChange={(event) => setSelectedAction(event.target.value)}
            >
              <option value="all">All actions</option>
              {actionTypes.map((action) => (
                <option key={action} value={action}>
                  {readableAction(action)}
                </option>
              ))}
            </select>

            <div className="audit-actions">
  <span className="audit-count">
    {auditLogs.length} records
  </span>

  <button
    type="button"
    onClick={exportAuditLogs}
    disabled={auditLogs.length === 0}
  >
    Export CSV
  </button>
</div>
          </div>

        </div>

        {auditLoading && <p>Loading audit records...</p>}

        {auditError && <p className="error">{auditError}</p>}

        {!auditLoading && !auditError && filteredAuditLogs.length === 0 && (
        <p>
          {auditLogs.length === 0
            ? "No audit records yet. Actions recorded through the API will appear here."
            : "No records match this action filter."}
        </p>
        )}

        {!auditLoading && auditLogs.length > 0 && (
          <div className="audit-table-wrapper">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Record</th>
                  <th>Details</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className="audit-action">
                        {readableAction(log.action)}
                      </span>
                    </td>
                    <td>{log.actor || "System"}</td>
                    <td>
                      <strong>{log.entity_type}</strong>
                      <span className="audit-entity-id">
                        ID: {log.entity_id}
                      </span>
                    </td>
                    <td className="audit-details">
                      {readableDetails(log.details)}
                    </td>
                    <td className="audit-timestamp">
                      {formatDate(log.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer>ImpactLedger · Nonprofit fund transparency</footer>
    </main>
  );
}