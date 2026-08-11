import { z } from "zod";

export const checkoutItemSchema = z.object({
  variantId: z.string().trim().min(1, "A product variant is required."),
  quantity: z.number().int("Quantity must be a whole number.").min(1, "Quantity must be at least 1.").max(9999, "Quantity is too large."),
});

export const shippingAddressSchema = z.object({
  line1: z.string().trim().min(1, "Address line 1 is required.").max(255),
  line2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(1, "City is required.").max(120),
  state: z.string().trim().min(1, "State / region is required.").max(120),
  postalCode: z.string().trim().min(1, "Postal code is required.").max(40),
  country: z.string().trim().min(1, "Country is required.").max(80),
});

export const customerSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required.").max(160),
  email: z.string().trim().toLowerCase().email("A valid email address is required.").max(254),
  phone: z
    .string()
    .trim()
    .min(5, "A valid phone number is required.")
    .max(40)
    .regex(/^[+\d][\d\s().-]*$/, "Enter a valid phone number."),
});

export const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1, "Your cart is empty.").max(100, "Too many items in this order."),
  customer: customerSchema,
  shippingAddress: shippingAddressSchema,
  shippingMethodCode: z.string().trim().max(80).optional(),
  idempotencyKey: z.string().trim().min(8, "A valid submission token is required.").max(120),
  saveAddress: z.boolean().optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutFieldKeys = "customer.fullName" | "customer.email" | "customer.phone" | "shippingAddress.line1" | "shippingAddress.city" | "shippingAddress.state" | "shippingAddress.postalCode" | "shippingAddress.country";