-- =============================================================================
-- Anlaşılan tutar / tahsilat ayrımı — çok vadeli ödeme
--
-- SORUN: sistem "anlaşılan para" ile "alınan para"yı aynı şey sayıyordu.
-- Fatura yüklemek ya da elden tutar girmek tek vadede tahsil edilmiş
-- sayılıyor, aylık gelir de o tarihe yazılıyordu. Gerçekte anlaşılan
-- para tek seferde ödenmiyor.
--
-- ÇÖZÜM: iki ayrı kavram.
--
--   1) ANLAŞILAN TUTAR (segments.agreed_amount / fatura brütü)
--      Müşteriyle konuşulan toplam. Fatura yüklendiyse faturadan,
--      yüklenmediyse elle giriliyor. Bir borç, bir tahsilat değil.
--
--   2) TAHSİLAT (payments)
--      Fiilen alınan para. Bir segmentte birden çok olabiliyor ("vade").
--      Her birinin KENDİ TARİHİ var ve aylık gelir bu tarihe yazılıyor —
--      kullanıcının açık isteği. Anlaşma tarihi değil, paranın eline
--      geçtiği tarih önemli.
--
-- Aylık gelir artık NAKİT ESASLI. Bu bilinçli bir tercih: "bu ay kasaya
-- ne girdi" sorusunun cevabı. Yapılan ama tahsil edilmemiş iş gelirde
-- görünmüyor; onun karşılığı "kalan alacak".
--
-- İşin tamamlanmasıyla paranın hiçbir bağı YOK: tamamlanmamış işin
-- parası peşin alınabiliyor, tamamlanmış işin parası aylar sonra
-- gelebiliyor. complete_job() bu yüzden tutar parametresini kaybetti.
-- =============================================================================

-- #############################################################################
-- 1) charged_amount -> agreed_amount
--
-- Ad artık yanlış olurdu: "charged" tahsil edilmiş parayı çağırıyor ve
-- tahsilat ayrı bir tabloya taşındı. İki kavramın adı birbirine
-- benzemeyecek.
-- #############################################################################

/* 0014'un trigger'i charged_amount kolonuna BAGIMLI; kolon oldugu gibi
   dusurulemiyor ("cannot drop column ... because other objects depend on
   it"). Trigger birkac satir asagida yeniden kuruluyor, o yuzden burada
   dusurmek guvenli. `cascade` kullanilmiyor: bir kolonun pesinden neyin
   birlikte gittigini gormek istiyoruz. */
drop trigger if exists segments_ciro_cakismasi on segments;

do $$
declare
  t text;
begin
  foreach t in array array['segments', 'jobs']
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t
        and column_name = 'charged_amount'
    ) then
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = t
          and column_name = 'agreed_amount'
      ) then
        /* Kurulum dosyası baştan çalıştırıldı: 0014'ün
           "add column if not exists charged_amount" satırı, adı
           değiştirilmiş kolonu görmediği için BOŞ bir kolon daha
           ekliyor. İçinde veri olabilecek tek durum, elle yazılmış
           olması; yine de veriyi taşıyıp kolonu atıyoruz. */
        execute format(
          'update %I set agreed_amount = coalesce(agreed_amount, charged_amount)
           where charged_amount is not null', t);
        execute format('alter table %I drop column charged_amount', t);
      else
        execute format('alter table %I rename column charged_amount to agreed_amount', t);
      end if;
    end if;
  end loop;
end $$;

/* Kolon 0014 hiç çalışmadan doğrudan buraya gelinirse diye. */
alter table segments
  add column if not exists agreed_amount numeric(12, 2)
    check (agreed_amount is null or agreed_amount >= 0);

alter table jobs
  add column if not exists agreed_amount numeric(12, 2)
    check (agreed_amount is null or agreed_amount >= 0);

comment on column segments.agreed_amount is
  'Musteriyle anlasilan TOPLAM tutar (fatura kesilmeyen isler icin). Bir '
  'segmentte YA fatura YA bu tutar olur; ikisi de "anlasilan toplam"i '
  'ifade ettigi icin ikisi birden anlamsiz. Tahsil edilen para bu kolonda '
  'DEGIL, payments tablosunda.';

comment on column jobs.agreed_amount is
  'Is basina anlasilan tutar. YALNIZCA NOT: hicbir ciro, tahsilat, kar '
  'veya rapor hesabina girmiyor. Para segment duzeyinde takip ediliyor. '
  'Isin durumundan bagimsiz her zaman duzenlenebilir.';

-- -----------------------------------------------------------------------------
-- "Ya fatura ya elle girilen anlaşılan tutar" kuralı
--
-- 0014'teki iki yönlü trigger korunuyor; gövde kolon adını PLPGSQL
-- içinde ÇALIŞMA ANINDA çözdüğü için yeniden tanımlanması ZORUNLU —
-- yoksa rename sonrası "record new has no field charged_amount" hatası
-- verirdi.
-- -----------------------------------------------------------------------------
create or replace function segment_ciro_cakismasi()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tutar  numeric;
  v_fatura integer;
begin
  /* Iki taraf iki ayri soru soruyor. Segment tarafindan gelen "bu
     segmentte fatura var mi", fatura tarafindan gelen "bu segmentte
     elle girilmis tutar var mi" diye sormali; birlestirmeye calismak
     once hataliydi. */
  if TG_TABLE_NAME = 'segments' then
    if new.agreed_amount is null then return new; end if;

    select count(*) into v_fatura
    from invoices
    where segment_id = new.id and deleted_at is null;

    if v_fatura > 0 then
      raise exception
        'Bu segmentte fatura var; anlasilan tutar faturadan geliyor. Elle tutar girmek icin once faturayi kaldirin.'
        using errcode = 'check_violation';
    end if;
  else
    if new.segment_id is null then return new; end if;

    select agreed_amount into v_tutar
    from segments where id = new.segment_id and deleted_at is null;

    if v_tutar is not null then
      raise exception
        'Bu segmente elle anlasilan tutar girilmis; ayrica fatura eklenemez. Once tutari bosaltin.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists segments_ciro_cakismasi on segments;
create trigger segments_ciro_cakismasi
  before insert or update of agreed_amount on segments
  for each row execute function segment_ciro_cakismasi();

drop trigger if exists invoices_ciro_cakismasi on invoices;
create trigger invoices_ciro_cakismasi
  before insert or update of segment_id on invoices
  for each row execute function segment_ciro_cakismasi();

revoke all on function segment_ciro_cakismasi() from anon, public, authenticated;

-- #############################################################################
-- 2) payments — tahsilat / vade
--
-- Segment düzeyinde, iş düzeyinde değil: müşteri bir gelişte birden çok
-- iş bırakıyor ve parayı işlere bölerek ödemiyor. "500 verdi" demek
-- segmente 500 girmek demek.
-- #############################################################################

create table if not exists payments (
  id         uuid primary key default gen_random_uuid(),
  segment_id uuid not null references segments (id) on delete cascade,
  /* Sifir tutarli tahsilat bir kayit degil, gurultu. */
  amount     numeric(12, 2) not null check (amount > 0),
  /* Paranin ELE GECTIGI gun. Varsayilan bugun cunku tahsilat cogunlukla
     alindigi gun giriliyor; gecmise donuk giris de mumkun olmali.
     Aylik gelir bu kolona gore hesaplaniyor. */
  paid_on    date not null default current_date,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table payments is
  'Segment basina tahsilat (vade). Anlasilan tutar tek seferde odenmedigi '
  'icin bir segmentte birden cok satir olabiliyor. paid_on = paranin ele '
  'gectigi gun; aylik gelir bu tarihe gore hesaplaniyor.';

comment on column payments.paid_on is
  'Paranin alindigi gun. Fatura tarihi veya segment tarihi DEGIL: nakit '
  'esasli gelir hesabi bu kolona bagli.';

create index if not exists payments_segment_idx
  on payments (segment_id) where deleted_at is null;

/* Aylik gelir sorgusu tarih araligiyla tarama yapiyor. */
create index if not exists payments_paid_on_idx
  on payments (paid_on desc) where deleted_at is null;

drop trigger if exists payments_set_updated_at on payments;
create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — 0013'teki kalıbın aynısı: DELETE politikası YOK
-- -----------------------------------------------------------------------------
alter table payments enable row level security;

drop policy if exists payments_staff_select on payments;
create policy payments_staff_select
  on payments for select to authenticated using (true);

drop policy if exists payments_staff_insert on payments;
create policy payments_staff_insert
  on payments for insert to authenticated with check (true);

drop policy if exists payments_staff_update on payments;
create policy payments_staff_update
  on payments for update to authenticated using (true) with check (true);

/* Fiziksel silme yok: para kaydi yumusak siliniyor ki yanlislikla
   silinen bir tahsilat geri getirilebilsin. */
revoke delete on payments from authenticated, anon;
revoke all on payments from anon;
grant select, insert, update on payments to authenticated;

-- -----------------------------------------------------------------------------
-- Denetim günlüğü
-- -----------------------------------------------------------------------------
alter table audit_log drop constraint if exists audit_log_entity_gecerli;
alter table audit_log add constraint audit_log_entity_gecerli check (entity in (
  'customer', 'segment', 'job', 'job_product',
  'product', 'stock_movement', 'invoice', 'report', 'payment'
));

drop trigger if exists payments_audit on payments;
create trigger payments_audit after insert or update or delete on payments
  for each row execute function audit_trigger('payment');

-- -----------------------------------------------------------------------------
-- Yumuşak silme listesine ekleniyor
-- -----------------------------------------------------------------------------
create or replace function kayit_sil(p_tablo text, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_etkilenen integer;
begin
  if p_tablo not in ('customers','segments','jobs','job_products',
                     'invoices','products','payments') then
    raise exception 'Bu tabloda yumusak silme tanimli degil: %', p_tablo
      using errcode = 'invalid_parameter_value';
  end if;

  execute format(
    'update %I set deleted_at = now() where id = $1 and deleted_at is null',
    p_tablo
  ) using p_id;

  get diagnostics v_etkilenen = row_count;

  if v_etkilenen = 0 then
    raise exception 'Kayit bulunamadi veya zaten silinmis'
      using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function kayit_sil(text, uuid) from anon, public;
grant execute on function kayit_sil(text, uuid) to authenticated;

-- #############################################################################
-- 3) segment_balances — segmentin para durumu tek satırda
--
-- Üç ekran ve PDF aynı hesabı yapıyor: anlaşılan ne, tahsil edilen ne,
-- kalan ne. Üç yerde ayrı yazılsa biri değişip diğeri kalırdı.
--
-- kalan NULL kalabiliyor: anlaşılan tutar hiç girilmemişse "borç yok"
-- değil "borç bilinmiyor" demektir. Sıfır yazmak bunu gizlerdi.
-- #############################################################################

create or replace view segment_balances as
select
  s.id                as segment_id,
  s.customer_id,
  s.segment_date,
  f.fatura_sayisi,
  f.brut_toplam       as fatura_toplam,
  s.agreed_amount     as elle_girilen,
  /* Anlasilan toplam: fatura varsa faturanin BRUTU (musterinin odedigi
     rakam), yoksa elle girilen tutar. Ikisi birden olamiyor. */
  case when f.fatura_sayisi > 0 then f.brut_toplam else s.agreed_amount end
                      as anlasilan,
  coalesce(t.tahsilat, 0)::numeric(14,2) as tahsil_edilen,
  coalesce(t.vade_sayisi, 0)             as vade_sayisi,
  t.son_tahsilat,
  case
    when f.fatura_sayisi > 0 then (f.brut_toplam - coalesce(t.tahsilat, 0))::numeric(14,2)
    when s.agreed_amount is not null then (s.agreed_amount - coalesce(t.tahsilat, 0))::numeric(14,2)
    else null
  end                 as kalan
from segments s
left join segment_invoice_totals f on f.segment_id = s.id
left join (
  select segment_id,
         sum(amount)   as tahsilat,
         count(*)      as vade_sayisi,
         max(paid_on)  as son_tahsilat
  from payments
  where deleted_at is null
  group by segment_id
) t on t.segment_id = s.id
where s.deleted_at is null;

alter view segment_balances set (security_invoker = on);
grant select on segment_balances to authenticated;
revoke all on segment_balances from anon;

-- #############################################################################
-- 4) Yazma fonksiyonları
-- #############################################################################

-- Eski ad: 0014'te "elden alınan tutar" anlamındaydı, artık "anlaşılan".
drop function if exists segment_tutar_yaz(uuid, numeric);

create or replace function segment_anlasilan_yaz(
  p_segment_id uuid,
  p_tutar numeric
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_var integer;
begin
  if p_tutar is not null and p_tutar < 0 then
    raise exception 'Tutar negatif olamaz' using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into v_var from segments
  where id = p_segment_id and deleted_at is null;
  if v_var = 0 then
    raise exception 'Segment bulunamadi' using errcode = 'no_data_found';
  end if;

  /* Fatura çakışması trigger'da; buradan geçen null tutarı temizliyor ve
     fatura yolunu tekrar açıyor. */
  update segments set agreed_amount = p_tutar where id = p_segment_id;
end;
$$;

revoke all on function segment_anlasilan_yaz(uuid, numeric) from anon, public;
grant execute on function segment_anlasilan_yaz(uuid, numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- Tahsilat ekleme
--
-- Anlaşılan tutar girilmemişken de tahsilat kabul ediliyor: para
-- kağıttan önce gelebiliyor ve kullanıcıyı "önce şunu gir" diye
-- durdurmak sahada işi tıkıyor. Fazla tahsilat da reddedilmiyor —
-- avans, yuvarlama ve kur farkı gerçek; arayüz farkı gösteriyor.
-- -----------------------------------------------------------------------------
create or replace function tahsilat_ekle(
  p_segment_id uuid,
  p_tutar numeric,
  p_tarih date default current_date,
  p_not text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_var integer;
begin
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tahsilat tutari sifirdan buyuk olmali'
      using errcode = 'invalid_parameter_value';
  end if;

  /* Gelecek tarihli tahsilat reddediliyor: "alinan para"nin tanimi
     geriye donuk. Ileri tarihli bir vade PLANLANMIS odemedir ve bu
     sistem plan tutmuyor — gelir hesabina girse o ay olmayan para
     gelir gibi gorunurdu. */
  if p_tarih > current_date then
    raise exception 'Tahsilat tarihi gelecekte olamaz: %', p_tarih
      using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into v_var from segments
  where id = p_segment_id and deleted_at is null;
  if v_var = 0 then
    raise exception 'Segment bulunamadi' using errcode = 'no_data_found';
  end if;

  insert into payments (segment_id, amount, paid_on, note)
  values (p_segment_id, p_tutar, coalesce(p_tarih, current_date),
          nullif(btrim(coalesce(p_not, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function tahsilat_ekle(uuid, numeric, date, text) from anon, public;
grant execute on function tahsilat_ekle(uuid, numeric, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Tahsilat düzeltme
--
-- Yanlış tutar ya da yanlış tarih girilmesi sık: tarih düzeltilebilmeli,
-- yoksa gelir yanlış aya yazılıyor ve düzeltmenin tek yolu kaydı silip
-- yeniden girmek olurdu (denetim günlüğünde iki gürültülü satır).
-- -----------------------------------------------------------------------------
create or replace function tahsilat_guncelle(
  p_id uuid,
  p_tutar numeric,
  p_tarih date,
  p_not text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_etkilenen integer;
begin
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tahsilat tutari sifirdan buyuk olmali'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_tarih is null then
    raise exception 'Tahsilat tarihi girilmeli'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_tarih > current_date then
    raise exception 'Tahsilat tarihi gelecekte olamaz: %', p_tarih
      using errcode = 'invalid_parameter_value';
  end if;

  update payments
  set amount  = p_tutar,
      paid_on = p_tarih,
      note    = nullif(btrim(coalesce(p_not, '')), '')
  where id = p_id and deleted_at is null;

  get diagnostics v_etkilenen = row_count;
  if v_etkilenen = 0 then
    raise exception 'Tahsilat bulunamadi veya silinmis'
      using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function tahsilat_guncelle(uuid, numeric, date, text) from anon, public;
grant execute on function tahsilat_guncelle(uuid, numeric, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Segmentin tahsilat listesi
-- -----------------------------------------------------------------------------
create or replace function segment_tahsilatlari(p_segment_id uuid)
returns table (
  tahsilat_id uuid,
  tutar       numeric,
  tarih       date,
  not_        text,
  girildi     timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select id, amount, paid_on, note, created_at
  from payments
  where segment_id = p_segment_id and deleted_at is null
  /* Tarihe gore artan: vadeler olus sirasiyla okunmali ("1. vade,
     2. vade"). Ayni gune iki tahsilat girilirse created_at ayiriyor. */
  order by paid_on asc, created_at asc;
$$;

revoke all on function segment_tahsilatlari(uuid) from anon, public;
grant execute on function segment_tahsilatlari(uuid) to authenticated;

-- #############################################################################
-- 5) GEÇİŞ: mevcut kayıtlar tek vade olarak taşınıyor
--
-- 0014 öncesi sistem anlaşılan parayı tahsil edilmiş sayıyordu. Tahsilat
-- tablosu boş bırakılsa geçmiş dönem raporları SIFIR gelir gösterirdi —
-- veri kaybı gibi görünen, sessiz ve yanlış bir sonuç.
--
-- Bu yüzden her mevcut fatura ve elle girilmiş tutar için BİR vade
-- yazılıyor: eski sistemin varsaydığı şeyin aynısı, artık açıkça bir
-- kayıt olarak. Notu geçişten geldiğini söylüyor; gerçekte tahsil
-- edilmemiş olanlar panelden silinebiliyor.
--
-- Segmentinde zaten tahsilat olan kayıtlar atlanıyor: kurulum dosyası
-- baştan çalıştırıldığında para ikiye katlanmasın.
-- #############################################################################

insert into payments (segment_id, amount, paid_on, note)
select s.id, s.agreed_amount, s.segment_date,
       '0015 gecisi: eski "elden alinan tutar" kaydi tek vade olarak tasindi'
from segments s
where s.agreed_amount is not null
  and s.agreed_amount > 0
  and s.deleted_at is null
  and not exists (select 1 from payments p where p.segment_id = s.id);

insert into payments (segment_id, amount, paid_on, note)
select i.segment_id, sum(i.gross_amount), min(i.issue_date),
       '0015 gecisi: fatura tutari tek vade olarak tasindi'
from invoices i
where i.segment_id is not null
  and i.deleted_at is null
  and not exists (select 1 from payments p where p.segment_id = i.segment_id)
group by i.segment_id
having sum(i.gross_amount) > 0;

-- #############################################################################
-- 6) complete_job — tutar parametresi kalktı
--
-- İşin tamamlanmasıyla paranın bağı yok. Tutar iş sayfasından her zaman
-- düzenlenebilen bir NOT; tamamlama formunda tekrar sorulması aynı alanı
-- üçüncü bir yerden yazmak olurdu ve "tamamlarken girmezsem kaybolur mu"
-- sorusunu doğuruyordu.
-- #############################################################################

drop function if exists complete_job(uuid, service_type[], numeric, boolean);

create or replace function complete_job(
  p_job_id uuid,
  p_service_types service_type[],
  p_allow_negative boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_job        jobs;
  v_line       record;
  v_new_pieces integer;
  v_new_grams  integer;
  v_token      text;
  v_line_count integer := 0;
  v_turler     service_type[];
begin
  if p_service_types is null or array_length(p_service_types, 1) is null then
    raise exception 'En az bir islem secilmeli: motor sarimi ve/veya revizyon'
      using errcode = 'invalid_parameter_value';
  end if;

  select array_agg(distinct t order by t) into v_turler
  from unnest(p_service_types) as t;

  select * into v_job from jobs where id = p_job_id for update;

  if not found or v_job.deleted_at is not null then
    raise exception 'Is bulunamadi: %', p_job_id using errcode = 'no_data_found';
  end if;

  if v_job.status = 'completed' then
    raise exception 'Is zaten tamamlanmis: %', p_job_id
      using errcode = 'invalid_parameter_value';
  end if;

  /* MALIYET DONDURMA — tamamlama anındaki fiyat (0014). */
  update job_products jp
  set unit_cost_snapshot = p.purchase_price
  from products p
  where jp.product_id = p.id
    and jp.job_id = p_job_id
    and jp.deleted_at is null;

  for v_line in
    select jp.id,
           jp.product_id,
           jp.qty_pieces_used,
           jp.qty_grams_used,
           p.name       as product_name,
           p.qty_pieces as stock_pieces,
           p.qty_grams  as stock_grams
    from job_products jp
    join products p on p.id = jp.product_id
    where jp.job_id = p_job_id
      and jp.deleted_at is null
    order by jp.product_id
    for update of p
  loop
    v_line_count := v_line_count + 1;
    v_new_pieces := v_line.stock_pieces - v_line.qty_pieces_used;
    v_new_grams  := v_line.stock_grams  - v_line.qty_grams_used;

    if not p_allow_negative and (v_new_pieces < 0 or v_new_grams < 0) then
      raise exception
        'Stok yetersiz: % (mevcut: % adet / % gram, gereken: % adet / % gram)',
        v_line.product_name,
        v_line.stock_pieces, v_line.stock_grams,
        v_line.qty_pieces_used, v_line.qty_grams_used
        using errcode = 'check_violation';
    end if;

    update products
    set qty_pieces = v_new_pieces,
        qty_grams  = v_new_grams
    where id = v_line.product_id;

    insert into stock_movements (
      product_id, job_id, movement_type, qty_pieces_delta, qty_grams_delta, note
    )
    values (
      v_line.product_id, p_job_id, 'job_out',
      -v_line.qty_pieces_used,
      -v_line.qty_grams_used,
      'Is tamamlandi: ' || v_job.title
    );
  end loop;

  update jobs
  set status        = 'completed',
      completed_at  = now(),
      service_types = v_turler
  where id = p_job_id;

  insert into qr_codes (job_id) values (p_job_id)
  on conflict (job_id) do nothing;

  select token into v_token from qr_codes where job_id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'qr_token', v_token,
    'service_types', v_turler,
    'material_lines', v_line_count
  );
end;
$$;

revoke all on function complete_job(uuid, service_type[], boolean) from anon, public;
grant execute on function complete_job(uuid, service_type[], boolean) to authenticated;

-- #############################################################################
-- 7) RAPORLAR: gelir tahsilat tarihinden
--
-- Değişen tek şey gelirin KAYNAĞI değil, TARİHİ: para hangi ay alındıysa
-- o ayın geliri. Anlaşılan tutar ayrıca dönülüyor ki "iş yaptım ama
-- tahsil etmedim" durumu kâr/zararda kayıp gibi görünmesin.
-- #############################################################################

create or replace function dashboard_summary(p_start date, p_end date)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with tahsilat as (
    select coalesce(sum(p.amount), 0)::numeric(14,2) as toplam,
           count(*)                                  as sayi
    from payments p
    join segments s on s.id = p.segment_id and s.deleted_at is null
    where p.deleted_at is null
      and p.paid_on between p_start and p_end
  ),
  /* ANLASILAN taraf segment_balances uzerinden okunuyor, dogrudan
     invoices/segments uzerinden DEGIL. Sebep: kalan alacak da ayni
     gorunumden geliyor ve iki rakamin birbirini tutmasi gerekiyor.
     Faturayi issue_date ile, segmenti segment_date ile saymak
     "anlasilan - tahsilat = kalan" esitligini bozuyordu; ustelik
     segmentsiz bir fatura (sema izin veriyor) anlasilana girip
     alacaga hic girmiyordu.
     Tek olcut: SEGMENT tarihi. Anlasma, isin birakildigi gun yapiliyor. */
  anlasilan as (
    select
      coalesce(sum(sb.anlasilan), 0)::numeric(14,2) as toplam,
      coalesce(sum(case when sb.fatura_sayisi > 0
                        then sb.anlasilan else 0 end), 0)::numeric(14,2) as faturali,
      coalesce(sum(case when sb.fatura_sayisi = 0
                        then coalesce(sb.anlasilan, 0) else 0 end), 0)::numeric(14,2) as elden,
      count(*) filter (where sb.fatura_sayisi = 0
                         and sb.elle_girilen is not null) as elden_sayisi
    from segment_balances sb
    where sb.segment_date between p_start and p_end
  ),
  /* Fatura rakamlari muhasebe icin ayrica duruyor ve olcutu FATURA
     TARIHI: vergi hangi ay beyan edilecekse o aya ait. Bilincli olarak
     yukaridakinden farkli bir eksen. */
  fatura as (
    select coalesce(sum(tax_amount), 0)::numeric(14,2) as vergi,
           count(*)                                     as sayi
    from invoices
    where issue_date between p_start and p_end
      and deleted_at is null
  ),
  /* Kalan alacak bir AKIS degil BAKIYE: donem sonu itibariyla acik olan
     borc. Aralik baslangici umursanmiyor, cunku 3 ay once anlasilip hala
     odenmemis para bugun de alacak.
     greatest(...,0): fazla tahsilat baska bir segmentin borcunu
     kapatmiyor. */
  bakiye as (
    select coalesce(sum(greatest(sb.kalan, 0)), 0)::numeric(14,2) as kalan
    from segment_balances sb
    where sb.segment_date <= p_end
      and sb.kalan is not null
  ),
  maliyet as (
    select coalesce(sum(jc.material_cost), 0)::numeric(14,2) as toplam
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between p_start and p_end
      and j.deleted_at is null
  ),
  isler as (
    select
      count(*) filter (where status = 'completed'
                         and completed_at::date between p_start and p_end) as tamamlanan,
      count(*) filter (where status <> 'completed')                        as acik
    from jobs
    where deleted_at is null
  )
  select jsonb_build_object(
    'baslangic', p_start,
    'bitis', p_end,
    /* NAKIT: donemde eline gecen para. Ana rakam. */
    'tahsilat', tahsilat.toplam,
    'tahsilat_sayisi', tahsilat.sayi,
    /* TAHAKKUK: donemde anlasilan toplam. Tahsil edilmis olmasi
       gerekmiyor; ikisinin farki kalan alacaga gidiyor. */
    'anlasilan_tutar', anlasilan.toplam,
    'faturali_anlasilan', anlasilan.faturali,
    'elden_anlasilan', anlasilan.elden,
    'fatura_sayisi', fatura.sayi,
    'elden_sayisi', anlasilan.elden_sayisi,
    'vergi', fatura.vergi,
    'kalan_alacak', bakiye.kalan,
    'malzeme_maliyeti', maliyet.toplam,
    /* Kar/zarar NAKIT esasli: tahsilat - malzeme gideri. */
    'kar_zarar', (tahsilat.toplam - maliyet.toplam)::numeric(14,2),
    'tamamlanan_is', isler.tamamlanan,
    'acik_is', isler.acik
  )
  from tahsilat, anlasilan, fatura, bakiye, maliyet, isler;
$$;

revoke all on function dashboard_summary(date, date) from anon, public;
grant execute on function dashboard_summary(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Aylık seyir — gelir sütunu artık tahsilat
--
-- `create or replace` dönüş kolonunun ADINI değiştiremiyor; önce
-- düşürülüyor. Ad değişmesi gerekiyordu: "net_gelir" fatura netini
-- çağırıyordu, gelen sayı artık tahsil edilen para.
-- -----------------------------------------------------------------------------
drop function if exists monthly_trend(integer);

create or replace function monthly_trend(p_ay_sayisi integer default 12)
returns table (
  donem date,
  tahsilat numeric,
  malzeme_maliyeti numeric,
  kar_zarar numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with aylar as (
    select generate_series(
      date_trunc('month', current_date) - ((greatest(p_ay_sayisi, 1) - 1) || ' months')::interval,
      date_trunc('month', current_date),
      '1 month'
    )::date as donem
  ),
  gelir as (
    select date_trunc('month', p.paid_on)::date as ay, sum(p.amount) as tutar
    from payments p
    join segments s on s.id = p.segment_id and s.deleted_at is null
    where p.deleted_at is null
    group by 1
  ),
  maliyet as (
    select date_trunc('month', j.completed_at)::date as ay,
           sum(jc.material_cost) as tutar
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed' and j.completed_at is not null
      and j.deleted_at is null
    group by 1
  )
  select
    a.donem,
    coalesce(g.tutar, 0)::numeric(14,2),
    coalesce(m.tutar, 0)::numeric(14,2),
    (coalesce(g.tutar, 0) - coalesce(m.tutar, 0))::numeric(14,2)
  from aylar a
  left join gelir g on g.ay = a.donem
  left join maliyet m on m.ay = a.donem
  order by a.donem;
$$;

revoke all on function monthly_trend(integer) from anon, public;
grant execute on function monthly_trend(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Müşteri bazlı kırılım — kalan alacak eklendi
--
-- "Kim bana ne kadar borçlu" bu geliştirmenin asıl karşılığı; raporda
-- görünmezse tahsilat takibi yine deftere kalır.
-- -----------------------------------------------------------------------------
drop function if exists dashboard_by_customer(date, date);

create or replace function dashboard_by_customer(p_start date, p_end date)
returns table (
  customer_id uuid,
  customer_name text,
  tahsilat numeric,
  malzeme_maliyeti numeric,
  kar_zarar numeric,
  kalan_alacak numeric,
  tamamlanan_is bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with gelir as (
    select s.customer_id, sum(p.amount) as tutar
    from payments p
    join segments s on s.id = p.segment_id and s.deleted_at is null
    where p.deleted_at is null
      and p.paid_on between p_start and p_end
    group by s.customer_id
  ),
  /* Alacak bakiyesi donem sonu itibariyla, aralik baslangicindan
     bagimsiz (bkz. dashboard_summary). */
  alacak as (
    select sb.customer_id, sum(greatest(sb.kalan, 0)) as tutar
    from segment_balances sb
    where sb.segment_date <= p_end and sb.kalan is not null
    group by sb.customer_id
  ),
  maliyet as (
    select s.customer_id, sum(jc.material_cost) as tutar, count(*) as is_sayisi
    from jobs j
    join segments s on s.id = j.segment_id
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between p_start and p_end
      and j.deleted_at is null and s.deleted_at is null
    group by s.customer_id
  )
  select
    c.id, c.name,
    coalesce(g.tutar, 0)::numeric(14,2),
    coalesce(m.tutar, 0)::numeric(14,2),
    (coalesce(g.tutar, 0) - coalesce(m.tutar, 0))::numeric(14,2),
    coalesce(a.tutar, 0)::numeric(14,2),
    coalesce(m.is_sayisi, 0)
  from customers c
  left join gelir g   on g.customer_id = c.id
  left join alacak a  on a.customer_id = c.id
  left join maliyet m on m.customer_id = c.id
  where c.deleted_at is null
    and (g.tutar is not null or m.tutar is not null
         or coalesce(a.tutar, 0) > 0)
  order by (coalesce(g.tutar, 0) - coalesce(m.tutar, 0)) desc;
$$;

revoke all on function dashboard_by_customer(date, date) from anon, public;
grant execute on function dashboard_by_customer(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- monthly_summaries: bilinçli olarak dokunulmuyor
--
-- 0005'te gecelik önbellek olarak eklendi ama panelin hiçbir yeri onu
-- OKUMUYOR (dashboard_summary canlı hesaplıyor). Kolonları fatura
-- eksenli; tahsilata çevirmek kullanılmayan bir tablonun şemasını
-- değiştirmek olurdu. Yanlış okunmaması için işaretleniyor.
-- -----------------------------------------------------------------------------
comment on table monthly_summaries is
  'KULLANILMIYOR. 0005 onbellegi; rakamlari FATURA eksenli ve 0015 sonrasi '
  'gelir tanimiyla (tahsilat tarihi) ORTUSMUYOR. Panel dashboard_summary() '
  'ile canli hesapliyor. Rapor icin bu tabloya bakilmamali.';
