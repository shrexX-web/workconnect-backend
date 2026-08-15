const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  jobId: String,
  name: String,
  comment: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Comment", commentSchema);