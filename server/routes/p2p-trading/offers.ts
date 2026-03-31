import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage, userP2POffers } from "./helpers";

/** GET /api/p2p/offers, POST /api/p2p/offers, GET /api/p2p/my-offers, DELETE /api/p2p/offers/:id */
export function registerOfferRoutes(app: Express) {

  app.get("/api/p2p/offers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { type, currency, payment } = req.query;
      
      // Try DB first, fallback to in-memory
      let offers: Record<string, unknown>[] = [];
      try {
        const dbOffers = await (storage as unknown as { getActiveP2POffers?: () => Promise<unknown[]> }).getActiveP2POffers?.();
        if (dbOffers && dbOffers.length > 0) {
          offers = dbOffers as Record<string, unknown>[];
        } else {
          offers = [...userP2POffers.filter(o => o.status === "active")];
        }
      } catch {
        offers = [...userP2POffers.filter(o => o.status === "active")];
      }
      
      if (type && type !== "all") {
        offers = offers.filter(o => o.type === type);
      }
      if (currency && currency !== "all") {
        offers = offers.filter(o => o.currency === currency);
      }
      if (payment && payment !== "all") {
        offers = offers.filter(o => (o.paymentMethods as string[] | undefined)?.includes(payment as string));
      }
      
      res.json(offers);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/p2p/offers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { type, amount, price, currency, minLimit, maxLimit, paymentMethods } = req.body;
      
      // Validate type
      if (!type || !['buy', 'sell'].includes(type)) {
        return res.status(400).json({ error: "Type must be 'buy' or 'sell'" });
      }
      
      // Validate amounts
      const parsedAmount = parseFloat(amount);
      const parsedPrice = parseFloat(price);
      const parsedMinLimit = parseFloat(minLimit);
      const parsedMaxLimit = parseFloat(maxLimit);
      
      if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 1000000) {
        return res.status(400).json({ error: "Amount must be a positive number up to 1,000,000" });
      }
      if (isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 100000) {
        return res.status(400).json({ error: "Price must be a positive number" });
      }
      if (isNaN(parsedMinLimit) || parsedMinLimit <= 0) {
        return res.status(400).json({ error: "Min limit must be a positive number" });
      }
      if (isNaN(parsedMaxLimit) || parsedMaxLimit <= 0 || parsedMaxLimit < parsedMinLimit) {
        return res.status(400).json({ error: "Max limit must be >= min limit" });
      }
      if (parsedMaxLimit > parsedAmount) {
        return res.status(400).json({ error: "Max limit cannot exceed total amount" });
      }
      
      // Validate currency
      const allowedCurrencies = ['USD', 'USDT', 'EUR', 'GBP', 'SAR', 'AED', 'EGP'];
      if (!currency || !allowedCurrencies.includes(String(currency).toUpperCase())) {
        return res.status(400).json({ error: `Currency must be one of: ${allowedCurrencies.join(', ')}` });
      }
      
      // Validate payment methods
      if (!paymentMethods || (Array.isArray(paymentMethods) && paymentMethods.length === 0)) {
        return res.status(400).json({ error: "At least one payment method is required" });
      }
      
      const user = await storage.getUser(req.user!.id);
      
      const newOffer = {
        id: `p2p-offer-${Date.now()}`,
        userId: req.user!.id,
        username: user?.username || "Unknown",
        type,
        amount,
        price,
        currency,
        minLimit,
        maxLimit,
        paymentMethods: Array.isArray(paymentMethods) ? paymentMethods : [paymentMethods],
        rating: 5.0,
        completedTrades: 0,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      
      userP2POffers.push(newOffer);
      res.status(201).json(newOffer);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/my-offers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const myOffers = userP2POffers.filter(o => o.userId === req.user!.id);
      res.json(myOffers);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/p2p/offers/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const index = userP2POffers.findIndex(o => o.id === req.params.id && o.userId === req.user!.id);
      if (index === -1) {
        return res.status(404).json({ error: "Offer not found" });
      }
      userP2POffers.splice(index, 1);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
