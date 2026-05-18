import { useEffect, useRef, useState } from "react";

const API_URL = "http://127.0.0.1:3001";

const GROUPS = [
  {
    id: "geral",
    label: "Geral",
    keys: ["greeting", "menu_options", "menu_label", "invalid_option", "yes_or_no", "final_prompt", "generic_error"],
  },
  {
    id: "crediario",
    label: "Crediário",
    keys: [
      "crediario_nome_request",
      "crediario_duvida_request",
      "crediario_error",
      "crediario_continue_question",
      "crediario_new_duvida_request",
      "crediario_cliente_nao_encontrado",
    ],
  },
  {
    id: "pagamento",
    label: "Pagamento",
    keys: ["pagamento_request", "pagamento_nome_confirm", "pagamento_imagem_confirm", "pagamento_final"],
  },
  {
    id: "vendedora",
    label: "Vendedora",
    keys: ["vendedora_question", "vendedora_contacts", "vendedora_wait"],
  },
  {
    id: "outros",
    label: "Outros",
    keys: ["outros_request", "outros_confirm"],
  },
];

export default function MessagesPage() {
  const [messages, setMessages] = useState({});
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeGroup, setActiveGroup] = useState("geral");
  const groupRefs = useRef({});

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    fetch(`${API_URL}/api/bot/messages`)
      .then(r => r.json())
      .then(data => {
        setLabels(data._labels || {});
        setMessages(data);
        setLoading(false);
      })
      .catch(err => {
        showToast(`Erro ao carregar: ${err.message}`, "error");
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/bot/messages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Mensagens salvas com sucesso.");
      } else {
        showToast(`Erro: ${data.error}`, "error");
      }
    } catch (err) {
      showToast(`Erro ao salvar: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  function scrollToGroup(id) {
    setActiveGroup(id);
    groupRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading) return <p className="loading-state">Carregando mensagens…</p>;

  return (
    <>
      <div className="page-header">
        <h1>Mensagens do Bot</h1>
        <p>Edite o que o bot envia em cada etapa da conversa</p>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="messages-layout">
        {/* Section nav */}
        <nav className="msg-nav">
          {GROUPS.map(g => (
            <button
              key={g.id}
              className={`msg-nav-item${activeGroup === g.id ? " active" : ""}`}
              onClick={() => scrollToGroup(g.id)}
            >
              {g.label}
            </button>
          ))}
        </nav>

        {/* Fields grouped */}
        <div className="msg-groups">
          {GROUPS.map(group => (
            <section
              key={group.id}
              ref={el => { groupRefs.current[group.id] = el; }}
            >
              <p className="msg-group-title">{group.label}</p>
              {group.keys.map(key => (
                <div key={key} className="msg-field">
                  <label htmlFor={key}>{labels[key] || key}</label>
                  <textarea
                    id={key}
                    value={messages[key] || ""}
                    onChange={e => setMessages(prev => ({ ...prev, [key]: e.target.value }))}
                    rows={key === "vendedora_contacts" ? 8 : 3}
                  />
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>

      <div className="save-bar">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
        {toast?.type === "success" && <span style={{ fontSize: 13, color: "var(--green-dark)" }}>{toast.msg}</span>}
      </div>
    </>
  );
}
