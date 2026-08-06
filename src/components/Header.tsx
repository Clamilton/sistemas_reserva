import { LayoutGrid, LogOut, Plus } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { useAuthStore } from "../store/useAuthStore";
import { initials } from "../lib/initials";

interface Props {
  onNewTask: () => void;
}

export function Header({ onNewTask }: Props) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <header
      className="flex flex-none items-center gap-2.5 px-4 py-3"
      style={{ background: "var(--color-header-bg)", color: "var(--color-header-text)" }}
    >
      <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-accent">
        <LayoutGrid size={17} style={{ stroke: "var(--color-header-text)" }} strokeWidth={2.75} />
      </div>
      <div className="flex-none font-heading text-base">Demandas</div>
      <div className="flex-1" />

      <NotificationBell />

      <button
        onClick={onNewTask}
        className="btn btn-primary flex-none"
      >
        <Plus size={15} strokeWidth={2.75} />
        Nova demanda
      </button>

      <div className="mx-0.5 h-[22px] w-px flex-none bg-accent-2-400" />

      <div className="flex flex-none items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-[color:var(--color-header-text)]">
          {user ? initials(user.nome) : ""}
        </div>
        <button
          onClick={() => logout()}
          title="Sair"
          className="opacity-75 hover:opacity-100"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
