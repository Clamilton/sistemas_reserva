import { useToastStore } from "../store/useToastStore";

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-[16px] bg-neutral-900 px-4 py-2.5 text-sm text-neutral-100 elev-lg"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
