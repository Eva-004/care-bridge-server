
import express, { Request, Response } from "express";
import { Db, ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import { campaignEmail } from "./campaignEmail";


const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

transporter.verify()
    .then(() => console.log("Email server is ready"))
    .catch(error => console.log("Email connection failed:", error));

const campaignRoutes = (db: Db) => {
    const router = express.Router();
    const campaignsCollection = db.collection("campaigns");
    const usersCollection = db.collection("user");

    router.post("/campaigns", async (req: any, res: any) => {
        const { title, description, imageUrl, date, time, location } = req.body;

        if (!title?.trim() || !description?.trim() || !date || !location?.trim()) {
            return res.status(400).json({
                message: "Please provide all required fields",
            });
        }

        const campaignData = {
            title: title.trim(),
            description: description.trim(),
            imageUrl: imageUrl || "",
            date,
            time,
            location: location.trim(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await campaignsCollection.insertOne(campaignData);

        let sent = 0;
        let failed = 0;

        try {
            const locationParts = campaignData.location
                .split(",")
                .map((part: string) => part.trim())
                .filter(Boolean);

            const users = await usersCollection.find({
                role: { $ne: "admin" },
                email: { $type: "string", $ne: "" },
                $or: locationParts.map((part: string) => ({
                    location: { $regex: part, $options: "i" },
                })),
            })
                .project({ email: 1, _id: 0 })
                .toArray();

            const emails = [
                ...new Set(
                    users
                        .map(user => user.email.trim().toLowerCase())
                        .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                ),
            ];

            const results = await Promise.allSettled(
                emails.map(email =>
                    transporter.sendMail({
                        from: `"CareBridge" <${process.env.EMAIL_USER}>`,
                        to: email,
                        subject: `New Campaign: ${campaignData.title}`,
                        html: campaignEmail(campaignData),
                    })
                )
            );

            sent = results.filter(result => result.status === "fulfilled").length;
            failed = results.filter(result => result.status === "rejected").length;

        } catch (error) {
            console.error("Campaign email error:", error);
        }

        res.status(201).json({
            message: "Campaign created successfully",
            result,
            emailSummary: {
                sent,
                failed,
            },
        });
    });

    router.get("/campaigns", async (req: any, res: any) => {
        const result = await campaignsCollection.find().toArray();
        res.json(result);
    });

    router.get("/campaigns/:id", async (req: any, res: any) => {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid campaign ID" });
        }

        const result = await campaignsCollection.findOne({
            _id: new ObjectId(id),
        });

        if (!result) {
            return res.status(404).json({ message: "Campaign not found" });
        }

        res.json(result);
    });

    router.patch("/campaigns/:id", async (req: any, res: any) => {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid campaign ID" });
        }

        const { title, description, imageUrl, date, time, location } = req.body;

        const updateData: any = {};

        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
        if (date !== undefined) updateData.date = date;
        if (time !== undefined) updateData.time = time;
        if (location !== undefined) updateData.location = location.trim();

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: "No data provided" });
        }

        updateData.updatedAt = new Date();

        const result = await campaignsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Campaign not found" });
        }

        res.json(result);
    });

    router.delete("/campaigns/:id", async (req: any, res: any) => {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid campaign ID" });
        }

        const result = await campaignsCollection.deleteOne({
            _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Campaign not found" });
        }

        res.json(result);
    });

    return router;
};

export default campaignRoutes;
