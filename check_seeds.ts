import prisma from "./prisma";

async function main() {
  const [orderStatuses, paymentMethods, roles] = await Promise.all([
    prisma.orderStatus.findMany(),
    prisma.paymentMethods.findMany(),
    prisma.roles.findMany(),
  ]);

  console.log("ORDER_STATUSES:", orderStatuses);
  console.log("PAYMENT_METHODS:", paymentMethods);
  console.log("ROLES:", roles);
}

main().catch(console.error).finally(() => prisma.$disconnect());
