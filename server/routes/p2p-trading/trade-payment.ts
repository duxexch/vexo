import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "./helpers";
import { paymentIpGuard, paymentOperationTokenGuard } from "../../lib/payment-security";

/** POST pay, confirm — Trade payment actions */
export function registerTradePaymentRoutes(app: Express) {

  app.post(
    "/api/p2p/trades/:id/pay",
    authMiddleware,
    paymentIpGuard("p2p_trade_pay"),
    paymentOperationTokenGuard("p2p_trade_pay"),
    async (req: AuthRequest, res: Response) => {
      try {
        const trade = await storage.getP2PTrade(req.params.id);
        if (!trade) {
          return res.status(404).json({ error: "Trade not found" });
        }

        if (trade.buyerId !== req.user!.id) {
          return res.status(403).json({ error: "Only the buyer can mark payment" });
        }

        if (trade.status !== "pending") {
          return res.status(400).json({ error: "Trade is not in pending status" });
        }

        const { paymentReference } = req.body;

        const updated = await storage.updateP2PTrade(trade.id, {
          status: "paid",
          paymentReference,
          paidAt: new Date(),
        });

        await storage.createP2PTradeMessage({
          tradeId: trade.id,
          senderId: req.user!.id,
          message: "Payment marked as sent",
          isSystemMessage: true,
        });

        // Notify seller that buyer marked payment
        const buyer = await storage.getUser(req.user!.id);
        await sendNotification(trade.sellerId, {
          type: 'p2p',
          priority: 'high',
          title: 'Payment Sent',
          titleAr: 'تم إرسال الدفع',
          message: `${buyer?.username || 'Buyer'} has marked payment as sent for trade #${trade.id.slice(0, 8)}. Please verify and confirm.`,
          messageAr: `قام ${buyer?.username || 'المشتري'} بتحديد الدفع كمرسل للصفقة #${trade.id.slice(0, 8)}. يرجى التحقق والتأكيد.`,
          link: '/p2p',
          metadata: JSON.stringify({ tradeId: trade.id, action: 'payment_sent' }),
        }).catch(() => { });

        res.json(updated);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    }
  );

  app.post(
    "/api/p2p/trades/:id/confirm",
    authMiddleware,
    paymentIpGuard("p2p_trade_confirm"),
    paymentOperationTokenGuard("p2p_trade_confirm"),
    async (req: AuthRequest, res: Response) => {
      try {
        const trade = await storage.getP2PTrade(req.params.id);
        if (!trade) {
          return res.status(404).json({ error: "Trade not found" });
        }

        if (trade.sellerId !== req.user!.id) {
          return res.status(403).json({ error: "Only the seller can confirm payment" });
        }

        if (trade.status !== "paid") {
          return res.status(400).json({ error: "Trade payment not marked yet" });
        }

        const updated = await storage.updateP2PTrade(trade.id, {
          status: "confirmed",
          confirmedAt: new Date(),
        });

        await storage.createP2PTradeMessage({
          tradeId: trade.id,
          senderId: req.user!.id,
          message: "Payment confirmed",
          isSystemMessage: true,
        });

        // Notify buyer that seller confirmed payment
        const seller = await storage.getUser(req.user!.id);
        await sendNotification(trade.buyerId, {
          type: 'p2p',
          priority: 'high',
          title: 'Payment Confirmed',
          titleAr: 'تم تأكيد الدفع',
          message: `${seller?.username || 'Seller'} has confirmed receiving your payment for trade #${trade.id.slice(0, 8)}.`,
          messageAr: `قام ${seller?.username || 'البائع'} بتأكيد استلام دفعك للصفقة #${trade.id.slice(0, 8)}.`,
          link: '/p2p',
          metadata: JSON.stringify({ tradeId: trade.id, action: 'payment_confirmed' }),
        }).catch(() => { });

        res.json(updated);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    }
  );
}
