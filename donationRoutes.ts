
import { Router } from "express";
import axios from "axios";
import { ObjectId } from "mongodb";

export default function donationRoutes(db: any) {
    const router = Router();

    const helpCategories = db.collection("helpCategories");
    const donations = db.collection("donations");
    const payments = db.collection("payments");

    const sslBaseUrl = process.env.SSL_BASE_URL;

    router.post("/donations", async (req: any, res: any) => {
        try {
            const { name, category, purpose, amount, email, phone } = req.body;
            const donationAmount = Number(amount);

            if (!name || !category || !amount || !email || !phone) {
                return res.status(400).json({ message: "All required fields are needed" });
            }

            if (!Number.isFinite(donationAmount) || donationAmount < 10 || donationAmount > 500000) {
                return res.status(400).json({ message: "Invalid donation amount" });
            }

            if (!ObjectId.isValid(category)) {
                return res.status(400).json({ message: "Invalid category ID" });
            }

            const categoryInfo = await helpCategories.findOne({
                _id: new ObjectId(category),
            });

            if (!categoryInfo) {
                return res.status(404).json({ message: "Category not found" });
            }

            const storeId = process.env.SSL_STORE_ID;
            const storePassword = process.env.SSL_STORE_PASSWORD;
            const serverUrl = process.env.SERVER_URL;

            if (!sslBaseUrl || !storeId || !storePassword || !serverUrl) {
                return res.status(500).json({ message: "Payment configuration is missing" });
            }

            const tranId = `CB-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            const now = new Date();

            const donation = await donations.insertOne({
                name,
                category,
                purpose: purpose || "",
                amount: donationAmount,
                email,
                phone,
                createdAt: now,
            });

            await payments.insertOne({
                donationId: donation.insertedId,
                tranId,
                amount: donationAmount,
                currency: "BDT",
                status: "PENDING",
                paymentMethod: null,
                valId: null,
                bankTranId: null,
                createdAt: now,
                updatedAt: now,
            });

            const paymentData = new URLSearchParams({
                store_id: storeId,
                store_passwd: storePassword,
                total_amount: donationAmount.toFixed(2),
                currency: "BDT",
                tran_id: tranId,
                success_url: `${serverUrl}/payment/success`,
                fail_url: `${serverUrl}/payment/fail`,
                cancel_url: `${serverUrl}/payment/cancel`,
                ipn_url: `${serverUrl}/payment/ipn`,
                cus_name: name,
                cus_email: email,
                cus_phone: phone,
                cus_add1: "Bangladesh",
                cus_city: "Sylhet",
                cus_postcode: "3100",
                cus_country: "Bangladesh",
                shipping_method: "NO",
                product_name: "Donation",
                product_category: "Donation",
                product_profile: "non-physical-goods",
            });

            const response = await axios.post(
                `${sslBaseUrl}/gwprocess/v4/api.php`,
                paymentData,
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }
            );

            if (response.data.status !== "SUCCESS" || !response.data.GatewayPageURL) {
                await payments.updateOne(
                    { tranId },
                    { $set: { status: "INITIATION_FAILED", updatedAt: new Date() } }
                );

                return res.status(400).json({ message: "Payment session creation failed" });
            }

            await payments.updateOne(
                { tranId },
                {
                    $set: {
                        gatewayUrl: response.data.GatewayPageURL,
                        sessionKey: response.data.sessionkey,
                        updatedAt: new Date(),
                    },
                }
            );

            res.status(201).json({
                success: true,
                message: "Payment session created",
                donationId: donation.insertedId,
                tranId,
                gatewayUrl: response.data.GatewayPageURL,
            });

        } catch (error) {
            console.error("Donation error:", error);
            res.status(500).json({ message: "Failed to process donation" });
        }
    });

    const validatePayment = async (tranId: string, valId: string) => {
        const payment = await payments.findOne({ tranId });

        if (!payment) return null;

        const response = await axios.get(
            `${sslBaseUrl}/validator/api/validationserverAPI.php`,
            {
                params: {
                    val_id: valId,
                    store_id: process.env.SSL_STORE_ID,
                    store_passwd: process.env.SSL_STORE_PASSWORD,
                    format: "json",
                },
            }
        );

        const data = response.data;

        if (
            !["VALID", "VALIDATED"].includes(data.status) ||
            data.tran_id !== tranId ||
            Number(data.amount) !== Number(payment.amount) ||
            String(data.currency).toUpperCase() !== "BDT"
        ) {
            return null;
        }

        return { payment, data };
    };

    router.post("/payment/success", async (req: any, res: any) => {
        try {
            const { tran_id, val_id } = req.body;

            if (!tran_id || !val_id) {
                return res.status(400).json({ message: "Invalid payment information" });
            }

            const result = await validatePayment(tran_id, val_id);

            if (!result) {
                return res.status(400).json({ message: "Payment validation failed" });
            }

            const { data } = result;

            const update = await payments.updateOne(
                { tranId: tran_id, status: "PENDING" },
                {
                    $set: {
                        status: "SUCCESS",
                        paymentMethod: data.card_type,
                        valId: val_id,
                        bankTranId: data.bank_tran_id,
                        updatedAt: new Date(),
                    },
                }
            );

            res.json({
                success: true,
                message: update.modifiedCount ? "Payment successful" : "Payment already processed",
                tranId: tran_id,
            });

        } catch (error) {
            console.error("Payment success error:", error);
            res.status(500).json({ message: "Payment validation failed" });
        }
    });

    const updatePaymentStatus = async (req: any, res: any, status: string) => {
        try {
            const { tran_id } = req.body;

            if (!tran_id) {
                return res.status(400).json({ message: "Invalid transaction ID" });
            }

            const result = await payments.updateOne(
                { tranId: tran_id, status: "PENDING" },
                { $set: { status, updatedAt: new Date() } }
            );

            res.json({
                success: true,
                message: result.modifiedCount
                    ? `Payment marked as ${status.toLowerCase()}`
                    : "Payment already processed or not found",
            });

        } catch (error) {
            console.error("Payment status update error:", error);
            res.status(500).json({ message: "Payment status update failed" });
        }
    };

    router.post("/payment/fail", (req: any, res: any) =>
        updatePaymentStatus(req, res, "FAILED")
    );

    router.post("/payment/cancel", (req: any, res: any) =>
        updatePaymentStatus(req, res, "CANCELLED")
    );

    router.post("/payment/ipn", async (req: any, res: any) => {
        try {
            const { tran_id, val_id } = req.body;

            if (!tran_id || !val_id) {
                return res.status(400).json({ message: "Invalid payment information" });
            }

            const result = await validatePayment(tran_id, val_id);

            if (!result) {
                return res.status(400).json({ message: "Payment verification failed" });
            }

            const { data } = result;

            await payments.updateOne(
                { tranId: tran_id, status: "PENDING" },
                {
                    $set: {
                        status: "SUCCESS",
                        paymentMethod: data.card_type,
                        valId: val_id,
                        bankTranId: data.bank_tran_id,
                        updatedAt: new Date(),
                    },
                }
            );

            res.json({ success: true, message: "IPN received and payment verified" });

        } catch (error) {
            console.error("IPN error:", error);
            res.status(500).json({ message: "IPN processing failed" });
        }
    });

    return router;
}
