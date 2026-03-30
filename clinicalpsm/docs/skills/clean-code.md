description: Kod yazarken, refactor ederken veya review yaparken bu kuralları kesinlikle uygula.
---
- Kesinlikle TypeScript kullan. `any` tipi kullanmak yasaktır. Gerekirse `unknown` kullanıp tip kontrolü yap.
- DRY (Don't Repeat Yourself) kuralına uy. Aynı lojik birden fazla yerde varsa ortak bir utility veya hook yaz.
- SOLID prensiplerini uygula. Her fonksiyon ve bileşen tek bir işten sorumlu olmalı (Single Responsibility).
- Fonksiyonlarda "Early Return" pattern'ini benimse. İç içe geçmiş if-else blokları yazma.
- Değişken ve fonksiyon isimlendirmeleri İngilizce ve açıklayıcı olmalı (`data1`, `temp` gibi isimler yasak).