"use node";

import { createClerkClient } from "@clerk/backend";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { requireEnv } from "./lib/env";
import { appError } from "./lib/errors";
import { FEATURES, isPlanId, PLANS, type Feature, type PlanId } from "./shared/credits";

/** Clerk is authoritative; clients cannot supply a plan, features, allowance or billing period. */
export const refresh = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Sign in to refresh your subscription.");
    await refreshUserSubscription(ctx, identity.subject);
    return null;
  },
});

export const refreshForAgent = action({
  args: { serviceKey: v.string(), clerkUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runQuery(api.agent.getContext, args);
    await refreshUserSubscription(ctx, args.clerkUserId);
    return null;
  },
});

export const refreshForJob = internalAction({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const clerkUserId = await ctx.runQuery(internal.credits.billingRefreshOwnerForJob, { jobId });
    if (clerkUserId) await refreshUserSubscription(ctx, clerkUserId);
    return null;
  },
});

function clerkErrorCodes(error: unknown): string[] {
  if (typeof error !== "object" || error === null || !("errors" in error) || !Array.isArray(error.errors)) {
    return [];
  }
  return error.errors.flatMap((item) => {
    if (typeof item !== "object" || item === null || !("code" in item) || typeof item.code !== "string") return [];
    return [item.code];
  });
}

function clerkErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error) || typeof error.status !== "number") {
    return undefined;
  }
  return error.status;
}

function clerkErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function clerkSecretCanReadUser(
  clerk: ReturnType<typeof createClerkClient>,
  clerkUserId: string,
): Promise<boolean> {
  try {
    await clerk.users.getUser(clerkUserId);
    return true;
  } catch {
    return false;
  }
}

/** No paid plan, no payer yet, or Billing not enabled — all map to the free tier. */
function isAbsentClerkSubscription(error: unknown): boolean {
  const status = clerkErrorStatus(error);
  const codes = clerkErrorCodes(error);
  const text = clerkErrorText(error).toLowerCase();
  return (
    status === 404 ||
    codes.includes("resource_not_found") ||
    codes.includes("not_found") ||
    codes.includes("subscription_not_found") ||
    codes.includes("feature_not_enabled") ||
    (text.includes("billing") && (text.includes("not enabled") || text.includes("disabled")))
  );
}

async function refreshUserSubscription(ctx: ActionCtx, clerkUserId: string): Promise<void> {
  const readStartedAt = Date.now();
  const clerk = createClerkClient({ secretKey: requireEnv("CLERK_SECRET_KEY") });
  let subscription;
  try {
    subscription = await clerk.billing.getUserBillingSubscription(clerkUserId);
  } catch (error) {
    if (isAbsentClerkSubscription(error) || (await clerkSecretCanReadUser(clerk, clerkUserId))) {
      console.warn("Clerk billing returned no paid subscription; treating as free.", clerkErrorText(error));
      await ctx.runMutation(internal.credits.reconcileSubscription, {
        clerkUserId,
        readStartedAt,
        plan: "free",
        features: [],
      });
      return;
    }
    const status = clerkErrorStatus(error);
    if (status === 401 || status === 403) {
      throw appError(
        "UPSTREAM_FAILED",
        "Convex CLERK_SECRET_KEY does not match this Clerk app. Set the same secret on the Convex deployment.",
      );
    }
    console.error("Clerk billing.getUserBillingSubscription failed", error);
    throw appError("UPSTREAM_FAILED", "Clerk could not confirm your subscription. Please try again.");
  }
  const now = Date.now();
  const current = subscription.subscriptionItems
    .filter((item) => {
      const slug = item.plan?.slug;
      return (
        slug !== undefined &&
        isPlanId(slug) &&
        slug !== "free" &&
        (item.status === "active" || item.status === "canceled") &&
        item.periodStart <= now &&
        (item.periodEnd === null || item.periodEnd > now)
      );
    })
    .sort((a, b) => {
      const aSlug = a.plan?.slug;
      const bSlug = b.plan?.slug;
      const aPrice = aSlug && isPlanId(aSlug) ? PLANS[aSlug].priceUsd : 0;
      const bPrice = bSlug && isPlanId(bSlug) ? PLANS[bSlug].priceUsd : 0;
      return bPrice - aPrice || b.periodStart - a.periodStart;
    })[0];
  const slug = current?.plan?.slug;
  const plan: PlanId = slug && isPlanId(slug) ? slug : "free";
  if (current && (!current.periodEnd || !Number.isFinite(current.periodStart))) {
    throw appError("UPSTREAM_FAILED", "Clerk returned an incomplete billing period. Please try again.");
  }
  const features: Feature[] = (current?.plan?.features ?? [])
    .map((feature) => feature.slug)
    .filter((feature): feature is Feature => FEATURES.some((known) => known === feature));
  await ctx.runMutation(internal.credits.reconcileSubscription, {
    clerkUserId,
    readStartedAt,
    plan,
    features,
    ...(current ? { periodStart: current.periodStart, periodEnd: current.periodEnd ?? undefined } : {}),
  });
}
