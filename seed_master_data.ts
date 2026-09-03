// import prisma from "./prisma";

// export async function seedMasterData() {
//   console.log("Checking master data...");

//   // 1. Seed OrderStatus
//   const existingStatuses = await prisma.orderStatus.findMany();
//   if (existingStatuses.length === 0) {
//     console.log("Seeding OrderStatus...");
//     const statuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Returned"];
//     for (const name of statuses) {
//       await prisma.orderStatus.create({
//         data: {
//           Name: name,
//           IsMarkToDelete: false,
//           CreatedBy: "SYSTEM",
//         },
//       });
//     }
//     console.log("OrderStatus seeded successfully.");
//   }

//   // 2. Seed PaymentMethods
//   const existingMethods = await prisma.paymentMethods.findMany();
//   if (existingMethods.length === 0) {
//     console.log("Seeding PaymentMethods...");
//     const methods = ["Cash on Delivery", "bKash", "Nagad", "Rocket", "Credit / Debit Card"];
//     for (const name of methods) {
//       await prisma.paymentMethods.create({
//         data: {
//           Name: name,
//           IsMarkToDelete: false,
//           CreatedBy: "SYSTEM",
//         },
//       });
//     }
//     console.log("PaymentMethods seeded successfully.");
//   }

//   // 3. Seed Roles if needed
//   const existingRoles = await prisma.roles.findMany();
//   if (existingRoles.length === 0) {
//     console.log("Seeding Roles...");
//     await prisma.roles.createMany({
//       data: [
//         { Name: "SuperAdmin", IsMarkToDelete: false, CreatedBy: 1 },
//         { Name: "Admin", IsMarkToDelete: false, CreatedBy: 1 },
//         { Name: "Customer", IsMarkToDelete: false, CreatedBy: 1 },
//       ],
//     });
//     console.log("Roles seeded successfully.");
//   }

//   console.log("Master data check complete.");
// }

// if (require.main === module) {
//   seedMasterData()
//     .catch(console.error)
//     .finally(() => prisma.$disconnect());
// }
