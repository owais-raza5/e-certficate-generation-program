const path = require("node:path");
const { rgb } = require("pdf-lib");

const CONFIG = {
  paths: {
    templates: {
      winner: path.join(__dirname, "templates", "winner.pdf"),
      runner: path.join(__dirname, "templates", "runner.pdf"),
      participant: path.join(__dirname, "templates", "participant.pdf"),
    },
    csv: path.join(__dirname, "data.csv"),
    outputDir: path.join(__dirname, "output"),
    fonts: {
      name: path.join(__dirname, "fonts", "Calistoga-Regular.ttf"),
      courseFont: path.join(__dirname, "fonts", "Calistoga-Regular.ttf"),
    },
  },

  email: {
    senderName: process.env.EMAIL_SENDER_NAME || "Certificate Team",
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    subject: (participant) =>
      `Your Certificate – ${participant.course}`,
    body: (participant) =>
      `Dear ${participant.name},\n\nCongratulations! Please find your certificate for "${participant.course}" attached.\n\nBest regards,\n${process.env.EMAIL_SENDER_NAME || "Certificate Team"}`,
  },

  text: {
    name: {
      y: 400,
      size: 38,
      color: rgb(0.0549, 0.0823, 0.4627),
      autoCenter: true,
    },
    course: {
      y: 310,
      size: 33,
      color: rgb(0.0549, 0.0823, 0.4627),
      autoCenter: true,
    },
  },
};

module.exports = { CONFIG };
