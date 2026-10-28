
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

const API = "http://127.0.0.1:8000";

function money(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    void loadProjects();
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
        <button onClick={() => void loadProjects()}>Refresh</button>
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

      <footer>ImpactLedger · Nonprofit fund transparency</footer>
    </main>
  );
}
