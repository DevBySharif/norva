import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+\d][\d\s().-]*$/, "Enter a valid phone number.")
  .optional()
  .or(z.literal(""));

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name is required.").max(160),
    email: z.string().trim().toLowerCase().email("A valid email address is required.").max(254),
    password: z.string().min(8, "Password must be at least 8 characters.").max(128, "Password is too long."),
    confirmPassword: z.string().min(1, "Confirm your password."),
    phone: phoneSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required.").max(160),
  phone: phoneSchema,
});

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  recipientName: z.string().trim().min(2, "Recipient name is required.").max(160),
  phone: phoneSchema,
  line1: z.string().trim().min(1, "Address line 1 is required.").max(255),
  line2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(1, "City is required.").max(120),
  state: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(40).optional(),
  country: z.string().trim().max(80).optional(),
  countryCode: z.string().trim().max(2).optional(),
  isDefault: z.boolean().optional(),
});

export const claimOrderSchema = z.object({
  orderNumber: z.string().trim().min(1, "Enter your order number.").max(60),
  email: z.string().trim().toLowerCase().email("Enter the email you used at checkout.").max(254),
  accessToken: z.string().trim().min(8, "Enter the access link token from your confirmation.").max(80),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type ClaimOrderInput = z.infer<typeof claimOrderSchema>;
