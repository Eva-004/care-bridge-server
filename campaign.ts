
import express, { Request, Response } from "express";
import { Db, ObjectId } from "mongodb";

const campaignRoutes = (db: Db) => {
    const router = express.Router();
    const campaignsCollection = db.collection("campaigns");

    router.post("/campaigns", async (req: any, res: any) => {
        const { title, description, imageUrl, date,time, location } = req.body;

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

        res.json(result);
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

        const { title, description, imageUrl, date, location } = req.body;

        const updateData: any = {};

        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
        if (date !== undefined) updateData.date = date;
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
