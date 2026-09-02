import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AuditEntity } from "@/lib/supabase/database.types";

/**
 * İstek, kullanıcının gerçek bir eylemi mi yoksa tarayıcının/Next'in
 * kendiliğinden yaptığı bir ön yükleme mi?
 *
 * next/link viewport'a giren bağlantıyı önceden getiriyor; hedef bir API
 * rotasıysa rota gerçekten çalışıyor. Asıl düzeltme bu bağlantıları düz
 * <a> yapmak (bkz. ButonLink), ama denetim günlüğü yanlış kayıt tutmaya
 * karşı ikinci bir katmanı hak ediyor: bir kez kirlenen günlük güvenilmez
 * hâle geliyor ve salt-eklenir olduğu için temizlenmesi de kolay değil.
 */
async function onYuklemeMi(): Promise<boolean> {
  try {
    const h = await headers();
    return (
      h.get("next-router-prefetch") === "1" ||
      h.get("rsc") === "1" ||
      /prefetch/i.test(h.get("purpose") ?? "") ||
      /prefetch/i.test(h.get("sec-purpose") ?? "")
    );
  } catch {
    return false;
  }
}

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
  if (await onYuklemeMi()) return;

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
