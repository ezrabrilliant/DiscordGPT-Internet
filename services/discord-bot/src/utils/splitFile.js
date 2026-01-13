const fs = require('fs');
const path = require('path');

// Fungsi untuk membaca file dan menghasilkan perintah
async function generateCommands(inputFile, outputDir, perfile) {
    // Baca file input
    const data = fs.readFileSync(inputFile, 'utf8');
    const lines = data.split('\n').map(line => line.trim()).filter(line => line !== '');

    // Tentukan jumlah file kecil
    const totalLines = lines.length;
    const numberOfChunks = Math.ceil(totalLines / perfile);

    // Buat folder output jika belum ada
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // split file menjadi bagian dan simpan ke folder output
    for (let i = 0; i < numberOfChunks; i++) {
        const start = i * perfile;
        const end = start + perfile;
        const chunkLines = lines.slice(start, end);

        // Nama file output
        const outputFileName = path.join(outputDir, `cid_${i + 1}.txt`);

        // Tulis ke file output
        fs.writeFileSync(outputFileName, chunkLines.join('\n'), 'utf8');
    }
}

// Nama file input dan output directory
const inputFile = 'a.txt';
const outputDir = 'cid';
const perfile = 500; // Jumlah split per file

// Panggil fungsi untuk menghasilkan perintah
generateCommands(inputFile, outputDir, perfile).then(() => {
    console.log('Selesai memecah file.');
}).catch(error => {
    console.error('Terjadi kesalahan:', error);
});
