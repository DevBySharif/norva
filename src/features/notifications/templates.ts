import type { OrderNotificationEvent } from "./outbox";

/** Temporary brand name — renamed to the final store brand later. */
export const BRAND_NAME = "Norva";

const COLORS = {
  background: "#F0EEE6",
  card: "#FFFDF7",
  accent: "#D57959",
  accentDark: "#C26D50",
  ink: "#4B4238",
  muted: "#8b5946",
  border: "#E0D9CC",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function baseEmailHtml(opts: { preheader: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(BRAND_NAME)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.background};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.background};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:28px 28px 8px 28px;font-size:20px;font-weight:700;color:${COLORS.muted};letter-spacing:.04em;">${escapeHtml(BRAND_NAME)}</td>
        </tr>
        <tr>
          <td style="padding:8px 28px 4px 28px;color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;">
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 28px 28px;color:${COLORS.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;">
            You received this email because of activity on your ${escapeHtml(BRAND_NAME)} account or order.<br />
            If you didn't expect this message, you can safely ignore it.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function primaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td>
<a href="${escapeHtml(href)}" style="display:inline-block;background-color:${COLORS.accent};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function orderItemRows(items: Array<{ productName: string; sku: string; variantName: string | null; quantity: number; unitPrice: string; lineTotal: string }>): string {
  return items
    .map(
      (item) => `<tr style="border-top:1px solid ${COLORS.border};">
  <td style="padding:10px 0;color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;font-size:14px;">
    <strong>${escapeHtml(item.productName)}</strong><br />
    <span style="color:${COLORS.muted};font-size:12px;">${escapeHtml(item.variantName ?? "Default")} · SKU ${escapeHtml(item.sku)} · Qty ${item.quantity}</span>
  </td>
  <td align="right" style="padding:10px 0;color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;font-size:14px;white-space:nowrap;">${escapeHtml(item.lineTotal)}</td>
</tr>`
    )
    .join("");
}

export type OrderEmailTemplateInput = {
  eventType: OrderNotificationEvent;
  orderNumber: string;
  statusLabel: string;
  email: string;
  currency: string;
  subtotal: string;
  shippingTotal: string;
  taxTotal: string;
  grandTotal: string;
  createdAt: string;
  guestUrl?: string | null;
  items: Array<{ productName: string; sku: string; variantName: string | null; quantity: number; unitPrice: string; lineTotal: string }>;
};

const ORDER_SUBJECTS: Record<OrderNotificationEvent, { subject: string; heading: string; intro: string }> = {
  ORDER_CREATED: {
    subject: `Your order is confirmed — ${BRAND_NAME}`,
    heading: "Thanks for your order",
    intro: `We're putting together your order. Your reference is`,
  },
  ORDER_CONFIRMED: {
    subject: `Order confirmed — ${BRAND_NAME}`,
    heading: "Order confirmed",
    intro: "Good news — your order has been confirmed. Your reference is",
  },
  ORDER_SHIPPED: {
    subject: `Your order has shipped — ${BRAND_NAME}`,
    heading: "Your order has shipped",
    intro: "Your order is on its way. Your reference is",
  },
  ORDER_DELIVERED: {
    subject: `Your order has been delivered — ${BRAND_NAME}`,
    heading: "Your order has been delivered",
    intro: "Your order has arrived. Your reference is",
  },
  ORDER_CANCELLED: {
    subject: `Your order was cancelled — ${BRAND_NAME}`,
    heading: "Your order was cancelled",
    intro: "Your order has been cancelled. Your reference is",
  },
};

export function orderEmailTemplate(input: OrderEmailTemplateInput): { subject: string; text: string; html: string } {
  const copy = ORDER_SUBJECTS[input.eventType] ?? ORDER_SUBJECTS.ORDER_CREATED;
  const summaryLines = input.items
    .map((item) => `  ${item.quantity} × ${item.productName} (${item.variantName ?? "Default"}) — ${item.lineTotal}`)
    .join("\n");

  const text = [
    `${copy.heading}`,
    ``,
    `${copy.intro} ${input.orderNumber}.`,
    ``,
    `Status: ${input.statusLabel}`,
    ``,
    summaryLines,
    ``,
    `Subtotal: ${input.subtotal}`,
    `Shipping: ${input.shippingTotal}`,
    `Tax: ${input.taxTotal}`,
    `Total: ${input.grandTotal}`,
    ``,
    ...(input.guestUrl ? [`Track your order: ${input.guestUrl}`, ``] : []),
    `Order placed ${input.createdAt}`,
    ``,
    `— ${BRAND_NAME}`,
  ].join("\n");

  const html = baseEmailHtml({
    preheader: `${copy.heading} — ${input.orderNumber}`,
    bodyHtml: `
<p style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:${COLORS.ink};"><strong>${escapeHtml(copy.heading)}</strong></p>
<p style="margin:0 0 16px 0;">${escapeHtml(copy.intro)} <strong>${escapeHtml(input.orderNumber)}</strong></p>
<p style="margin:0 0 16px 0;font-weight:600;color:${COLORS.muted};">${escapeHtml(input.statusLabel)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px 0;">
  ${orderItemRows(input.items)}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.border};margin-top:8px;padding-top:8px;">
  ${[
    ["Subtotal", input.subtotal],
    ["Shipping", input.shippingTotal],
    ["Tax", input.taxTotal],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:2px 0;color:${COLORS.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;">${label}</td><td align="right" style="padding:2px 0;color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;font-size:13px;">${value}</td></tr>`
    )
    .join("")}
  <tr><td style="padding:6px 0;color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;">Total</td><td align="right" style="padding:6px 0;color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;">${escapeHtml(input.grandTotal)}</td></tr>
</table>
${input.guestUrl ? primaryButton(input.guestUrl, "Track your order") : ""}
<p style="margin:8px 0 0 0;color:${COLORS.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;">Order placed ${escapeHtml(input.createdAt)}</p>`,
  });

  return { subject: copy.subject, text, html };
}

export function verifyEmailTemplate(input: { verifyUrl: string; name?: string | null }): { subject: string; text: string; html: string } {
  const subject = `Verify your email — ${BRAND_NAME}`;
  const text = [
    `${input.name ? `Hi ${input.name},` : "Hi,"}`,
    ``,
    `Please verify your email address to keep your ${BRAND_NAME} account secure.`,
    ``,
    `Verify your email: ${input.verifyUrl}`,
    ``,
    `This link expires in 24 hours.`,
    ``,
    `— ${BRAND_NAME}`,
  ].join("\n");

  const html = baseEmailHtml({
    preheader: "Verify your email address",
    bodyHtml: `
<p style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:${COLORS.ink};">Verify your email</p>
<p style="margin:0 0 16px 0;">${input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,"} please verify your email address to finish setting up your ${escapeHtml(BRAND_NAME)} account.</p>
${primaryButton(input.verifyUrl, "Verify email")}
<p style="margin:0;color:${COLORS.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>`,
  });

  return { subject, text, html };
}

export function passwordResetTemplate(input: { resetUrl: string }): { subject: string; text: string; html: string } {
  const subject = `Reset your password — ${BRAND_NAME}`;
  const text = [
    `We received a request to reset your ${BRAND_NAME} password.`,
    ``,
    `Reset your password: ${input.resetUrl}`,
    ``,
    `This link expires in 24 hours. If you didn't request a reset, you can safely ignore this email.`,
    ``,
    `— ${BRAND_NAME}`,
  ].join("\n");

  const html = baseEmailHtml({
    preheader: "Reset your password",
    bodyHtml: `
<p style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:${COLORS.ink};">Reset your password</p>
<p style="margin:0 0 16px 0;">We received a request to reset the password for your ${escapeHtml(BRAND_NAME)} account.</p>
${primaryButton(input.resetUrl, "Reset password")}
<p style="margin:0;color:${COLORS.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;">This link expires in 24 hours. If you didn't request a reset, you can safely ignore this email.</p>`,
  });

  return { subject, text, html };
}
