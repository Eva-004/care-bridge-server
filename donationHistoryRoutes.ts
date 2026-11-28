import { Router, Request, Response } from "express";

const donationHistoryRoutes = (db: any) => {
    const router = Router();

    router.get("/donationHistory", async (req: Request, res: Response) => {
        try {
            const history = await db
                .collection("donationHistory")
                .find({})
                .sort({ createdAt: -1 })
                .toArray();

            return res.status(200).json(history);
        } catch (error) {
            console.error("Donation history error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch donation history",
            });
        }
    });

    router.get("/myDonationHistory/:userId", async (req: Request, res: Response) => {
        try {
            const { userId } = req.params;

            const history = await db
                .collection("donationHistory")
                .find({ userId })
                .sort({ createdAt: -1 })
                .toArray();

            return res.status(200).json(history);
        } catch (error) {
            console.error("My donation history error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch donation history",
            });
        }
    });

    return router;
};

export default donationHistoryRoutes;