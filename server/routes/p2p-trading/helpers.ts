import { db } from "../../db";
import { p2pSettings } from "@shared/schema";

/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function calculateP2PFee(tradeAmount: number): Promise<number> {
  const [settings] = await db.select().from(p2pSettings).limit(1);
  if (!settings) {
    return tradeAmount * 0.005;
  }
  
  let fee = 0;
  const percentageRate = parseFloat(settings.platformFeePercentage);
  const fixedAmount = parseFloat(settings.platformFeeFixed);
  const minFee = parseFloat(settings.minFee);
  const maxFee = settings.maxFee ? parseFloat(settings.maxFee) : null;
  
  switch (settings.feeType) {
    case "percentage":
      fee = tradeAmount * percentageRate;
      break;
    case "fixed":
      fee = fixedAmount;
      break;
    case "hybrid":
      fee = (tradeAmount * percentageRate) + fixedAmount;
      break;
    default:
      fee = tradeAmount * 0.005;
  }
  
  if (fee < minFee) fee = minFee;
  if (maxFee !== null && fee > maxFee) fee = maxFee;
  
  return fee;
}

/** In-memory storage — used only when DB offers don't exist yet */
export const userP2POffers: Record<string, unknown>[] = [];
export const userP2PTrades: Record<string, unknown>[] = [];
