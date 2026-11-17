const express = require("express");
const app = express();

const dotenv = require("dotenv");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
dotenv.config();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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


    app.post("/donations", async (req: any, res: any) => {
      try {
        const { name, category, purpose, amount, email, phone } = req.body;
        const donationAmount = Number(amount);

        if (!name || !category || !amount || !email || !phone) {
          return res.status(400).json({
            success: false,
            message: "All required fields are needed",
          });
        }

        if (!Number.isFinite(donationAmount) || donationAmount < 10 || donationAmount > 500000) {
          return res.status(400).json({
            success: false,
            message: "Invalid donation amount",
          });
        }

        const categoryInfo = await helpCategoriesCollection.findOne({
          _id: new ObjectId(category),
        });

        if (!categoryInfo) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }

        const tranId = `CB-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const now = new Date();

        const donationResult = await donationsCollection.insertOne({
          name,
          category,
          purpose: purpose || "",
          amount: donationAmount,
          email,
          phone,
          createdAt: now,
        });

        await paymentsCollection.insertOne({
          donationId: donationResult.insertedId,
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



        const storeId = process.env.SSL_STORE_ID;
        const storePassword = process.env.SSL_STORE_PASSWORD;
        const serverUrl = process.env.SERVER_URL;

        if (!storeId || !storePassword || !serverUrl || !process.env.SSL_BASE_URL) {
          return res.status(500).json({
            success: false,
            message: "Payment configuration is missing",
          });
        }

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
          cus_name: String(name),
          cus_email: String(email),
          cus_phone: String(phone),
          cus_add1: "Bangladesh",
          cus_city: "Sylhet",
          cus_postcode: "3100",
          cus_country: "Bangladesh",
          shipping_method: "NO",
          product_name: "Donation",
          product_category: "Donation",
          product_profile: "non-physical-goods",
        });

        const paymentResponse = await axios.post(
          `${process.env.SSL_BASE_URL}/gwprocess/v4/api.php`,
          paymentData,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );

        if (
          paymentResponse.data.status !== "SUCCESS" ||
          !paymentResponse.data.GatewayPageURL
        ) {
          await paymentsCollection.updateOne(
            { tranId },
            {
              $set: {
                status: "INITIATION_FAILED",
                updatedAt: new Date(),
              },
            }
          );

          return res.status(400).json({
            success: false,
            message: "Payment session creation failed",
          });
        }

        await paymentsCollection.updateOne(
          { tranId },
          {
            $set: {
              gatewayUrl: paymentResponse.data.GatewayPageURL,
              sessionKey: paymentResponse.data.sessionkey,
              updatedAt: new Date(),
            },
          }
        );

        res.status(201).json({
          success: true,
          message: "Payment session created",
          donationId: donationResult.insertedId,
          tranId,
          gatewayUrl: paymentResponse.data.GatewayPageURL,
        });



      } catch (error: any) {
        console.error("Donation error:", error);

        res.status(500).json({
          success: false,
          message: "Failed to process donation",
        });
      }
    });


    app.post("/payment/success", async (req: any, res: any) => {
      try {
        const { tran_id, val_id } = req.body;

        if (!tran_id || !val_id) {
          return res.status(400).json({
            success: false,
            message: "Invalid payment information",
          });
        }

        const payment = await paymentsCollection.findOne({ tranId: tran_id });

        if (!payment) {
          return res.status(404).json({
            success: false,
            message: "Payment not found",
          });
        }

        res.json({
          success: true,
          message: "Payment callback received",
          tranId: tran_id,
          valId: val_id,
        });
      } catch (error) {
        console.error("Payment success callback error:", error);

        res.status(500).json({
          success: false,
          message: "Payment callback failed",
        });
      }
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