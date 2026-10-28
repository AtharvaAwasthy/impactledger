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


export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);

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

      <h2>Project transparency</h2>

      {loading && <p>Loading projects...</p>}

      {!loading && !error && projects.length === 0 && (
        <p>No projects yet. Create one through the API documentation.</p>
      )}

      <section className="projects">
        {projects.map((project) => (
          <article className="project" key={project.project_id}>
            <h3>{project.name}</h3>
            <p>Budget: {money(project.budget_minor)}</p>
            <p>Allocated: {money(project.allocated_minor)}</p>
            <p>Spent: {money(project.spent_minor)}</p>
            <p>
              Remaining allocation:{" "}
              {money(project.remaining_allocation_minor)}
            </p>
          </article>
        ))}
      </section>

      <section className="audit-section">
        <div className="audit-heading">
          <div>
            <p className="eyebrow">ACCOUNTABILITY</p>
            <h2>Audit Trail</h2>
            <p>A chronological record of actions stored by the system.</p>
          </div>
          <span className="audit-count">
            {auditLogs.length} records loaded
          </span>
        </div>

        {auditLoading && <p>Loading audit records...</p>}

        {auditError && <p className="error">{auditError}</p>}

        {!auditLoading && !auditError && auditLogs.length === 0 && (
          <p>No audit records yet. Actions recorded through the API will appear here.</p>
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
                {auditLogs.map((log) => (
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