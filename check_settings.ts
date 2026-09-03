import prisma from "./prisma";

async function main() {
  const shopSettings = await prisma.shopSettings.findMany();
  console.log("SHOP_SETTINGS:", shopSettings);
}

main().catch(console.error).finally(() => prisma.$disconnect());
