import express, { Request, Response } from "express";
import multer from "multer";

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPG, JPEG and PNG images are allowed"));
        }
    },
});

router.post("/upload-image", upload.single("image"), async (req: Request, res: Response) => {
    try {
        const formData = new FormData();

        const buffer = new Uint8Array(req.file!.buffer);

        const blob = new Blob([buffer], {
            type: req.file!.mimetype,
        });

        formData.append("image", blob, req.file!.originalname);

        const response = await fetch(
            `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
            {
                method: "POST",
                body: formData,
                // signal: AbortSignal.timeout(10000),
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            console.error("ImgBB error:", result);

            return res.status(502).json({
                message: result.error?.message || "ImgBB upload failed",
            });
        }

        res.status(200).json({
            message: "Image uploaded successfully",
            url: result.data.url,
        });
    } catch (error) {
        console.error("Image upload error:", error);

        if (error instanceof Error) {
            console.error("Error cause:", error.cause);

            res.status(500).json({
                message: error.message,
                cause: error.cause instanceof Error ? error.cause.message : undefined,
            });
        }
    }
});

export default router;