const fs = require('fs');
const pdf2img = require('pdf-img-convert');

async function test() {
    try {
        const data = fs.readFileSync('documento.pdf'); // Any pdf, or create one
        console.log("PDF loaded.");
        const images = await pdf2img.convert(data, { width: 200 });
        console.log("Done", images.length, images[0].length);
    } catch (e) {
        console.error(e);
    }
}
test();
