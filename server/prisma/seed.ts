import bcrypt from "bcryptjs";
import { prisma } from "../src/db";

const DEFAULT_COLUMNS = [
  { id: "fila", title: "Aguardando Início", kind: "queue" as const, order: 0 },
  { id: "andamento", title: "Em Andamento", kind: "active" as const, order: 1 },
  { id: "revisao", title: "Em Pausa", kind: "paused" as const, order: 2 },
  { id: "concluido", title: "Concluído", kind: "done" as const, order: 3 },
];

async function main() {
  for (const column of DEFAULT_COLUMNS) {
    await prisma.column.upsert({
      where: { id: column.id },
      update: { title: column.title, kind: column.kind, order: column.order },
      create: column,
    });
  }
  console.log(`Colunas ok (${DEFAULT_COLUMNS.length}).`);

  const username = process.env.BOOTSTRAP_USERNAME;
  const password = process.env.BOOTSTRAP_PASSWORD;
  const nome = process.env.BOOTSTRAP_NOME ?? username;

  if (!username || !password) {
    console.log("BOOTSTRAP_USERNAME/BOOTSTRAP_PASSWORD não definidos, pulando criação de usuário.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`Usuário "${username}" já existe, nada a fazer.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { username, passwordHash, nome: nome! } });
  console.log(`Usuário "${username}" criado.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
