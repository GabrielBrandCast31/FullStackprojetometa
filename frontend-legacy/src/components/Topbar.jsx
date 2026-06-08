import { useState } from "react";

export default function Topbar({ accountName, userName, onLogout, onSearch }) {
  const [query, setQuery] = useState("");

  function submit(e) {
    e.preventDefault();
    if (onSearch) onSearch(query.trim());
  }

  // Iniciais do nome do usuário pro avatar.
  const initials = (userName || "")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0].toUpperCase()).join("") || "·";

  return (
    <header className="topbar">
      <form className="topbar-search" onSubmit={submit}>
        <span className="topbar-search-icon">⌕</span>
        <input
          type="search"
          placeholder="Buscar campanha..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      <div className="topbar-right">
        {accountName && <span className="account-name">{accountName}</span>}
        <button className="topbar-icon-btn" title="Notificações" type="button">🔔</button>
        <div className="topbar-profile" title={userName}>
          <span className="topbar-avatar">{initials}</span>
          <span className="topbar-user-label">{userName}</span>
        </div>
        <button className="btn-ghost" onClick={onLogout}>Sair</button>
      </div>
    </header>
  );
}
