import BrandLogo from "./BrandLogo.jsx";

export default function Topbar({ accountName, userName, onLogout }) {
  return (
    <header className="topbar">
      <div className="brand">
        <BrandLogo height={45} />
      </div>
      <div className="topbar-right">
        <span className="account-name">{accountName}</span>
        <span className="user-name">{userName}</span>
        <button className="btn-ghost" onClick={onLogout}>Sair</button>
      </div>
    </header>
  );
}
