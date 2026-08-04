const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    service: String,
    description: String,
    visibility: {
        type: String,
        enum: ["private", "public"],
        default: "private"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Job", jobSchema);