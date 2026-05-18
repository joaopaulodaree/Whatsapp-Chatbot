import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const API_URL = "http://127.0.0.1:3001";

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const IconUpload = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconFile = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export default function SettingsPage({ botStatus, onBotRefresh }) {
  const { botEnabled, botConnected } = botStatus;

  const [botLoading, setBotLoading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [qrCode, setQrCode] = useState(null);

  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState("");
  const [csvLoaded, setCsvLoaded] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [uploading, setUploading] = useState(false);

  const [toast, setToast] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadCsvStatus() {
    try {
      const res = await fetch(`${API_URL}/api/csv/files`);
      const data = await res.json();
      setFiles(data.files || []);
      setCurrentFile(data.current || "");
      setCsvLoaded(data.loaded || false);
      setCsvError(data.error || "");
    } catch (err) {
      setCsvError(err.message);
    }
  }

  async function loadQr() {
    try {
      const res = await fetch(`${API_URL}/api/bot/qr`);
      const data = await res.json();
      setQrCode(data.qr);
    } catch {}
  }

  useEffect(() => {
    loadCsvStatus();
    loadQr();
  }, []);

  useEffect(() => {
    if (botEnabled && !botConnected) {
      const t = setInterval(loadQr, 5000);
      return () => clearInterval(t);
    }
  }, [botEnabled, botConnected]);

  async function handleBotStart() {
    setBotLoading(true);
    try {
      await fetch(`${API_URL}/api/bot/start`, { method: "POST" });
      setTimeout(onBotRefresh, 1500);
      setTimeout(loadQr, 3000);
    } catch (err) {
      showToast(`Erro: ${err.message}`, "error");
    } finally {
      setBotLoading(false);
    }
  }

  async function handleBotStop() {
    setBotLoading(true);
    try {
      await fetch(`${API_URL}/api/bot/stop`, { method: "POST" });
      onBotRefresh();
      setQrCode(null);
    } catch (err) {
      showToast(`Erro: ${err.message}`, "error");
    } finally {
      setBotLoading(false);
    }
  }

  async function handleClearCache() {
    setClearingCache(true);
    try {
      const res = await fetch(`${API_URL}/api/bot/clear-cache`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        showToast("Cache limpo. Reinicie o bot para reconectar.");
        onBotRefresh();
      } else {
        showToast(`Erro: ${data.error}`, "error");
      }
    } catch (err) {
      showToast(`Erro: ${err.message}`, "error");
    } finally {
      setClearingCache(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API_URL}/api/csv/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.ok) {
        showToast(`CSV carregado — ${data.rowCount} linhas.`);
      } else {
        showToast(`Erro: ${data.error}`, "error");
      }
    } catch (err) {
      showToast(`Erro ao enviar: ${err.message}`, "error");
    } finally {
      setUploading(false);
      e.target.value = "";
      loadCsvStatus();
    }
  }

  async function handleReload(filePath) {
    try {
      const res = await fetch(`${API_URL}/api/csv/reload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`CSV recarregado — ${data.rowCount} linhas.`);
        setCurrentFile(data.file);
      } else {
        showToast(`Erro: ${data.error}`, "error");
      }
    } catch (err) {
      showToast(`Erro: ${err.message}`, "error");
    } finally {
      loadCsvStatus();
    }
  }

  async function handleDelete(filename) {
    if (!confirm(`Remover ${filename}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/csv/files/${filename}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        showToast("Arquivo removido.");
        loadCsvStatus();
      } else {
        showToast(`Erro: ${data.error}`, "error");
      }
    } catch (err) {
      showToast(`Erro: ${err.message}`, "error");
    }
  }

  const showQrSection = botEnabled && !botConnected;

  return (
    <>
      <div className="page-header">
        <h1>Configurações</h1>
        <p>Controle do bot e gerenciamento de dados</p>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="settings-grid">
        {/* Bot panel */}
        <div className="panel">
          <p className="panel-title">Bot WhatsApp</p>

          <div className="status-row">
            <span className={`status-dot ${botEnabled ? "on" : "off"}`} />
            {botEnabled ? "Bot ativado" : "Bot desativado"}
          </div>
          <div className="status-row">
            <span className={`status-dot ${botConnected ? "on" : "off"}`} />
            {botConnected ? "Conectado ao WhatsApp" : "Desconectado"}
          </div>

          <div className="panel-actions">
            {botEnabled ? (
              <button className="btn btn-stop" onClick={handleBotStop} disabled={botLoading}>
                {botLoading ? "Aguarde…" : "Desligar bot"}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleBotStart} disabled={botLoading}>
                {botLoading ? "Iniciando…" : "Ligar bot"}
              </button>
            )}
            <button className="btn btn-ghost" onClick={handleClearCache} disabled={clearingCache}>
              {clearingCache ? "Limpando…" : "Limpar sessão"}
            </button>
          </div>
        </div>

        {/* CSV panel */}
        <div className="panel">
          <p className="panel-title">Dados CSV</p>

          <label className="upload-zone">
            <input type="file" accept=".csv,.CSV" onChange={handleUpload} disabled={uploading} />
            <div className="upload-icon"><IconUpload /></div>
            <div className="upload-label-text">
              {uploading ? "Enviando…" : "Clique para enviar um arquivo CSV"}
            </div>
            <div className="upload-sub">Substituirá o arquivo atual</div>
          </label>

          <div className="csv-status">
            <span className={`status-dot ${csvLoaded ? "on" : "off"}`} />
            {csvLoaded
              ? "Dados carregados na memória"
              : csvError ? `Erro: ${csvError}` : "Nenhum CSV carregado"}
          </div>
        </div>

        {/* QR Code */}
        {showQrSection && (
          <div className="panel panel-full qr-section">
            <p className="panel-title">Conectar WhatsApp</p>
            {qrCode ? (
              <>
                <p className="qr-desc">
                  Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo → escaneie o código abaixo.
                </p>
                <div className="qr-box">
                  <QRCodeSVG value={qrCode} size={220} bgColor="#ffffff" fgColor="#000000" />
                </div>
              </>
            ) : (
              <>
                <p className="qr-desc">O QR code aparecerá aqui em alguns segundos após ligar o bot.</p>
                <button className="btn btn-ghost" onClick={loadQr}>Atualizar QR</button>
              </>
            )}
          </div>
        )}

        {/* File list */}
        {files.length > 0 && (
          <div className="panel panel-full">
            <p className="panel-title">Arquivos disponíveis</p>
            <div className="file-list">
              {files.map(f => (
                <div key={f.name} className={`file-row${f.path === currentFile ? " active" : ""}`}>
                  <span style={{ color: "var(--text-light)" }}><IconFile /></span>
                  <div className="file-info">
                    <div className="file-name">{f.name}</div>
                    <div className="file-meta">{formatFileSize(f.size)} · {new Date(f.mtime).toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="file-actions">
                    <button
                      className="btn btn-ghost"
                      style={{ height: 32, padding: "0 12px", fontSize: 13 }}
                      onClick={() => handleReload(f.path)}
                      disabled={uploading}
                    >
                      {f.path === currentFile ? "Recarregar" : "Usar este"}
                    </button>
                    <button
                      className="btn btn-danger-ghost"
                      style={{ height: 32, padding: "0 12px", fontSize: 13 }}
                      onClick={() => handleDelete(f.name)}
                      disabled={uploading}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
