/**
 * Localized landing pages: /{lang}/, /{lang}/alternatives, /{lang}/alternatives/{slug}, /{lang}/category/{slug}
 * for es, de, fr, pt (Brazil), ja. Product names stay as they are; taglines and category names come from
 * data/i18n/{lang}.json (falling back to English). Product pages, the board and the developer guide stay English.
 */
import { slugify } from "./catalog.js";
import { esc, layout, type Chrome } from "./pages.js";
import { faqLd, hasFreePlan, isOpenSource, isSelfHosted, itemListLd, logo, related, type Category, type SeoData, type Target } from "./seo.js";
import type { Product } from "./types.js";
import es from "../data/i18n/es.json" with { type: "json" };
import de from "../data/i18n/de.json" with { type: "json" };
import fr from "../data/i18n/fr.json" with { type: "json" };
import pt from "../data/i18n/pt.json" with { type: "json" };
import ja from "../data/i18n/ja.json" with { type: "json" };

export const LANGS = ["es", "de", "fr", "pt", "ja"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (s: string): s is Lang => (LANGS as readonly string[]).includes(s);

type Dict = { categories: Record<string, string>; taglines: Record<string, string> };
const DICTS: Record<Lang, Dict> = { es, de, fr, pt, ja } as Record<Lang, Dict>;
const tagline = (l: Lang, p: Product) => DICTS[l].taglines[p.id] || p.tagline;
const catName = (l: Lang, c: string) => DICTS[l].categories[c] || c;

interface M {
  chrome: Omit<Chrome, "home">;
  price: Record<string, string>;
  platform: Record<string, string>;
  website: string;
  yes: string;
  th: [string, string, string, string, string];
  /** "A, B and 3 more" */
  list: (names: string[], rest: number) => string;
  home: { title: string; desc: (n: number) => string; h1: string; lead: (n: number, pages: number) => string; popular: string; all: string; cantH: string; cantP: string; buildH: string; buildP: string; ai: string };
  index: { title: (n: number) => string; desc: (names: string, n: number) => string; h1: string; lead: (n: number) => string; byApp: string; byCat: string };
  alt: {
    title: (n: number, x: string) => string;
    desc: (n: number, x: string, names: string, free: number) => string;
    crumb: string;
    h1: (x: string) => string;
    lead: (n: number, x: string, free: number) => string;
    glance: string;
    list: string;
    related: string;
    relatedItem: (x: string) => string;
    browse: string;
    made: string;
  };
  cat: { title: (n: number, c: string) => string; desc: (n: number, c: string, names: string) => string; crumb: string; h1: (c: string) => string; lead: (n: number, c: string) => string; replace: string };
  faq: {
    title: string;
    freeQ: (x: string) => string;
    freeA: (k: number, n: number, list: string) => string;
    osQ: (x: string) => string;
    osA: (list: string) => string;
    shQ: (x: string) => string;
    shA: (list: string) => string;
    platQ: (x: string) => string;
    platLine: (platform: string, list: string) => string;
    indieQ: (x: string) => string;
    indieA: (x: string) => string;
  };
}

const commaList = (and: string, more: (n: number) => string) => (names: string[], rest: number) =>
  rest > 0 ? `${names.join(", ")} ${more(rest)}` : names.length > 1 ? `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}` : (names[0] ?? "");
const platforms = (labels: Record<string, string>) => ({ macos: "Mac", windows: "Windows", linux: "Linux", ios: "iOS", android: "Android", web: "Web", api: "API", ...labels });

const MSG: Record<Lang, M> = {
  es: {
    chrome: {
      placeholder: "¿Para qué necesitas una herramienta?",
      button: "Buscar",
      footer: [{ href: "/es/alternatives", label: "Ver alternativas" }, { href: "/es/wanted", label: "Lo que la gente busca" }, { href: "/submit", label: "Añade tu producto (EN)" }],
    },
    price: { free: "Gratis", freemium: "Plan gratuito", paid: "De pago", commission: "Comisión", "open-source": "Código abierto" },
    platform: platforms({ "self-hosted": "Autoalojado", "browser-extension": "Extensión de navegador" }),
    website: "Sitio web",
    yes: "Sí",
    th: ["Producto", "Precio", "Código abierto", "Autoalojable", "Plataformas"],
    list: commaList("y", (n) => `y ${n} más`),
    home: {
      title: "Indie Alternatives: herramientas hechas por desarrolladores independientes",
      desc: (n) => `Busca entre ${n} herramientas hechas por desarrolladores independientes: alternativas a las apps más conocidas.`,
      h1: "Encuentra una herramienta hecha por un desarrollador independiente.",
      lead: (n, pages) => `Describe lo que quieres hacer o el nombre de la app que quieres reemplazar. ${n} productos indie y ${pages} guías de alternativas.`,
      popular: "Alternativas populares:",
      all: "Todas →",
      cantH: "¿No lo encuentras?",
      cantP: "Tu búsqueda se guarda de forma anónima y la ven desarrolladores independientes, que la usan para decidir qué construir.",
      buildH: "¿Estás creando algo?",
      buildP: `Mira <a href="/es/wanted">lo que la gente buscó y no encontró</a> y <a href="/submit">añade tu producto</a> gratis.`,
      ai: `También funciona dentro de ChatGPT, Claude y Cursor: <a href="/#add">cómo añadirlo</a> (en inglés).`,
    },
    index: {
      title: (n) => `Alternativas indie a ${n} apps populares · Indie Alternatives`,
      desc: (names, n) => `Alternativas hechas por desarrolladores independientes a ${names} y ${n} apps más.`,
      h1: "Alternativas a apps populares",
      lead: (n) => `Reemplazos hechos por desarrolladores independientes para ${n} productos conocidos, más todas las categorías del catálogo.`,
      byApp: "Por app",
      byCat: "Por categoría",
    },
    alt: {
      title: (n, x) => `${n} alternativas indie a ${x} (${new Date().getUTCFullYear()})`,
      desc: (n, x, names, free) => `${n} alternativas independientes a ${x}, como ${names}.${free ? ` ${free} con plan gratuito.` : ""} Hechas por desarrolladores indie, no por grandes empresas.`,
      crumb: "Todas las alternativas",
      h1: (x) => `Alternativas indie a ${x}`,
      lead: (n, x, free) => `${n} productos de desarrolladores independientes y equipos pequeños que hacen lo mismo que ${x}${free ? `; ${free} tienen plan gratuito` : ""}. Primero las opciones gratuitas y de código abierto.`,
      glance: "De un vistazo",
      list: "Las alternativas",
      related: "Relacionadas",
      relatedItem: (x) => `Alternativas a ${x}`,
      browse: "Explorar:",
      made: `¿Has creado una? <a href="/submit">Añade tu producto</a>, es gratis.`,
    },
    cat: {
      title: (n, c) => `${n} herramientas indie de ${c} (${new Date().getUTCFullYear()}) · Indie Alternatives`,
      desc: (n, c, names) => `${n} herramientas de ${c} hechas por desarrolladores independientes, como ${names}.`,
      crumb: "Todas las categorías",
      h1: (c) => `Herramientas indie: ${c}`,
      lead: (n, c) => `${n} productos de ${c} creados por desarrolladores independientes y equipos pequeños.`,
      replace: "¿Quieres reemplazar algo?",
    },
    faq: {
      title: "Preguntas",
      freeQ: (x) => `¿Hay una alternativa gratuita a ${x}?`,
      freeA: (k, n, list) => `Sí. ${k} de las ${n} alternativas indie de esta página son gratuitas o tienen plan gratuito: ${list}.`,
      osQ: (x) => `¿Hay una alternativa de código abierto a ${x}?`,
      osA: (list) => `Sí: ${list}.`,
      shQ: (x) => `¿Puedo alojar yo mismo una alternativa a ${x}?`,
      shA: (list) => `Sí: ${list} se pueden instalar en tu propio servidor.`,
      platQ: (x) => `¿Qué alternativas a ${x} funcionan en Mac, Windows, iPhone o Android?`,
      platLine: (p, list) => `${p}: ${list}.`,
      indieQ: (x) => `¿Por qué estas alternativas a ${x} son “indie”?`,
      indieA: (x) => `Las crean desarrolladores independientes o equipos pequeños, no grandes empresas. Cada una aparece porque hace el mismo trabajo principal que ${x}.`,
    },
  },
  de: {
    chrome: {
      placeholder: "Wofür brauchst du ein Tool?",
      button: "Suchen",
      footer: [{ href: "/de/alternatives", label: "Alternativen ansehen" }, { href: "/de/wanted", label: "Was Leute suchen" }, { href: "/submit", label: "Produkt eintragen (EN)" }],
    },
    price: { free: "Kostenlos", freemium: "Gratis-Plan", paid: "Kostenpflichtig", commission: "Provision", "open-source": "Open Source" },
    platform: platforms({ "self-hosted": "Self-Hosting", "browser-extension": "Browser-Erweiterung" }),
    website: "Website",
    yes: "Ja",
    th: ["Produkt", "Preis", "Open Source", "Self-Hosting", "Plattformen"],
    list: commaList("und", (n) => `und ${n} weitere`),
    home: {
      title: "Indie Alternatives: Tools von unabhängigen Entwicklern",
      desc: (n) => `Durchsuche ${n} Tools von unabhängigen Entwicklern: Alternativen zu bekannter Software.`,
      h1: "Finde ein Tool von einem unabhängigen Entwickler.",
      lead: (n, pages) => `Beschreibe, was du tun willst, oder nenne die App, die du ersetzen möchtest. ${n} Indie-Produkte und ${pages} Alternativen-Übersichten.`,
      popular: "Beliebte Alternativen:",
      all: "Alle →",
      cantH: "Nichts gefunden?",
      cantP: "Deine Suche wird anonym gespeichert und unabhängigen Entwicklern gezeigt, die damit entscheiden, was sie als Nächstes bauen.",
      buildH: "Du baust etwas?",
      buildP: `Sieh dir an, <a href="/de/wanted">wonach Leute gesucht und nichts gefunden haben</a>, und <a href="/submit">trag dein Produkt kostenlos ein</a>.`,
      ai: `Funktioniert auch in ChatGPT, Claude und Cursor: <a href="/#add">so richtest du es ein</a> (Englisch).`,
    },
    index: {
      title: (n) => `Indie-Alternativen zu ${n} beliebten Apps · Indie Alternatives`,
      desc: (names, n) => `Alternativen von unabhängigen Entwicklern zu ${names} und ${n} weiteren Apps.`,
      h1: "Alternativen zu beliebten Apps",
      lead: (n) => `Ersatz von unabhängigen Entwicklern für ${n} bekannte Produkte, dazu alle Kategorien des Katalogs.`,
      byApp: "Nach App",
      byCat: "Nach Kategorie",
    },
    alt: {
      title: (n, x) => `${n} Indie-Alternativen zu ${x} (${new Date().getUTCFullYear()})`,
      desc: (n, x, names, free) => `${n} unabhängige Alternativen zu ${x}, darunter ${names}.${free ? ` ${free} mit Gratis-Plan.` : ""} Von Indie-Entwicklern, nicht von großen Konzernen.`,
      crumb: "Alle Alternativen",
      h1: (x) => `Indie-Alternativen zu ${x}`,
      lead: (n, x, free) => `${n} Produkte von unabhängigen Entwicklern und kleinen Teams, die dasselbe können wie ${x}${free ? `, ${free} davon mit Gratis-Plan` : ""}. Kostenlose und Open-Source-Optionen zuerst.`,
      glance: "Auf einen Blick",
      list: "Die Alternativen",
      related: "Ähnliche Seiten",
      relatedItem: (x) => `Alternativen zu ${x}`,
      browse: "Stöbern:",
      made: `Selbst eins gebaut? <a href="/submit">Trag dein Produkt ein</a>, kostenlos.`,
    },
    cat: {
      title: (n, c) => `${n} Indie-Tools: ${c} (${new Date().getUTCFullYear()}) · Indie Alternatives`,
      desc: (n, c, names) => `${n} Tools aus dem Bereich ${c} von unabhängigen Entwicklern, darunter ${names}.`,
      crumb: "Alle Kategorien",
      h1: (c) => `Indie-Tools: ${c}`,
      lead: (n, c) => `${n} Produkte aus dem Bereich ${c}, gebaut von unabhängigen Entwicklern und kleinen Teams.`,
      replace: "Etwas ersetzen?",
    },
    faq: {
      title: "Fragen",
      freeQ: (x) => `Gibt es eine kostenlose Alternative zu ${x}?`,
      freeA: (k, n, list) => `Ja. ${k} der ${n} Indie-Alternativen auf dieser Seite sind kostenlos oder haben einen Gratis-Plan: ${list}.`,
      osQ: (x) => `Gibt es eine Open-Source-Alternative zu ${x}?`,
      osA: (list) => `Ja: ${list}.`,
      shQ: (x) => `Kann ich eine Alternative zu ${x} selbst hosten?`,
      shA: (list) => `Ja: ${list} lassen sich auf dem eigenen Server betreiben.`,
      platQ: (x) => `Welche ${x}-Alternativen laufen auf Mac, Windows, iPhone oder Android?`,
      platLine: (p, list) => `${p}: ${list}.`,
      indieQ: (x) => `Was ist an diesen ${x}-Alternativen „indie“?`,
      indieA: (x) => `Sie werden von unabhängigen Entwicklern oder kleinen Teams gebaut, nicht von großen Firmen. Jede ist gelistet, weil sie dieselbe Kernaufgabe erfüllt wie ${x}.`,
    },
  },
  fr: {
    chrome: {
      placeholder: "De quel outil avez-vous besoin ?",
      button: "Rechercher",
      footer: [{ href: "/fr/alternatives", label: "Voir les alternatives" }, { href: "/fr/wanted", label: "Ce que les gens cherchent" }, { href: "/submit", label: "Ajouter votre produit (EN)" }],
    },
    price: { free: "Gratuit", freemium: "Offre gratuite", paid: "Payant", commission: "Commission", "open-source": "Open source" },
    platform: platforms({ "self-hosted": "Auto-hébergé", "browser-extension": "Extension de navigateur" }),
    website: "Site web",
    yes: "Oui",
    th: ["Produit", "Prix", "Open source", "Auto-hébergeable", "Plateformes"],
    list: commaList("et", (n) => `et ${n} autres`),
    home: {
      title: "Indie Alternatives : des outils créés par des développeurs indépendants",
      desc: (n) => `Parcourez ${n} outils créés par des développeurs indépendants : des alternatives aux logiciels les plus connus.`,
      h1: "Trouvez un outil créé par un développeur indépendant.",
      lead: (n, pages) => `Décrivez ce que vous voulez faire, ou l’app que vous voulez remplacer. ${n} produits indie et ${pages} guides d’alternatives.`,
      popular: "Alternatives populaires :",
      all: "Toutes →",
      cantH: "Introuvable ?",
      cantP: "Votre recherche est enregistrée anonymement et montrée à des développeurs indépendants, qui s’en servent pour choisir quoi construire.",
      buildH: "Vous créez un produit ?",
      buildP: `Voyez <a href="/fr/wanted">ce que les gens ont cherché sans le trouver</a> et <a href="/submit">ajoutez votre produit</a> gratuitement.`,
      ai: `Fonctionne aussi dans ChatGPT, Claude et Cursor : <a href="/#add">comment l’ajouter</a> (en anglais).`,
    },
    index: {
      title: (n) => `Alternatives indie à ${n} apps populaires · Indie Alternatives`,
      desc: (names, n) => `Des alternatives créées par des développeurs indépendants à ${names} et ${n} autres apps.`,
      h1: "Alternatives aux apps populaires",
      lead: (n) => `Des remplaçants créés par des développeurs indépendants pour ${n} produits connus, et toutes les catégories du catalogue.`,
      byApp: "Par app",
      byCat: "Par catégorie",
    },
    alt: {
      title: (n, x) => `${n} alternatives indie à ${x} (${new Date().getUTCFullYear()})`,
      desc: (n, x, names, free) => `${n} alternatives indépendantes à ${x}, dont ${names}.${free ? ` ${free} avec une offre gratuite.` : ""} Créées par des développeurs indie, pas par de grandes entreprises.`,
      crumb: "Toutes les alternatives",
      h1: (x) => `Alternatives indie à ${x}`,
      lead: (n, x, free) => `${n} produits de développeurs indépendants et de petites équipes qui font ce que fait ${x}${free ? `, dont ${free} avec une offre gratuite` : ""}. Les options gratuites et open source d’abord.`,
      glance: "En un coup d’œil",
      list: "Les alternatives",
      related: "Voir aussi",
      relatedItem: (x) => `Alternatives à ${x}`,
      browse: "Parcourir :",
      made: `Vous en avez créé une ? <a href="/submit">Ajoutez votre produit</a>, c’est gratuit.`,
    },
    cat: {
      title: (n, c) => `${n} outils indie : ${c} (${new Date().getUTCFullYear()}) · Indie Alternatives`,
      desc: (n, c, names) => `${n} outils ${c} créés par des développeurs indépendants, dont ${names}.`,
      crumb: "Toutes les catégories",
      h1: (c) => `Outils indie : ${c}`,
      lead: (n, c) => `${n} produits ${c} créés par des développeurs indépendants et de petites équipes.`,
      replace: "Vous voulez remplacer quelque chose ?",
    },
    faq: {
      title: "Questions",
      freeQ: (x) => `Existe-t-il une alternative gratuite à ${x} ?`,
      freeA: (k, n, list) => `Oui. ${k} des ${n} alternatives indie de cette page sont gratuites ou ont une offre gratuite : ${list}.`,
      osQ: (x) => `Existe-t-il une alternative open source à ${x} ?`,
      osA: (list) => `Oui : ${list}.`,
      shQ: (x) => `Peut-on auto-héberger une alternative à ${x} ?`,
      shA: (list) => `Oui : ${list} peuvent tourner sur votre propre serveur.`,
      platQ: (x) => `Quelles alternatives à ${x} fonctionnent sur Mac, Windows, iPhone ou Android ?`,
      platLine: (p, list) => `${p} : ${list}.`,
      indieQ: (x) => `Pourquoi ces alternatives à ${x} sont-elles « indie » ?`,
      indieA: (x) => `Elles sont créées par des développeurs indépendants ou de petites équipes, pas par de grandes entreprises. Chacune est listée parce qu’elle fait le même travail principal que ${x}.`,
    },
  },
  pt: {
    chrome: {
      placeholder: "Para que você precisa de uma ferramenta?",
      button: "Buscar",
      footer: [{ href: "/pt/alternatives", label: "Ver alternativas" }, { href: "/pt/wanted", label: "O que as pessoas procuram" }, { href: "/submit", label: "Cadastre seu produto (EN)" }],
    },
    price: { free: "Grátis", freemium: "Plano grátis", paid: "Pago", commission: "Comissão", "open-source": "Código aberto" },
    platform: platforms({ "self-hosted": "Auto-hospedado", "browser-extension": "Extensão de navegador" }),
    website: "Site",
    yes: "Sim",
    th: ["Produto", "Preço", "Código aberto", "Auto-hospedável", "Plataformas"],
    list: commaList("e", (n) => `e mais ${n}`),
    home: {
      title: "Indie Alternatives: ferramentas feitas por desenvolvedores independentes",
      desc: (n) => `Pesquise entre ${n} ferramentas feitas por desenvolvedores independentes: alternativas aos apps mais conhecidos.`,
      h1: "Encontre uma ferramenta feita por um desenvolvedor independente.",
      lead: (n, pages) => `Descreva o que você quer fazer ou o app que quer substituir. ${n} produtos indie e ${pages} guias de alternativas.`,
      popular: "Alternativas populares:",
      all: "Todas →",
      cantH: "Não encontrou?",
      cantP: "Sua busca é salva de forma anônima e mostrada a desenvolvedores independentes, que a usam para decidir o que criar.",
      buildH: "Está criando algo?",
      buildP: `Veja <a href="/pt/wanted">o que as pessoas procuraram e não encontraram</a> e <a href="/submit">cadastre seu produto</a> de graça.`,
      ai: `Também funciona no ChatGPT, Claude e Cursor: <a href="/#add">como adicionar</a> (em inglês).`,
    },
    index: {
      title: (n) => `Alternativas indie a ${n} apps populares · Indie Alternatives`,
      desc: (names, n) => `Alternativas feitas por desenvolvedores independentes a ${names} e mais ${n} apps.`,
      h1: "Alternativas a apps populares",
      lead: (n) => `Substitutos feitos por desenvolvedores independentes para ${n} produtos conhecidos, além de todas as categorias do catálogo.`,
      byApp: "Por app",
      byCat: "Por categoria",
    },
    alt: {
      title: (n, x) => `${n} alternativas indie ao ${x} (${new Date().getUTCFullYear()})`,
      desc: (n, x, names, free) => `${n} alternativas independentes ao ${x}, como ${names}.${free ? ` ${free} com plano grátis.` : ""} Feitas por desenvolvedores indie, não por grandes empresas.`,
      crumb: "Todas as alternativas",
      h1: (x) => `Alternativas indie ao ${x}`,
      lead: (n, x, free) => `${n} produtos de desenvolvedores independentes e pequenas equipes que fazem o mesmo que o ${x}${free ? `; ${free} têm plano grátis` : ""}. Primeiro as opções grátis e de código aberto.`,
      glance: "Visão geral",
      list: "As alternativas",
      related: "Relacionadas",
      relatedItem: (x) => `Alternativas ao ${x}`,
      browse: "Explorar:",
      made: `Criou uma? <a href="/submit">Cadastre seu produto</a>, é grátis.`,
    },
    cat: {
      title: (n, c) => `${n} ferramentas indie de ${c} (${new Date().getUTCFullYear()}) · Indie Alternatives`,
      desc: (n, c, names) => `${n} ferramentas de ${c} feitas por desenvolvedores independentes, como ${names}.`,
      crumb: "Todas as categorias",
      h1: (c) => `Ferramentas indie: ${c}`,
      lead: (n, c) => `${n} produtos de ${c} criados por desenvolvedores independentes e pequenas equipes.`,
      replace: "Quer substituir algo?",
    },
    faq: {
      title: "Perguntas",
      freeQ: (x) => `Existe uma alternativa grátis ao ${x}?`,
      freeA: (k, n, list) => `Sim. ${k} das ${n} alternativas indie desta página são grátis ou têm plano grátis: ${list}.`,
      osQ: (x) => `Existe uma alternativa de código aberto ao ${x}?`,
      osA: (list) => `Sim: ${list}.`,
      shQ: (x) => `Posso hospedar eu mesmo uma alternativa ao ${x}?`,
      shA: (list) => `Sim: ${list} podem rodar no seu próprio servidor.`,
      platQ: (x) => `Quais alternativas ao ${x} funcionam no Mac, Windows, iPhone ou Android?`,
      platLine: (p, list) => `${p}: ${list}.`,
      indieQ: (x) => `Por que essas alternativas ao ${x} são “indie”?`,
      indieA: (x) => `São feitas por desenvolvedores independentes ou pequenas equipes, não por grandes empresas. Cada uma está listada porque faz o mesmo trabalho principal que o ${x}.`,
    },
  },
  ja: {
    chrome: {
      placeholder: "どんなツールをお探しですか？",
      button: "検索",
      footer: [{ href: "/ja/alternatives", label: "代替ツール一覧" }, { href: "/ja/wanted", label: "求められているツール" }, { href: "/submit", label: "プロダクトを掲載（英語）" }],
    },
    price: { free: "無料", freemium: "無料プランあり", paid: "有料", commission: "手数料制", "open-source": "オープンソース" },
    platform: platforms({ "self-hosted": "セルフホスト", "browser-extension": "ブラウザ拡張", web: "Web" }),
    website: "公式サイト",
    yes: "○",
    th: ["プロダクト", "価格", "オープンソース", "セルフホスト", "対応環境"],
    list: (names, rest) => (rest > 0 ? `${names.join("、")} ほか${rest}件` : names.join("、")),
    home: {
      title: "Indie Alternatives：個人開発者がつくったツールを探す",
      desc: (n) => `個人開発者や小さなチームがつくった ${n} のツールから、有名アプリの代わりになるものを探せます。`,
      h1: "個人開発者がつくったツールを見つけよう。",
      lead: (n, pages) => `やりたいこと、または置き換えたいアプリ名を入力してください。${n} のインディープロダクトと ${pages} の代替ツールまとめ。`,
      popular: "人気の代替ツール：",
      all: "すべて →",
      cantH: "見つからない？",
      cantP: "見つからなかった検索は匿名で保存され、次に何をつくるか考えている個人開発者に共有されます。",
      buildH: "開発者の方へ",
      buildP: `<a href="/ja/wanted">探されたのに見つからなかったツール</a>をチェックして、<a href="/submit">自分のプロダクトを無料で掲載</a>できます。`,
      ai: `ChatGPT・Claude・Cursor の中でも使えます：<a href="/#add">追加方法</a>（英語）。`,
    },
    index: {
      title: (n) => `人気アプリ ${n} 個のインディー代替ツール · Indie Alternatives`,
      desc: (names, n) => `${names} など ${n} 個以上の人気アプリに代わる、個人開発者のツール。`,
      h1: "人気アプリの代替ツール",
      lead: (n) => `${n} の有名プロダクトに代わる個人開発者のツールと、すべてのカテゴリ。`,
      byApp: "アプリ別",
      byCat: "カテゴリ別",
    },
    alt: {
      title: (n, x) => `${x} の代替ツール ${n} 選：個人開発者のプロダクト（${new Date().getUTCFullYear()}年）`,
      desc: (n, x, names, free) => `${x} の代わりになる個人開発のツール ${n} 選。${names} など。${free ? `うち ${free} 件は無料で使えます。` : ""}大企業ではなくインディー開発者がつくったプロダクトです。`,
      crumb: "代替ツール一覧",
      h1: (x) => `${x} の代替ツール（インディー）`,
      lead: (n, x, free) => `${x} と同じことができる、個人開発者や小さなチームのプロダクト ${n} 件${free ? `（うち ${free} 件は無料プランあり）` : ""}。無料・オープンソースのものから順に並べています。`,
      glance: "比較表",
      list: "代替ツール一覧",
      related: "関連ページ",
      relatedItem: (x) => `${x} の代替ツール`,
      browse: "カテゴリ：",
      made: `つくった方は <a href="/submit">プロダクトを掲載</a>（無料）。`,
    },
    cat: {
      title: (n, c) => `${c} のインディーツール ${n} 選（${new Date().getUTCFullYear()}年）· Indie Alternatives`,
      desc: (n, c, names) => `個人開発者がつくった ${c} ツール ${n} 件。${names} など。`,
      crumb: "カテゴリ一覧",
      h1: (c) => `${c}：インディーツール`,
      lead: (n, c) => `個人開発者や小さなチームがつくった ${c} のプロダクト ${n} 件。`,
      replace: "置き換えたいアプリ：",
    },
    faq: {
      title: "よくある質問",
      freeQ: (x) => `${x} の無料の代替ツールはありますか？`,
      freeA: (k, n, list) => `あります。このページの ${n} 件のうち ${k} 件が無料、または無料プランがあります：${list}。`,
      osQ: (x) => `${x} のオープンソースの代替ツールはありますか？`,
      osA: (list) => `あります：${list}。`,
      shQ: (x) => `${x} の代わりをセルフホストできますか？`,
      shA: (list) => `できます：${list} は自分のサーバーで動かせます。`,
      platQ: (x) => `Mac・Windows・iPhone・Android で使える ${x} の代替ツールは？`,
      platLine: (p, list) => `${p}：${list}。`,
      indieQ: (x) => `この ${x} の代替ツールが「インディー」なのはなぜ？`,
      indieA: (x) => `大企業ではなく、個人開発者や小さなチームがつくっているからです。どれも ${x} と同じ主な用途に使えるものだけを掲載しています。`,
    },
  },
};

// ---------- shared pieces ----------

const PAGE_PATHS = (data: SeoData) => [
  "/",
  "/alternatives",
  ...data.targets.map((t) => `/alternatives/${t.slug}`),
  ...data.categories.map((c) => `/category/${c.slug}`),
];
/** localized URLs for the sitemap */
export const localizedUrls = (data: SeoData, productPaths: string[] = []) =>
  LANGS.flatMap((l) => [...PAGE_PATHS(data), "/wanted", ...productPaths].map((p) => (p === "/" ? `/${l}/` : `/${l}${p}`)));

/** hreflang alternates for a page that exists in every language (path without the language prefix) */
export function alternatesFor(base: string, path: string): { lang: string; href: string }[] {
  return [{ lang: "en", href: base + path }, ...LANGS.map((l) => ({ lang: l, href: `${base}/${l}${path === "/" ? "/" : path}` }))];
}

const chrome = (l: Lang): Chrome => ({ ...MSG[l].chrome, home: `/${l}/` });
const names = (l: Lang, ps: Product[], max = 4) => MSG[l].list(ps.slice(0, max).map((p) => p.name), Math.max(0, ps.length - max));
const priceOf = (l: Lang, p: Product) => (p.pricing ? (MSG[l].price[p.pricing] ?? p.pricing) : "");
const platformsOf = (l: Lang, p: Product) => (p.platforms ?? []).map((x) => MSG[l].platform[x] ?? x).join(l === "ja" ? "、" : ", ");

function card(l: Lang, p: Product, n?: number): string {
  const meta = [priceOf(l, p), platformsOf(l, p)].filter(Boolean).map(esc).join(" · ");
  return `<div class="card product" id="${esc(p.id)}">${logo(p)}<div class="body"><h3>${n ? `${n}. ` : ""}<a href="/${l}/product/${esc(p.id)}">${esc(p.name)}</a></h3>
<p><strong>${esc(tagline(l, p))}</strong></p>
<p class="count">${meta ? `${meta} · ` : ""}<a href="${esc(p.url)}" rel="noopener">${esc(MSG[l].website)} ↗</a></p></div></div>`;
}

function table(l: Lang, ps: Product[]): string {
  const m = MSG[l];
  const yes = (b: boolean) => (b ? `<span class="yes">${esc(m.yes)}</span>` : `<span class="muted">–</span>`);
  return `<div class="scroll"><table class="compare"><thead><tr>${m.th.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>
${ps.map((p) => `<tr><td><a href="#${esc(p.id)}">${esc(p.name)}</a></td><td class="nw">${esc(priceOf(l, p) || "–")}</td><td>${yes(isOpenSource(p))}</td><td>${yes(isSelfHosted(p))}</td><td>${esc(platformsOf(l, p) || "–")}</td></tr>`).join("\n")}
</tbody></table></div>`;
}

type Faq = { q: string; a: string };
function faqs(l: Lang, t: Target): Faq[] {
  const f = MSG[l].faq;
  const out: Faq[] = [];
  const free = t.products.filter(hasFreePlan);
  const os = t.products.filter(isOpenSource);
  const sh = t.products.filter(isSelfHosted);
  if (free.length) out.push({ q: f.freeQ(t.name), a: f.freeA(free.length, t.products.length, names(l, free)) });
  if (os.length) out.push({ q: f.osQ(t.name), a: f.osA(names(l, os)) });
  if (sh.length) out.push({ q: f.shQ(t.name), a: f.shA(names(l, sh)) });
  const plat = ["macos", "windows", "linux", "ios", "android"]
    .map((k) => [MSG[l].platform[k] ?? k, t.products.filter((p) => (p.platforms ?? []).includes(k))] as const)
    .filter(([, ps]) => ps.length && ps.length < t.products.length);
  if (plat.length >= 2) out.push({ q: f.platQ(t.name), a: plat.map(([label, ps]) => f.platLine(label, names(l, ps, 3))).join(" ") });
  out.push({ q: f.indieQ(t.name), a: f.indieA(t.name) });
  return out;
}

// ---------- pages ----------

export function localizedHome(base: string, l: Lang, data: SeoData, products: number): string {
  const m = MSG[l].home;
  const popular = data.targets.slice(0, 10);
  return layout(
    m.title,
    m.desc(products),
    `<section class="hero"><h1>${esc(m.h1)}</h1>
<p class="lead">${esc(m.lead(products, data.targets.length))}</p>
<form class="search big" method="get" action="/search" role="search"><input type="search" name="q" placeholder="${esc(MSG[l].chrome.placeholder)}" aria-label="${esc(MSG[l].chrome.placeholder)}" maxlength="200" autofocus><button type="submit">${esc(MSG[l].chrome.button)}</button></form>
<p class="count">${esc(m.popular)}</p>
<p class="chips">${popular.map((t) => `<a class="chip" href="/${l}/alternatives/${t.slug}">${esc(t.name)}</a>`).join("")}<a class="chip" href="/${l}/alternatives">${esc(m.all)}</a></p></section>
<div class="split"><div class="card"><h3>${esc(m.cantH)}</h3><p>${esc(m.cantP)}</p></div><div class="card"><h3>${esc(m.buildH)}</h3><p>${m.buildP}</p></div></div>
<p class="muted" style="margin-top:32px">${m.ai}</p>`,
    { canonical: `${base}/${l}/`, lang: l, alternates: alternatesFor(base, "/"), chrome: chrome(l), hideSearch: true },
  );
}

export function localizedIndex(base: string, l: Lang, data: SeoData): string {
  const m = MSG[l].index;
  return layout(
    m.title(data.targets.length),
    m.desc(data.targets.slice(0, 5).map((t) => t.name).join(", "), data.targets.length - 5),
    `<h1>${esc(m.h1)}</h1>
<p class="lead">${esc(m.lead(data.targets.length))}</p>
<h2>${esc(m.byApp)}</h2>
<p>${data.targets.map((t) => `<a href="/${l}/alternatives/${t.slug}">${esc(t.name)}</a>&nbsp;<span class="count">${t.products.length}</span>`).join(" · ")}</p>
<h2>${esc(m.byCat)}</h2>
<p>${data.categories.map((c) => `<a href="/${l}/category/${c.slug}">${esc(catName(l, c.name))}</a>&nbsp;<span class="count">${c.products.length}</span>`).join(" · ")}</p>`,
    { canonical: `${base}/${l}/alternatives`, lang: l, alternates: alternatesFor(base, "/alternatives"), chrome: chrome(l) },
  );
}

export function localizedAlternative(base: string, l: Lang, data: SeoData, t: Target): string {
  const m = MSG[l].alt;
  const path = `/alternatives/${t.slug}`;
  const n = t.products.length;
  const free = t.products.filter(hasFreePlan).length;
  const qa = faqs(l, t);
  const rel = related(data, t);
  return layout(
    m.title(n, t.name),
    m.desc(n, t.name, t.products.slice(0, 3).map((p) => p.name).join(", "), free),
    `<p class="count"><a href="/${l}/alternatives">${esc(m.crumb)}</a> › ${esc(t.name)}</p>
<h1>${esc(m.h1(t.name))}</h1>
<p class="lead">${esc(m.lead(n, t.name, free))}</p>
<h2>${esc(m.glance)}</h2>
${table(l, t.products)}
<h2>${esc(m.list)}</h2>
${t.products.map((p, i) => card(l, p, i + 1)).join("\n")}
<h2>${esc(MSG[l].faq.title)}</h2>
${qa.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("\n")}
${rel.length ? `<h2>${esc(m.related)}</h2><ul class="needs">${rel.map((o) => `<li><a href="/${l}/alternatives/${o.slug}">${esc(m.relatedItem(o.name))}</a> <span class="count">· ${o.products.length}</span></li>`).join("")}</ul>` : ""}
${t.categories.length ? `<p class="muted">${esc(m.browse)} ${t.categories.map((c) => `<a href="/${l}/category/${slugify(c)}">${esc(catName(l, c))}</a>`).join(" · ")}</p>` : ""}
<p class="muted">${m.made}</p>`,
    {
      canonical: `${base}/${l}${path}`,
      lang: l,
      alternates: alternatesFor(base, path),
      chrome: chrome(l),
      image: `${base}/og/alt/${t.slug}.png`,
      jsonLd: itemListLd(base, `/${l}${path}`, m.h1(t.name), t.products, faqLd(qa)),
    },
  );
}

export function localizedCategory(base: string, l: Lang, data: SeoData, c: Category): string {
  const m = MSG[l].cat;
  const path = `/category/${c.slug}`;
  const name = catName(l, c.name);
  const n = c.products.length;
  const alts = data.targets.filter((t) => t.categories[0] === c.name).slice(0, 12);
  return layout(
    m.title(n, name),
    m.desc(n, name, c.products.slice(0, 3).map((p) => p.name).join(", ")),
    `<p class="count"><a href="/${l}/alternatives">${esc(m.crumb)}</a> › ${esc(name)}</p>
<h1>${esc(m.h1(name))}</h1>
<p class="lead">${esc(m.lead(n, name))}</p>
${alts.length ? `<p>${esc(m.replace)} ${alts.map((t) => `<a href="/${l}/alternatives/${t.slug}">${esc(t.name)}</a>`).join(" · ")}</p>` : ""}
${c.products.map((p) => card(l, p)).join("\n")}`,
    {
      canonical: `${base}/${l}${path}`,
      lang: l,
      alternates: alternatesFor(base, path),
      chrome: chrome(l),
      image: `${base}/og/cat/${c.slug}.png`,
      jsonLd: itemListLd(base, `/${l}${path}`, m.h1(name), c.products),
    },
  );
}

// ---------- product pages and the demand board ----------

interface M2 {
  prod: {
    title: (name: string, tagline: string) => string;
    visit: (name: string) => string;
    pricing: string;
    platforms: string;
    categories: string;
    maker: string;
    altTo: (name: string) => string;
    seeAll: (n: number, name: string) => string;
    compared: (name: string) => string;
    similar: (name: string) => string;
    update: string;
    englishNote: string;
  };
  pq: {
    freeQ: (n: string) => string;
    freeA: (n: string, kind: "free" | "freemium" | "paid" | "commission") => string;
    osQ: (n: string) => string;
    osA: (n: string) => string;
    shQ: (n: string) => string;
    shA: (n: string) => string;
    platQ: (n: string) => string;
    platA: (n: string, list: string) => string;
    altQ: (n: string) => string;
    altA: (list: string) => string;
  };
  wanted: {
    title: string;
    desc: string;
    h1: string;
    lead: string;
    all: string;
    missingH: string;
    missingP: string;
    partialH: string;
    partialP: string;
    empty: (min: number) => string;
    emptyCat: (c: string, min: number) => string;
    asked: (n: number) => string;
    searchIt: string;
    totals: (records: number, distinct: number, min: number) => string;
    howH: string;
    howP: string;
    original: string;
  };
}

const MSG2: Record<Lang, M2> = {
  es: {
    prod: {
      title: (n, t) => `${n}: ${t} · Indie Alternatives`,
      visit: (n) => `Visitar ${n}`,
      pricing: "Precio",
      platforms: "Plataformas",
      categories: "Categorías",
      maker: "Creador",
      altTo: (n) => `${n} es una alternativa a`,
      seeAll: (k, n) => `¿Buscas otra cosa? Mira las ${k} alternativas a ${n}.`,
      compared: (n) => `${n} frente a herramientas similares`,
      similar: (n) => `Similares a ${n}`,
      update: `¿Es tu producto? <a href="/submit">Envía una actualización</a>.`,
      englishNote: "(en inglés)",
    },
    pq: {
      freeQ: (n) => `¿${n} es gratis?`,
      freeA: (n, k) => ({ free: `Sí, ${n} es gratis.`, freemium: `${n} se puede usar gratis y tiene planes de pago.`, paid: `${n} es de pago.`, commission: `${n} es gratis y cobra una comisión por venta.` })[k],
      osQ: (n) => `¿${n} es de código abierto?`,
      osA: (n) => `Sí, ${n} es de código abierto.`,
      shQ: (n) => `¿Se puede autoalojar ${n}?`,
      shA: (n) => `Sí, puedes instalar ${n} en tu propio servidor.`,
      platQ: (n) => `¿En qué plataformas funciona ${n}?`,
      platA: (n, l) => `${n} está disponible para ${l}.`,
      altQ: (n) => `¿Qué alternativas hay a ${n}?`,
      altA: (l) => `Productos indie similares: ${l}.`,
    },
    wanted: {
      title: "Se buscan: herramientas que la gente busca y no existen · Indie Alternatives",
      desc: "Herramientas que la gente buscó sin encontrarlas, de búsquedas anónimas en este sitio y en asistentes de IA. Ideas de producto para desarrolladores indie.",
      h1: "Se buscan: herramientas que la gente necesita",
      lead: `Búsquedas reales en este sitio y en ChatGPT, Claude y Cursor, ordenadas por cuántas personas las pidieron. Crea una y <a href="/submit">añádela</a>: quien busque después la encontrará.`,
      all: "Todas",
      missingH: "Nadie lo ha creado todavía",
      missingP: "Búsquedas en las que ninguna herramienta se acercó.",
      partialH: "Existe, pero no encaja",
      partialP: "Hubo resultados, pero la gente dijo que ninguno le servía. Hay sitio para un producto mejor o más enfocado.",
      empty: (min) => `Recopilando. Una necesidad aparece aquí cuando ${min} o más personas la han pedido, para que nadie pueda ser identificado.`,
      emptyCat: (c, min) => `Nada en ${c} todavía. Una necesidad aparece cuando ${min} o más personas la han pedido.`,
      asked: (n) => `${n}× pedida`,
      searchIt: "buscar",
      totals: (r, d, min) => `${r} búsquedas registradas, ${d} necesidades distintas (las formulaciones parecidas se agrupan). Solo se muestran las pedidas ${min}+ veces.`,
      howH: "Cómo funciona",
      howP: "Cuando una búsqueda aquí o en un asistente de IA no encuentra nada, o alguien dice que ningún resultado le sirve, guardamos solo el texto de la necesidad (sin datos de contacto), una categoría aproximada y la fecha. Para contar personas y no clics, guardamos además un código corto hecho con tu dirección IP y una clave aleatoria que se cambia cada día; al terminar el día la clave se borra, así que el código no se puede relacionar contigo ni con otros días. Nunca guardamos la dirección IP, cuentas ni conversaciones.",
      original: "Las necesidades se muestran tal como se escribieron.",
    },
  },
  de: {
    prod: {
      title: (n, t) => `${n}: ${t} · Indie Alternatives`,
      visit: (n) => `${n} besuchen`,
      pricing: "Preis",
      platforms: "Plattformen",
      categories: "Kategorien",
      maker: "Entwickler",
      altTo: (n) => `${n} ist eine Alternative zu`,
      seeAll: (k, n) => `Etwas anderes gesucht? Hier sind ${k} Alternativen zu ${n}.`,
      compared: (n) => `${n} im Vergleich mit ähnlichen Tools`,
      similar: (n) => `Ähnlich wie ${n}`,
      update: `Dein Produkt? <a href="/submit">Update einreichen</a>.`,
      englishNote: "(Englisch)",
    },
    pq: {
      freeQ: (n) => `Ist ${n} kostenlos?`,
      freeA: (n, k) => ({ free: `Ja, ${n} ist kostenlos.`, freemium: `${n} lässt sich kostenlos nutzen, es gibt auch bezahlte Pläne.`, paid: `${n} ist kostenpflichtig.`, commission: `${n} ist kostenlos und nimmt eine Provision pro Verkauf.` })[k],
      osQ: (n) => `Ist ${n} Open Source?`,
      osA: (n) => `Ja, ${n} ist Open Source.`,
      shQ: (n) => `Kann man ${n} selbst hosten?`,
      shA: (n) => `Ja, ${n} lässt sich auf dem eigenen Server betreiben.`,
      platQ: (n) => `Auf welchen Plattformen läuft ${n}?`,
      platA: (n, l) => `${n} gibt es für ${l}.`,
      altQ: (n) => `Welche Alternativen gibt es zu ${n}?`,
      altA: (l) => `Ähnliche Indie-Produkte: ${l}.`,
    },
    wanted: {
      title: "Gesucht: Software, nach der Leute suchen · Indie Alternatives",
      desc: "Tools, nach denen Leute gesucht und die sie nicht gefunden haben, aus anonymen Suchen auf dieser Seite und in KI-Assistenten. Produktideen für Indie-Entwickler.",
      h1: "Gesucht: Tools, nach denen Leute suchen",
      lead: `Echte Suchen auf dieser Seite und in ChatGPT, Claude und Cursor, sortiert danach, wie viele Leute gefragt haben. Bau eins und <a href="/submit">trag es ein</a>, dann finden dich die Nächsten, die suchen.`,
      all: "Alle",
      missingH: "Gibt es noch nicht",
      missingP: "Suchen, bei denen kein Tool auch nur annähernd passte.",
      partialH: "Gibt es, passt aber nicht",
      partialP: "Es gab Treffer, aber keiner passte. Platz für ein besseres oder spezialisierteres Produkt.",
      empty: (min) => `Wird gesammelt. Ein Bedarf erscheint hier, sobald ${min} oder mehr Leute danach gefragt haben, damit niemand erkennbar ist.`,
      emptyCat: (c, min) => `Noch nichts in ${c}. Ein Bedarf erscheint, sobald ${min} oder mehr Leute danach gefragt haben.`,
      asked: (n) => `${n}× gefragt`,
      searchIt: "suchen",
      totals: (r, d, min) => `${r} Suchen erfasst, ${d} verschiedene Bedarfe (ähnliche Formulierungen werden zusammengefasst). Gezeigt werden nur Bedarfe mit ${min}+ Anfragen.`,
      howH: "So funktioniert es",
      howP: "Wenn eine Suche hier oder in einem KI-Assistenten nichts findet oder jemand sagt, dass kein Treffer passt, speichern wir nur den Text des Bedarfs (ohne Kontaktdaten), eine grobe Kategorie und das Datum. Um Personen statt Klicks zu zählen, speichern wir außerdem einen kurzen Code aus deiner IP-Adresse und einem zufälligen Schlüssel, der jeden Tag neu erzeugt wird; danach wird der Schlüssel gelöscht, sodass sich der Code weder dir noch anderen Tagen zuordnen lässt. Die IP-Adresse selbst, Konten und Gesprächsinhalte speichern wir nie.",
      original: "Bedarfe werden so gezeigt, wie sie eingegeben wurden.",
    },
  },
  fr: {
    prod: {
      title: (n, t) => `${n} : ${t} · Indie Alternatives`,
      visit: (n) => `Visiter ${n}`,
      pricing: "Prix",
      platforms: "Plateformes",
      categories: "Catégories",
      maker: "Créateur",
      altTo: (n) => `${n} est une alternative à`,
      seeAll: (k, n) => `Vous cherchez autre chose ? Voici ${k} alternatives à ${n}.`,
      compared: (n) => `${n} comparé à des outils similaires`,
      similar: (n) => `Similaires à ${n}`,
      update: `C’est votre produit ? <a href="/submit">Envoyez une mise à jour</a>.`,
      englishNote: "(en anglais)",
    },
    pq: {
      freeQ: (n) => `${n} est-il gratuit ?`,
      freeA: (n, k) => ({ free: `Oui, ${n} est gratuit.`, freemium: `${n} s’utilise gratuitement, avec des offres payantes.`, paid: `${n} est payant.`, commission: `${n} est gratuit et prend une commission sur les ventes.` })[k],
      osQ: (n) => `${n} est-il open source ?`,
      osA: (n) => `Oui, ${n} est open source.`,
      shQ: (n) => `Peut-on auto-héberger ${n} ?`,
      shA: (n) => `Oui, ${n} peut tourner sur votre propre serveur.`,
      platQ: (n) => `Sur quelles plateformes fonctionne ${n} ?`,
      platA: (n, l) => `${n} est disponible sur ${l}.`,
      altQ: (n) => `Quelles sont les alternatives à ${n} ?`,
      altA: (l) => `Produits indie similaires : ${l}.`,
    },
    wanted: {
      title: "Recherché : les logiciels que les gens cherchent · Indie Alternatives",
      desc: "Des outils que les gens ont cherchés sans les trouver, issus de recherches anonymes sur ce site et dans les assistants IA. Des idées de produits pour développeurs indépendants.",
      h1: "Recherché : les outils que les gens veulent",
      lead: `De vraies recherches sur ce site et dans ChatGPT, Claude et Cursor, triées selon le nombre de personnes. Créez-en un et <a href="/submit">ajoutez-le</a> : les prochains à chercher vous trouveront.`,
      all: "Toutes",
      missingH: "Personne ne l’a encore créé",
      missingP: "Des recherches où aucun outil n’approchait.",
      partialH: "Existe, mais ne convient pas",
      partialP: "Il y avait des résultats, mais aucun ne convenait. De la place pour un produit meilleur ou plus ciblé.",
      empty: (min) => `Collecte en cours. Un besoin apparaît ici dès que ${min} personnes ou plus l’ont demandé, pour que personne ne soit identifiable.`,
      emptyCat: (c, min) => `Rien dans ${c} pour l’instant. Un besoin apparaît dès que ${min} personnes ou plus l’ont demandé.`,
      asked: (n) => `demandé ${n}×`,
      searchIt: "rechercher",
      totals: (r, d, min) => `${r} recherches enregistrées, ${d} besoins distincts (les formulations proches sont regroupées). Seuls les besoins demandés ${min}+ fois sont affichés.`,
      howH: "Comment ça marche",
      howP: "Quand une recherche ici ou dans un assistant IA ne trouve rien, ou que quelqu’un indique qu’aucun résultat ne convient, nous ne gardons que le texte du besoin (sans coordonnées), une catégorie approximative et la date. Pour compter des personnes et non des clics, nous gardons aussi un code court calculé à partir de votre adresse IP et d’une clé aléatoire remplacée chaque jour ; la clé est supprimée à la fin de la journée, le code ne peut donc pas être relié à vous ni à d’autres jours. Nous ne stockons jamais l’adresse IP elle-même, ni compte, ni conversation.",
      original: "Les besoins sont affichés tels qu’ils ont été saisis.",
    },
  },
  pt: {
    prod: {
      title: (n, t) => `${n}: ${t} · Indie Alternatives`,
      visit: (n) => `Visitar ${n}`,
      pricing: "Preço",
      platforms: "Plataformas",
      categories: "Categorias",
      maker: "Criador",
      altTo: (n) => `${n} é uma alternativa a`,
      seeAll: (k, n) => `Procurando outra coisa? Veja as ${k} alternativas ao ${n}.`,
      compared: (n) => `${n} comparado a ferramentas parecidas`,
      similar: (n) => `Parecidos com ${n}`,
      update: `É o seu produto? <a href="/submit">Envie uma atualização</a>.`,
      englishNote: "(em inglês)",
    },
    pq: {
      freeQ: (n) => `${n} é grátis?`,
      freeA: (n, k) => ({ free: `Sim, ${n} é grátis.`, freemium: `${n} pode ser usado de graça e tem planos pagos.`, paid: `${n} é pago.`, commission: `${n} é grátis e cobra comissão por venda.` })[k],
      osQ: (n) => `${n} é de código aberto?`,
      osA: (n) => `Sim, ${n} é de código aberto.`,
      shQ: (n) => `Dá para auto-hospedar o ${n}?`,
      shA: (n) => `Sim, você pode rodar o ${n} no seu próprio servidor.`,
      platQ: (n) => `Em quais plataformas o ${n} funciona?`,
      platA: (n, l) => `${n} está disponível para ${l}.`,
      altQ: (n) => `Quais são as alternativas ao ${n}?`,
      altA: (l) => `Produtos indie parecidos: ${l}.`,
    },
    wanted: {
      title: "Procura-se: softwares que as pessoas procuram · Indie Alternatives",
      desc: "Ferramentas que as pessoas procuraram e não encontraram, de buscas anônimas neste site e em assistentes de IA. Ideias de produto para desenvolvedores indie.",
      h1: "Procura-se: ferramentas que as pessoas querem",
      lead: `Buscas reais neste site e no ChatGPT, Claude e Cursor, ordenadas por quantas pessoas pediram. Crie uma e <a href="/submit">cadastre</a>: quem buscar depois vai encontrar você.`,
      all: "Todas",
      missingH: "Ninguém criou ainda",
      missingP: "Buscas em que nenhuma ferramenta chegou perto.",
      partialH: "Existe, mas não serve",
      partialP: "Houve resultados, mas as pessoas disseram que nenhum servia. Espaço para um produto melhor ou mais focado.",
      empty: (min) => `Coletando. Uma necessidade aparece aqui quando ${min} ou mais pessoas pediram, para que ninguém possa ser identificado.`,
      emptyCat: (c, min) => `Nada em ${c} ainda. Uma necessidade aparece quando ${min} ou mais pessoas pediram.`,
      asked: (n) => `pedida ${n}×`,
      searchIt: "buscar",
      totals: (r, d, min) => `${r} buscas registradas, ${d} necessidades diferentes (formulações parecidas são agrupadas). Só aparecem as pedidas ${min}+ vezes.`,
      howH: "Como funciona",
      howP: "Quando uma busca aqui ou num assistente de IA não encontra nada, ou alguém diz que nenhum resultado serve, guardamos só o texto da necessidade (sem dados de contato), uma categoria aproximada e a data. Para contar pessoas e não cliques, também guardamos um código curto feito com seu endereço IP e uma chave aleatória trocada todo dia; no fim do dia a chave é apagada, então o código não pode ser ligado a você nem a outros dias. Nunca guardamos o endereço IP em si, contas ou conversas.",
      original: "As necessidades aparecem como foram escritas.",
    },
  },
  ja: {
    prod: {
      title: (n, t) => `${n}：${t} · Indie Alternatives`,
      visit: (n) => `${n} を見る`,
      pricing: "価格",
      platforms: "対応環境",
      categories: "カテゴリ",
      maker: "開発者",
      altTo: (n) => `${n} が代わりになるアプリ`,
      seeAll: (k, n) => `ほかの選択肢：${n} の代替ツール ${k} 件を見る。`,
      compared: (n) => `${n} と類似ツールの比較`,
      similar: (n) => `${n} に似たツール`,
      update: `あなたのプロダクトですか？ <a href="/submit">情報を更新する</a>。`,
      englishNote: "（英語）",
    },
    pq: {
      freeQ: (n) => `${n} は無料ですか？`,
      freeA: (n, k) => ({ free: `はい、${n} は無料です。`, freemium: `${n} は無料で使い始められ、有料プランもあります。`, paid: `${n} は有料です。`, commission: `${n} は無料で、売上ごとに手数料がかかります。` })[k],
      osQ: (n) => `${n} はオープンソースですか？`,
      osA: (n) => `はい、${n} はオープンソースです。`,
      shQ: (n) => `${n} はセルフホストできますか？`,
      shA: (n) => `はい、${n} は自分のサーバーで動かせます。`,
      platQ: (n) => `${n} はどの環境で使えますか？`,
      platA: (n, l) => `${n} は ${l} で使えます。`,
      altQ: (n) => `${n} の代わりになるツールは？`,
      altA: (l) => `似たインディープロダクト：${l}。`,
    },
    wanted: {
      title: "求められているツール：探されたのに見つからなかったもの · Indie Alternatives",
      desc: "このサイトや AI アシスタントで探されたのに見つからなかったツールを匿名で集計。個人開発者のためのプロダクトのアイデア集です。",
      h1: "求められているツール",
      lead: `このサイトと ChatGPT・Claude・Cursor での実際の検索を、求めた人の多い順に並べています。つくったら <a href="/submit">掲載</a> してください。次に探す人に見つけてもらえます。`,
      all: "すべて",
      missingH: "まだ誰もつくっていない",
      missingP: "近いツールが見つからなかった検索。",
      partialH: "あるけれど合わない",
      partialP: "結果は出たものの「どれも合わない」とされた検索。もっと良い、または特化したプロダクトの余地があります。",
      empty: (min) => `集計中です。個人が特定されないよう、${min} 人以上が求めたものだけをここに表示します。`,
      emptyCat: (c, min) => `${c} にはまだありません。${min} 人以上が求めたものが表示されます。`,
      asked: (n) => `${n} 人が検索`,
      searchIt: "検索する",
      totals: (r, d, min) => `これまでの検索 ${r} 件、異なるニーズ ${d} 件（似た言い回しはまとめています）。表示は ${min} 回以上求められたものだけです。`,
      howH: "しくみ",
      howP: "このサイトや AI アシスタントで何も見つからなかったとき、または「どれも合わない」とされたとき、保存するのはニーズの文章（連絡先は削除）、おおまかなカテゴリ、日付だけです。クリック数ではなく人数を数えるため、IP アドレスと毎日入れ替わるランダムな鍵からつくった短いコードも保存します。鍵はその日が終わると削除されるので、コードからあなたを特定したり、別の日と結びつけたりはできません。IP アドレスそのもの、アカウント、会話の内容は保存しません。",
      original: "ニーズは入力されたままの言葉で表示しています。",
    },
  },
};

const description = (l: Lang, p: Product) => (DICTS[l] as Dict & { descriptions?: Record<string, string> }).descriptions?.[p.id];

export function localizedProduct(base: string, l: Lang, data: SeoData, p: Product, sim: Product[], noindex: boolean): string {
  const m = MSG2[l].prod;
  const q = MSG2[l].pq;
  const path = `/product/${p.id}`;
  const reps = data.replaces.get(p.id) ?? [];
  const own = data.targetByName.get(p.name.toLowerCase());
  const desc = description(l, p);
  const enDesc = p.description && p.description !== p.tagline ? p.description : "";
  const qa: Faq[] = [];
  if (p.pricing && ["free", "freemium", "paid", "commission"].includes(p.pricing)) qa.push({ q: q.freeQ(p.name), a: q.freeA(p.name, p.pricing as "free") });
  else if (p.pricing === "open-source") qa.push({ q: q.freeQ(p.name), a: q.freeA(p.name, "free") });
  if (isOpenSource(p)) qa.push({ q: q.osQ(p.name), a: q.osA(p.name) });
  if (isSelfHosted(p)) qa.push({ q: q.shQ(p.name), a: q.shA(p.name) });
  if (p.platforms?.length) qa.push({ q: q.platQ(p.name), a: q.platA(p.name, platformsOf(l, p)) });
  if (sim.length) qa.push({ q: q.altQ(p.name), a: q.altA(names(l, sim)) });
  const cat0 = p.categories[0];
  return layout(
    m.title(p.name, tagline(l, p)),
    `${p.name}: ${tagline(l, p)}`,
    `<p class="count"><a href="/${l}/alternatives">${esc(MSG[l].alt.crumb)}</a>${cat0 ? ` › <a href="/${l}/category/${slugify(cat0)}">${esc(catName(l, cat0))}</a>` : ""} › ${esc(p.name)}</p>
<div class="phead">${logo(p, 64)}<div><h1>${esc(p.name)}</h1>
<p class="lead">${esc(tagline(l, p))}</p></div></div>
${desc ? `<p>${esc(desc)}</p>` : enDesc ? `<p lang="en">${esc(enDesc)} <span class="count">${esc(m.englishNote)}</span></p>` : ""}
<p><a class="btn" href="${esc(p.url)}" rel="noopener">${esc(m.visit(p.name))} ↗</a></p>
<div class="card">
${p.pricing ? `<p><strong>${esc(m.pricing)}:</strong> ${esc(priceOf(l, p))}</p>` : ""}
${p.platforms?.length ? `<p><strong>${esc(m.platforms)}:</strong> ${esc(platformsOf(l, p))}</p>` : ""}
${p.categories.length ? `<p><strong>${esc(m.categories)}:</strong> ${p.categories.map((c) => `<a href="/${l}/category/${slugify(c)}">${esc(catName(l, c))}</a>`).join(", ")}</p>` : ""}
${p.maker ? `<p><strong>${esc(m.maker)}:</strong> ${esc(p.maker)}</p>` : ""}
</div>
${reps.length ? `<h2>${esc(m.altTo(p.name))}</h2><p>${reps.map((t) => `<a href="/${l}/alternatives/${t.slug}">${esc(t.name)}</a>`).join(" · ")}</p>` : ""}
${own ? `<p><a href="/${l}/alternatives/${own.slug}">${esc(m.seeAll(own.products.length, own.name))}</a></p>` : ""}
${sim.length ? `<h2>${esc(m.compared(p.name))}</h2>${table(l, [p, ...sim.slice(0, 6)])}` : ""}
${sim.length ? `<h2>${esc(m.similar(p.name))}</h2>${sim.map((o) => card(l, o)).join("\n")}` : ""}
${qa.length ? `<h2>${esc(MSG[l].faq.title)}</h2>\n${qa.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("\n")}` : ""}
<p class="muted">${m.update}</p>`,
    {
      canonical: `${base}/${l}${path}`,
      lang: l,
      alternates: alternatesFor(base, path),
      chrome: chrome(l),
      noindex,
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "SoftwareApplication", name: p.name, url: p.url, description: desc || tagline(l, p), applicationCategory: cat0, inLanguage: l },
          ...faqLd(qa),
        ],
      },
    },
  );
}

export interface BoardNeed {
  need: string;
  count: number;
  first_seen: string;
  last_seen: string;
  categories: string[];
  kind: "missing" | "partial";
}

export function localizedWanted(base: string, l: Lang, needs: BoardNeed[], min: number, totals: { records: number; distinct: number }, categories: string[], category?: string): string {
  const w = MSG2[l].wanted;
  const missing = needs.filter((n) => n.kind !== "partial");
  const partial = needs.filter((n) => n.kind === "partial");
  const href = (c?: string) => `/${l}/wanted${c ? `?category=${encodeURIComponent(c)}` : ""}`;
  const list = (ns: BoardNeed[]) =>
    `<ol class="wanted">${ns
      .map(
        (n) => `<li><div class="need">${esc(n.need)}</div>
<div class="count"><span class="pill">${esc(w.asked(n.count))}</span> ${n.first_seen === n.last_seen ? esc(n.last_seen) : `${esc(n.first_seen)} → ${esc(n.last_seen)}`}${
          n.categories.length ? ` · ${n.categories.map((c) => `<a href="${href(c)}">${esc(catName(l, c))}</a>`).join(", ")}` : ""
        } · <a href="/search?q=${encodeURIComponent(n.need)}&amp;from=wanted" rel="nofollow">${esc(w.searchIt)}</a></div></li>`,
      )
      .join("\n")}</ol>`;
  const empty = `<div class="card"><p>${esc(category ? w.emptyCat(catName(l, category), min) : w.empty(min))}</p></div>`;
  const chips = categories.length
    ? `<p class="chips"><a class="chip${category ? "" : " on"}" href="${href()}">${esc(w.all)}</a>${categories
        .map((c) => `<a class="chip${c.toLowerCase() === category?.toLowerCase() ? " on" : ""}" href="${href(c)}">${esc(catName(l, c))}</a>`)
        .join("")}</p>`
    : "";
  return layout(
    w.title,
    w.desc,
    `<h1>${esc(w.h1)}</h1>
<p class="lead">${w.lead}</p>
${chips}
<h2>${esc(w.missingH)}</h2><p class="muted">${esc(w.missingP)}</p>
${missing.length ? list(missing) : empty}
<h2>${esc(w.partialH)}</h2><p class="muted">${esc(w.partialP)}</p>
${partial.length ? list(partial) : empty}
<p class="muted">${esc(w.totals(totals.records, totals.distinct, min))} ${esc(w.original)} JSON: <a href="/api/wanted">/api/wanted</a></p>
<h2>${esc(w.howH)}</h2><p class="muted">${esc(w.howP)}</p>`,
    {
      canonical: category ? `${base}${href(category)}` : `${base}/${l}/wanted`,
      lang: l,
      alternates: category ? undefined : alternatesFor(base, "/wanted"),
      chrome: chrome(l),
      noindex: Boolean(category) && needs.length === 0,
    },
  );
}
