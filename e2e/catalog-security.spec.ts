import { expect, test } from "@playwright/test";
import { saveBrandForActor } from "@/features/brands/service";
import { saveCategoryForActor } from "@/features/categories/service";
import { canManageCatalog, catalogManagementRoles } from "@/lib/auth/catalog-policy";
import { prisma } from "@/lib/db/prisma";
import { cleanupAuditLogsForEntities, cleanupBrandBySlug, cleanupCategoryBySlug, cleanupTestUser, countAuditLogsForEntity, countBrandsBySlug, countCategoriesBySlug, createTestCustomer, disconnectE2EDatabase, findAuditLogsForEntity, findUserByEmail } from "./helpers/db";
import { privateEnv } from "./helpers/env";
import { runId } from "./helpers/test-data";

const id = runId();
const categorySlug = `e2e-security-category-${id}`;
const childCategorySlug = `e2e-security-child-${id}`;
const brandSlug = `e2e-security-brand-${id}`;
const anonymousCategorySlug = `e2e-security-anonymous-category-${id}`;
const anonymousBrandSlug = `e2e-security-anonymous-brand-${id}`;
const customerCategorySlug = `e2e-security-customer-category-${id}`;
const customerBrandSlug = `e2e-security-customer-brand-${id}`;
const customerEmail = `e2e-security-customer-${id}@example.test`;
const entityIds: string[] = [];

test.afterAll(async () => {
  await cleanupAuditLogsForEntities(entityIds);
  await cleanupCategoryBySlug(categorySlug);
  await cleanupCategoryBySlug(childCategorySlug);
  await cleanupBrandBySlug(brandSlug);
  await cleanupTestUser(customerEmail);
  await disconnectE2EDatabase();
  await prisma.$disconnect();
});

test("catalog mutation authorization boundaries and audit logging", async () => {
  const admin = await findUserByEmail(privateEnv("DEV_ADMIN_EMAIL").toLowerCase());
  expect(admin?.role).toBe("SUPER_ADMIN");
  if (!admin) throw new Error("Missing development SUPER_ADMIN.");
  const superAdmin = { id: admin.id, role: admin.role };
  const customer = await createTestCustomer(customerEmail);

  expect(catalogManagementRoles).toEqual(["SUPER_ADMIN", "ADMIN", "MANAGER"]);
  expect(canManageCatalog("SUPER_ADMIN")).toBe(true);
  expect(canManageCatalog("ADMIN")).toBe(true);
  expect(canManageCatalog("MANAGER")).toBe(true);
  expect(canManageCatalog("CUSTOMER")).toBe(false);
  expect(canManageCatalog("STAFF")).toBe(false);

  expect((await saveCategoryForActor({ name: "Anonymous category", slug: anonymousCategorySlug, isActive: true }, null)).success).toBe(false);
  expect((await saveBrandForActor({ name: "Anonymous brand", slug: anonymousBrandSlug, isActive: true }, null)).success).toBe(false);
  expect(await countCategoriesBySlug(anonymousCategorySlug)).toBe(0);
  expect(await countBrandsBySlug(anonymousBrandSlug)).toBe(0);

  expect((await saveCategoryForActor({ name: "Customer category", slug: customerCategorySlug, isActive: true }, { id: customer.id, role: customer.role })).success).toBe(false);
  expect((await saveBrandForActor({ name: "Customer brand", slug: customerBrandSlug, isActive: true }, { id: customer.id, role: customer.role })).success).toBe(false);
  expect(await countCategoriesBySlug(customerCategorySlug)).toBe(0);
  expect(await countBrandsBySlug(customerBrandSlug)).toBe(0);

  const categoryCreate = await saveCategoryForActor({ name: "Security category", slug: categorySlug, description: "Created by security test", isActive: true }, superAdmin);
  expect(categoryCreate.success).toBe(true);
  entityIds.push(categoryCreate.id!);
  const categoryCreateLogs = await findAuditLogsForEntity("Category", categoryCreate.id!);
  expect(categoryCreateLogs).toHaveLength(1);
  expect(categoryCreateLogs[0]).toMatchObject({ userId: admin.id, action: "CATEGORY_CREATED", entityId: categoryCreate.id! });
  expect(categoryCreateLogs[0].createdAt.getTime()).toBeLessThanOrEqual(Date.now());

  const categoryUpdate = await saveCategoryForActor({ id: categoryCreate.id, name: "Security category updated", slug: categorySlug, description: "Updated by security test", isActive: true }, superAdmin);
  expect(categoryUpdate.success).toBe(true);
  const categoryLogs = await findAuditLogsForEntity("Category", categoryCreate.id!);
  expect(categoryLogs.map((log) => log.action)).toEqual(["CATEGORY_CREATED", "CATEGORY_UPDATED"]);

  const childCreate = await saveCategoryForActor({ name: "Security child", slug: childCategorySlug, parentId: categoryCreate.id, isActive: true }, superAdmin);
  expect(childCreate.success).toBe(true);
  entityIds.push(childCreate.id!);
  const categoryLogCountBeforeFailure = await countAuditLogsForEntity("Category", categoryCreate.id!);
  expect((await saveCategoryForActor({ id: categoryCreate.id, name: "Security category updated", slug: categorySlug, parentId: categoryCreate.id, isActive: true }, superAdmin)).success).toBe(false);
  expect(await countAuditLogsForEntity("Category", categoryCreate.id!)).toBe(categoryLogCountBeforeFailure);
  expect((await saveCategoryForActor({ name: "Security duplicate category", slug: categorySlug, isActive: true }, superAdmin)).success).toBe(false);
  expect(await countAuditLogsForEntity("Category", categoryCreate.id!)).toBe(categoryLogCountBeforeFailure);

  const brandCreate = await saveBrandForActor({ name: "Security brand", slug: brandSlug, description: "Created by security test", isActive: true }, superAdmin);
  expect(brandCreate.success).toBe(true);
  entityIds.push(brandCreate.id!);
  const brandCreateLogs = await findAuditLogsForEntity("Brand", brandCreate.id!);
  expect(brandCreateLogs).toHaveLength(1);
  expect(brandCreateLogs[0]).toMatchObject({ userId: admin.id, action: "BRAND_CREATED", entityId: brandCreate.id! });

  const brandUpdate = await saveBrandForActor({ id: brandCreate.id, name: "Security brand updated", slug: brandSlug, description: "Updated by security test", isActive: true }, superAdmin);
  expect(brandUpdate.success).toBe(true);
  const brandLogs = await findAuditLogsForEntity("Brand", brandCreate.id!);
  expect(brandLogs.map((log) => log.action)).toEqual(["BRAND_CREATED", "BRAND_UPDATED"]);
  const brandLogCountBeforeFailure = await countAuditLogsForEntity("Brand", brandCreate.id!);
  expect((await saveBrandForActor({ name: "Security duplicate brand", slug: brandSlug, isActive: true }, superAdmin)).success).toBe(false);
  expect(await countAuditLogsForEntity("Brand", brandCreate.id!)).toBe(brandLogCountBeforeFailure);

  for (const log of [...categoryLogs, ...brandLogs]) {
    const payload = JSON.stringify(log.metadata ?? {});
    expect(payload).not.toMatch(/password|token|cookie|secret|database/i);
  }
});
