// ═══════════════════════════════════════════════════
// OpenPDF - Tools Module
// Handles: Split, Compress, PPT/Excel conversion,
//          Sign, Protect, Unlock, Redact, Crop, Translate
// ═══════════════════════════════════════════════════

const tools = {
    // Shared state for each tool
    state: {},

    init() {
        this.bindToolCards();
        this.bindSplitTool();
        this.bindCompressTool();
        this.bindSignTool();
        this.bindProtectTool();
        this.bindUnlockTool();
        this.bindCropTool();
        this.bindRedactTool();
        this.bindTranslateTool();
        this.initCustomDropdowns();
    },

    // ─── Tool Card Click Handlers ───
    bindToolCards() {
        document.getElementById('tool-split').addEventListener('click', () => {
            this.state.splitData = null;
            this.state.splitName = '';
            document.getElementById('split-file-name').textContent = '';
            document.getElementById('split-modal').style.display = 'flex';
        });

        document.getElementById('tool-compress').addEventListener('click', () => {
            this.state.compressData = null;
            this.state.compressName = '';
            document.getElementById('compress-file-name').textContent = '';
            document.getElementById('compress-result').style.display = 'none';
            document.getElementById('compress-modal').style.display = 'flex';
        });

        document.getElementById('tool-ppt').addEventListener('click', () => this.convertOfficeToPdf('ppt'));
        document.getElementById('tool-excel').addEventListener('click', () => this.convertOfficeToPdf('excel'));

        document.getElementById('tool-sign').addEventListener('click', () => {
            this.state.signData = null;
            this.state.signName = '';
            this.state.signPageNum = 0;
            this.state.signTotalPages = 1;
            this.state.signPdfDoc = null;
            this.state.signPlaced = false;
            this.state.signPosX = null;
            this.state.signPosY = null;
            document.getElementById('sign-file-name').textContent = '';
            document.getElementById('sign-preview').style.display = 'none';
            document.getElementById('sign-placed-marker').style.display = 'none';
            document.getElementById('sign-ghost').style.display = 'none';
            document.getElementById('sign-modal').style.display = 'flex';
            this.initSignatureCanvas();
        });

        document.getElementById('tool-protect').addEventListener('click', () => {
            this.state.protectData = null;
            this.state.protectName = '';
            document.getElementById('protect-file-name').textContent = '';
            document.getElementById('protect-password').value = '';
            document.getElementById('protect-password-confirm').value = '';
            document.getElementById('protect-modal').style.display = 'flex';
        });

        document.getElementById('tool-unlock').addEventListener('click', () => {
            this.state.unlockData = null;
            this.state.unlockName = '';
            document.getElementById('unlock-file-name').textContent = '';
            document.getElementById('unlock-password').value = '';
            document.getElementById('unlock-modal').style.display = 'flex';
        });

        document.getElementById('tool-redact').addEventListener('click', () => {
            this.state.redactData = null;
            this.state.redactName = '';
            this.state.redactPageNum = 0;
            this.state.redactTotalPages = 1;
            this.state.redactPdfDoc = null;
            this.state.redactAreas = [];
            document.getElementById('redact-file-name').textContent = '';
            document.getElementById('redact-preview').style.display = 'none';
            document.getElementById('redact-modal').style.display = 'flex';
        });

        document.getElementById('tool-crop').addEventListener('click', () => {
            this.state.cropData = null;
            this.state.cropName = '';
            this.state.cropPageNum = 0;
            this.state.cropTotalPages = 1;
            this.state.cropPdfDoc = null;
            document.getElementById('crop-file-name').textContent = '';
            document.getElementById('crop-preview').style.display = 'none';
            document.getElementById('crop-modal-tool').style.display = 'flex';
        });

        document.getElementById('tool-translate').addEventListener('click', () => {
            this.state.translateData = null;
            this.state.translateName = '';
            document.getElementById('translate-file-name').textContent = '';
            document.getElementById('translate-preview-group').style.display = 'none';
            document.getElementById('translate-preview').value = '';
            document.getElementById('translate-modal').style.display = 'flex';
        });
    },

    // ─── Helper: Select PDF file ───
    async selectPdfFile() {
        const files = await window.api.openFileDialog([
            { name: 'PDF', extensions: ['pdf'] }
        ]);
        if (files && files.length > 0) {
            const result = await window.api.readFile(files[0]);
            if (result.success) {
                return { data: result.data, name: result.name, path: files[0] };
            }
        }
        return null;
    },

    // ─── Helper: Save PDF ───
    async savePdfData(base64Data, defaultName) {
        const savePath = await window.api.saveFileDialog(defaultName);
        if (savePath) {
            await window.api.saveFile(savePath, base64Data);
            return true;
        }
        return false;
    },

    // ─── Helper: Load PDF.js document from base64 ───
    async loadPdfDocument(base64Data) {
        const pdfData = atob(base64Data);
        const uint8Array = new Uint8Array(pdfData.length);
        for (let i = 0; i < pdfData.length; i++) {
            uint8Array[i] = pdfData.charCodeAt(i);
        }
        return await window.pdfjsLib.getDocument({ data: uint8Array }).promise;
    },

    // ─── Helper: Render a PDF page to a canvas ───
    async renderPageToCanvas(pdfDoc, pageNum, canvas, maxWidth = 500) {
        const page = await pdfDoc.getPage(pageNum + 1);
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = maxWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport: scaledViewport
        }).promise;

        return { scale, pdfWidth: viewport.width, pdfHeight: viewport.height };
    },

    // ═══════════════════════════════════════════════════
    // SPLIT PDF
    // ═══════════════════════════════════════════════════
    bindSplitTool() {
        document.getElementById('split-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.splitData = file.data;
                this.state.splitName = file.name;
                document.getElementById('split-file-name').textContent = `📄 ${file.name}`;
            }
        });

        document.getElementById('split-mode').addEventListener('change', (e) => {
            document.getElementById('split-range-options').style.display =
                e.target.value === 'range' ? 'block' : 'none';
        });

        document.getElementById('split-confirm').addEventListener('click', async () => {
            if (!this.state.splitData) {
                showToast('Selecciona un PDF primero', 'error');
                return;
            }

            const mode = document.getElementById('split-mode').value;
            showLoading('Dividiendo PDF...');

            try {
                if (mode === 'all') {
                    const result = await window.api.splitPdfAll(this.state.splitData);
                    if (result.success) {
                        const saveResult = await window.api.saveSplitFiles(result.data, this.state.splitName);
                        if (saveResult.success) {
                            showToast(`${saveResult.savedCount} páginas guardadas`, 'success');
                            document.getElementById('split-modal').style.display = 'none';
                        }
                    } else {
                        showToast(`Error: ${result.error}`, 'error');
                    }
                } else {
                    const start = parseInt(document.getElementById('split-start').value) - 1;
                    const end = parseInt(document.getElementById('split-end').value) - 1;

                    if (start > end || start < 0) {
                        showToast('Rango de páginas inválido', 'error');
                        hideLoading();
                        return;
                    }

                    const result = await window.api.splitPdfRange(this.state.splitData, start, end);
                    if (result.success) {
                        const saved = await this.savePdfData(result.data, `${this.state.splitName.replace('.pdf', '')}_pag${start + 1}-${end + 1}.pdf`);
                        if (saved) {
                            showToast('Páginas extraídas exitosamente', 'success');
                            document.getElementById('split-modal').style.display = 'none';
                        }
                    } else {
                        showToast(`Error: ${result.error}`, 'error');
                    }
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }

            hideLoading();
        });
    },

    // ═══════════════════════════════════════════════════
    // COMPRESS PDF
    // ═══════════════════════════════════════════════════
    bindCompressTool() {
        document.getElementById('compress-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.compressData = file.data;
                this.state.compressName = file.name;
                document.getElementById('compress-file-name').textContent = `📄 ${file.name}`;
                document.getElementById('compress-result').style.display = 'none';
            }
        });

        document.getElementById('compress-confirm').addEventListener('click', async () => {
            if (!this.state.compressData) {
                showToast('Selecciona un PDF primero', 'error');
                return;
            }

            showLoading('Comprimiendo PDF...');

            try {
                const result = await window.api.compressPdf(this.state.compressData);
                if (result.success) {
                    this.state.compressedData = result.data;

                    const formatSize = (bytes) => {
                        if (bytes < 1024) return bytes + ' B';
                        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
                        return (bytes / 1048576).toFixed(2) + ' MB';
                    };

                    document.getElementById('compress-original').textContent = formatSize(result.originalSize);
                    document.getElementById('compress-compressed').textContent = formatSize(result.compressedSize);
                    document.getElementById('compress-savings').textContent = result.savings + '%';
                    document.getElementById('compress-result').style.display = 'block';

                    const saved = await this.savePdfData(result.data, `${this.state.compressName.replace('.pdf', '')}_comprimido.pdf`);
                    if (saved) {
                        showToast('PDF comprimido exitosamente', 'success');
                    }
                } else {
                    showToast(`Error: ${result.error}`, 'error');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }

            hideLoading();
        });
    },

    // ═══════════════════════════════════════════════════
    // POWERPOINT / EXCEL TO PDF
    // ═══════════════════════════════════════════════════
    async convertOfficeToPdf(type) {
        const filters = type === 'ppt'
            ? [{ name: 'PowerPoint', extensions: ['pptx', 'ppt'] }]
            : [{ name: 'Excel', extensions: ['xlsx', 'xls'] }];

        const typeName = type === 'ppt' ? 'PowerPoint' : 'Excel';

        const files = await window.api.openFileDialog(filters);
        if (!files || files.length === 0) return;

        showLoading(`Convirtiendo ${typeName} a PDF...`);

        try {
            const result = type === 'ppt'
                ? await window.api.convertPptToPdf(files[0])
                : await window.api.convertExcelToPdf(files[0]);

            if (result.success) {
                const baseName = files[0].split(/[/\\]/).pop().replace(/\.[^.]+$/, '');
                const saved = await this.savePdfData(result.data, `${baseName}.pdf`);
                if (saved) {
                    showToast(`${typeName} convertido a PDF exitosamente`, 'success');
                }
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }

        hideLoading();
    },

    // ═══════════════════════════════════════════════════
    // SIGN PDF - Visual Preview
    // ═══════════════════════════════════════════════════
    signatureCtx: null,
    isDrawing: false,

    initSignatureCanvas() {
        const canvas = document.getElementById('signature-canvas');
        if (!canvas) return;

        this.signatureCtx = canvas.getContext('2d');
        this.signatureCtx.fillStyle = 'white';
        this.signatureCtx.fillRect(0, 0, canvas.width, canvas.height);
        this.isDrawing = false;

        // Remove old listeners by cloning
        const newCanvas = canvas.cloneNode(true);
        canvas.parentNode.replaceChild(newCanvas, canvas);
        this.signatureCtx = newCanvas.getContext('2d');
        this.signatureCtx.fillStyle = 'white';
        this.signatureCtx.fillRect(0, 0, newCanvas.width, newCanvas.height);

        const getPos = (e) => {
            const rect = newCanvas.getBoundingClientRect();
            const scaleX = newCanvas.width / rect.width;
            const scaleY = newCanvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        };

        newCanvas.addEventListener('mousedown', (e) => {
            this.isDrawing = true;
            const pos = getPos(e);
            this.signatureCtx.beginPath();
            this.signatureCtx.moveTo(pos.x, pos.y);
        });

        newCanvas.addEventListener('mousemove', (e) => {
            if (!this.isDrawing) return;
            const pos = getPos(e);
            this.signatureCtx.strokeStyle = document.getElementById('sign-color').value;
            this.signatureCtx.lineWidth = parseInt(document.getElementById('sign-width').value) || 2;
            this.signatureCtx.lineCap = 'round';
            this.signatureCtx.lineJoin = 'round';
            this.signatureCtx.lineTo(pos.x, pos.y);
            this.signatureCtx.stroke();
        });

        newCanvas.addEventListener('mouseup', () => { this.isDrawing = false; });
        newCanvas.addEventListener('mouseleave', () => { this.isDrawing = false; });
    },

    async renderSignPreview() {
        if (!this.state.signPdfDoc) return;
        const canvas = document.getElementById('sign-preview-canvas');
        const info = await this.renderPageToCanvas(this.state.signPdfDoc, this.state.signPageNum, canvas);
        this.state.signScale = info.scale;
        this.state.signPdfWidth = info.pdfWidth;
        this.state.signPdfHeight = info.pdfHeight;
        document.getElementById('sign-page-label').textContent =
            `Página ${this.state.signPageNum + 1} de ${this.state.signTotalPages}`;

        // Clear placed marker on page change
        document.getElementById('sign-placed-marker').style.display = 'none';
        this.state.signPlaced = false;
    },

    bindSignTool() {
        document.getElementById('sign-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.signData = file.data;
                this.state.signName = file.name;
                document.getElementById('sign-file-name').textContent = `📄 ${file.name}`;

                try {
                    this.state.signPdfDoc = await this.loadPdfDocument(file.data);
                    this.state.signTotalPages = this.state.signPdfDoc.numPages;
                    this.state.signPageNum = 0;
                    document.getElementById('sign-preview').style.display = 'block';
                    await this.renderSignPreview();
                } catch (e) {
                    showToast('Error al cargar vista previa', 'error');
                }
            }
        });

        // Page navigation
        document.getElementById('sign-prev-page').addEventListener('click', async () => {
            if (this.state.signPageNum > 0) {
                this.state.signPageNum--;
                await this.renderSignPreview();
            }
        });
        document.getElementById('sign-next-page').addEventListener('click', async () => {
            if (this.state.signPageNum < this.state.signTotalPages - 1) {
                this.state.signPageNum++;
                await this.renderSignPreview();
            }
        });

        // Click to place signature on canvas area
        const canvasArea = document.getElementById('sign-canvas-area');
        canvasArea.addEventListener('mousemove', (e) => {
            if (!this.state.signPdfDoc) return;
            const ghost = document.getElementById('sign-ghost');
            const canvas = document.getElementById('sign-preview-canvas');
            const canvasRect = canvas.getBoundingClientRect();
            const sigSize = parseInt(document.getElementById('sign-size-slider').value) || 200;
            const displayW = sigSize * (this.state.signScale || 0.5);
            const displayH = displayW * 0.4;

            const relX = e.clientX - canvasRect.left;
            const relY = e.clientY - canvasRect.top;

            // Check if within canvas bounds
            if (relX >= 0 && relY >= 0 && relX <= canvasRect.width && relY <= canvasRect.height) {
                ghost.style.display = 'block';
                ghost.style.left = (canvas.offsetLeft + relX - displayW / 2) + 'px';
                ghost.style.top = (canvas.offsetTop + relY - displayH / 2) + 'px';
                ghost.style.width = displayW + 'px';
                ghost.style.height = displayH + 'px';
            } else {
                ghost.style.display = 'none';
            }
        });

        canvasArea.addEventListener('mouseleave', () => {
            document.getElementById('sign-ghost').style.display = 'none';
        });

        canvasArea.addEventListener('click', (e) => {
            if (!this.state.signPdfDoc) return;
            const canvas = document.getElementById('sign-preview-canvas');
            const canvasRect = canvas.getBoundingClientRect();
            const relX = e.clientX - canvasRect.left;
            const relY = e.clientY - canvasRect.top;

            if (relX < 0 || relY < 0 || relX > canvasRect.width || relY > canvasRect.height) return;

            const scale = this.state.signScale || 1;
            const sigSize = parseInt(document.getElementById('sign-size-slider').value) || 200;
            const displayW = sigSize * scale;
            const displayH = displayW * 0.4;

            // Convert to PDF coordinates (origin bottom-left)
            this.state.signPosX = (relX / canvasRect.width) * this.state.signPdfWidth;
            this.state.signPosY = this.state.signPdfHeight - ((relY / canvasRect.height) * this.state.signPdfHeight);
            this.state.signPlaced = true;

            // Show placed marker
            const marker = document.getElementById('sign-placed-marker');
            marker.style.display = 'block';
            marker.style.left = (canvas.offsetLeft + relX - displayW / 2) + 'px';
            marker.style.top = (canvas.offsetTop + relY - displayH / 2) + 'px';
            marker.style.width = displayW + 'px';
            marker.style.height = displayH + 'px';

            showToast('Posición de firma establecida ✓', 'success');
        });

        // Size slider
        document.getElementById('sign-size-slider').addEventListener('input', (e) => {
            document.getElementById('sign-size-val').textContent = e.target.value + 'px';
        });

        document.getElementById('sign-clear').addEventListener('click', () => {
            const canvas = document.getElementById('signature-canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        });

        document.getElementById('sign-confirm').addEventListener('click', async () => {
            if (!this.state.signData) {
                showToast('Selecciona un PDF primero', 'error');
                return;
            }

            if (!this.state.signPlaced) {
                showToast('Haz clic en el PDF para posicionar la firma', 'error');
                return;
            }

            const canvas = document.getElementById('signature-canvas');
            const dataUrl = canvas.toDataURL('image/png');
            const signatureBase64 = dataUrl.split(',')[1];

            const sigSize = parseInt(document.getElementById('sign-size-slider').value) || 200;
            const sigW = sigSize;
            const sigH = sigSize * 0.4;

            showLoading('Firmando PDF...');

            try {
                const result = await window.api.signPdf(
                    this.state.signData, this.state.signPageNum,
                    signatureBase64,
                    this.state.signPosX - sigW / 2,
                    this.state.signPosY - sigH / 2,
                    sigW, sigH
                );
                if (result.success) {
                    const saved = await this.savePdfData(result.data, `${this.state.signName.replace('.pdf', '')}_firmado.pdf`);
                    if (saved) {
                        showToast('PDF firmado exitosamente', 'success');
                        document.getElementById('sign-modal').style.display = 'none';
                    }
                } else {
                    showToast(`Error: ${result.error}`, 'error');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }

            hideLoading();
        });
    },

    // ═══════════════════════════════════════════════════
    // PROTECT PDF
    // ═══════════════════════════════════════════════════
    bindProtectTool() {
        document.getElementById('protect-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.protectData = file.data;
                this.state.protectName = file.name;
                document.getElementById('protect-file-name').textContent = `📄 ${file.name}`;
            }
        });

        const passInput = document.getElementById('protect-password');
        const passConfirmInput = document.getElementById('protect-password-confirm');
        const errorMsg = document.getElementById('password-match-error');

        const validatePasswords = () => {
            if (passConfirmInput.value.length > 0 && passInput.value !== passConfirmInput.value) {
                errorMsg.style.display = 'block';
                passConfirmInput.style.borderColor = 'var(--rose)';
            } else {
                errorMsg.style.display = 'none';
                passConfirmInput.style.borderColor = 'var(--border)';
            }
        };

        passInput.addEventListener('input', validatePasswords);
        passConfirmInput.addEventListener('input', validatePasswords);

        document.getElementById('protect-confirm').addEventListener('click', async () => {
            if (!this.state.protectData) {
                showToast('Selecciona un PDF primero', 'error');
                return;
            }

            const password = document.getElementById('protect-password').value;
            const confirmPassword = document.getElementById('protect-password-confirm').value;

            if (!password) {
                showToast('Escribe una contraseña', 'error');
                return;
            }

            if (password !== confirmPassword) {
                showToast('Las contraseñas no coinciden', 'error');
                return;
            }

            showLoading('Protegiendo PDF...');

            try {
                const result = await window.api.protectPdf(this.state.protectData, password);
                if (result.success) {
                    const saved = await this.savePdfData(result.data, `${this.state.protectName.replace('.pdf', '')}_protegido.pdf`);
                    if (saved) {
                        showToast('PDF protegido con contraseña', 'success');
                        document.getElementById('protect-modal').style.display = 'none';
                    }
                } else {
                    showToast(`Error: ${result.error}`, 'error');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }

            hideLoading();
        });
    },

    // ═══════════════════════════════════════════════════
    // UNLOCK PDF
    // ═══════════════════════════════════════════════════
    bindUnlockTool() {
        document.getElementById('unlock-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.unlockData = file.data;
                this.state.unlockName = file.name;
                document.getElementById('unlock-file-name').textContent = `📄 ${file.name}`;
            }
        });

        document.getElementById('unlock-confirm').addEventListener('click', async () => {
            if (!this.state.unlockData) {
                showToast('Selecciona un PDF primero', 'error');
                return;
            }

            const password = document.getElementById('unlock-password').value;
            if (!password) {
                showToast('Escribe la contraseña del PDF', 'error');
                return;
            }

            showLoading('Desbloqueando PDF...');

            try {
                const result = await window.api.unlockPdf(this.state.unlockData, password);
                if (result.success) {
                    const saved = await this.savePdfData(result.data, `${this.state.unlockName.replace('.pdf', '')}_desbloqueado.pdf`);
                    if (saved) {
                        showToast('PDF desbloqueado exitosamente', 'success');
                        document.getElementById('unlock-modal').style.display = 'none';
                    }
                } else {
                    showToast(`Error: ${result.error}`, 'error');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }

            hideLoading();
        });
    },

    // ═══════════════════════════════════════════════════
    // CROP PDF - Visual Preview with Sliders
    // ═══════════════════════════════════════════════════
    async renderCropPreview() {
        if (!this.state.cropPdfDoc) return;
        const canvas = document.getElementById('crop-preview-canvas');
        const info = await this.renderPageToCanvas(this.state.cropPdfDoc, this.state.cropPageNum, canvas);
        this.state.cropScale = info.scale;
        this.state.cropPdfWidth = info.pdfWidth;
        this.state.cropPdfHeight = info.pdfHeight;
        document.getElementById('crop-page-label').textContent =
            `Página ${this.state.cropPageNum + 1} de ${this.state.cropTotalPages}`;
        this.updateCropOverlay();
    },

    updateCropOverlay() {
        const canvas = document.getElementById('crop-preview-canvas');
        if (!canvas || !this.state.cropScale) return;

        const scale = this.state.cropScale;
        const canvasW = canvas.width;
        const canvasH = canvas.height;

        const top = (parseInt(document.getElementById('crop-top').value) || 0) * scale;
        const bottom = (parseInt(document.getElementById('crop-bottom').value) || 0) * scale;
        const left = (parseInt(document.getElementById('crop-left').value) || 0) * scale;
        const right = (parseInt(document.getElementById('crop-right').value) || 0) * scale;

        // Position overlay relative to canvas within the area
        const overlay = document.getElementById('crop-overlay');
        overlay.style.left = canvas.offsetLeft + 'px';
        overlay.style.top = canvas.offsetTop + 'px';
        overlay.style.width = canvasW + 'px';
        overlay.style.height = canvasH + 'px';

        // Shades
        document.getElementById('crop-shade-top').style.height = top + 'px';
        document.getElementById('crop-shade-bottom').style.height = bottom + 'px';

        const shadeLeft = document.getElementById('crop-shade-left');
        shadeLeft.style.top = top + 'px';
        shadeLeft.style.height = (canvasH - top - bottom) + 'px';
        shadeLeft.style.width = left + 'px';

        const shadeRight = document.getElementById('crop-shade-right');
        shadeRight.style.top = top + 'px';
        shadeRight.style.height = (canvasH - top - bottom) + 'px';
        shadeRight.style.width = right + 'px';

        // Active area
        const active = document.getElementById('crop-active-area');
        active.style.top = top + 'px';
        active.style.left = left + 'px';
        active.style.width = Math.max(0, canvasW - left - right) + 'px';
        active.style.height = Math.max(0, canvasH - top - bottom) + 'px';

        // Update labels
        document.getElementById('crop-top-val').textContent = document.getElementById('crop-top').value + ' pts';
        document.getElementById('crop-bottom-val').textContent = document.getElementById('crop-bottom').value + ' pts';
        document.getElementById('crop-left-val').textContent = document.getElementById('crop-left').value + ' pts';
        document.getElementById('crop-right-val').textContent = document.getElementById('crop-right').value + ' pts';
    },

    bindCropTool() {
        document.getElementById('crop-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.cropData = file.data;
                this.state.cropName = file.name;
                document.getElementById('crop-file-name').textContent = `📄 ${file.name}`;

                try {
                    this.state.cropPdfDoc = await this.loadPdfDocument(file.data);
                    this.state.cropTotalPages = this.state.cropPdfDoc.numPages;
                    this.state.cropPageNum = 0;
                    document.getElementById('crop-preview').style.display = 'block';
                    await this.renderCropPreview();
                } catch (e) {
                    showToast('Error al cargar vista previa', 'error');
                }
            }
        });

        // Page navigation
        document.getElementById('crop-prev-page').addEventListener('click', async () => {
            if (this.state.cropPageNum > 0) {
                this.state.cropPageNum--;
                await this.renderCropPreview();
            }
        });
        document.getElementById('crop-next-page').addEventListener('click', async () => {
            if (this.state.cropPageNum < this.state.cropTotalPages - 1) {
                this.state.cropPageNum++;
                await this.renderCropPreview();
            }
        });

        // Slider listeners for live crop overlay update
        ['crop-top', 'crop-bottom', 'crop-left', 'crop-right'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.updateCropOverlay());
        });

        document.getElementById('crop-confirm-tool').addEventListener('click', async () => {
            if (!this.state.cropData) {
                showToast('Selecciona un PDF primero', 'error');
                return;
            }

            const cropBox = {
                top: parseInt(document.getElementById('crop-top').value) || 0,
                bottom: parseInt(document.getElementById('crop-bottom').value) || 0,
                left: parseInt(document.getElementById('crop-left').value) || 0,
                right: parseInt(document.getElementById('crop-right').value) || 0,
            };

            const applyToAll = document.getElementById('crop-all-pages').checked;

            showLoading('Recortando PDF...');

            try {
                const result = await window.api.cropPdf(this.state.cropData, cropBox, applyToAll);
                if (result.success) {
                    const saved = await this.savePdfData(result.data, `${this.state.cropName.replace('.pdf', '')}_recortado.pdf`);
                    if (saved) {
                        showToast('PDF recortado exitosamente', 'success');
                        document.getElementById('crop-modal-tool').style.display = 'none';
                    }
                } else {
                    showToast(`Error: ${result.error}`, 'error');
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }

            hideLoading();
        });
    },

    // ═══════════════════════════════════════════════════
    // REDACT PDF (Censor) - Visual Drawing
    // ═══════════════════════════════════════════════════
    redactDrawing: false,
    redactStartX: 0,
    redactStartY: 0,

    async renderRedactPreview() {
        if (!this.state.redactPdfDoc) return;
        const canvas = document.getElementById('redact-preview-canvas');
        const info = await this.renderPageToCanvas(this.state.redactPdfDoc, this.state.redactPageNum, canvas);
        this.state.redactScale = info.scale;
        this.state.redactPdfWidth = info.pdfWidth;
        this.state.redactPdfHeight = info.pdfHeight;
        document.getElementById('redact-page-label').textContent =
            `Página ${this.state.redactPageNum + 1} de ${this.state.redactTotalPages}`;
        this.renderRedactRects();
    },

    renderRedactRects() {
        const layer = document.getElementById('redact-rects-layer');
        const canvas = document.getElementById('redact-preview-canvas');
        const listEl = document.getElementById('redact-areas-list');

        // Position layer over canvas
        layer.style.left = canvas.offsetLeft + 'px';
        layer.style.top = canvas.offsetTop + 'px';
        layer.style.width = canvas.width + 'px';
        layer.style.height = canvas.height + 'px';

        // Clear existing visual rects
        layer.querySelectorAll('.redact-rect-visual').forEach(el => el.remove());

        // Filter areas for current page
        const pageAreas = this.state.redactAreas.filter(a => a.page === this.state.redactPageNum);
        const scale = this.state.redactScale || 1;

        pageAreas.forEach((area, idx) => {
            const rect = document.createElement('div');
            rect.className = 'redact-rect-visual';
            rect.style.left = (area.x * scale) + 'px';
            rect.style.top = ((this.state.redactPdfHeight - area.y - area.height) * scale) + 'px';
            rect.style.width = (area.width * scale) + 'px';
            rect.style.height = (area.height * scale) + 'px';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'redact-rect-delete';
            deleteBtn.innerHTML = '✕';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const globalIdx = this.state.redactAreas.indexOf(area);
                if (globalIdx !== -1) {
                    this.state.redactAreas.splice(globalIdx, 1);
                    this.renderRedactRects();
                    this.updateRedactChips();
                }
            });
            rect.appendChild(deleteBtn);
            layer.appendChild(rect);
        });

        this.updateRedactChips();
    },

    updateRedactChips() {
        const listEl = document.getElementById('redact-areas-list');
        const emptyMsg = document.getElementById('redact-areas-empty');

        // Remove old chips
        listEl.querySelectorAll('.redact-area-chip').forEach(el => el.remove());

        if (this.state.redactAreas.length === 0) {
            emptyMsg.style.display = 'flex';
            return;
        }

        emptyMsg.style.display = 'none';

        this.state.redactAreas.forEach((area, idx) => {
            const chip = document.createElement('span');
            chip.className = 'redact-area-chip';
            chip.innerHTML = `
                P${area.page + 1}: ${Math.round(area.width)}×${Math.round(area.height)}
                <button onclick="tools.removeRedactArea(${idx})" title="Eliminar">
                    <span class="material-icons-round">close</span>
                </button>
            `;
            listEl.appendChild(chip);
        });
    },

    removeRedactArea(idx) {
        this.state.redactAreas.splice(idx, 1);
        this.renderRedactRects();
        this.updateRedactChips();
    },

    bindRedactTool() {
        document.getElementById('redact-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.redactData = file.data;
                this.state.redactName = file.name;
                this.state.redactAreas = [];
                document.getElementById('redact-file-name').textContent = `📄 ${file.name}`;

                try {
                    this.state.redactPdfDoc = await this.loadPdfDocument(file.data);
                    this.state.redactTotalPages = this.state.redactPdfDoc.numPages;
                    this.state.redactPageNum = 0;
                    document.getElementById('redact-preview').style.display = 'block';
                    await this.renderRedactPreview();
                } catch (e) {
                    showToast('Error al cargar vista previa', 'error');
                }
            }
        });

        // Page navigation
        document.getElementById('redact-prev-page').addEventListener('click', async () => {
            if (this.state.redactPageNum > 0) {
                this.state.redactPageNum--;
                await this.renderRedactPreview();
            }
        });
        document.getElementById('redact-next-page').addEventListener('click', async () => {
            if (this.state.redactPageNum < this.state.redactTotalPages - 1) {
                this.state.redactPageNum++;
                await this.renderRedactPreview();
            }
        });

        // Drawing rectangles on canvas area
        const canvasArea = document.getElementById('redact-canvas-area');
        let drawingRect = null;

        canvasArea.addEventListener('mousedown', (e) => {
            if (!this.state.redactPdfDoc) return;
            const canvas = document.getElementById('redact-preview-canvas');
            const canvasRect = canvas.getBoundingClientRect();
            const relX = e.clientX - canvasRect.left;
            const relY = e.clientY - canvasRect.top;

            if (relX < 0 || relY < 0 || relX > canvasRect.width || relY > canvasRect.height) return;

            this.redactDrawing = true;
            this.redactStartX = relX;
            this.redactStartY = relY;

            // Create visual drawing rect
            drawingRect = document.createElement('div');
            drawingRect.className = 'redact-drawing-rect';
            drawingRect.style.left = (canvas.offsetLeft + relX) + 'px';
            drawingRect.style.top = (canvas.offsetTop + relY) + 'px';
            drawingRect.style.width = '0px';
            drawingRect.style.height = '0px';
            canvasArea.appendChild(drawingRect);
        });

        canvasArea.addEventListener('mousemove', (e) => {
            if (!this.redactDrawing || !drawingRect) return;
            const canvas = document.getElementById('redact-preview-canvas');
            const canvasRect = canvas.getBoundingClientRect();
            const relX = Math.max(0, Math.min(e.clientX - canvasRect.left, canvasRect.width));
            const relY = Math.max(0, Math.min(e.clientY - canvasRect.top, canvasRect.height));

            const x = Math.min(this.redactStartX, relX);
            const y = Math.min(this.redactStartY, relY);
            const w = Math.abs(relX - this.redactStartX);
            const h = Math.abs(relY - this.redactStartY);

            drawingRect.style.left = (canvas.offsetLeft + x) + 'px';
            drawingRect.style.top = (canvas.offsetTop + y) + 'px';
            drawingRect.style.width = w + 'px';
            drawingRect.style.height = h + 'px';
        });

        const finishDrawing = (e) => {
            if (!this.redactDrawing || !drawingRect) return;
            this.redactDrawing = false;

            const canvas = document.getElementById('redact-preview-canvas');
            const canvasRect = canvas.getBoundingClientRect();
            const relX = Math.max(0, Math.min(e.clientX - canvasRect.left, canvasRect.width));
            const relY = Math.max(0, Math.min(e.clientY - canvasRect.top, canvasRect.height));

            const x1 = Math.min(this.redactStartX, relX);
            const y1 = Math.min(this.redactStartY, relY);
            const w = Math.abs(relX - this.redactStartX);
            const h = Math.abs(relY - this.redactStartY);

            drawingRect.remove();
            drawingRect = null;

            // Only add if reasonably sized (>5px both dimensions)
            if (w < 5 || h < 5) return;

            const scale = this.state.redactScale || 1;
            const canvasDisplayW = canvasRect.width;
            const canvasDisplayH = canvasRect.height;

            // Convert display coords to PDF coords
            const pdfX = (x1 / canvasDisplayW) * this.state.redactPdfWidth;
            const pdfW = (w / canvasDisplayW) * this.state.redactPdfWidth;
            const pdfH = (h / canvasDisplayH) * this.state.redactPdfHeight;
            const pdfY = this.state.redactPdfHeight - ((y1 / canvasDisplayH) * this.state.redactPdfHeight) - pdfH;

            this.state.redactAreas.push({
                page: this.state.redactPageNum,
                x: pdfX,
                y: pdfY,
                width: pdfW,
                height: pdfH
            });

            this.renderRedactRects();
            showToast(`Área ${this.state.redactAreas.length} marcada para censura`, 'info');
        };

        canvasArea.addEventListener('mouseup', finishDrawing);
        canvasArea.addEventListener('mouseleave', (e) => {
            if (this.redactDrawing && drawingRect) {
                finishDrawing(e);
            }
        });

        document.getElementById('redact-confirm').addEventListener('click', async () => {
            if (!this.state.redactData) {
                showToast('Selecciona un PDF primero', 'error');
                return;
            }

            if (this.state.redactAreas.length === 0) {
                showToast('Dibuja al menos un área para censurar', 'error');
                return;
            }

            showLoading('Censurando PDF...');

            try {
                let currentData = this.state.redactData;

                // Group areas by page
                const pageGroups = {};
                for (const area of this.state.redactAreas) {
                    if (!pageGroups[area.page]) pageGroups[area.page] = [];
                    pageGroups[area.page].push({
                        x: area.x,
                        y: area.y,
                        width: area.width,
                        height: area.height
                    });
                }

                // Apply redactions page by page
                for (const [pageNum, areas] of Object.entries(pageGroups)) {
                    const result = await window.api.redactPdf(currentData, parseInt(pageNum), areas);
                    if (result.success) {
                        currentData = result.data;
                    } else {
                        showToast(`Error en página ${parseInt(pageNum) + 1}: ${result.error}`, 'error');
                    }
                }

                const saved = await this.savePdfData(currentData, `${this.state.redactName.replace('.pdf', '')}_censurado.pdf`);
                if (saved) {
                    showToast('PDF censurado exitosamente', 'success');
                    document.getElementById('redact-modal').style.display = 'none';
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }

            hideLoading();
        });
    },

    // ═══════════════════════════════════════════════════
    // TRANSLATE PDF - Custom Dropdowns with Flags
    // ═══════════════════════════════════════════════════
    initCustomDropdowns() {
        // Initialize all custom dropdowns
        document.querySelectorAll('.custom-dropdown').forEach(dropdown => {
            const trigger = dropdown.querySelector('.custom-dropdown-trigger');
            const menu = dropdown.querySelector('.custom-dropdown-menu');
            const items = dropdown.querySelectorAll('.custom-dropdown-item');

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other open dropdowns
                document.querySelectorAll('.custom-dropdown.open').forEach(d => {
                    if (d !== dropdown) d.classList.remove('open');
                });
                dropdown.classList.toggle('open');
            });

            items.forEach(item => {
                item.addEventListener('click', () => {
                    const value = item.dataset.value;
                    const flag = item.dataset.flag;
                    const label = item.textContent.trim().replace(flag, '').trim();

                    dropdown.dataset.value = value;
                    trigger.querySelector('.dropdown-flag').textContent = flag;
                    trigger.querySelector('.dropdown-label').textContent = label;

                    // Update active state
                    items.forEach(i => i.classList.remove('active'));
                    item.classList.add('active');

                    dropdown.classList.remove('open');
                });
            });
        });

        // Close dropdowns on outside click
        document.addEventListener('click', () => {
            document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
        });

        // Swap button
        document.getElementById('translate-swap')?.addEventListener('click', () => {
            const sourceDD = document.getElementById('translate-source-dropdown');
            const targetDD = document.getElementById('translate-target-dropdown');

            const sourceValue = sourceDD.dataset.value;
            const targetValue = targetDD.dataset.value;

            const sourceFlag = sourceDD.querySelector('.dropdown-flag').textContent;
            const targetFlag = targetDD.querySelector('.dropdown-flag').textContent;

            const sourceLabel = sourceDD.querySelector('.dropdown-label').textContent;
            const targetLabel = targetDD.querySelector('.dropdown-label').textContent;

            // Swap values
            sourceDD.dataset.value = targetValue;
            targetDD.dataset.value = sourceValue;

            sourceDD.querySelector('.dropdown-flag').textContent = targetFlag;
            targetDD.querySelector('.dropdown-flag').textContent = sourceFlag;

            sourceDD.querySelector('.dropdown-label').textContent = targetLabel;
            targetDD.querySelector('.dropdown-label').textContent = sourceLabel;

            // Update active states
            sourceDD.querySelectorAll('.custom-dropdown-item').forEach(i => {
                i.classList.toggle('active', i.dataset.value === targetValue);
            });
            targetDD.querySelectorAll('.custom-dropdown-item').forEach(i => {
                i.classList.toggle('active', i.dataset.value === sourceValue);
            });
        });
    },

    bindTranslateTool() {
        document.getElementById('translate-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.translateData = file.data;
                this.state.translateName = file.name;
                document.getElementById('translate-file-name').textContent = `📄 ${file.name}`;
                document.getElementById('translate-preview-group').style.display = 'none';
            }
        });

        document.getElementById('translate-confirm').addEventListener('click', async () => {
            if (!this.state.translateData) {
                showToast('Selecciona un PDF primero', 'error');
                return;
            }

            const sourceLang = document.getElementById('translate-source-dropdown').dataset.value;
            const targetLang = document.getElementById('translate-target-dropdown').dataset.value;

            if (sourceLang === targetLang) {
                showToast('Los idiomas de origen y destino deben ser diferentes', 'error');
                return;
            }

            showLoading('Extrayendo texto del PDF...');

            try {
                // Step 1: Extract text from PDF
                const extractResult = await window.api.extractPdfText(this.state.translateData);
                if (!extractResult.success) {
                    showToast('No se pudo extraer el texto del PDF', 'error');
                    hideLoading();
                    return;
                }

                const allText = extractResult.data.map(p => p.text).join('\n\n--- Página ---\n\n');

                if (!allText.trim()) {
                    showToast('El PDF no contiene texto extraíble', 'error');
                    hideLoading();
                    return;
                }

                showLoading('Traduciendo texto...');

                // Step 2: Translate the text
                const translateResult = await window.api.translateText(allText, sourceLang, targetLang);
                if (!translateResult.success) {
                    showToast('Error al traducir', 'error');
                    hideLoading();
                    return;
                }

                const translatedText = translateResult.data;

                // Show preview
                document.getElementById('translate-preview').value = translatedText;
                document.getElementById('translate-preview-group').style.display = 'block';

                showLoading('Generando PDF traducido...');

                // Step 3: Create a new PDF with translated text
                const createResult = await window.api.createBlankPdf();
                if (!createResult.success) {
                    showToast('Error al crear PDF', 'error');
                    hideLoading();
                    return;
                }

                // Write translated text to each page
                const paragraphs = translatedText.split('\n');
                let currentData = createResult.data;
                let yPos = 800;
                const fontSize = 11;
                const lineSpacing = fontSize * 1.5;
                let currentPage = 0;

                for (const paragraph of paragraphs) {
                    if (paragraph.trim() === '--- Página ---') {
                        const addResult = await window.api.addPageToPdf(currentData);
                        if (addResult.success) {
                            currentData = addResult.data;
                            currentPage++;
                            yPos = 800;
                        }
                        continue;
                    }

                    if (yPos < 40) {
                        const addResult = await window.api.addPageToPdf(currentData);
                        if (addResult.success) {
                            currentData = addResult.data;
                            currentPage++;
                            yPos = 800;
                        }
                    }

                    if (paragraph.trim()) {
                        const textResult = await window.api.addTextToPdf(
                            currentData, currentPage,
                            paragraph.trim().substring(0, 200),
                            30, yPos, fontSize, '#000000'
                        );
                        if (textResult.success) {
                            currentData = textResult.data;
                        }
                    }
                    yPos -= lineSpacing;
                }

                const saved = await this.savePdfData(currentData, `${this.state.translateName.replace('.pdf', '')}_traducido.pdf`);
                if (saved) {
                    showToast('PDF traducido exitosamente', 'success');
                    document.getElementById('translate-modal').style.display = 'none';
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }

            hideLoading();
        });
    },
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    tools.init();
});
