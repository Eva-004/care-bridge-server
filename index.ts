import "dotenv/config";

import donationRoutes from "./donationRoutes";
import uploadImageRoutes from "./uploadImage";
import campaignRoutes from "./campaign";
import helpRequestPaymentRoutes from "./helpRequestPaymentRoutes";
import donationHistoryRoutes from "./donationHistoryRoutes";
const express = require("express");
const app = express();

const cors = require("cors");
const multer = require("multer");
const axios = require("axios");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(uploadImageRoutes);

const port = process.env.PORT;

const { MongoClient, ServerApiVersion, ObjectId, GridFSBucket } = require("mongodb");

const uri = process.env.MONGODB_URI as string;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("carebridge");
    app.use(donationRoutes(db));
    app.use(campaignRoutes(db));
    app.use(helpRequestPaymentRoutes(db));
    app.use(donationHistoryRoutes(db));
    const rolesCollection = db.collection('roles');
    const helpCategoriesCollection = db.collection('helpCategories');
    const helpRequestCollection = db.collection('helpRequests');
    const userCollection = db.collection('user');
    const donationsCollection = db.collection("donations");
    const paymentsCollection = db.collection("payments");


    const bucket = new GridFSBucket(db, {
      bucketName: "helpDocuments",
    });

    app.patch("/user/:id/role", async (req: any, res: any) => {
      const { id } = req.params;
      const { role } = req.body;

      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            role: role,
          },
        }
      );
      res.send(result);

    });

    app.get("/roles/:slug", async (req: any, res: any) => {
      const slug = req.params.slug;

      const result = await rolesCollection.findOne({
        slug: slug,
        isActive: true,
      });

      res.json(result);
    });

    app.post("/roles", async (req: any, res: any) => {
      const data = req.body;

      const roleData = {
        name: data.name,
        slug: data.slug,
        permissions: data.permissions,
        isActive: data.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await rolesCollection.insertOne(roleData);

      res.json(result);
    });

    app.get("/roles", async (req: any, res: any) => {
      const result = await rolesCollection.find().toArray();
      res.json(result);
    });

    app.patch("/roles/:id", async (req: any, res: any) => {
      const { id } = req.params;
      const { name, slug, permissions } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid role ID" });
      }

      const existingRole = await rolesCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!existingRole) {
        return res.status(404).json({ message: "Role not found" });
      }

      if (existingRole.slug === "admin") {
        return res.status(403).json({
          message: "Admin role cannot be updated",
        });
      }

      const duplicateRole = await rolesCollection.findOne({
        slug,
        _id: { $ne: new ObjectId(id) },
      });

      if (duplicateRole) {
        return res.status(409).json({
          message: "This role already exists",
        });
      }

      const result = await rolesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            name,
            slug,
            permissions,
            updatedAt: new Date(),
          },
        }
      );

      await userCollection.updateMany(
        { role: existingRole.slug },
        {
          $set: {
            role: slug,
          },
        }
      );

      res.json({
        success: true,
        message: "Role updated successfully",
        result,
      });
    });

    app.delete("/roles/:id", async (req: any, res: any) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid role ID" });
      }

      const existingRole = await rolesCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!existingRole) {
        return res.status(404).json({ message: "Role not found" });
      }

      if (existingRole.slug === "admin") {
        return res.status(403).json({
          message: "Admin role cannot be deleted",
        });
      }

      const result = await rolesCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json({
        success: true,
        message: "Role deleted successfully",
        result,
      });
    });

    app.post("/helpCategories", async (req: any, res: any) => {
      const data = req.body;

      console.log(data);

      const helpCategoryData = {
        name: data.name,
        description: data.description,
        createdAt: new Date(),
      };

      const result = await helpCategoriesCollection.insertOne(
        helpCategoryData
      );

      res.json(result);
    });
    app.get("/helpCategories", async (req: any, res: any) => {
      const result = await helpCategoriesCollection.find().toArray();
      res.json(result);
    });
    app.get("/user", async (req: any, res: any) => {
      const result = await userCollection.find().toArray();
      res.json(result);
    });
    app.patch("/user/:id", async (req: any, res: any) => {
      const { id } = req.params;
      const { role } = req.body;

      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );

      res.json(result);
    });

    app.delete("/user/:id", async (req: any, res: any) => {
      const { id } = req.params;

      const result = await userCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    app.post("/helpRequests", upload.array("documents"), async (req: any, res: any) => {
      try {
        const documents = await Promise.all(
          (req.files || []).map((file: any) => {
            return new Promise((resolve, reject) => {
              const stream = bucket.openUploadStream(file.originalname, {
                metadata: { contentType: file.mimetype },
              });

              stream.on("finish", () => {
                resolve({
                  fileId: stream.id,
                  name: file.originalname,
                  type: file.mimetype,
                });
              });

              stream.on("error", reject);
              stream.end(file.buffer);
            });
          })
        );

        const result = await helpRequestCollection.insertOne({
          ...req.body,
          status: req.body.status || "pending",
          documents,
          createdAt: new Date(),
        });

        res.status(201).json({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({ message: "Failed to submit request" });
      }
    });

    app.get("/helpRequests", async (req: any, res: any) => {
      const { search, category, urgency } = req.query;

      const query: any = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      if (category) {
        query.category = category;
      }

      if (urgency) {
        query.urgency = urgency.toLowerCase();
      }

      const result = await helpRequestCollection
        .aggregate([
          { $match: query },
          {
            $lookup: {
              from: "helpCategories",
              let: { categoryId: "$category" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: [{ $toString: "$_id" }, "$$categoryId"],
                    },
                  },
                },
              ],
              as: "categoryInfo",
            },
          },
          {
            $unwind: {
              path: "$categoryInfo",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $addFields: {
              category: {
                _id: "$categoryInfo._id",
                name: "$categoryInfo.name",
              },
            },
          },
          { $project: { categoryInfo: 0 } },
          { $sort: { createdAt: -1 } },
        ])
        .toArray();

      res.send(result);
    });

    app.get("/helpRequests/user/:userId", async (req: any, res: any) => {
      const result = await helpRequestCollection
        .find({ userId: req.params.userId })
        .sort({ createdAt: -1 })
        .toArray();

      res.json(result);
    });

    app.patch("/helpRequests/:id", async (req: any, res: any) => {
      const { id } = req.params;

      const result = await helpRequestCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body }
      );

      res.json(result);
    });

    app.delete("/helpRequests/:id", async (req: any, res: any) => {
      const { id } = req.params;

      const result = await helpRequestCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    app.get("/files/:id", async (req: any, res: any) => {
      try {
        const { id } = req.params;

        const fileId = new ObjectId(id);

        const file = await db
          .collection("helpDocuments.files")
          .findOne({ _id: fileId });

        if (!file) {
          return res.status(404).json({
            success: false,
            message: "File not found",
          });
        }

        res.set("Content-Type", file.metadata?.contentType || "application/octet-stream");
        res.set("Content-Disposition", `inline; filename="${encodeURIComponent(file.filename)}"`);

        bucket.openDownloadStream(fileId).pipe(res);
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to retrieve file",
        });
      }
    });

    app.get("/helpRequests/:id", async (req: any, res: any) => {
      const { id } = req.params;

      const result = await helpRequestCollection.findOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    app.get("/donations/:email", async (req: any, res: any) => {
      const { email } = req.params;

      const result = await donationsCollection
        .aggregate([
          {
            $match: {
              email: email,
            },
          },
          {
            $lookup: {
              from: "helpCategories",
              let: { categoryId: "$category" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: [{ $toString: "$_id" }, "$$categoryId"],
                    },
                  },
                },
              ],
              as: "categoryInfo",
            },
          },
          {
            $unwind: {
              path: "$categoryInfo",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $addFields: {
              category: {
                $ifNull: ["$categoryInfo.name", "Unknown Category"],
              },
            },
          },
          {
            $project: {
              categoryInfo: 0,
            },
          },
          {
            $sort: {
              createdAt: -1,
            },
          },
        ])
        .toArray();

      res.json(result);
    });

    app.get("/payments/:email", async (req: any, res: any) => {
      const { email } = req.params;

      const result = await paymentsCollection
        .aggregate([
          {
            $lookup: {
              from: "donations",
              localField: "donationId",
              foreignField: "_id",
              as: "donationInfo",
            },
          },
          { $unwind: "$donationInfo" },
          { $match: { "donationInfo.email": email } },
          { $sort: { createdAt: -1 } },
          {
            $project: {
              donationInfo: 0,
              sessionKey: 0,
              gatewayUrl: 0,
              valId: 0,
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

  } finally {

  }
}

run().catch(console.dir);

app.get("/", async (req: any, res: any) => {
  res.json("Server is running fine!");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});