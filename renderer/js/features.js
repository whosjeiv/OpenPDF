// ═══════════════════════════════════════════════════
// OpenPDF - Features Module
// Dark Mode, Keyboard Shortcuts, Undo/Redo,
// Recent Files, Freehand Drawing, Annotations,
// Stats Dashboard, Print, Progress Bar
// ═══════════════════════════════════════════════════

const features = {

    // ─── DARK MODE ───
    initDarkMode() {
        const saved = localStorage.getItem('openpdf-theme');
        if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }

        document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('openpdf-theme', next);
            showToast(next === 'dark' ? '🌙 Modo oscuro activado' : '☀️ Modo claro activado', 'info');
        });
    },

    // ─── KEYBOARD SHORTCUTS ───
    initKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            // Only handle if no modal input is focused
            const tag = document.activeElement?.tagName;
            const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                if (typeof editor !== 'undefined' && editor.pdfData) {
                    editor.savePdf();
                }
            }
            else if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                if (typeof editor !== 'undefined') {
                    editor.openFile();
                }
            }
            else if (e.ctrlKey && e.key === 'z' && !isInput) {
                e.preventDefault();
                this.undo();
            }
            else if (e.ctrlKey && e.key === 'y' && !isInput) {
                e.preventDefault();
                this.redo();
            }
            else if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                this.printPdf();
            }
            else if (e.key === 'Escape') {
                // Exit drawing mode
                if (this.drawingMode) {
                    this.exitDrawingMode();
                }
                // Close any open modal
                document.querySelectorAll('.modal-overlay').forEach(m => {
                    if (m.style.display === 'flex') m.style.display = 'none';
                });
            }
            else if (e.key === '+' && e.ctrlKey) {
                e.preventDefault();
                if (typeof editor !== 'undefined') editor.setZoom(editor.zoom + 0.1);
            }
            else if (e.key === '-' && e.ctrlKey) {
                e.preventDefault();
                if (typeof editor !== 'undefined') editor.setZoom(editor.zoom - 0.1);
            }
        });
    },

    // ─── UNDO / REDO ───
    history: [],
    historyIndex: -1,
    maxHistory: 15,
    _skipPush: false,

    pushState(label) {
        if (this._skipPush) return;
        if (typeof editor === 'undefined' || !editor.pdfData) return;

        // Remove any future states if we're in the middle of history
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        this.history.push({
            data: editor.pdfData,
            label: label || 'Cambio',
            timestamp: Date.now()
        });

        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        this.historyIndex = this.history.length - 1;
        this.updateUndoRedoButtons();
        this.updateStatsChanges();
    },

    undo() {
        if (this.historyIndex <= 0) {
            showToast('No hay más cambios para deshacer', 'info');
            return;
        }

        this.historyIndex--;
        const state = this.history[this.historyIndex];
        this._skipPush = true;
        editor.pdfData = state.data;
        editor.renderCurrentPage();
        editor.generatePreviews().then(() => editor.renderPageNav());
        this._skipPush = false;

        showToast(`↩️ Deshecho: ${state.label}`, 'info');
        this.updateUndoRedoButtons();
        this.updateStatsChanges();
    },

    redo() {
        if (this.historyIndex >= this.history.length - 1) {
            showToast('No hay más cambios para rehacer', 'info');
            return;
        }

        this.historyIndex++;
        const state = this.history[this.historyIndex];
        this._skipPush = true;
        editor.pdfData = state.data;
        editor.renderCurrentPage();
        editor.generatePreviews().then(() => editor.renderPageNav());
        this._skipPush = false;

        showToast(`↪️ Rehecho: ${state.label}`, 'info');
        this.updateUndoRedoButtons();
        this.updateStatsChanges();
    },

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) {
            undoBtn.classList.toggle('disabled', this.historyIndex <= 0);
        }
        if (redoBtn) {
            redoBtn.classList.toggle('disabled', this.historyIndex >= this.history.length - 1);
        }
    },

    updateStatsChanges() {
        const el = document.getElementById('stat-changes');
        if (el) {
            const count = this.historyIndex;
            const cls = count === 0 ? 'green' : count < 5 ? 'blue' : 'rose';
            el.innerHTML = `<span class="stat-badge ${cls}">${count}</span>`;
        }
    },

    // ─── RECENT FILES ───
    initRecentFiles() {
        this.renderRecentFiles();
    },

    addRecentFile(filePath, fileName) {
        let recents = JSON.parse(localStorage.getItem('openpdf-recent') || '[]');

        // Remove if already exists
        recents = recents.filter(r => r.path !== filePath);

        // Add to front
        recents.unshift({
            path: filePath,
            name: fileName,
            timestamp: Date.now()
        });

        // Keep max 8
        recents = recents.slice(0, 8);
        localStorage.setItem('openpdf-recent', JSON.stringify(recents));
        this.renderRecentFiles();
    },

    removeRecentFile(index) {
        let recents = JSON.parse(localStorage.getItem('openpdf-recent') || '[]');
        recents.splice(index, 1);
        localStorage.setItem('openpdf-recent', JSON.stringify(recents));
        this.renderRecentFiles();
    },

    renderRecentFiles() {
        const list = document.getElementById('recent-files-list');
        const empty = document.getElementById('recent-files-empty');
        if (!list) return;

        const recents = JSON.parse(localStorage.getItem('openpdf-recent') || '[]');

        // Remove old items (not the empty message)
        list.querySelectorAll('.recent-file-item').forEach(el => el.remove());

        if (recents.length === 0) {
            if (empty) empty.style.display = 'block';
            return;
        }

        if (empty) empty.style.display = 'none';

        recents.forEach((file, idx) => {
            const ago = this.timeAgo(file.timestamp);
            const item = document.createElement('div');
            item.className = 'recent-file-item';
            item.innerHTML = `
                <div class="recent-file-icon">
                    <span class="material-icons-round">picture_as_pdf</span>
                </div>
                <div class="recent-file-info">
                    <div class="recent-file-name">${file.name}</div>
                    <div class="recent-file-date">${ago}</div>
                </div>
                <button class="recent-file-remove" title="Eliminar" data-idx="${idx}">
                    <span class="material-icons-round" style="font-size:16px;">close</span>
                </button>
            `;

            item.addEventListener('click', (e) => {
                if (e.target.closest('.recent-file-remove')) return;
                // Navigate to edit view and open the file
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById('nav-edit').classList.add('active');
                document.getElementById('view-edit').classList.add('active');
                if (typeof editor !== 'undefined') {
                    editor.loadPdf(file.path);
                }
            });

            item.querySelector('.recent-file-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeRecentFile(idx);
            });

            list.appendChild(item);
        });
    },

    timeAgo(timestamp) {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Justo ahora';
        if (minutes < 60) return `Hace ${minutes} min`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `Hace ${days} día${days > 1 ? 's' : ''}`;
        return new Date(timestamp).toLocaleDateString('es-ES');
    },

    // ─── PRINT PDF ───
    async printPdf() {
        if (typeof editor === 'undefined' || !editor.pdfData) {
            showToast('Abre un PDF primero', 'error');
            return;
        }

        try {
            if (window.api && window.api.printPdf) {
                await window.api.printPdf();
                showToast('Enviado a impresora', 'success');
            } else {
                // Fallback: use window.print on the canvas
                const canvas = document.getElementById('pdf-render-canvas');
                const dataUrl = canvas.toDataURL('image/png');
                const printWin = window.open('', '_blank');
                printWin.document.write(`<img src="${dataUrl}" onload="window.print(); window.close();" style="max-width:100%;">`);
            }
        } catch (err) {
            showToast(`Error al imprimir: ${err.message}`, 'error');
        }
    },

    // ─── PROGRESS BAR ───
    showProgress(percent) {
        const container = document.getElementById('progress-container');
        const bar = document.getElementById('progress-bar');
        if (!container || !bar) return;

        container.classList.add('active');
        bar.style.width = Math.min(percent, 100) + '%';
    },

    hideProgress() {
        const container = document.getElementById('progress-container');
        const bar = document.getElementById('progress-bar');
        if (!container || !bar) return;

        bar.style.width = '100%';
        setTimeout(() => {
            container.classList.remove('active');
            bar.style.width = '0%';
        }, 500);
    },

    // ─── PDF STATS DASHBOARD ───
    updateStats() {
        if (typeof editor === 'undefined' || !editor.pdfData) return;

        // File size
        const sizeBytes = editor.pdfData.length * 0.75; // base64 → bytes approx
        const sizeEl = document.getElementById('stat-file-size');
        if (sizeEl) {
            if (sizeBytes < 1024) sizeEl.textContent = Math.round(sizeBytes) + ' B';
            else if (sizeBytes < 1048576) sizeEl.textContent = (sizeBytes / 1024).toFixed(1) + ' KB';
            else sizeEl.textContent = (sizeBytes / 1048576).toFixed(2) + ' MB';
        }

        // Page dimensions (from canvas)
        const canvas = document.getElementById('pdf-render-canvas');
        const dimsEl = document.getElementById('stat-page-dims');
        if (dimsEl && canvas) {
            const w = Math.round(canvas.width / (editor.zoom || 1));
            const h = Math.round(canvas.height / (editor.zoom || 1));
            dimsEl.textContent = `${w} × ${h} pts`;
        }
    },

    // ─── FREEHAND DRAWING ───
    drawingMode: false,
    drawingStrokes: [],
    currentStroke: null,

    initDrawingTools() {
        document.getElementById('btn-freehand-draw')?.addEventListener('click', () => {
            this.toggleDrawingMode();
        });

        document.getElementById('draw-clear')?.addEventListener('click', () => {
            this.clearDrawing();
        });

        document.getElementById('draw-apply')?.addEventListener('click', () => {
            this.applyDrawing();
        });

        document.getElementById('draw-cancel')?.addEventListener('click', () => {
            this.exitDrawingMode();
        });

        // Canvas drawing events
        const drawCanvas = document.getElementById('drawing-canvas');
        if (!drawCanvas) return;

        let isDrawing = false;

        drawCanvas.addEventListener('mousedown', (e) => {
            if (!this.drawingMode) return;
            isDrawing = true;
            const rect = drawCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            this.currentStroke = {
                color: document.getElementById('draw-color')?.value || '#e53935',
                width: parseInt(document.getElementById('draw-width')?.value) || 3,
                points: [{ x, y }]
            };
        });

        drawCanvas.addEventListener('mousemove', (e) => {
            if (!isDrawing || !this.currentStroke) return;
            const rect = drawCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            this.currentStroke.points.push({ x, y });

            // Draw the current stroke
            const ctx = drawCanvas.getContext('2d');
            const pts = this.currentStroke.points;
            if (pts.length < 2) return;

            const last = pts[pts.length - 2];
            const curr = pts[pts.length - 1];

            ctx.strokeStyle = this.currentStroke.color;
            ctx.lineWidth = this.currentStroke.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(last.x, last.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
        });

        const finishStroke = () => {
            if (!isDrawing || !this.currentStroke) return;
            isDrawing = false;

            if (this.currentStroke.points.length > 1) {
                this.drawingStrokes.push(this.currentStroke);
            }
            this.currentStroke = null;
        };

        drawCanvas.addEventListener('mouseup', finishStroke);
        drawCanvas.addEventListener('mouseleave', finishStroke);
    },

    toggleDrawingMode() {
        if (this.drawingMode) {
            this.exitDrawingMode();
        } else {
            this.enterDrawingMode();
        }
    },

    enterDrawingMode() {
        this.drawingMode = true;
        this.drawingStrokes = [];

        const container = document.querySelector('.editor-canvas-container');
        const drawCanvas = document.getElementById('drawing-canvas');
        const pdfCanvas = document.getElementById('pdf-render-canvas');
        const toolbar = document.getElementById('drawing-toolbar');
        const indicator = document.getElementById('editor-mode-indicator');
        const btn = document.getElementById('btn-freehand-draw');

        if (container) container.classList.add('drawing-mode');
        if (toolbar) toolbar.style.display = 'flex';
        if (btn) btn.classList.add('active-tool');

        if (indicator) {
            document.getElementById('mode-indicator-text').textContent = 'Modo dibujo libre — Dibuja sobre el PDF';
            indicator.classList.add('visible');
        }

        // Size drawing canvas to match PDF canvas
        if (drawCanvas && pdfCanvas) {
            drawCanvas.width = pdfCanvas.width;
            drawCanvas.height = pdfCanvas.height;
            drawCanvas.style.width = pdfCanvas.style.width;
            drawCanvas.style.height = pdfCanvas.style.height;
        }

        showToast('✏️ Modo dibujo activado — Dibuja con el mouse', 'info');
    },

    exitDrawingMode() {
        this.drawingMode = false;

        const container = document.querySelector('.editor-canvas-container');
        const toolbar = document.getElementById('drawing-toolbar');
        const indicator = document.getElementById('editor-mode-indicator');
        const btn = document.getElementById('btn-freehand-draw');
        const drawCanvas = document.getElementById('drawing-canvas');

        if (container) container.classList.remove('drawing-mode');
        if (toolbar) toolbar.style.display = 'none';
        if (btn) btn.classList.remove('active-tool');
        if (indicator) indicator.classList.remove('visible');

        // Clear drawing canvas
        if (drawCanvas) {
            const ctx = drawCanvas.getContext('2d');
            ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }

        this.drawingStrokes = [];
    },

    clearDrawing() {
        const drawCanvas = document.getElementById('drawing-canvas');
        if (drawCanvas) {
            const ctx = drawCanvas.getContext('2d');
            ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }
        this.drawingStrokes = [];
    },

    async applyDrawing() {
        if (this.drawingStrokes.length === 0) {
            showToast('No hay dibujo para aplicar', 'info');
            return;
        }

        if (typeof editor === 'undefined' || !editor.pdfData) return;

        this.pushState('Dibujo libre');
        showLoading('Aplicando dibujo...');

        try {
            const pdfCanvas = document.getElementById('pdf-render-canvas');
            const zoom = editor.zoom || 1;

            // Convert each stroke to PDF line segments
            for (const stroke of this.drawingStrokes) {
                const color = stroke.color;
                const lineWidth = stroke.width / zoom;

                for (let i = 1; i < stroke.points.length; i++) {
                    const p1 = stroke.points[i - 1];
                    const p2 = stroke.points[i];

                    // Convert canvas coords to PDF coords (flip Y)
                    const pdfX1 = p1.x / zoom;
                    const pdfY1 = (pdfCanvas.height - p1.y) / zoom;
                    const pdfX2 = p2.x / zoom;
                    const pdfY2 = (pdfCanvas.height - p2.y) / zoom;

                    const result = await window.api.addLineToPdf(
                        editor.pdfData, editor.currentPage - 1,
                        pdfX1, pdfY1, pdfX2, pdfY2,
                        color, lineWidth
                    );
                    if (result.success) {
                        editor.pdfData = result.data;
                    }
                }
            }

            await editor.renderCurrentPage();
            showToast('Dibujo aplicado al PDF ✓', 'success');
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
        this.exitDrawingMode();
    },

    // ─── ANNOTATIONS (Sticky Notes) ───
    annotations: [],

    initAnnotations() {
        document.getElementById('btn-add-annotation')?.addEventListener('click', () => {
            this.addAnnotation();
        });
    },

    addAnnotation(color = 'yellow') {
        const layer = document.getElementById('annotation-layer');
        if (!layer) return;

        const id = 'note-' + Date.now();
        const note = document.createElement('div');
        note.className = `sticky-note ${color}`;
        note.id = id;
        note.style.left = (50 + Math.random() * 100) + 'px';
        note.style.top = (50 + Math.random() * 80) + 'px';

        note.innerHTML = `
            <div class="sticky-note-header">
                <div class="note-color-dots">
                    <div class="note-color-dot c-yellow" data-color="yellow"></div>
                    <div class="note-color-dot c-pink" data-color="pink"></div>
                    <div class="note-color-dot c-blue" data-color="blue"></div>
                    <div class="note-color-dot c-green" data-color="green"></div>
                </div>
                <button class="sticky-note-delete" title="Eliminar">✕</button>
            </div>
            <div class="sticky-note-body">
                <textarea placeholder="Escribe una nota..."></textarea>
            </div>
        `;

        // Drag functionality
        let isDragging = false, offsetX = 0, offsetY = 0;

        const header = note.querySelector('.sticky-note-header');
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.note-color-dot') || e.target.closest('.sticky-note-delete')) return;
            isDragging = true;
            offsetX = e.clientX - note.offsetLeft;
            offsetY = e.clientY - note.offsetTop;
            note.style.zIndex = 100;
            note.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            note.style.left = (e.clientX - offsetX) + 'px';
            note.style.top = (e.clientY - offsetY) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                note.style.zIndex = 6;
                note.style.cursor = 'grab';
            }
        });

        // Color change
        note.querySelectorAll('.note-color-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                note.className = `sticky-note ${dot.dataset.color}`;
            });
        });

        // Delete
        note.querySelector('.sticky-note-delete').addEventListener('click', () => {
            note.remove();
            this.annotations = this.annotations.filter(a => a.id !== id);
        });

        // Prevent textarea from triggering drag
        note.querySelector('textarea').addEventListener('mousedown', (e) => e.stopPropagation());

        layer.appendChild(note);
        this.annotations.push({ id, color });
        showToast('📝 Nota adhesiva añadida', 'info');
    },

    // ─── INIT TOOLBAR BUTTONS ───
    initToolbarButtons() {
        document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
        document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());
        document.getElementById('btn-edit-print')?.addEventListener('click', () => this.printPdf());
    },

    // ─── HOOK INTO EDITOR OPERATIONS ───
    hookEditorOperations() {
        // Intercept editor operations to push undo states
        if (typeof editor === 'undefined') return;

        const originalLoadPdf = editor.loadPdf.bind(editor);
        editor.loadPdf = async (filePath) => {
            await originalLoadPdf(filePath);
            // Add to recent files
            if (editor.filePath && editor.fileName) {
                this.addRecentFile(editor.filePath, editor.fileName);
            }
            // Reset history
            this.history = [{ data: editor.pdfData, label: 'Inicio', timestamp: Date.now() }];
            this.historyIndex = 0;
            this.updateUndoRedoButtons();
            this.updateStats();
            this.updateStatsChanges();
        };

        // Hook renderCurrentPage to update stats
        const originalRenderPage = editor.renderCurrentPage.bind(editor);
        editor.renderCurrentPage = async () => {
            await originalRenderPage();
            this.updateStats();
        };

        // Hook operations that modify PDF
        const opsToHook = [
            { name: 'addText', label: 'Añadir texto' },
            { name: 'addImage', label: 'Añadir imagen' },
            { name: 'addWatermark', label: 'Marca de agua' },
            { name: 'addPageNumbers', label: 'Numeración' },
            { name: 'addHeaderFooter', label: 'Encabezado/Pie' },
            { name: 'addLink', label: 'Enlace' },
            { name: 'addShape', label: 'Forma' },
            { name: 'cropPage', label: 'Recortar' },
            { name: 'addPage', label: 'Nueva página' },
            { name: 'deletePage', label: 'Eliminar página' },
            { name: 'deleteCurrentPage', label: 'Eliminar página' },
            { name: 'findReplace', label: 'Buscar/Reemplazar' },
            { name: 'applyTextChanges', label: 'Editar texto' },
        ];

        for (const op of opsToHook) {
            if (typeof editor[op.name] === 'function') {
                const original = editor[op.name].bind(editor);
                editor[op.name] = async (...args) => {
                    // Save state BEFORE the operation
                    if (editor.pdfData) {
                        this.pushState(op.label);
                    }
                    const result = await original(...args);
                    this.updateStats();
                    return result;
                };
            }
        }
    },

    // ─── MASTER INIT ───
    init() {
        this.initDarkMode();
        this.initKeyboardShortcuts();
        this.initRecentFiles();
        this.initToolbarButtons();
        this.initDrawingTools();
        this.initAnnotations();

        // Wait for editor to be ready, then hook
        setTimeout(() => {
            this.hookEditorOperations();
        }, 500);
    }
};

// Initialize features when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    features.init();
});

// Make available globally
window.features = features;
