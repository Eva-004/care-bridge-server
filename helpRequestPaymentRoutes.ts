
import { Router, Request, Response } from "express";
import confirmHelpRequestPayment from "./helpRequestPaymentService";

const helpRequestPaymentRoutes = (db: any) => {
    const router = Router();

    router.post(
        "/helpRequestPayments/confirm",
        async (req: Request, res: Response) => {
            try {
                const {
                    requestId,
                    transactionId,
                    senderNumber,
                    adminId,
                } = req.body;

                if (!requestId || !transactionId || !senderNumber || !adminId) {
                    return res.status(400).json({
                        success: false,
                        message: "All payment information is required",
                    });
                }

                const payment = await confirmHelpRequestPayment(db, {
                    requestId,
                    transactionId,
                    senderNumber,
                    adminId,
                });

                return res.status(200).json({
                    success: true,
                    message: "Payment confirmed successfully",
                    payment,
                });
            } catch (error: any) {
                return res.status(400).json({
                    success: false,
                    message: error.message || "Failed to confirm payment",
                });
            }
        }
    );

    return router;
};

export default helpRequestPaymentRoutes;
