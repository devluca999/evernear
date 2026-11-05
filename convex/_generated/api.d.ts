/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as channels_email from "../channels/email.js";
import type * as channels_telegram from "../channels/telegram.js";
import type * as channels_verify from "../channels/verify.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as near_agentapi from "../near/agentapi.js";
import type * as near_approval from "../near/approval.js";
import type * as near_custody from "../near/custody.js";
import type * as near_deadline from "../near/deadline.js";
import type * as near_dockcheck from "../near/dockcheck.js";
import type * as near_ecdsa from "../near/ecdsa.js";
import type * as near_escrow from "../near/escrow.js";
import type * as near_escrowState from "../near/escrowState.js";
import type * as near_gmail from "../near/gmail.js";
import type * as near_http from "../near/http.js";
import type * as near_inference from "../near/inference.js";
import type * as proofs from "../proofs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "channels/email": typeof channels_email;
  "channels/telegram": typeof channels_telegram;
  "channels/verify": typeof channels_verify;
  http: typeof http;
  messages: typeof messages;
  "near/agentapi": typeof near_agentapi;
  "near/approval": typeof near_approval;
  "near/custody": typeof near_custody;
  "near/deadline": typeof near_deadline;
  "near/dockcheck": typeof near_dockcheck;
  "near/ecdsa": typeof near_ecdsa;
  "near/escrow": typeof near_escrow;
  "near/escrowState": typeof near_escrowState;
  "near/gmail": typeof near_gmail;
  "near/http": typeof near_http;
  "near/inference": typeof near_inference;
  proofs: typeof proofs;
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
