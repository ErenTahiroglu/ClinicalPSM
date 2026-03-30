description: Supabase bağlantısı, veritabanı sorguları (SQL/ORM), Auth işlemleri veya RLS politikaları yazılırken bu kuralları uygula.
---
- API route'larında işlem yapmadan önce HER ZAMAN `auth.getUser()` ile kullanıcı oturumunu doğrula.
- Tablo isimleri `snake_case`, TS tarafındaki model tipleri `PascalCase` olmalıdır.
- Kullanıcıya ait verileri çekerken sadece Row Level Security (RLS) politikalarına güvenme, sorgulara her zaman kullanıcı ID'sini de filtre olarak ekle.
- Veritabanı hatalarını `try/catch` ile yakala ve client'a güvenli/sansürlenmiş hata mesajları dön.