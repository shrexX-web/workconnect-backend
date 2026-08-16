const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

const allowedOrigins = [
  "https://workconnect-frontend.vercel.app",
  "http://localhost:5173"
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    }
  })
);
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected successfully"))
    .catch((err) => console.log("MongoDB connection error:", err));

app.get("/", (req, res) => {
    res.send("WorkConnect API is running");
});

const PORT = process.env.PORT || 5000;
const Job = require("./models/Job");
const Worker = require("./models/Worker");
const Review = require("./models/Review");
const Comment = require("./models/Comments");
const User = require("./models/User");

const otpStore = {};

function createToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Verifies a Bearer JWT and requires role === "admin". Attaches req.user on success.
function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Missing or invalid authorization header." });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "Server authentication is not configured." });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.role !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }

    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (![name, email, phone, password].every(
      (value) => typeof value === "string" && value.trim()
    )) {
      return res.status(400).json({
        error: "Name, email, phone, and password are required."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long."
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error: "Server authentication is not configured."
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    const existingUser = await User.findOne({
      $or: [{ email: cleanEmail }, { phone: cleanPhone }]
    });

    if (existingUser) {
      return res.status(409).json({
        error: "An account with this email or phone already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password: passwordHash,
      role: "customer"
    });

    const token = createToken(user);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required."
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error: "Server authentication is not configured."
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Could not log in." });
  }
});

app.post("/api/auth/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required."
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error: "Server authentication is not configured."
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      role: "admin"
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        error: "Invalid admin credentials."
      });
    }

    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Could not log in." });
  }
});

// Post a new job
app.post("/api/jobs", async (req, res) => {
  try {
    const { name, email, phone, service, description, visibility = "private" } = req.body;

    if (![name, email, phone, service].every(
      (value) => typeof value === "string" && value.trim()
    )) {
      return res.status(400).json({
        error: "Name, email, phone, and service are required."
      });
    }

    const allowedServices = [
      "plumbing",
      "electrical",
      "painting",
      "carpentry",
      "cleaning",
      "ac-repair"
    ];

    if (!allowedServices.includes(service)) {
      return res.status(400).json({ error: "Please select a valid service." });
    }

    if (!["private", "public"].includes(visibility)) {
      return res.status(400).json({ error: "Invalid job visibility." });
    }

    const newJob = new Job({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      service,
      description: typeof description === "string" ? description.trim() : "",
      visibility
    });

    await newJob.save();
    res.status(201).json(newJob);
  } catch (err) {
    console.error("Failed to save job:", err);
    res.status(500).json({ error: "Failed to save job." });
  }
});

// Get all public community jobs (with comment counts)
app.get("/api/jobs/public", async (req, res) => {
  try {
    const publicJobs = await Job.find({ visibility: "public" }).sort({ createdAt: -1 });
    const jobsWithComments = await Promise.all(
      publicJobs.map(async (job) => {
        const commentCount = await Comment.countDocuments({ jobId: job._id.toString() });
        return { ...job.toObject(), commentCount };
      })
    );
    res.json(jobsWithComments);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch public jobs" });
  }
});

// Get private open jobs matching a worker's service category
app.get("/api/jobs/available/:service", async (req, res) => {
  try {
    const jobs = await Job.find({
      service: req.params.service,
      status: "open",
      visibility: "private"
    }).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch available jobs" });
  }
});

// A worker claims a job (validates category match server-side)
app.patch("/api/jobs/:id/claim", async (req, res) => {
  try {
    const { workerName, workerPhone } = req.body;
    const job = await Job.findById(req.params.id);

    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status !== "open") return res.status(400).json({ error: "Job already claimed" });

    const worker = await Worker.findOne({ phone: workerPhone });
    if (!worker) return res.status(404).json({ error: "This phone number isn't registered as a worker yet." });
    if (worker.service !== job.service) {
      return res.status(400).json({ error: `This job is for ${job.service}, but you're registered for ${worker.service}.` });
    }

    job.status = "claimed";
    job.claimedBy = workerName;
    job.claimedByPhone = workerPhone;
    await job.save();

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: "Failed to claim job" });
  }
});

// Get jobs claimed by a specific worker
app.get("/api/jobs/claimed/:phone", async (req, res) => {
  try {
    const claimedJobs = await Job.find({ claimedByPhone: req.params.phone }).sort({ createdAt: -1 });
    res.json(claimedJobs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch claimed jobs" });
  }
});

// Get jobs posted by a specific customer
app.get("/api/jobs/customer/:phone", async (req, res) => {
  try {
    const customerJobs = await Job.find({ phone: req.params.phone }).sort({ createdAt: -1 });
    res.json(customerJobs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your jobs" });
  }
});

// Mark a job as completed
app.patch("/api/jobs/:id/complete", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    job.status = "completed";
    await job.save();
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: "Failed to update job" });
  }
});

// ADMIN: reset a job back to open (undo a bad/stale claim)
app.patch("/api/admin/jobs/:id/reset", requireAdmin, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    job.status = "open";
    job.claimedBy = null;
    job.claimedByPhone = null;
    await job.save();
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: "Failed to reset job" });
  }
});

// ADMIN: delete a job
app.delete("/api/admin/jobs/:id", requireAdmin, async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete job" });
  }
});

// ADMIN: delete a worker
app.delete("/api/admin/workers/:id", requireAdmin, async (req, res) => {
  try {
    await Worker.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete worker" });
  }
});

// Register a new worker
app.post("/api/workers", async (req, res) => {
    try {
        const newWorker = new Worker(req.body);
        await newWorker.save();
        res.status(201).json(newWorker);
    } catch (err) {
        res.status(500).json({ error: "Failed to save worker" });
    }
});

// Get a single worker by phone
app.get("/api/workers/phone/:phone", async (req, res) => {
  try {
    const worker = await Worker.findOne({ phone: req.params.phone });
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    res.json(worker);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch worker" });
  }
});

// Get workers by service category (for "Get a Quote")
app.get("/api/workers/by-service/:service", async (req, res) => {
  try {
    const workers = await Worker.find({ service: req.params.service }).sort({ createdAt: -1 });
    const workersWithRatings = await Promise.all(
      workers.map(async (worker) => {
        const reviews = await Review.find({ workerPhone: worker.phone });
        const avgRating = reviews.length > 0
          ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
          : null;
        return { ...worker.toObject(), avgRating, reviewCount: reviews.length };
      })
    );
    res.json(workersWithRatings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch workers" });
  }
});

// Comments
app.post("/api/comments", async (req, res) => {
  try {
    const { jobId, name, comment } = req.body;
    const newComment = new Comment({ jobId, name, comment });
    await newComment.save();
    res.status(201).json(newComment);
  } catch (err) {
    res.status(500).json({ error: "Failed to post comment" });
  }
});

app.get("/api/comments/:jobId", async (req, res) => {
  try {
    const comments = await Comment.find({ jobId: req.params.jobId }).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// Reviews
app.post("/api/reviews", async (req, res) => {
  try {
    const { jobId, rating, comment } = req.body;
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status !== "completed") return res.status(400).json({ error: "This job isn't marked completed yet" });
    if (!job.claimedByPhone) return res.status(400).json({ error: "This job has no assigned worker to review" });

    const existing = await Review.findOne({ jobId });
    if (existing) return res.status(400).json({ error: "This job has already been reviewed" });

    const newReview = new Review({
      jobId,
      workerPhone: job.claimedByPhone,
      workerName: job.claimedBy,
      customerName: job.name,
      rating,
      comment,
    });
    await newReview.save();
    res.status(201).json(newReview);
  } catch (err) {
    res.status(500).json({ error: "Failed to save review" });
  }
});

app.get("/api/reviews/:phone", async (req, res) => {
  try {
    const reviews = await Review.find({ workerPhone: req.params.phone }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

app.post("/api/reviews/check", async (req, res) => {
  try {
    const { jobIds } = req.body;
    const reviews = await Review.find({ jobId: { $in: jobIds } });
    res.json(reviews.map(r => r.jobId));
  } catch (err) {
    res.status(500).json({ error: "Failed to check reviews" });
  }
});

// OTP - idempotent send (fixes the race condition bug)
app.post("/api/otp/send", async (req, res) => {
  try {
    const { phone } = req.body;
    const worker = await Worker.findOne({ phone });
    if (!worker) return res.status(404).json({ error: "This phone number isn't registered as a worker yet." });

    const existing = otpStore[phone];
    if (existing && Date.now() < existing.expiresAt) {
      return res.json({ message: "OTP already sent", otp: existing.otp, simulated: true });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[phone] = { otp, expiresAt: Date.now() + 5 * 60 * 1000 };
    res.json({ message: "OTP generated", otp, simulated: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate OTP" });
  }
});

app.post("/api/otp/send-customer", async (req, res) => {
  try {
    const { phone } = req.body;
    const job = await Job.findOne({ phone });
    if (!job) return res.status(404).json({ error: "No jobs found for this phone number." });

    const existing = otpStore[phone];
    if (existing && Date.now() < existing.expiresAt) {
      return res.json({ message: "OTP already sent", otp: existing.otp, simulated: true });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[phone] = { otp, expiresAt: Date.now() + 5 * 60 * 1000 };
    res.json({ message: "OTP generated", otp, simulated: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate OTP" });
  }
});

app.post("/api/otp/verify", async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const record = otpStore[phone];

    if (!record) return res.status(400).json({ error: "No OTP requested for this number" });
    if (Date.now() > record.expiresAt) return res.status(400).json({ error: "OTP expired, please request a new one" });
    if (record.otp !== otp) return res.status(400).json({ error: "Incorrect OTP" });

    delete otpStore[phone];
    res.json({ verified: true });
  } catch (err) {
    res.status(500).json({ error: "Verification failed" });
  }
});

// Admin: get everything
app.get("/api/admin/jobs", requireAdmin, async (req, res) => {
  try {
    const allJobs = await Job.find().sort({ createdAt: -1 });
    res.json(allJobs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

app.get("/api/admin/workers", requireAdmin, async (req, res) => {
  try {
    const allWorkers = await Worker.find().sort({ createdAt: -1 });
    res.json(allWorkers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch workers" });
  }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});