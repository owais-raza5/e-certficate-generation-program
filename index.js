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

function toTitleCase(str) {
  return str.replace(
    /\w\S*/g,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
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
      refNumber: row["Reference Number"] || row["reference number"] || "",
      name: row.Name || row.name,
      email: row.Email || row.email,
      module: row.Module || row.module || row.course,
      position: row.Position || row.position,
    }))
    .filter((row) => row.name && row.module);

  if (participants.length === 0) {
    throw new Error(
      "No valid rows found in data.csv. Required columns: Name, Module",
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
    return await pdfDoc.embedFont(fontBytes, { subset: true });
  } catch {
    console.log(`${label} font not found, using fallback.`);
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
  const moduleFont = await loadFontFromFile(
    pdfDoc,
    CONFIG.paths.fonts.courseFont,
    StandardFonts.HelveticaBold,
    "Module",
  );
  const boldFont = await loadFontFromFile(
    pdfDoc,
    CONFIG.paths.fonts.bold,
    StandardFonts.HelveticaBold,
    "Bold",
  );
  return { nameFont, moduleFont, boldFont };
}

function drawCenteredText(page, text, font, options) {
  const { width } = page.getSize();
  const textWidth = font.widthOfTextAtSize(text, options.size);
  const x = (width - textWidth) / 2;
  page.drawText(text, {
    x,
    y: options.y,
    size: options.size,
    font,
    color: options.color,
  });
}

function drawCenteredAround(page, text, font, options) {
  const textWidth = font.widthOfTextAtSize(text, options.size);
  const x = options.x - textWidth / 2;
  page.drawText(text, {
    x,
    y: options.y,
    size: options.size,
    font,
    color: options.color,
  });
}

async function generateCertificate(participant) {
  const templatePath = resolveTemplatePath(participant.position || "participant");
  const templateBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const fonts = await loadFonts(pdfDoc);

  drawCenteredText(
    page,
    toTitleCase(participant.name),
    fonts.nameFont,
    CONFIG.text.name,
  );
  drawCenteredText(
    page,
    toTitleCase(participant.module),
    fonts.moduleFont,
    CONFIG.text.module,
  );

  if (participant.refNumber) {
    drawCenteredAround(
      page,
      participant.refNumber.toUpperCase(),
      fonts.boldFont,
      CONFIG.text.refNumber,
    );
  }

  const outputBytes = await pdfDoc.save();
  const safeName = sanitizeFileName(participant.refNumber);
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
    auth: { user: CONFIG.email.smtp.user, pass: CONFIG.email.smtp.pass },
    connectionTimeout: 60000,
    greetingTimeout: 60000,
    socketTimeout: 60000,
  });
}

async function sendCertificateEmail(transporter, participant, outputBytes) {
  if (!participant.email) {
    console.log(`  Skipping email for ${participant.name}: no email address.`);
    return;
  }
  const safeName = sanitizeFileName(participant.name);
  await transporter.verify((err, success) => {
    if (err) {
      console.error(err);
    } else {
      console.log("SMTP Ready");
    }
  });
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
        `Generating certificate for: ${participant.refNumber}`,
      );
      const { outputPath, outputBytes } =
        await generateCertificate(participant);
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
