export {
  getP2PTrade,
  getUserP2PTrades,
  getP2PTradeMessages,
  getP2PTraderRatings,
  getP2PTraderMetrics,
  getP2POffer,
  getActiveP2POffers,
  getPendingP2POfferNegotiation,
  getP2POfferNegotiation,
  getUserP2POffers,
  listP2POfferNegotiations,
  listP2POfferNegotiationsForOffer,
} from "./crud";

import {
  createP2PTrade as createP2PTradeImpl,
  updateP2PTrade as updateP2PTradeImpl,
  createP2PTradeMessage as createP2PTradeMessageImpl,
  createP2PTraderRating as createP2PTraderRatingImpl,
  updateP2PTraderMetrics as updateP2PTraderMetricsImpl,
  createP2POffer as createP2POfferImpl,
  createP2POfferNegotiation as createP2POfferNegotiationImpl,
  updateP2POfferNegotiation as updateP2POfferNegotiationImpl,
  updateP2POffer as updateP2POfferImpl,
  cancelP2POfferByOwner as cancelP2POfferByOwnerImpl,
} from "./crud";
import { createP2PTradeAtomic as createP2PTradeAtomicImpl } from "./trade-create-atomic";
import {
  markP2PTradePaidAtomic as markP2PTradePaidAtomicImpl,
  confirmP2PTradePaymentAtomic as confirmP2PTradePaymentAtomicImpl,
} from "./trade-payment-atomic";
import {
  completeP2PTradeAtomic as completeP2PTradeAtomicImpl,
  cancelP2PTradeAtomic as cancelP2PTradeAtomicImpl,
  resolveP2PDisputedTradeAtomic as resolveP2PDisputedTradeAtomicImpl,
} from "./trade-settle-atomic";
import {
  createP2PTradeProjectCurrencyAtomic as createP2PTradeProjectCurrencyAtomicImpl,
} from "./atomic-project-create";
import {
  completeP2PTradeProjectCurrencyAtomic as completeP2PTradeProjectCurrencyAtomicImpl,
} from "./atomic-project-complete";
import {
  cancelP2PTradeProjectCurrencyAtomic as cancelP2PTradeProjectCurrencyAtomicImpl,
} from "./atomic-project-cancel";
import {
  resolveP2PDisputedTradeProjectCurrencyAtomic as resolveP2PDisputedTradeProjectCurrencyAtomicImpl,
} from "./atomic-project-resolve";
import {
  appendP2PTradeLedgerLog as appendP2PTradeLedgerLogImpl,
  createP2PLedgerEntry as createP2PLedgerEntryImpl,
  createP2PTradeStateEvent as createP2PTradeStateEventImpl,
  buildP2PTradeProjection,
} from "./ledger";
import { assertP2POrchestratedAccess, forbidDirectLedgerAccess } from "./runtime";

function requireOrchestratedWrite(): void {
  assertP2POrchestratedAccess("ledger.batch.write");
}

export const createP2PTrade = (...args: Parameters<typeof createP2PTradeImpl>) => {
  requireOrchestratedWrite();
  return createP2PTradeImpl(...args);
};

export const updateP2PTrade = (...args: Parameters<typeof updateP2PTradeImpl>) => {
  requireOrchestratedWrite();
  return updateP2PTradeImpl(...args);
};

export const createP2PTradeMessage = (...args: Parameters<typeof createP2PTradeMessageImpl>) => {
  requireOrchestratedWrite();
  return createP2PTradeMessageImpl(...args);
};

export const createP2PTraderRating = (...args: Parameters<typeof createP2PTraderRatingImpl>) => {
  requireOrchestratedWrite();
  return createP2PTraderRatingImpl(...args);
};

export const updateP2PTraderMetrics = (...args: Parameters<typeof updateP2PTraderMetricsImpl>) => {
  requireOrchestratedWrite();
  return updateP2PTraderMetricsImpl(...args);
};

export const createP2POffer = (...args: Parameters<typeof createP2POfferImpl>) => {
  requireOrchestratedWrite();
  return createP2POfferImpl(...args);
};

export const createP2POfferNegotiation = (...args: Parameters<typeof createP2POfferNegotiationImpl>) => {
  requireOrchestratedWrite();
  return createP2POfferNegotiationImpl(...args);
};

export const updateP2POfferNegotiation = (...args: Parameters<typeof updateP2POfferNegotiationImpl>) => {
  requireOrchestratedWrite();
  return updateP2POfferNegotiationImpl(...args);
};

export const updateP2POffer = (...args: Parameters<typeof updateP2POfferImpl>) => {
  requireOrchestratedWrite();
  return updateP2POfferImpl(...args);
};

export const cancelP2POfferByOwner = (...args: Parameters<typeof cancelP2POfferByOwnerImpl>) => {
  requireOrchestratedWrite();
  return cancelP2POfferByOwnerImpl(...args);
};

export const createP2PTradeAtomic = (...args: Parameters<typeof createP2PTradeAtomicImpl>) => {
  requireOrchestratedWrite();
  return createP2PTradeAtomicImpl(...args);
};

export const markP2PTradePaidAtomic = (...args: Parameters<typeof markP2PTradePaidAtomicImpl>) => {
  requireOrchestratedWrite();
  return markP2PTradePaidAtomicImpl(...args);
};

export const confirmP2PTradePaymentAtomic = (...args: Parameters<typeof confirmP2PTradePaymentAtomicImpl>) => {
  requireOrchestratedWrite();
  return confirmP2PTradePaymentAtomicImpl(...args);
};

export const completeP2PTradeAtomic = (...args: Parameters<typeof completeP2PTradeAtomicImpl>) => {
  requireOrchestratedWrite();
  return completeP2PTradeAtomicImpl(...args);
};

export const cancelP2PTradeAtomic = (...args: Parameters<typeof cancelP2PTradeAtomicImpl>) => {
  requireOrchestratedWrite();
  return cancelP2PTradeAtomicImpl(...args);
};

export const resolveP2PDisputedTradeAtomic = (...args: Parameters<typeof resolveP2PDisputedTradeAtomicImpl>) => {
  requireOrchestratedWrite();
  return resolveP2PDisputedTradeAtomicImpl(...args);
};

export const createP2PTradeProjectCurrencyAtomic = (...args: Parameters<typeof createP2PTradeProjectCurrencyAtomicImpl>) => {
  requireOrchestratedWrite();
  return createP2PTradeProjectCurrencyAtomicImpl(...args);
};

export const completeP2PTradeProjectCurrencyAtomic = (...args: Parameters<typeof completeP2PTradeProjectCurrencyAtomicImpl>) => {
  requireOrchestratedWrite();
  return completeP2PTradeProjectCurrencyAtomicImpl(...args);
};

export const cancelP2PTradeProjectCurrencyAtomic = (...args: Parameters<typeof cancelP2PTradeProjectCurrencyAtomicImpl>) => {
  requireOrchestratedWrite();
  return cancelP2PTradeProjectCurrencyAtomicImpl(...args);
};

export const resolveP2PDisputedTradeProjectCurrencyAtomic = (...args: Parameters<typeof resolveP2PDisputedTradeProjectCurrencyAtomicImpl>) => {
  requireOrchestratedWrite();
  return resolveP2PDisputedTradeProjectCurrencyAtomicImpl(...args);
};

export const appendP2PTradeLedgerLog = (...args: Parameters<typeof appendP2PTradeLedgerLogImpl>) => {
  requireOrchestratedWrite();
  return appendP2PTradeLedgerLogImpl(...args);
};

export const createP2PLedgerEntry = (...args: Parameters<typeof createP2PLedgerEntryImpl>) => {
  forbidDirectLedgerAccess();
  return createP2PLedgerEntryImpl(...args);
};

export const createP2PTradeStateEvent = (...args: Parameters<typeof createP2PTradeStateEventImpl>) => {
  requireOrchestratedWrite();
  return createP2PTradeStateEventImpl(...args);
};
