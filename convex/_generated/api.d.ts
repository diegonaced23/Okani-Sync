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
import type * as actions_fetchExchangeRates from "../actions/fetchExchangeRates.js";
import type * as actions_processRecurringTransactions from "../actions/processRecurringTransactions.js";
import type * as actions_seedAdmin from "../actions/seedAdmin.js";
import type * as actions_sendAlerts from "../actions/sendAlerts.js";
import type * as actions_sendPushNotification from "../actions/sendPushNotification.js";
import type * as actions_sendWelcomeEmail from "../actions/sendWelcomeEmail.js";
import type * as auditLogs from "../auditLogs.js";
import type * as budgets from "../budgets.js";
import type * as cardInstallments from "../cardInstallments.js";
import type * as cardPurchases from "../cardPurchases.js";
import type * as cards from "../cards.js";
import type * as categories from "../categories.js";
import type * as crons from "../crons.js";
import type * as debtPayments from "../debtPayments.js";
import type * as debts from "../debts.js";
import type * as exchangeRates from "../exchangeRates.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_clerkApi from "../lib/clerkApi.js";
import type * as lib_emailTemplates from "../lib/emailTemplates.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_utils from "../lib/utils.js";
import type * as notifications from "../notifications.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as recurringTransactions from "../recurringTransactions.js";
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
  "actions/fetchExchangeRates": typeof actions_fetchExchangeRates;
  "actions/processRecurringTransactions": typeof actions_processRecurringTransactions;
  "actions/seedAdmin": typeof actions_seedAdmin;
  "actions/sendAlerts": typeof actions_sendAlerts;
  "actions/sendPushNotification": typeof actions_sendPushNotification;
  "actions/sendWelcomeEmail": typeof actions_sendWelcomeEmail;
  auditLogs: typeof auditLogs;
  budgets: typeof budgets;
  cardInstallments: typeof cardInstallments;
  cardPurchases: typeof cardPurchases;
  cards: typeof cards;
  categories: typeof categories;
  crons: typeof crons;
  debtPayments: typeof debtPayments;
  debts: typeof debts;
  exchangeRates: typeof exchangeRates;
  http: typeof http;
  invitations: typeof invitations;
  "lib/auth": typeof lib_auth;
  "lib/clerkApi": typeof lib_clerkApi;
  "lib/emailTemplates": typeof lib_emailTemplates;
  "lib/money": typeof lib_money;
  "lib/permissions": typeof lib_permissions;
  "lib/utils": typeof lib_utils;
  notifications: typeof notifications;
  pushSubscriptions: typeof pushSubscriptions;
  recurringTransactions: typeof recurringTransactions;
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

export declare const components: {};
