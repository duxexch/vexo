import type { Express, Response } from "express";
import { storage } from "../../storage";
import { authMiddleware, AuthRequest } from "../middleware";
import { sendNotification } from "../../websocket";
import { getErrorMessage } from "./helpers";
import { paymentIpGuard, paymentOperationTokenGuard } from "../../lib/payment-security";

/** POST pay, confirm — Trade payment actions */
export function registerTradePaymentRoutes(app: Express) {

  const notifyWithLog = async (
    recipientId: string,
    payload: Parameters<typeof sendNotification>[1],
    context: string,
  ) => {
    await sendNotification(recipientId, payload).catch((error: unknown) => {
      console.warn(`[P2P Trading] Notification failure (${context})`, {
        recipientId,
        error: getErrorMessage(error),
      });
    });
  };

  app.post(
    "/api/p2p/trades/:id/pay",
    authMiddleware,
    paymentIpGuard("p2p_trade_pay"),
    paymentOperationTokenGuard("p2p_trade_pay"),
    async (req: AuthRequest, res: Response) => {
      try {
        const { paymentReference } = req.body;

        const result = await storage.markP2PTradePaidAtomic(req.params.id, req.user!.id, paymentReference);
        if (!result.success) {
          const statusCode = result.error?.includes('not found') ? 404 :
            result.error?.includes('Only the buyer') ? 403 : 400;
          return res.status(statusCode).json({ error: result.error });
        }

        const trade = result.trade!;

        if (result.transitioned) {
          await storage.createP2PTradeMessage({
            tradeId: trade.id,
            senderId: req.user!.id,
            message: "Payment marked as sent",
            isSystemMessage: true,
          });

          // Notify seller that buyer marked payment
          const buyer = await storage.getUser(req.user!.id);
          await notifyWithLog(trade.sellerId, {
            type: 'p2p',
            priority: 'high',
            title: 'Payment Sent',
            titleAr: 'تم إرسال الدفع',
            message: `${buyer?.username || 'Buyer'} has marked payment as sent for trade #${trade.id.slice(0, 8)}. Please verify and confirm.`,
            messageAr: `قام ${buyer?.username || 'المشتري'} بتحديد الدفع كمرسل للصفقة #${trade.id.slice(0, 8)}. يرجى التحقق والتأكيد.`,
            link: '/p2p',
            metadata: JSON.stringify({ tradeId: trade.id, action: 'payment_sent' }),
          }, "trade-pay:seller");
        }

        res.json(trade);
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

        const result = await storage.confirmP2PTradePaymentAtomic(req.params.id, req.user!.id);
        if (!result.success) {
          const statusCode = result.error?.includes('not found') ? 404 :
            result.error?.includes('Only the seller') ? 403 : 400;
          return res.status(statusCode).json({ error: result.error });
        }

        const trade = result.trade!;

        if (result.transitioned) {
          await storage.createP2PTradeMessage({
            tradeId: trade.id,
            senderId: req.user!.id,
            message: "Payment confirmed",
            isSystemMessage: true,
          });

          // Notify buyer that seller confirmed payment
          const seller = await storage.getUser(req.user!.id);
          await notifyWithLog(trade.buyerId, {
            type: 'p2p',
            priority: 'high',
            title: 'Payment Confirmed',
            titleAr: 'تم تأكيد الدفع',
            message: `${seller?.username || 'Seller'} has confirmed receiving your payment for trade #${trade.id.slice(0, 8)}.`,
            messageAr: `قام ${seller?.username || 'البائع'} بتأكيد استلام دفعك للصفقة #${trade.id.slice(0, 8)}.`,
            link: '/p2p',
            metadata: JSON.stringify({ tradeId: trade.id, action: 'payment_confirmed' }),
          }, "trade-confirm:buyer");
        }

        res.json(trade);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    }
  );
}
