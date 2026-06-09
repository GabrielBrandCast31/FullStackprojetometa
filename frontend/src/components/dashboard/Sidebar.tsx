import { LayoutDashboard, Megaphone, Bell, BarChart3, LogOut, UserCircle2 } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";

const nav = [
  { label: "Visão Geral", icon: LayoutDashboard, to: "/" },
  { label: "Dashboard Cliente", icon: UserCircle2, to: "/dashboard" },
  { label: "Campanhas", icon: Megaphone, to: "/campaigns" },
  { label: "Alertas", icon: Bell, to: "/alerts" },
  { label: "Gráficos", icon: BarChart3, to: "/charts" },
] as const;

type Props = { onLogout?: () => void; userName?: string };

export function Sidebar({ onLogout, userName }: Props) {
  const { pathname } = useLocation();
  const isActive = (to: string) => to === "/" ? pathname === "/" : pathname.startsWith(to);

  return (
    <aside className="fixed left-0 top-0 hidden h-full w-64 flex-col border-r border-border bg-sidebar/50 lg:flex">
      <div className="flex items-center gap-3 p-6">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
          B
        </div>
        <span className="text-xl font-bold tracking-tight">BRANDCAST</span>
      </div>

      <nav className="flex-1 space-y-1 px-4">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Painel
        </div>
        {nav.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive(item.to)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            }`}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        {userName && (
          <div className="mb-3 px-3 text-xs">
            <p className="text-muted-foreground">Logado como</p>
            <p className="mt-0.5 truncate font-medium text-foreground">{userName}</p>
          </div>
        )}
        {onLogout && (
          <button onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
            <LogOut className="size-4" /> Sair
          </button>
        )}
      </div>
    </aside>
  );
}
