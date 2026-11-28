
import { ObjectId } from "mongodb";
import sendEmail from "./sendEmail";

interface ConfirmPaymentData {
    requestId: string;
    transactionId: string;
    senderNumber: string;
    adminId: string;
}

const confirmHelpRequestPayment = async (
    db: any,
    data: ConfirmPaymentData
) => {
    const helpRequestCollection = db.collection("helpRequests");
    const userCollection = db.collection("user");
    const donationHistoryCollection = db.collection("donationHistory");

    const request = await helpRequestCollection.findOne({
        _id: new ObjectId(data.requestId),
    });

    if (!request) {
        throw new Error("Help request not found");
    }

    if (request.status !== "approved") {
        throw new Error("Only approved requests can be paid");
    }

    if (request.supportType !== "financial") {
        throw new Error("Only financial requests can be paid");
    }

    const existingPayment = await donationHistoryCollection.findOne({
        requestId: data.requestId,
    });
    await helpRequestCollection.updateOne(
        { _id: new ObjectId(data.requestId) },
        {
            $set: {
                status: "paid",
                paidAt: new Date(),
            },
        }
    );

    if (existingPayment) {
        throw new Error("Payment has already been recorded");
    }

    const user = await userCollection.findOne({
        _id: new ObjectId(request.userId),
    });

    if (!user?.email) {
        throw new Error("Beneficiary email not found");
    }

    const payment = {
        requestId: data.requestId,
        userId: request.userId,
        userName: request.userName,
        amount: Number(request.amount),
        paymentMethod: request.paymentMethod,
        transactionId: data.transactionId,
        senderNumber: data.senderNumber,
        adminId: data.adminId,
        status: "completed",
        createdAt: new Date(),
    };

    await donationHistoryCollection.insertOne(payment);

    await sendEmail({
        to: user.email,
        subject: "CareBridge - Financial Support Sent",
        html: `
            <h2>Your financial support has been sent!</h2>
            <p>Hello ${request.name},</p>
            <p>Your approved financial support request has been paid.</p>
            <p><strong>Amount:</strong> ৳${request.amount}</p>
            <p><strong>Payment Method:</strong> ${request.paymentMethod}</p>
            <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
            <p>Thank you for using CareBridge.</p>
        `,
    });

    return payment;
};

export default confirmHelpRequestPayment;
