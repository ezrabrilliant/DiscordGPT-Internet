const fs = require('fs');
const path = require('path');

// Tentukan jalur file log (shared data folder untuk akses Python nanti)
const logFilePath = path.join(__dirname, '../../../../data/messages.log');

// Fungsi untuk menulis log ke file
function logMessage(message) {
    const logEntry = `${new Date().toISOString()} - ${JSON.stringify(message)}\n`; // Ubah objek ke JSON sebelum menyimpan
    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
}

module.exports = {
    logMessage,
};
