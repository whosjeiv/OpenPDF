const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Window controls
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),

    // File operations
    openFileDialog: (filters) => ipcRenderer.invoke('open-file-dialog', filters),
    saveFileDialog: (defaultName) => ipcRenderer.invoke('save-file-dialog', defaultName),
    readFile: (path) => ipcRenderer.invoke('read-file', path),
    saveFile: (path, data) => ipcRenderer.invoke('save-file', path, data),
    renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', oldPath, newName),

    // PDF operations
    convertWordToPdf: (path) => ipcRenderer.invoke('convert-word-to-pdf', path),
    convertPdfToWord: (path) => ipcRenderer.invoke('convert-pdf-to-word', path),
    convertPdfToImage: (path) => ipcRenderer.invoke('convert-pdf-to-image', path),
    convertImageToPdf: (path) => ipcRenderer.invoke('convert-image-to-pdf', path),
    mergePdfs: (paths) => ipcRenderer.invoke('merge-pdfs', paths),
    appendPdfToPdf: (data1, data2) => ipcRenderer.invoke('append-pdf-to-pdf', data1, data2),
    reorderPages: (data, order) => ipcRenderer.invoke('reorder-pages', data, order),
    deletePage: (data, index) => ipcRenderer.invoke('delete-page', data, index),
    createBlankPdf: () => ipcRenderer.invoke('create-blank-pdf'),
    addTextToPdf: (data, pageIndex, text, x, y, fontSize, color) =>
        ipcRenderer.invoke('add-text-to-pdf', data, pageIndex, text, x, y, fontSize, color),
    getPdfInfo: (data) => ipcRenderer.invoke('get-pdf-info', data),
    getPdfPreviews: (data) => ipcRenderer.invoke('get-pdf-previews', data),
    addPageToPdf: (data) => ipcRenderer.invoke('add-page-to-pdf', data),
    rotatePage: (data, pageIndex, degrees) => ipcRenderer.invoke('rotate-page', data, pageIndex, degrees),
    addImageToPdf: (data, pageIndex, imageBase64, x, y, w, h) =>
        ipcRenderer.invoke('add-image-to-pdf', data, pageIndex, imageBase64, x, y, w, h),
    addWatermarkToPdf: (data, text, fontSize, color, opacity, rotation, diagonal) =>
        ipcRenderer.invoke('add-watermark-to-pdf', data, text, fontSize, color, opacity, rotation, diagonal),
    addPageNumbersToPdf: (data, position, fontSize, color) =>
        ipcRenderer.invoke('add-page-numbers-to-pdf', data, position, fontSize, color),
    addHeaderFooterToPdf: (data, header, footer, fontSize, color, margin) =>
        ipcRenderer.invoke('add-header-footer-to-pdf', data, header, footer, fontSize, color, margin),
    addShapeToPdf: (data, pageIndex, type, x, y, w, h, color, borderColor, borderW, opacity) =>
        ipcRenderer.invoke('add-shape-to-pdf', data, pageIndex, type, x, y, w, h, color, borderColor, borderW, opacity),
    addHyperlinkToPdf: (data, pageIndex, text, url, x, y, fontSize, color) =>
        ipcRenderer.invoke('add-hyperlink-to-pdf', data, pageIndex, text, url, x, y, fontSize, color),
    extractPdfText: (data) => ipcRenderer.invoke('extract-pdf-text', data),
    replacePageText: (data, pageIndex, text, fontSize, color) =>
        ipcRenderer.invoke('replace-page-text', data, pageIndex, text, fontSize, color),
    findReplaceText: (data, search, replace, caseSensitive) =>
        ipcRenderer.invoke('find-replace-text', data, search, replace, caseSensitive),
    extractPages: (data, indices) => ipcRenderer.invoke('extract-pages', data, indices),
    splitPdf: (data, splitAfterPage) => ipcRenderer.invoke('split-pdf', data, splitAfterPage),

    // ─── New Tool APIs ───
    convertPptToPdf: (path) => ipcRenderer.invoke('convert-ppt-to-pdf', path),
    convertExcelToPdf: (path) => ipcRenderer.invoke('convert-excel-to-pdf', path),
    splitPdfAll: (data) => ipcRenderer.invoke('split-pdf-all', data),
    splitPdfRange: (data, start, end) => ipcRenderer.invoke('split-pdf-range', data, start, end),
    compressPdf: (data) => ipcRenderer.invoke('compress-pdf', data),
    cropPdf: (data, cropBox, applyToAll) => ipcRenderer.invoke('crop-pdf', data, cropBox, applyToAll),
    redactPdf: (data, pageIndex, areas) => ipcRenderer.invoke('redact-pdf', data, pageIndex, areas),
    signPdf: (data, pageIndex, sigBase64, x, y, w, h) =>
        ipcRenderer.invoke('sign-pdf', data, pageIndex, sigBase64, x, y, w, h),
    protectPdf: (data, password) => ipcRenderer.invoke('protect-pdf', data, password),
    unlockPdf: (data, password) => ipcRenderer.invoke('unlock-pdf', data, password),
    translateText: (text, source, target) => ipcRenderer.invoke('translate-text', text, source, target),
    saveSplitFiles: (base64Array, baseName) => ipcRenderer.invoke('save-split-files', base64Array, baseName),
});
