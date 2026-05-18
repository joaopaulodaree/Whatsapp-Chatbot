import { useCallback, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import DemandsPage from "./DemandsPage";
import SettingsPage from "./SettingsPage";
import MessagesPage from "./MessagesPage";
import "./styles.css";

const API_URL = "http://127.0.0.1:3001";

export default function App() {
  const [page, setPage] = useState("demands");
  const [botStatus, setBotStatus] = useState({ botEnabled: false, botConnected: false });

  const refreshBotStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/bot-status`);
      setBotStatus(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    refreshBotStatus();
    const t = setInterval(refreshBotStatus, 12000);
    return () => clearInterval(t);
  }, [refreshBotStatus]);

  return (
    <div className="app-layout">
      <Sidebar page={page} onNavigate={setPage} botConnected={botStatus.botConnected} />
      <main className="main-content">
        {page === "demands"  && <DemandsPage />}
        {page === "settings" && <SettingsPage botStatus={botStatus} onBotRefresh={refreshBotStatus} />}
        {page === "messages" && <MessagesPage />}
      </main>
    </div>
  );
}
