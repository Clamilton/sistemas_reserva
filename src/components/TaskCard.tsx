import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { Clock, User2 } from "lucide-react";
import type { Task } from "../types";
import { useAppStore } from "../store/useAppStore";
import { useAuthStore } from "../store/useAuthStore";
import { computeElapsedMs, formatDuration, useTicker } from "../lib/time";
import { PRIORITY_LABEL } from "../lib/priority";
import { initials } from "../lib/initials";

interface ContentProps {
  task: Task;
  onClick?: () => void;
  faded?: boolean;
  locked?: boolean;
  dragOverlay?: boolean;
  novo?: boolean;
}

const PRIORITY_INK: Record<Task["prioridade"], { bg: string; text: string; dot?: string }> = {
  alta: { bg: "#3a1c16", text: "#ff8f76", dot: "#e2543a" },
  media: { bg: "#3a2f12", text: "#f0c34d" },
  baixa: { bg: "#16321f", text: "#7fd88f" },
};

const CARD_SPRING = { type: "spring" as const, stiffness: 500, damping: 34, mass: 0.7 };

export function TaskCardContent({ task, onClick, faded, locked, dragOverlay, novo }: ContentProps) {
  const column = useAppStore((s) => s.columns.find((c) => c.id === task.columnId));
  const now = useTicker(1000);

  const elapsedMs = task.startedAt ? computeElapsedMs(task.statusHistory, now) : null;
  const elapsedLabel = elapsedMs !== null ? formatDuration(elapsedMs) : null;
  const pinfo = PRIORITY_INK[task.prioridade];

  return (
    <motion.div
      layout={!dragOverlay}
      initial={dragOverlay ? { scale: 1.05, rotate: 2 } : { opacity: 0, scale: 0.9 }}
      animate={
        dragOverlay
          ? { scale: 1.05, rotate: 2 }
          : { opacity: faded ? 0.4 : 1, scale: faded ? 0.97 : 1 }
      }
      exit={{ opacity: 0, scale: 0.82 }}
      transition={CARD_SPRING}
      onClick={onClick}
      title={locked ? "Demanda concluída — só o gestor pode movê-la" : undefined}
      className={`rounded-[12px] bg-neutral-100 p-3 transition-shadow ${
        dragOverlay ? "shadow-[var(--shadow-lg)]" : "elev-sm hover:shadow-[var(--shadow-md)]"
      } ${locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"} ${novo ? "card-novo" : ""}`}
      style={pinfo.dot ? { borderLeft: `3px solid ${pinfo.dot}` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`tag ${task.tipo === "compensacao" ? "tag-accent-2" : "tag-accent"}`}>
          {task.tipo === "compensacao" ? "Compensação" : "Retificação"}
        </span>
        <span
          className="inline-flex flex-none items-center gap-1.5 rounded-full py-0.5 text-[11px] font-bold tracking-wide"
          style={{
            background: pinfo.bg,
            color: pinfo.text,
            paddingLeft: pinfo.dot ? "7px" : "10px",
            paddingRight: "10px",
          }}
        >
          {pinfo.dot && (
            <span className="relative inline-block h-[7px] w-[7px] flex-none rounded-full" style={{ background: pinfo.dot }}>
              <span
                className="absolute -inset-1 rounded-full opacity-55"
                style={{ background: pinfo.dot, animation: "pulseRing 1.3s ease-out infinite" }}
              />
            </span>
          )}
          {PRIORITY_LABEL[task.prioridade]}
        </span>
      </div>

      {(column?.kind === "done" || column?.kind === "paused") && (
        <p
          className={`mt-1.5 text-[10px] font-bold ${
            column.kind === "done" ? "text-accent-2-700" : "text-accent-700"
          }`}
        >
          {column.kind === "done" ? "Concluída" : "Pausada"}
        </p>
      )}

      <p className="mt-2 break-words font-heading text-[15px] leading-snug">
        {task.empresa || "(empresa não identificada)"}
      </p>

      {task.siglasImpostos.length > 0 && (
        <p className="mt-1 truncate text-xs opacity-65">{task.siglasImpostos.join(" / ")}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <div className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-accent-2-200 text-[10px] font-bold text-accent-2-800">
          {initials(task.operadorNome)}
        </div>
        <span className="flex flex-1 items-center gap-1 truncate text-xs opacity-75">
          <User2 size={13} />
          {task.operadorNome}
        </span>
        {elapsedLabel && (
          <span className="flex flex-none items-center gap-1 text-[11px] opacity-55">
            <Clock size={12} />
            {elapsedLabel}
          </span>
        )}
      </div>
    </motion.div>
  );
}

interface Props {
  task: Task;
  onClick: () => void;
  dragging?: boolean;
}

export function TaskCard({ task, onClick, dragging }: Props) {
  const column = useAppStore((s) => s.columns.find((c) => c.id === task.columnId));
  const novo = useAppStore((s) => s.novosIds.has(task.id));
  const currentUser = useAuthStore((s) => s.user);
  const locked = column?.kind === "done" && !currentUser?.isGestor;

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: locked,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: task.id });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const setRefs = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <div ref={setRefs} style={style} {...listeners} {...attributes}>
      <TaskCardContent task={task} onClick={onClick} faded={isDragging || dragging} locked={locked} novo={novo} />
    </div>
  );
}
