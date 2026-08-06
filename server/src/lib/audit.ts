import { prisma } from "../db";

interface LogAuditParams {
  actorId: string;
  actorNome: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
}

/**
 * Nunca deve derrubar a operação principal — se a gravação do log falhar,
 * só registra no console e segue.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        actorNome: params.actorNome,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        description: params.description,
      },
    });
  } catch (err) {
    console.error("Falha ao gravar log de auditoria:", err);
  }
}
