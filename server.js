import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sql from './db.js';
import { Apriori } from 'node-apriori';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Endpoint untuk algoritma Apriori
app.get('/api/apriori', async (req, res) => {
    try {
        // Ambil penyesuaian dari frontend (Query params), pasang default jika kosong
        // Support and confidence should be passed as decimals (e.g. 0.1 for 10%)
        let min_support = parseFloat(req.query.support);
        let min_confidence = parseFloat(req.query.confidence);

        // Fallback default
        if (isNaN(min_support)) min_support = 0.10;
        if (isNaN(min_confidence)) min_confidence = 0.70;

        console.log(`[API Endpoint] GET /api/apriori dipanggil (Support: ${min_support*100}%, Confidence: ${min_confidence*100}%)`);

        // 1. Kueri Data
        const data = await sql`
            SELECT 
                ipm.tahun,
                ipm.daerah AS provinsi,
                ipm.jumlah AS ipm_skor,
                gini.jumlah AS gini_ratio,
                umr.jumlah AS upah_minimum,
                kes.jumlah AS harapan_hidup,
                png.jumlah AS pengangguran,
                kpd.jumlah AS kepadatan_penduduk,
                gz.jumlah AS gizi_buruk
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
            JOIN 
                api_bps_tenaga_kerja.tngkt_pngnggrn_trbk_mnrt_prvns png
                ON ipm.daerah = png.daerah AND ipm.tahun = png.tahun
            JOIN 
                api_bps_kependudukan_migrasi.kpdtn_pnddk_mnrt_prvns kpd
                ON ipm.daerah = kpd.daerah AND ipm.tahun = kpd.tahun
            JOIN 
                api_bps_kesehatan.prvlns_blt_gz_brk_mnrt_prvns_d_ndns_psg gz
                ON ipm.daerah = gz.daerah AND ipm.tahun = gz.tahun
            WHERE 
                ipm.tahun >= 2015 
            ORDER BY 
                ipm.tahun ASC, ipm.daerah ASC;
        `;

        if (data.length === 0) {
            return res.status(404).json({ error: 'Tidak ada data ditemukan di Supabase.' });
        }

        // 2. Binning Dinamis
        const umrSorted = data.map(d => parseFloat(d.upah_minimum)).sort((a,b) => a-b);
        const umrMedian = umrSorted[Math.floor(umrSorted.length / 2)];

        const pengangguranSorted = data.map(d => parseFloat(d.pengangguran)).sort((a,b) => a-b);
        const pengangguranMedian = pengangguranSorted[Math.floor(pengangguranSorted.length / 2)];

        const rataKepadatan = data.reduce((sum, d) => sum + parseFloat(d.kepadatan_penduduk), 0) / data.length;
        const rataGiziBuruk = data.reduce((sum, d) => sum + parseFloat(d.gizi_buruk), 0) / data.length;
        
        const transactions = [];
        for (const raw of data) {
            let transaction = [];

            if (raw.ipm_skor >= 70) transaction.push('IPM_Tinggi');
            else transaction.push('IPM_Sedang_Rendah');

            if (raw.gini_ratio <= 0.35) transaction.push('Gini_Rendah_Rata');
            else transaction.push('Gini_Ketimpangan_Tinggi');

            if (raw.upah_minimum >= umrMedian) transaction.push('UMR_Tinggi');
            else transaction.push('UMR_Rendah');

            if (parseFloat(raw.harapan_hidup) >= 70.0) transaction.push('Harapan_Hidup_Tinggi');
            else transaction.push('Harapan_Hidup_Rendah');

            if (parseFloat(raw.pengangguran) >= pengangguranMedian) transaction.push('Pengangguran_Tinggi');
            else transaction.push('Pengangguran_Rendah');

            if (parseFloat(raw.kepadatan_penduduk) >= rataKepadatan) transaction.push('Padat_Penduduk');
            else transaction.push('Lengang_Penduduk');

            if (parseFloat(raw.gizi_buruk) >= rataGiziBuruk) transaction.push('GiziBuruk_Tinggi');
            else transaction.push('GiziBuruk_Rendah');

            transactions.push(transaction);
        }

        // 3. Algoritma Apriori Berjalan
        const apriori = new Apriori(min_support);
        
        // Memaksa tunggu array kosong (bawaan library)
        apriori.on('data', itemset => {});

        const executionResult = await apriori.exec(transactions);
        const itemsets = executionResult.itemsets;

        // 4. Perhitungan Association Rules & Confidence
        const supportDic = {};
        itemsets.forEach(itemset => {
            const key = itemset.items.sort().join(',');
            supportDic[key] = itemset.support;
        });

        const generatedRules = [];

        itemsets.forEach(itemset => {
            if (itemset.items.length === 2) {
                const A = itemset.items[0];
                const B = itemset.items[1];
                
                const supportA = supportDic[A];
                const supportB = supportDic[B];
                const supportAB = itemset.support; // count murni
                
                const supportPercent = (supportAB / data.length) * 100;

                // Hitung A -> B
                const confA_B = supportAB / supportA;
                if(confA_B >= min_confidence) {
                    generatedRules.push({
                        jika: A,
                        maka: B,
                        support: Number(supportPercent.toFixed(1)),
                        confidence: Number((confA_B * 100).toFixed(1))
                    });
                }

                // Hitung B -> A
                const confB_A = supportAB / supportB;
                if(confB_A >= min_confidence) {
                    generatedRules.push({
                        jika: B,
                        maka: A,
                        support: Number(supportPercent.toFixed(1)),
                        confidence: Number((confB_A * 100).toFixed(1))
                    });
                }
            }
        });

        // Hapus duplikasi Rules memutar array
        const uniqueRules = generatedRules.filter((value, index, self) =>
            index === self.findIndex((t) => (
                t.jika === value.jika && t.maka === value.maka
            ))
        );

        res.json({
            status: "success",
            total_data_points: data.length,
            parameters_used: {
                min_support: min_support,
                min_confidence: min_confidence
            },
            total_rules_found: uniqueRules.length,
            rules: uniqueRules
        });

    } catch (error) {
        console.error('Error saat API memproses Apriori:', error);
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server Dashboard berjalan pada: http://localhost:${PORT}`);
    console.log(`🔎 Test API Apriori: http://localhost:${PORT}/api/apriori`);
});
