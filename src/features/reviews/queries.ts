import "server-only";
import { prisma } from "@/lib/db/prisma";

export async function getProductReviews(productId: string) {
  const [reviews, aggregate] = await Promise.all([
    prisma.review.findMany({ where: { productId, isPublished: true }, orderBy: { createdAt: "desc" }, select: { id: true, rating: true, title: true, body: true, createdAt: true, user: { select: { name: true } } } }),
    prisma.review.aggregate({ where: { productId, isPublished: true }, _avg: { rating: true }, _count: { id: true } }),
  ]);
  return { reviews, average: aggregate._avg.rating, count: aggregate._count.id };
}

export async function getCustomerReview(productId: string, userId?: string) {
  if (!userId) return null;
  return prisma.review.findUnique({ where: { productId_userId: { productId, userId } }, select: { id: true, rating: true, title: true, body: true } });
}

export async function canReviewProduct(productId: string, userId?: string) {
  if (!userId) return false;
  return Boolean(await prisma.orderItem.findFirst({ where: { productId, order: { userId, status: "DELIVERED" } }, select: { id: true } }));
}
