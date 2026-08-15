const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  jobId: String,
  workerPhone: String,
  workerName: String,
  customerName: String,
  rating: Number,
  comment: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Review", reviewSchema);