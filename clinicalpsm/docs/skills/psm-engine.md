---
description: src/lib/psm/ altındaki istatistiksel algoritmalar ve hesaplama fonksiyonları üzerinde çalışırken bu kuralları uygula.
---
- Bu dizindeki tüm fonksiyonlar "Pure Function" olmak zorundadır. Dışarıdan bir state değiştiremezler (No side-effects).
- Girdi verilerinde eksik veya hatalı değer olup olmadığını (NaN, undefined) hesaplamaya başlamadan önce validate et.
- Hataları genel `Error` objesi ile değil, spesifik `PsmError` custom class'ı ile fırlat.
- Yazdığın her matematiksel algoritma için uç durumları (edge cases) test eden unit testler yazmak zorundasın.