"use server";

import {
  deleteCostSession,
  listCostSessions,
  type CostSession,
} from "./session-store";
import { currentUserId } from "./current-user";

export async function getCostSessions(day: string): Promise<CostSession[]> {
  return listCostSessions(await currentUserId(), day);
}

export async function removeCostSession(id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid session id");
  await deleteCostSession(await currentUserId(), id);
}
