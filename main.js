const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const mammoth = require('mammoth');
const sharp = require('sharp');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#f8f9fc'
  });

  mainWindow.loadFile('renderer/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── Window Controls ───
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

// ─── File Dialog: Open Files ───
ipcMain.handle('open-file-dialog', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: filters || [
      { name: 'All Supported', extensions: ['pdf', 'docx', 'doc', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'tiff', 'webp'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Word', extensions: ['docx', 'doc'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'tiff', 'webp'] }
    ]
  });
  return result.filePaths;
});

// ─── Save Dialog ───
ipcMain.handle('save-file-dialog', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'document.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  return result.filePath;
});

// ─── Read File ───
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return { success: true, data: buffer.toString('base64'), name: path.basename(filePath), ext: path.extname(filePath).toLowerCase() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Save File ───
ipcMain.handle('save-file', async (event, filePath, base64Data) => {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Convert Word to PDF via MS Word COM (PowerShell) ───
ipcMain.handle('convert-word-to-pdf', async (event, filePath) => {
  return new Promise((resolve) => {
    try {
      const os = require('os');
      const { exec } = require('child_process');
      const pdfPath = path.join(os.tmpdir(), `openpdf_temp_${Date.now()}.pdf`);

      // Script de PowerShell que usa el motor nativo invisible de Word ya instalado en Windows (si existe)
      const psScript = `
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        try {
          $doc = $word.Documents.Open('${filePath.replace(/'/g, "''")}')
          $doc.SaveAs([ref]'${pdfPath.replace(/'/g, "''")}', [ref]17)
          $doc.Close()
        } finally {
          $word.Quit()
          [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
        }
      `;

      exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ';')}"`, (error) => {
        if (error) {
          console.error('Error in Word COM conversion:', error);
          resolve({ success: false, error: 'La conversión pixel-perfect requiere tener Microsoft Word instalado. Hubo un error procesando el archivo.' });
          return;
        }

        try {
          const pdfBuffer = fs.readFileSync(pdfPath);
          fs.unlinkSync(pdfPath); // Limpiar temp file
          resolve({ success: true, data: Buffer.from(pdfBuffer).toString('base64') });
        } catch (readError) {
          resolve({ success: false, error: 'No se pudo generar el documento PDF desde MS Word.' });
        }
      });
    } catch (err) {
      console.error('Error convirtiendo a PDF:', err);
      resolve({ success: false, error: err.message });
    }
  });
});

// ─── Convert PDF to Word via MS Word COM (PowerShell) ───
ipcMain.handle('convert-pdf-to-word', async (event, filePath) => {
  return new Promise((resolve) => {
    try {
      const os = require('os');
      const { exec } = require('child_process');
      const docxPath = path.join(os.tmpdir(), `openpdf_temp_${Date.now()}.docx`);

      // 16 is wdFormatDocumentDefault
      const psScript = `
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        try {
          $doc = $word.Documents.Open('${filePath.replace(/'/g, "''")}')
          $doc.SaveAs([ref]'${docxPath.replace(/'/g, "''")}', [ref]16)
          $doc.Close()
        } finally {
          $word.Quit()
          [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
        }
      `;

      exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ';')}"`, (error) => {
        if (error) {
          console.error('Error in Word COM PDF-to-Word conversion:', error);
          resolve({ success: false, error: 'La conversión a Word requiere Microsoft Word instalado. Hubo un error procesando el archivo.' });
          return;
        }

        try {
          const docxBuffer = fs.readFileSync(docxPath);
          fs.unlinkSync(docxPath); // Limpiar temp file
          resolve({ success: true, data: Buffer.from(docxBuffer).toString('base64') });
        } catch (readError) {
          resolve({ success: false, error: 'No se pudo generar el documento Word desde MS Word.' });
        }
      });
    } catch (err) {
      console.error('Error convirtiendo a Word:', err);
      resolve({ success: false, error: err.message });
    }
  });
});

// ─── Convert PDF to Images ───
ipcMain.handle('convert-pdf-to-image', async (event, filePath) => {
  return { success: false, error: 'La conversión a imagen ha sido deshabilitada en la versión compilada temporalmente por requerimientos del sistema.' };
  /*try {
    const pdf2img = require('pdf-img-convert');
    // Esto retorna un array de Uint8Arrays con los PNGs
    const images = await pdf2img.convert(filePath, { width: 1200 }); // Renderizar a un ancho decente
    const base64Images = images.map(imgBuffer => Buffer.from(imgBuffer).toString('base64'));
    return { success: true, data: base64Images }; // array de base64 strings
  } catch (err) {
    return { success: false, error: err.message };
  }*/
});

// ─── Convert Image to PDF ───
ipcMain.handle('convert-image-to-pdf', async (event, filePath) => {
  try {
    const imageBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    let processedBuffer = imageBuffer;
    let embedFn;

    // Convert non-PNG/JPG formats to PNG using sharp
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
      processedBuffer = await sharp(imageBuffer).png().toBuffer();
    }

    const pdfDoc = await PDFDocument.create();
    let image;

    const finalExt = ['.png'].includes(ext) || !['.jpg', '.jpeg'].includes(ext) ? '.png' : ext;

    if (finalExt === '.png' || !['.jpg', '.jpeg'].includes(ext)) {
      if (!['.png'].includes(ext)) {
        image = await pdfDoc.embedPng(processedBuffer);
      } else {
        image = await pdfDoc.embedPng(imageBuffer);
      }
    } else {
      image = await pdfDoc.embedJpg(imageBuffer);
    }

    const { width, height } = image.scale(1);
    const maxWidth = 595;
    const maxHeight = 842;
    let scale = Math.min(maxWidth / width, maxHeight / height, 1);
    const scaledW = width * scale;
    const scaledH = height * scale;

    const page = pdfDoc.addPage([Math.max(scaledW + 40, 595), Math.max(scaledH + 40, 842)]);
    const pageW = page.getWidth();
    const pageH = page.getHeight();

    page.drawImage(image, {
      x: (pageW - scaledW) / 2,
      y: (pageH - scaledH) / 2,
      width: scaledW,
      height: scaledH
    });

    const pdfBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(pdfBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Merge PDFs ───
ipcMain.handle('merge-pdfs', async (event, filePaths) => {
  try {
    const mergedPdf = await PDFDocument.create();

    for (const filePath of filePaths) {
      const fileBuffer = fs.readFileSync(filePath);
      const pdf = await PDFDocument.load(fileBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();
    return { success: true, data: Buffer.from(pdfBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Append PDF to PDF (Base64) ───
ipcMain.handle('append-pdf-to-pdf', async (event, base64Data1, base64Data2) => {
  try {
    const pdf1 = await PDFDocument.load(Buffer.from(base64Data1, 'base64'));
    const pdf2 = await PDFDocument.load(Buffer.from(base64Data2, 'base64'));
    const copiedPages = await pdf1.copyPages(pdf2, pdf2.getPageIndices());
    copiedPages.forEach(page => pdf1.addPage(page));
    const pdfBytes = await pdf1.save();
    return { success: true, data: Buffer.from(pdfBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Reorder Pages ───
ipcMain.handle('reorder-pages', async (event, base64Data, newOrder) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const srcPdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const copiedPages = await newPdf.copyPages(srcPdf, newOrder);
    copiedPages.forEach(page => newPdf.addPage(page));

    const resultBytes = await newPdf.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Delete Page ───
ipcMain.handle('delete-page', async (event, base64Data, pageIndex) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const srcPdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const indices = srcPdf.getPageIndices().filter(i => i !== pageIndex);
    const copiedPages = await newPdf.copyPages(srcPdf, indices);
    copiedPages.forEach(page => newPdf.addPage(page));

    const resultBytes = await newPdf.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Create Blank PDF ───
ipcMain.handle('create-blank-pdf', async () => {
  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595, 842]);
    const pdfBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(pdfBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Add Text to PDF ───
ipcMain.handle('add-text-to-pdf', async (event, base64Data, pageIndex, text, x, y, fontSize, colorHex) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.getPage(pageIndex);

    // Parse hex color
    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    let cleanText = text
      .replace(/\t/g, '    ')
      .replace(/\r/g, '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2026]/g, '...')
      .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');

    page.drawText(cleanText, {
      x: x,
      y: y,
      size: fontSize || 14,
      font,
      color: rgb(r, g, b)
    });

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Get PDF Info ───
ipcMain.handle('get-pdf-info', async (event, base64Data) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    const pages = [];
    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      pages.push({ index: i, width, height });
    }
    return { success: true, pageCount, pages };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Get PDF Previews (Thumbnails) ───
ipcMain.handle('get-pdf-previews', async (event, base64Data) => {
  try {
    const pdf2img = require('pdf-img-convert');
    // Convertir a imágenes pequeñas para rápido renderizado (anchura 200)
    const images = await pdf2img.convert(Buffer.from(base64Data, 'base64'), { width: 200 });
    const base64Images = images.map(imgBuffer => Buffer.from(imgBuffer).toString('base64'));
    return { success: true, data: base64Images };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Rename File ───
ipcMain.handle('rename-file', async (event, oldPath, newName) => {
  try {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    fs.renameSync(oldPath, newPath);
    return { success: true, newPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Add Image to PDF ───
ipcMain.handle('add-image-to-pdf', async (event, base64Data, pageIndex, imageBase64, x, y, width, height) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(pageIndex);

    const imgBuffer = Buffer.from(imageBase64, 'base64');
    let image;

    if (imageBase64.startsWith('data:image/png')) {
      image = await pdfDoc.embedPng(imgBuffer);
    } else {
      image = await pdfDoc.embedJpg(imgBuffer);
    }

    page.drawImage(image, {
      x: x,
      y: y,
      width: width || 200,
      height: height || 150
    });

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Add Shape (Rectangle) to PDF ───
ipcMain.handle('add-shape-to-pdf', async (event, base64Data, pageIndex, shapeType, x, y, width, height, colorHex, borderColorHex, borderWidth, opacity) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(pageIndex);

    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    const br = borderColorHex ? parseInt(borderColorHex.slice(1, 3), 16) / 255 : r;
    const bg = borderColorHex ? parseInt(borderColorHex.slice(3, 5), 16) / 255 : g;
    const bb = borderColorHex ? parseInt(borderColorHex.slice(5, 7), 16) / 255 : b;

    const drawOptions = {
      x: x,
      y: y,
      width: width,
      height: height,
      color: rgb(r, g, b),
      borderColor: borderColorHex ? rgb(br, bg, bb) : undefined,
      borderWidth: borderWidth || 0,
      opacity: opacity || 1
    };

    if (shapeType === 'rectangle') {
      page.drawRectangle(drawOptions);
    } else if (shapeType === 'square') {
      const size = Math.min(width, height);
      page.drawRectangle({
        ...drawOptions,
        width: size,
        height: size
      });
    }

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Add Line to PDF ───
ipcMain.handle('add-line-to-pdf', async (event, base64Data, pageIndex, x1, y1, x2, y2, colorHex, lineWidth) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(pageIndex);

    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      color: rgb(r, g, b),
      thickness: lineWidth || 1
    });

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Add Watermark to PDF ───
ipcMain.handle('add-watermark-to-pdf', async (event, base64Data, text, fontSize, colorHex, opacity, rotation, diagonal) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();

      let x, y, rotationRad;

      if (diagonal) {
        x = width / 2;
        y = height / 2;
        rotationRad = -45 * (Math.PI / 180);
      } else {
        x = width / 2;
        y = height / 2;
        rotationRad = rotation ? (rotation * Math.PI / 180) : 0;
      }

      page.drawText(text, {
        x: x,
        y: y,
        size: fontSize || 40,
        font,
        color: rgb(r, g, b),
        opacity: opacity || 0.3,
        rotate: rotationRad,
        align: 'center'
      });
    }

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Add Page Numbering to PDF ───
ipcMain.handle('add-page-numbers-to-pdf', async (event, base64Data, position, fontSize, colorHex) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    const pages = pdfDoc.getPages();
    const pageCount = pages.length;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const pageNum = (i + 1).toString();
      const text = `Página ${pageNum} de ${pageCount}`;
      const textWidth = font.widthOfTextAtSize(text, fontSize || 10);

      let x, y;

      if (position === 'bottom-center') {
        x = (width - textWidth) / 2;
        y = 20;
      } else if (position === 'bottom-right') {
        x = width - textWidth - 20;
        y = 20;
      } else if (position === 'top-center') {
        x = (width - textWidth) / 2;
        y = height - 30;
      } else if (position === 'top-right') {
        x = width - textWidth - 20;
        y = height - 30;
      } else {
        x = 20;
        y = 20;
      }

      page.drawText(text, {
        x,
        y,
        size: fontSize || 10,
        font,
        color: rgb(r, g, b)
      });
    }

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Rotate Page ───
ipcMain.handle('rotate-page', async (event, base64Data, pageIndex, degrees) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(pageIndex);

    const currentRotation = page.getRotation().angle;
    page.setRotation({ type: 'degrees', angle: currentRotation + degrees });

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Crop Page ───
ipcMain.handle('crop-page', async (event, base64Data, pageIndex, x, y, width, height) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(pageIndex);

    page.setMediaBox(x, y, width, height);

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Extract Pages ───
ipcMain.handle('extract-pages', async (event, base64Data, pageIndices) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const srcPdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const copiedPages = await newPdf.copyPages(srcPdf, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));

    const resultBytes = await newPdf.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Split PDF ───
ipcMain.handle('split-pdf', async (event, base64Data, splitAfterPage) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const srcPdf = await PDFDocument.load(pdfBytes);

    const newPdf1 = await PDFDocument.create();
    const newPdf2 = await PDFDocument.create();

    const pageIndices1 = [];
    const pageIndices2 = [];

    for (let i = 0; i < srcPdf.getPageCount(); i++) {
      if (i < splitAfterPage) {
        pageIndices1.push(i);
      } else {
        pageIndices2.push(i);
      }
    }

    const copiedPages1 = await newPdf1.copyPages(srcPdf, pageIndices1);
    copiedPages1.forEach(page => newPdf1.addPage(page));

    const copiedPages2 = await newPdf2.copyPages(srcPdf, pageIndices2);
    copiedPages2.forEach(page => newPdf2.addPage(page));

    const result1 = await newPdf1.save();
    const result2 = await newPdf2.save();

    return {
      success: true,
      data: {
        part1: Buffer.from(result1).toString('base64'),
        part2: Buffer.from(result2).toString('base64')
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Add Hyperlink to PDF ───
ipcMain.handle('add-hyperlink-to-pdf', async (event, base64Data, pageIndex, text, url, x, y, fontSize, colorHex) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.getPage(pageIndex);

    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    page.drawText(text, {
      x,
      y,
      size: fontSize || 12,
      font,
      color: rgb(r, g, b)
    });

    const textWidth = font.widthOfTextAtSize(text, fontSize || 12);
    page.doc.context.register(page, {
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + textWidth, y + (fontSize || 12)],
      Border: [0, 0, 0],
      Dest: [url]
    });

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Add Header/Footer to PDF ───
ipcMain.handle('add-header-footer-to-pdf', async (event, base64Data, headerText, footerText, fontSize, colorHex, margin) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    const pages = pdfDoc.getPages();
    const marginVal = margin || 20;

    for (const page of pages) {
      const { width, height } = page.getSize();

      if (headerText) {
        const textWidth = font.widthOfTextAtSize(headerText, fontSize || 10);
        page.drawText(headerText, {
          x: (width - textWidth) / 2,
          y: height - marginVal,
          size: fontSize || 10,
          font,
          color: rgb(r, g, b)
        });
      }

      if (footerText) {
        const textWidth = font.widthOfTextAtSize(footerText, fontSize || 10);
        page.drawText(footerText, {
          x: (width - textWidth) / 2,
          y: marginVal,
          size: fontSize || 10,
          font,
          color: rgb(r, g, b)
        });
      }
    }

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Add Page to PDF ───
ipcMain.handle('add-page-to-pdf', async (event, base64Data) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.addPage([595, 842]);
    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Find and Replace Text in PDF ───
ipcMain.handle('find-replace-text', async (event, base64Data, searchText, replaceText, caseSensitive) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let replacements = 0;
    const searchRegex = new RegExp(searchText, caseSensitive ? 'g' : 'gi');

    for (const page of pages) {
      const { height } = page.getSize();
      const textContent = page.getTextContent();

      const items = textContent.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (searchRegex.test(item.str)) {
          const newText = item.str.replace(searchRegex, replaceText);
          const x = item.transform[4];
          const y = item.transform[5];
          const size = item.transform[0];

          page.drawText(newText, {
            x,
            y,
            size,
            font,
            color: rgb(0, 0, 0)
          });

          page.drawText(' '.repeat(item.str.length), {
            x,
            y,
            size,
            font,
            color: rgb(1, 1, 1)
          });

          replacements++;
        }
      }
    }

    const resultBytes = await pdfDoc.save();
    return {
      success: true,
      data: Buffer.from(resultBytes).toString('base64'),
      replacements
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Extract All Text from PDF ───
ipcMain.handle('extract-pdf-text', async (event, base64Data) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    const extractedText = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const textContent = page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      extractedText.push({
        page: i + 1,
        text: pageText
      });
    }

    return {
      success: true,
      data: extractedText
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Replace Page Text (Complete Rewrite) ───
ipcMain.handle('replace-page-text', async (event, base64Data, pageIndex, newText, fontSize, colorHex) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(pageIndex);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { width, height } = page.getSize();

    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    const lines = newText.split('\n');
    const lineHeight = fontSize * 1.5;
    const maxWidth = width - 40;
    const wrappedLines = [];

    for (const line of lines) {
      if (font.widthOfTextAtSize(line, fontSize) <= maxWidth) {
        wrappedLines.push(line);
      } else {
        let currentLine = '';
        const words = line.split(' ');
        for (const word of words) {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) wrappedLines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) wrappedLines.push(currentLine);
      }
    }

    let y = height - 30;
    for (const line of wrappedLines) {
      if (y < 20) break;
      page.drawText(line, {
        x: 20,
        y,
        size: fontSize,
        font,
        color: rgb(r, g, b)
      });
      y -= lineHeight;
    }

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('edit-text-location', async (event, base64Data, pageIndex, edits) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(pageIndex);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { height } = page.getSize();

    for (const edit of edits) {
      const { x, y, text, size, colorHex } = edit;

      const r = parseInt(colorHex.slice(1, 3), 16) / 255;
      const g = parseInt(colorHex.slice(3, 5), 16) / 255;
      const b = parseInt(colorHex.slice(5, 7), 16) / 255;

      page.drawText(text, {
        x,
        y,
        size: size || 12,
        font,
        color: rgb(r, g, b)
      });
    }

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ═══════════════════════════════════════════════════
// NEW TOOL HANDLERS
// ═══════════════════════════════════════════════════

// ─── Convert PowerPoint to PDF via MS PowerPoint COM ───
ipcMain.handle('convert-ppt-to-pdf', async (event, filePath) => {
  return new Promise((resolve) => {
    try {
      const os = require('os');
      const { exec } = require('child_process');
      const pdfPath = path.join(os.tmpdir(), `openpdf_ppt_${Date.now()}.pdf`);

      const psScript = `
        $ppt = New-Object -ComObject PowerPoint.Application
        try {
          $pres = $ppt.Presentations.Open('${filePath.replace(/'/g, "''")}', $true, $false, $false)
          $pres.SaveAs('${pdfPath.replace(/'/g, "''")}', 32)
          $pres.Close()
        } finally {
          $ppt.Quit()
          [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
        }
      `;

      exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ';')}"`, { timeout: 60000 }, (error) => {
        if (error) {
          resolve({ success: false, error: 'Requiere Microsoft PowerPoint instalado.' });
          return;
        }
        try {
          const pdfBuffer = fs.readFileSync(pdfPath);
          fs.unlinkSync(pdfPath);
          resolve({ success: true, data: Buffer.from(pdfBuffer).toString('base64') });
        } catch (e) {
          resolve({ success: false, error: 'No se pudo generar el PDF desde PowerPoint.' });
        }
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

// ─── Convert Excel to PDF via MS Excel COM ───
ipcMain.handle('convert-excel-to-pdf', async (event, filePath) => {
  return new Promise((resolve) => {
    try {
      const os = require('os');
      const { exec } = require('child_process');
      const pdfPath = path.join(os.tmpdir(), `openpdf_excel_${Date.now()}.pdf`);

      const psScript = `
        $excel = New-Object -ComObject Excel.Application
        $excel.Visible = $false
        try {
          $wb = $excel.Workbooks.Open('${filePath.replace(/'/g, "''")}')
          $wb.ExportAsFixedFormat(0, '${pdfPath.replace(/'/g, "''")}')
          $wb.Close($false)
        } finally {
          $excel.Quit()
          [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
        }
      `;

      exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ';')}"`, { timeout: 60000 }, (error) => {
        if (error) {
          resolve({ success: false, error: 'Requiere Microsoft Excel instalado.' });
          return;
        }
        try {
          const pdfBuffer = fs.readFileSync(pdfPath);
          fs.unlinkSync(pdfPath);
          resolve({ success: true, data: Buffer.from(pdfBuffer).toString('base64') });
        } catch (e) {
          resolve({ success: false, error: 'No se pudo generar el PDF desde Excel.' });
        }
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

// ─── Split PDF into individual pages ───
ipcMain.handle('split-pdf-all', async (event, base64Data) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const srcPdf = await PDFDocument.load(pdfBytes);
    const totalPages = srcPdf.getPageCount();
    const results = [];

    for (let i = 0; i < totalPages; i++) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(srcPdf, [i]);
      newPdf.addPage(copiedPage);
      const pageBytes = await newPdf.save();
      results.push(Buffer.from(pageBytes).toString('base64'));
    }

    return { success: true, data: results, totalPages };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Split PDF by range ───
ipcMain.handle('split-pdf-range', async (event, base64Data, startPage, endPage) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const srcPdf = await PDFDocument.load(pdfBytes);
    const newPdf = await PDFDocument.create();

    const indices = [];
    for (let i = startPage; i <= endPage; i++) {
      indices.push(i);
    }

    const copiedPages = await newPdf.copyPages(srcPdf, indices);
    copiedPages.forEach(page => newPdf.addPage(page));

    const resultBytes = await newPdf.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Compress PDF ───
ipcMain.handle('compress-pdf', async (event, base64Data) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const originalSize = pdfBytes.length;

    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true
    });

    // Save with optimizations - remove unused objects
    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    const compressedSize = compressedBytes.length;
    const savings = Math.round((1 - compressedSize / originalSize) * 100);

    return {
      success: true,
      data: Buffer.from(compressedBytes).toString('base64'),
      originalSize,
      compressedSize,
      savings
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Crop PDF Pages ───
ipcMain.handle('crop-pdf', async (event, base64Data, cropBox, applyToAll) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    const { left, bottom, right, top } = cropBox;

    const pagesToCrop = applyToAll ? pages : [pages[0]];

    for (const page of pagesToCrop) {
      const { width, height } = page.getSize();
      page.setCropBox(
        left,
        bottom,
        width - left - right,
        height - bottom - top
      );
    }

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Redact (censor) areas in PDF ───
ipcMain.handle('redact-pdf', async (event, base64Data, pageIndex, areas) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(pageIndex);

    for (const area of areas) {
      page.drawRectangle({
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
        color: rgb(0, 0, 0),
        opacity: 1,
        borderWidth: 0
      });
    }

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Sign PDF (embed signature image) ───
ipcMain.handle('sign-pdf', async (event, base64Data, pageIndex, signatureBase64, x, y, width, height) => {
  try {
    const pdfBytes = Buffer.from(base64Data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(pageIndex);

    const sigBytes = Buffer.from(signatureBase64, 'base64');
    const sigImage = await pdfDoc.embedPng(sigBytes);

    page.drawImage(sigImage, {
      x: x || 50,
      y: y || 50,
      width: width || 200,
      height: height || 80
    });

    const resultBytes = await pdfDoc.save();
    return { success: true, data: Buffer.from(resultBytes).toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Protect PDF (password) ───
ipcMain.handle('protect-pdf', async (event, base64Data, password) => {
  try {
    const os = require('os');
    const { execFileSync } = require('child_process');

    const inputPath = path.join(os.tmpdir(), `openpdf_protect_in_${Date.now()}.pdf`);
    const outputPath = path.join(os.tmpdir(), `openpdf_protect_out_${Date.now()}.pdf`);

    const pdfBytes = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(inputPath, pdfBytes);

    const qpdfBin = app.isPackaged 
      ? path.join(process.resourcesPath, 'bin', 'qpdf.exe')
      : path.join(__dirname, 'bin', 'qpdf.exe');

    try {
      execFileSync(qpdfBin, [
        '--encrypt', password, password, '256', '--',
        inputPath, outputPath
      ], { timeout: 30000 });

      const resultBuffer = fs.readFileSync(outputPath);
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
      return { success: true, data: Buffer.from(resultBuffer).toString('base64') };
    } catch (cmdErr) {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      return { success: false, error: 'Hubo un error al proteger el PDF. Verifica que contenga páginas válidas.' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Unlock PDF ───
ipcMain.handle('unlock-pdf', async (event, base64Data, password) => {
  try {
    const os = require('os');
    const { execFileSync } = require('child_process');

    const inputPath = path.join(os.tmpdir(), `openpdf_unlock_in_${Date.now()}.pdf`);
    const outputPath = path.join(os.tmpdir(), `openpdf_unlock_out_${Date.now()}.pdf`);

    const pdfBytes = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(inputPath, pdfBytes);

    const qpdfBin = app.isPackaged 
      ? path.join(process.resourcesPath, 'bin', 'qpdf.exe')
      : path.join(__dirname, 'bin', 'qpdf.exe');

    try {
      execFileSync(qpdfBin, [
        `--password=${password}`, '--decrypt',
        inputPath, outputPath
      ], { timeout: 30000 });
      
      const resultBuffer = fs.readFileSync(outputPath);
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
      return { success: true, data: Buffer.from(resultBuffer).toString('base64') };
    } catch (cmdErr) {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      return { success: false, error: 'Contraseña incorrecta o PDF malformado.' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Translate Text (using MyMemory free API) ───
ipcMain.handle('translate-text', async (event, text, sourceLang, targetLang) => {
  try {
    const https = require('https');
    const chunks = [];

    // Split text into manageable chunks (API limit ~500 chars)
    const maxChunkSize = 450;
    const textChunks = [];
    let current = '';
    for (const sentence of text.split(/(?<=[.!?\n])/)) {
      if ((current + sentence).length > maxChunkSize && current.length > 0) {
        textChunks.push(current);
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current) textChunks.push(current);

    const translatedChunks = [];

    for (const chunk of textChunks) {
      const encoded = encodeURIComponent(chunk.trim());
      const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${sourceLang}|${targetLang}`;

      const result = await new Promise((resolve, reject) => {
        https.get(url, (res) => {
          let data = '';
          res.on('data', d => data += d);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.responseData && json.responseData.translatedText) {
                resolve(json.responseData.translatedText);
              } else {
                resolve(chunk); // Return original if translation fails
              }
            } catch (e) {
              resolve(chunk);
            }
          });
        }).on('error', () => resolve(chunk));
      });

      translatedChunks.push(result);
    }

    return { success: true, data: translatedChunks.join(' ') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Save multiple files (for split) ───
ipcMain.handle('save-split-files', async (event, base64Array, baseName) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Seleccionar carpeta para guardar las páginas'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Cancelado' };
    }

    const dir = result.filePaths[0];
    const nameBase = baseName.replace('.pdf', '');

    for (let i = 0; i < base64Array.length; i++) {
      const fileName = `${nameBase}_pagina_${i + 1}.pdf`;
      const filePath = path.join(dir, fileName);
      const buffer = Buffer.from(base64Array[i], 'base64');
      fs.writeFileSync(filePath, buffer);
    }

    return { success: true, savedCount: base64Array.length, directory: dir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
