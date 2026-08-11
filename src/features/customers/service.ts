import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import {
  addressSchema,
  claimOrderSchema,
  profileSchema,
  registerSchema,
  type AddressInput,
} from "@/lib/validations/customer";

export type CustomerServiceResult =
  | { ok: true }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string> };

function validationFailure(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): CustomerServiceResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, code: "validation", message: "Please correct the highlighted fields.", fieldErrors };
}

/** Registers a brand-new customer. Role is always CUSTOMER — never taken from client input. */
export async function registerCustomerCore(input: unknown): Promise<CustomerServiceResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { fullName, email, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, code: "email_taken", message: "An account with this email already exists. Please sign in instead." };
  }

  const passwordHash = await hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: { email, name: fullName, phone: phone?.trim() ? phone.trim() : null, role: "CUSTOMER", passwordHash },
  });
  await prisma.auditLog.create({
    data: { action: "CUSTOMER_REGISTERED", entityType: "User", entityId: user.id, userId: user.id, metadata: { email } },
  });
  return { ok: true };
}

export async function updateProfileCore(userId: string, input: unknown): Promise<CustomerServiceResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.fullName, phone: parsed.data.phone?.trim() ? parsed.data.phone.trim() : null },
  });
  await prisma.auditLog.create({
    data: { action: "CUSTOMER_PROFILE_UPDATED", entityType: "User", entityId: userId, userId },
  });
  return { ok: true };
}

export async function createAddressCore(userId: string, input: unknown): Promise<CustomerServiceResult> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const data = addressData(parsed.data);
  await prisma.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId } });
    const makeDefault = parsed.data.isDefault === true || count === 0;
    if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    await tx.address.create({ data: { ...data, userId, isDefault: makeDefault } });
  });
  await prisma.auditLog.create({ data: { action: "ADDRESS_CREATED", entityType: "Address", entityId: userId, userId } });
  return { ok: true };
}

export async function updateAddressCore(userId: string, id: string, input: unknown): Promise<CustomerServiceResult> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  if (!id) return { ok: false, code: "validation", message: "Invalid address." };

  const owned = await prisma.address.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return { ok: false, code: "not_found", message: "That address could not be found." };

  const data = addressData(parsed.data);
  await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault === true) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    await tx.address.update({ where: { id }, data: { ...data, isDefault: parsed.data.isDefault === true } });
  });
  await prisma.auditLog.create({ data: { action: "ADDRESS_UPDATED", entityType: "Address", entityId: id, userId } });
  return { ok: true };
}

export async function deleteAddressCore(userId: string, id: string): Promise<CustomerServiceResult> {
  if (!id) return { ok: false, code: "validation", message: "Invalid address." };

  const owned = await prisma.address.findFirst({ where: { id, userId }, select: { id: true, isDefault: true } });
  if (!owned) return { ok: false, code: "not_found", message: "That address could not be found." };

  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id } });
    if (owned.isDefault) {
      const replacement = await tx.address.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
      if (replacement) await tx.address.update({ where: { id: replacement.id }, data: { isDefault: true } });
    }
  });
  await prisma.auditLog.create({ data: { action: "ADDRESS_DELETED", entityType: "Address", entityId: id, userId } });
  return { ok: true };
}

export async function setDefaultAddressCore(userId: string, id: string): Promise<CustomerServiceResult> {
  if (!id) return { ok: false, code: "validation", message: "Invalid address." };

  const owned = await prisma.address.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return { ok: false, code: "not_found", message: "That address could not be found." };

  await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    await tx.address.update({ where: { id }, data: { isDefault: true } });
  });
  return { ok: true };
}

/** Links a guest order to a customer only when the guest lookup proof matches. */
export async function claimGuestOrderCore(userId: string, input: unknown): Promise<CustomerServiceResult> {
  const parsed = claimOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Enter your order number, email, and access token from the confirmation." };
  }

  const order = await prisma.order.findFirst({
    where: { orderNumber: parsed.data.orderNumber },
    select: { id: true, orderNumber: true, email: true, lookupToken: true, userId: true },
  });

  const proofMatches =
    order &&
    order.email.toLowerCase() === parsed.data.email &&
    order.lookupToken?.length === parsed.data.accessToken.length &&
    order.lookupToken === parsed.data.accessToken;

  const alreadyOwnedBySomeoneElse = order?.userId && order.userId !== userId;
  if (!proofMatches || alreadyOwnedBySomeoneElse) {
    return {
      ok: false,
      code: "claim_failed",
      message: "We couldn't verify that order. Check the order number, email, and access link from your confirmation.",
    };
  }

  await prisma.order.update({ where: { id: order.id }, data: { userId } });
  await prisma.auditLog.create({
    data: { action: "ORDER_CLAIMED", entityType: "Order", entityId: order.id, userId, metadata: { orderNumber: order.orderNumber } },
  });
  return { ok: true };
}

function addressData(input: AddressInput) {
  return {
    label: input.label?.trim() ? input.label.trim() : null,
    recipientName: input.recipientName?.trim() ? input.recipientName.trim() : null,
    phone: input.phone?.trim() ? input.phone.trim() : null,
    line1: input.line1,
    line2: input.line2?.trim() ? input.line2.trim() : null,
    city: input.city,
    state: input.state?.trim() ? input.state.trim() : null,
    postalCode: input.postalCode?.trim() ? input.postalCode.trim() : null,
    country: input.country?.trim() ? input.country.trim() : null,
    countryCode: input.countryCode?.trim() ? input.countryCode.trim().toUpperCase() : null,
  };
}
