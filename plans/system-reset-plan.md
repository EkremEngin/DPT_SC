# System Reset Plan

## Problem
Eski silinen sözleşmeler audit log'da görünüyor ve sistem tam sıfırlanması gerekiyor.

## Reset İşlemi

### 1. Audit Log Temizleme
```sql
DELETE FROM audit_logs;
```

### 2. Soft Delete Kayıtlarını Geri Yükleme
```sql
-- Tüm silinmiş kayıtları geri yükle
UPDATE campuses SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE blocks SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE units SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE companies SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE leases SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE company_documents SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE company_score_entries SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
```

### 3. Tam Reset İsteğe Bağlı (Eğer tam sıfırlama istenirse)
```sql
-- Tüm verileri temizle ve seed'den baştan yükle
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE leases CASCADE;
TRUNCATE TABLE company_score_entries CASCADE;
TRUNCATE TABLE company_documents CASCADE;
TRUNCATE TABLE companies CASCADE;
TRUNCATE TABLE units CASCADE;
TRUNCATE TABLE blocks CASCADE;
TRUNCATE TABLE campuses CASCADE;
-- Sonra seed script'i çalıştır
```

## Manuel Reset SQL Komutları

PostgreSQL'e bağlanıp şu komutları çalıştırabilirsiniz:

```sql
-- 1. Audit logları temizle
DELETE FROM audit_logs;

-- 2. Silinmiş kayıtları geri yükle
UPDATE campuses SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE blocks SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE units SET deleted_at = NULL, company_id = NULL WHERE deleted_at IS NOT NULL;
UPDATE companies SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE leases SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE company_documents SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
UPDATE company_score_entries SET deleted_at = NULL WHERE deleted_at IS NOT NULL;

-- 3. Kontrol et
SELECT 'Audit logs:', COUNT(*) FROM audit_logs
UNION ALL
SELECT 'Active campuses:', COUNT(*) FROM campuses WHERE deleted_at IS NULL
UNION ALL
SELECT 'Active companies:', COUNT(*) FROM companies WHERE deleted_at IS NULL
UNION ALL
SELECT 'Active leases:', COUNT(*) FROM leases WHERE deleted_at IS NULL;
```

## Otomatik Reset Script'i

`server/src/scripts/reset-system.ts` dosyası oluşturulacak ve şu komutla çalıştırılacak:

```bash
cd DPT-Local-main/server
npm run reset
```

Script şunları yapacak:
1. Audit logları temizleyecek
2. Tüm soft delete kayıtlarını geri yükleyecek
3. Sistem durumunu raporlayacak

## package.json Scripts Ekleme

`server/package.json`'a şunu ekle:

```json
"scripts": {
  "reset": "ts-node src/scripts/reset-system.ts"
}
```

## Sonrası

Reset tamamlandıktan sonra:
1. Backend'i yeniden başlat
2. Frontend'i yeniden başlat
3. Sistem temiz durumda başlamış olacak
