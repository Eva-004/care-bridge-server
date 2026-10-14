const express = require("express");
const app = express();

const dotenv = require("dotenv");
const cors = require("cors");
dotenv.config();
app.use(cors());
app.use(express.json());

const port = process.env.PORT;

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const uri = process.env.MONGODB_URI as string;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});


async function run() {
    try {
        // await client.connect();
        const db = client.db("carebridge");
        const rolesCollection = db.collection('roles');


        app.get("/roles/:slug", async (req: any, res: any) => {
            const slug = req.params.slug;

            const result = await rolesCollection.findOne({
                slug: slug,
                isActive: true,
            });

            res.json(result);
        });


        // await client.db("admin").command({ ping: 1 });
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