const fs = require('node:fs/promises');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { parse } = require('csv-parse/sync');

const CONFIG = {
  paths: {
    template: path.join(__dirname, 'certificate.pdf'),
    csv: path.join(__dirname, 'data.csv'),
    outputDir: path.join(__dirname, 'output'),
    fonts: {
      name: path.join(__dirname, 'fonts', 'Parisienne-Regular.ttf'),
      body: path.join(__dirname, 'fonts', 'Poppins-Regular.ttf'),
      bodyBold: path.join(__dirname, 'fonts', 'Poppins-Bold.ttf'),
    },
  },
  text: {
    name: {
      y: 310,
      size: 64,
      color: rgb(0.12, 0.12, 0.12),
      autoCenter: true,
    },
    course: {
      y: 220,
      size: 24,
      color: rgb(0.18, 0.18, 0.18),
      autoCenter: true,
    },
    date: {
      y: 190,
      size: 18,
      color: rgb(0.25, 0.25, 0.25),
      autoCenter: true,
    },
  },
};

function sanitizeFileName(value) {
  return value
    .trim()
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_');
}

async function ensureOutputDir(outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
}

async function loadParticipants(csvPath) {
  const csvContent = await fs.readFile(csvPath, 'utf8');
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
      course: row.course,
      date: row.date,
    }))
    .filter((row) => row.name && row.course && row.date);

  if (participants.length === 0) {
    throw new Error('No valid rows found in data.csv. Required columns: name, course, date');
  }

  return participants;
}

async function loadFontFromFile(pdfDoc, fontPath, fallbackStandardFont, label) {
  try {
    const fontBytes = await fs.readFile(fontPath);
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });
    console.log(`Using ${label} font: ${fontPath}`);
    return font;
  } catch {
    console.log(
      `${label} font not found at ${fontPath}. Falling back to ${fallbackStandardFont}.`
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
    'Name'
  );
  const bodyFont = await loadFontFromFile(
    pdfDoc,
    CONFIG.paths.fonts.body,
    StandardFonts.Helvetica,
    'Body'
  );
  const bodyBoldFont = await loadFontFromFile(
    pdfDoc,
    CONFIG.paths.fonts.bodyBold,
    StandardFonts.HelveticaBold,
    'Body bold'
  );

  return { nameFont, bodyFont, bodyBoldFont };
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
  const templateBytes = await fs.readFile(CONFIG.paths.template);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];

  const fonts = await loadFonts(pdfDoc);

  drawText(page, participant.name, fonts.nameFont, CONFIG.text.name);
  drawText(page, participant.course, fonts.bodyBoldFont, CONFIG.text.course);
  drawText(page, participant.date, fonts.bodyFont, CONFIG.text.date);

  const outputBytes = await pdfDoc.save();
  const safeName = sanitizeFileName(participant.name);
  const outputPath = path.join(CONFIG.paths.outputDir, `certificate_${safeName}.pdf`);

  await fs.writeFile(outputPath, outputBytes);
  return outputPath;
}

async function main() {
  console.log('Starting certificate generation...');

  try {
    await ensureOutputDir(CONFIG.paths.outputDir);

    const participants = await loadParticipants(CONFIG.paths.csv);
    console.log(`Loaded ${participants.length} participant(s) from data.csv`);

    for (const participant of participants) {
      console.log(`Generating certificate for: ${participant.name}`);
      const outputPath = await generateCertificate(participant);
      console.log(`Saved: ${outputPath}`);
    }

    console.log('All certificates generated successfully.');
  } catch (error) {
    console.log('Certificate generation failed.');
    console.log(error.message);
  }
}

main();
