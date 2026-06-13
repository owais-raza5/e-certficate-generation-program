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
      name: path.join(__dirname, "fonts", "Citadel-Script-Regular.ttf"),
      courseFont: path.join(__dirname, "fonts", "Calistoga-Regular.ttf"),
      bold: path.join(__dirname, "fonts", "Poppins-Bold.ttf"),
    },
  },

  email: {
    senderName: process.env.EMAIL_SENDER_NAME || "ZAB E-FEST'26",
    smtp: {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: false,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    subject: (p) => `Your ZAB E-FEST'26 Certificate – ${p.module}`,
    body: (p) =>
      `Dear ${p.name},\n\nCongratulations! Please find your certificate for "${p.module}" attached.\n\nBest regards,\n${process.env.EMAIL_SENDER_NAME || "ZAB E-FEST'26 Team"}`,
  },

  text: {
    name: {
      y: 395,
      size: 40,
      color: rgb(0.0549, 0.0823, 0.4627),
      autoCenter: true,
    },
    module: {
      y: 310,
      size: 33,
      color: rgb(0.0549, 0.0823, 0.4627),
      autoCenter: true,
    },
    refNumber: {
      x: 735,
      y: 468,
      size: 11,
      color: rgb(0.0549, 0.0823, 0.4627),
      autoCenter: false,
    },
  },
};

module.exports = { CONFIG };
