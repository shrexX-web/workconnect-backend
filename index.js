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

// Post a new job
app.post("/api/jobs", async (req, res) => {
    try {
        const newJob = new Job(req.body);
        await newJob.save();
        res.status(201).json(newJob);
    } catch (err) {
        res.status(500).json({ error: "Failed to save job" });
    }
});

// Get all public community jobs
app.get("/api/jobs/public", async (req, res) => {
  try {
    const publicJobs = await Job.find({ visibility: "public" }).sort({ createdAt: -1 });
    res.json(publicJobs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch public jobs" });
  }
});

// A worker claims/volunteers for a public job
app.patch("/api/jobs/:id/claim", async (req, res) => {
  try {
    const { workerName, workerPhone } = req.body;
    const job = await Job.findById(req.params.id);

    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status !== "open") return res.status(400).json({ error: "Job already claimed" });

    job.status = "claimed";
    job.claimedBy = workerName;
    job.claimedByPhone = workerPhone;
    await job.save();

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: "Failed to claim job" });
  }
});

// Get jobs claimed by a specific worker (by phone)
app.get("/api/jobs/claimed/:phone", async (req, res) => {
  try {
    const claimedJobs = await Job.find({ claimedByPhone: req.params.phone }).sort({ createdAt: -1 });
    res.json(claimedJobs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch claimed jobs" });
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

// Get workers by service category (for "Get a Quote")
app.get("/api/workers/by-service/:service", async (req, res) => {
  try {
    const workers = await Worker.find({ service: req.params.service }).sort({ createdAt: -1 });
    res.json(workers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch workers" });
  }
});

// Get all jobs (admin)
app.get("/api/admin/jobs", async (req, res) => {
  try {
    const allJobs = await Job.find().sort({ createdAt: -1 });
    res.json(allJobs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// Get all workers (admin)
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