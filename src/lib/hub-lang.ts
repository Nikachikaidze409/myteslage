import { getMapLang, type MapLang } from "@/lib/map-lang";

const S = {
  welcome: { ka: "მოგესალმებით", hy: "Բարի գալուստ", az: "Xoş gəlmisiniz", ru: "Добро пожаловать" },
  choose: { ka: "აირჩიე რა გინდა", hy: "Ընտրեք", az: "Seçin", ru: "Выберите раздел" },
  nav: { ka: "ნავიგაცია", hy: "Նավիգացիա", az: "Naviqasiya", ru: "Навигация" },
  navSub: { ka: "რუკა და მარშრუტები", hy: "Քարտեզ և երթուղիներ", az: "Xəritə və marşrutlar", ru: "Карта и маршруты" },
  games: { ka: "თამაშები", hy: "Խաղեր", az: "Oyunlar", ru: "Игры" },
  gamesSub: { ka: "7 თამაში ეკრანზე", hy: "7 խաղ էկրանին", az: "Ekranda 7 oyun", ru: "7 игр на экране" },
  yt: { ka: "YouTube", hy: "YouTube", az: "YouTube", ru: "YouTube" },
  ytSub: { ka: "მხოლოდ გაჩერებულ მანქანაში", hy: "Միայն կանգնած մեքենայում", az: "Yalnız dayanmış avtomobildə", ru: "Только на стоянке" },
  back: { ka: "მენიუ", hy: "Մենյու", az: "Menyu", ru: "Меню" },
  moving: { ka: "ვიდეო ხელმისაწვდომია მხოლოდ გაჩერებულ ავტომობილში", hy: "Տեսանյութը հասանելի է միայն կանգնած մեքենայում", az: "Video yalnız dayanmış avtomobildə əlçatandır", ru: "Видео доступно только когда автомобиль стоит" },
  movingSub: { ka: "გაჩერდით, რომ ყურება გააგრძელოთ", hy: "Կանգնեք՝ շարունակելու համար", az: "Davam etmək üçün dayanın", ru: "Остановитесь, чтобы продолжить" },
  openYt: { ka: "YouTube-ის გახსნა", hy: "Բացել YouTube", az: "YouTube-u aç", ru: "Открыть YouTube" },
  paste: { ka: "ან ჩასვით YouTube ბმული აქ", hy: "Կամ տեղադրեք YouTube հղումը", az: "Və ya YouTube linkini yapışdırın", ru: "Или вставьте ссылку YouTube" },
  play: { ka: "ჩართვა", hy: "Միացնել", az: "Oynat", ru: "Смотреть" },
  checking: { ka: "ვამოწმებთ, გაჩერებულია თუ არა მანქანა…", hy: "Ստուգում ենք՝ մեքենան կանգնած է…", az: "Avtomobilin dayandığı yoxlanılır…", ru: "Проверяем, стоит ли автомобиль…" },
  noGps: { ka: "მდებარეობაზე წვდომა საჭიროა უსაფრთხოებისთვის", hy: "Անվտանգության համար անհրաժեշտ է տեղորոշում", az: "Təhlükəsizlik üçün məkan icazəsi lazımdır", ru: "Для безопасности нужен доступ к геолокации" },
} satisfies Record<string, Record<MapLang, string>>;

export function ht(k: keyof typeof S): string {
  return S[k][getMapLang()];
}
