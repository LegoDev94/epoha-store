import type { Lang } from "./data/catalog";

export const LANGS: { code: Lang; label: string; full: string }[] = [
  { code: "lv", label: "LV", full: "Latviski" },
  { code: "en", label: "EN", full: "English" },
  { code: "ru", label: "RU", full: "Русский" },
];

type Dict = Record<string, string>;

const lv: Dict = {
  "meta.title": "VINTAGE MĒBELES — antīkas mēbeles ar vēsturi",
  "meta.desc":
    "VINTAGE MĒBELES — vintage un antīku mēbeļu veikals: rokoko, Gustava stils, bīdermeiers. Autentiskums, restaurācija, piegāde Eiropā.",

  "nav.search": "Meklēt priekšmetu: rokoko, spogulis, kumode…",
  "nav.allResults": "Visi rezultāti katalogā →",
  "nav.favs": "Vēlmju saraksts",
  "nav.cart": "Grozs",
  "nav.menu": "Izvēlne",
  "nav.close": "Aizvērt",

  "cat.all": "Visa kolekcija",
  "cat.seating": "Mīkstās mēbeles",
  "cat.mirror": "Spoguļi",
  "cat.light": "Apgaismojums",
  "cat.storage": "Kumodes un glabāšana",
  "cat.table": "Galdi",
  "cat.decor": "Dekors un keramika",

  "hero.kicker": "Nedēļas skatlogs · kolekcija papildināta",
  "hero.title": "Mēbeles,",
  "hero.titleAccent": "kas pārdzīvojušas modi",
  "hero.sub":
    "Autentiski 19.–20. gadsimta priekšmeti: rokoko, Gustava stils, bīdermeiers. Katru priekšmetu pārbaudījis restaurators — tas ir gatavs jaunai dzīvei jūsu mājās.",
  "hero.cta": "Skatīt kolekciju →",
  "hero.cta2": "Izlases",
  "hero.factItems": "priekšmeti pieejami",
  "hero.factAge": "gs.",
  "hero.factShip": "dienu piegāde",
  "usp.pickup": "Bezmaksas izņemšana Talsos",
  "usp.delivery": "Piegāde līdz durvīm Latvijā — 50 €",
  "usp.items": "priekšmeti pieejami",
  "hero.now": "Šobrīd skatlogā",

  "coll.kicker": "Kuratoru izlases",
  "coll.title": "Interjera",
  "coll.titleAccent": "noskaņas",
  "coll.salon": "Rokoko viesistaba",
  "coll.salonHint": "grebumi, medaljoni, samts",
  "coll.cabinet": "Kolekcionāra kabinets",
  "coll.cabinetHint": "āda, sarkankoks, ozols",
  "coll.light": "Gaisma un atspulgi",
  "coll.lightHint": "kristāls, zeltījums, amalgama",
  "coll.count": "priekšmeti →",
  "coll.reset": "Atcelt izlasi",

  "cat.kicker": "Katalogs",
  "cat.kickerColl": "Izlase",
  "sort.new": "Vispirms skatloga",
  "sort.cheap": "Lētākie",
  "sort.rich": "Dārgākie",
  "cat.empty": "Nekas nav atrasts — mēģiniet citu vaicājumu.",

  "why.kicker": "Kāpēc mēs",
  "why.title": "Trīs",
  "why.titleAccent": "solījumi",
  "why.1": "Autentiskums",
  "why.1t":
    "Katram priekšmetam noteikts laikmets, skola un materiāli. Nekādu «senatnes imitāciju» — tikai lietas ar īstu biogrāfiju.",
  "why.2": "Stāvoklis",
  "why.2t":
    "Restaurators pārbauda karkasu, atsperes un furnitūru pirms skatloga. Pirms pirkuma atsūtīsim video — jūs redzat tieši to, kas atbrauks.",
  "why.3": "Piegāde",
  "why.3t":
    "Koka režģis, mīkstais iepakojums, apdrošināšana. Eiropā — 7–14 dienas, līdz durvīm. Apmaksa pēc pasūtījuma apstiprināšanas.",

  "recent.kicker": "Jūs skatījāties",
  "recent.title": "Nesen",
  "recent.titleAccent": "aplūkotie",
  "related.kicker": "No tā paša skatloga",
  "related.title": "Līdzīgi",
  "related.titleAccent": "priekšmeti",

  "lot.sold": "PĀRDOTS",
  "lot.add": "Grozā",
  "lot.inCart": "Grozā ✓",
  "lot.buyNow": "Pirkt tagad",
  "lot.openCart": "Grozā — atvērt →",
  "lot.askSimilar": "Pieprasīt līdzīgu",
  "lot.note1": "Video par stāvokli — pēc pieprasījuma pirms pirkuma",
  "lot.note2": "Piegāde Eiropā · 7–14 dienas · režģis un apdrošināšana",
  "lot.note3": "Apmaksa pēc pasūtījuma apstiprināšanas",
  "lot.showcase": "Skatlogs",

  "favs.title": "Vēlmju saraksts",
  "favs.empty": "Pagaidām tukšs. Atzīmējiet ar sirsniņu to, kas iepatikās.",
  "favs.go": "Skatīt kolekciju →",

  "cart.title": "Grozs",
  "cart.empty": "Grozs ir tukšs — kolekcija gaida.",
  "cart.sum": "Kopsavilkums",
  "cart.items": "Priekšmeti",
  "cart.ship": "Piegāde",
  "cart.shipCalc": "aprēķināsim",
  "cart.total": "Kopā",
  "cart.checkout": "Noformēt pasūtījumu →",
  "cart.remove": "noņemt",
  "cart.note": "Apmaksa pēc pieejamības apstiprināšanas un piegādes aprēķina.",

  "ck.title": "Pasūtījuma noformēšana",
  "ck.empty": "Pasūtījumā pagaidām tukšs.",
  "ck.name": "Vārds",
  "ck.namePh": "Kā jūs uzrunāt",
  "ck.contact": "Tālrunis vai Telegram",
  "ck.contactPh": "+371… vai @lietotajvards",
  "ck.city": "Piegādes pilsēta",
  "ck.cityPh": "Rīga, Viļņa, Berlīne…",
  "ck.comment": "Komentārs",
  "ck.commentPh": "Jautājumi par stāvokli, termiņiem, restaurāciju…",
  "ck.email": "E-pasts",
  "ck.emailPh": "uz to nosūtīsim apstiprinājumu",
  "ck.address": "Piegādes adrese",
  "ck.addressPh": "Iela, mājas nr., dzīvoklis, pilsēta, indekss",
  "ck.delivery": "Saņemšana",
  "ck.pickup": "Izņemšana noliktavā Talsos",
  "ck.pickupNote": "bez maksas · saskaņosim laiku",
  "ck.courier": "Piegāde līdz durvīm Latvijā",
  "ck.courierNote": "+50 € · 2–5 darba dienas",
  "ck.free": "bez maksas",
  "ck.pickupTitle": "Noliktava Talsos",
  "ck.pickupAddr": "Talsi, Latvija",
  "ck.pickupHint": "Precīzu adresi un laiku saskaņosim pēc pasūtījuma apstiprinājuma.",
  "ck.route": "Maršruts",
  "ck.fixFields": "Aizpildiet iezīmētos laukus — bez tiem nevaram sazināties.",
  "ck.errEmail": "Ievadiet derīgu e-pastu — uz to nosūtīsim apstiprinājumu",
  "ck.errPhone": "Ievadiet tālruni vai Telegram",
  "ck.errName": "Ievadiet vārdu",
  "ck.errAddress": "Ievadiet piegādes adresi",
  "ck.payCard": "Apmaksāt ar karti →",
  "ck.payLater": "Noformēt bez apmaksas",
  "ck.noStripe": "Apmaksa ar karti vēl tiek pieslēgta. Pasūtījums ir reģistrēts — sazināsimies un vienosimies par apmaksu.",
  "ck.payHint": "Droša apmaksa caur Stripe. Pasūtījums tiek reģistrēts uzreiz — arī tad, ja apmaksu veiksiet vēlāk.",
  "ok.paid": "Apmaksāts",
  "ok.unpaid": "Gaida apmaksu",
  "ok.textPaid": "Paldies! Apmaksa saņemta. Sazināsimies par piegādes laiku tuvākajā darba dienā.",
  "ck.your": "Jūsu pasūtījums",
  "ck.send": "Nosūtīt pasūtījumu",
  "ck.note":
    "Pēc nosūtīšanas menedžeris sazināsies darba dienas laikā: apstiprinās pieejamību, atsūtīs video un aprēķinās piegādi. Apmaksa — tikai pēc apstiprinājuma.",
  "ck.agree": "Nospiežot, jūs piekrītat kontaktinformācijas apstrādei.",

  "ok.seal": "PIEŅEMTS",
  "ok.title": "Pasūtījums {n} nosūtīts",
  "ok.text":
    "Menedžeris sazināsies ar jums darba dienas laikā — apstiprinās pieejamību, atsūtīs priekšmetu video un aprēķinās piegādi.",
  "ok.back": "Atgriezties skatlogā →",

  "crumb.home": "Skatlogs",
  "ftr.about":
    "Vintage un antīkas 19.–20. gadsimta mēbeles. Autentiski priekšmeti, saudzīga restaurācija, piegāde Eiropā.",
  "ftr.shop": "Veikals",
  "ftr.contact": "Sazināties",
  "ftr.rights": "Demonstrācijas skatlogs",
  "ftr.by": "Dizains un izstrāde —",
  "wa.label": "Rakstīt WhatsApp",
  "wa.hello": "Sveiki! Interesē priekšmets no VINTAGE MĒBELES skatloga",
};

const en: Dict = {
  "meta.title": "VINTAGE MĒBELES — antique furniture with a history",
  "meta.desc":
    "VINTAGE MĒBELES — a shop of vintage and antique furniture: rococo, Gustavian, Biedermeier. Authenticity, restoration, delivery across Europe.",

  "nav.search": "Find a piece: rococo, mirror, chest…",
  "nav.allResults": "All results in the catalogue →",
  "nav.favs": "Wishlist",
  "nav.cart": "Cart",
  "nav.menu": "Menu",
  "nav.close": "Close",

  "cat.all": "Whole collection",
  "cat.seating": "Seating",
  "cat.mirror": "Mirrors",
  "cat.light": "Lighting",
  "cat.storage": "Chests & storage",
  "cat.table": "Tables",
  "cat.decor": "Decor & ceramics",

  "hero.kicker": "Showcase of the week · collection updated",
  "hero.title": "Furniture that",
  "hero.titleAccent": "outlived fashion",
  "hero.sub":
    "Authentic pieces of the 19th–20th centuries: rococo, Gustavian, Biedermeier. Every piece is checked by a restorer and ready for a new life in your home.",
  "hero.cta": "View the collection →",
  "hero.cta2": "Curated sets",
  "hero.factItems": "pieces in stock",
  "hero.factAge": "century",
  "hero.factShip": "days delivery",
  "usp.pickup": "Free pickup in Talsi",
  "usp.delivery": "Door-to-door delivery in Latvia — 50 €",
  "usp.items": "pieces in stock",
  "hero.now": "Now on the showcase",

  "coll.kicker": "Curated sets",
  "coll.title": "Interior",
  "coll.titleAccent": "moods",
  "coll.salon": "Rococo living room",
  "coll.salonHint": "carving, medallions, velvet",
  "coll.cabinet": "Collector's study",
  "coll.cabinetHint": "leather, mahogany, oak",
  "coll.light": "Light and reflections",
  "coll.lightHint": "crystal, gilding, silvering",
  "coll.count": "pieces →",
  "coll.reset": "Clear the set",

  "cat.kicker": "Catalogue",
  "cat.kickerColl": "Set",
  "sort.new": "Showcase first",
  "sort.cheap": "Lower price",
  "sort.rich": "Higher price",
  "cat.empty": "Nothing found — try another query.",

  "why.kicker": "Why us",
  "why.title": "Three",
  "why.titleAccent": "promises",
  "why.1": "Authenticity",
  "why.1t":
    "Every piece is attributed: era, school, materials. No “antique-look” imitations — only things with a real biography.",
  "why.2": "Condition",
  "why.2t":
    "A restorer checks the frame, springs and fittings before the showcase. Before you buy we send a video — you see exactly what arrives.",
  "why.3": "Delivery",
  "why.3t":
    "Wooden crating, soft packing, insurance. Across Europe — 7–14 days, to your door. Payment after the order is confirmed.",

  "recent.kicker": "You viewed",
  "recent.title": "Recent",
  "recent.titleAccent": "pieces",
  "related.kicker": "From the same showcase",
  "related.title": "Similar",
  "related.titleAccent": "pieces",

  "lot.sold": "SOLD",
  "lot.add": "Add to cart",
  "lot.inCart": "In cart ✓",
  "lot.buyNow": "Buy now",
  "lot.openCart": "In cart — open →",
  "lot.askSimilar": "Request a similar one",
  "lot.note1": "Condition video — on request before purchase",
  "lot.note2": "Delivery across Europe · 7–14 days · crating and insurance",
  "lot.note3": "Payment after the order is confirmed",
  "lot.showcase": "Showcase",

  "favs.title": "Wishlist",
  "favs.empty": "Empty so far. Mark with a heart what caught your eye.",
  "favs.go": "View the collection →",

  "cart.title": "Cart",
  "cart.empty": "The cart is empty — the collection is waiting.",
  "cart.sum": "Summary",
  "cart.items": "Pieces",
  "cart.ship": "Delivery",
  "cart.shipCalc": "we will calculate",
  "cart.total": "Total",
  "cart.checkout": "Place the order →",
  "cart.remove": "remove",
  "cart.note": "Payment after availability is confirmed and delivery calculated.",

  "ck.title": "Checkout",
  "ck.empty": "Your order is empty.",
  "ck.name": "Name",
  "ck.namePh": "How should we address you",
  "ck.contact": "Phone or Telegram",
  "ck.contactPh": "+371… or @username",
  "ck.city": "Delivery city",
  "ck.cityPh": "Riga, Vilnius, Berlin…",
  "ck.comment": "Comment",
  "ck.commentPh": "Questions about condition, timing, restoration…",
  "ck.email": "E-mail",
  "ck.emailPh": "we will send the confirmation there",
  "ck.address": "Delivery address",
  "ck.addressPh": "Street, house, flat, city, postcode",
  "ck.delivery": "Receiving",
  "ck.pickup": "Pickup at our warehouse in Talsi",
  "ck.pickupNote": "free of charge · we agree on a time",
  "ck.courier": "Door-to-door delivery in Latvia",
  "ck.courierNote": "+50 € · 2–5 business days",
  "ck.free": "free",
  "ck.pickupTitle": "Warehouse in Talsi",
  "ck.pickupAddr": "Talsi, Latvia",
  "ck.pickupHint": "We will confirm the exact address and time once the order is placed.",
  "ck.route": "Route",
  "ck.fixFields": "Please fill in the highlighted fields — we cannot reach you without them.",
  "ck.errEmail": "Enter a valid e-mail — we will send the confirmation there",
  "ck.errPhone": "Enter a phone number or Telegram",
  "ck.errName": "Enter your name",
  "ck.errAddress": "Enter the delivery address",
  "ck.payCard": "Pay by card →",
  "ck.payLater": "Place order without payment",
  "ck.noStripe": "Card payment is still being connected. Your order is registered — we will contact you to arrange payment.",
  "ck.payHint": "Secure payment via Stripe. The order is registered immediately — even if you pay later.",
  "ok.paid": "Paid",
  "ok.unpaid": "Awaiting payment",
  "ok.textPaid": "Thank you! Payment received. We will contact you about the delivery time within a working day.",
  "ck.your": "Your order",
  "ck.send": "Send the order",
  "ck.note":
    "After sending, a manager contacts you within a working day: confirms availability, sends a video and calculates delivery. Payment only after confirmation.",
  "ck.agree": "By pressing, you agree to the processing of your contact details.",

  "ok.seal": "ACCEPTED",
  "ok.title": "Order {n} has been sent",
  "ok.text":
    "A manager will contact you within a working day — confirming availability, sending a video of the pieces and calculating delivery.",
  "ok.back": "Back to the showcase →",

  "crumb.home": "Showcase",
  "ftr.about":
    "Vintage and antique furniture of the 19th–20th centuries. Authentic pieces, careful restoration, delivery across Europe.",
  "ftr.shop": "Shop",
  "ftr.contact": "Contact",
  "ftr.rights": "Demonstration showcase",
  "ftr.by": "Design and development —",
  "wa.label": "Chat on WhatsApp",
  "wa.hello": "Hello! I am interested in a piece from the VINTAGE MĒBELES showcase",
};

const ru: Dict = {
  "meta.title": "VINTAGE MĒBELES — винтажная мебель с историей",
  "meta.desc":
    "VINTAGE MĒBELES — магазин винтажной и антикварной мебели: рококо, густавианский стиль, бидермейер. Подлинность, реставрация, доставка по Европе.",

  "nav.search": "Найти предмет: рококо, зеркало, комод…",
  "nav.allResults": "Все результаты в каталоге →",
  "nav.favs": "Избранное",
  "nav.cart": "Корзина",
  "nav.menu": "Меню",
  "nav.close": "Закрыть",

  "cat.all": "Вся коллекция",
  "cat.seating": "Мягкая мебель",
  "cat.mirror": "Зеркала",
  "cat.light": "Свет",
  "cat.storage": "Комоды и хранение",
  "cat.table": "Столы",
  "cat.decor": "Декор и керамика",

  "hero.kicker": "Витрина недели · коллекция пополнена",
  "hero.title": "Мебель,",
  "hero.titleAccent": "пережившая моду",
  "hero.sub":
    "Подлинные предметы XIX–XX веков: рококо, густавианский стиль, бидермейер. Каждый предмет проверен реставратором и готов к новой жизни в вашем доме.",
  "hero.cta": "Смотреть коллекцию →",
  "hero.cta2": "Подборки",
  "hero.factItems": "предметов в наличии",
  "hero.factAge": "век",
  "hero.factShip": "дней доставка",
  "usp.pickup": "Бесплатный самовывоз в Талси",
  "usp.delivery": "Доставка до дверей по Латвии — 50 €",
  "usp.items": "предметов в наличии",
  "hero.now": "Сейчас на витрине",

  "coll.kicker": "Кураторские подборки",
  "coll.title": "Настроения",
  "coll.titleAccent": "интерьера",
  "coll.salon": "Гостиная рококо",
  "coll.salonHint": "резьба, медальоны, бархат",
  "coll.cabinet": "Кабинет коллекционера",
  "coll.cabinetHint": "кожа, красное дерево, дуб",
  "coll.light": "Свет и отражения",
  "coll.lightHint": "хрусталь, золочение, амальгама",
  "coll.count": "предметов →",
  "coll.reset": "Сбросить подборку",

  "cat.kicker": "Каталог",
  "cat.kickerColl": "Подборка",
  "sort.new": "Сначала витринные",
  "sort.cheap": "Дешевле",
  "sort.rich": "Дороже",
  "cat.empty": "Ничего не нашлось — попробуйте другой запрос.",

  "why.kicker": "Почему мы",
  "why.title": "Три",
  "why.titleAccent": "обещания",
  "why.1": "Подлинность",
  "why.1t":
    "Каждый предмет атрибутирован: эпоха, школа, материалы. Никаких «под старину» — только вещи с настоящей биографией.",
  "why.2": "Состояние",
  "why.2t":
    "Реставратор проверяет каркас, пружины и фурнитуру до витрины. Перед покупкой пришлём видеообзор — вы видите ровно то, что приедет.",
  "why.3": "Доставка",
  "why.3t":
    "Обрешётка, мягкая упаковка, страховка. По Европе — 7–14 дней, до двери. Оплата после подтверждения заказа.",

  "recent.kicker": "Вы смотрели",
  "recent.title": "Недавние",
  "recent.titleAccent": "предметы",
  "related.kicker": "Из той же витрины",
  "related.title": "Похожие",
  "related.titleAccent": "предметы",

  "lot.sold": "ПРОДАНО",
  "lot.add": "В корзину",
  "lot.inCart": "В корзине ✓",
  "lot.buyNow": "Купить сейчас",
  "lot.openCart": "В корзине — открыть →",
  "lot.askSimilar": "Запросить похожий",
  "lot.note1": "Видеообзор состояния — по запросу перед покупкой",
  "lot.note2": "Доставка по Европе · 7–14 дней · обрешётка и страховка",
  "lot.note3": "Оплата после подтверждения заказа",
  "lot.showcase": "Витрина",

  "favs.title": "Избранное",
  "favs.empty": "Пока пусто. Отмечайте сердцем то, что легло на душу.",
  "favs.go": "Смотреть коллекцию →",

  "cart.title": "Корзина",
  "cart.empty": "Корзина пуста — коллекция ждёт.",
  "cart.sum": "Итог",
  "cart.items": "Предметов",
  "cart.ship": "Доставка",
  "cart.shipCalc": "рассчитаем",
  "cart.total": "Итого",
  "cart.checkout": "Оформить заказ →",
  "cart.remove": "убрать",
  "cart.note": "Оплата после подтверждения наличия и расчёта доставки.",

  "ck.title": "Оформление заказа",
  "ck.empty": "В заказе пока пусто.",
  "ck.name": "Имя",
  "ck.namePh": "Как к вам обращаться",
  "ck.contact": "Телефон или Telegram",
  "ck.contactPh": "+371… или @username",
  "ck.city": "Город доставки",
  "ck.cityPh": "Рига, Вильнюс, Берлин…",
  "ck.comment": "Комментарий",
  "ck.commentPh": "Вопросы о состоянии, сроках, реставрации…",
  "ck.email": "E-mail",
  "ck.emailPh": "на неё придёт подтверждение",
  "ck.address": "Адрес доставки",
  "ck.addressPh": "Улица, дом, квартира, город, индекс",
  "ck.delivery": "Получение",
  "ck.pickup": "Самовывоз со склада в Талси",
  "ck.pickupNote": "бесплатно · согласуем время",
  "ck.courier": "Доставка до дверей по Латвии",
  "ck.courierNote": "+50 € · 2–5 рабочих дней",
  "ck.free": "бесплатно",
  "ck.pickupTitle": "Склад в Талси",
  "ck.pickupAddr": "Талси, Латвия",
  "ck.pickupHint": "Точный адрес и время согласуем после оформления заказа.",
  "ck.route": "Маршрут",
  "ck.fixFields": "Заполните отмеченные поля — без них мы не сможем связаться.",
  "ck.errEmail": "Укажите корректную почту — на неё придёт подтверждение",
  "ck.errPhone": "Укажите телефон или Telegram",
  "ck.errName": "Укажите имя",
  "ck.errAddress": "Укажите адрес доставки",
  "ck.payCard": "Оплатить картой →",
  "ck.payLater": "Оформить без оплаты",
  "ck.noStripe": "Оплата картой ещё подключается. Заказ зарегистрирован — свяжемся и согласуем оплату.",
  "ck.payHint": "Безопасная оплата через Stripe. Заказ регистрируется сразу — даже если оплатите позже.",
  "ok.paid": "Оплачен",
  "ok.unpaid": "Ожидает оплаты",
  "ok.textPaid": "Спасибо! Оплата получена. Свяжемся по срокам доставки в течение рабочего дня.",
  "ck.your": "Ваш заказ",
  "ck.send": "Отправить заказ",
  "ck.note":
    "После отправки менеджер свяжется в течение рабочего дня: подтвердит наличие, пришлёт видеообзор и рассчитает доставку. Оплата — только после подтверждения.",
  "ck.agree": "Нажимая, вы соглашаетесь на обработку контактных данных.",

  "ok.seal": "ПРИНЯТО",
  "ok.title": "Заказ {n} отправлен",
  "ok.text":
    "Менеджер свяжется с вами в течение рабочего дня — подтвердит наличие, пришлёт видеообзор предметов и рассчитает доставку.",
  "ok.back": "Вернуться на витрину →",

  "crumb.home": "Витрина",
  "ftr.about":
    "Винтажная и антикварная мебель XIX–XX веков. Подлинные предметы, бережная реставрация, доставка по Европе.",
  "ftr.shop": "Магазин",
  "ftr.contact": "Связаться",
  "ftr.rights": "Демонстрационная витрина",
  "ftr.by": "Дизайн и разработка —",
  "wa.label": "Написать в WhatsApp",
  "wa.hello": "Здравствуйте! Интересует предмет с витрины VINTAGE MĒBELES",
};

const DICTS: Record<Lang, Dict> = { lv, en, ru };

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem("epoha-lang") as Lang | null;
    if (saved && DICTS[saved]) return saved;
  } catch {
    /* ignore */
  }
  /* Витрина латышская по умолчанию — язык браузера не переопределяет её. */
  return "lv";
}

export function makeT(lang: Lang) {
  const d = DICTS[lang] ?? lv;
  return (key: string, vars?: Record<string, string | number>) => {
    let s = d[key] ?? lv[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

export type T = ReturnType<typeof makeT>;

/** Локаль для форматирования цен и дат. */
export const localeOf = (l: Lang) => (l === "ru" ? "ru-RU" : l === "en" ? "en-GB" : "lv-LV");
