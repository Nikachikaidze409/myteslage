export type Lang = "ka" | "en" | "hy" | "ru";
export const LANG_KEY = "mytesla.lang";
export const LANGS: readonly Lang[] = ["ka", "en", "hy", "ru"];

export const LANG_LABEL: Record<Lang, string> = {
  ka: "ქარ",
  en: "EN",
  hy: "ՀԱՅ",
  ru: "РУС",
};

export function isLang(value: unknown): value is Lang {
  return value === "ka" || value === "en" || value === "hy" || value === "ru";
}

export const SIGN_OUT_LABEL: Record<Lang, string> = {
  ka: "გასვლა",
  en: "Sign out",
  hy: "Դուրս գալ",
  ru: "Выйти",
};

export const T = {
  ka: {
    navPricing: "ფასები",
    navSignIn: "შესვლა",
    navGetStarted: "დაწყება",
    navOpenApp: "აპლიკაცია →",
    heroBadge: "იმპორტირებული Tesla-სთვის · საქართველო",
    heroTitle1: "ნავიგაცია,",
    heroTitle2: "რომელიც შენს Tesla-ს",
    heroTitle3: "უნდა ჰქონდეს.",
    heroBody: (
      <>
        Tesla-ს ჩაშენებული რუკები არასწორად მუშაობს იმპორტირებულ მანქანებზე
        საქართველოში. Premium Connectivity ღირს{" "}
        <span className="text-white">$99 წელიწადში</span> და მაინც არ ხდის მას
        გამოსადეგს. ჩვენ ავაშენეთ ალტერნატივა - ცოცხალი რუკა პირდაპირ შენი Tesla-ს ეკრანზე.
      </>
    ),
    heroCta: "დაიწყე 8 ₾/თვე-დან",
    stat1: "±1 მ",
    stat1l: "ცოცხალი GPS ტელეფონით",
    stat2: "17″",
    stat2l: "ოპტიმიზირებული Tesla-სთვის",
    stat3: "0",
    stat3l: "დამატებითი აღჭურვილობა",
    heroImgAlt: "Tesla Model 3-ის ეკრანი ცოცხალი ნავიგაციით თბილისში",
    badEyebrow: "პრობლემა",
    badTitle: "Tesla Premium Connectivity - 300 ₾/წელი",
    badBullets: [
      "იმპორტირებულ მანქანებზე საქართველოში მაინც არ მარშრუტდება სწორად",
      "ყოველთვიური გადასახადი იმ ფუნქციებზე, რომლებზეც უკვე გადაიხადე",
      "მიბმულია Tesla-ს ძველ რუკის მონაცემებზე მხარდაუჭერელ ქვეყნებში",
    ],
    goodEyebrow: "გამოსავალი",
    goodTitle: "TMap Georgia - 8 ₾/თვე",
    goodBullets: [
      "Google-ის ხარისხის რუკები, რომლებმაც იციან ქართული ქუჩები",
      "რეალურ დროში GPS შენი ტელეფონიდან → მანქანის 17″ ეკრანზე",
      "ცოცხალი ტრეფიკი, ალტერნატიული მარშრუტები, ავტო-გადამისამართება, HUD რეჟიმი",
    ],
    featuresTitle: "აშენებულია მანქანისთვის, მუშაობს შენი ტელეფონით.",
    featuresBody:
      "დააჟუფლე ერთხელ QR-კოდით. შენი ტელეფონი GPS-ს პირდაპირ Tesla-ს ბრაუზერში გადასცემს - მანქანა კი ცოცხალ რუკას აჩვენებს. აპლიკაცია, კაბელი და CarPlay-ის ჰაკები აღარ გჭირდება.",
    features: [
      { i: "📍", t: "რეალური GPS, ცოცხალი", b: "ტელეფონის ჩიპი ბევრად უფრო ზუსტია ვიდრე ბრაუზერი. მას რეალურ დროში მანქანაზე გადავცემთ." },
      { i: "🧭", t: "მოქცევა-მოქცევით HUD", b: "სრულ ეკრანზე ნავიგაცია დიდი ETA-თი, დისტანციითა და სიჩქარით - გამარჯვის ერთი მზერით წასაკითხად." },
      { i: "⚡", t: "ტრეფიკი და გადამისამართება", b: "ცოცხალი ტრეფიკის ფენა, ალტერნატიული მარშრუტები და ავტომატური გადამისამართება როცა კურსიდან გადაუხვევ." },
      { i: "🔋", t: "Supercharger-ის დაგეგმვა", b: "შეიყვანე ბატარეის %, ჩვენ დაგიგეგმავთ დამუხტვის გაჩერებებს გზაზე." },
      { i: "🇬🇪", t: "ადგილობრივი ქუჩები", b: "ქართული მისამართები, თბილისის უკუ-ქუჩები, უასფალტო გზების გაფრთხილება - მორგებული ქვეყანაზე." },
      { i: "🔒", t: "მხოლოდ წევრებისთვის", b: "ერთი ანგარიში, ერთი მოწყობილობა. სხვა მანქანაზე გაზიარება ვერ მოხერხდება." },
    ],
    pairingAlt: "ტელეფონის დაწყვილება Tesla-ს ეკრანთან QR-კოდით",
    pricingEyebrow: "ფასები",
    pricingTitle: "ერთი ფასი. Tesla-ს ფასის ნახევარიც არაა.",
    monthlyTitle: "ყოველთვიური",
    monthlyPeriod: "/თვე",
    monthlyTag: "შეწყვიტე ნებისმიერ დროს",
    monthlyFeatures: [
      "ცოცხალი რუკა მანქანაში",
      "ტელეფონის GPS დაწყვილება",
      "მოქცევა-მოქცევით HUD",
      "ტრეფიკი და გადამისამართება",
    ],
    monthlyCta: "ყოველთვიური გეგმა",
    quarterlyTitle: "3 თვე წინასწარ",
    quarterlyTotal: " სულ",
    quarterlySub: "7.20 ₾/თვე · დაზოგე 10%",
    quarterlyTag: "საუკეთესო ღირებულება",
    quarterlyFeatures: [
      "ყველაფერი Monthly-დან",
      "10% ფასდაკლება ყოველთვიურთან შედარებით",
      "ერთი გადახდა, სამი თვე",
      "პრიორიტეტული მხარდაჭერა",
    ],
    quarterlyCta: "დაზოგე 10% →",
    annualTitle: "1 წელი წინასწარ",
    annualTotal: " სულ",
    annualSub: "7.08 ₾/თვე · დაზოგე 11%",
    annualTag: "საუკეთესო ღირებულება",
    annualFeatures: [
      "ყველაფერი Monthly-დან",
      "11% ფასდაკლება ყოველთვიურთან შედარებით",
      "ერთი გადახდა, მთელი წელი",
      "პრიორიტეტული მხარდაჭერა",
    ],
    annualCta: "დაზოგე 11% →",
    annualBadge: "დაზოგე 11%",
    saveBadge: "დაზოგე 10%",
    pricingFoot:
      "შედარება: Tesla Premium Connectivity ≈ 300 ₾/წელი და მაინც არ მარშრუტდება საქართველოში.",
    contactEyebrow: "კითხვა გაქვს?",
    contactTitle: "დაგვიკავშირდი",
    contactBody:
      "ნებისმიერი შეკითხვისთვის დაგვირეკე ამ ნომერზე. დაგეხმარებით ნავიგაციის, გადახდის ან ანგარიშის საკითხებში.",
    contactCta: "დაგვირეკე",
    footer: "Tesla-ს მფლობელებისთვის საქართველოში",
  },
  en: {
    navPricing: "Pricing",
    navSignIn: "Sign in",
    navGetStarted: "Get started",
    navOpenApp: "Open app →",
    heroBadge: "For imported Teslas · Georgia",
    heroTitle1: "The navigation",
    heroTitle2: "your Tesla",
    heroTitle3: "should have.",
    heroBody: (
      <>
        Tesla's built-in maps don't work correctly on imported cars in Georgia. Premium
        Connectivity costs <span className="text-white">$99/year</span> and still won't fix it.
        We built the alternative - a real, live map that runs right on your Tesla's screen.
      </>
    ),
    heroCta: "Start from 8 ₾/mo",
    stat1: "±1 m",
    stat1l: "Live GPS via phone",
    stat2: "17″",
    stat2l: "Optimized for Tesla",
    stat3: "0",
    stat3l: "Extra hardware",
    heroImgAlt: "Tesla Model 3 dashboard showing live navigation in Tbilisi",
    badEyebrow: "The problem",
    badTitle: "Tesla Premium Connectivity - 300 ₾/year",
    badBullets: [
      "Still doesn't route correctly on imported cars in Georgia",
      "Ties you into a subscription for features you already paid for",
      "Locked to Tesla's aging map data outside supported countries",
    ],
    goodEyebrow: "The solution",
    goodTitle: "TMap Georgia - 8 ₾/month",
    goodBullets: [
      "Google-quality maps that actually know Georgian streets",
      "Real-time GPS from your phone → your car's 17″ screen",
      "Live traffic, alternates, auto-rerouting, HUD mode",
    ],
    featuresTitle: "Built for the car, powered by your phone.",
    featuresBody:
      "Pair once with a QR code. Your phone streams high-accuracy GPS to the Tesla browser; the Tesla shows the live map. That's it - no app store, no cable, no CarPlay hack.",
    features: [
      { i: "📍", t: "Real GPS, live", b: "Your phone's chip is far more accurate than a browser. We stream it to the car in real time." },
      { i: "🧭", t: "Turn-by-turn HUD", b: "Full-screen navigation with giant ETA, distance, and speed - designed to read at a glance." },
      { i: "⚡", t: "Traffic & rerouting", b: "Live traffic layer, alternate routes, and automatic rerouting when you drift off course." },
      { i: "🔋", t: "Supercharger planning", b: "Enter your battery %, and we'll plan charging stops along the way." },
      { i: "🇬🇪", t: "Local streets", b: "Georgian addresses, Tbilisi backroads, unpaved-road warnings - tuned for the country." },
      { i: "🔒", t: "Membership only", b: "One account, one device. Your subscription can't be shared to another car." },
    ],
    pairingAlt: "Phone pairing with Tesla screen via QR code",
    pricingEyebrow: "Pricing",
    pricingTitle: "One price. A fraction of what Tesla charges.",
    monthlyTitle: "Monthly",
    monthlyPeriod: "/month",
    monthlyTag: "Cancel anytime",
    monthlyFeatures: ["Live in-car map", "Phone GPS pairing", "Turn-by-turn HUD", "Traffic & rerouting"],
    monthlyCta: "Start monthly",
    quarterlyTitle: "3 months upfront",
    quarterlyTotal: " total",
    quarterlySub: "7.20 ₾/mo · save 10%",
    quarterlyTag: "Best value",
    quarterlyFeatures: [
      "Everything in Monthly",
      "10% off vs paying month-to-month",
      "One payment, three months",
      "Priority support",
    ],
    quarterlyCta: "Save 10% →",
    annualTitle: "1 year upfront",
    annualTotal: " total",
    annualSub: "7.08 ₾/mo · save 11%",
    annualTag: "Best value",
    annualFeatures: [
      "Everything in Monthly",
      "11% off vs paying month-to-month",
      "One payment, a full year",
      "Priority support",
    ],
    annualCta: "Save 11% →",
    annualBadge: "Save 11%",
    saveBadge: "Save 10%",
    pricingFoot:
      "Compare: Tesla Premium Connectivity ≈ 300 ₾/year and still doesn't route Georgia.",
    contactEyebrow: "Have a question?",
    contactTitle: "Reach out to us",
    contactBody:
      "Call us on this number for any question. We help with navigation, payment, or account issues.",
    contactCta: "Call us",
    footer: "Made for Tesla owners in Georgia",
  },
  hy: {
    navPricing: "Գներ",
    navSignIn: "Մուտք",
    navGetStarted: "Սկսել",
    navOpenApp: "Բացել հավելվածը →",
    heroBadge: "Ներկրված Tesla-ների համար · Վրաստան",
    heroTitle1: "Նավիգացիան,",
    heroTitle2: "որը ձեր Tesla-ն",
    heroTitle3: "պետք է ունենա.",
    heroBody: (
      <>
        Tesla-ի ներկառուցված քարտեզները ճիշտ չեն աշխատում Վրաստանում ներկրված
        մեքենաների վրա։ Premium Connectivity-ն արժե{" "}
        <span className="text-white">$99 տարեկան</span> և դա այնուամենայնիվ չի լուծում
        խնդիրը։ Մենք ստեղծել ենք այլընտրանքը՝ իրական, կենդանի քարտեզ ուղիղ ձեր Tesla-ի էկրանին։
      </>
    ),
    heroCta: "Սկսեք 8 ₾/ամիս-ից",
    stat1: "±1 մ",
    stat1l: "Կենդանի GPS հեռախոսով",
    stat2: "17″",
    stat2l: "Օպտիմալացված Tesla-ի համար",
    stat3: "0",
    stat3l: "Լրացուցիչ սարքավորում",
    heroImgAlt: "Tesla Model 3-ի էկրանը՝ կենդանի նավիգացիայով Թբիլիսիում",
    badEyebrow: "Խնդիրը",
    badTitle: "Tesla Premium Connectivity - 300 ₾/տարի",
    badBullets: [
      "Վրաստանում ներկրված մեքենաների վրա դեռ ճիշտ երթուղի չի կառուցում",
      "Ամսական վճար այն գործառույթների համար, որոնց համար արդեն վճարել եք",
      "Կապված է Tesla-ի հնացած քարտեզային տվյալներին՝ չաջակցվող երկրներում",
    ],
    goodEyebrow: "Լուծումը",
    goodTitle: "TMap Georgia - 8 ₾/ամիս",
    goodBullets: [
      "Google-ի որակի քարտեզներ, որոնք իսկապես գիտեն վրացական փողոցները",
      "Իրական ժամանակի GPS ձեր հեռախոսից → մեքենայի 17″ էկրանին",
      "Կենդանի երթևեկություն, այլընտրանքային երթուղիներ, ավտո-վերաերթուղում, HUD ռեժիմ",
    ],
    featuresTitle: "Ստեղծված մեքենայի համար, աշխատում է ձեր հեռախոսով։",
    featuresBody:
      "Զուգակցեք մեկ անգամ QR կոդով։ Ձեր հեռախոսը բարձր ճշգրտության GPS է փոխանցում Tesla-ի բրաուզերին, իսկ Tesla-ն ցույց է տալիս կենդանի քարտեզը։ Վերջ՝ ոչ հավելված, ոչ մալուխ, ոչ CarPlay հնարքներ։",
    features: [
      { i: "📍", t: "Իրական GPS, կենդանի", b: "Ձեր հեռախոսի չիպը շատ ավելի ճշգրիտ է, քան բրաուզերը։ Մենք այն իրական ժամանակում փոխանցում ենք մեքենային։" },
      { i: "🧭", t: "Քայլ առ քայլ HUD", b: "Լիաէկրան նավիգացիա՝ մեծ ETA-ով, հեռավորությամբ և արագությամբ՝ մեկ հայացքով կարդալու համար։" },
      { i: "⚡", t: "Երթևեկություն և վերաերթուղում", b: "Կենդանի երթևեկության շերտ, այլընտրանքային երթուղիներ և ավտոմատ վերաերթուղում, երբ շեղվում եք ուղուց։" },
      { i: "🔋", t: "Supercharger-ի պլանավորում", b: "Մուտքագրեք մարտկոցի %-ը, և մենք կպլանավորենք լիցքավորման կանգառները ճանապարհին։" },
      { i: "🇬🇪", t: "Տեղական փողոցներ", b: "Վրացական հասցեներ, Թբիլիսիի ներքին ճանապարհներ, չասֆալտապատ ճանապարհների զգուշացումներ՝ հարմարեցված երկրին։" },
      { i: "🔒", t: "Միայն անդամների համար", b: "Մեկ հաշիվ, մեկ սարք։ Ձեր բաժանորդագրությունը հնարավոր չէ կիսել այլ մեքենայի հետ։" },
    ],
    pairingAlt: "Հեռախոսի զուգակցում Tesla-ի էկրանի հետ QR կոդով",
    pricingEyebrow: "Գներ",
    pricingTitle: "Մեկ գին։ Tesla-ի գնի փոքր մասը։",
    monthlyTitle: "Ամսական",
    monthlyPeriod: "/ամիս",
    monthlyTag: "Չեղարկեք ցանկացած պահի",
    monthlyFeatures: [
      "Կենդանի քարտեզ մեքենայում",
      "Հեռախոսի GPS զուգակցում",
      "Քայլ առ քայլ HUD",
      "Երթևեկություն և վերաերթուղում",
    ],
    monthlyCta: "Սկսել ամսականը",
    quarterlyTitle: "3 ամիս կանխավճարով",
    quarterlyTotal: " ընդամենը",
    quarterlySub: "7.20 ₾/ամիս · խնայեք 10%",
    quarterlyTag: "Լավագույն արժեքը",
    quarterlyFeatures: [
      "Ամեն ինչ ամսականից",
      "10% զեղչ ամսական վճարման համեմատ",
      "Մեկ վճարում, երեք ամիս",
      "Առաջնահերթ աջակցություն",
    ],
    quarterlyCta: "Խնայեք 10% →",
    annualTitle: "1 տարի կանխավճարով",
    annualTotal: " ընդամենը",
    annualSub: "7.08 ₾/ամիս · խնայեք 11%",
    annualTag: "Լավագույն արժեքը",
    annualFeatures: [
      "Ամեն ինչ ամսականից",
      "11% զեղչ ամսական վճարման համեմատ",
      "Մեկ վճարում, ամբողջ տարի",
      "Առաջնահերթ աջակցություն",
    ],
    annualCta: "Խնայեք 11% →",
    annualBadge: "Խնայեք 11%",
    saveBadge: "Խնայեք 10%",
    pricingFoot:
      "Համեմատեք՝ Tesla Premium Connectivity ≈ 300 ₾/տարի և դեռևս երթուղի չի կառուցում Վրաստանում։",
    contactEyebrow: "Հարց ունե՞ք",
    contactTitle: "Կապվեք մեզ հետ",
    contactBody:
      "Ցանկացած հարցի համար զանգահարեք այս համարով։ Մենք կօգնենք նավիգացիայի, վճարման կամ հաշվի հարցերում։",
    contactCta: "Զանգահարեք մեզ",
    footer: "Ստեղծված Վրաստանում Tesla-ի սեփականատերերի համար",
  },
  ru: {
    navPricing: "Цены",
    navSignIn: "Вход",
    navGetStarted: "Начать",
    navOpenApp: "Открыть приложение →",
    heroBadge: "Для импортированных Tesla · Грузия",
    heroTitle1: "Навигация,",
    heroTitle2: "которая должна быть",
    heroTitle3: "в вашей Tesla.",
    heroBody: (
      <>
        Встроенные карты Tesla работают некорректно на импортированных автомобилях в
        Грузии. Premium Connectivity стоит{" "}
        <span className="text-white">$99 в год</span> и всё равно не решает проблему.
        Мы создали альтернативу — настоящую живую карту прямо на экране вашей Tesla.
      </>
    ),
    heroCta: "Начните от 8 ₾/мес",
    stat1: "±1 м",
    stat1l: "Живой GPS через телефон",
    stat2: "17″",
    stat2l: "Оптимизировано для Tesla",
    stat3: "0",
    stat3l: "Дополнительного оборудования",
    heroImgAlt: "Экран Tesla Model 3 с живой навигацией в Тбилиси",
    badEyebrow: "Проблема",
    badTitle: "Tesla Premium Connectivity - 300 ₾/год",
    badBullets: [
      "Всё равно не строит маршруты правильно на импортированных авто в Грузии",
      "Ежемесячная плата за функции, за которые вы уже заплатили",
      "Привязана к устаревшим картам Tesla в неподдерживаемых странах",
    ],
    goodEyebrow: "Решение",
    goodTitle: "TMap Georgia - 8 ₾/месяц",
    goodBullets: [
      "Карты качества Google, которые действительно знают грузинские улицы",
      "GPS в реальном времени с вашего телефона → на 17″ экран автомобиля",
      "Живые пробки, альтернативные маршруты, авто-перестроение, режим HUD",
    ],
    featuresTitle: "Создано для автомобиля, работает от вашего телефона.",
    featuresBody:
      "Свяжите один раз по QR-коду. Телефон передаёт высокоточный GPS в браузер Tesla, а Tesla показывает живую карту. Всё — без приложения, кабеля и хитростей с CarPlay.",
    features: [
      { i: "📍", t: "Настоящий GPS, вживую", b: "Чип вашего телефона намного точнее браузера. Мы передаём его данные в машину в реальном времени." },
      { i: "🧭", t: "Пошаговый HUD", b: "Полноэкранная навигация с крупным ETA, расстоянием и скоростью — читается одним взглядом." },
      { i: "⚡", t: "Пробки и перестроение", b: "Слой живых пробок, альтернативные маршруты и автоматическое перестроение при отклонении от курса." },
      { i: "🔋", t: "Планирование Supercharger", b: "Введите заряд батареи в %, и мы спланируем остановки для зарядки по пути." },
      { i: "🇬🇪", t: "Местные улицы", b: "Грузинские адреса, объезды Тбилиси, предупреждения о грунтовых дорогах — настроено под страну." },
      { i: "🔒", t: "Только для участников", b: "Один аккаунт, одно устройство. Подписку нельзя передать другой машине." },
    ],
    pairingAlt: "Подключение телефона к экрану Tesla по QR-коду",
    pricingEyebrow: "Цены",
    pricingTitle: "Одна цена. Малая доля того, что берёт Tesla.",
    monthlyTitle: "Ежемесячно",
    monthlyPeriod: "/месяц",
    monthlyTag: "Отмена в любое время",
    monthlyFeatures: [
      "Живая карта в автомобиле",
      "Связь с GPS телефона",
      "Пошаговый HUD",
      "Пробки и перестроение",
    ],
    monthlyCta: "Начать помесячно",
    quarterlyTitle: "3 месяца вперёд",
    quarterlyTotal: " всего",
    quarterlySub: "7.20 ₾/мес · экономия 10%",
    quarterlyTag: "Лучшая цена",
    quarterlyFeatures: [
      "Всё из ежемесячного плана",
      "Скидка 10% против помесячной оплаты",
      "Один платёж, три месяца",
      "Приоритетная поддержка",
    ],
    quarterlyCta: "Экономия 10% →",
    annualTitle: "1 год вперёд",
    annualTotal: " всего",
    annualSub: "7.08 ₾/мес · экономия 11%",
    annualTag: "Лучшая цена",
    annualFeatures: [
      "Всё из ежемесячного плана",
      "Скидка 11% против помесячной оплаты",
      "Один платёж, целый год",
      "Приоритетная поддержка",
    ],
    annualCta: "Экономия 11% →",
    annualBadge: "Экономия 11%",
    saveBadge: "Экономия 10%",
    pricingFoot:
      "Сравните: Tesla Premium Connectivity ≈ 300 ₾/год и всё равно не строит маршруты по Грузии.",
    contactEyebrow: "Есть вопрос?",
    contactTitle: "Свяжитесь с нами",
    contactBody:
      "Звоните по этому номеру с любым вопросом. Поможем с навигацией, оплатой или аккаунтом.",
    contactCta: "Позвонить нам",
    footer: "Сделано для владельцев Tesla в Грузии",
  },
} as const;

export type Translation = (typeof T)[Lang];
