function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  }
  
  function combineRandomly(first, second) {
    const chance = Math.random();
    if (chance < 0.1) {
        return "maaf khodam kabur";
    } else {
        const element1 = getRandomElement(first);
        const element2 = getRandomElement(second);
        return `${element1} ${element2}`;
    }
}


  const first = ["Kucing", "Tikus", "Kadal", "Anomali", "Kuda Nil", "Bunglon", "Siput", "Koala", "Kodok", "Monyet", "Anjing", "Harimau", "Kuda", "Komodo", "Gajah", "Cicak", "Ular", "Anomali", "Kura-kura", "Lele", "Laba-laba", "Singa", "Zebra", "Bebek", "Ayam", "Buaya", "Gorila", "Naga", "Naga", "Ikan", "Ubu-ubur", "Cacing", "Semut", "Udang", "Musang", "Kecoak", "Kupu-kupu", "Laba-laba", "Biawak", "Kurama", "Anomali", "Tikus", "Raja", "Raja", "Jangkrik", "Lipan", "Ulat Bulu", "Kucing", "Panda", "Anomali", "Speaker JBL", "Toa Masjid", "Lemari 2 Pintu", "Kulkas", "Taplak Meja", "Pecel Lele", "Charger", "Charger Iphone", "Airpods", "Kalkulator", "Sendal Jepit", "Undur-undur Maju", "Bagas Dribble", "Sendal Jepit", "Sapu Lidi", "Gagang Pintu", "Tutup Toples", "Rice Cooker", "Gerobak Ketoprak", "Ban Motor", "Bakwan Jagung", "Rice Cooker", "Nugget Rebus", "Asep Kulkas", "Bintang Skibidi", "Helikopter", "Laba-laba Sunda", "Raja Beruang", "Nastar", "Seblak Ceker", "Macan Cisewu", "Anggrek Mekar", "Zaki Indomie", "Farhan Kebab", "Rizal Perkedel", "Joko Kopling", "Botol Yakult", "Reza Wangsaf", "Sigit Rendang", "Biawak Alaska", "Budi Martabak", "Nurdin Basket", "Edgar Burger", "Aspal Tol Cipularang", "Tuyul Mohawk", "Aldi Taher", "Cocomelon", "Orang Normal", "Kereta Thomas", "Botol Yakult"];
  const second = ["Jawa", "Depresi", "Mekanik", "Insom", "Skizo", "Klepto", "Bunting", "Birahi", "Sigma", "Raksasa", "Berkaki Seribu", "Skizo", "Sad boy", "Kayang", "Metal", "Mewing", "Gyatt", "Yapper", "Skizo", "Ambis", "Sigma", "Dribble", "Jawa", "Kayang", "Ngesot", "Sunda", "Kalimantan", "Kutub", "Sumatera", "Sunda", "Sumatera", "Yapper", "Ngesot", "Ambis", "Kayang", "Pemarah", "Kocak", "Push Up", "Gila", "Dark System", "Cupu", "Silver", "Emas", "Perak", "Cilacap", "Kocak", "kopling kiri", "kidal", "reboisasi", "akatsuki", "cukurukuk", "introvert", "Kroak", "Mojokerto", "Kebumen", "Kudus", "Klaten", "Kulon Progo", "Kuningan", "Kupang", "Kutai", "Lamongan", "Lampung", "Lumajang", "Madiun", "Magelang", "Majalengka", "Makassar", "Malang", "Maluku", "Manado", "Mataram", "Medan", "Merauke", "Metro", "Mojokerto", "Mojosari", "Muna", "Nganjuk", "Ngawi", "Padang", "Pakpak", "Palangkaraya", "Palembang", "Palu", "Pamekasan", "Pandeglang", "Pangandaran", "Pangkajene", "Pangkal Pinang", "Pare", "Pariaman", "Pasuruan", "Kuasa Tiga" ];

async function cekKhodam(querry, message) {
    await message.reply(`Khodam yang ada di dalam diri ${querry}, adalah ` + combineRandomly(first, second));
}
  
module.exports = cekKhodam;
  