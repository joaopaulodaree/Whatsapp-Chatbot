import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import logo from "./assets/logo.jpg";
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
    vendedora: "Vendedora",
    outros: "Outros",
  };

  return labels[type] || type;
}

function DemandsPage() {
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
          <img src={logo} alt="Logo" className="header-logo" />
          <nav className="header-nav-inline">
            <a href="#settings" className="nav-link-solid">Configurações</a>
          </nav>
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

const BOT_MESSAGE_LABELS = {
  greeting: "Saudação inicial",
  menu_options: "Opções do menu",
  menu_label: "Rótulo do menu",
  crediario_nome_request: "Pedido do nome (crediário)",
  crediario_duvida_request: "Pedido da dúvida (crediário)",
  crediario_error: "Erro ao consultar API",
  crediario_continue_question: "Perguntar se tem mais dúvida",
  crediario_new_duvida_request: "Pedido da nova dúvida",
  crediario_cliente_nao_encontrado: "Cliente não encontrado (use {name} como placeholder)",
  vendedora_question: "Pergunta vendedora",
  vendedora_contacts: "Contatos das vendedoras",
  vendedora_wait: "Mensagem de espera (vendedora)",
  pagamento_request: "Pedido de comprovante (pagamento)",
  pagamento_confirm: "Confirmação de recebimento (pagamento)",
  outros_request: "Pergunta de outros assuntos",
  outros_confirm: "Confirmação de recebimento (outros)",
  invalid_option: "Opção inválida",
  yes_or_no: "Pedido sim/não",
  final_prompt: "Mensagem final",
  generic_error: "Erro genérico",
};

function BotMessagesEditor({ onBack }) {
  const [messages, setMessages] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/bot/messages`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data);
        setLoading(false);
      })
      .catch((err) => {
        setMsg(`Erro ao carregar: ${err.message}`);
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`${API_URL}/api/bot/messages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg("Mensagens salvas com sucesso!");
      } else {
        setMsg(`Erro: ${data.error}`);
      }
    } catch (err) {
      setMsg(`Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function handleChange(key, value) {
    setMessages((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) return <p className="state">Carregando mensagens...</p>;

  return (
    <div className="page">
      <header className="header">
        <div className="header-content">
          <div className="header-text">
            <h1>Mensagens do Chatbot</h1>
            <p>Edite as mensagens que o bot envia pelo WhatsApp</p>
          </div>
          <img src={logo} alt="Logo" className="header-logo" />
          <nav className="header-nav-inline">
            <a href="#" className="nav-link-solid" onClick={onBack}>Voltar ao Painel</a>
          </nav>
        </div>
      </header>

      {msg && (
        <p className={`state ${msg.startsWith("Erro") ? "error" : ""}`}>{msg}</p>
      )}

      <section className="settings-section">
        {Object.keys(BOT_MESSAGE_LABELS).map((key) => (
          <div key={key} className="message-field">
            <label>{BOT_MESSAGE_LABELS[key]}</label>
            <textarea
              value={messages[key] || ""}
              onChange={(e) => handleChange(key, e.target.value)}
              rows={key === "vendedora_contacts" ? 8 : 3}
            />
          </div>
        ))}
      </section>

      <div className="save-bar">
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CsvSettingsPage({ onBack }) {
  const [botLoading, setBotLoading] = useState(false);

  // Bot status
  const [botEnabled, setBotEnabled] = useState(false);
  const [botConnected, setBotConnected] = useState(false);
  const [qrCode, setQrCode] = useState(null);

  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState("");
  const [csvLoaded, setCsvLoaded] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadCsvStatus() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/csv/files`);
      const data = await res.json();
      setFiles(data.files || []);
      setCurrentFile(data.current || "");
      setCsvLoaded(data.loaded || false);
      setCsvError(data.error || "");
    } catch (err) {
      setCsvError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadBotStatus() {
    try {
      const [statusRes, qrRes] = await Promise.all([
        fetch(`${API_URL}/api/bot-status`),
        fetch(`${API_URL}/api/bot/qr`),
      ]);
      const statusData = await statusRes.json();
      const qrData = await qrRes.json();

      setBotEnabled(statusData.botEnabled);
      setBotConnected(statusData.botConnected);
      setQrCode(qrData.qr);
    } catch (err) {
      console.error("Erro ao carregar status do bot:", err);
    }
  }

  useEffect(() => {
    loadCsvStatus();
    loadBotStatus();
  }, []);

  const refreshBot = () => { loadBotStatus(); };

  async function handleBotStart() {
    setBotLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/bot/start`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        refreshBot();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBotLoading(false);
      setTimeout(refreshBot, 2000);
    }
  }

  async function handleBotStop() {
    setBotLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/bot/stop`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        refreshBot();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBotLoading(false);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_URL}/api/csv/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.ok) {
        setMsg(`CSV carregado com sucesso — ${data.rowCount} linhas.`);
        setCurrentFile(data.file);
      } else {
        setMsg(`Erro: ${data.error}`);
      }
    } catch (err) {
      setMsg(`Erro ao enviar: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = "";
      loadCsvStatus();
    }
  }

  async function handleReload(filePath) {
    setMsg("");
    try {
      const res = await fetch(`${API_URL}/api/csv/reload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();

      if (data.ok) {
        setMsg(`CSV recarregado — ${data.rowCount} linhas.`);
        setCurrentFile(data.file);
      } else {
        setMsg(`Erro: ${data.error}`);
      }
    } catch (err) {
      setMsg(`Erro ao recarregar: ${err.message}`);
    } finally {
      loadCsvStatus();
    }
  }

  async function handleDelete(filename) {
    if (!confirm(`Remover o arquivo ${filename}?`)) return;

    try {
      const res = await fetch(`${API_URL}/api/csv/files/${filename}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.ok) {
        setMsg("Arquivo removido com sucesso.");
        loadCsvStatus();
      } else {
        setMsg(`Erro: ${data.error}`);
      }
    } catch (err) {
      setMsg(`Erro ao remover: ${err.message}`);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="header-content">
          <div className="header-text">
            <h1>Configurações</h1>
            <p>Gerenciamento de arquivos CSV para consulta</p>
          </div>
          <img src={logo} alt="Logo" className="header-logo" />
          <nav className="header-nav-inline">
            <a href="#messages" className="nav-link-secondary">Mensagens do bot</a>
            <a href="#" className="nav-link-solid" onClick={onBack}>Voltar ao Painel</a>
          </nav>
        </div>
      </header>

      <section className="settings-section">
        <h2>Status do Chatbot</h2>
        <div className="bot-control">
          <div className="bot-info">
            <div className="status-item">
              <span className={`status-dot ${botEnabled ? 'success' : 'error'}`} />
              {botEnabled ? "Bot ativado" : "Bot desativado"}
            </div>
            <div className="status-item">
              <span className={`status-dot ${botConnected ? 'success' : 'error'}`} />
              {botConnected ? "Conectado ao WhatsApp" : "Desconectado"}
            </div>
          </div>
          <div className="bot-actions">
            {botEnabled ? (
              <button className="bot-stop-btn" onClick={handleBotStop} disabled={botLoading}>
                {botLoading ? "Aguarde..." : "Desligar Bot"}
              </button>
            ) : (
              <button className="bot-start-btn" onClick={handleBotStart} disabled={botLoading}>
                {botLoading ? "Iniciando..." : "Ligar Bot"}
              </button>
            )}
          </div>
        </div>
      </section>

      {!botConnected && botEnabled && (qrCode ? (
        <section className="settings-section qr-section">
          <h2>Escaneie o QR Code</h2>
          <p className="settings-desc">
            Abra o WhatsApp, vá em Dispositivos Conectados e escaneie o código abaixo.
          </p>
          <div className="qr-container">
            <QRCodeSVG value={qrCode} size={256} bgColor="#ffffff" fgColor="#000000" />
          </div>
        </section>
      ) : !botConnected && botEnabled && !qrCode ? (
        <section className="settings-section qr-section">
          <h2>Aguardando QR Code</h2>
          <p className="settings-desc">O QR code será exibido em breve. Clique no botão "Atualizar QR".</p>
          <button className="reload-btn" onClick={refreshBot}>Atualizar QR</button>
        </section>
      ) : null)}

      <section className="settings-section">
        <h2>Enviar novo CSV</h2>
        <p className="settings-desc">
          O arquivo será renomeado automaticamente para <code>uploaded.CSV</code> e carregado imediatamente.
        </p>
        <div className="upload-area">
          {uploading ? (
            <p className="state">Enviando e processando...</p>
          ) : (
            <label className="upload-label">
              <input
                type="file"
                accept=".csv,.CSV"
                onChange={handleFileUpload}
                className="upload-input"
                id="csv-upload"
              />
              <span className="upload-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Selecionar arquivo CSV para enviar</span>
              </span>
            </label>
          )}
          <div className="csv-status">
            <span className={`status-dot ${csvLoaded ? 'success' : 'error'}`} />
            {csvLoaded
              ? "CSV carregado na memória"
              : csvError ? `Erro ao carregar: ${csvError}` : "CSV não carregado"}
          </div>
        </div>
      </section>

      {msg && (
        <p className={`state ${msg.startsWith("Erro") ? "error" : ""}`}>{msg}</p>
      )}

      <section className="settings-section">
        <h2>Arquivos CSV disponíveis</h2>
        {loading ? (
          <p className="state">Carregando...</p>
        ) : files.length === 0 ? (
          <p className="state">Nenhum arquivo CSV encontrado.</p>
        ) : (
          <div className="file-list">
            {files.map((f) => (
              <div className={`file-card ${f.path === currentFile ? "file-active" : ""}`} key={f.name}>
                <div className="file-info">
                  <div className="file-name">{f.name}</div>
                  <div className="file-meta">
                    {formatFileSize(f.size)} · {new Date(f.mtime).toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="file-actions">
                  <button
                    className="reload-btn"
                    onClick={() => handleReload(f.path)}
                    disabled={uploading}
                  >
                    {f.path === currentFile ? "Recarregar" : "Carregar"}
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(f.name)}
                    disabled={uploading}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(() => {
    if (window.location.hash === "#settings") return "settings";
    if (window.location.hash === "#messages") return "messages";
    return "demands";
  });

  useEffect(() => {
    function handleHash() {
      if (window.location.hash === "#settings") setPage("settings");
      else if (window.location.hash === "#messages") setPage("messages");
      else setPage("demands");
    }
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  if (page === "messages")
    return <BotMessagesEditor onBack={() => { window.location.hash = "#settings"; }} />;

  if (page === "settings")
    return <CsvSettingsPage onBack={() => { window.location.hash = "#"; }} />;

  return <DemandsPage />;
}
