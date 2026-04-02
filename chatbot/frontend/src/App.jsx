import { useEffect, useMemo, useState } from "react";
import "./styles.css";

const API_URL = "http://localhost:3001";

function formatDate(dateString) {
  if (!dateString) return "-";

  return new Date(dateString).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getDemandLabel(type) {
  const labels = {
    crediario: "Crediário",
    orcamento: "Orçamento",
    produto: "Produto",
    vendedora: "Vendedora",
  };

  return labels[type] || type;
}

export default function App() {
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [error, setError] = useState("");

  async function loadDemands() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (search.trim()) params.set("search", search.trim());
      if (sortBy) params.set("sortBy", sortBy);
      if (order) params.set("order", order);

      const response = await fetch(`${API_URL}/api/demands?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar demandas");
      }

      setDemands(data);
    } catch (err) {
      setError(err.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDemands();
  }, [sortBy, order]);

  const filteredDemands = useMemo(() => {
    if (!search.trim()) return demands;

    const term = search.toLowerCase();

    return demands.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const phone = String(item.phone || "").toLowerCase();
      const description = String(item.description || "").toLowerCase();

      return (
        name.includes(term) ||
        phone.includes(term) ||
        description.includes(term)
      );
    });
  }, [demands, search]);

  async function handleResolve(demandId) {
    try {
      setRemovingId(demandId);

      const response = await fetch(`${API_URL}/api/demands/${demandId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao remover demanda");
      }

      setDemands((prev) => prev.filter((item) => item.id !== demandId));
    } catch (err) {
      alert(err.message || "Não foi possível remover a demanda");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className = "header-content">
            <div className="header-text">
                <h1>Painel de Demandas</h1>
                <p>Clientes que entraram em contato pelo WhatsApp</p>
            </div>
          <img src="./src/assets/logo.jpg" alt="Logo" className = "header-logo" />
        </div>
      </header>

      <section className="toolbar">
        <input
          type="text"
          placeholder="Buscar por nome, telefone ou descrição"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="created_at">Ordenar por data</option>
          <option value="name">Ordenar por nome</option>
        </select>

        <select value={order} onChange={(e) => setOrder(e.target.value)}>
          <option value="desc">Decrescente</option>
          <option value="asc">Crescente</option>
        </select>

        <button onClick={loadDemands}>Atualizar</button>
      </section>

      {loading && <p className="state">Carregando demandas...</p>}
      {error && <p className="state error">{error}</p>}
      {!loading && !error && filteredDemands.length === 0 && (
        <p className="state">Nenhuma demanda encontrada.</p>
      )}

      <section className="cards">
        {filteredDemands.map((item) => (
          <article key={item.id} className="card">
            <div className="card-top">
              <div>
                <h2>{item.name || "Cliente sem nome"}</h2>
                <p className="phone">{item.phone || "Telefone não disponível"}</p>
              </div>

              <span className="badge">{getDemandLabel(item.type)}</span>
            </div>

            <div className="card-body">
              <p>
                <strong>Demanda:</strong> {item.description || "Sem descrição"}
              </p>
              <p>
                <strong>Recebido em:</strong> {formatDate(item.created_at)}
              </p>
            </div>

            <div className="card-actions">
              <button
                className="resolve-btn"
                onClick={() => handleResolve(item.id)}
                disabled={removingId === item.id}
              >
                {removingId === item.id ? "Resolvendo..." : "Resolvido"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}