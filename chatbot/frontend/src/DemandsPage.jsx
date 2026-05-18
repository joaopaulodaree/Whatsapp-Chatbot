import { useEffect, useMemo, useState } from "react";

const API_URL = "http://127.0.0.1:3001";

const TYPE_LABEL = { crediario: "Crediário", vendedora: "Vendedora", outros: "Outros" };

function formatDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

export default function DemandsPage() {
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [error, setError] = useState("");

  async function loadDemands() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (sortBy) params.set("sortBy", sortBy);
      if (order) params.set("order", order);
      const res = await fetch(`${API_URL}/api/demands?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar atendimentos");
      setDemands(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDemands(); }, [sortBy, order]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return demands;
    return demands.filter(d =>
      [d.name, d.phone, d.description].some(v => String(v || "").toLowerCase().includes(term))
    );
  }, [demands, search]);

  async function handleResolve(id) {
    setRemovingId(id);
    try {
      const res = await fetch(`${API_URL}/api/demands/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error); }
      setDemands(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      alert(err.message || "Não foi possível resolver o atendimento");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Atendimentos</h1>
        <p>Clientes que entraram em contato pelo WhatsApp</p>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <span className="search-icon"><IconSearch /></span>
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou descrição…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="created_at">Data</option>
          <option value="name">Nome</option>
        </select>

        <select value={order} onChange={e => setOrder(e.target.value)}>
          <option value="desc">Mais recente</option>
          <option value="asc">Mais antigo</option>
        </select>

        <button className="btn-sm-outline" onClick={loadDemands}>
          <IconRefresh /> Atualizar
        </button>

        {!loading && (
          <span className="result-count">{filtered.length} atendimento{filtered.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {error && <div className="toast error">{error}</div>}
      {loading && <p className="loading-state">Carregando…</p>}

      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state">
          <p>{search ? "Nenhum atendimento encontrado para essa busca." : "Nenhum atendimento registrado ainda."}</p>
        </div>
      )}

      <div className="demand-list">
        {filtered.map(item => {
          const type = item.type || "outros";
          return (
            <article key={item.id} className="demand-card">
              <div className={`demand-stripe ${type}`} />

              <div className="demand-body">
                <div className="demand-top">
                  <span className="demand-name">{item.name || "Cliente sem nome"}</span>
                  <span className="demand-phone">{item.phone || ""}</span>
                  <span className={`type-badge ${type}`}>{TYPE_LABEL[type] || type}</span>
                </div>
                <div className="demand-desc">
                  {item.description || "Sem descrição"}
                </div>
              </div>

              <div className="demand-actions">
                <span className="demand-date">{formatDate(item.created_at)}</span>
                <button
                  className="btn-resolve"
                  onClick={() => handleResolve(item.id)}
                  disabled={removingId === item.id}
                >
                  {removingId === item.id ? "…" : "Resolvido"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
