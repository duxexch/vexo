import { pgTable, varchar, text, boolean, integer, decimal, timestamp, pgEnum, index, uniqueIndex, sql } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./schema";

export const investmentStatusEnum = pgEnum("investment_status", ["pending", "approved", "rejected", "cancelled", "completed"]);
export const investmentPaymentMethodTypeEnum = pgEnum("investment_payment_method_type", ["bank_transfer", "e_wallet", "crypto", "card", "manual"]);
export const investmentOrderActionEnum = pgEnum("investment_order_action", ["buy", "cancel", "approve", "reject", "complete"]);

export const investmentStocks = pgTable("investment_stocks", {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    symbol: text("symbol").notNull().unique(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),
    pricePerShare: decimal("price_per_share", { precision: 15, scale: 2 }).notNull().default("1.00"),
    totalShares: integer("total_shares").notNull().default(0),
    availableShares: integer("available_shares").notNull().default(0),
    minPurchaseShares: integer("min_purchase_shares").notNull().default(1),
    maxPurchaseShares: integer("max_purchase_shares").notNull().default(1000),
    isActive: boolean("is_active").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    colorClass: text("color_class").notNull().default("bg-sky-500/20 text-sky-500"),
    accentColor: text("accent_color").notNull().default("#0ea5e9"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("idx_investment_stocks_active").on(table.isActive),
    index("idx_investment_stocks_featured").on(table.isFeatured),
    index("idx_investment_stocks_sort").on(table.sortOrder),
]);

export const investmentPaymentMethods = pgTable("investment_payment_methods", {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    titleAr: text("title_ar"),
    type: investmentPaymentMethodTypeEnum("type").notNull().default("manual"),
    accountName: text("account_name"),
    accountNumber: text("account_number"),
    details: text("details"),
    instructions: text("instructions"),
    currency: text("currency").notNull().default("USD"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    index("idx_investment_payment_methods_active").on(table.isActive),
    index("idx_investment_payment_methods_sort").on(table.sortOrder),
]);

export const investmentOrders = pgTable("investment_orders", {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    stockId: varchar("stock_id").notNull().references(() => investmentStocks.id, { onDelete: "cascade" }),
    paymentMethodId: varchar("payment_method_id").references(() => investmentPaymentMethods.id),
    shares: integer("shares").notNull(),
    pricePerShare: decimal("price_per_share", { precision: 15, scale: 2 }).notNull(),
    totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
    status: investmentStatusEnum("status").notNull().default("pending"),
    investorName: text("investor_name"),
    investorPhone: text("investor_phone"),
    investorEmail: text("investor_email"),
    referenceNote: text("reference_note"),
    adminNote: text("admin_note"),
    receiptUrl: text("receipt_url"),
    reviewedBy: varchar("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("idx_investment_orders_user").on(table.userId, table.createdAt),
    index("idx_investment_orders_stock").on(table.stockId, table.createdAt),
    index("idx_investment_orders_status").on(table.status, table.createdAt),
]);

export const investmentOrdersRelations = {
};

export const insertInvestmentStockSchema = createInsertSchema(investmentStocks).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});

export const insertInvestmentPaymentMethodSchema = createInsertSchema(investmentPaymentMethods).omit({
    id: true,
    createdAt: true,
});

export const insertInvestmentOrderSchema = createInsertSchema(investmentOrders).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    reviewedAt: true,
});

export type InsertInvestmentStock = z.infer<typeof insertInvestmentStockSchema>;
export type InvestmentStock = typeof investmentStocks.$inferSelect;
export type InsertInvestmentPaymentMethod = z.infer<typeof insertInvestmentPaymentMethodSchema>;
export type InvestmentPaymentMethod = typeof investmentPaymentMethods.$inferSelect;
export type InsertInvestmentOrder = z.infer<typeof insertInvestmentOrderSchema>;
export type InvestmentOrder = typeof investmentOrders.$inferSelect;
export type InvestmentStatus = (typeof investmentStatusEnum.enumValues)[number];
export type InvestmentPaymentMethodType = (typeof investmentPaymentMethodTypeEnum.enumValues)[number];
