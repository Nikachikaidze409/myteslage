/**
 * Zero-dependency i18n.
 *
 * No i18next, no runtime parser, no async bundles: every string is a plain
 * object literal that the build inlines, so the Tesla browser does no extra
 * work beyond reading one object key. Language is stored in localStorage and
 * broadcast through a window event so every mounted component switches at once
 * without any global provider re-render.
 */
import { useCallback, useEffect, useState } from "react";

export type Lang = "ka" | "en" | "hy" | "ru";

export const LANGS: { code: Lang; short: string; label: string }[] = [
  { code: "ka", short: "ქარ", label: "ქართული" },
  { code: "en", short: "EN", label: "English" },
  { code: "hy", short: "ՀԱՅ", label: "Հայերեն" },
  { code: "ru", short: "RU", label: "Русский" },
];

export const LANG_KEY = "mytesla.lang";
const LANG_EVENT = "tmap:lang";

export function isLang(v: unknown): v is Lang {
  return v === "ka" || v === "en" || v === "hy" || v === "ru";
}

export function readLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* ignore */
  }
  return "ka";
}

export function writeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: lang }));
}

/**
 * Always renders "ka" on the server and on first paint, then adopts the saved
 * language after mount — no hydration mismatch, no flash of layout shift.
 */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>("ka");

  useEffect(() => {
    setLangState(readLang());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (isLang(detail)) setLangState(detail);
    };
    window.addEventListener(LANG_EVENT, onChange);
    return () => window.removeEventListener(LANG_EVENT, onChange);
  }, []);

  const set = useCallback((l: Lang) => {
    setLangState(l);
    writeLang(l);
  }, []);

  return [lang, set];
}

/** Compact GE / EN / ARM / RU switcher. Pure CSS, no dropdown library. */
export function LanguageSwitcher({
  lang,
  onLang,
  tone = "dark",
  className = "",
}: {
  lang: Lang;
  onLang: (l: Lang) => void;
  tone?: "dark" | "light";
  className?: string;
}) {
  const base =
    tone === "dark"
      ? "border-white/10 bg-white/[0.03]"
      : "border-border bg-card";
  const active =
    tone === "dark" ? "bg-white text-black" : "bg-foreground text-background";
  const idle =
    tone === "dark"
      ? "text-white/60 hover:text-white"
      : "text-muted-foreground hover:text-foreground";

  return (
    <div
      className={`flex items-center rounded-lg border p-0.5 text-[11px] font-bold ${base} ${className}`}
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => onLang(l.code)}
          aria-label={l.label}
          aria-pressed={lang === l.code}
          className={`rounded-md px-1.5 py-1 transition ${lang === l.code ? active : idle}`}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}

/** Short UI labels shared by the map screen and the pricing page. */
export const UI = {
  ka: {
    back: "← უკან",
    trafficOn: "ტრეფიკი ჩართ.",
    trafficOff: "ტრეფიკი გამორთ.",
    night: "ღამე",
    day: "დღე",
    connect: "დაკავშირება",
    connected: "დაკავშირებულია",
    myLocation: "ჩემი მდებარეობა",
    trackingOn: "თვალყური ჩართულია",
    startTracking: "თვალყურის დევნება",
    membership: "წევრობა",
    pickPlan: "აირჩიე გეგმა",
    pickPlanSub: "ერთი ანგარიში = ერთი მოწყობილობა. გააუქმე ნებისმიერ დროს.",
    monthly: "ყოველთვიური",
    perMonth: "თვეში",
    billedMonthly: "იხდი ყოველთვიურად",
    threeMonths: "3 თვე",
    everyThree: "3 თვეში ერთხელ",
    off10: "10% ფასდაკლება",
    oneYear: "1 წელი",
    perYear: "წელიწადში",
    bestValue: "საუკეთესო ღირებულება - ერთი გადახდა წელიწადში",
    save11: "დაზოგე 11%",
    save10: "დაზოგე 10%",
    whatYouGet: "რას იღებ",
    perks: [
      "ცოცხალი ნავიგაცია მანქანაში, Tesla-ზე მორგებული",
      "ტელეფონის GPS დაწყვილება (1 მ სიზუსტე)",
      "მოქცევა-მოქცევით HUD და ხმოვანი მითითებები",
      "ცოცხალი ტრეფიკი და ავტო-გადამისამართება",
      "ქართული ქუჩები, მისამართები, ობიექტები",
      "Supercharger გაჩერებების დაგეგმვა",
    ],
    createAndContinue: "შექმენი ანგარიში და გააგრძელე →",
    continueCheckout: "გადახდაზე გადასვლა →",
    checkoutNote: "უსაფრთხო გადახდა. ფარული საკომისიოს გარეშე. გააუქმე ანგარიშიდან.",
    noMembership:
      "ამ ანგარიშს არ აქვს აქტიური წევრობა. თუ სხვა ელფოსტით გადაიხადე, გამოდი და შედი იმ ელფოსტით.",
    terms: "წესები და პირობები",
    refund: "დაბრუნების პოლიტიკა",
    privacy: "კონფიდენციალურობა",
  },
  en: {
    back: "← Back",
    trafficOn: "Traffic on",
    trafficOff: "Traffic off",
    night: "Night",
    day: "Day",
    connect: "Connect",
    connected: "Connected",
    myLocation: "My location",
    trackingOn: "Tracking on",
    startTracking: "Start tracking",
    membership: "Membership",
    pickPlan: "Pick your plan",
    pickPlanSub: "One account = one device. Cancel anytime, no lock-in.",
    monthly: "Monthly",
    perMonth: "per month",
    billedMonthly: "Billed every month",
    threeMonths: "3 months",
    everyThree: "every 3 months",
    off10: "10% off",
    oneYear: "1 year",
    perYear: "per year",
    bestValue: "Best value - one payment a year",
    save11: "Save 11%",
    save10: "Save 10%",
    whatYouGet: "What you get",
    perks: [
      "Live in-car navigation optimized for Tesla",
      "Phone GPS pairing (real 1 m accuracy)",
      "Turn-by-turn HUD & voice guidance",
      "Live traffic + auto-rerouting",
      "Georgian streets, addresses, POIs",
      "Supercharger stop planning",
    ],
    createAndContinue: "Create account & continue →",
    continueCheckout: "Continue to checkout →",
    checkoutNote: "Secure checkout. No hidden fees. Cancel anytime from your account.",
    noMembership:
      "This account has no active membership. If you paid with a different email, sign out and sign in with that email.",
    terms: "Terms & Conditions",
    refund: "Refund Policy",
    privacy: "Privacy Notice",
  },
  hy: {
    back: "← Հետ",
    trafficOn: "Երթևեկությունը միացված է",
    trafficOff: "Երթևեկությունն անջատված է",
    night: "Գիշեր",
    day: "Ցերեկ",
    connect: "Միացնել",
    connected: "Միացված է",
    myLocation: "Իմ տեղը",
    trackingOn: "Հետևումը միացված է",
    startTracking: "Սկսել հետևումը",
    membership: "Բաժանորդագրություն",
    pickPlan: "Ընտրեք ձեր փաթեթը",
    pickPlanSub: "Մեկ հաշիվ = մեկ սարք. Չեղարկեք ցանկացած պահի։",
    monthly: "Ամսական",
    perMonth: "ամսական",
    billedMonthly: "Վճարվում է ամեն ամիս",
    threeMonths: "3 ամիս",
    everyThree: "3 ամիսը մեկ",
    off10: "10% զեղչ",
    oneYear: "1 տարի",
    perYear: "տարեկան",
    bestValue: "Լավագույն արժեքը - մեկ վճարում տարեկան",
    save11: "Խնայեք 11%",
    save10: "Խնայեք 10%",
    whatYouGet: "Ինչ եք ստանում",
    perks: [
      "Կենդանի նավիգացիա մեքենայում, հարմարեցված Tesla-ին",
      "Հեռախոսի GPS զուգակցում (1 մ ճշտություն)",
      "Քայլ առ քայլ HUD և ձայնային ուղեկցում",
      "Կենդանի երթևեկություն և ավտոմատ վերաերթուղում",
      "Տեղական փողոցներ, հասցեներ, օբյեկտներ",
      "Supercharger կանգառների պլանավորում",
    ],
    createAndContinue: "Ստեղծել հաշիվ և շարունակել →",
    continueCheckout: "Անցնել վճարման →",
    checkoutNote: "Ապահով վճարում. Թաքնված վճարներ չկան. Չեղարկեք ձեր հաշվից։",
    noMembership:
      "Այս հաշիվը չունի ակտիվ բաժանորդագրություն։ Եթե վճարել եք այլ էլ. հասցեով, դուրս եկեք և մուտք գործեք այդ հասցեով։",
    terms: "Պայմաններ",
    refund: "Վերադարձի քաղաքականություն",
    privacy: "Գաղտնիություն",
  },
  ru: {
    back: "← Назад",
    trafficOn: "Пробки вкл.",
    trafficOff: "Пробки выкл.",
    night: "Ночь",
    day: "День",
    connect: "Подключить",
    connected: "Подключено",
    myLocation: "Моё местоположение",
    trackingOn: "Слежение вкл.",
    startTracking: "Начать слежение",
    membership: "Подписка",
    pickPlan: "Выберите план",
    pickPlanSub: "Один аккаунт = одно устройство. Отмена в любой момент.",
    monthly: "Ежемесячно",
    perMonth: "в месяц",
    billedMonthly: "Списание каждый месяц",
    threeMonths: "3 месяца",
    everyThree: "раз в 3 месяца",
    off10: "скидка 10%",
    oneYear: "1 год",
    perYear: "в год",
    bestValue: "Лучшая цена - один платёж в год",
    save11: "Экономия 11%",
    save10: "Экономия 10%",
    whatYouGet: "Что входит",
    perks: [
      "Живая навигация в машине, оптимизированная для Tesla",
      "GPS с телефона (точность до 1 м)",
      "Пошаговый HUD и голосовые подсказки",
      "Пробки и автоматическое перестроение маршрута",
      "Местные улицы, адреса, объекты",
      "Планирование остановок на Supercharger",
    ],
    createAndContinue: "Создать аккаунт и продолжить →",
    continueCheckout: "Перейти к оплате →",
    checkoutNote: "Безопасная оплата. Без скрытых комиссий. Отмена из аккаунта.",
    noMembership:
      "У этого аккаунта нет активной подписки. Если вы платили с другой почты, выйдите и войдите с неё.",
    terms: "Условия",
    refund: "Возврат средств",
    privacy: "Конфиденциальность",
  },
} as const;

export type UIStrings = (typeof UI)[Lang];
