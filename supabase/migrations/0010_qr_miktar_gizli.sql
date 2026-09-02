-- =============================================================================
-- QR sayfasından miktar kaldırıldı
--
-- Müşteri QR'ı okuttuğunda hangi malzemelerin kullanıldığını görüyor ama
-- artık ne kadar kullanıldığını görmüyor.
--
-- Neden fonksiyondan da kaldırılıyor, sadece arayüzden değil?
--   Fonksiyon anon rolüne açık (QR sayfası girişsiz açılıyor). Veriyi
--   döndürüp arayüzde göstermemek gizlemek değil: müşteri tarayıcının ağ
--   sekmesinden ya da doğrudan uca istek atarak miktarı görebilir.
--   Gösterilmeyecek veri hiç gönderilmemeli.
--
-- Miktar neden hassas?
--   Kullanılan bakır telin gramı, işin maliyetini yaklaşık olarak ele
--   veriyor. Alış fiyatı zaten hiç dönmüyordu; miktarla birlikte piyasa
--   fiyatı çarpılarak maliyet tahmin edilebiliyordu.
-- =============================================================================

create or replace function public_job_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'job_title', j.title,
    'completed_at', j.completed_at,
    'materials', coalesce(
      (
        select jsonb_agg(
          /* YALNIZCA malzeme adı. Miktar (qty_pieces / qty_grams) ve birim
             bilinçli olarak DÖNDÜRÜLMÜYOR — bkz. dosya başlığı. */
          jsonb_build_object('name', p.name)
          order by p.name
        )
        from job_products jp
        join products p on p.id = jp.product_id
        where jp.job_id = j.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from qr_codes q
  join jobs j on j.id = q.job_id
  where q.token = p_token
    and j.status = 'completed';

  return v_result;  -- eşleşme yoksa null
end;
$$;

-- QR sayfası giriş yapmamış müşteriye açık: tek bilinmesi gereken token.
revoke all on function public_job_by_token(text) from anon, public;
grant execute on function public_job_by_token(text) to anon, authenticated;
