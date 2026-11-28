
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

interface SendEmailProps {
    to: string;
    subject: string;
    html: string;
}

const sendEmail = async ({ to, subject, html }: SendEmailProps) => {
    return await transporter.sendMail({
        from: `"CareBridge" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
    });
};

export default sendEmail;
