/* ═══════════════════════════════════════════════════
   OpenPDF - Renderer Application Logic
   ═══════════════════════════════════════════════════ */

// ─── State ───
const state = {
    currentView: 'home',
    convertFiles: [],
    mergeFiles: [],
    editPdf: null,
    editFilePath: null,
    editPageIndex: 0,
    organizePdf: null,
    organizePdf: null,
    organizeFilePath: null,
    organizePageOrder: [],
    organizePreviews: [],
    organizePageInfo: [],
    convertFromFiles: []
};

// ─── PDF.js Global Worker ───
if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
}

// ─── Render Thumbnail Helper ───
async function generateAllPreviews(base64Data) {
    try {
        const _pdfData = atob(base64Data);
        const uint8Array = new Uint8Array(_pdfData.length);
        for (let i = 0; i < _pdfData.length; i++) {
            uint8Array[i] = _pdfData.charCodeAt(i);
        }

        const loadingTask = window.pdfjsLib.getDocument({ data: uint8Array });
        const pdfDocument = await loadingTask.promise;
        const previews = [];

        for (let i = 1; i <= pdfDocument.numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const viewport = page.getViewport({ scale: 1.0 });
            const scale = 300 / viewport.width; // 300px width target
            const scaledViewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            await page.render({
                canvasContext: context,
                viewport: scaledViewport
            }).promise;

            previews.push(canvas.toDataURL('image/png'));
        }
        return previews;
    } catch (e) {
        console.error("Error generating local PDF previews:", e);
        return [];
    }
}

// ─── Utility Functions ───
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    toast.innerHTML = `
    <span class="material-icons-round toast-icon">${icons[type]}</span>
    <span>${message}</span>
  `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function showLoading(text = 'Procesando...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function getFileType(ext) {
    if (['.pdf'].includes(ext)) return 'pdf';
    if (['.docx', '.doc'].includes(ext)) return 'word';
    return 'image';
}

function getFileTypeName(ext) {
    const names = {
        '.pdf': 'PDF', '.docx': 'Word', '.doc': 'Word',
        '.png': 'PNG', '.jpg': 'JPEG', '.jpeg': 'JPEG',
        '.bmp': 'BMP', '.gif': 'GIF', '.tiff': 'TIFF', '.webp': 'WebP'
    };
    return names[ext] || 'Archivo';
}

function togglePasswordVisibility(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.textContent = 'visibility';
    } else {
        input.type = 'password';
        iconElement.textContent = 'visibility_off';
    }
}

// ─── Navigation ───
function switchView(viewName) {
    state.currentView = viewName;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const view = document.getElementById(`view-${viewName}`);
    const nav = document.querySelector(`[data-view="${viewName}"]`);

    if (view) view.classList.add('active');
    if (nav) nav.classList.add('active');

    if (viewName === 'edit' && editor.pdfData) {
        setTimeout(() => editor.fitToPage(), 100);
    }
}

// Event listeners for navigation
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// Home hero cards
document.querySelectorAll('.hero-card').forEach(card => {
    card.addEventListener('click', () => switchView(card.dataset.action));
});

// ─── Window Controls ───
document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.api.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.api.close());

// ═══════════════════════════════════════════════════
// CONVERT VIEW
// ═══════════════════════════════════════════════════
document.getElementById('btn-convert-browse').addEventListener('click', async () => {
    const files = await window.api.openFileDialog([
        { name: 'Supported Files', extensions: ['docx', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'tiff', 'webp'] }
    ]);
    if (files && files.length > 0) {
        addConvertFiles(files);
    }
});

// Tab logic
document.getElementById('tab-to-pdf').addEventListener('click', () => {
    document.getElementById('tab-to-pdf').className = 'btn btn-primary';
    document.getElementById('tab-from-pdf').className = 'btn btn-secondary';
    document.getElementById('panel-to-pdf').style.display = 'block';
    document.getElementById('panel-from-pdf').style.display = 'none';
});

document.getElementById('tab-from-pdf').addEventListener('click', () => {
    document.getElementById('tab-from-pdf').className = 'btn btn-primary';
    document.getElementById('tab-to-pdf').className = 'btn btn-secondary';
    document.getElementById('panel-from-pdf').style.display = 'block';
    document.getElementById('panel-to-pdf').style.display = 'none';
});

// FROM PDF logic
document.getElementById('btn-convert-from-browse').addEventListener('click', async () => {
    const files = await window.api.openFileDialog([
        { name: 'PDF', extensions: ['pdf'] }
    ]);
    if (files && files.length > 0) {
        addConvertFromFiles(files);
    }
});

function addConvertFromFiles(filePaths) {
    for (const fp of filePaths) {
        const name = fp.split(/[/\\]/).pop();
        const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
        const exists = state.convertFromFiles.some(f => f.path === fp);
        if (!exists) {
            state.convertFromFiles.push({ path: fp, name, ext });
        }
    }
    renderConvertFromFileList();
}

function renderConvertFromFileList() {
    const container = document.getElementById('convert-from-file-list');
    const actions = document.getElementById('convert-from-actions');

    if (state.convertFromFiles.length === 0) {
        container.innerHTML = '';
        actions.style.display = 'none';
        return;
    }

    actions.style.display = 'flex';
    container.innerHTML = state.convertFromFiles.map((f, i) => `
    <div class="file-item" data-index="${i}">
      <div class="file-item-icon pdf">
        <span class="material-icons-round">picture_as_pdf</span>
      </div>
      <div class="file-item-info">
        <div class="file-item-name">${f.name}</div>
        <div class="file-item-meta">PDF File</div>
      </div>
      <div class="file-item-actions">
        <button class="btn btn-ghost" onclick="removeConvertFromFile(${i})" title="Eliminar">
          <span class="material-icons-round">close</span>
        </button>
      </div>
    </div>
  `).join('');
}

function removeConvertFromFile(index) {
    state.convertFromFiles.splice(index, 1);
    renderConvertFromFileList();
}

document.getElementById('btn-convert-to-word').addEventListener('click', async () => {
    if (state.convertFromFiles.length === 0) return;
    showLoading('Extrayendo documento Word...');
    let successCount = 0;

    for (const file of state.convertFromFiles) {
        try {
            const result = await window.api.convertPdfToWord(file.path);
            if (result.success) {
                const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
                const savePath = await window.api.saveFileDialog(`${baseName}-convertido.docx`);
                if (savePath) {
                    await window.api.saveFile(savePath, result.data);
                    successCount++;
                }
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    }
    hideLoading();
    if (successCount > 0) {
        showToast(`${successCount} PDF(s) convertido(s) a Word exitosamente`, 'success');
        state.convertFromFiles = [];
        renderConvertFromFileList();
    }
});

document.getElementById('btn-convert-to-images').addEventListener('click', async () => {
    if (state.convertFromFiles.length === 0) return;
    showLoading('Extrayendo páginas a Imágenes...');
    let successCount = 0;

    for (const file of state.convertFromFiles) {
        try {
            const result = await window.api.convertPdfToImage(file.path);
            if (result.success) {
                const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
                // Las imagenes las guardaremos pidiendo una carpeta, o auto-guardando
                // Trick: save multiple files with an index modifier without prompting 50 times
                // We'll prompt once to get a base path, then save sequentially. 
                // Pero window.api.saveFileDialog only allows one file logic natively, we need to adapt it. Let's just prompt once for the first file name format, and we extract directory.
                // Wait, openPDF was written with simple saveFileDialog. Just ask for one file.
                // For simplicity, I'll save them as page-1, page-2. 
                // I'll send an IPC to show a save dialog.
                const savePath = await window.api.saveFileDialog(`${baseName}-paginas.png`);

                if (savePath) {
                    const basePathNoExt = savePath.substring(0, savePath.lastIndexOf('.'));
                    for (let i = 0; i < result.data.length; i++) {
                        const finalPath = `${basePathNoExt}-pag${i + 1}.png`;
                        await window.api.saveFile(finalPath, result.data[i]);
                    }
                    successCount++;
                }
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    }
    hideLoading();
    if (successCount > 0) {
        showToast(`${successCount} PDF(s) extraído(s) como imágenes`, 'success');
        state.convertFromFiles = [];
        renderConvertFromFileList();
    }
});

function addConvertFiles(filePaths) {
    for (const fp of filePaths) {
        const name = fp.split(/[/\\]/).pop();
        const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
        const exists = state.convertFiles.some(f => f.path === fp);
        if (!exists) {
            state.convertFiles.push({ path: fp, name, ext });
        }
    }
    renderConvertFileList();
}

let convertSortable = null;

function renderConvertFileList() {
    const container = document.getElementById('convert-file-list');
    const actions = document.getElementById('convert-actions');

    if (state.convertFiles.length === 0) {
        container.innerHTML = '';
        actions.style.display = 'none';
        if (convertSortable) { convertSortable.destroy(); convertSortable = null; }
        return;
    }

    actions.style.display = 'flex';
    container.innerHTML = state.convertFiles.map((f, i) => `
    <div class="file-item" data-index="${i}" style="cursor: grab;">
      <div class="file-item-icon ${getFileType(f.ext)}">
        <span class="material-icons-round">${getFileType(f.ext) === 'word' ? 'description' : 'image'}</span>
      </div>
      <div class="file-item-info">
        <div class="file-item-name">${f.name}</div>
        <div class="file-item-meta">${getFileTypeName(f.ext)}</div>
      </div>
      <div class="file-item-actions">
        <button class="btn btn-ghost" onclick="removeConvertFile(${i})" title="Eliminar">
          <span class="material-icons-round">close</span>
        </button>
      </div>
    </div>
  `).join('');

    if (!convertSortable) {
        convertSortable = new Sortable(container, {
            animation: 150,
            ghostClass: 'drag-over',
            onEnd: function (evt) {
                const item = state.convertFiles.splice(evt.oldIndex, 1)[0];
                state.convertFiles.splice(evt.newIndex, 0, item);
                renderConvertFileList();
            }
        });
    }
}

function removeConvertFile(index) {
    state.convertFiles.splice(index, 1);
    renderConvertFileList();
}

document.getElementById('btn-convert-all').addEventListener('click', async () => {
    if (state.convertFiles.length === 0) return;

    const mergeCheckbox = document.getElementById('convert-merge');
    const mergeAll = mergeCheckbox ? mergeCheckbox.checked : false;

    showLoading(mergeAll ? 'Convirtiendo y uniendo archivos...' : 'Convirtiendo archivos...');
    let successCount = 0;

    if (mergeAll) {
        try {
            let finalPdfData = null;

            for (const file of state.convertFiles) {
                let result;
                if (file.ext === '.docx' || file.ext === '.doc') {
                    result = await window.api.convertWordToPdf(file.path);
                } else {
                    result = await window.api.convertImageToPdf(file.path);
                }

                if (result.success) {
                    if (!finalPdfData) {
                        finalPdfData = result.data;
                    } else {
                        const mergeResult = await window.api.appendPdfToPdf(finalPdfData, result.data);
                        if (mergeResult.success) {
                            finalPdfData = mergeResult.data;
                        } else {
                            showToast(`Error al unir ${file.name}: ${mergeResult.error}`, 'error');
                        }
                    }
                    successCount++;
                } else {
                    showToast(`Error con ${file.name}: ${result.error}`, 'error');
                }
            }

            if (finalPdfData && successCount > 0) {
                const savePath = await window.api.saveFileDialog('Archivos_Unidos.pdf');
                if (savePath) {
                    await window.api.saveFile(savePath, finalPdfData);
                    showToast(`${successCount} archivo(s) unidos exitosamente`, 'success');
                    state.convertFiles = [];
                    renderConvertFileList();
                }
            }
        } catch (err) {
            showToast(`Error al unir: ${err.message}`, 'error');
        }
    } else {
        for (const file of state.convertFiles) {
            try {
                let result;
                if (file.ext === '.docx' || file.ext === '.doc') {
                    result = await window.api.convertWordToPdf(file.path);
                } else {
                    result = await window.api.convertImageToPdf(file.path);
                }

                if (result.success) {
                    const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
                    const savePath = await window.api.saveFileDialog(`${baseName}.pdf`);
                    if (savePath) {
                        await window.api.saveFile(savePath, result.data);
                        successCount++;
                    }
                } else {
                    showToast(`Error con ${file.name}: ${result.error}`, 'error');
                }
            } catch (err) {
                showToast(`Error con ${file.name}: ${err.message}`, 'error');
            }
        }

        if (successCount > 0) {
            showToast(`${successCount} archivo(s) convertido(s) exitosamente`, 'success');
            state.convertFiles = [];
            renderConvertFileList();
        }
    }

    hideLoading();
});

// ═══════════════════════════════════════════════════
// MERGE VIEW
// ═══════════════════════════════════════════════════
document.getElementById('btn-merge-browse').addEventListener('click', async () => {
    const files = await window.api.openFileDialog([
        { name: 'PDF', extensions: ['pdf'] }
    ]);
    if (files && files.length > 0) {
        addMergeFiles(files);
    }
});

function addMergeFiles(filePaths) {
    for (const fp of filePaths) {
        const name = fp.split(/[/\\]/).pop();
        const exists = state.mergeFiles.some(f => f.path === fp);
        if (!exists) {
            state.mergeFiles.push({ path: fp, name });
        }
    }
    renderMergeFileList();
}

let mergeSortable = null;

function renderMergeFileList() {
    const container = document.getElementById('merge-file-list');
    const actions = document.getElementById('merge-actions');

    if (state.mergeFiles.length === 0) {
        container.innerHTML = '';
        actions.style.display = 'none';
        if (mergeSortable) { mergeSortable.destroy(); mergeSortable = null; }
        return;
    }

    actions.style.display = 'flex';
    container.innerHTML = state.mergeFiles.map((f, i) => `
    <div class="file-item" data-index="${i}" style="cursor: grab;">
      <div class="file-item-icon pdf">
        <span class="material-icons-round">drag_indicator</span>
      </div>
      <div class="file-item-info">
        <div class="file-item-name">${f.name}</div>
        <div class="file-item-meta">PDF · Orden: ${i + 1}</div>
      </div>
      <div class="file-item-actions">
        <button class="btn btn-ghost" onclick="removeMergeFile(${i})" title="Eliminar">
          <span class="material-icons-round">close</span>
        </button>
      </div>
    </div>
  `).join('');

    if (!mergeSortable) {
        mergeSortable = new Sortable(container, {
            animation: 150,
            ghostClass: 'drag-over',
            onEnd: function (evt) {
                if (evt.oldIndex !== evt.newIndex) {
                    const item = state.mergeFiles.splice(evt.oldIndex, 1)[0];
                    state.mergeFiles.splice(evt.newIndex, 0, item);
                    renderMergeFileList();
                }
            }
        });
    }
}

function removeMergeFile(index) {
    state.mergeFiles.splice(index, 1);
    renderMergeFileList();
}

document.getElementById('btn-merge-all').addEventListener('click', async () => {
    if (state.mergeFiles.length < 2) {
        showToast('Necesitas al menos 2 archivos para unir', 'error');
        return;
    }

    showLoading('Uniendo PDFs...');
    try {
        const paths = state.mergeFiles.map(f => f.path);
        const result = await window.api.mergePdfs(paths);

        if (result.success) {
            const savePath = await window.api.saveFileDialog('merged.pdf');
            if (savePath) {
                await window.api.saveFile(savePath, result.data);
                showToast('PDFs unidos exitosamente', 'success');
                state.mergeFiles = [];
                renderMergeFileList();
            }
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
    hideLoading();
});

// ═══════════════════════════════════════════════════
// EDIT VIEW - Advanced Editor
// ═══════════════════════════════════════════════════

const editor = {
    pdfDoc: null,
    pdfData: null,
    filePath: null,
    fileName: 'Sin título.pdf',
    currentPage: 1,
    totalPages: 1,
    zoom: 1.0,
    currentTool: 'select',
    previews: [],
    pageInfo: [],
    pendingImage: null,

    init() {
        this.bindEvents();
        this.bindToolButtons();
        this.bindModalEvents();
        this.bindZoomControls();
    },

    bindEvents() {
        document.getElementById('btn-edit-browse').addEventListener('click', () => this.openFile());
        document.getElementById('btn-add-page-thumb').addEventListener('click', () => this.addPage());
        document.getElementById('btn-add-page').addEventListener('click', () => this.addPage());
        document.getElementById('btn-delete-page').addEventListener('click', () => this.deleteCurrentPage());
        document.getElementById('btn-rotate-page-left').addEventListener('click', () => this.rotatePage(-90));
        document.getElementById('btn-rotate-page-right').addEventListener('click', () => this.rotatePage(90));

        document.getElementById('btn-edit-save').addEventListener('click', () => this.savePdf());
        document.getElementById('btn-edit-save-as').addEventListener('click', () => this.savePdfAs());

        document.getElementById('btn-add-text').addEventListener('click', () => this.toggleTextMode());
        document.getElementById('btn-add-image').addEventListener('click', () => this.showImageModal());
        document.getElementById('btn-add-watermark').addEventListener('click', () => this.showWatermarkModal());
        document.getElementById('btn-add-page-numbers').addEventListener('click', () => this.showPageNumbersModal());
        document.getElementById('btn-add-header-footer').addEventListener('click', () => this.showHeaderFooterModal());
        document.getElementById('btn-add-link').addEventListener('click', () => this.showLinkModal());
        document.getElementById('btn-add-shape').addEventListener('click', () => this.showShapeModal());
        document.getElementById('btn-crop-page').addEventListener('click', () => this.showCropModal());

        // Text editing buttons
        document.getElementById('btn-edit-find-replace').addEventListener('click', () => this.showFindReplaceModal());
        document.getElementById('btn-edit-extract-text').addEventListener('click', () => this.showExtractTextModal());

        // Editor overlay click for text placement
        const overlay = document.getElementById('editor-overlay');
        overlay.addEventListener('click', (e) => this.onOverlayClick(e));
    },

    bindToolButtons() {
        // Tool selection is handled through the modal buttons now
    },

    bindModalEvents() {
        const modals = ['text', 'image', 'watermark', 'pagenumbers', 'headerfooter', 'link', 'shape', 'crop', 'find-replace', 'extract-text'];

        modals.forEach(modal => {
            const modalEl = document.getElementById(`${modal}-modal`);
            if (!modalEl) return;

            const closeBtn = document.getElementById(`${modal}-modal-close`);
            const cancelBtn = document.getElementById(`${modal}-modal-cancel`);
            const confirmBtn = document.getElementById(`${modal}-modal-confirm`);

            if (closeBtn) closeBtn.addEventListener('click', () => modalEl.style.display = 'none');
            if (cancelBtn) cancelBtn.addEventListener('click', () => modalEl.style.display = 'none');

            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => this.handleModalConfirm(modal));
            }
        });

        // Find & Replace special handlers
        document.getElementById('btn-find-count')?.addEventListener('click', () => this.findCount());
        document.getElementById('btn-select-image').addEventListener('click', () => this.selectImage());

        // Extract text modal
        document.getElementById('extract-page-select')?.addEventListener('change', (e) => this.loadPageText(e.target.value));

        document.getElementById('watermark-opacity').addEventListener('input', (e) => {
            document.getElementById('watermark-opacity-val').textContent = e.target.value + '%';
        });

        document.getElementById('shape-opacity').addEventListener('input', (e) => {
            document.getElementById('shape-opacity-val').textContent = e.target.value + '%';
        });

        document.querySelectorAll('.shape-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.shape-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('shape-type').value = btn.dataset.shape;
            });
        });
    },

    bindZoomControls() {
        document.getElementById('btn-zoom-in').addEventListener('click', () => this.setZoom(this.zoom + 0.25));
        document.getElementById('btn-zoom-out').addEventListener('click', () => this.setZoom(this.zoom - 0.25));
        document.getElementById('btn-fit-page').addEventListener('click', () => this.fitToPage());
    },

    updateCanvasCursor() {
        const overlay = document.getElementById('editor-overlay');
        overlay.className = 'editor-overlay';
        if (this.textMode) {
            overlay.classList.add('text-mode');
        }
    },

    // ─── Interactive Text Editing ───
    textMode: false,
    activeTextBox: null,

    toggleTextMode() {
        this.textMode = !this.textMode;
        const btn = document.getElementById('btn-add-text');

        if (this.textMode) {
            btn.classList.add('active');
            this.updateCanvasCursor();
            showToast('Haz clic en la página para colocar texto', 'info');
        } else {
            btn.classList.remove('active');
            this.updateCanvasCursor();
            // Remove any open textbox
            if (this.activeTextBox) {
                this.cancelTextPlacement();
            }
        }
    },

    onOverlayClick(e) {
        if (!this.textMode) return;
        if (this.activeTextBox) return; // Already editing

        const overlay = document.getElementById('editor-overlay');
        const rect = overlay.getBoundingClientRect();

        // Position relative to the overlay
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        this.createTextBox(clickX, clickY);
    },

    createTextBox(x, y) {
        const overlay = document.getElementById('editor-overlay');

        // Container for the floating text editor
        const container = document.createElement('div');
        container.className = 'inline-text-editor';
        container.style.position = 'absolute';
        container.style.left = x + 'px';
        container.style.top = y + 'px';
        container.style.zIndex = '100';
        container.addEventListener('click', (e) => e.stopPropagation());

        // Mini toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'inline-text-toolbar';
        toolbar.innerHTML = `
            <input type="number" class="inline-text-size" value="14" min="6" max="72" title="Tamaño">
            <input type="color" class="inline-text-color" value="#1a1a2e" title="Color">
            <button class="inline-text-confirm" title="Confirmar (Enter)">
                <span class="material-icons-round" style="font-size:16px;">check</span>
            </button>
            <button class="inline-text-cancel" title="Cancelar (Esc)">
                <span class="material-icons-round" style="font-size:16px;">close</span>
            </button>
        `;
        container.appendChild(toolbar);

        // Textarea
        const textarea = document.createElement('textarea');
        textarea.className = 'inline-text-input';
        textarea.placeholder = 'Escribe aquí...';
        textarea.rows = 2;
        container.appendChild(textarea);

        overlay.appendChild(container);
        textarea.focus();

        this.activeTextBox = {
            container,
            textarea,
            toolbar,
            x, // screen coords relative to overlay
            y
        };

        // Events
        toolbar.querySelector('.inline-text-confirm').addEventListener('click', () => this.confirmTextPlacement());
        toolbar.querySelector('.inline-text-cancel').addEventListener('click', () => this.cancelTextPlacement());

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.confirmTextPlacement();
            } else if (e.key === 'Escape') {
                this.cancelTextPlacement();
            }
        });
    },

    async confirmTextPlacement() {
        if (!this.activeTextBox) return;

        const { container, textarea, toolbar, x, y } = this.activeTextBox;
        const text = textarea.value.trim();

        if (!text) {
            showToast('Escribe algún texto', 'error');
            return;
        }

        const fontSize = parseInt(toolbar.querySelector('.inline-text-size').value) || 14;
        const color = toolbar.querySelector('.inline-text-color').value;

        // Convert screen coordinates to PDF coordinates
        const canvas = document.getElementById('pdf-render-canvas');
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        // PDF coordinate system: (0,0) is bottom-left, Y goes up
        const pdfX = (x / this.zoom);
        const pdfY = ((canvasHeight - y) / this.zoom);

        showLoading('Añadiendo texto...');

        try {
            // For multi-line text, add each line separately
            const lines = text.split('\n');
            let currentPdf = this.pdfData;
            let currentY = pdfY;

            for (const line of lines) {
                if (line.trim()) {
                    const result = await window.api.addTextToPdf(currentPdf, this.currentPage - 1, line, pdfX, currentY, fontSize, color);
                    if (result.success) {
                        currentPdf = result.data;
                    }
                }
                currentY -= (fontSize * 1.4); // Line spacing
            }

            this.pdfData = currentPdf;
            await this.generatePreviews();
            this.renderPageNav();
            await this.renderCurrentPage();
            showToast('Texto añadido', 'success');
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        // Clean up
        container.remove();
        this.activeTextBox = null;
        hideLoading();
    },

    cancelTextPlacement() {
        if (!this.activeTextBox) return;
        this.activeTextBox.container.remove();
        this.activeTextBox = null;
    },

    async openFile() {
        const files = await window.api.openFileDialog([
            { name: 'PDF', extensions: ['pdf'] }
        ]);

        if (files && files.length > 0) {
            await this.loadPdf(files[0]);
        }
    },

    async loadPdf(filePath) {
        showLoading('Cargando PDF...');

        try {
            const fileResult = await window.api.readFile(filePath);
            if (!fileResult.success) throw new Error(fileResult.error);

            this.pdfData = fileResult.data;
            this.filePath = filePath;
            this.fileName = fileResult.name;

            document.getElementById('edit-filename-display').textContent = this.fileName;

            const info = await window.api.getPdfInfo(this.pdfData);
            if (!info.success) throw new Error('No se pudo obtener info del PDF');

            this.totalPages = info.pageCount;
            this.currentPage = 1;

            document.getElementById('edit-dropzone').style.display = 'none';
            document.getElementById('edit-container').style.display = 'block';

            await this.generatePreviews();
            this.renderPageNav();
            await this.renderCurrentPage();
            this.updatePageInfo();

        } catch (err) {
            showToast(`Error cargando PDF: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async generatePreviews() {
        this.previews = await generateAllPreviews(this.pdfData);
    },

    renderPageNav() {
        const nav = document.getElementById('page-navigator');

        nav.innerHTML = '';

        for (let i = 1; i <= this.totalPages; i++) {
            const thumb = document.createElement('div');
            thumb.className = `page-nav-thumb ${i === this.currentPage ? 'active' : ''}`;
            thumb.dataset.page = i;

            if (this.previews[i - 1]) {
                const img = document.createElement('img');
                img.src = this.previews[i - 1];
                thumb.appendChild(img);
            } else {
                const icon = document.createElement('span');
                icon.className = 'material-icons-round';
                icon.textContent = 'description';
                icon.style.fontSize = '32px';
                icon.style.color = 'var(--border)';
                thumb.appendChild(icon);
            }

            const number = document.createElement('div');
            number.className = 'page-nav-thumb-number';
            number.textContent = i;
            thumb.appendChild(number);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'page-nav-thumb-delete';
            deleteBtn.innerHTML = '<span class="material-icons-round" style="font-size:12px;">close</span>';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePage(i);
            });
            thumb.appendChild(deleteBtn);

            thumb.addEventListener('click', () => this.goToPage(i));

            nav.appendChild(thumb);
        }
    },

    async goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.totalPages) return;

        this.currentPage = pageNum;

        document.querySelectorAll('.page-nav-thumb').forEach((thumb, i) => {
            thumb.classList.toggle('active', i + 1 === pageNum);
        });

        await this.renderCurrentPage();
        this.updatePageInfo();
    },

    async renderCurrentPage() {
        try {
            const _pdfData = atob(this.pdfData);
            const uint8Array = new Uint8Array(_pdfData.length);
            for (let i = 0; i < _pdfData.length; i++) {
                uint8Array[i] = _pdfData.charCodeAt(i);
            }

            const loadingTask = window.pdfjsLib.getDocument({ data: uint8Array });
            const pdfDocument = await loadingTask.promise;
            const page = await pdfDocument.getPage(this.currentPage);

            const canvas = document.getElementById('pdf-render-canvas');
            const context = canvas.getContext('2d');

            const baseWidth = page.getViewport({ scale: 1.0 }).width;
            const baseHeight = page.getViewport({ scale: 1.0 }).height;

            const scaledWidth = baseWidth * this.zoom;
            const scaledHeight = baseHeight * this.zoom;

            canvas.width = scaledWidth;
            canvas.height = scaledHeight;

            canvas.style.width = scaledWidth + 'px';
            canvas.style.height = scaledHeight + 'px';

            await page.render({
                canvasContext: context,
                viewport: page.getViewport({ scale: this.zoom })
            }).promise;

            document.getElementById('current-page-display').textContent = this.currentPage;
            document.getElementById('total-pages-display').textContent = this.totalPages;
            document.getElementById('filename-display').textContent = this.fileName;

        } catch (err) {
            console.error('Error rendering page:', err);
        }
    },

    updatePageInfo() {
        document.getElementById('page-info-display').textContent = `Página ${this.currentPage} de ${this.totalPages}`;
    },

    setZoom(zoom) {
        if (zoom < 0.25) zoom = 0.25;
        if (zoom > 4) zoom = 4;

        this.zoom = zoom;
        document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
        this.renderCurrentPage();
    },

    fitToPage() {
        const container = document.querySelector('.editor-canvas-container');
        const containerWidth = container.clientWidth - 40;
        const containerHeight = container.clientHeight - 40;

        const canvas = document.getElementById('pdf-render-canvas');
        const naturalWidth = canvas.width / this.zoom;
        const naturalHeight = canvas.height / this.zoom;

        const scaleX = containerWidth / naturalWidth;
        const scaleY = containerHeight / naturalHeight;

        this.setZoom(Math.min(scaleX, scaleY, 1));
    },

    async addPage() {
        showLoading('Añadiendo página...');

        try {
            const result = await window.api.addPageToPdf(this.pdfData);
            if (result.success) {
                this.pdfData = result.data;
                this.totalPages++;

                await this.generatePreviews();
                this.renderPageNav();
                await this.goToPage(this.totalPages);

                showToast('Página añadida', 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async deletePage(pageNum) {
        if (this.totalPages <= 1) {
            showToast('No puedes eliminar la única página', 'error');
            return;
        }

        showLoading('Eliminando página...');

        try {
            const result = await window.api.deletePage(this.pdfData, pageNum - 1);
            if (result.success) {
                this.pdfData = result.data;
                this.totalPages--;

                if (this.currentPage > this.totalPages) {
                    this.currentPage = this.totalPages;
                }

                await this.generatePreviews();
                this.renderPageNav();
                await this.renderCurrentPage();
                this.updatePageInfo();

                showToast('Página eliminada', 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async deleteCurrentPage() {
        await this.deletePage(this.currentPage);
    },

    async rotatePage(degrees) {
        showLoading('Rotando página...');

        try {
            const result = await window.api.rotatePage(this.pdfData, this.currentPage - 1, degrees);
            if (result.success) {
                this.pdfData = result.data;
                await this.renderCurrentPage();
                showToast('Página rotada', 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async savePdf() {
        if (!this.pdfData) return;

        showLoading('Guardando PDF...');

        try {
            if (this.filePath) {
                await window.api.saveFile(this.filePath, this.pdfData);
                showToast('PDF guardado exitosamente', 'success');
            } else {
                await this.savePdfAs();
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async savePdfAs() {
        if (!this.pdfData) return;

        const savePath = await window.api.saveFileDialog(this.fileName);

        if (savePath) {
            showLoading('Guardando PDF...');

            try {
                await window.api.saveFile(savePath, this.pdfData);
                this.filePath = savePath;
                this.fileName = savePath.split(/[/\\]/).pop();
                document.getElementById('edit-filename-display').textContent = this.fileName;
                showToast('PDF guardado exitosamente', 'success');
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }

            hideLoading();
        }
    },

    showTextModal() {
        document.getElementById('text-modal').style.display = 'flex';
    },

    showImageModal() {
        document.getElementById('image-modal').style.display = 'flex';
        document.getElementById('selected-image-preview').style.display = 'none';
        document.getElementById('preview-image').src = '';
        this.pendingImage = null;
    },

    showWatermarkModal() {
        document.getElementById('watermark-modal').style.display = 'flex';
    },

    showPageNumbersModal() {
        document.getElementById('pagenumbers-modal').style.display = 'flex';
    },

    showHeaderFooterModal() {
        document.getElementById('headerfooter-modal').style.display = 'flex';
    },

    showLinkModal() {
        document.getElementById('link-modal').style.display = 'flex';
    },

    showShapeModal() {
        document.getElementById('shape-modal').style.display = 'flex';
    },

    showCropModal() {
        const info = document.getElementById('crop-modal');
        info.style.display = 'flex';
    },

    async selectImage() {
        const files = await window.api.openFileDialog([
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
        ]);

        if (files && files.length > 0) {
            const fileResult = await window.api.readFile(files[0]);
            if (fileResult.success) {
                this.pendingImage = fileResult.data;

                const ext = files[0].toLowerCase().split('.').pop();
                const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
                const dataUrl = `data:${mimeType};base64,${fileResult.data}`;

                document.getElementById('preview-image').src = dataUrl;
                document.getElementById('selected-image-preview').style.display = 'block';
            }
        }
    },

    async handleModalConfirm(modal) {
        switch (modal) {
            case 'text':
                await this.addText();
                break;
            case 'image':
                await this.addImage();
                break;
            case 'watermark':
                await this.addWatermark();
                break;
            case 'pagenumbers':
                await this.addPageNumbers();
                break;
            case 'headerfooter':
                await this.addHeaderFooter();
                break;
            case 'link':
                await this.addLink();
                break;
            case 'shape':
                await this.addShape();
                break;
            case 'crop':
                await this.cropPage();
                break;
        }
    },

    async addText() {
        const text = document.getElementById('text-input').value.trim();
        if (!text) {
            showToast('Escribe algún texto', 'error');
            return;
        }

        const fontSize = parseInt(document.getElementById('text-size').value) || 14;
        const color = document.getElementById('text-color').value;
        const x = parseInt(document.getElementById('text-x').value) || 50;
        const y = parseInt(document.getElementById('text-y').value) || 750;

        showLoading('Añadiendo texto...');

        try {
            const result = await window.api.addTextToPdf(this.pdfData, this.currentPage - 1, text, x, y, fontSize, color);
            if (result.success) {
                this.pdfData = result.data;
                await this.renderCurrentPage();
                document.getElementById('text-modal').style.display = 'none';
                document.getElementById('text-input').value = '';
                showToast('Texto añadido exitosamente', 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async addImage() {
        if (!this.pendingImage) {
            showToast('Selecciona una imagen primero', 'error');
            return;
        }

        const x = parseInt(document.getElementById('image-x').value) || 50;
        const y = parseInt(document.getElementById('image-y').value) || 500;
        const width = parseInt(document.getElementById('image-width').value) || 200;
        const height = parseInt(document.getElementById('image-height').value) || 150;

        showLoading('Añadiendo imagen...');

        try {
            const result = await window.api.addImageToPdf(this.pdfData, this.currentPage - 1, this.pendingImage, x, y, width, height);
            if (result.success) {
                this.pdfData = result.data;
                await this.renderCurrentPage();
                document.getElementById('image-modal').style.display = 'none';
                this.pendingImage = null;
                showToast('Imagen añadida exitosamente', 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async addWatermark() {
        const text = document.getElementById('watermark-text').value.trim();
        if (!text) {
            showToast('Escribe el texto de marca de agua', 'error');
            return;
        }

        const fontSize = parseInt(document.getElementById('watermark-size').value) || 40;
        const color = document.getElementById('watermark-color').value;
        const opacity = (parseInt(document.getElementById('watermark-opacity').value) || 30) / 100;
        const rotation = parseInt(document.getElementById('watermark-rotation').value) || 0;
        const diagonal = document.getElementById('watermark-diagonal').checked;

        showLoading('Aplicando marca de agua...');

        try {
            const result = await window.api.addWatermarkToPdf(this.pdfData, text, fontSize, color, opacity, rotation, diagonal);
            if (result.success) {
                this.pdfData = result.data;
                await this.renderCurrentPage();
                document.getElementById('watermark-modal').style.display = 'none';
                showToast('Marca de agua aplicada', 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async addPageNumbers() {
        const position = document.getElementById('pagenumbers-position').value;
        const fontSize = parseInt(document.getElementById('pagenumbers-size').value) || 10;
        const color = document.getElementById('pagenumbers-color').value;

        showLoading('Aplicando numeración...');

        try {
            const result = await window.api.addPageNumbersToPdf(this.pdfData, position, fontSize, color);
            if (result.success) {
                this.pdfData = result.data;
                await this.renderCurrentPage();
                document.getElementById('pagenumbers-modal').style.display = 'none';
                showToast('Numeración aplicada', 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async addHeaderFooter() {
        const headerText = document.getElementById('header-text').value.trim();
        const footerText = document.getElementById('footer-text').value.trim();

        if (!headerText && !footerText) {
            showToast('Escribe texto para encabezado o pie', 'error');
            return;
        }

        const fontSize = parseInt(document.getElementById('headerfooter-size').value) || 10;
        const color = document.getElementById('headerfooter-color').value;
        const margin = parseInt(document.getElementById('headerfooter-margin').value) || 20;

        showLoading('Aplicando encabezado y pie...');

        try {
            const result = await window.api.addHeaderFooterToPdf(this.pdfData, headerText, footerText, fontSize, color, margin);
            if (result.success) {
                this.pdfData = result.data;
                await this.renderCurrentPage();
                document.getElementById('headerfooter-modal').style.display = 'none';
                showToast('Encabezado y pie aplicados', 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async addLink() {
        const text = document.getElementById('link-text').value.trim();
        const url = document.getElementById('link-url').value.trim();

        if (!text || !url) {
            showToast('Escribe texto y URL', 'error');
            return;
        }

        const fontSize = parseInt(document.getElementById('link-size').value) || 12;
        const color = document.getElementById('link-color').value;
        const x = parseInt(document.getElementById('link-x').value) || 50;
        const y = parseInt(document.getElementById('link-y').value) || 750;

        showLoading('Añadiendo enlace...');

        try {
            const result = await window.api.addHyperlinkToPdf(this.pdfData, this.currentPage - 1, text, url, x, y, fontSize, color);
            if (result.success) {
                this.pdfData = result.data;
                await this.renderCurrentPage();
                document.getElementById('link-modal').style.display = 'none';
                showToast('Enlace añadido exitosamente', 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async addShape() {
        const shapeType = document.getElementById('shape-type').value;

        if (shapeType === 'line') {
            const x1 = parseInt(document.getElementById('shape-x').value) || 50;
            const y1 = parseInt(document.getElementById('shape-y').value) || 500;
            const x2 = x1 + (parseInt(document.getElementById('shape-width').value) || 150);
            const y2 = y1;
            const color = document.getElementById('shape-border-color').value;
            const lineWidth = parseInt(document.getElementById('shape-border-width').value) || 1;

            showLoading('Añadiendo línea...');

            try {
                const result = await window.api.addLineToPdf(this.pdfData, this.currentPage - 1, x1, y1, x2, y2, color, lineWidth);
                if (result.success) {
                    this.pdfData = result.data;
                    await this.renderCurrentPage();
                    document.getElementById('shape-modal').style.display = 'none';
                    showToast('Línea añadida', 'success');
                } else {
                    showToast(`Error: ${result.error}`, 'error');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }
        } else {
            const x = parseInt(document.getElementById('shape-x').value) || 50;
            const y = parseInt(document.getElementById('shape-y').value) || 500;
            const width = parseInt(document.getElementById('shape-width').value) || 150;
            const height = parseInt(document.getElementById('shape-height').value) || 100;
            const color = document.getElementById('shape-color').value;
            const borderColor = document.getElementById('shape-border-color').value;
            const borderWidth = parseInt(document.getElementById('shape-border-width').value) || 1;
            const opacity = (parseInt(document.getElementById('shape-opacity').value) || 100) / 100;

            showLoading('Añadiendo forma...');

            try {
                const result = await window.api.addShapeToPdf(this.pdfData, this.currentPage - 1, shapeType, x, y, width, height, color, borderColor, borderWidth, opacity);
                if (result.success) {
                    this.pdfData = result.data;
                    await this.renderCurrentPage();
                    document.getElementById('shape-modal').style.display = 'none';
                    showToast('Forma añadida', 'success');
                } else {
                    showToast(`Error: ${result.error}`, 'error');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }
        }

        hideLoading();
    },

    async cropPage() {
        const x = parseInt(document.getElementById('crop-x').value) || 0;
        const y = parseInt(document.getElementById('crop-y').value) || 0;
        const width = parseInt(document.getElementById('crop-width').value) || 595;
        const height = parseInt(document.getElementById('crop-height').value) || 842;

        showLoading('Recortando página...');

        try {
            const result = await window.api.cropPage(this.pdfData, this.currentPage - 1, x, y, width, height);
            if (result.success) {
                this.pdfData = result.data;
                await this.renderCurrentPage();
                document.getElementById('crop-modal').style.display = 'none';
                showToast('Página recortada', 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    showFindReplaceModal() {
        document.getElementById('find-text').value = '';
        document.getElementById('replace-text').value = '';
        document.getElementById('case-sensitive').checked = false;
        document.getElementById('replace-info').style.display = 'none';
        document.getElementById('find-replace-modal').style.display = 'flex';
    },

    showExtractTextModal() {
        const select = document.getElementById('extract-page-select');
        select.innerHTML = '';

        for (let i = 1; i <= this.totalPages; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Página ${i}`;
            select.appendChild(option);
        }

        select.value = this.currentPage;
        this.loadPageText(this.currentPage);

        document.getElementById('extract-text-modal').style.display = 'flex';
    },

    async loadPageText(pageNum) {
        showLoading('Extrayendo texto...');

        try {
            const result = await window.api.extractPdfText(this.pdfData);
            if (result.success) {
                const pageData = result.data.find(p => p.page === parseInt(pageNum));
                document.getElementById('extracted-text-content').value = pageData ? pageData.text : '';
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async findCount() {
        const searchText = document.getElementById('find-text').value.trim();
        if (!searchText) {
            showToast('Escribe texto para buscar', 'error');
            return;
        }

        showLoading('Buscando...');

        try {
            const result = await window.api.extractPdfText(this.pdfData);
            if (result.success) {
                const caseSensitive = document.getElementById('case-sensitive').checked;
                const regex = new RegExp(searchText, caseSensitive ? 'g' : 'gi');

                let count = 0;
                for (const page of result.data) {
                    const matches = page.text.match(regex);
                    if (matches) count += matches.length;
                }

                document.getElementById('replace-count').textContent = count;
                document.getElementById('replace-info').style.display = 'block';

                if (count === 0) {
                    showToast('No se encontró el texto', 'info');
                }
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async handleModalConfirm(modal) {
        switch (modal) {
            case 'text':
                await this.addText();
                break;
            case 'image':
                await this.addImage();
                break;
            case 'watermark':
                await this.addWatermark();
                break;
            case 'pagenumbers':
                await this.addPageNumbers();
                break;
            case 'headerfooter':
                await this.addHeaderFooter();
                break;
            case 'link':
                await this.addLink();
                break;
            case 'shape':
                await this.addShape();
                break;
            case 'crop':
                await this.cropPage();
                break;
            case 'find-replace':
                await this.findReplace();
                break;
            case 'extract-text':
                await this.applyTextChanges();
                break;
        }
    },

    async findReplace() {
        const searchText = document.getElementById('find-text').value.trim();
        const replaceText = document.getElementById('replace-text').value;

        if (!searchText) {
            showToast('Escribe texto para buscar', 'error');
            return;
        }

        const caseSensitive = document.getElementById('case-sensitive').checked;

        showLoading('Reemplazando texto...');

        try {
            const result = await window.api.findReplaceText(this.pdfData, searchText, replaceText, caseSensitive);
            if (result.success) {
                this.pdfData = result.data;
                await this.generatePreviews();
                await this.renderCurrentPage();
                document.getElementById('find-replace-modal').style.display = 'none';
                showToast(`${result.replacements} reemplazo(s) realizado(s)`, 'success');
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    async applyTextChanges() {
        const newText = document.getElementById('extracted-text-content').value;
        const fontSize = parseInt(document.getElementById('replace-font-size').value) || 12;
        const color = document.getElementById('replace-font-color').value;
        const replaceAll = document.getElementById('replace-all-pages').checked;

        if (!newText.trim()) {
            showToast('Escribe algún texto', 'error');
            return;
        }

        showLoading('Aplicando cambios de texto...');

        try {
            if (replaceAll) {
                for (let i = 0; i < this.totalPages; i++) {
                    const result = await window.api.replacePageText(this.pdfData, i, newText, fontSize, color);
                    if (result.success) {
                        this.pdfData = result.data;
                    }
                }
            } else {
                const result = await window.api.replacePageText(this.pdfData, this.currentPage - 1, newText, fontSize, color);
                if (result.success) {
                    this.pdfData = result.data;
                } else {
                    throw new Error(result.error);
                }
            }

            await this.generatePreviews();
            await this.renderCurrentPage();
            document.getElementById('extract-text-modal').style.display = 'none';
            showToast('Texto aplicado exitosamente', 'success');
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    editor.init();
});

// ═══════════════════════════════════════════════════
// LEGACY EDIT FUNCTIONS (for compatibility)
// ═══════════════════════════════════════════════════

async function loadEditPdf(filePath) {
    await editor.loadPdf(filePath);
}

async function renderEditPages() {
    await editor.renderCurrentPage();
}

function selectEditPage(index) {
    editor.goToPage(index + 1);
}

async function deleteEditPage(index) {
    await editor.deletePage(index + 1);
}

// Make functions available globally for onclick handlers
window.selectEditPage = selectEditPage;
window.deleteEditPage = deleteEditPage;

// ═══════════════════════════════════════════════════
// CREATE VIEW
// ═══════════════════════════════════════════════════
document.getElementById('btn-create-blank').addEventListener('click', async () => {
    showLoading('Creando PDF en blanco...');
    try {
        const result = await window.api.createBlankPdf();
        if (result.success) {
            const savePath = await window.api.saveFileDialog('nuevo-documento.pdf');
            if (savePath) {
                await window.api.saveFile(savePath, result.data);
                showToast('PDF en blanco creado', 'success');
            }
        }
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
    hideLoading();
});

document.getElementById('btn-create-text').addEventListener('click', () => {
    const panel = document.getElementById('text-editor-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('btn-generate-pdf').addEventListener('click', async () => {
    const text = document.getElementById('create-text-input').value.trim();
    if (!text) {
        showToast('Escribe algún texto primero', 'error');
        return;
    }

    showLoading('Generando PDF...');
    try {
        const result = await window.api.createBlankPdf();
        if (result.success) {
            // Add text to the blank PDF
            const lines = text.split('\n');
            let currentPdf = result.data;
            let y = 780;
            let pageIndex = 0;

            for (const line of lines) {
                if (y < 50) {
                    // Add a new page
                    const addResult = await window.api.addPageToPdf(currentPdf);
                    if (addResult.success) {
                        currentPdf = addResult.data;
                        pageIndex++;
                        y = 780;
                    }
                }

                if (line.trim()) {
                    const addTextResult = await window.api.addTextToPdf(currentPdf, pageIndex, line, 50, y, 12, '#1a1a2e');
                    if (addTextResult.success) {
                        currentPdf = addTextResult.data;
                    }
                }
                y -= 20;
            }

            const savePath = await window.api.saveFileDialog('documento.pdf');
            if (savePath) {
                await window.api.saveFile(savePath, currentPdf);
                showToast('PDF generado exitosamente', 'success');
                document.getElementById('create-text-input').value = '';
            }
        }
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
    hideLoading();
});

// ═══════════════════════════════════════════════════
// ORGANIZE VIEW
// ═══════════════════════════════════════════════════
document.getElementById('btn-organize-browse').addEventListener('click', async () => {
    const files = await window.api.openFileDialog([
        { name: 'PDF', extensions: ['pdf'] }
    ]);
    if (files && files.length > 0) {
        await loadOrganizePdf(files[0]);
    }
});

async function loadOrganizePdf(filePath) {
    showLoading('Cargando PDF y vistas previas...');
    try {
        const fileResult = await window.api.readFile(filePath);
        if (!fileResult.success) throw new Error(fileResult.error);

        state.organizePdf = fileResult.data;
        state.organizeFilePath = filePath;

        const info = await window.api.getPdfInfo(fileResult.data);
        state.organizePageOrder = info.pages.map(p => p.index);

        // Fetch previews locally via pdf.js
        const previews = await generateAllPreviews(fileResult.data);
        if (previews && previews.length > 0) {
            state.organizePreviews = previews;
        } else {
            console.warn("Failed to generate previews locally");
            state.organizePreviews = Array(info.pageCount).fill(null);
        }

        document.getElementById('organize-dropzone').style.display = 'none';
        document.getElementById('organize-container').style.display = 'block';

        renderOrganizePages();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
    hideLoading();
}

// ─── Organize Feature: Clear Pages ───
document.getElementById('btn-organize-clear').addEventListener('click', () => {
    state.organizePdf = null;
    state.organizeFilePath = null;
    state.organizePageOrder = [];
    state.organizePageInfo = [];
    state.organizePreviews = [];

    document.getElementById('organize-container').style.display = 'none';
    document.getElementById('organize-dropzone').style.display = 'flex';
    document.getElementById('pages-grid').innerHTML = '';
});

// ─── Organize Feature: Add Blank Page ───
document.getElementById('btn-organize-add-blank').addEventListener('click', async () => {
    showLoading('Añadiendo página en blanco...');
    try {
        const result = await window.api.addPageToPdf(state.organizePdf);
        if (result.success) {
            state.organizePdf = result.data;
            let len = state.organizePageOrder.length;
            // The newly added blank page is at index (len) since it was appended
            state.organizePageOrder.push(len);

            // Render a dummy thumbnail momentarily or re-render
            state.organizePreviews.push(null);
            if (!state.organizePageInfo) state.organizePageInfo = [];
            state.organizePageInfo.push({ type: 'blank' });

            // To be accurate, we should generate its preview but it's blank so null or a blank icon is fine.
            showToast('Página en blanco añadida', 'success');
            renderOrganizePages();
        }
    } catch (err) {
        showToast(`Error añidiendo página: ${err.message}`, 'error');
    }
    hideLoading();
});

// ─── Organize Feature: Add PDF ───
document.getElementById('btn-organize-add-pdf').addEventListener('click', async () => {
    const files = await window.api.openFileDialog([
        { name: 'PDF', extensions: ['pdf'] }
    ]);
    if (files && files.length > 0) {
        showLoading('Añadiendo documento PDF...');
        try {
            const fileResult = await window.api.readFile(files[0]);
            if (!fileResult.success) throw new Error(fileResult.error);

            const appendResult = await window.api.appendPdfToPdf(state.organizePdf, fileResult.data);
            if (appendResult.success) {
                state.organizePdf = appendResult.data;

                // Fetch info of current new appended pdf to know the total size
                const info = await window.api.getPdfInfo(state.organizePdf);
                const previews = await generateAllPreviews(state.organizePdf);

                if (previews && previews.length > 0) {
                    state.organizePreviews = previews;
                } else {
                    state.organizePreviews = Array(info.pageCount).fill(null);
                }

                if (!state.organizePageInfo) {
                    state.organizePageInfo = state.organizePageOrder.map(() => ({ type: 'original' }));
                }

                const oldLength = state.organizePageOrder.length;
                for (let i = oldLength; i < info.pageCount; i++) {
                    state.organizePageInfo.push({ type: 'appended' });
                    state.organizePageOrder.push(i);
                }

                renderOrganizePages();
                showToast('Páginas añadidas correctamente', 'success');
            }
        } catch (err) {
            showToast(`Error añadiendo páginas: ${err.message}`, 'error');
        }
        hideLoading();
    }
});

let organizeDragIndex = -1;

function renderOrganizePages() {
    const grid = document.getElementById('pages-grid');
    if (!state.organizePageInfo) state.organizePageInfo = [];

    grid.innerHTML = state.organizePageOrder.map((pageIdx, i) => {
        let previewBase64 = state.organizePreviews[pageIdx];
        if (previewBase64 && previewBase64.startsWith('data:image')) {
            // Wait, getPdfPreviews might return raw base64 depending on main process, wait, it was returned using pdf-img-convert.
            // Oh, wait, in one iteration you changed to pdf.js locally, but then you went back. 
            // In main.js it returns raw base64. So we need `data:image/png;base64,`
            previewBase64 = `data:image/png;base64,${previewBase64}`;
        } else if (previewBase64) {
            previewBase64 = `data:image/png;base64,${previewBase64}`;
        }

        const previewContent = previewBase64
            ? `<img src="${previewBase64}" style="width:100%; height:100%; object-fit:contain;" />`
            : `<span class="material-icons-round">description</span>`;

        const pageInfo = state.organizePageInfo[pageIdx] || { type: 'original' };

        // Distinct styles
        let borderStyle = '1px solid var(--border)';
        let bgColor = '#ffffff';
        if (pageInfo.type === 'blank') {
            borderStyle = '2px dashed #93c5fd';
            bgColor = '#eff6ff';
        } else if (pageInfo.type === 'appended') {
            borderStyle = '2px solid #86efac';
            bgColor = '#f0fdf4';
        }

        return `
      <div class="page-card" data-index="${i}" draggable="true"
           style="border: ${borderStyle}; background-color: ${bgColor}; cursor: pointer;"
           ondragstart="onOrganizeDragStart(event, ${i})"
           ondragover="onOrganizeDragOver(event)"
           ondragleave="onOrganizeDragLeave(event)"
           ondrop="onOrganizeDrop(event, ${i})"
           onclick="showPagePreview(${pageIdx})">
        <div class="page-card-preview" style="padding:0; overflow:hidden; display:flex; justify-content:center; align-items:center;">
          ${previewContent}
        </div>
        <div class="page-card-label">Página ${pageIdx + 1}</div>
        <button class="page-card-delete" onclick="event.stopPropagation(); deleteOrganizePage(${i})" title="Eliminar página">
          <span class="material-icons-round" style="font-size:14px;">close</span>
        </button>
      </div>
      `;
    }).join('');
}

function onOrganizeDragStart(e, index) {
    organizeDragIndex = index;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function onOrganizeDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function onOrganizeDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function onOrganizeDrop(e, index) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (organizeDragIndex !== index) {
        const item = state.organizePageOrder.splice(organizeDragIndex, 1)[0];
        state.organizePageOrder.splice(index, 0, item);
        renderOrganizePages();
    }
    document.querySelectorAll('.page-card').forEach(el => el.classList.remove('dragging'));
}

async function deleteOrganizePage(cardIndex) {
    if (state.organizePageOrder.length <= 1) {
        showToast('No puedes eliminar la única página', 'error');
        return;
    }
    state.organizePageOrder.splice(cardIndex, 1);
    renderOrganizePages();
    showToast('Página eliminada del orden', 'success');
}

document.getElementById('btn-save-organized').addEventListener('click', async () => {
    showLoading('Reorganizando PDF...');
    try {
        const result = await window.api.reorderPages(state.organizePdf, state.organizePageOrder);
        if (result.success) {
            const savePath = await window.api.saveFileDialog('reorganized.pdf');
            if (savePath) {
                await window.api.saveFile(savePath, result.data);
                showToast('PDF reorganizado y guardado', 'success');
            }
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
    hideLoading();
});

// ═══════════════════════════════════════════════════
// DRAG & DROP ZONES (native file drops)
// ═══════════════════════════════════════════════════
function setupDropZone(elementId, onDropFiles, acceptedExts) {
    const zone = document.getElementById(elementId);
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('dragover');

        const files = Array.from(e.dataTransfer.files);
        const paths = files
            .filter(f => {
                const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
                return acceptedExts.includes(ext);
            })
            .map(f => f.path);

        if (paths.length > 0) {
            onDropFiles(paths);
        } else {
            showToast('Formato de archivo no soportado', 'error');
        }
    });
}

// Setup drop zones
setupDropZone('convert-dropzone', addConvertFiles, ['.docx', '.doc', '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tiff', '.webp']);
setupDropZone('convert-from-dropzone', addConvertFromFiles, ['.pdf']);
setupDropZone('merge-dropzone', addMergeFiles, ['.pdf']);
setupDropZone('edit-dropzone', (paths) => loadEditPdf(paths[0]), ['.pdf']);
setupDropZone('organize-dropzone', (paths) => loadOrganizePdf(paths[0]), ['.pdf']);

// Modal preview logic
function showPagePreview(pageIdx) {
    let previewBase64 = state.organizePreviews[pageIdx];
    if (previewBase64) {
        if (!previewBase64.startsWith('data:image')) {
            previewBase64 = `data:image/png;base64,${previewBase64}`;
        }
        document.getElementById('preview-modal-img').src = previewBase64;
    } else {
        // Fallback transparent image
        document.getElementById('preview-modal-img').src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }
    document.getElementById('preview-modal').style.display = 'flex';
}

function closePreviewModal() {
    document.getElementById('preview-modal').style.display = 'none';
}

document.getElementById('preview-modal-close').addEventListener('click', closePreviewModal);

// Close on outside click
document.getElementById('preview-modal').addEventListener('click', (e) => {
    // Only close if we clicked exactly on the overlay background, not the image inside
    if (e.target.id === 'preview-modal') {
        closePreviewModal();
    }
});

// Close modal on Escape
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (document.getElementById('preview-modal').style.display === 'flex') {
            closePreviewModal();
        }
    }
});

// Make functions available globally for onclick handlers
window.removeConvertFile = removeConvertFile;
window.removeConvertFromFile = removeConvertFromFile;
window.removeMergeFile = removeMergeFile;
window.moveMergeFile = moveMergeFile;
window.onMergeDragStart = onMergeDragStart;
window.onMergeDragOver = onMergeDragOver;
window.onMergeDragLeave = onMergeDragLeave;
window.onMergeDrop = onMergeDrop;
window.selectEditPage = selectEditPage;
window.deleteEditPage = deleteEditPage;
window.onOrganizeDragStart = onOrganizeDragStart;
window.onOrganizeDragOver = onOrganizeDragOver;
window.onOrganizeDragLeave = onOrganizeDragLeave;
window.onOrganizeDrop = onOrganizeDrop;
window.deleteOrganizePage = deleteOrganizePage;
window.showPagePreview = showPagePreview;

// Log ready
console.log('OpenPDF initialized successfully ✨');
