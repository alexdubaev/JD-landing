# TD-02 — Корзина: не восстанавливается после перезагрузки страницы (+ cross-tab, hydrated, валидация)

- **Приоритет:** P1 (прямой пользовательский баг money-пути: покупатель с товарами в корзине перезагружает страницу и видит пустую корзину)
- **Усилие:** M (~0,5–1 день вместе с тестами)
- **Тип:** bug + tests (TDD)
- **Зависимости:** формально нет; желательно после TD-01 (CI).

## Симптом и влияние

Пользователь добавляет товары в корзину, обновляет страницу (F5) — бейдж в хедере пуст, `/cart`
показывает «Корзина пуста», хотя в `localStorage` записи есть. Корзина «воскрешает» только после
первого же действия с ней (add/set/increment/...). Второй пользовательский сценарий: корзина,
изменённая в соседней вкладке, не появляется в текущей, пока не сделаешь любое действие с корзиной.

## Доказательство (file:line)

Файл `frontend/src/lib/cart/context.tsx` (проверено вручную, строки актуальны):

1. **Инициализация не запускается при подписке.** `ensureInitialized()` (строки 144–151) вызывается
   только внутри колбэков экшенов (`addToCart:180`, `setQuantity:188`, `increment:209`,
   `decrement:215`, `removeFromCart:221`, `clearCart:225`). `subscribe` (113–122) и `getState`
   (128–130) её не вызывают. После F5 `currentState = EMPTY_CART` (строка 126), и
   `useSyncExternalStore` отдаёт React'у пустой массив до первого экшена.
2. **`hydrated` врёт.** `const isClient = typeof window !== "undefined"` (171) истинен уже на первом
   клиентском рендере — до чтения storage. `hydrated: isClient` (199) заставляет `CartView.tsx:19`
   пропустить плейсхолдер загрузки и сразу показать «пусто».
3. **Cross-tab sync не работает.** Обработчик `storage` (117) вызывает только `callback()` — React
   перечитывает `getState()`, который возвращает устаревший module-level `currentState`; `readStore()`
   не вызывается. Комментарий в шапке файла (83–90) обещает синхронизацию вкладок — код не выполняет
   обещания.
4. **Нет валидации персистенных данных.** `readStore` (91–101): `Array.isArray(parsed) ? (parsed as
   CartLine[])` — строки с отсутствующим `unitPrice`, строковой `quantity` или отрицательными числами
   попадают в `total` (194–197) → NaN в UI и в payload заказа (`CheckoutForm.tsx:42–48`).
5. Тестовое покрытие: `context.test.tsx` — один тест на reference equality `getServerSnapshot()`.
   Редьюсер, merge при повторном add, кэп 10 000, персистенция — не протестированы вообще.

## Решение (минимальное)

Остаться на текущей архитектуре (`useSyncExternalStore` + module store). НЕ переводить на zustand/redux.

1. **Флаг инициализации + запуск при подписке:**
   - добавить `let storeInitialized = false;`
   - `ensureInitialized()` делает его идемпотентным: при первом вызове читает storage, засеивает
     `currentState`, выставляет флаг;
   - в `subscribe()`: перед навешиванием листенеров вызвать `ensureInitialized()`; если она изменила
     `currentState` — вызвать `callback()` синхронно, чтобы React перечитал снапшот уже первым эффектом.
2. **`hydrated` из реального состояния:** заменить `isClient`-производное на `useState(false)` +
   `useEffect(() => setHydrated(true), [])` в `CartProvider` — флаг поднимается строго после того,
   как подписка/инициализация отработали (effect подписки `useSyncExternalStore` выполняется до
   эффектов компонента в том же коммите — проверить порядок; если нет, поднять флаг прямо из
   `subscribe`-фазы через микро-таск).
3. **Cross-tab:** в обработчике `storage` — `currentState = readStore(); callback();`
   (заводить `syncFromStorage()`; конфликтов с in-flight локальными правками нет — все правки
   проходят через `dispatch`, который пишет в storage синхронно).
4. **Валидация `readStore`:** после `Array.isArray` прогнать фильтр: `id`/`slug`/`title` — строки,
   `unitPrice` — конечное число ≥ 0, `quantity` — целое в [1, 10000]; всё невалидное отбрасывается
   построчно (не весь массив). Битые строки тихо логировать в `console.warn` один раз.

## TDD-план (тесты пишем ДО правок, все красные → правка → зелёные)

Расширить `frontend/src/lib/cart/context.test.tsx` (сегодня 1 тест):

1. Редьюсер через публичный API: повторный `addToCart` того же товара суммирует quantity;
   `setQuantity(0)` удаляет строку; кэп `QUANTITY_MAX = 10_000` при переполнении.
2. Store: после `addToCart` в `localStorage` появляется запись с ключом `deere-shop:cart`.
3. **Регрессия бага:** смоделировать «перезагрузку» — засеять `localStorage`, сбросить module state
   (через ре-импорт модуля в тесте или отдельный harness), смонтировать `CartProvider` — `lines`
   содержат засеянные товары без всяких экшенов. Этот тест — ядро задачи, он обязан падать до правки.
4. Cross-tab: `window.dispatchEvent(new StorageEvent("storage", { key: "deere-shop:cart", ... }))`
   → снапшот обновился данными из storage.
5. Валидация: в storage лежит массив с битой строкой (`unitPrice: "abc"`) → битая отброшена,
   валидная осталась, total конечен.
6. `hydrated`: до effect — false, после — true (renderProbe-компонент).

jsdom даёт `localStorage` из коробки; между тестами чистить.

## Подводные камни

1. **React StrictMode** в dev монтирует эффекты дважды — `ensureInitialized` обязана быть
   идемпотентной (флаг), иначе вторая подпись перечитает storage поверх несохранённых изменений.
2. **Не читать `localStorage` в `getSnapshot` на каждый вызов** — это рендер-фаза; читать только
   в `ensureInitialized`/`syncFromStorage`. Иначе получим infinite-loop при исключении из quota.
3. `getServerSnapshot` должен остаться стабильной ссылкой на `EMPTY_CART` (уже так).
4. `writeStore` шлёт `CustomEvent` наружу (110) — на него подписаны другие компоненты
   (`ProductCard`, product-request list). Не менять имя события/семантику.
5. Гонка «storage event из другой вкладки во время dispatch» не разрешается доп. блокировками —
   сценарий редкий, last-write-wins приемлем (зафиксировать тестом, если просто).
6. Смешанные валюты в `total` — НЕ трогаем в этой задаче (см. stage-2 S-5), только фиксируем тестом
   текущее поведение суммирования.

## Allowed files (ADR-002)

- `frontend/src/lib/cart/context.tsx`
- `frontend/src/lib/cart/context.test.tsx`
- (только если всплывёт при тестах) `frontend/src/components/cart/CartView.tsx` — чтение `hydrated`.

## Верификация

1. `cd frontend && npm test && npm run typecheck && npm run lint`.
2. Ручной чек `npm run dev`: добавить товар → F5 → бейдж и `/cart` показывают корзину; вторая вкладка
   видит изменение после первой; убрать битую запись через DevTools → приложение не падает.

## Не делаем

- Никаких zustand/ redux / context-per-line / persistence-библиотек.
- Не выносим корзину в URL/cookie.
- Мультивалютные тоталы, серверная корзина — stage-2.
