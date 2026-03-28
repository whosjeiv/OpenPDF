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
            document.getElementById('sign-file-name').textContent = '';
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
            document.getElementById('redact-file-name').textContent = '';
            document.getElementById('redact-modal').style.display = 'flex';
        });

        document.getElementById('tool-crop').addEventListener('click', () => {
            this.state.cropData = null;
            this.state.cropName = '';
            document.getElementById('crop-file-name').textContent = '';
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
    // SIGN PDF
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

    bindSignTool() {
        document.getElementById('sign-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.signData = file.data;
                this.state.signName = file.name;
                document.getElementById('sign-file-name').textContent = `📄 ${file.name}`;
            }
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

            const canvas = document.getElementById('signature-canvas');
            // Get signature as PNG base64
            const dataUrl = canvas.toDataURL('image/png');
            const signatureBase64 = dataUrl.split(',')[1];

            const pageNum = parseInt(document.getElementById('sign-page').value) || 1;
            const x = parseInt(document.getElementById('sign-x').value) || 100;
            const y = parseInt(document.getElementById('sign-y').value) || 100;

            showLoading('Firmando PDF...');

            try {
                const result = await window.api.signPdf(
                    this.state.signData, pageNum - 1,
                    signatureBase64, x, y, 200, 80
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
    // CROP PDF
    // ═══════════════════════════════════════════════════
    bindCropTool() {
        document.getElementById('crop-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.cropData = file.data;
                this.state.cropName = file.name;
                document.getElementById('crop-file-name').textContent = `📄 ${file.name}`;
            }
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
    // REDACT PDF (Censor)
    // ═══════════════════════════════════════════════════
    bindRedactTool() {
        document.getElementById('redact-select-file').addEventListener('click', async () => {
            const file = await this.selectPdfFile();
            if (file) {
                this.state.redactData = file.data;
                this.state.redactName = file.name;
                document.getElementById('redact-file-name').textContent = `📄 ${file.name}`;
            }
        });

        document.getElementById('redact-confirm').addEventListener('click', async () => {
            if (!this.state.redactData) {
                showToast('Selecciona un PDF primero', 'error');
                return;
            }

            const pageNum = parseInt(document.getElementById('redact-page').value) || 1;
            const area = {
                x: parseInt(document.getElementById('redact-x').value) || 0,
                y: parseInt(document.getElementById('redact-y').value) || 0,
                width: parseInt(document.getElementById('redact-w').value) || 100,
                height: parseInt(document.getElementById('redact-h').value) || 20,
            };

            showLoading('Censurando PDF...');

            try {
                const result = await window.api.redactPdf(this.state.redactData, pageNum - 1, [area]);
                if (result.success) {
                    // Allow multiple redactions - update stored data
                    this.state.redactData = result.data;

                    const saved = await this.savePdfData(result.data, `${this.state.redactName.replace('.pdf', '')}_censurado.pdf`);
                    if (saved) {
                        showToast('Área censurada exitosamente', 'success');
                        document.getElementById('redact-modal').style.display = 'none';
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
    // TRANSLATE PDF
    // ═══════════════════════════════════════════════════
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

            const sourceLang = document.getElementById('translate-source').value;
            const targetLang = document.getElementById('translate-target').value;

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
                        // Add new page for each original page break
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
                            paragraph.trim().substring(0, 200), // Limit line length
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
