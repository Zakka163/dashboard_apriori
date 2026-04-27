# Laporan Analisis Data BPS (PostgreSQL)

Berdasarkan eksplorasi terhadap struktur schema dan tabel yang telah diekstrak, berikut adalah ulasan dan rekomendasi analitik untuk dataset BPS Anda.

## 1. Pengelompokan Jenis Data

Secara keseluruhan, database ini menyimpan data di lebih dari 30 *schema*. Menariknya, terdapat **77 tabel** yang secara konsisten memiliki struktur baku: `id`, `daerah` (provinsi/kabupaten), `tahun`, dan `jumlah` (nilai ukur). 

Tabel-tabel tersebut mengerucut pada kelompok jenis data utama:
- **Demografi & Kependudukan** (`api_bps_kependudukan_migrasi`): Populasi, kepadatan, jumlah rumah tangga.
- **Kesejahteraan Ekonomi** (`api_bps_konsumsi_pendapatan` & `api_bps_biaya_tenaga_kerja`): Garis kemiskinan, Gini Ratio, dan Upah Minimum Regional.
- **Kesehatan Masyarakat** (`api_bps_kesehatan`): Angka harapan hidup, prevalensi gizi buruk/stunting, imunisasi.
- **Pembangunan & Kualitas Hidup** (`api_bps_kondisi_tempat_tinggal`): Indeks Pembangunan Manusia (IPM), Indeks Kebahagiaan.
- **Energi & Infrastruktur** (`api_bps_energi`): Rasio elektrifikasi, air bersih.

## 2. Pemilihan 4 Tabel Terbaik untuk Analisis

Karena tabel-tabel ini memiliki irisan pilar dimensi yang sangat jelas, yaitu `daerah` dan `tahun`, kita bisa dengan mudah melakukan **JOIN** lintas *schema*. 

Berikut 4 tabel terbaik yang sangat direkomendasikan untuk digabungkan menjadi satu *dataset* utuh:

1. **`api_bps_kondisi_tempat_tinggal.mtd_br_ndks_pmbngnn_mns_pm_mnrt_prvns`** (Indeks Pembangunan Manusia / IPM)
2. **`api_bps_konsumsi_pendapatan.gn_rt_mnrt_prvns_dn_drh`** (Rasio Gini / Ketimpangan)
3. **`api_bps_biaya_tenaga_kerja.ph_mnmm_rgnlprpns`** (Upah Minimum Regional Provinsi)
4. **`api_bps_kesehatan.ngk_hrpn_hdp_hh_mnrt_prvns_dn_jns_klmn`** (Angka Harapan Hidup)

**Alasan Pemilihan:**
Keempat metrik ini saling berkaitan erat secara sosio-ekonomi. Kita dapat mengukur bagaimana tingginya upah minimum dan meratanya ekonomi (ditandai oleh Rasio Gini yang rendah) berbanding lurus dengan peningkatan kualitas kesehatan (Angka Harapan Hidup) dan pendidikan/kualitas SDM secara umum (IPM).

---

## 3. Jenis Analisis yang Paling Cocok

Dengan struktur data yang seragam (ruang dan waktu) serta numerik berkelanjutan, berikut evaluasi metode analitik:

*   **🏆 Clustering (K-Means / Hierarchical):** 
    **Sedia Digunakan & Sangat Cocok.** Anda bisa mengelompokkan provinsi-provinsi di Indonesia ke dalam klasternya masing-masing (misal: Klaster 1: IPM Rendah & Gini Tinggi, Klaster 2: IPM Tinggi & Gini Rendah). Ini akan langsung memunculkan *insight* target provinsi intervensi.
*   **🏆 Regresi Panel (Data Panel Regression / Linear Regression):** 
    **Sangat Cocok.** Karena datanya bersifat *time-series* lintas provinsi, Anda bisa mengukur regresi (misalnya: memprediksi seberapa besar kenaikan setiap Rp 100.000 Upah Minimum menaikkan skor Harapan Hidup pada tahun berikutnya).
*   **Korelasi (Pearson / Spearman):**
    **Cocok (Tahap Awal).** Bagus digunakan pada pilar Eksplorasi Data (EDA) untuk mengecek korelasi sederhana antara Gini Ratio dengan UMR.
*   **⚠️ Algoritma Apriori (Mengingat nama *project* Anda):**
    **Kurang Cocok Secara Default.** Karena algoritma *Apriori* (Market Basket Analysis) dikhususkan untuk frekuensi data kategorik, bukan numerik bersinambung.
    Namun, Anda **tetap bisa menggunakan algoritma Apriori** dengan tahap konversi (*Binning*): Anda harus mengubah setiap angka *jumlah* tersebut menjadi kategori (`Rendah`, `Sedang`, `Tinggi`). 
    *(Contoh transformasi Apriori: `JIKA UMR=Tinggi DAN Gini=Rendah, MAKA IPM=Tinggi [Confidence: 85%]`).*

---

## 4. Contoh Query SQL untuk Penggabungan (Feature Engineering)

Untuk menganalisisnya, kita perlu melakukan *join* dataset berdasarkan dimensi utama: `daerah` dan `tahun`.

```sql
SELECT 
    ipm.tahun,
    ipm.daerah AS provinsi,
    ipm.jumlah AS ipm_skor,
    gini.jumlah AS gini_ratio,
    umr.jumlah AS upah_minimum,
    kes.jumlah AS angka_harapan_hidup
FROM 
    api_bps_kondisi_tempat_tinggal.mtd_br_ndks_pmbngnn_mns_pm_mnrt_prvns ipm
JOIN 
    api_bps_konsumsi_pendapatan.gn_rt_mnrt_prvns_dn_drh gini
    ON ipm.daerah = gini.daerah AND ipm.tahun = gini.tahun
JOIN 
    api_bps_biaya_tenaga_kerja.ph_mnmm_rgnlprpns umr
    ON ipm.daerah = umr.daerah AND ipm.tahun = umr.tahun
JOIN 
    api_bps_kesehatan.ngk_hrpn_hdp_hh_mnrt_prvns_dn_jns_klmn kes
    ON ipm.daerah = kes.daerah AND ipm.tahun = kes.tahun
WHERE 
    ipm.tahun >= 2015 
ORDER BY 
    ipm.daerah ASC, ipm.tahun ASC;
```

---

## 5. Langkah Preprocessing Utama Sebelum Analisis

*Data mentah dari database nyaris tidak pernah siap untuk mesin (Machine Learning).* Ini langkah persiapan wajib Anda:

1.  **Penyelarasan Teks Entitas (*Entity Resolution / Clean String*):**
    Ketidaksamaan penomoran pada data BPS selalu terjadi. Pastikan nama setiap `daerah` sudah identik (Misalnya menyamakan "DKI JAKARTA", "JKT", "Jakarta", dan "D K I Jakarta" agar SQL Join tidak gagal).
2.  **Penanganan Nilai Kosong (*Missing Values Imputation*):**
    Gunakan metode interpolasi (atau pengisian dari rata-rata/median) jika suatu provinsi tiba-tiba tidak terekam datanya di suatu angka tahun karena akan sangat men-disrupsi model prediktor / *cluster*.
3.  **Standarisasi Skala Jarak Fitur (*Feature Scaling / Normalization*):**
    Satuan pada keempat tabel ini sama sekali tidak ekivalen (Upah Minimum dalam jutaan Rupiah, sedangkan nilai rasio Gini bernilai cacah koma 0.0 sampai 1.0). Sebelum masuk *Clustering K-Means*, **Wajib di-skalakan** menggunakan `MinMaxScaler` atau Z-Scores (`StandardScaler` di *Python Scikit-Learn*). Jika tidak di-skalakan, algoritma akan keliru menganggap bahwa variasi pada Jutaan UMR jauh lebih "penting" dibandingkan selisih desimal murni Rasio Gini.
4.  **Format Transaksional / Diskritisasi (*Untuk Apriori Saja*):**
    Gunakan `pd.cut()` di python Pandas untuk menyortir rentang numerik menjadi kategori ordinal (`Klasemen Tinggi`, dll) agar format datanya diubah berbentuk urutan kejadian transaksi yang siap ditarik Asosiasinya.
