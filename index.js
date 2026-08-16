const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
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
const Comment = require("./models/Comment");

const otpStore = {};

// Post a new job
aapp.post("/api/jobs", async (req, res) => {
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
app.patch("/api/admin/jobs/:id/reset", async (req, res) => {
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
app.delete("/api/admin/jobs/:id", async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete job" });
  }
});

// ADMIN: delete a worker
app.delete("/api/admin/workers/:id", async (req, res) => {
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
app.get("/api/admin/jobs", async (req, res) => {
  try {
    const allJobs = await Job.find().sort({ createdAt: -1 });
    res.json(allJobs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

app.get("/api/admin/workers", async (req, res) => {
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