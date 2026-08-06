import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Header } from "./components/Header";
import { NavFilterBar, type ViewKind } from "./components/NavFilterBar";
import { KanbanBoard } from "./components/KanbanBoard";
import { Relatorios } from "./components/Relatorios";
import { Auditoria } from "./components/Auditoria";
import { NewTaskModal } from "./components/NewTaskModal";
import { EmpresasModal } from "./components/EmpresasModal";
import { UsersModal } from "./components/UsersModal";
import { LoginScreen } from "./components/LoginScreen";
import { ToastStack } from "./components/ToastStack";
import { useAuthStore } from "./store/useAuthStore";
import { useAppStore } from "./store/useAppStore";
import { useToastStore } from "./store/useToastStore";
import { connectSocket, disconnectSocket } from "./lib/socket";

function App() {
  const user = useAuthStore((s) => s.user);
  const checking = useAuthStore((s) => s.checking);
  const checkSession = useAuthStore((s) => s.checkSession);
  const hydrate = useAppStore((s) => s.hydrate);
  const loaded = useAppStore((s) => s.loaded);
  const operadores = useAppStore((s) => s.operadores);
  const refreshTasks = useAppStore((s) => s.refreshTasks);
  const refreshNotifications = useAppStore((s) => s.refreshNotifications);
  const pushToast = useToastStore((s) => s.push);

  const [showNewTask, setShowNewTask] = useState(false);
  const [showEmpresas, setShowEmpresas] = useState(false);
  const [showUsuarios, setShowUsuarios] = useState(false);

  const [view, setView] = useState<ViewKind>("kanban");
  const [search, setSearch] = useState("");
  const [filterResp, setFilterResp] = useState("");
  const [filterPrio, setFilterPrio] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filters = useMemo(
    () => ({ search, filterResp, filterPrio, filterTipo, dateFrom, dateTo }),
    [search, filterResp, filterPrio, filterTipo, dateFrom, dateTo],
  );
  const respOptions = useMemo(() => operadores.map((op) => op.nome), [operadores]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (user && !loaded) {
      hydrate();
    }
  }, [user, loaded, hydrate]);

  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }

    connectSocket((notification) => {
      pushToast(notification.message);
      refreshTasks();
      refreshNotifications();
    });

    return () => disconnectSocket();
  }, [user, pushToast, refreshTasks, refreshNotifications]);

  if (checking) {
    return <div className="min-h-screen bg-[color:var(--color-bg)]" />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[color:var(--color-bg)] font-body text-[color:var(--color-text)]">
      <Header onNewTask={() => setShowNewTask(true)} />
      <NavFilterBar
        view={view}
        onSetView={setView}
        onEmpresas={() => setShowEmpresas(true)}
        onUsuarios={() => setShowUsuarios(true)}
        isGestor={user.isGestor}
        search={search}
        onSearchChange={setSearch}
        filterResp={filterResp}
        onFilterRespChange={setFilterResp}
        filterPrio={filterPrio}
        onFilterPrioChange={setFilterPrio}
        filterTipo={filterTipo}
        onFilterTipoChange={setFilterTipo}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        respOptions={respOptions}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!loaded && <p className="p-6 text-sm opacity-60">Carregando...</p>}
        {loaded && view === "kanban" && (
          <div className="flex-1 overflow-x-auto overflow-y-auto px-4 py-4">
            <KanbanBoard filters={filters} />
          </div>
        )}
        {loaded && view === "relatorios" && <Relatorios />}
        {loaded && view === "auditoria" && user.isGestor && <Auditoria />}
      </div>

      <AnimatePresence>
        {showNewTask && <NewTaskModal onClose={() => setShowNewTask(false)} />}
        {showEmpresas && <EmpresasModal onClose={() => setShowEmpresas(false)} />}
        {showUsuarios && <UsersModal onClose={() => setShowUsuarios(false)} />}
      </AnimatePresence>
      <ToastStack />
    </div>
  );
}

export default App;
