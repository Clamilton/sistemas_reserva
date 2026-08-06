/** Notificações nativas do navegador (Notification API) pra avisar de novas
 * demandas mesmo com a aba em segundo plano. */

export function requestNotificationPermission(): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

/** Só dispara se a permissão já foi concedida e a aba não está em foco —
 * se o usuário já está olhando o Kanban, o toast + o piscar do card bastam. */
export function notifyNewDemand(message: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  try {
    const notification = new Notification("Nova demanda", {
      body: message,
      icon: "/favicon.svg",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Notification pode lançar em contextos restritos (ex: iframe) — ignora.
  }
}
