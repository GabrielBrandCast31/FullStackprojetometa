export default function Topbar({ accountName, userName, onLogout }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">◆</span>
        <h1>Dashboard Meta Ads</h1>
      </div>
      <div className="topbar-right">
        <span className="account-name">{accountName}</span>
        <span className="user-name">{userName}</span>
        <button className="btn-ghost" onClick={onLogout}>Sair</button>
      </div>
    </header>
  );
}
