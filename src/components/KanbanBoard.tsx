import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useAuthStore } from "../store/useAuthStore";
import { useToastStore } from "../store/useToastStore";
import type { Task } from "../types";
import { Column } from "./Column";
import { TaskCardContent } from "./TaskCard";
import { TaskDetailsModal } from "./TaskDetailsModal";
import { FinalizeModal } from "./FinalizeModal";
import { PauseReasonModal } from "./PauseReasonModal";
import { findMostUrgentPending, PRIORITY_LABEL } from "../lib/priority";
import { formatDateTime } from "../lib/time";
import { canMoveTask } from "../lib/permissions";

interface FinalizeState {
  taskId: string;
  previousColumnId: string;
}

interface PendingMove {
  taskId: string;
  destColumnId: string;
  destIndex: number;
  empresaNome: string;
}

interface Filters {
  search: string;
  filterResp: string;
  filterPrio: string;
  filterTipo: string;
  dateFrom: string;
  dateTo: string;
}

interface Props {
  filters: Filters;
}

const dropAnimation: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

export function KanbanBoard({ filters }: Props) {
  const columns = useAppStore((s) => s.columns);
  const tasks = useAppStore((s) => s.tasks);
  const moveTask = useAppStore((s) => s.moveTask);
  const currentUser = useAuthStore((s) => s.user);
  const pushToast = useToastStore((s) => s.push);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [finalizeState, setFinalizeState] = useState<FinalizeState | null>(null);
  const [pendingPause, setPendingPause] = useState<PendingMove | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const filteredTasks = useMemo(() => {
    const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
    const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`) : null;

    return tasks.filter((t) => {
      const createdAt = new Date(t.createdAt);
      return (
        (!filters.search || t.empresa.toLowerCase().includes(filters.search.toLowerCase())) &&
        (!filters.filterResp || t.operadorNome === filters.filterResp) &&
        (!filters.filterPrio || t.prioridade === filters.filterPrio) &&
        (!filters.filterTipo || t.tipo === filters.filterTipo) &&
        (!from || createdAt >= from) &&
        (!to || createdAt <= to)
      );
    });
  }, [tasks, filters]);

  const tasksByColumn = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const column of columns) {
      map[column.id] = filteredTasks
        .filter((t) => t.columnId === column.id)
        .sort((a, b) => a.order - b.order);
    }
    return map;
  }, [columns, filteredTasks]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;
  const mostUrgent = useMemo(() => findMostUrgentPending(tasks), [tasks]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const overId = over.id as string;
    const overColumn = columns.find((c) => c.id === overId);

    let destColumnId: string;
    let destIndex: number;

    if (overColumn) {
      destColumnId = overColumn.id;
      destIndex = tasksByColumn[destColumnId].filter((t) => t.id !== taskId).length;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (!overTask) return;
      destColumnId = overTask.columnId;
      const siblings = tasksByColumn[destColumnId].filter((t) => t.id !== taskId);
      const idx = siblings.findIndex((t) => t.id === overTask.id);
      destIndex = idx === -1 ? siblings.length : idx;
    }

    const destColumn = columns.find((c) => c.id === destColumnId);
    const srcColumn = columns.find((c) => c.id === task.columnId);
    const previousColumnId = task.columnId;
    const changingColumn = destColumnId !== previousColumnId;

    if (changingColumn && destColumn && srcColumn) {
      const allowed = canMoveTask(
        currentUser?.isGestor ?? false,
        srcColumn.kind,
        columns.indexOf(srcColumn),
        destColumn.kind,
        columns.indexOf(destColumn),
      );
      if (!allowed) {
        pushToast(
          srcColumn.kind === "done"
            ? "Somente o gestor pode mover uma demanda já concluída."
            : "Você só pode mover a demanda para frente, ou entre Em Andamento e Em Pausa.",
        );
        return;
      }
    }

    if (changingColumn && destColumn?.kind === "paused") {
      setPendingPause({ taskId, destColumnId, destIndex, empresaNome: task.empresa });
      return;
    }

    moveTask(taskId, destColumnId, destIndex);

    if (changingColumn && destColumn?.kind === "done" && !task.finalMessage) {
      setFinalizeState({ taskId, previousColumnId });
    }
  }

  return (
    <>
      {mostUrgent && (
        <div className="mb-4 flex items-center gap-2 rounded-[16px] bg-accent-100 px-4 py-2.5 text-sm text-accent-800">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            Prioridade {PRIORITY_LABEL[mostUrgent.prioridade]} mais antiga aguardando início:{" "}
            <span className="font-semibold">{mostUrgent.empresa || "(sem empresa)"}</span> — criada
            em {formatDateTime(mostUrgent.createdAt)}
          </span>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-start gap-3 overflow-x-auto pb-4">
          {columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              tasks={tasksByColumn[column.id] ?? []}
              activeId={activeId}
              onCardClick={setSelectedTask}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeTask ? <TaskCardContent task={activeTask} dragOverlay /> : null}
        </DragOverlay>
      </DndContext>

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailsModal
            task={tasks.find((t) => t.id === selectedTask.id) ?? selectedTask}
            onClose={() => setSelectedTask(null)}
          />
        )}

        {finalizeState && (
          <FinalizeModal
            taskId={finalizeState.taskId}
            previousColumnId={finalizeState.previousColumnId}
            onClose={() => setFinalizeState(null)}
          />
        )}

        {pendingPause && (
          <PauseReasonModal
            empresaNome={pendingPause.empresaNome}
            onCancel={() => setPendingPause(null)}
            onConfirm={async (motivo) => {
              await moveTask(
                pendingPause.taskId,
                pendingPause.destColumnId,
                pendingPause.destIndex,
                motivo,
              );
              setPendingPause(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
