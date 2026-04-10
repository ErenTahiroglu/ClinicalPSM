/**
 * Supabase RLS (Row Level Security) Policy Tests
 *
 * Bu testler, Supabase local emulator'a bağlanarak farklı kullanıcılar
 * arasındaki veri izolasyonunu doğrular.
 *
 * Çalıştırmak için:
 *   1. npx supabase start  (local Supabase instance'ı başlat)
 *   2. .env.test dosyasında TEST_USER_A_EMAIL, TEST_USER_B_EMAIL vb. tanımla
 *   3. npm run test:rls
 *
 * Bu testler production Supabase'e karşı ÇALIŞTIRILMAZ — yalnızca local.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Local Supabase bağlantı bilgileri (supabase start çıktısından)
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://localhost:54321'
const SUPABASE_ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ?? ''

// Test kullanıcı bilgileri (.env.test'ten)
const USER_A_EMAIL = process.env.TEST_USER_A_EMAIL ?? 'user_a@test.clinicalpsm.com'
const USER_B_EMAIL = process.env.TEST_USER_B_EMAIL ?? 'user_b@test.clinicalpsm.com'
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'TestPassword!123'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Admin client — RLS bypass, test setup/teardown için */
function adminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_LOCAL_SERVICE_ROLE_KEY is required for RLS tests')
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

/** Belirli bir kullanıcı oturumu açarak Supabase client döndür */
async function clientAs(email: string, password: string) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Login failed for ${email}: ${error.message}`)
  return client
}

/** Test kullanıcısı oluştur (yoksa) */
async function ensureTestUser(email: string, password: string) {
  const admin = adminClient()
  // createUser idempotent değil, varsa continue
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error && !error.message.includes('already registered')) {
    throw new Error(`Failed to create test user ${email}: ${error.message}`)
  }
}

/** Test kullanıcısını sil */
async function deleteTestUser(email: string) {
  const admin = adminClient()
  const { data } = await admin.auth.admin.listUsers()
  const user = data?.users.find(u => u.email === email)
  if (user) {
    await admin.auth.admin.deleteUser(user.id)
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Supabase RLS Policy Tests', () => {
  let userAId: string
  let userBId: string
  let userAAnalysisId: string

  // -----------------------------------------------------------------------
  // Setup: test kullanıcılarını oluştur
  // -----------------------------------------------------------------------
  beforeAll(async () => {
    await ensureTestUser(USER_A_EMAIL, TEST_PASSWORD)
    await ensureTestUser(USER_B_EMAIL, TEST_PASSWORD)

    // User ID'lerini al
    const admin = adminClient()
    const { data } = await admin.auth.admin.listUsers()
    userAId = data.users.find(u => u.email === USER_A_EMAIL)?.id ?? ''
    userBId = data.users.find(u => u.email === USER_B_EMAIL)?.id ?? ''

    if (!userAId || !userBId) {
      throw new Error('Test kullanıcıları oluşturulamadı')
    }

    // User A için bir analiz oluştur (admin client ile)
    const { data: analysis, error } = await admin
      .from('analyses')
      .insert({ user_id: userAId, name: 'RLS Test Analysis', status: 'draft' })
      .select()
      .single()

    if (error) throw new Error(`Test analizi oluşturulamadı: ${error.message}`)
    userAAnalysisId = analysis.id
  })

  // -----------------------------------------------------------------------
  // Teardown: test verilerini temizle
  // -----------------------------------------------------------------------
  afterAll(async () => {
    const admin = adminClient()

    // Analizleri temizle
    await admin.from('analyses').delete().eq('user_id', userAId)
    await admin.from('analyses').delete().eq('user_id', userBId)

    // Kullanıcıları sil
    await deleteTestUser(USER_A_EMAIL)
    await deleteTestUser(USER_B_EMAIL)
  })

  // -----------------------------------------------------------------------
  // profiles tablosu RLS testleri
  // -----------------------------------------------------------------------
  describe('profiles tablosu', () => {
    it('kullanıcı kendi profilini okuyabilmeli', async () => {
      const clientA = await clientAs(USER_A_EMAIL, TEST_PASSWORD)
      const { data, error } = await clientA
        .from('profiles')
        .select('*')
        .eq('user_id', userAId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data![0].user_id).toBe(userAId)
    })

    it("kullanıcı başkasının profilini okuyamamalı", async () => {
      const clientA = await clientAs(USER_A_EMAIL, TEST_PASSWORD)
      const { data, error } = await clientA
        .from('profiles')
        .select('*')
        .eq('user_id', userBId)

      expect(error).toBeNull()
      // RLS: satır dönmemeli
      expect(data).toHaveLength(0)
    })

    it("kullanıcı başkasının profilini güncelleyememeli", async () => {
      const clientA = await clientAs(USER_A_EMAIL, TEST_PASSWORD)
      const { error } = await clientA
        .from('profiles')
        .update({ plan: 'pro' })
        .eq('user_id', userBId)

      // RLS: ya hata dönmeli ya da 0 satır etkilenmeli
      if (error) {
        expect(error).toBeTruthy()
      } else {
        // Güncelleme 0 satır etkiledi (RLS filtreledi)
        const admin = adminClient()
        const { data } = await admin.from('profiles').select('plan').eq('user_id', userBId).single()
        expect(data?.plan).toBe('free') // değişmedi
      }
    })
  })

  // -----------------------------------------------------------------------
  // analyses tablosu RLS testleri
  // -----------------------------------------------------------------------
  describe('analyses tablosu', () => {
    it('kullanıcı kendi analizlerini listeliyebilmeli', async () => {
      const clientA = await clientAs(USER_A_EMAIL, TEST_PASSWORD)
      const { data, error } = await clientA.from('analyses').select('*')

      expect(error).toBeNull()
      // Tüm dönen analizler user A'ya ait olmalı
      data?.forEach(a => expect(a.user_id).toBe(userAId))
    })

    it("kullanıcı başkasının analizini okuyamamalı (doğrudan ID ile)", async () => {
      const clientB = await clientAs(USER_B_EMAIL, TEST_PASSWORD)
      const { data, error } = await clientB
        .from('analyses')
        .select('*')
        .eq('id', userAAnalysisId)

      expect(error).toBeNull()
      // RLS: satır dönmemeli
      expect(data).toHaveLength(0)
    })

    it("kullanıcı başkasının analizini güncelleyememeli", async () => {
      const clientB = await clientAs(USER_B_EMAIL, TEST_PASSWORD)
      const { error } = await clientB
        .from('analyses')
        .update({ name: 'Hacked!' })
        .eq('id', userAAnalysisId)

      // Başarılı olsa bile isim değişmemiş olmalı
      if (!error) {
        const admin = adminClient()
        const { data } = await admin.from('analyses').select('name').eq('id', userAAnalysisId).single()
        expect(data?.name).toBe('RLS Test Analysis')
      }
    })

    it("kullanıcı başkasının analizini silemememeli", async () => {
      const clientB = await clientAs(USER_B_EMAIL, TEST_PASSWORD)
      const { error } = await clientB
        .from('analyses')
        .delete()
        .eq('id', userAAnalysisId)

      // Silme sonrası analiz hâlâ var olmalı
      const admin = adminClient()
      const { data } = await admin.from('analyses').select('id').eq('id', userAAnalysisId).single()
      expect(data?.id).toBe(userAAnalysisId)
      // hata gelmesi de kabul edilir
      void error
    })

    it('kullanıcı kendi analizini oluşturabilmeli', async () => {
      const clientB = await clientAs(USER_B_EMAIL, TEST_PASSWORD)
      const { data, error } = await clientB
        .from('analyses')
        .insert({ user_id: userBId, name: 'User B Test', status: 'draft' })
        .select()
        .single()

      expect(error).toBeNull()
      expect(data?.user_id).toBe(userBId)

      // Temizle
      const admin = adminClient()
      await admin.from('analyses').delete().eq('id', data!.id)
    })
  })

  // -----------------------------------------------------------------------
  // uploads tablosu RLS testleri
  // -----------------------------------------------------------------------
  describe('uploads tablosu', () => {
    it("kullanıcı kendi analizinin upload'larını okuyabilmeli", async () => {
      // Önce admin ile bir upload kaydı ekle
      const admin = adminClient()
      const { data: upload } = await admin
        .from('uploads')
        .insert({
          analysis_id: userAAnalysisId,
          file_path: `csvs/${userAId}/test.csv`,
          row_count: 100,
          column_names: ['age', 'treatment'],
        })
        .select()
        .single()

      const clientA = await clientAs(USER_A_EMAIL, TEST_PASSWORD)
      const { data, error } = await clientA
        .from('uploads')
        .select('*')
        .eq('analysis_id', userAAnalysisId)

      expect(error).toBeNull()
      expect(data?.length).toBeGreaterThan(0)

      // Temizle
      await admin.from('uploads').delete().eq('id', upload!.id)
    })

    it("kullanıcı başkasının analizinin upload'larını okuyamamalı", async () => {
      const clientB = await clientAs(USER_B_EMAIL, TEST_PASSWORD)
      const { data, error } = await clientB
        .from('uploads')
        .select('*')
        .eq('analysis_id', userAAnalysisId)

      expect(error).toBeNull()
      // RLS: satır dönmemeli
      expect(data).toHaveLength(0)
    })
  })
})
