import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth/middleware";
import { logAudit } from "../lib/audit";

export const empresasRouter = Router();

empresasRouter.use(requireAuth);

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

empresasRouter.get("/", async (_req, res) => {
  const empresas = await prisma.empresa.findMany({ orderBy: { nome: "asc" } });
  res.json(empresas);
});

const createEmpresaSchema = z.object({
  cnpj: z.string().min(1),
  nome: z.string().min(1),
});

empresasRouter.post("/", async (req, res) => {
  const parsed = createEmpresaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const { cnpj, nome } = parsed.data;
  const digits = onlyDigits(cnpj);
  const empresas = await prisma.empresa.findMany();
  const existing = empresas.find((e) => onlyDigits(e.cnpj) === digits);

  if (existing) {
    const updated = await prisma.empresa.update({
      where: { id: existing.id },
      data: { nome: nome.trim(), cnpj: cnpj.trim() },
    });
    await logAudit({
      actorId: req.user!.id,
      actorNome: req.user!.nome,
      action: "empresa.updated",
      entityType: "Empresa",
      entityId: updated.id,
      description: `Empresa "${updated.nome}" (${updated.cnpj}) atualizada.`,
    });
    res.json(updated);
    return;
  }

  const empresa = await prisma.empresa.create({
    data: { cnpj: cnpj.trim(), nome: nome.trim() },
  });
  await logAudit({
    actorId: req.user!.id,
    actorNome: req.user!.nome,
    action: "empresa.created",
    entityType: "Empresa",
    entityId: empresa.id,
    description: `Empresa "${empresa.nome}" (${empresa.cnpj}) cadastrada.`,
  });
  res.status(201).json(empresa);
});

empresasRouter.delete("/:id", async (req, res) => {
  const empresa = await prisma.empresa.findUnique({ where: { id: req.params.id } });
  await prisma.empresa.delete({ where: { id: req.params.id } }).catch(() => null);
  if (empresa) {
    await logAudit({
      actorId: req.user!.id,
      actorNome: req.user!.nome,
      action: "empresa.deleted",
      entityType: "Empresa",
      entityId: empresa.id,
      description: `Empresa "${empresa.nome}" (${empresa.cnpj}) excluída.`,
    });
  }
  res.status(204).end();
});

const importSchema = z.object({
  lines: z.array(z.object({ cnpj: z.string().min(1), nome: z.string().min(1) })),
});

empresasRouter.post("/import", async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const existentes = await prisma.empresa.findMany();
  const byDigits = new Map(existentes.map((e) => [onlyDigits(e.cnpj), e]));

  let added = 0;
  let updated = 0;

  for (const line of parsed.data.lines) {
    const digits = onlyDigits(line.cnpj);
    const nome = line.nome.trim();
    if (!digits || !nome) continue;

    const existing = byDigits.get(digits);
    if (existing) {
      if (existing.nome !== nome) {
        await prisma.empresa.update({ where: { id: existing.id }, data: { nome } });
        updated++;
      }
    } else {
      const created = await prisma.empresa.create({ data: { cnpj: line.cnpj.trim(), nome } });
      byDigits.set(digits, created);
      added++;
    }
  }

  if (added > 0 || updated > 0) {
    await logAudit({
      actorId: req.user!.id,
      actorNome: req.user!.nome,
      action: "empresa.imported",
      entityType: "Empresa",
      description: `Importação de empresas: ${added} adicionada(s), ${updated} atualizada(s).`,
    });
  }

  res.json({ added, updated });
});
