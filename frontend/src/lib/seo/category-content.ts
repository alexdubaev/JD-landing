export type CategorySeoLink = {
  href: "/catalog" | "/parts-request" | "/articles";
  label: string;
};

export type CategorySeoCopy = {
  metaTitle: string;
  metaDescription: string;
  intro: string;
  selectionPoints: readonly string[];
  links: readonly CategorySeoLink[];
};

const selectionPoints = [
  "Укажите артикул или маркировку детали, если она известна.",
  "Добавьте модель техники или фотографию детали и маркировки.",
  "Перед заказом подтвердите совместимость и комплектацию у менеджера.",
] as const;

const links = [
  { href: "/catalog", label: "Перейти в каталог" },
  { href: "/parts-request", label: "Отправить список запчастей" },
  { href: "/articles", label: "Прочитать статьи по подбору" },
] as const;

const categoryContent: Record<string, CategorySeoCopy> = {
  "detali-uborochnoy-tehniki": {
    metaTitle: "Детали уборочной техники John Deere — DEERE-SHOP",
    metaDescription:
      "Каталог деталей уборочной техники John Deere. Подготовьте запрос по артикулу, модели техники или маркировке — условия подтвердит менеджер.",
    intro:
      "В разделе собраны детали уборочной техники John Deere. Для точного подбора важно сопоставить артикул, маркировку и исходные данные по технике.",
    selectionPoints,
    links,
  },
  dvigatel: {
    metaTitle: "Детали двигателя John Deere — DEERE-SHOP",
    metaDescription:
      "Каталог деталей двигателя John Deere. Для запроса укажите артикул, модель техники или маркировку детали — совместимость уточнит менеджер.",
    intro:
      "В разделе представлены детали двигателя John Deere. Перед оформлением запроса рекомендуем подготовить артикул или фотографию маркировки для проверки данных.",
    selectionPoints,
    links,
  },
  elektrika: {
    metaTitle: "Электрика John Deere — каталог запчастей DEERE-SHOP",
    metaDescription:
      "Каталог электрических компонентов John Deere. Отправьте артикул, маркировку или данные техники для предварительного подбора и уточнения условий.",
    intro:
      "В разделе собраны электрические компоненты John Deere. Артикул и маркировка помогают избежать ошибки при подготовке запроса.",
    selectionPoints,
    links,
  },
  gidravlika: {
    metaTitle: "Гидравлика John Deere — каталог запчастей DEERE-SHOP",
    metaDescription:
      "Каталог гидравлических компонентов John Deere. Подберите позицию по артикулу, маркировке или модели техники с проверкой у менеджера.",
    intro:
      "В разделе представлены гидравлические компоненты John Deere. Для проверки запроса подготовьте имеющиеся обозначения детали и данные по технике.",
    selectionPoints,
    links,
  },
  krepezh: {
    metaTitle: "Крепёж John Deere — каталог запчастей DEERE-SHOP",
    metaDescription:
      "Каталог крепежа John Deere. Укажите артикул или маркировку детали для подбора и уточнения комплектации перед заказом.",
    intro:
      "В разделе собран крепёж для техники John Deere. Точный артикул или маркировка помогают проверить состав и комплектацию запроса.",
    selectionPoints,
    links,
  },
  "nasosy-i-kompressory": {
    metaTitle: "Насосы и компрессоры John Deere — DEERE-SHOP",
    metaDescription:
      "Каталог насосов и компрессоров John Deere. Оставьте запрос с артикулом, маркировкой или данными техники для уточнения условий.",
    intro:
      "В разделе представлены насосы и компрессоры John Deere. Перед заказом проверьте исходные данные вместе с менеджером.",
    selectionPoints,
    links,
  },
  "naveska-i-tyagi": {
    metaTitle: "Навеска и тяги John Deere — каталог DEERE-SHOP",
    metaDescription:
      "Каталог деталей навески и тяг John Deere. Подготовьте артикул, маркировку или фото детали для проверки запроса менеджером.",
    intro:
      "В разделе собраны детали навески и тяги John Deere. Фотография маркировки или каталожный номер помогут корректно сформировать запрос.",
    selectionPoints,
    links,
  },
  "podshipniki-i-vtulki": {
    metaTitle: "Подшипники и втулки John Deere — DEERE-SHOP",
    metaDescription:
      "Каталог подшипников и втулок John Deere. Отправьте артикул или маркировку для подбора и уточнения комплектации перед заказом.",
    intro:
      "В разделе представлены подшипники и втулки John Deere. Для проверки данных передайте имеющийся артикул, маркировку или фото детали.",
    selectionPoints,
    links,
  },
  "podveska-i-stabilizatory": {
    metaTitle: "Подвеска и стабилизаторы John Deere — DEERE-SHOP",
    metaDescription:
      "Каталог деталей подвески и стабилизаторов John Deere. Подбор по артикулу, маркировке или данным техники с уточнением у менеджера.",
    intro:
      "В разделе собраны детали подвески и стабилизаторов John Deere. Перед заказом рекомендуем подтвердить исходные данные по запросу.",
    selectionPoints,
    links,
  },
  "prochie-detali-john-deere": {
    metaTitle: "Прочие детали John Deere — каталог DEERE-SHOP",
    metaDescription:
      "Каталог прочих деталей John Deere. Оставьте заявку по артикулу, маркировке или фотографии — условия и совместимость уточнит менеджер.",
    intro:
      "В разделе собраны другие позиции каталога John Deere. Для предметного подбора добавьте к запросу максимально полные исходные данные.",
    selectionPoints,
    links,
  },
  "remni-tsepi-i-shkivy": {
    metaTitle: "Ремни, цепи и шкивы John Deere — DEERE-SHOP",
    metaDescription:
      "Каталог ремней, цепей и шкивов John Deere. Отправьте артикул или маркировку детали для проверки состава запроса перед заказом.",
    intro:
      "В разделе представлены ремни, цепи и шкивы John Deere. Артикул, маркировка или фото помогут уточнить запрос без предположений.",
    selectionPoints,
    links,
  },
  "rezhuschiy-apparat": {
    metaTitle: "Режущий аппарат John Deere — каталог DEERE-SHOP",
    metaDescription:
      "Каталог деталей режущего аппарата John Deere. Подберите позицию по артикулу, маркировке или данным техники с проверкой у менеджера.",
    intro:
      "В разделе собраны детали режущего аппарата John Deere. Для точной проверки передайте каталожный номер или изображение маркировки.",
    selectionPoints,
    links,
  },
  "rulevoe-upravlenie": {
    metaTitle: "Рулевое управление John Deere — DEERE-SHOP",
    metaDescription:
      "Каталог деталей рулевого управления John Deere. Подготовьте артикул, маркировку или фото детали для проверки запроса менеджером.",
    intro:
      "В разделе представлены детали рулевого управления John Deere. Совместимость и состав поставки нужно подтвердить до оформления заказа.",
    selectionPoints,
    links,
  },
  "sistema-ohlazhdeniya-i-vpusk": {
    metaTitle: "Охлаждение и впуск John Deere — DEERE-SHOP",
    metaDescription:
      "Каталог деталей систем охлаждения и впуска John Deere. Оставьте запрос с артикулом или маркировкой для уточнения у менеджера.",
    intro:
      "В разделе собраны детали систем охлаждения и впуска John Deere. Перед заказом укажите доступные идентификационные данные детали.",
    selectionPoints,
    links,
  },
  "tormoznaya-sistema": {
    metaTitle: "Тормозная система John Deere — каталог DEERE-SHOP",
    metaDescription:
      "Каталог деталей тормозной системы John Deere. Запрос по артикулу, маркировке или модели техники поможет уточнить подходящую позицию.",
    intro:
      "В разделе представлены детали тормозной системы John Deere. Не используйте визуальное сходство как единственный критерий подбора.",
    selectionPoints,
    links,
  },
  "transmissiya-i-mosty": {
    metaTitle: "Трансмиссия и мосты John Deere — DEERE-SHOP",
    metaDescription:
      "Каталог деталей трансмиссии и мостов John Deere. Отправьте артикул, маркировку или фото детали для проверки менеджером.",
    intro:
      "В разделе собраны детали трансмиссии и мостов John Deere. Для предварительной проверки полезны артикул и исходные данные по технике.",
    selectionPoints,
    links,
  },
  "uplotneniya-i-prokladki": {
    metaTitle: "Уплотнения и прокладки John Deere — DEERE-SHOP",
    metaDescription:
      "Каталог уплотнений и прокладок John Deere. Подбор по артикулу или маркировке с обязательной проверкой комплектации перед заказом.",
    intro:
      "В разделе представлены уплотнения и прокладки John Deere. Для запроса укажите каталожный номер или приложите фотографию маркировки.",
    selectionPoints,
    links,
  },
  "zapchasti-john-deere": {
    metaTitle: "Запчасти John Deere — каталог DEERE-SHOP",
    metaDescription:
      "Каталог запчастей и комплектующих John Deere. Оставьте запрос по артикулу, модели техники или фотографии маркировки детали.",
    intro:
      "В разделе собраны запчасти и комплектующие John Deere. Менеджер поможет проверить запрос и подтвердить условия до оформления заказа.",
    selectionPoints,
    links,
  },
};

export function getCategorySeoContent(slug: string): CategorySeoCopy | null {
  return categoryContent[slug] ?? null;
}
