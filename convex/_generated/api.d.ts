/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountShares from "../accountShares.js";
import type * as accounts from "../accounts.js";
import type * as actions_adminUsers from "../actions/adminUsers.js";
import type * as actions_deleteUserCascade from "../actions/deleteUserCascade.js";
import type * as actions_exportMyData from "../actions/exportMyData.js";
import type * as actions_fetchExchangeRates from "../actions/fetchExchangeRates.js";
import type * as actions_processRecurringTransactions from "../actions/processRecurringTransactions.js";
import type * as actions_seedAdmin from "../actions/seedAdmin.js";
import type * as actions_seedTestInvitation from "../actions/seedTestInvitation.js";
import type * as actions_sendAlerts from "../actions/sendAlerts.js";
import type * as actions_sendDailyReminder from "../actions/sendDailyReminder.js";
import type * as actions_sendMagicLinkEmail from "../actions/sendMagicLinkEmail.js";
import type * as actions_sendMigrationMagicLinks from "../actions/sendMigrationMagicLinks.js";
import type * as actions_sendMonthlySummary from "../actions/sendMonthlySummary.js";
import type * as actions_sendPushNotification from "../actions/sendPushNotification.js";
import type * as actions_sendResetPasswordEmail from "../actions/sendResetPasswordEmail.js";
import type * as actions_sendWeeklySummary from "../actions/sendWeeklySummary.js";
import type * as actions_sendWelcomeEmail from "../actions/sendWelcomeEmail.js";
import type * as admin from "../admin.js";
import type * as adminStats from "../adminStats.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as budgets from "../budgets.js";
import type * as cardBilling from "../cardBilling.js";
import type * as cardInstallments from "../cardInstallments.js";
import type * as cardPurchases from "../cardPurchases.js";
import type * as cards from "../cards.js";
import type * as categories from "../categories.js";
import type * as cronRuns from "../cronRuns.js";
import type * as crons from "../crons.js";
import type * as debtPayments from "../debtPayments.js";
import type * as debts from "../debts.js";
import type * as exchangeRates from "../exchangeRates.js";
import type * as exportData from "../exportData.js";
import type * as factoryReset from "../factoryReset.js";
import type * as goals from "../goals.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_cardBilling from "../lib/cardBilling.js";
import type * as lib_cardBudget from "../lib/cardBudget.js";
import type * as lib_cardHelpers from "../lib/cardHelpers.js";
import type * as lib_cardSchedule from "../lib/cardSchedule.js";
import type * as lib_cardStatement from "../lib/cardStatement.js";
import type * as lib_cronHeartbeat from "../lib/cronHeartbeat.js";
import type * as lib_cronJobs from "../lib/cronJobs.js";
import type * as lib_emailTemplates from "../lib/emailTemplates.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_recent from "../lib/recent.js";
import type * as lib_seedUserData from "../lib/seedUserData.js";
import type * as lib_transactionEffects from "../lib/transactionEffects.js";
import type * as lib_txClassification from "../lib/txClassification.js";
import type * as lib_userData from "../lib/userData.js";
import type * as lib_utils from "../lib/utils.js";
import type * as loanRepayments from "../loanRepayments.js";
import type * as loans from "../loans.js";
import type * as migrations from "../migrations.js";
import type * as netWorthSnapshots from "../netWorthSnapshots.js";
import type * as notifications from "../notifications.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as recurringTransactions from "../recurringTransactions.js";
import type * as reports from "../reports.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountShares: typeof accountShares;
  accounts: typeof accounts;
  "actions/adminUsers": typeof actions_adminUsers;
  "actions/deleteUserCascade": typeof actions_deleteUserCascade;
  "actions/exportMyData": typeof actions_exportMyData;
  "actions/fetchExchangeRates": typeof actions_fetchExchangeRates;
  "actions/processRecurringTransactions": typeof actions_processRecurringTransactions;
  "actions/seedAdmin": typeof actions_seedAdmin;
  "actions/seedTestInvitation": typeof actions_seedTestInvitation;
  "actions/sendAlerts": typeof actions_sendAlerts;
  "actions/sendDailyReminder": typeof actions_sendDailyReminder;
  "actions/sendMagicLinkEmail": typeof actions_sendMagicLinkEmail;
  "actions/sendMigrationMagicLinks": typeof actions_sendMigrationMagicLinks;
  "actions/sendMonthlySummary": typeof actions_sendMonthlySummary;
  "actions/sendPushNotification": typeof actions_sendPushNotification;
  "actions/sendResetPasswordEmail": typeof actions_sendResetPasswordEmail;
  "actions/sendWeeklySummary": typeof actions_sendWeeklySummary;
  "actions/sendWelcomeEmail": typeof actions_sendWelcomeEmail;
  admin: typeof admin;
  adminStats: typeof adminStats;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  budgets: typeof budgets;
  cardBilling: typeof cardBilling;
  cardInstallments: typeof cardInstallments;
  cardPurchases: typeof cardPurchases;
  cards: typeof cards;
  categories: typeof categories;
  cronRuns: typeof cronRuns;
  crons: typeof crons;
  debtPayments: typeof debtPayments;
  debts: typeof debts;
  exchangeRates: typeof exchangeRates;
  exportData: typeof exportData;
  factoryReset: typeof factoryReset;
  goals: typeof goals;
  http: typeof http;
  invitations: typeof invitations;
  "lib/auth": typeof lib_auth;
  "lib/cardBilling": typeof lib_cardBilling;
  "lib/cardBudget": typeof lib_cardBudget;
  "lib/cardHelpers": typeof lib_cardHelpers;
  "lib/cardSchedule": typeof lib_cardSchedule;
  "lib/cardStatement": typeof lib_cardStatement;
  "lib/cronHeartbeat": typeof lib_cronHeartbeat;
  "lib/cronJobs": typeof lib_cronJobs;
  "lib/emailTemplates": typeof lib_emailTemplates;
  "lib/money": typeof lib_money;
  "lib/notify": typeof lib_notify;
  "lib/permissions": typeof lib_permissions;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/recent": typeof lib_recent;
  "lib/seedUserData": typeof lib_seedUserData;
  "lib/transactionEffects": typeof lib_transactionEffects;
  "lib/txClassification": typeof lib_txClassification;
  "lib/userData": typeof lib_userData;
  "lib/utils": typeof lib_utils;
  loanRepayments: typeof loanRepayments;
  loans: typeof loans;
  migrations: typeof migrations;
  netWorthSnapshots: typeof netWorthSnapshots;
  notifications: typeof notifications;
  pushSubscriptions: typeof pushSubscriptions;
  recurringTransactions: typeof recurringTransactions;
  reports: typeof reports;
  transactions: typeof transactions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
