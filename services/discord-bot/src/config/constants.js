/**
 * Configuration Constants
 * Centralized place for all bot configuration values
 */

module.exports = {
    // Bot prefixes
    PREFIX: '!',
    AI_PREFIXES: ['zra', 'ezra'],

    // Command names
    COMMANDS: {
        KHODAM: ['khodam', 'cekkhodam'],
        SEARCH: ['search'],
    },

    // Messages (for easy i18n later)
    MESSAGES: {
        ERROR_GENERIC: 'An error occurred while processing your request. Please try again later.',
        ERROR_EVERYONE: '⛔ You cannot mention everyone!',
        ERROR_ROLE: '⛔ You cannot mention roles!',
        SEARCH_DISABLED: 'The search feature is temporarily disabled.',
        AI_DISABLED: 'The AI chat feature is currently under development. Try !khodam @username',
        AI_UNAVAILABLE: '😵 Maaf, AI sedang tidak tersedia. Coba lagi nanti ya!',
        KHODAM_USAGE: 'Invalid format. Use: `!Khodam @username` or `!cekKhodam @username`',
    },


    // Khodam data
    KHODAM: {
        FIRST: [
            "Kucing", "Tikus", "Kadal", "Anomali", "Kuda Nil", "Bunglon", "Siput",
            "Koala", "Kodok", "Monyet", "Anjing", "Harimau", "Kuda", "Komodo",
            "Gajah", "Cicak", "Ular", "Kura-kura", "Lele", "Laba-laba", "Singa",
            "Zebra", "Bebek", "Ayam", "Buaya", "Gorila", "Naga", "Ikan", "Ubur-ubur",
            "Cacing", "Semut", "Udang", "Musang", "Kecoak", "Kupu-kupu", "Biawak",
            "Kurama", "Raja", "Jangkrik", "Lipan", "Ulat Bulu", "Panda",
            "Speaker JBL", "Toa Masjid", "Lemari 2 Pintu", "Kulkas", "Taplak Meja",
            "Pecel Lele", "Charger iPhone", "Airpods", "Kalkulator", "Sendal Jepit",
            "Undur-undur Maju", "Sapu Lidi", "Gagang Pintu", "Rice Cooker",
            "Gerobak Ketoprak", "Ban Motor", "Bakwan Jagung", "Nugget Rebus",
            "Bintang Skibidi", "Helikopter", "Macan Cisewu", "Botol Yakult",
            "Cocomelon", "Orang Normal", "Kereta Thomas"
        ],
        SECOND: [
            "Jawa", "Depresi", "Mekanik", "Insom", "Skizo", "Klepto", "Bunting",
            "Birahi", "Sigma", "Raksasa", "Berkaki Seribu", "Sad boy", "Kayang",
            "Metal", "Mewing", "Gyatt", "Yapper", "Ambis", "Dribble", "Sunda",
            "Kalimantan", "Kutub", "Sumatera", "Ngesot", "Pemarah", "Kocak",
            "Push Up", "Gila", "Dark System", "Cupu", "Silver", "Emas", "Perak",
            "Cilacap", "kopling kiri", "kidal", "reboisasi", "akatsuki",
            "introvert", "Kroak", "Mojokerto", "Kebumen", "Kudus", "Klaten",
            "Kulon Progo", "Malang", "Makassar", "Medan", "Padang", "Palembang",
            "Kuasa Tiga"
        ],
        ESCAPE_CHANCE: 0.1, // 10% chance khodam kabur
        ESCAPE_MESSAGE: "maaf khodam kabur"
    }
};
