import { Link } from "@tanstack/react-router";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, KanbanSquare, Building2, LogOut } from "lucide-react";

const NAV = [
  { to: "/app", label: "Painel", icon: LayoutDashboard },
  { to: "/app/kanban", label: "Kanban", icon: KanbanSquare },
  { to: "/app/unidades", label: "Unidades", icon: Building2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, roles, signOut } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b flex items-center justify-between px-4 h-14 shrink-0">
        <div className="font-semibold text-sm">BSB Stay & Help Estadias</div>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md hover:bg-accent text-muted-foreground [&.active]:bg-accent [&.active]:text-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground text-right">
            <div>{user?.email}</div>
            <div>{roles.map((r) => ROLE_LABELS[r]).join(", ")}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
