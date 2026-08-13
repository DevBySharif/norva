import "server-only";
import { prisma } from "@/lib/db/prisma";

export async function getAdminDashboard() {
  const [totalOrders, pendingOrders, customers, activeProducts, inventory, recentOrders] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.product.count({ where: { status: "ACTIVE", deletedAt: null } }),
    prisma.inventory.findMany({ select: { quantity: true, reservedQuantity: true, reorderPoint: true } }),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, orderNumber: true, email: true, status: true, grandTotal: true, currency: true, createdAt: true } }),
  ]);

  const available = inventory.map((item) => item.quantity - item.reservedQuantity);
  return {
    totalOrders,
    pendingOrders,
    customers,
    activeProducts,
    outOfStock: available.filter((quantity) => quantity <= 0).length,
    lowStock: inventory.filter((item) => {
      const quantity = item.quantity - item.reservedQuantity;
      return quantity > 0 && item.reorderPoint !== null && quantity <= item.reorderPoint;
    }).length,
    recentOrders,
  };
}
