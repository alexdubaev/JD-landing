import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const raw = read('raw/wordstat-observed.json');
const inventory = read('inventory.json');
const normalize = (s) => s.toLocaleLowerCase('ru-RU').trim().replace(/\s+/gu, ' ');
const num = (s) => Number(String(s).replace(/[\s\u00a0]/gu, '').replace(',', '.'));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const hasWord = (s, token) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(token)}(?![\\p{L}\\p{N}])`, 'iu').test(s);
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex');

function parsePeriod(period) {
  const m = String(period).match(/(\d{2}\.\d{2}\.\d{4})\s*[–-]\s*(\d{2}\.\d{2}\.\d{4})\s*:\s*([\d\s\u00a0]+)/u);
  return m ? { start: m[1], end: m[2], header_total: num(m[3]), raw_period: period } : { start: null, end: null, header_total: null, raw_period: period };
}
function csvCell(value) {
  let s = value == null ? '' : (typeof value === 'string' ? value : JSON.stringify(value));
  if (/^[\s]*[=+@-]/u.test(s)) s = `'${s}`;
  return `"${s.replace(/"/gu, '""')}"`;
}
function writeCsv(name, columns, rows) {
  const content = '\ufeff' + [columns, ...rows.map((r) => columns.map((c) => r[c]))].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
}
function tokens(text) {
  const known = new Set([
    ...inventory.product_samples.map((p) => String(p.sku).toUpperCase()),
    ...Object.keys(inventory.requested_sku_checks).map((x) => x.toUpperCase()),
  ]);
  const found = [];
  for (const sku of known) {
    const re = new RegExp(`(^|[^a-z0-9])${sku.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}($|[^a-z0-9])`, 'iu');
    if (re.test(text)) found.push(sku);
  }
  return found;
}
const checks = inventory.requested_sku_checks;
const productSamples = new Map(inventory.product_samples.map((p) => [String(p.sku).toUpperCase(), p]));
const categoryUrl = Object.fromEntries(inventory.categories.map((c) => [c.title, c.url]));
const articleCatalog = inventory.articles.find((a) => a.url.endsWith('/parts-catalog-john-deere-kak-polzovatsya'))?.url;
const map = (url, status = 'mapped', reason = '') => ({ target_url: url, target_status: status, reason });

function classify(q) {
  const s = normalize(q);
  const sku = tokens(s);
  if (/(?:^|[^\p{L}])(?:мод на|мод для|игра|симулятор)(?:[^\p{L}]|$)|(?:^|[^a-z])fs\s*2[0-9](?:[^0-9]|$)/iu.test(s) && /(john deere|джон дир|джондир|джон деер|jd|трактор)/iu.test(s)) return { bucket: 'excluded', cluster: 'Исключено', ...map('', 'excluded', 'Игровой мод или симулятор; не коммерческий спрос на комплектующие.'), priority: 'P3' };
  if (/(сняти\p{L}*\s+форсун|забива\p{L}*\s+сетк|пробил\p{L}*\s+проклад)/iu.test(s)) return { bucket: 'core', cluster: 'Диагностика и ремонт', ...map('', 'needs_review', 'Диагностический или ремонтный запрос; коммерческий спрос на комплектующие и подходящая страница не подтверждены.'), priority: 'P2' };
  const knownSkus = new Set([...inventory.product_samples.map(p=>String(p.sku).toLowerCase()), ...Object.keys(checks).map(x=>x.toLowerCase())]);
  const modelMention = s.split(/[^\p{L}\p{N}]+/u).some(t => !knownSkus.has(t) && /^(?:\d{3,5}[a-zа-яё]{0,2}\d{0,4}|[swt]\d{3}[a-zа-яё]?)$/iu.test(t));
  const competitor = ['совинтел','авито','avito','аст','аврора','агропартс','эконива','автопитер','ручьи','exist','emex','zzap'].some(x=>hasWord(s,x)) || /(разборк|металлолом|куплю б\/?у|скупк|выкуп)/iu.test(s);
  if (competitor) return { bucket: 'excluded', cluster: 'Исключено', ...map('', 'excluded', 'Конкурент, площадка, разборка, лом или покупка подержанных деталей не входит в подтвержденный ассортимент.'), priority: 'P3' };
  if (/(lego|лего|игруш|toy|игр|sneaker|skechers)/iu.test(s)) return { bucket: 'excluded', cluster: 'Исключено', ...map('', 'excluded', 'Игрушки, игры или нерелевантный бренд.'), priority: 'P3' };
  if (/(официальный сайт|официальн.{0,10}дилер|дилер john deere|дилер джон дир|сайт john deere|сайт джон дир|service advisor|service adviser|dealer locator|official dealership|сервис эдвайзер|сервисный консультант)/u.test(s) || (/(сайт|дилер|представитель|official|dealer)/iu.test(s) && /(john deere|джон дир|джондир|джон деер|джон дире)/u.test(s))) return { bucket: 'excluded', cluster: 'Исключено', ...map('', 'excluded', 'Навигационный, сервисный или официальный статусный интент.'), priority: 'P3' };
  if (/(дизель.{0,12}генератор|генераторн.{0,12}установк|электростанц)/u.test(s)) return { bucket: 'excluded', cluster: 'Исключено', ...map('', 'excluded', 'Запрос на дизель-генераторную установку целиком, а не отдельные комплектующие.'), priority: 'P3' };
  if (/(ремонт|ремонтировать|сервис|сервисный центр|инструкция по ремонту|схема ремонта|неисправност|ошибка двигателя|замена масла|как заменить)/u.test(s)) return { bucket: 'excluded', cluster: 'Исключено', ...map('', 'excluded', 'Ремонт или сервисная услуга; не подтвержденный спрос на комплектующие.'), priority: 'P3' };
  const analogMention = /(аналог|аналоги|заменитель|взаимозамен|кросс-?номер)/u.test(s);
  if (analogMention) return { bucket: 'core', cluster: 'Проверка аналогов', ...map('', 'needs_review', 'Запрос на аналог: совпадение артикула не подтверждает взаимозаменяемость.'), priority: 'P2', notes: 'analogy verification' };
  if (sku.length > 1) return { bucket: 'core', cluster: 'Несколько артикулов', ...map('', 'needs_review', 'Несколько известных артикулов в одном запросе; требуется ручная проверка применимости и аналогов.'), priority: 'P2' };
  if (sku.length === 1) {
    const key = sku[0], check = checks[key], sample = productSamples.get(key);
    if (modelMention) return { bucket: 'core', cluster: `Артикул ${key}`, ...map('', 'needs_review', 'Артикул распознан, но совместимость с указанной моделью техники не подтверждена.'), priority: 'P2', sku };
    if (check?.jsonld_sku && check.jsonld_sku.toUpperCase() === key && check.url) return { bucket: 'core', cluster: `Артикул ${key}`, ...map(check.url, 'product_verified', 'jsonld_sku точно совпадает с запрошенным артикулом.'), priority: 'P1', sku };
    return { bucket: 'core', cluster: `Артикул ${key}`, ...map('', 'needs_review', sample ? 'Артикул есть в выборке товаров, но точное совпадение jsonld_sku не подтверждено.' : 'Артикул не найден среди проверенных jsonld_sku.'), priority: 'P2', sku };
  }
  const branded = /(john deere|джон дир|джондир|джон деер)/u.test(s);
  const explicitParts = /(запчаст|запасн.{0,12}част|детал|комплектующ|ремень|подшипник|форсун|стартер|генератор|прокладк|сальник|втулк|датчик|радиатор|шкив|цеп|болт|винт|палец|нож|клапан|гидроцилиндр|фильтр|насос|турбин|помп|вентилятор|тяга|рычаг)/u.test(s);
  const nakedBrand = /^(john deere|джон дир|джондир|джон деер|джон дире|купить john deere|купить джон дир|купить джондир|купить джон деер|купить джон дире)$/u.test(s);
  const wholeMachine = /(трактор|комбайн|сеялк|жатк|погрузчик|экскаватор|косилк)/u.test(s) && !explicitParts;
  if (nakedBrand || wholeMachine || (/(купить|цена|стоимость)/u.test(s) && branded && !explicitParts)) return { bucket: 'excluded', cluster: 'Исключено', ...map('', 'excluded', 'Запрос о бренде или машине/агрегате целиком; спрос на комплектующие не выражен.'), priority: 'P3' };
  if (!branded && !explicitParts) return { bucket: 'excluded', cluster: 'Исключено', ...map('', 'excluded', 'Нет подтвержденного коммерческого интента по комплектующим John Deere.'), priority: 'P3' };
  if (modelMention && /(запчаст|детал|трактор|комбайн|джон дир|john deere)/u.test(s)) {
    if (!explicitParts) return { bucket: 'excluded', cluster: 'Исключено', ...map('', 'excluded', 'Запрос о бренде или модели без явно выраженного спроса на комплектующие.'), priority: 'P3' };
    return { bucket: 'core', cluster: 'Модельная применимость', ...map('', 'needs_review', 'Модельная применимость и наличие ассортимента не подтверждены.'), priority: 'P2' };
  }
  if (!/(ремень|фильтр|подшипник|насос|стартер|генератор|форсун|болт|винт|проклад|сальник|датчик|радиатор|шкив|цеп|нож|клапан|тяга|рычаг)/u.test(s) && /(двигател|гидравлик|трансмисс|сцеплен)/u.test(s)) return { bucket: 'core', cluster: 'Неоднозначный узел', ...map('', 'needs_review', 'Запрос на узел в целом; неясно, ищут запчасти или агрегат целиком.'), priority: 'P3' };
  if (/жатк/u.test(s) && !/(нож|диск|ремень|подшипник|цеп|шкив|конкретн.{0,12}детал)/u.test(s)) return { bucket: 'core', cluster: 'Детали жатки', ...map('', 'needs_review', 'Запрос по жатке без конкретной детали; состав и посадочную страницу нужно подтвердить.'), priority: 'P3' };
  const machineFamily = /(трактор|комбайн|сеялк|жатк|грейдер|бульдозер|пресс.{0,5}подборщик|борон|погрузчик|экскаватор)/u.test(s);
  const specificPart = /(ремень|фильтр|подшипник|насос|стартер|генератор|форсун|болт|винт|проклад|сальник|датчик|радиатор|шкив|цеп|нож|клапан|тяга|рычаг|подборщик)/u.test(s);
  if (machineFamily && explicitParts && !specificPart) return { bucket: 'core', cluster: 'Модельная применимость', ...map('', 'needs_review', 'Указана только машина или агрегат, конкретная деталь и подтвержденный ассортимент не установлены.'), priority: 'P3' };
  if (branded && !explicitParts) return { bucket: 'core', cluster: 'Неоднозначный узел', ...map('', 'needs_review', 'Запрос не называет конкретную деталь; наличие узла целиком в ассортименте не подтверждено.'), priority: 'P3' };
  if (/(как|схема|инструкция|почему|не работает|как убрать|настройк)/u.test(s)) return { bucket: 'core', cluster: 'Информационный интент', ...map('', 'needs_review', 'Информационный или диагностический запрос; нужен отдельный владелец и проверка выдачи.'), priority: 'P3' };
  if (/(каталог|артикул|по номеру|по фото)/u.test(s)) return { bucket: 'core', cluster: 'Помощь с каталогом и подбором', ...map(articleCatalog || '', 'needs_review', 'Информационный/навигационный интент; требуется проверить поисковую выдачу.'), priority: 'P2' };
  const route = (slug) => inventory.categories.find((c) => c.url.endsWith(`/${slug}`))?.url || '';
  if (/(воздушн.{0,20}фильтр|фильтр.{0,20}воздушн)/u.test(s)) return { bucket: 'core', cluster: 'Воздушные фильтры', ...map(route('sistema-ohlazhdeniya-i-vpusk'), 'mapped', 'Существующая категория системы охлаждения и впуска; точная совместимость требует проверки.'), priority: 'P2' };
  if (/фильтр/u.test(s)) return { bucket: 'core', cluster: 'Фильтры', ...map('', 'content_gap', 'Для общих, топливных и масляных фильтров нужна отдельная посадочная страница; не создаем неподтвержденный URL.'), priority: 'P2' };
  const rules = [
    [/ремень|цепь|шкив/u, 'Ремни, цепи и шкивы', 'remni-tsepi-i-shkivy'], [/подшипник|втулка/u, 'Подшипники и втулки', 'podshipniki-i-vtulki'],
    [/электрик|датчик|стартер|генератор|свеч|фара|лампа/u, 'Электрика', 'elektrika'], [/гидроцилиндр/u, 'Гидравлика', 'gidravlika'],
    [/насос.{0,20}подкачк.{0,20}топлив|топливн.{0,20}насос|тнвд|форсун/u, 'Двигатель', 'dvigatel'], [/двигател/u, 'Двигатель', 'dvigatel'], [/гидронасос|насос|компрессор/u, 'Насосы и компрессоры', 'nasosy-i-kompressory'],
    [/радиатор|помпа|вентилятор|охлажден|впуск|воздухозабор/u, 'Система охлаждения и впуск', 'sistema-ohlazhdeniya-i-vpusk'],
    [/болт|винт|штифт|палец|гайка|крепеж|крепёж/u, 'Крепёж', 'krepezh'], [/сальник|прокладк|уплотнен/u, 'Уплотнения и прокладки', 'uplotneniya-i-prokladki'],
    [/рулев|тяга рул|наконечник рул/u, 'Рулевое управление', 'rulevoe-upravlenie'], [/тормоз/u, 'Тормозная система', 'tormoznaya-sistema'],
    [/трансмисс|мост|сцеплен/u, 'Трансмиссия и мосты', 'transmissiya-i-mosty'], [/навеск|нижняя тяга|тяга навес|рычаг/u, 'Навеска и тяги', 'naveska-i-tyagi'],
    [/подвес|амортизатор|стабилизатор/u, 'Подвеска и стабилизаторы', 'podveska-i-stabilizatory'], [/нож|диск/u, 'Детали уборочной техники', 'detali-uborochnoy-tehniki'],
  ];
  for (const [re, cluster, slug] of rules) if (re.test(s)) {
    const url = route(slug), review = /^(Насосы и компрессоры|Гидравлика)$/u.test(cluster);
    return { bucket: 'core', cluster, ...map(url, review ? 'needs_review' : (url ? 'mapped' : 'content_gap'), review ? 'Требуется проверка состава категории и применимости.' : (url ? 'Существующая категория каталога.' : 'Подходящая категория не подтверждена в инвентаре.')), priority: review || !url ? 'P2' : 'P1' };
  }
  if (/(запчаст|запасн.{0,12}част|детал|комплектующ|подбор)/u.test(s) && branded) return { bucket: 'core', cluster: 'Общие запчасти John Deere', ...map('https://deere-shop.ru/catalog', 'mapped', 'Общий коммерческий спрос; используем каталог без создания дубля брендовой категории.'), priority: 'P1' };
  if (explicitParts && branded) return { bucket: 'core', cluster: 'Неоднозначная деталь', ...map('', 'needs_review', 'Категория и состав предложения требуют ручной проверки.'), priority: 'P3' };
  return { bucket: 'core', cluster: 'Общее / неоднозначное', ...map('', 'needs_review', 'Требует проверки типа запроса и подходящей посадочной страницы.'), priority: 'P3' };
}

const entryMap = new Map();
const measurements = [];
const reportId = (i) => `WS${String(i + 1).padStart(2, '0')}`;
function add(q) {
  const key = normalize(q);
  if (!entryMap.has(key)) entryMap.set(key, { keyword: q.trim().replace(/\s+/gu, ' '), normalized_keyword: key, listed: [], quoted: [], report_ids: new Set(), urls: new Set() });
  return entryMap.get(key);
}
raw.reports.forEach((report, i) => {
  const id = reportId(i);
  const quoted = /^".*"$/u.test(report.seed);
  const base = parsePeriod(report.period);
  measurements.push({ report_id: id, seed: report.seed, seed_without_quotes: quoted ? report.seed.slice(1, -1) : '', source_url: report.url, region: report.region, mode: report.mode || 'Popular', mode_raw: report.mode_raw || '', quoted_operator: quoted, measurement_scope: quoted ? 'header phrase-word-count restriction only; not exact order or wordform' : 'header total for seed; do not equate with exact phrase frequency', period_start: base.start, period_end: base.end, raw_period: base.raw_period, header_total: base.header_total });
  for (const [query, countText] of report.rows) {
    const e = add(query);
    e.report_ids.add(id); e.urls.add(report.url);
    if (!quoted) e.listed.push({ report_id: id, source_url: report.url, period_start: base.start, period_end: base.end, raw_period: base.raw_period, frequency: num(countText), raw_frequency: countText });
  }
  if (quoted) {
    const seed = report.seed.slice(1, -1);
    const e = add(seed); e.report_ids.add(id); e.urls.add(report.url);
    e.quoted.push({ report_id: id, source_url: report.url, period_start: base.start, period_end: base.end, raw_period: base.raw_period, frequency: base.header_total });
  }
});

const entries = [...entryMap.values()].map((e) => {
  const byPeriod = new Map();
  for (const x of e.listed) { const k = `${x.period_start}|${x.period_end}`; if (!byPeriod.has(k)) byPeriod.set(k, new Set()); byPeriod.get(k).add(x.frequency); }
  const conflict = [...byPeriod.values()].some((values) => values.size > 1);
  const result = classify(e.keyword);
  const grouped = new Map();
  for (const x of e.listed) {
    const k = `${x.period_start}|${x.period_end}|${x.frequency}`;
    if (!grouped.has(k)) grouped.set(k, { ...x, source_report_ids: [], source_urls: [] });
    const g = grouped.get(k); g.source_report_ids.push(x.report_id); g.source_urls.push(x.source_url);
  }
  const listed = [...grouped.values()].map((x) => ({ ...x, source_report_ids: [...new Set(x.source_report_ids)].sort(), source_urls: [...new Set(x.source_urls)].sort() })).sort((a,b) => String(a.period_start).localeCompare(String(b.period_start)) || String(a.period_end).localeCompare(String(b.period_end)) || a.frequency-b.frequency);
  if (conflict) { result.target_status='needs_review'; result.priority='P2'; result.reason += ' Несовпадающие значения за одинаковый период; нужна перепроверка.'; }
  const listedIds = [...new Set(listed.flatMap(x => x.source_report_ids))].sort();
  const quotedIds = [...new Set(e.quoted.map(x => x.report_id))].sort();
  const listedUrls = [...new Set(listed.flatMap(x => x.source_urls))].sort();
  const quotedUrls = [...new Set(e.quoted.map(x => x.source_url))].sort();
  const row = { keyword: e.keyword, normalized_keyword: e.normalized_keyword, bucket: result.bucket, cluster: result.cluster, primary_query: '', target_url: result.target_url, target_status: result.target_status, priority: result.priority, reason: result.reason, notes: result.notes || '', sku_tokens: result.sku || tokens(e.keyword), listed_frequency: listed.map(x => x.frequency), listed_periods: listed.map(x => ({ start: x.period_start, end: x.period_end, raw: x.raw_period })), quoted_frequency: e.quoted.map(x => x.frequency), quoted_periods: e.quoted.map(x => ({ start: x.period_start, end: x.period_end, raw: x.raw_period })), source_report_ids: [...e.report_ids].sort(), source_urls: [...e.urls].sort(), listed_source_report_ids: listedIds, listed_source_urls: listedUrls, quoted_source_report_ids: quotedIds, quoted_source_urls: quotedUrls, listed_observations: listed, quoted_measurements: e.quoted, conflict, region: 'Россия' };
  row.primary_query = row.keyword;
  return row;
});

const core = entries.filter((e) => e.bucket === 'core');
const excluded = entries.filter((e) => e.bucket === 'excluded');
const clusters = new Map();
for (const e of core) { if (!clusters.has(e.cluster)) clusters.set(e.cluster, []); clusters.get(e.cluster).push(e); }
const clusterRows = [...clusters].map(([name, group]) => {
  const ranked = group.flatMap((e) => e.listed_observations.map((o) => ({ keyword: e.keyword, ...o }))).sort((a,b) => b.frequency-a.frequency);
  const representative = ranked[0] || null;
  const targetCandidate = group.find((e) => e.target_url)?.target_url || '';
  const candidates = group.filter((e) => e.target_url === targetCandidate && targetCandidate);
  const primary = [...(candidates.length ? candidates : group)].sort((a,b) => (a.priority === 'P1' ? 0 : 1) - (b.priority === 'P1' ? 0 : 1) || a.keyword.length-b.keyword.length)[0];
  const target = primary.target_url || '';
  const status = primary.target_status;
  return { cluster: name, unique_keyword_count: group.length, primary_query: primary.keyword, representative_max_listed_query: representative?.keyword || '', representative_max_listed_frequency: representative?.frequency ?? '', representative_period_start: representative?.period_start || '', representative_period_end: representative?.period_end || '', target_url: target, target_status: status, method: 'intent_only_provisional', note: status === 'content_gap' ? 'Content/page gap; verify before creating URL.' : 'SERP overlap not validated; provisional intent grouping.' };
});

const entryColumns = ['keyword','normalized_keyword','cluster','primary_query','target_url','target_status','priority','listed_frequency','listed_periods','quoted_frequency','quoted_periods','listed_source_report_ids','listed_source_urls','quoted_source_report_ids','quoted_source_urls','source_report_ids','source_urls','reason','notes','sku_tokens','conflict','region'];
writeCsv('core.csv', entryColumns, core);
writeCsv('excluded.csv', ['keyword','normalized_keyword','cluster','target_status','priority','source_report_ids','source_urls','reason','region'], excluded);
writeCsv('measurements.csv', ['report_id','seed','seed_without_quotes','source_url','region','mode','mode_raw','quoted_operator','measurement_scope','period_start','period_end','raw_period','header_total'], measurements);
writeCsv('clusters.csv', ['cluster','unique_keyword_count','primary_query','representative_max_listed_query','representative_max_listed_frequency','representative_period_start','representative_period_end','target_url','target_status','method','note'], clusterRows);
const corePayload = { metadata: { source: 'Yandex Wordstat', capture_date: raw.metadata.captured_at, region: 'Россия', region_id: 225, mode: 'Popular', report_count: raw.reports.length, unique_keyword_count: entries.length, raw_sha256: hash('raw/wordstat-observed.json'), inventory_sha256: hash('inventory.json'), classification: 'Conservative intent-only provisional grouping; no SERP overlap or demand forecasting.' }, entries, clusters: clusterRows, measurements };
fs.writeFileSync(path.join(dir, 'core.json'), JSON.stringify(corePayload, null, 2) + '\n', 'utf8');
const mapPayload = { metadata: { ...corePayload.metadata, excluded_count: excluded.length }, entries: core.filter(e=>e.bucket==='core').map(({keyword,cluster,target_url,target_status,priority,reason,listed_observations,quoted_measurements})=>({keyword,cluster,target_url,target_status,priority,reason,listed_observations:listed_observations.map(({frequency,period_start,period_end})=>({frequency,period_start,period_end})),quoted_measurements:quoted_measurements.map(({frequency,period_start,period_end})=>({frequency,period_start,period_end}))})) };
const mapTemplate = fs.readFileSync(path.join(dir, 'cluster-map.html'), 'utf8');
fs.writeFileSync(path.join(dir, 'cluster-map.html'), mapTemplate.replace(/(<script id="data" type="application\/json">)[\s\S]*?(<\/script>)/u, `$1${JSON.stringify(mapPayload).replace(/</gu, '\\u003c')}$2`), 'utf8');

const outputFiles = ['core.csv','core.json','excluded.csv','measurements.csv','clusters.csv','cluster-map.html'];
const validation = { source_capture_date: raw.metadata.captured_at, raw_sha256: hash('raw/wordstat-observed.json'), inventory_sha256: hash('inventory.json'), source_reports: raw.reports.length, source_rows: raw.reports.reduce((n,r)=>n+r.rows.length,0), quoted_reports: measurements.filter(m=>m.quoted_operator).length, unique_keywords: entries.length, core_rows: core.length, excluded_rows: excluded.length, cluster_rows: clusterRows.length, needs_review_rows: core.filter(e=>e.target_status==='needs_review').length, content_gap_rows: core.filter(e=>e.target_status==='content_gap').length, conflict_rows: entries.filter(e=>e.conflict).length, period_window_count: [...new Set(measurements.map(m=>`${m.period_start}|${m.period_end}`))].length, output_files: outputFiles.map(file=>({file,sha256:hash(file)})), guarantees: { no_header_total_used_as_listed_frequency:true, quoted_header_totals_separate:true, no_frequency_sums:true, listed_and_quoted_provenance_separate:true, canonical_mapping_requires_exact_jsonld_sku:true, category_targets_taken_from_inventory:true, all_cluster_methods:'intent_only_provisional', phrase_normalization:'lowercase + trim + whitespace collapse only' } };
fs.writeFileSync(path.join(dir, 'validation.json'), JSON.stringify(validation, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ reports: validation.source_reports, rows: validation.source_rows, unique: validation.unique_keywords, core: core.length, excluded: excluded.length, clusters: clusterRows.length, needsReview: validation.needs_review_rows, conflicts: validation.conflict_rows }));
