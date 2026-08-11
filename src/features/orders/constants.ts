export type PublicShippingMethod = { id: string; name: string; code: string; price: string };

export const freeShippingDefault: PublicShippingMethod = { id: "free", name: "Standard Delivery", code: "standard-free", price: "0.00" };

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Order placed",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}