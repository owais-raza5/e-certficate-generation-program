const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { parse } = require("csv-parse/sync");
const nodemailer = require("nodemailer");
const { CONFIG } = require("./config");

function sanitizeFileName(value) {
  return value
    .trim()
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");
}

async function ensureOutputDir(outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
}

async function loadParticipants(csvPath) {
  const csvContent = await fs.readFile(csvPath, "utf8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const participants = rows
    .map((row, index) => ({
      rowNumber: index + 2,
      name: row.name,
      email: row.email,
      course: row.course,
      position: row.position,
    }))
    .filter((row) => row.name && row.course);

  if (participants.length === 0) {
    throw new Error(
      "No valid rows found in data.csv. Required columns: name, course",
    );
  }

  return participants;
}

function resolveTemplatePath(position) {
  const key = (position || "").trim().toLowerCase();
  const templatePath = CONFIG.paths.templates[key];

  if (!templatePath) {
    const valid = Object.keys(CONFIG.paths.templates).join(", ");
    throw new Error(
      `Unknown position "${position}". Valid values are: ${valid}`,
    );
  }

  return templatePath;
}

async function loadFontFromFile(pdfDoc, fontPath, fallbackStandardFont, label) {
  try {
    const fontBytes = await fs.readFile(fontPath);
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });
    console.log(`Using ${label} font: ${fontPath}`);
    return font;
  } catch {
    console.log(
      `${label} font not found at ${fontPath}. Falling back to ${fallbackStandardFont}.`,
    );
    return pdfDoc.embedFont(fallbackStandardFont);
  }
}

async function loadFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);

  const nameFont = await loadFontFromFile(
    pdfDoc,
    CONFIG.paths.fonts.name,
    StandardFonts.TimesRoman,
    "Name",
  );
  const bodyFont = await loadFontFromFile(
    pdfDoc,
    CONFIG.paths.fonts.name,
    StandardFonts.Helvetica,
    "Body",
  );
  const courseFontFont = await loadFontFromFile(
    pdfDoc,
    CONFIG.paths.fonts.courseFont,
    StandardFonts.HelveticaBold,
    "Body bold",
  );

  return { nameFont, bodyFont, courseFontFont };
}

function drawText(page, text, font, options) {
  const { width } = page.getSize();
  const textWidth = font.widthOfTextAtSize(text, options.size);
  const x = options.autoCenter ? (width - textWidth) / 2 : options.x;

  page.drawText(text, {
    x,
    y: options.y,
    size: options.size,
    font,
    color: options.color,
  });
}

async function generateCertificate(participant) {
  const templatePath = resolveTemplatePath(participant.position);
  const templateBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];

  const fonts = await loadFonts(pdfDoc);

  drawText(
    page,
    participant.name?.toUpperCase(),
    fonts.nameFont,
    CONFIG.text.name,
  );
  drawText(
    page,
    participant.course?.toUpperCase(),
    fonts.courseFontFont,
    CONFIG.text.course,
  );

  const outputBytes = await pdfDoc.save();
  const safeName = sanitizeFileName(participant.name);
  const outputPath = path.join(
    CONFIG.paths.outputDir,
    `certificate_${safeName}.pdf`,
  );

  await fs.writeFile(outputPath, outputBytes);
  return { outputPath, outputBytes };
}

function createTransporter() {
  return nodemailer.createTransport({
    host: CONFIG.email.smtp.host,
    port: CONFIG.email.smtp.port,
    secure: CONFIG.email.smtp.secure,
    auth: {
      user: CONFIG.email.smtp.user,
      pass: CONFIG.email.smtp.pass,
    },
  });
}

async function sendCertificateEmail(transporter, participant, outputBytes) {
  if (!participant.email) {
    console.log(`  Skipping email for ${participant.name}: no email address.`);
    return;
  }

  const safeName = sanitizeFileName(participant.name);
  const position = (participant.position || "").trim();

  await transporter.sendMail({
    from: `"${CONFIG.email.senderName}" <${CONFIG.email.smtp.user}>`,
    to: participant.email,
    subject: CONFIG.email.subject(participant),
    text: CONFIG.email.body(participant),
    attachments: [
      {
        filename: `certificate_${safeName}.pdf`,
        content: Buffer.from(outputBytes),
        contentType: "application/pdf",
      },
    ],
  });

  console.log(`  Email sent to ${participant.email}`);
}

async function main() {
  console.log("Starting certificate generation...");

  try {
    await ensureOutputDir(CONFIG.paths.outputDir);

    const participants = await loadParticipants(CONFIG.paths.csv);
    console.log(`Loaded ${participants.length} participant(s) from data.csv`);

    const transporter = createTransporter();

    for (const participant of participants) {
      console.log(
        `Generating certificate for: ${participant.name} (${participant.position})`,
      );
      const { outputPath, outputBytes } = await generateCertificate(participant);
      console.log(`Saved: ${outputPath}`);

      await sendCertificateEmail(transporter, participant, outputBytes);
    }

    console.log("All certificates generated and emailed successfully.");
  } catch (error) {
    console.log("Certificate generation failed.");
    console.log(error.message);
  }
}

main();
