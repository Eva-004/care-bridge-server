const express = require("express");
const app = express();

const dotenv = require("dotenv");
const cors = require("cors");
const multer = require("multer");
dotenv.config();
app.use(cors());
app.use(express.json());

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
    const rolesCollection = db.collection('roles');
    const helpCategoriesCollection = db.collection('helpCategories');
    const helpRequestCollection = db.collection('helpRequests');

    const bucket = new GridFSBucket(db, {
      bucketName: "helpDocuments",
    });

    app.get("/roles/:slug", async (req: any, res: any) => {
      const slug = req.params.slug;

      const result = await rolesCollection.findOne({
        slug: slug,
        isActive: true,
      });

      res.json(result);
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