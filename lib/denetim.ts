import { createClient } from "@/lib/supabase/server";
import type { AuditEntity } from "@/lib/supabase/database.types";

/**
 * Veri değişikliği OLMAYAN eylemleri denetim günlüğüne yazar.
 *
 * Tabloları değiştiren her şey trigger'dan geçiyor; PDF almak ise hiçbir
 * satırı değiştirmediği için trigger göremiyor. Bu yüzden uygulama onu
 * açıkça bildiriyor.
 *
 * Neden hata fırlatmıyor? Kullanıcının indirmek istediği belge, günlük
 * yazılamadığı için engellenmemeli — denetim kaydı yardımcı bir kayıt,
 * işin kendisi değil. Sorun sunucu günlüğüne yazılıyor ki sessiz kalmasın.
 */
export async function denetimPdfKaydet(
  varlik: AuditEntity,
  varlikId: string | null,
  etiket: string | null,
  ayrinti?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("audit_kaydet", {
      p_entity: varlik,
      p_entity_id: varlikId,
      p_label: etiket,
      p_details: ayrinti ?? null,
    });
    if (error) {
      console.error("[denetim] PDF kaydı yazılamadı:", error.message);
    }
  } catch (e) {
    console.error("[denetim] PDF kaydı yazılamadı:", (e as Error).message);
  }
}
