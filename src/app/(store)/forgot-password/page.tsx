import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/account/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
