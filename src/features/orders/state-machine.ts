import type { OrderStatus } from "@prisma/client";

/** Forward flow used by the admin UI to present the canonical lifecycle. */
export const FORWARD_FLOW: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export type InventoryAction = "finalize" | "release" | "none";

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/** Every transition legal from the given status, in display order. */
export function availableTransitionsFrom(status: OrderStatus): OrderStatus[] {
  return [...(ALLOWED_TRANSITIONS[status] ?? [])];
}

/**
 * Inventory policy. Placing an order reserves stock. Cancelling before
 * shipment returns that reservation to sellable stock. Reaching SHIPPED is
 * the single atomic point where physical stock is committed to the order.
 */
export function inventoryActionFor(from: OrderStatus, to: OrderStatus): InventoryAction {
  if (to === "CANCELLED") return "release";
  if (to === "SHIPPED") return "finalize";
  return "none";
}

export class InvalidOrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Order cannot move from ${from} to ${to}.`);
    this.name = "InvalidOrderTransitionError";
  }
}