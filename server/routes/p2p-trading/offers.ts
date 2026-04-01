import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "./helpers";

function mapOfferForClient(offer: Record<string, unknown>, username: string) {
  const availableAmount = String(offer.availableAmount ?? offer.amount ?? '0');
  return {
    id: String(offer.id),
    userId: String(offer.userId),
    username,
    type: offer.type,
    amount: availableAmount,
    price: String(offer.price ?? '0'),
    currency: String(offer.cryptoCurrency ?? offer.currency ?? 'USD'),
    minLimit: String(offer.minLimit ?? '0'),
    maxLimit: String(offer.maxLimit ?? '0'),
    paymentMethods: (offer.paymentMethods as string[] | null) || [],
    rating: 5,
    completedTrades: Number(offer.completedTrades || 0),
    status: offer.status,
    createdAt: offer.createdAt,
  };
}

/** GET /api/p2p/offers, POST /api/p2p/offers, GET /api/p2p/my-offers, DELETE /api/p2p/offers/:id */
export function registerOfferRoutes(app: Express) {

  app.get("/api/p2p/offers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { type, currency, payment } = req.query;

      const offers = await storage.getActiveP2POffers({
        type: type ? String(type) : undefined,
        currency: currency ? String(currency) : undefined,
        payment: payment ? String(payment) : undefined,
      });

      const users = await Promise.all(offers.map((offer) => storage.getUser(offer.userId)));
      const mapped = offers.map((offer, index) => mapOfferForClient(offer as unknown as Record<string, unknown>, users[index]?.username || 'Unknown'));
      res.json(mapped);
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

      const created = await storage.createP2POffer({
        userId: req.user!.id,
        type,
        status: 'active',
        cryptoCurrency: String(currency).toUpperCase(),
        fiatCurrency: 'USD',
        price: parsedPrice.toFixed(2),
        availableAmount: parsedAmount.toFixed(8),
        minLimit: parsedMinLimit.toFixed(2),
        maxLimit: parsedMaxLimit.toFixed(2),
        paymentMethods: Array.isArray(paymentMethods) ? paymentMethods : [paymentMethods],
      });

      res.status(201).json(mapOfferForClient(created as unknown as Record<string, unknown>, user?.username || 'Unknown'));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/p2p/my-offers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const myOffers = await storage.getUserP2POffers(req.user!.id);
      const username = req.user!.username || (await storage.getUser(req.user!.id))?.username || 'Unknown';
      res.json(myOffers.map((offer) => mapOfferForClient(offer as unknown as Record<string, unknown>, username)));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/p2p/offers/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const cancelled = await storage.cancelP2POfferByOwner(req.params.id, req.user!.id);
      if (!cancelled) {
        return res.status(404).json({ error: "Offer not found" });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
