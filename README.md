# Dashboard Apriori dengan Supabase

Dashboard berbasis Node.js yang terhubung dengan database PostgreSQL di Supabase untuk analisis data menggunakan algoritma Apriori.

## 📋 Prasyarat

- Node.js (v14 atau lebih tinggi)
- npm atau yarn
- Akun Supabase dengan database PostgreSQL
- Kredensial database Supabase

## 🚀 Setup Awal

### 1. Install Dependencies

```bash
npm install
```

Dependensi utama:
- `postgres` - Driver PostgreSQL untuk Node.js

### 2. Konfigurasi Environment

Buat file `.env` di root project dengan template:

```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/[DATABASE]
```

**Contoh:**
```env
DATABASE_URL=postgresql://postgres:JzTDxKeggAvLvIFn@db.eutpkxidtiuzklzzgmwe.supabase.co:5432/postgres
```

### 3. Test Koneksi Database

```bash
npm start
```

Output yang diharapkan:
```
Testing database connection...
✅ Database connected successfully!
Current time: [timestamp]
📊 Available tables: [list of tables]
```

## 📁 Struktur File

```
dashboard_apriori/
├── db.js                 # Konfigurasi koneksi database
├── index.js              # Entry point - test koneksi
├── queryData.js          # Script untuk execute queries
├── data_query.json       # Daftar queries yang akan diexecute
├── data_schema_tabel.json # Schema informasi tabel
├── package.json          # Project dependencies
├── .env                  # Environment variables (jangan commit!)
├── .gitignore           # Git ignore rules
├── .env.example         # Template .env (untuk dokumentasi)
└── supabase/            # Konfigurasi Supabase lokal
    └── config.toml
```

## 🔧 Perintah Tersedia

| Perintah | Deskripsi |
|----------|-----------|
| `npm start` | Test koneksi database |
| `npm run query` | Execute queries dari data_query.json |

## 📊 Menggunakan Data Queries

File `data_query.json` berisi daftar queries yang dapat dijalankan. Untuk menjalankannya:

```bash
node queryData.js
```

Fitur:
- Membaca queries dari `data_query.json`
- Menjalankan hingga 5 queries pertama sebagai sample
- Menampilkan hasil dan error dengan detail
- Summary hasil eksekusi

## 🔐 Security

**PENTING:** Jangan pernah commit file `.env` ke repository!

- File `.env` sudah ditambahkan ke `.gitignore`
- Gunakan `.env.example` sebagai template untuk dokumentasi
- Selalu gunakan environment variables untuk kredensial sensitif

## 📚 Koneksi Database

File `db.js` menggunakan driver `postgres`:

```javascript
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL
const sql = postgres(connectionString)

export default sql
```

Gunakan `sql` untuk menjalankan queries:

```javascript
const result = await sql`SELECT * FROM table_name LIMIT 5`
```

## 📖 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Postgres Driver](https://github.com/peerdb-io/peerdb)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## ⚠️ Troubleshooting

### Error: "Connection refused"
- Pastikan DATABASE_URL di `.env` benar
- Cek koneksi internet dan akses ke server Supabase

### Error: "ENOENT: no such file or directory"
- Pastikan file `data_query.json` ada di root project
- Jalankan command dari directory yang benar

### Error: "permission denied"
- Pastikan kredensial database memiliki permissions yang tepat
- Kontak admin Supabase jika diperlukan

## 📝 License

ISC

## 👤 Author

Dashboard Apriori Team
"# dashboard_apriori" 
