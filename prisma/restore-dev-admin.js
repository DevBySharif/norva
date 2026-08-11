/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require("node:fs");
const { hash } = require("bcryptjs");
const { PrismaClient, Role } = require("@prisma/client");

function localEnv(name) {
  const line = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(`${name}=`));

  if (!line) throw new Error(`${name} is required in the local .env file.`);
  return line.slice(name.length + 1).replace(/^"|"$/g, "");
}

async function main() {
  const email = localEnv("DEV_ADMIN_EMAIL").toLowerCase();
  const password = localEnv("DEV_ADMIN_PASSWORD");
  const prisma = new PrismaClient();

  try {
    await prisma.user.upsert({
      where: { email },
      update: {
        name: "Development Admin",
        role: Role.SUPER_ADMIN,
        passwordHash: await hash(password, 12),
      },
      create: {
        email,
        name: "Development Admin",
        role: Role.SUPER_ADMIN,
        passwordHash: await hash(password, 12),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
