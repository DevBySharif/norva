import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const CUSTOMER_ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  subtotal: true,
  shippingTotal: true,
  taxTotal: true,
  discountTotal: true,
  grandTotal: true,
  currency: true,
  createdAt: true,
} satisfies Prisma.OrderSelect;

export const CUSTOMER_ORDER_DETAIL_SELECT = {
  orderNumber: true,
  status: true,
  subtotal: true,
  shippingTotal: true,
  taxTotal: true,
  discountTotal: true,
  grandTotal: true,
  currency: true,
  email: true,
  createdAt: true,
  shippingAddress: true,
  payment: { select: { provider: true, status: true } },
  items: {
    select: { productName: true, variantName: true, sku: true, unitPrice: true, quantity: true, lineTotal: true },
    orderBy: { id: "asc" },
  },
  statusHistory: { select: { status: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.OrderSelect;

/** Orders owned by the signed-in customer. Server-side filtering; never client-side. */
export function getCustomerOrders(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: CUSTOMER_ORDER_LIST_SELECT,
  });
}

/** A single order only when it belongs to the customer. Returns null otherwise (no leak). */
export async function getCustomerOrder(userId: string, orderNumber: string) {
  const order = await prisma.order.findFirst({
    where: { orderNumber, userId },
    select: CUSTOMER_ORDER_DETAIL_SELECT,
  });
  return order;
}

export async function getAccountOverview(userId: string) {
  const [recentOrders, addressCount, defaultAddress] = await Promise.all([
    prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5, select: CUSTOMER_ORDER_LIST_SELECT }),
    prisma.address.count({ where: { userId } }),
    prisma.address.findFirst({ where: { userId, isDefault: true }, select: { id: true, label: true, line1: true, city: true } }),
  ]);
  return { recentOrders, addressCount, defaultAddress };
}

export function getCustomerProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, role: true, emailVerifiedAt: true, createdAt: true },
  });
}

export function getCustomerAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: { id: true, label: true, recipientName: true, phone: true, line1: true, line2: true, city: true, state: true, postalCode: true, country: true, countryCode: true, isDefault: true },
  });
}
