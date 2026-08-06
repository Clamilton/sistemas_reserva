import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import type { Column as ColumnType, Task } from "../types";
import { TaskCard } from "./TaskCard";

interface Props {
  column: ColumnType;
  tasks: Task[];
  activeId: string | null;
  onCardClick: (task: Task) => void;
}

const KIND_BORDER: Record<ColumnType["kind"], string> = {
  queue: "border-t-neutral-500",
  active: "border-t-accent-2-500",
  paused: "border-t-accent-500",
  done: "border-t-accent-2-700",
};

const KIND_DOT: Record<ColumnType["kind"], string> = {
  queue: "bg-neutral-500",
  active: "bg-accent-2-500",
  paused: "bg-accent-500",
  done: "bg-accent-2-700",
};

export function Column({ column, tasks, activeId, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[288px] shrink-0 flex-col rounded-[28px] border-t-4 p-3 elev-sm transition-all duration-200 ${
        KIND_BORDER[column.kind]
      } ${isOver ? "bg-accent-100 ring-2 ring-accent-400" : "bg-neutral-200"}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-[9px] w-[9px] flex-none rounded-full ${KIND_DOT[column.kind]}`} />
        <h2 className="flex-1 font-heading text-[15px]">{column.title}</h2>
        <span className="flex-none rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium opacity-70">
          {tasks.length}
        </span>
      </div>
      <div className="flex min-h-[60px] max-h-[65vh] flex-1 flex-col gap-2 overflow-y-auto">
        {tasks.length === 0 && (
          <p className="pt-6 text-center text-xs opacity-45">Sem demandas</p>
        )}
        <AnimatePresence>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              dragging={activeId === task.id}
              onClick={() => onCardClick(task)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
