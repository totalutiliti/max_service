export type ContextualAdStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "paused"
  | "ended";

export type ContextualAdAction = "approve" | "reject" | "pause" | "activate";

export function contextualAdMatches(input: {
  targetCategoryId: string | null;
  targetRegionId: string | null;
  contextCategoryId: string;
  contextRegionId: string;
}) {
  return (!input.targetCategoryId || input.targetCategoryId === input.contextCategoryId)
    && (!input.targetRegionId || input.targetRegionId === input.contextRegionId);
}

export function contextualAdNextStatus(
  current: ContextualAdStatus,
  action: ContextualAdAction,
): ContextualAdStatus | null {
  if (current === "pending_review" && action === "approve") return "approved";
  if (current === "pending_review" && action === "reject") return "rejected";
  if (current === "approved" && action === "pause") return "paused";
  if (current === "paused" && action === "activate") return "approved";
  return null;
}

export function contextualAdSpecificity(input: {
  targetCategoryId: string | null;
  targetRegionId: string | null;
}) {
  return Number(Boolean(input.targetCategoryId)) + Number(Boolean(input.targetRegionId));
}
