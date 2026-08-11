import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, OrderStatus, PaymentStatus } from "@prisma/client";

const adminOrderListSelect = {
  id: true,
  orderNumber: true,
  email: true,
  status: true,
  grandTotal: true,
  currency: true,
  createdAt: true,
  payment: { select: { provider: true, status: true } },
  items: { select: { id: true } },
} satisfies Prisma.OrderSelect;

export type AdminOrderFilters = {
  status?: OrderStatus | "ALL";
  paymentStatus?: PaymentStatus | "ALL";
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function getAdminOrders(filters: AdminOrderFilters = {}) {
  const where: Prisma.OrderWhereInput = {};
  if (filters.status && filters.status !== "ALL") where.status = filters.status;
  if (filters.paymentStatus && filters.paymentStatus !== "ALL") where.payment = { status: filters.paymentStatus };
  if (filters.search?.trim()) {
    where.OR = [
      { orderNumber: { contains: filters.search.trim(), mode: "insensitive" } },
      { email: { contains: filters.search.trim(), mode: "insensitive" } },
    ];
  }
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00`) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999`) } : {}),
    };
  }
  return prisma.order.findMany({ where, select: adminOrderListSelect, orderBy: { createdAt: "desc" }, take: 200 });
}

export async function getAdminOrderStatusCounts() {
  const rows = await prisma.order.groupBy({ by: ["status"], _count: { _all: true } });
  const base: Record<string, number> = {};
  for (const status of ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const) {
    base[status] = 0;
  }
  for (const row of rows) base[row.status] = row._count._all;
  return base as Record<OrderStatus, number>;
}

export async function getAdminOrderById(id: string) {
  return prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      email: true,
      status: true,
      subtotal: true,
      shippingTotal: true,
      taxTotal: true,
      discountTotal: true,
      grandTotal: true,
      currency: true,
      createdAt: true,
      shippingAddress: true,
      userId: true,
      payment: { select: { provider: true, status: true, amount: true } },
      items: {
        select: {
          id: true,
          productName: true,
          variantName: true,
          sku: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
        },
      },
      statusHistory: {
        select: { status: true, fromStatus: true, note: true, internalNote: true, actorType: true, actorUserId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}