require("dotenv").config();

const cors = require("cors");
const bcrypt = require("bcryptjs");
const twilio = require("twilio");
const mysql = require("mysql");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));  // Support form data

app.use(cors());

// 📌 MySQL Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});

db.connect((err) => {
    if (err) {
        console.error("❌ Database Connection Failed:", err.message);
        return;
    }
    console.log("✅ Connected to MySQL Database!");
});

// 📌 Twilio Setup
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// 📌 Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// 📌 Send OTP & Store in Database
app.post("/send-otp", async (req, res) => {
    console.log("Received request body:", req.body); // Debugging
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
    }

    try {
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes
        console.log(`📨 Sending OTP ${otp} to ${phone}`); // Log OTP


        // Send OTP via Twilio
        const message = await client.messages.create({
            body: `Your OTP is ${otp}. Valid for 10 minutes.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone,
        });
        

        // Store OTP in Database
        db.query(
            "INSERT INTO otp_store (phone, otp, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE otp = ?, expires_at = ?",
            [phone, otp, otpExpires, otp, otpExpires],
            (err) => {
                if (err) {
                    console.error("❌ Error storing OTP:", err.message);
                    return res.status(500).json({ message: "Database error" });
                }
                res.status(200).json({ message: "OTP sent successfully!", otp }); // ⚠️ Show OTP for testing only
            }
        );
    } catch (error) {
        console.error("❌ Error sending OTP:", error.message);
        res.status(500).json({ error: "Failed to send OTP" });
    }
});

// 📌 Verify OTP & Register User
app.post("/register", (req, res) => {
    const { fullname, email, password, phone, gender, dob, otp } = req.body;

    db.query("SELECT otp, expires_at FROM otp_store WHERE phone = ?", [phone], async (err, results) => {
        if (err || results.length === 0) return res.status(400).json({ message: "Phone number not found" });

        const userOtp = results[0].otp;
        const otpExpires = results[0].expires_at;

        if (!userOtp || otp !== userOtp || new Date() > new Date(otpExpires)) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.query(
            "INSERT INTO users (fullname, email, password, phone, gender, dob) VALUES (?, ?, ?, ?, ?, ?)",
            [fullname, email, hashedPassword, phone, gender, dob],
            (err, result) => {
                if (err) return res.status(500).json({ message: "Registration failed" });

                // Delete OTP after successful registration
                db.query("DELETE FROM otp_store WHERE phone = ?", [phone]);

                res.json({ message: "User registered successfully" });
            }
        );
    });
});

// 📌 Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
const express = require("express");
const nodemailer = require("nodemailer");
const crypto = require("crypto");  // For generating random reset tokens
const app = express();
app.use(express.json());

const users = {};  // Simulated user database (Replace with real database query)

app.post("/api/forgot-password", async (req, res) => {
    const { email } = req.body;
    
    if (!users[email]) {
        return res.status(400).json({ message: "Email not registered" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    users[email].resetToken = resetToken;

    // Configure Nodemailer (Replace with actual credentials)
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: "your-email@gmail.com", pass: "your-password" }
    });

    const resetLink = `http://localhost:5000/reset-password.html?token=${resetToken}`;

    const mailOptions = {
        from: "your-email@gmail.com",
        to: email,
        subject: "Password Reset",
        text: `Click the link to reset your password: ${resetLink}`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: "Reset link sent to your email" });
    } catch (error) {
        res.status(500).json({ message: "Error sending email" });
    }
});

app.listen(5000, () => console.log("Server running on port 5000"));
app.post("/api/reset-password", (req, res) => {
    const { token, newPassword } = req.body;

    let userEmail = Object.keys(users).find(email => users[email].resetToken === token);

    if (!userEmail) {
        return res.status(400).json({ message: "Invalid or expired token" });
    }

    users[userEmail].password = newPassword;  // Update password (In real case, hash it)
    delete users[userEmail].resetToken;  // Remove token after reset

    res.json({ message: "Password reset successful" });
});
