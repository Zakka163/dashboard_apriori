import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const { fileURLToPath } = require('url');
import sql from './db.js';
import { Apriori } from 'node-apriori';

const app = express();
const PORT = process.env.PORT_CL || 3001;

app.use(cors());
app.use(express.json());

const __dirname = path.dirname(fileURLToPath('file://' + process.argv[1]));
app.use(express.static(path.join(__dirname, 'public')));

// ======================================================================
// Konfigurasi: Tabel _cl yang akan dianalisis beserta kategori targetnya
// ======================================================================
const CL_TABLE_CONFIG = [
    { table: 'api_bps_kondisi_tempat_tinggal.jmlh_dn_prsnts_pnddk_mskn_mnrt_prvns_cl', kategori_target: 'persentase_penduduk_miskin_september', label: 'kemiskinan', alias: 'mskin' },
    { table: 'api_bps_kesehatan.jmlh_kss_pnykt_mnrt_prvns_cl', kategori_target: 'jumlah_kasus_penyakit_tb_paru', label: 'tb_paru', alias: 'tbp' },
    { table: 'api_bps_kesehatan.jmlh_rmh_skt_mnrt_prvns_cl', kategori_target: 'jumlah_puskesmas', label: 'puskesmas', alias: 'pskm' },
    { table: 'api_bps_kesehatan.jmlh_tng_kshtn_mnrt_prvns_cl', kategori_target: 'tenaga_kesehatan_dokter', label: 'dokter', alias: 'dktr' },
    { table: 'api_bps_pendidikan.jmlh_sklh_gr_dn_mrd_sklh_dsr_sd_mnrt_prvns_cl', kategori_target: 'jumlah_murid_sd_negeriswasta', label: 'murid_sd', alias: 'msd' },
    { table: 'api_bps_transportasi.pnjng_jln_mnrt_prvns_cl', kategori_target: 'jumlah_panjang_jalankm', label: 'panjang_jalan', alias: 'pjl' },
    { table: 'api_bps_tenaga_kerja.pncr_krj_lwngn_krj_dn_pnmptn_trdftr_mnrt_prvns_cl', kategori_target: 'lowongan_kerja_terdaftar_jumlah', label: 'lowongan_kerja', alias: 'lwk' },
    { table: 'api_bps_kependudukan_migrasi.lj_prtmbhn_dn_kpdtn_pnddk_mnrt_prvns_cl', kategori_target: 'kepadatan_penduduk_per_km_persegi', label: 'kepadatan_penduduk', alias: 'kpd' }
];

// Subset khusus investigasi TB Paru
const TB_TABLE_CONFIG = [
    { table: 'api_bps_kesehatan.jmlh_kss_pnykt_mnrt_prvns_cl', kategori_target: 'jumlah_kasus_penyakit_tb_paru', label: 'tb_paru', alias: 'tbp' },
    { table: 'api_bps_kesehatan.jmlh_rmh_skt_mnrt_prvns_cl', kategori_target: 'jumlah_puskesmas', label: 'puskesmas', alias: 'pskm' },
    { table: 'api_bps_kesehatan.jmlh_tng_kshtn_mnrt_prvns_cl', kategori_target: 'tenaga_kesehatan_dokter', label: 'dokter', alias: 'dktr' },
    { table: 'api_bps_kependudukan_migrasi.lj_prtmbhn_dn_kpdtn_pnddk_mnrt_prvns_cl', kategori_target: 'kepadatan_penduduk_per_km_persegi', label: 'kepadatan_penduduk', alias: 'kpd' },
    { table: 'api_bps_tenaga_kerja.pncr_krj_lwngn_krj_dn_pnmptn_trdftr_mnrt_prvns_cl', kategori_target: 'lowongan_kerja_terdaftar_jumlah', label: 'lowongan_kerja', alias: 'lwk' }
];

// ======================================================================
// Helper: Query satu tabel _cl
// ======================================================================
async function queryClTable(config) {
    try {
        const rows = await sql`
            SELECT tahun, provinsi, jumlah
            FROM ${sql(config.table)}
            WHERE LOWER(kategori) = LOWER(${config.kategori_target})
            AND tahun >= 2015
            ORDER BY tahun, provinsi
        `;
        return rows;
    } catch (err) {
        console.warn(`[WARN] Gagal query ${config.table} (${config.kategori_target}):`, err.message);
        return [];
    }
}

// ======================================================================
// Helper: Discretization berdasarkan Median
// ======================================================================
function binByMedian(values, label) {
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return { median, binner: (v) => parseFloat(v) >= median ? `${label}_Tinggi` : `${label}_Rendah` };
}

// ======================================================================
// Helper: Bangun masterMap + completeKeys dari konfigurasi tabel
// ======================================================================
async function buildDataset(tableConfigs) {
    const allResults = await Promise.all(
        tableConfigs.map(async (cfg) => ({ cfg, rows: await queryClTable(cfg) }))
    );

    const masterMap = {};
    for (const { cfg, rows } of allResults) {
        if (rows.length === 0) {
            console.warn(`[WARN] Tidak ada data untuk ${cfg.label}`);
            continue;
        }
        for (const row of rows) {
            const key = `${row.provinsi}__${row.tahun}`;
            if (!masterMap[key]) masterMap[key] = {};
            masterMap[key][cfg.label] = parseFloat(row.jumlah);
        }
    }

    const labelsRequired = tableConfigs.map(c => c.label);
    const completeKeys = Object.keys(masterMap).filter(key =>
        labelsRequired.every(lbl => masterMap[key][lbl] !== undefined && !isNaN(masterMap[key][lbl]))
    );

    return { masterMap, completeKeys, labelsRequired };
}

// ======================================================================
// Helper: Buat transactions dari subset keys
// ======================================================================
function makeTransactions(keys, labelsRequired, masterMap) {
    if (keys.length === 0) return [];
    const binnersMap = {};
    for (const lbl of labelsRequired) {
        const vals = keys.map(k => masterMap[k][lbl]);
        binnersMap[lbl] = binByMedian(vals, lbl);
    }
    return keys.map(key =>
        labelsRequired.map(lbl => binnersMap[lbl].binner(masterMap[key][lbl]))
    );
}

// ======================================================================
// Core: Jalankan Apriori dan hitung rules dengan metrik Lift
// max_antecedent_size: 1 = rules 1-item, 2 = termasuk 2-item antecedent
// ======================================================================
async function computeRules(transactions, min_support, min_confidence, max_antecedent_size = 1) {
    if (transactions.length === 0) return { rules: [] };

    const totalN = transactions.length;
    const apriori = new Apriori(min_support);
    apriori.on('data', () => {});
    const result = await apriori.exec(transactions);
    const itemsets = result.itemsets;

    // Bangun support dictionary dengan key = items diurutkan + join '|||'
    const supportDic = {};
    itemsets.forEach(is => {
        const key = [...is.items].sort().join('|||');
        supportDic[key] = is.support;
    });

    const rules = [];

    itemsets.forEach(is => {
        const size = is.items.length;

        // ── 1-antecedent rules (dari itemset 2-item) ──
        if (size === 2) {
            const items = [...is.items].sort();
            const [A, B] = items;
            const supAB = is.support;
            const supA = supportDic[A] || 0;
            const supB = supportDic[B] || 0;
            if (!supA || !supB) return;

            const supPct = (supAB / totalN) * 100;

            const confAB = supAB / supA;
            if (confAB >= min_confidence) {
                rules.push({
                    antecedent: A, consequent: B,
                    support: +supPct.toFixed(1),
                    confidence: +(confAB * 100).toFixed(1),
                    lift: +( confAB / (supB / totalN) ).toFixed(2)
                });
            }

            const confBA = supAB / supB;
            if (confBA >= min_confidence) {
                rules.push({
                    antecedent: B, consequent: A,
                    support: +supPct.toFixed(1),
                    confidence: +(confBA * 100).toFixed(1),
                    lift: +( confBA / (supA / totalN) ).toFixed(2)
                });
            }
        }

        // ── 2-antecedent rules (dari itemset 3-item) ──
        if (size === 3 && max_antecedent_size >= 2) {
            const items = [...is.items].sort();
            const supABC = is.support;
            const supPct = (supABC / totalN) * 100;

            for (let i = 0; i < items.length; i++) {
                const consequent = items[i];
                const antecedents = items.filter((_, j) => j !== i);
                const antKey = antecedents.join('|||');
                const conKey = consequent;

                const supAnt = supportDic[antKey];
                const supCon = supportDic[conKey];
                if (!supAnt || !supCon) continue;

                const conf = supABC / supAnt;
                if (conf >= min_confidence) {
                    const lift = conf / (supCon / totalN);
                    rules.push({
                        antecedent: antecedents.join(' + '),
                        consequent,
                        antecedent_items: antecedents,
                        support: +supPct.toFixed(1),
                        confidence: +(conf * 100).toFixed(1),
                        lift: +lift.toFixed(2),
                        is_multi: true
                    });
                }
            }
        }
    });

    // Deduplikasi & urutkan: lift desc → confidence desc
    const uniqueRules = rules.filter((v, i, s) =>
        i === s.findIndex(t => t.antecedent === v.antecedent && t.consequent === v.consequent)
    );
    uniqueRules.sort((a, b) => b.lift - a.lift || b.confidence - a.confidence);

    return { rules: uniqueRules };
}

// ======================================================================
// ENDPOINT 1: GET /api/apriori-cl
// Query params: support, confidence, min_lift, itemset_size (1 atau 2)
// ======================================================================
app.get('/api/apriori-cl', async (req, res) => {
    try {
        const min_support    = parseFloat(req.query.support)    || 0.10;
        const min_confidence = parseFloat(req.query.confidence) || 0.70;
        const min_lift       = parseFloat(req.query.min_lift)   || 0;
        const itemset_size   = parseInt(req.query.itemset_size) || 1;

        console.log(`[CL API] GET /api/apriori-cl — sup:${min_support*100}% conf:${min_confidence*100}% lift:${min_lift} size:${itemset_size}`);

        const { masterMap, completeKeys, labelsRequired } = await buildDataset(CL_TABLE_CONFIG);

        if (completeKeys.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Tidak cukup data lengkap (semua indikator). Coba kurangi indikator.'
            });
        }

        console.log(`[CL API] ${completeKeys.length} transaksi lengkap.`);

        // Bangun binnersMap untuk categorization + transactions
        const binnersMap = {};
        for (const lbl of labelsRequired) {
            const vals = completeKeys.map(k => masterMap[k][lbl]);
            binnersMap[lbl] = binByMedian(vals, lbl);
        }
        const transactions = completeKeys.map(key =>
            labelsRequired.map(lbl => binnersMap[lbl].binner(masterMap[key][lbl]))
        );

        const { rules } = await computeRules(transactions, min_support, min_confidence, itemset_size);

        // Filter by lift
        const filtered = min_lift > 0 ? rules.filter(r => r.lift >= min_lift) : rules;

        // ── Bangun transactions_detail: data asli dari DB beserta kategori per baris ──
        const transactions_detail = completeKeys.map(key => {
            const [provinsi, tahun] = key.split('__');
            const row = masterMap[key];
            const values = {};
            for (const lbl of labelsRequired) {
                values[lbl] = {
                    jumlah: +row[lbl].toFixed(2),
                    kategori: binnersMap[lbl].binner(row[lbl])   // 'label_Tinggi' | 'label_Rendah'
                };
            }
            return { provinsi, tahun: parseInt(tahun), values };
        }).sort((a, b) => a.provinsi.localeCompare(b.provinsi) || a.tahun - b.tahun);

        return res.json({
            status: 'success',
            data_source: '_cl tables (multi-kategori)',
            total_transactions: completeKeys.length,
            indicators_used: labelsRequired,
            parameters: { min_support, min_confidence, min_lift, itemset_size },
            total_rules_found: filtered.length,
            rules: filtered,
            transactions_detail
        });

    } catch (err) {
        console.error('[CL API Error]', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

// ======================================================================
// ENDPOINT 2: GET /api/apriori-cl/controlled
// Bagi data menjadi 2 grup berdasarkan median kepadatan_penduduk,
// jalankan Apriori di masing-masing grup. Rules yang muncul di kedua
// grup dianggap lebih robust (tidak confounded oleh kepadatan).
// ======================================================================
app.get('/api/apriori-cl/controlled', async (req, res) => {
    try {
        const min_support    = parseFloat(req.query.support)    || 0.10;
        const min_confidence = parseFloat(req.query.confidence) || 0.70;

        console.log(`[CL API] GET /api/apriori-cl/controlled`);

        const { masterMap, completeKeys, labelsRequired } = await buildDataset(CL_TABLE_CONFIG);

        if (completeKeys.length < 10) {
            return res.status(404).json({ status: 'error', message: 'Data tidak cukup untuk analisis terkontrol.' });
        }

        // Bagi berdasarkan median kepadatan_penduduk
        const sorted = [...completeKeys].sort((a, b) =>
            masterMap[a]['kepadatan_penduduk'] - masterMap[b]['kepadatan_penduduk']
        );
        const medianKpd = masterMap[sorted[Math.floor(sorted.length / 2)]]['kepadatan_penduduk'];

        const denseKeys  = completeKeys.filter(k => masterMap[k]['kepadatan_penduduk'] >= medianKpd);
        const sparseKeys = completeKeys.filter(k => masterMap[k]['kepadatan_penduduk'] <  medianKpd);

        const [denseResult, sparseResult] = await Promise.all([
            computeRules(makeTransactions(denseKeys,  labelsRequired, masterMap), min_support, min_confidence),
            computeRules(makeTransactions(sparseKeys, labelsRequired, masterMap), min_support, min_confidence)
        ]);

        // Identifikasi rules yang muncul di KEDUA grup (robust)
        const denseSet  = new Set(denseResult.rules.map(r  => `${r.antecedent}→${r.consequent}`));
        const sparseSet = new Set(sparseResult.rules.map(r => `${r.antecedent}→${r.consequent}`));

        const robustKeys     = [...denseSet].filter(k =>  sparseSet.has(k));
        const denseOnlyKeys  = [...denseSet].filter(k => !sparseSet.has(k));
        const sparseOnlyKeys = [...sparseSet].filter(k => !denseSet.has(k));

        return res.json({
            status: 'success',
            control_variable: 'kepadatan_penduduk',
            median_threshold: +medianKpd.toFixed(2),
            group_dense: {
                label: 'Wilayah Padat (kepadatan ≥ median)',
                n: denseKeys.length,
                rules: denseResult.rules
            },
            group_sparse: {
                label: 'Wilayah Jarang (kepadatan < median)',
                n: sparseKeys.length,
                rules: sparseResult.rules
            },
            comparison: {
                robust_rules:      robustKeys,
                dense_only_rules:  denseOnlyKeys,
                sparse_only_rules: sparseOnlyKeys,
                summary: {
                    dense_total:  denseResult.rules.length,
                    sparse_total: sparseResult.rules.length,
                    robust_total: robustKeys.length
                }
            }
        });

    } catch (err) {
        console.error('[CL API Controlled Error]', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

// ======================================================================
// ENDPOINT 3: GET /api/apriori-cl/segmented
// Pisah wilayah: Urban (Q75+ kepadatan) vs Rural (Q25- kepadatan).
// Identifikasi rules yang berbeda antar segmen.
// ======================================================================
app.get('/api/apriori-cl/segmented', async (req, res) => {
    try {
        const min_support    = parseFloat(req.query.support)    || 0.10;
        const min_confidence = parseFloat(req.query.confidence) || 0.70;

        console.log(`[CL API] GET /api/apriori-cl/segmented`);

        const { masterMap, completeKeys, labelsRequired } = await buildDataset(CL_TABLE_CONFIG);

        if (completeKeys.length < 8) {
            return res.status(404).json({ status: 'error', message: 'Data tidak cukup untuk segmentasi.' });
        }

        const sorted  = [...completeKeys].sort((a, b) =>
            masterMap[a]['kepadatan_penduduk'] - masterMap[b]['kepadatan_penduduk']
        );
        const q25val = masterMap[sorted[Math.floor(sorted.length * 0.25)]]['kepadatan_penduduk'];
        const q75val = masterMap[sorted[Math.floor(sorted.length * 0.75)]]['kepadatan_penduduk'];

        const urbanKeys = completeKeys.filter(k => masterMap[k]['kepadatan_penduduk'] >= q75val);
        const ruralKeys = completeKeys.filter(k => masterMap[k]['kepadatan_penduduk'] <= q25val);

        const [urbanResult, ruralResult] = await Promise.all([
            computeRules(makeTransactions(urbanKeys, labelsRequired, masterMap), min_support, min_confidence),
            computeRules(makeTransactions(ruralKeys, labelsRequired, masterMap), min_support, min_confidence)
        ]);

        const urbanSet = new Set(urbanResult.rules.map(r => `${r.antecedent}→${r.consequent}`));
        const ruralSet = new Set(ruralResult.rules.map(r => `${r.antecedent}→${r.consequent}`));

        return res.json({
            status: 'success',
            segmentation_variable: 'kepadatan_penduduk',
            thresholds: { urban_above: +q75val.toFixed(2), rural_below: +q25val.toFixed(2) },
            urban: {
                label: 'Urban (Kepadatan ≥ Q75)',
                n: urbanKeys.length,
                rules: urbanResult.rules
            },
            rural: {
                label: 'Rural (Kepadatan ≤ Q25)',
                n: ruralKeys.length,
                rules: ruralResult.rules
            },
            comparison: {
                urban_only:  [...urbanSet].filter(k => !ruralSet.has(k)),
                rural_only:  [...ruralSet].filter(k => !urbanSet.has(k)),
                shared:      [...urbanSet].filter(k =>  ruralSet.has(k))
            }
        });

    } catch (err) {
        console.error('[CL API Segmented Error]', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

// ======================================================================
// ENDPOINT 4: GET /api/apriori-cl/tb-analysis
// Investigasi khusus TB Paru:
// - Analisis subset indikator TB
// - Cek apakah lowongan_kerja→tb_paru bertahan setelah kontrol kepadatan
// - Spurious correlation test
// ======================================================================
app.get('/api/apriori-cl/tb-analysis', async (req, res) => {
    try {
        const min_support    = parseFloat(req.query.support)    || 0.10;
        const min_confidence = parseFloat(req.query.confidence) || 0.60; // lebih rendah untuk investigasi

        console.log(`[CL API] GET /api/apriori-cl/tb-analysis`);

        // Dataset penuh (untuk analisis terkontrol)
        const full = await buildDataset(CL_TABLE_CONFIG);
        // Dataset TB subset
        const tb   = await buildDataset(TB_TABLE_CONFIG);

        // TB subset analysis
        const tbTransactions = makeTransactions(tb.completeKeys, tb.labelsRequired, tb.masterMap);
        const tbResult = await computeRules(tbTransactions, min_support, min_confidence);

        // Kontrol kepadatan pada dataset penuh
        const kpdSorted = [...full.completeKeys].sort((a, b) =>
            full.masterMap[a]['kepadatan_penduduk'] - full.masterMap[b]['kepadatan_penduduk']
        );
        const medKpd    = full.masterMap[kpdSorted[Math.floor(kpdSorted.length / 2)]]['kepadatan_penduduk'];
        const denseKeys = full.completeKeys.filter(k => full.masterMap[k]['kepadatan_penduduk'] >= medKpd);
        const sparseKeys= full.completeKeys.filter(k => full.masterMap[k]['kepadatan_penduduk'] <  medKpd);

        const [denseResult, sparseResult] = await Promise.all([
            computeRules(makeTransactions(denseKeys,  full.labelsRequired, full.masterMap), min_support, min_confidence),
            computeRules(makeTransactions(sparseKeys, full.labelsRequired, full.masterMap), min_support, min_confidence)
        ]);

        // Filter rules yang melibatkan tb_paru
        const filterTB = (rules) => rules.filter(r =>
            r.antecedent.includes('tb_paru') || r.consequent.includes('tb_paru')
        );

        // Cek spesifik: lowongan_kerja → tb_paru
        const findLwkToTb = (rules) => rules.find(r =>
            r.antecedent.includes('lowongan_kerja') && r.consequent.includes('tb_paru')
        ) || null;

        const denseTBRules  = filterTB(denseResult.rules);
        const sparseTBRules = filterTB(sparseResult.rules);
        const inDense  = !!findLwkToTb(denseTBRules);
        const inSparse = !!findLwkToTb(sparseTBRules);

        let conclusion;
        if      ( inDense &&  inSparse) conclusion = 'Rule muncul di kedua segmen. Kemungkinan bukan spurious — ada faktor lain, perlu investigasi lebih lanjut.';
        else if ( inDense && !inSparse) conclusion = 'Rule hanya muncul di wilayah padat. Kemungkinan besar dimediasi oleh kepadatan penduduk (efek urbanisasi).';
        else if (!inDense &&  inSparse) conclusion = 'Rule hanya muncul di wilayah jarang. Anomali — perlu investigasi konteks lokal.';
        else                            conclusion = 'Rule tidak muncul setelah kontrol kepadatan. Kemungkinan besar spurious correlation akibat confounding kepadatan penduduk.';

        return res.json({
            status: 'success',
            focus: 'Investigasi TB Paru',
            tb_subset_analysis: {
                indicators: tb.labelsRequired,
                n_transactions: tb.completeKeys.length,
                tb_rules: filterTB(tbResult.rules)
            },
            controlled_by_kepadatan: {
                median_threshold: +medKpd.toFixed(2),
                dense: {
                    label: 'Wilayah Padat (kepadatan ≥ median)',
                    n: denseKeys.length,
                    tb_rules: denseTBRules,
                    lowongan_to_tb: findLwkToTb(denseTBRules)
                },
                sparse: {
                    label: 'Wilayah Jarang (kepadatan < median)',
                    n: sparseKeys.length,
                    tb_rules: sparseTBRules,
                    lowongan_to_tb: findLwkToTb(sparseTBRules)
                }
            },
            spurious_check: {
                rule: 'lowongan_kerja → tb_paru',
                appears_in_dense:  inDense,
                appears_in_sparse: inSparse,
                conclusion
            }
        });

    } catch (err) {
        console.error('[CL API TB Error]', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

// ======================================================================
app.listen(PORT, () => {
    console.log(`🚀 Server Apriori-CL: http://localhost:${PORT}`);
    console.log(`   /api/apriori-cl              — Analisis utama (+ lift, multi-item)`);
    console.log(`   /api/apriori-cl/controlled   — Kontrol variabel kepadatan`);
    console.log(`   /api/apriori-cl/segmented    — Segmentasi urban vs rural`);
    console.log(`   /api/apriori-cl/tb-analysis  — Investigasi TB Paru`);
});
