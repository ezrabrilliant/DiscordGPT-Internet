const fs = require('fs');
const path = require('path');

function searchTextInFiles(directoryPath, searchTexts, outputFile) {
    // Baca isi direktori
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error(`Gagal membaca direktori: ${err.message}`);
            return;
        }

        // Iterasi setiap file dalam direktori
        files.forEach(file => {
            const filePath = path.join(directoryPath, file);

            // Cek apakah path adalah file atau direktori
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error(`Gagal mendapatkan info file: ${err.message}`);
                    return;
                }

                if (stats.isFile()) {
                    // Baca file dan cari teks di dalamnya
                    fs.readFile(filePath, 'utf8', (err, data) => {
                        if (err) {
                            console.error(`Gagal membaca file: ${err.message}`);
                            return;
                        }

                        // Cari teks di dalam file untuk setiap teks dalam array
                        searchTexts.forEach(searchText => {
                            const regex = new RegExp(searchText, 'g');
                            const matches = data.match(regex);

                            if (matches) {
                                const logMessage = `Ditemukan ${matches.length} instance dari "${searchText}" dalam file: ${filePath}\n`;
                                console.log(logMessage);
                                // Tulis hasil pencarian ke file output
                                fs.appendFile(outputFile, logMessage, err => {
                                    if (err) {
                                        console.error(`Gagal menulis ke file: ${err.message}`);
                                    }
                                });
                            }
                        });
                    });
                } else if (stats.isDirectory()) {
                    // Rekursi untuk subdirektori
                    searchTextInFiles(filePath, searchTexts, outputFile);
                }
            });
        });
    });
}

// Contoh penggunaan
const directoryPath = 'G:/Downloads'; // Ganti dengan jalur direktori Anda
const searchTexts = ["vincuy01."]; // Ganti dengan array teks yang ingin dicari
const outputFile = 'output.txt'; // Ganti dengan jalur dan nama file output Anda

// Hapus isi file output sebelum memulai pencarian
fs.writeFile(outputFile, '', err => {
    if (err) {
        console.error(`Gagal menghapus isi file: ${err.message}`);
        return;
    }

    // Mulai pencarian teks
    searchTextInFiles(directoryPath, searchTexts, outputFile);
});
