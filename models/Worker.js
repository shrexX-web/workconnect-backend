const mongoose = require("mongoose");

const workerSchema = new mongoose.Schema({
    name: String,
    phone: String,
    service: String,
    area: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Worker", workerSchema);