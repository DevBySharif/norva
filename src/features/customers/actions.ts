"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireCustomer, getCurrentUser } from "@/lib/auth/session";
import {
  claimGuestOrderCore,
  createAddressCore,
  deleteAddressCore,
  registerCustomerCore,
  setDefaultAddressCore,
  updateAddressCore,
  updateProfileCore,
  type CustomerServiceResult,
} from "@/features/customers/service";

export type CustomerActionResult = CustomerServiceResult;

export async function registerCustomer(input: unknown): Promise<CustomerActionResult> {
  return registerCustomerCore(input);
}

export async function updateProfile(input: unknown): Promise<CustomerActionResult> {
  const user = await requireCustomer();
  const result = await updateProfileCore(user.id, input);
  revalidatePath("/account/profile", "page");
  revalidatePath("/account", "page");
  return result;
}

export async function createAddress(input: unknown): Promise<CustomerActionResult> {
  const user = await requireCustomer();
  const result = await createAddressCore(user.id, input);
  revalidatePath("/account/addresses", "page");
  revalidatePath("/account", "page");
  return result;
}

export async function updateAddress(input: { id: string } & Record<string, unknown>): Promise<CustomerActionResult> {
  const user = await requireCustomer();
  const result = await updateAddressCore(user.id, input.id, input);
  revalidatePath("/account/addresses", "page");
  revalidatePath("/account", "page");
  return result;
}

export async function deleteAddress(id: string): Promise<CustomerActionResult> {
  const user = await requireCustomer();
  const result = await deleteAddressCore(user.id, id);
  revalidatePath("/account/addresses", "page");
  revalidatePath("/account", "page");
  return result;
}

export async function setDefaultAddress(id: string): Promise<CustomerActionResult> {
  const user = await requireCustomer();
  const result = await setDefaultAddressCore(user.id, id);
  revalidatePath("/account/addresses", "page");
  revalidatePath("/account", "page");
  return result;
}

export async function claimGuestOrder(input: unknown): Promise<CustomerActionResult> {
  const user = await requireCustomer();
  const result = await claimGuestOrderCore(user.id, input);
  revalidatePath("/account/orders", "page");
  return result;
}

/** Customer-safe checkout prefill, or null for guests. */
export async function getCheckoutPrefill() {
  const session = await getCurrentUser();
  if (!session?.user || session.user.role !== "CUSTOMER") return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      phone: true,
      addresses: { where: { isDefault: true }, take: 1, orderBy: { updatedAt: "desc" } },
    },
  });
  if (!user) return null;

  const addr = user.addresses[0];
  return {
    customer: { fullName: user.name ?? "", email: user.email, phone: user.phone ?? "" },
    shippingAddress: addr
      ? { line1: addr.line1, line2: addr.line2 ?? "", city: addr.city, state: addr.state ?? "", postalCode: addr.postalCode ?? "", country: addr.country ?? "" }
      : null,
  };
}
