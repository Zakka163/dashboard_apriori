# Laporan Akademik: Implementasi Algoritma Apriori pada Data Sosio-Ekonomi BPS Berbasis REST API

## 1. Pendahuluan (Latar Belakang)
Analisis kesejahteraan lintas wilayah sering kali dihadapkan pada jutaan poin data statistik (demografi, kesehatan, hingga infrastruktur) yang bersifat tersebar dan terpisah menurut tabel parameternya sendiri. Proyek **Dashboard Apriori** ini dirancang guna memetakan korelasi kausal dan aturan asosiasi (*Association Rule Mining*) secara otomatis di antara beragam variabel Pembangunan dan Kesejahteraan menggunakan **Algoritma Apriori**. Skema arsitektur yang digarap mampu melahap parameter dari server langsung untuk mendapatkan rumusan kebijakan yang cerdas.

## 2. Arsitektur Sistem
Sistem dibangun dalam arsitektur Modern Backend/API:
1. **Database Layer (Supabase / PostgreSQL):** Bertindak sebagai gudang data tersentralisasi. Menggunakan relasi antarkolom berdasar `daerah` dan `tahun`.
2. **Backend Services (Node.js & Express):** Mengolah jalur endpoint API (`/api/apriori`) yang mengeksekusi penarikan kueri SQL.
3. **Pustaka Data Mining:** Memanfaatkan pustaka `node-apriori` berbasis JavaScript untuk proses analisis *Frequent Itemset Mining*.

## 3. Metodologi Pengolahan Data (Data Pipeline)

### a. Integrasi Data (SQL JOIN)
Sistem melakukan ekstraksi dan denormalisasi terhadap ratusan baris data dengan menautkan 7 (tujuh) tabel terpisah secara *realtime* di dalam database BPS:
- **Pembangunan Manusia (IPM)**
- **Rasio Gini (Ketimpangan Ekonomi)**
- **Upah Minimum Regional (UMR Provinsi)**
- **Angka Harapan Hidup**
- **Tingkat Pengangguran Terbuka**
- **Kepadatan Penduduk**
- **Persentase Gizi Buruk (Stunting)**

### b. Diskritisasi Data (*Binning/Categorization*)
Berhubung algoritma Apriori dirancang untuk *Market Basket Analysis* (data kategorik ordinal), sistem mengonversi setiap nilai cacah (*numeric continuous*) dari database, menjadi kategori biner ("Tinggi" dan "Rendah"). 
Sistem mengkalkulasi perhitungan **Angka Median Historis (Nilai Tengah)** pada metrik seperti Pengangguran, Gizi Buruk, Kepadatan Penduduk, dan UMR untuk merepresentasikan pembatas (ambang) parameter wajar Indonesia dengan valid sebelum klasifikasi dijalankan.

## 4. Pelaksanaan Model (Endpoint / API Dinamis)
Pengujian dan penarikan aturan algoritma Apriori dienkapsulasi menggunakan protokol standardisasi *REST API HTTP GET*, di mana bobot kepastian (sensitivitas) bisa direkayasa secara transparan melalui _query parameter_ web.
- `Support Target` bawaan: **10-15%**
- `Confidence Target` bawaan: **70-80%**

Bentuk pelaporan *(response)* disajikan dalam format skema data JSON yang kaya raya (*richly serialized*) guna mempermudah desainer grafis *(Frontend Developer)* menampilkannya di kanvas Dasbor Web.

## 5. Hasil Temuan Analitik (Analisis Korelatif Dasar)
Dari pengolahan ribuan intersesi baris data dan parameter wajar 15% Support & 80% Confidence, instrumen menemukan setidaknya 19 titik asosiasi lintas ekonomi. 
Beberapa ekstraktif kesimpulan (*Rules*) paling signifikan secara akademis antara lain:
*   `[Gini_Ketimpangan_Tinggi] MAKA [IPM_Tinggi]`: Mempertegas fenomena *Urbanisasi Metropolitan*, di mana letak terpusatnya tingginya ketimpangan miskin sejalan lurus dengan pembangunan manusia/perkotaan yang dipaksa tinggi.
*   `[Harapan_Hidup_Tinggi] MAKA [IPM_Tinggi]`: Tingginya harapan asupan kualitas hidup medis yang disajikan linear dengan korelasi laju parameter IPM negara.
*   `[UMR_Tinggi] MAKA [IPM_Tinggi]`: Menjadi fondasi aturan konklusif absolut pada kesejahteraan buruh. 

## 6. Kesimpulan Dan Saran Ekstensi
Infrastruktur backend data analitik ini resmi beroperasi memadukan data purba dari sistem SQL rumit ke instrumen pembaca cerdas pola kebijakan.
Pada kajian tahap selanjutnya, Proyek dapat dikembangkan secara visual menjadi _Web Dashboard Interactive_ berbasis _React_ / _Vue.js_ yang menangkap seluruh balasan JSON dan menggambarkannya menggunakan ragaan Graf Jaringan Interaktif *(Interactive Network Graphs)*. 

---
*Proyek Backend oleh: Pengembangan Sistem BPS / Dashboard Apriori (Server V.1.0).*
