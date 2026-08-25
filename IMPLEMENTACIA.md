# Financie — implementačný plán

**Verzia 1.1 · 24. 8. 2026 · Milan Kubacka**

Zmeny v 1.1: pridaná **fáza 2.5 — refaktor UI/UX a rozšírenie modelu domácnosti** (deväť pripomienok
z revízie nasadenej appky, tri paralelné agenti: engine a typy, informačná architektúra, dizajnový
systém). Revidovaný §6.1 bod 4.

Podklad: hĺbková analýza piatich paralelných agentov (produktová stratégia a konkurencia, technologický stack, audit súčasného kódu, CZ/SK legislatíva a produkty, UX výskum). Plné výstupy sú v `research/01-strategy.md` až `research/05-ux.md`.

---

## 0. Desať rozhodnutí, z ktorých vyplýva všetko ostatné

| # | Rozhodnutie | Prečo |
|---|---|---|
| 1 | **Produkt je simulátor životných scenárov, nie sledovač výdavkov.** | Wallet a Spendee sú české, dobré a lacné. Tracking je bežiaci pás, ktorý tvoj produkt nepotrebuje. |
| 2 | **Mesačná granularita je technologická priekopa.** | ProjectionLab — svetový benchmark — počíta **po rokoch a sám to priznáva**. Amortizácia hypotéky, 28-týždňová materská a dno rezervy v konkrétnom mesiaci sú področné javy. Ročný engine nikdy nepovie „január 2032". |
| 3 | **Hlavná otázka produktu: „Kedy si môžeme dovoliť dieťa?"** | 55 % Čechov 18–49 uvádza finančnú neistotu ako dôvod, prečo nemajú deti, ktoré chcú; 26 % menuje hypotéku. Pôrodnosť 2025 = 77 600, najnižšia za 240 rokov. Otázku už majú v hlave, len na ňu nikto neodpovedá v češtine ani slovenčine. |
| 4 | **Overené odporúčania sú produktová aj portfóliová priekopa.** | Boldin vo vlastnom porovnaní pripúšťa, že *žiadny* nástroj neponúka automatické overené odporúčania. Binárne hľadanie + presimulovanie je zároveň najčitateľnejší dôkaz inžinierskej kvality. |
| 5 | **Engine beží v prehliadači, nikdy na serveri.** | Pár stoviek iterácií = sub-milisekunda. Serverový round-trip pri každom pohybe slidera = 50–150 ms latencie a účet za CPU. Vercel Hobby má fair-use strop 4 CPU-h/mesiac. |
| 6 | **Registrácia existuje, ale nikdy nie je bránou.** | Toto je jediná vec, kde sa odchyľujem od tvojho zadania — vysvetlenie v §2. |
| 7 | **Žiadna PSD2 agregácia. Nikdy.** | AISP licencia, per-connection náklady, podpora 47 bánk s rozbitými API — a v momente, keď držíš živé bankové dáta, si pre Apple aj GDPR finančná inštitúcia. Zničí to aj príbeh „nemusíš mi dať nič". |
| 8 | **Monorepo s čistým `packages/engine` bez jedinej runtime závislosti.** | Web a iOS musia dať identickú odpoveď. Ak telefón povie február 2032 a web január 2032, celý produkt je mŕtvy. |
| 9 | **iOS = Expo/React Native, nie Capacitor, nie SwiftUI.** | Engine sa prenesie 1:1, prepisuje sa len UI. Capacitor ide proti „nativity" a riskuje odmietnutie podľa 4.2. SwiftUI = dve UI navždy pre jedného človeka. |
| 10 | **Pred podaním na App Store musí existovať s.r.o.** | Apple 5.1.1(ix): appky v silne regulovaných oblastiach „should be submitted by a legal entity … and not by an individual developer". Nedá sa to dodatočne obísť. |

---

## 1. Pozicionovanie

> **Kedy si môžeme dovoliť dieťa?** — mesiac po mesiaci simulovaných 25 rokov vášho rozpočtu. Pre páry v Česku a na Slovensku. Zadarmo, bez registrácie, s českými a slovenskými dávkami a hypotékami zabudovanými priamo v modeli — a každé odporúčanie je dokázané presimulovaním.

**Pre koho presne:** dvojpríjmové páry 27–38, Praha / Brno / Bratislava / väčšie regionálne mestá, jeden alebo obaja v odbornej práci, majú hypotéku alebo ju do roka budú brať, už mesačne investujú do ETF (55 % Čechov investuje, 59 % investorov vo fondoch/ETF), plánujú prvé alebo druhé dieťa do 1–5 rokov. **Sú to ľudia s tabuľkou v Exceli, ktorej už neveria.** Manuálne zadávanie znesú — ProjectionLab to dokázal. Zlý graf neznesú.

**Tri kandidátske háčiky a ich skutočné role:**

- **Pár a deti = trhový háčik.** Jediný z troch, ktorý si človek reálne googlí po česky. Zároveň štrukturálna dier a v ProjectionLabe („family account" = druhá najžiadanejšia funkcia, 242 hlasov, ani nie je v pláne).
- **Hypotéka = povinná súčasť, nikdy nadpis.** SEO na hypotéky vlastnia banky a affiliate weby, tú vojnu nevyhráš. Ale pri priemernej novej hypotéke 4,51 mil. Kč a refixácii okolo 4,5 % je hypotéka práve tá premenná, ktorá z pohodlného páru robí pár s dnom rezervy v roku 2032. **Modeluj ju perfektne vrátane refixácie, nikdy s ňou nezačínaj.**
- **Overené odporúčania = produktový háčik pre demo, nie pre nadpis.** Nikto to nehľadá. Ale nikto to nemá.

**Čím to nesmie byť** — každý bod je spôsob, ako produkt zomrie: sledovač výdavkov · bankový agregátor · net-worth dashboard · FIRE kalkulačka · Monte Carlo hračka · robo-advisor · multi-currency multi-country · AI chatbot.

---

## 2. Kde sa odchyľujem od tvojho zadania

Toto si prečítaj celé a rozhodni sám — ide o tri veci.

### 2.1 „Bude potrebný register a login" → účet áno, brána nie

Register a login **postav**, ale zaraď ich do **fázy 4**, nie do fázy 1, a nikdy nedávaj čísla za prihlásenie. Dôvody, v poradí dôležitosti:

1. **68 % používateľov fintechu opustí onboarding pred jeho dokončením.** Ak pred prvým grafom stojí registrácia, stratíš väčšinu ľudí, ktorých získaš z Redditu alebo z podcastu — teda presne tých, na ktorých ti záleží.
2. **Náklady.** Pri 10 000 používateľoch je infrastruktúra **~0 €, ak sú účty voliteľné, a ~65 $/mes., ak sú povinné.** Sľub „zadarmo navždy" je pri voliteľných účtoch triviálne udržateľný.
3. **Riziko, ktoré ukončí projekt.** Supabase vystavuje databázu cez verejný anon key. Jedna chybná RLS politika na tabuľke s plánmi = úniky príjmov, hypoték a mien detí tisícov domácností, 72-hodinové hlásenie na ÚOOÚ a článok na Seznam Zprávy. Toto zabije portfóliovú hodnotu v ten istý deň ako produkt.
4. **Podpora.** Kategória „neviem sa prihlásiť / zmazte mi dáta / zabudol som heslo" je väčšina objemu podpory u free produktov. Bez účtu neexistuje.
5. **Marketingová veta, ktorú inak nedostaneš:** *„Vaše dáta zostávajú vo vašom prehliadači."* Nikto z konkurencie ju povedať nemôže.

**Konkrétne teda:** fáza 2 ukladá do `localStorage` + export/import JSON + zdieľateľný read-only link. Fáza 4 pridá **voliteľný** účet pre synchronizáciu medzi zariadeniami — a plán sa na server posiela **zašifrovaný na klientovi kľúčom, ktorý server nikdy nevidí**. Tým sa z compliance povinnosti stane najsilnejšia veta na landing page: *„Ani keby som chcel, vaše čísla si neprečítam."*

### 2.2 Notifikácie prídu neskôr, než by si chcel

Notifikácie nemajú zmysel bez uložených plánov, teda bez účtov. A na iOS je web push funkčný **iba ak si používateľ pridá PWA na plochu** — v otvorenej karte Safari nefunguje vôbec. Reálny push na iPhone teda prichádza až s nativnou appkou. Nepočítaj s tým skôr.

### 2.3 Jedna vec, ktorú v zadaní nemáš a je dôležitejšia než väčšina funkcií

**Verejná stránka `/parametre` so zdrojmi zákonov a dátumami poslednej verifikácie.** Najpravdepodobnejší zdroj nesprávnej projekcie nie je bug v matematike — je to **zastaraná zákonná konštanta**. Zmena zvýšenia slovenského rodičovského príspevku o 3,7 % k 1. 1. 2026 alebo českého limitu pri viacerých deťoch by ticho rozbila každú predchádzajúcu projekciu, bez chyby a bez varovania. Táto stránka je zároveň jediná dôveryhodná náhrada za inštitucionálnu značku a základ pre jedinú notifikáciu, akú nikto iný poslať nemôže (§8).

---

## 3. Technologický stack

| Vrstva | Voľba | Prečo práve toto |
|---|---|---|
| Web framework | **Next.js 16.3+**, App Router, na Vercel | Máš to rád, PR previews zadarmo, RSC pre statické stránky, klient pre editor scenára. |
| Monorepo | **pnpm workspaces + Turborepo** | Remote cache na Vercele, CI prebuildí len to, čo sa zmenilo. |
| Engine | **`packages/engine`, čisté TS, nula runtime závislostí** | Žiadna závislosť sa nemôže inak resolvovať v Node, v prehliadači a v Hermes/JSC. Identita odpovede je daná konštrukciou, nie disciplínou. |
| DB + auth | **Supabase** (Postgres, Auth, RLS, Edge Functions, pg_cron) | Už to platíš. Auth klient: `@supabase/ssr`, tri-klientový vzor. |
| Auth metódy | e-mail + heslo a magic link. **Žiadny OAuth na starte.** | Google OAuth spustí Apple pravidlo 4.8 (povinné Sign in with Apple). Bez OAuth to pravidlo neplatí. Pridať oboje neskôr je konfiguračná zmena, nie architektonická. |
| iOS | **Expo (managed) + EAS** | Engine sa prenesie celý. Apple Developer Program 99 $/rok. |
| Grafy | **Recharts** (web) / **victory-native-xl** alebo Skia (RN) | Nikdy WebView graf v nativnej appke. Svetlú aj tmavú paletu navrhni **pred** zapojením dát. |
| Štýly | **Tailwind + shadcn/ui** (Radix) | Komponenty sa kopírujú do repa, nie sú závislosť, prístupné by default, ľahká téma cez CSS premenné. |
| Formuláre | **React Hook Form + Zod** | Zod je validačná hranica medzi netypovaným vstupom a striktným `ScenarioInput`. Validácia **nikdy** vnútri enginu. |
| i18n | **next-intl** | App-Router-native, typované kľúče. Dve plné locale: `cs-CZ` a `sk-SK`. |
| Server state | **TanStack Query** | Editovaný scenár je obyčajný React state — žiadny Redux/Zustand netreba. |
| Scheduler | **Supabase pg_cron**, nie Vercel Cron | Vercel Hobby cron je raz denne s ±59 min. nepresnosťou. pg_cron sedí vedľa dát. |
| Testy | **Vitest** + **fast-check** + **Playwright** | Golden-file snapshoty celých projekcií + property testy invariantov. |
| Chyby | **Sentry** (Developer free, 5k chýb/mes.) | Najlepšia integrácia pre Next.js aj RN. |
| Analytika | **PostHog, región EU (Frankfurt)**, free do 1 M eventov | Dátová rezidencia v EU je first-class a bez príplatku. Cookie lišta v CZ/SK treba aj tak. |
| E-maily | **Resend** (free 3 000/mes., strop 100/deň) | Pozor: Supabase vlastný SMTP posiela **2 e-maily za hodinu** — magic link je bez custom SMTP v produkcii nepoužiteľný. |
| Hosting DB pre preview | Samostatný Supabase branch/projekt | Nikdy nemieri preview deploy na produkčnú DB. |

### Rozloženie repozitára

```
/apps
  /web                  Next.js 16 (Vercel)
  /mobile               Expo/RN (fáza 6)
/packages
  /engine               simulate() + recommend() — čisté TS, nula závislostí
  /engine-fixtures      golden scenáre + fast-check generátory (len testy)
  /jurisdictions        CZ/SK parametre a leave regimes, verzované, s dátumami
  /db-types             `supabase gen types` + mappery DB ↔ engine
  /config               tsconfig, eslint
pnpm-workspace.yaml
turbo.json
```

**Nemenné pravidlo:** `packages/engine` nikdy neimportuje nič z `apps/*` ani z `db-types`. Závislosť ide vždy len jedným smerom. Toto je to, čo drží cenu prípadnej zmeny iOS technológie na „prepíš UI" namiesto „prepíš produkt".

### Verziovanie enginu

Najostrejšie korektnostné riziko celého systému: keď zmeníš zaokrúhľovanie amortizácie, každý uložený scenár po presimulovaní vráti iné čísla bez akéhokoľvek signálu používateľovi.

- `ENGINE_VERSION` konštanta exportovaná z paketu, uložená v každom scenári (`scenarios.engine_version`).
- Pri načítaní staršej verzie **nikdy ticho nepresimuluj**. Zobraz jednorazový banner „model sme vylepšili, prepočítať?" a nechaj to na používateľa.
- Verziu zvyšuj pri každej zmene formuly, defaultného predpokladu alebo hraníc hľadania odporúčaní. Nie pri refaktore. CI check, ktorý porovná diff v `packages/engine/src/**` proti bumpnutiu verzie.

---

## 4. Dátový model

Kľúčové rozhodnutia, nie celá DDL (tá je v `research/03-code-audit.md`, §5):

- **Tenancy:** `households` → `household_members` (FK na `auth.users`, rola owner/member) → `household_invitations`. Všetky RLS politiky visia na jednej helper funkcii `is_household_member(household_id)`.
- **Ľudia nie sú používatelia.** `people` je zoznam členov domácnosti v modeli (príjmy, vreckové, investičné sleeves) — nezávislý od toho, kto má účet. Domácnosť s jedným účtom môže modelovať dvoch dospelých.
- **Scenár ako diff, nie ako kópia.** `scenarios` drží iba `assumptions_patch jsonb` proti baseline domácnosti. Inak sa každé „čo ak dieťa v 2030" duplikuje celú domácnosť a porovnávanie sa stane nepoužiteľným.
- **`projection_runs` sa kľúčuje hashom vstupov + `engine_version`**, nie časom. Cachuj **iba súhrnné čísla** (dno rezervy a jeho mesiac, majetok na horizonte, počet pozastavených mesiacov DCA), nikdy celý mesačný rad — plné month-by-month JSONB je najpravdepodobnejšia príčina toho, že prvá stena bude veľkosť databázy namiesto MAU.
- **Strop na všetko:** veľkosť plánu (<100 kB), počet scenárov na domácnosť, počet autosave verzií. Vynútiť triggerom teraz, nie retrofitom o dva roky.

---

## 5. Jurisdikčné parametre — jadro lokálnej dôveryhodnosti

Súčasný engine má český model dávok zadrôtovaný v JS literáloch (`MAT_MONTHS = 7`, `350000`). **České a slovenské rodičovské dávky nie sú dva parametre toho istého modelu, sú to dva štrukturálne odlišné modely:**

- **ČR:** rodičovský příspěvek je **fixná celková suma**, ktorú si rodič rozvrhne sám v rámci mesačných limitov.
- **SR:** rodičovský príspevok je **fixná mesačná suma až do 3 rokov dieťaťa**.

Preto `packages/jurisdictions` musí exportovať **leave regime ako strategy objekt**, nie ako tabuľku čísel.

| Parameter | Česko | Slovensko | Zdroj / poznámka |
|---|---|---|---|
| Materská — dĺžka, 1 dieťa | **28 týždňov** | **34 týždňov** | ČSSZ; KROS 2026 |
| Materská — dĺžka, viacerčatá | 37 týždňov | 43 týždňov | ČSSZ; KROS 2026 |
| Materská — osamelá matka | — | 37 týždňov | KROS 2026 |
| Materská — výška | **70 %** redukovaného denného vymeriavacieho základu | **75 %** denného vymeriavacieho základu | ČSSZ; KROS 2026 |
| Rodičovská — model | **celková suma 350 000 Kč**, mesačný limit do 60 000 Kč (bez predchádzajúcej materskej 15 000 Kč) | **mesačne 500,10 €** s predchádzajúcou materskou / **364,80 €** bez nej, do 3 rokov | ⚠️ overiť priamo na MPSV / Sociálnej poisťovni |
| Indexácia 2026 | bez zmeny | **+3,7 %** k 1. 1. 2026 | agent 04 |
| Jasle bez straty dávky | 92 → **120 h/mes.** od 1. 1. 2026 | — | agent 04 |
| Hypotéka — limity | ČNB: LTV 80 % (90 % do 36 r.), DSTI 45 % (50 %), DTI 8,5× (9,5×) | NBS: DSTI 60 %, stress test +2 pb, bez explicitného LTV | agent 04 |
| Hypotéka — typická sadzba | ~4,4–4,6 % fix 3 r. | ~3,5 % | august 2026, mení sa denne |
| Sporiaci účet — top | ~4,25 % | ~2,0 % (domáce banky) | august 2026 |
| Daň z príjmu | 15 % / 23 % nad 1,76 mil. Kč | 19 % / 25 % / 35 % (konsolidácia 2026) | ⚠️ SK hranice neoverené |
| Cenné papiere — držba | **3 roky = plné osvobodenie**, strop 40 mil. zrušený 2026 | **1 rok = plné oslobodenie** | agent 04 |
| Dôchodkové | DIP 48 000 Kč/rok odpočet, III. pilíř štátny príspevok | II. pilier 5,75 % (2026) | agent 04 |

**Každý riadok tejto tabuľky patrí do verzovaného JSON-u s poľom `verifiedAt` a odkazom na zákon**, generuje sa z neho verejná stránka `/parametre`, a plán si ukladá, s ktorou verziou parametrov bol počítaný. Riadky označené ⚠️ treba pred spustením overiť z primárneho zdroja — dva sekundárne zdroje sa v sumách rodičovského príspevku rozchádzali o 10 centov, čo je samo o sebe dôkaz, že sekundárnym zdrojom veriť nemožno.

---

## 6. UI/UX

### 6.1 Onboarding je najväčšie riziko produktu

Súčasný prototyp hodí na používateľa ~25 číselných polí na jednej obrazovke. Dokumentovaný baseline vo fintechu je 68 % opustenie onboardingu a očakávanie dokončenia pod minútu.

**Riešenie: obrátený tok — najprv výsledok, potom presnosť.**

1. Používateľ pristane v **funkčnom prefilled scenári realistického českého/slovenského páru**, nie v prázdnom formulári. Graf a odporúčanie vidí okamžite, do 15 sekúnd, bez jediného kliku.
2. Potom **4 mini-kroky**: príjmy → hypotéka a výdavky → rezerva a investície → deti. Každý krok jedna obrazovka, jedna úloha, s možnosťou „odhadnem to teraz, spresním neskôr".
3. Defaulty z **národných priemerov podľa veku a typu domácnosti**, nie nuly. Prázdne pole je horší default než priemer.
4. Po každom kroku musí používateľ vidieť **dôsledok svojej odpovede** — to je jediná odmena, ktorá ho udrží.
   ⚠️ **Revidované vo fáze 2.5, rozhodnutie 1:** pôvodne tu stálo „graf sa prekresľuje po každom kroku".
   Graf ide zo steppera von — na mobile je pod tlačidlami a teda mimo obrazovky, rozdeľuje pozornosť práve
   tam, kde je nerozdelená pozornosť celý dizajn, a prepáli jediný zapamätateľný obrázok 25× predtým, než
   si ho používateľ zaslúži. Bod mal pravdu v potrebe a nie v nástroji: predpísal graf tam, kde potreboval
   dôsledok. Nahrádza ho consequence ribbon (§2.5.3) — verdikt, dno vetou a delta pripísaná tomuto kroku.

### 6.2 Ako urobiť projekciu čitateľnou pre normálneho človeka

- **Nikdy nezobrazuj hrubý Monte Carlo výstup.** Používatelia čítajú „85 % úspešnosť" ako „15 % šanca na katastrofu". ProjectionLab to musí vysvetľovať v dokumentácii — to je príznak zlého UI, nie hlúpych používateľov.
- Ak niekedy pridáš neistotu: **tri línie (pesimistická / základná / optimistická) so šrafovaným pásom**, alebo **quantile dotplot** (10–20 bodiek) — diskrétne jednotky sú pre laika čitateľnejšie než konfidenčné pásy.
- **Formuluj v konkrétnych dôsledkoch, nie v percentách:** „v 9 z 10 scenárov vám rezerva neklesne pod tri mesiace výdavkov".
- **Jeden kanonický graf** — línia rezervy s vyznačeným dnom, investície za ňou, a dno **vypísané vetou v slovách pod grafom**. Jeden zapamätateľný obrázok prekoná dashboard. Toto je zároveň to, čo si ľudia screenshotujú do skupinových četov, čiže tvoj rastový kanál.

### 6.3 Dizajn a prístupnosť

- Hierarchia: jedna veľká primárna metrika navrchu (36–48 px), karty pre súvisiace skupiny, veľa bieleho priestoru. Nie tabuľka ako v Exceli.
- Paleta 5–6 farieb. **Nikdy nerozlišuj dobré a zlé len farbou** — 8 % mužov má červeno-zelenú poruchu. Vždy farba + ikona + text.
- Kontrast min. 4,5:1 pre text, 7:1 pre kritické čísla. Tmavý režim definuj ako override tokenov, nie ako druhý dizajn.
- Mobil: karty pod seba, dlhé časové rady skrolujú **vnútri ohraničeného kontejnera**, telo stránky nikdy horizontálne.
- Grafy: klávesová navigácia, textová alternatíva k tooltipu (dnes sú tooltipy len pre myš), `prefers-reduced-motion`.
- **Formátovanie čísel je test dôveryhodnosti.** `128 652 Kč` s úzkou nezlomiteľnou medzerou, nie `128,652 CZK`. Nič neprezradí cudzí nástroj rýchlejšie.

### 6.4 Dôvera — čo musí landing page dokázať za 10 sekúnd

Jedna obrazovka, žiadne „prevezmite kontrolu nad svojimi financiami":

1. Graf, **už naplnený dátami**, s vyznačeným dnom rezervy a vetou pod ním.
2. Oprava hneď pod tým, s prepínačom „ukáž mi presimulovanie".
3. Jedno tlačidlo: **„Vyskúšať — bez registrácie"**, ktoré vedie do funkčného scenára.
4. **„Vaše dáta zostávajú vo vašom prehliadači"** — nad zlomom.
5. „Zadarmo navždy. Žiadne reklamy. Žiadne affiliate odkazy."
6. Odkaz na zdrojový kód a na `/parametre`.

Žiadne referencie, ktoré nemáš. Žiadne logá. **Tvoje skutočné meno, tvár a Praha** — anonymita je tu presný opak dôveryhodnosti a celý zmysel je portfólio.

---

## 7. Katalóg notifikácií

Používateľ dostane denne ~46 notifikácií zo všetkých appiek. Finančná appka, ktorá je hlučná, sa maže. **Maximálne 3–4 typy, všetky vypínateľné jednotlivo.**

| Notifikácia | Kedy | Prečo práve táto |
|---|---|---|
| **Zmena zákona posunula tvoje dno** | Keď sa zmení jurisdikčný parameter a prepočet posunie dno rezervy | Toto **nikto iný poslať nemôže** a je to skutočne užitočné. Priamy dôsledok disciplíny `/parametre`. Toto je vlajková notifikácia produktu. |
| **Mesačná kontrola** | 1× mesačne, používateľom zvolený deň | Planner nie je denný nástroj. Mesačný rytmus je jeho prirodzená frekvencia. |
| **Prekročenie prahu v projekcii** | Keď sa po úprave scenára objaví nový problém | Reaktívne na akciu používateľa, nie náhodné. |
| **Predpoklady zostarli** | Plán starší ako 12 mesiacov | Chráni používateľa aj teba pred „vaša appka sa mýlila". |

**Technicky:** `pg_cron` → Edge Function → tabuľka `notification_log` s `unique (user_id, notification_key, channel)` a `insert … on conflict do nothing`. **Kľúč sa deriuje z toho, čo sa stalo, nie z toho, kedy job bežal** — teda `reserve-breach:2032-01`, nie timestamp. Inak pri manuálnom re-triggeri po bugfixe pošleš všetko druhýkrát.

**Obsah payloadu nesmie obsahovať sumy.** Apple 4.5.4 zakazuje citlivé údaje v notifikácii — a „Skontroluj si plán" je aj tak správny dizajn pre lock screen než „Rezerva klesla na 12 000 Kč".

**Doručovanie:** iOS = Expo Push (nie raw APNs). Web = Web Push + VAPID. Mŕtvy token po 410 **zmaž**, neretrayuj.

---

## 8. Fázy a checklisty

Odhady sú v človeko-týždňoch pri práci po večeroch popri zamestnaní.

### Fáza 0 — Rozhodnutia a základy (1–2 týždne)

Cieľom nie je kód, ale odstránenie vecí, ktoré sa nedajú opraviť neskôr.

- [ ] **Skontrolovať pracovnú zmluvu** na klauzuly o IP a side projektoch pred publikovaním pod vlastným menom
- [ ] Hodina s českým právnikom na hranicu investičného poradenstva (zák. 256/2004) a poradenstva o spotrebiteľskom úvere (zák. 257/2016) pre neperzonalizovaný parametrický nástroj — odpoveď sa stane textom na landing page
- [ ] Overiť z primárnych zdrojov riadky ⚠️ z §5 (MPSV, Sociálna poisťovňa, ČSSZ, ČNB, NBS) a zapísať zdroj vrátane URL a dátumu
- [ ] Zaregistrovať domenu (jednoslovnú, `.cz` aj `.sk` ak sú voľné)
- [ ] Založiť monorepo podľa §3, `pnpm` + `turbo`, tsconfig, eslint, prettier
- [ ] GitHub repo **verejné od začiatku** s licenciou bez záruky — je to zároveň dôkaz dôveryhodnosti aj portfólio
- [ ] Rozhodnúť názov produktu a skontrolovať kolízie v CZ/SK obchodnom registri a na App Store
- [ ] Overiť oprávnenosť na Vercel/Supabase open-source sponzoring
- [ ] Prečítať `research/01`–`05` celé, nie len tento súhrn

### Fáza 1 — Engine: extrakcia, oprava, generalizácia (3–4 týždne)

Toto je najhodnotnejšia práca v celom projekte a musí byť hotová pred akýmkoľvek UI.

**Extrakcia**
- [ ] `packages/engine`: `simulate(input: ScenarioInput): ProjectionResult`, `recommend(input, problem): RecommendationResult`
- [ ] Nula runtime závislostí. Žiadny Zod, žiadna dátumová knižnica, žiadny lodash
- [ ] Žiadny `Math.random()`, žiadna mutácia `Date`, plná determinovanosť
- [ ] `ENGINE_VERSION` konštanta + CI check na jej bumpnutie pri zmene formuly
- [ ] `packages/jurisdictions`: leave regime ako strategy objekt (CZ = fixný celkový balík, SK = fixná mesačná dávka do 3 rokov), verzovaný, s `verifiedAt`

**Opravy nájdených bugov** (evidencia s číslami riadkov v `research/03-code-audit.md`, §8)
- [ ] Tooltip grafu majetku clampuje negatívnu rezervu na nulu (`Math.max(0, d.reserve)`, riadok 1005) — headline súčet vyzerá zdravšie než realita **presne v deficite, ktorý má engine detekovať**. Najzávažnejší bug v kóde
- [ ] Prekrývajúce sa okná materskej/rodičovskej dvoch detí sa **prepisujú namiesto skladania**
- [ ] Hlavička tvrdí „stav august 2026", simulácia začína septembrom (`START_MONTH = 8`)
- [ ] Hranice `horizon` sa rozchádzajú medzi JS clampom (2028) a HTML `min` (2030)
- [ ] `items[]` sa podľa UI textu neukládá, ale `collectState()` ho serializuje
- [ ] Osobné investičné príspevky sa **neodpočítavajú od vreckového ani od cash flow** — používateľ môže zadať príspevky nad celé vreckové a model ich pokojne zhodnocuje
- [ ] `withChildren` parameter je na oboch call-site vždy `true` — mŕtvy kód
- [ ] `childYear` mimo rozsahu **ticho vypustí dieťa z celého modelu bez varovania**
- [ ] Text „Fixácia do januára 2029" sa zobrazuje aj pri nulovej hypotéke

**Generalizácia** (plná tabuľka 19 položiek v `research/03-code-audit.md`, §4)
- [ ] Dvaja pomenovaní dospelí → zoznam členov domácnosti s N príjmami a N investičnými sleeves
- [ ] Fixný štart Sep 2026 → derivované z dneška alebo z dátumu vytvorenia domácnosti
- [ ] Kč a `sk-SK` zadrôtované v `fmt()` → currency a locale per domácnosť, cez `Intl.NumberFormat`
- [ ] Dve deti, obe narodené v júli → zoznam životných udalostí s vlastným mesiacom a rokom
- [ ] Dve pomenované banky s fixnými rolami → generický zoznam účtov s rolou a tokmi
- [ ] Jeden `growth` pre príjmy aj výdavky → oddelená inflácia (CPI) a rast platov
- [ ] Konštantná sadzba hypotéky → **udalosť refixácie** (dominantné riziko dekády pre reálny pár)
- [ ] 264 mesiacov nákladov na dieťa → konfigurovateľné, s postupným doznievaním namiesto skoku
- [ ] Odporúčanie č. 5 menuje konkrétne banky a sadzby v kóde → obsah z dát, a **nikdy neporovnávať produkty** (regulačná hranica)
- [ ] `childOn` default zapnuté → vypnuté, kým to používateľ nezvolí

**Testy**
- [ ] 10–20 golden-file scenárov (pár s hypotékou; bezdetný pár; domácnosť v polovici rodičovskej; prekročený strop rezervy; nulový príjem) so snapshotom celého mesačného radu, ručne písaným JSON-om, aby bol diff v PR čitateľný
- [ ] `fast-check` property testy: binárne hľadanie vždy konverguje alebo explicitne vráti „bez riešenia"; zmena jedného vstupu nikdy nezmení mesiace pred jej účinnosťou (test kauzality); amortizácia dobehne na nulu
- [ ] CI gate: PR meniaci `packages/engine` bez zelených testov sa nedá zlúčiť

### Fáza 2 — Webová appka v1, verejná, bez účtu (5–6 týždňov)

- [ ] Next.js app, `[locale]` segment, `next-intl`, plné `cs-CZ` a `sk-SK` (dva locale, nie jeden kompromis)
- [ ] Design tokens: svetlá paleta na `:root`, tmavá ako override, kontrasty overené
- [ ] Landing page podľa §6.4 — graf naplnený dátami nad zlomom
- [ ] **Onboarding: prefilled scenár + 4 mini-kroky** s národnými priemermi ako defaulty
- [ ] Editor scenára — engine beží na klientovi, **prepočet pod 100 ms na každý stisk klávesy**
- [ ] Kanonický graf: rezerva s vyznačeným dnom + veta v slovách
- [ ] Karty odporúčaní s tlačidlom „Použiť" a **viditeľným presimulovaním ako dôkazom**
- [ ] Porovnanie scenárov side-by-side (baseline vs dieťa 2028 vs dieťa 2030)
- [ ] Panel citlivosti: ±1 pb výnos, ±1 pb refix, ±2 pb inflácia, výpadok jedného príjmu
- [ ] Obálky, vreckové, osobné investičné sleeves, sweep nad stropom rezervy
- [ ] `localStorage` + export/import JSON + zdieľateľný read-only link
- [ ] Export grafu a odporúčaní do PNG/PDF (rastový kanál)
- [ ] **`/parametre`** generované z `packages/jurisdictions`, s citáciami a dátumami
- [ ] **`/metodika`** — ukáž skutočnú rekurziu, binárne hľadanie a verifikačný krok
- [ ] Každé odporúčanie nesie svoje predpoklady **inline**, nie v poznámke pod čiarou
- [ ] „Počítané podľa právneho stavu k …" viditeľne v UI
- [ ] Disclaimer v prostej češtine a slovenčine — jeden čestný odsek, nie zbabelá stena textu
- [ ] Zásady ochrany osobných údajov, cookie lišta (ePrivacy platí aj pri EU hostingu)
- [ ] PWA: manifest, service worker, inštalovateľné, funkčné offline
- [ ] Prístupnosť: klávesnica, kontrasty, textové alternatívy k tooltipom, `prefers-reduced-motion`
- [ ] Sentry, PostHog (región EU), Playwright e2e na kritickú cestu
- [ ] Lighthouse: načítanie pod sekundu, čitateľné na päť rokov starom Androide

### Fáza 2.5 — Refaktor UI/UX a rozšírenie modelu domácnosti (4–5 týždňov)

> Vznikla z revízie nasadenej appky (24. 8. 2026, 9 pripomienok k UI/UX) a z troch paralelných
> agentov: audit enginu a typov s meraniami na reálnom kóde, informačná architektúra a wizard,
> vizuálny dizajnový systém. **Táto fáza ide pred fázu 3, nie za ňu.**

#### 2.5.0 Prečo to musí byť pred launchom

Fáza 3 je jednorazová: Reddit, Modrý koník, podcasty a Show HN sa dajú spáliť len raz. Návštevník,
ktorý dnes príde, dostane appku, ktorá **predpokladá pár** (jednotlivec nemá kde začať),
**predpokladá hypotéku** (nájomník nemá čo vyplniť), **nevie o veku** a **pýta sa na deti tak, že to
vyzerá povinne**. To nie sú kozmetické chyby, to sú štyri celé segmenty publika, ktoré appka odmieta
obslúžiť — a práve tie segmenty sú v komunitách, kde sa má launch odohrať. K tomu tri veci, ktoré
priamo podkopávajú dôveryhodnosť: tlačidlá bez `:active`, `:disabled` a s focus ringom, ktorý mení
tvar prvku; svetlé primárne tlačidlo s kontrastom **4,42:1** (WCAG 1.4.3 padá) na landing page CTA;
a šesť dotykových cieľov vysokých 32 px na mobile.

#### 2.5.1 Mapovanie deviatich pripomienok na prácu

| # | Pripomienka | Kde sa rieši | Vyžaduje zmenu modelu |
|---|---|---|---|
| 1 | `<h1>` má byť animácia / rotujúce slogany | 2.5.4 · `RotatingHeadline.tsx` | nie |
| 2 | Horná navigácia je fádna, tlačidlá nedokončené | 2.5.4 · `SiteNav.tsx`, `.btn` systém | nie |
| 3 | „Môj plán" predpokladá dvoch ľudí | 2.5.2 (C2) + 2.5.5 krok 1 | áno (app, nie engine) |
| 4 | Chýba vek osoby/osôb | 2.5.2 (C1) | áno — `Person.birthYear` |
| 5 | Graf vo wizarde rozptyľuje | 2.5.5 · consequence ribbon | nie |
| 6 | Hypotéka vs nájom + ostatné dlhy s úrokmi | 2.5.2 (C3, C4) | áno — `housing`, `liabilities` |
| 7 | Deti pôsobia povinne | 2.5.2 (C5) + 2.5.5 krok 7 | áno — `childrenIntent` |
| 8 | Podtituly „Môj plánu" zvýrazniť a zbaliť | 2.5.7 · disclosure-per-card | nie |
| 9 | Nastavovanie hodnôt je zmätočné a rozbité | 2.5.6 · jedno pole, všade | nie |

#### 2.5.2 Model: päť nových schopností

Meranie na reálnom kóde (nie odhad): `simulate()` 0,9 ms, `encodeScenario(demoScenario('CZ'))` =
**682 znakov** z 1 199 B JSON-u pri teste `< 1400` — všetkých päť schopností dohromady pridá do
JSON-u pod 200 B, takže zdieľací link zostáva v limite.

**C1 · Vek.** `Person.birthYear?: number`, **nie `ageYears`** — vek uložený v `localStorage` je
o rok neskôr nesprávny, a práve retirement horizon (slogan o dôchodku) je to, čo zastaraný vek
pokazí. Zostáva **optional**: povinné pole s migráciou „doplň `start.year - 35`" by znamenalo, že
engine si vymyslí demografický fakt, čo je proti pravidlu č. 3. Čítanie iba cez
`ageAt(birthYear, ym): number | null` v `time.ts`. **Vek nesmie v tejto fáze nič počítať** — žiadne
zastavenie príjmu v dôchodku; to je samostatná schopnosť (nahradzovací pomer, DIP / III. pilier),
ktorá by pohla každým golden číslom. Bonus: `ltvMaxPctUnder36` a `dstiMaxPctUnder36` v `cz.ts` sú
dnes **mŕtve dáta** — nič v repozitári nevie o veku, takže limit pre mladších sa nikdy nedá vybrať.
Vek ich oživuje.

**C2 · Jednočlenná domácnosť.** `types.ts` **bez zmeny** — `people: Person[]` už dĺžku 1 pripúšťa,
predpoklad páru žije celý v appke. Zmerané: `people.slice(0,1)` z existujúcej fixture dá
`minReserve −24 214 829`, `pausedMonths 398` a `recommend()` vráti **nula opráv** → UI zobrazí
„žiadne riešenie". Jednotlivec preto potrebuje **vlastný baseline**, nie polovicu párového.
Škálovanie defaultov podľa OECD-modified equivalence scale (pár = 1,5 dospelého ekvivalentu),
s vyrovnaním fixných nákladov na bývanie: potraviny ×0,62, energie ×0,75, poistenie ×0,70, ostatné
×0,70, hypotéka a splátka ×0,70, nájom ×0,72, rezerva a sweep cap ×0,67, DCA ×0,60, príjem ×1,00.
Tieto koeficienty sú **odhad a musia mať `verifiedAt` a riadok na `/parametre`** ako každá iná
konštanta. Aktivuje sa aj `LeavePlan.singleParent`, ktorý dnes **nikde v repozitári nikto nenastavuje**
(mení SK materskú z 34 na 37 týždňov).

**C3 · Bývanie ako voľba.** Diskriminovaná unia, nie nullable pár polí:

```ts
export type Housing =
  | { kind: 'own';  mortgages: Mortgage[] }
  | { kind: 'rent'; rent: Rent };
```

Dôvod pre uniu: požiadavka je *voľba*, a `rent?: Rent` vedľa `mortgages` pripúšťa nekoherentný stav
(hypotéka aj nájom naraz), ktorý má celá schopnosť vylúčiť. `ScenarioInput.mortgages` zostáva **jedno
vydanie ako zrkadlo** (číta ho `variants.ts`, `Sensitivity.tsx`, `PlannerClient.tsx` a
`properties.test.ts`) a maže sa až v ďalšom.

Nájom ide **do bloku výdavkov, nie do 3. kroku a nie ako 8. krok**. `/metodika` vykresľuje
`[1..7]` z oboch katalógov, takže 8. krok je zmena dokumentácie v dvoch jazykoch pre aritmetiku, ktorá
je definične výdavok. Konkrétne: `fixedExpenses += monthlyAmount * growthFactor(annualIndexationPct, t)`
— **vlastný eskalátor, nie `cpiFactor`**, inak je pole na indexáciu dekoratívne. Tým nájom
automaticky vstúpi do `fixedMonthlyOutgoings` aj do `floorThisMonth` **bez jedinej ďalšej úpravy**,
čo je najsilnejší argument pre túto pozíciu, a je pred throttlom (5. krok) — domácnosť nepreskočí
nájom, aby stihla trvalý príkaz do ETF. Nájom **nemôže vstúpiť do `netWorth`** ani omylom:
`netWorth = reserve + joint + personal − mortgageBalance`, nájom nevytvára ani aktívum ani pasívum.
Očakávaný dôsledok: `reserve-below-floor` bude nájomníkom vychádzať častejšie. **To je správne** a
nesmie sa to „opraviť" vylúčením nájmu z podlahy.

**C4 · Ostatné dlhy.** `Liability { id, label, kind, balance, annualRatePct, monthlyPayment,
remainingTermMonths, revolving }`, `ScenarioInput.liabilities: Liability[]`. Amortizácia je **rozšírenie
3. kroku** (rovnaká aritmetika ako hypotéka, len bez refixácie), splátka ide do `spending`
**pred throttlom** a **musí vstúpiť do `fixedMonthlyOutgoings` aj `floorThisMonth`**. Zmerané, prečo:
pri splátke 8 000 Kč/mes. zostala podlaha na 166 500 namiesto 190 500, teda model by domácnosti
s autoúverom odporučil rezervu o 24 000 Kč menšiu. A `netWorth` musí odčítať `liabilityBalance` —
inak sa reprodukuje presne ten bug, kvôli ktorému bol engine vytiahnutý („headline číslo prestalo
protirečiť tabuľke"). Žiadny CPI: splátka je nominálna a zmluvná.

**C5 · Zámer mať deti.** `childrenIntent: 'yes' | 'no' | 'undecided'` — trojstav, pretože
„neodpovedal" nie je „nie". `simulate()` sa **nesmie zmeniť ani o číslo** a test to má tvrdiť
(rovnaká disciplína ako pri obálkach). Skutočný blast radius je v `variants.ts`:
`comparisonVariants` dnes **vždy vymyslí dieťa**, keď žiadne nie je — pri `'no'` je porovnávací panel
tri stĺpce o dieťati, ktoré si používateľ práve odmietol, s tlačidlom „použiť". Preto **C5 sa nedá
dokončiť bez C3 alebo C4**: bezdetná domácnosť potrebuje náhradnú dvojicu variantov (nájom vs
vlastné, šok z refixácie / dlhu).

**Migrácia — jediné miesto s tvrdým poradím.** Nový `apps/web/src/lib/migrate.ts` s `upgradePlan()`,
volaný **zvnútra `withRegime()`**, aby to nemohlo zabudnúť žiadne z troch (dnes štyroch) miest, ktoré
hydratujú cudzí scenár. Musí byť **idempotentný** (`PlannerClient` ho volá dvakrát) a nesmie nikdy
hodiť výnimku. Defaulty: `housing ?? { kind:'own', mortgages: raw.mortgages ?? [] }` (starý plán
s hypotékou znamená „vlastní"; default `rent` by ticho zmazal hypotéku), `liabilities: []`,
`childrenIntent: children.length ? 'yes' : 'undecided'` (nikdy `'no'` — používateľ neodpovedal),
`birthYear` **zostáva `undefined`** a UI ukáže „vek nezadaný", nie vymyslené číslo. `savePlan`
pridáva `schemaVersion` vedľa `engineVersion`. **`upgradePlan` musí byť nasadený s alebo pred
akýmkoľvek kódom, ktorý číta `housing`** — server neexistuje, takže koordinovaný rollout neexistuje:
stará bundle zo service workera nad novým `localStorage` je reálny stav.

**Verzia a goldeny.** Guard sleduje iba `simulate.ts`, `problems.ts`, `recommend.ts`, `time.ts`,
`cz.ts`, `sk.ts` — **nie `types.ts`**. Aritmetiku menia iba C3 a C4, preto:
**`ENGINE_VERSION` 3 → 4 presne raz, pre C3 a C4 spolu.** Dva bumpy za dva týždne znamenajú dva
bannery „plán bol počítaný inou verziou" bez úžitku. Nový `Lever` je zmena vyhľadávacieho priestoru,
teda patrí do toho istého bumpu. Zmena `problems.ts` bez zmeny čísla = `--accept` + poznámka v PR.
**Očakávaný diff v goldenoch: sedem súborov, v každom jediný riadok `engineVersion`** — každé iné
zmenené číslo znamená, že nová cesta presakuje do starej.

#### 2.5.3 Rozhodnutia tohto refaktoru

1. **Graf zo steppera ide von — §6.1 bod 4 sa týmto opravuje.** Graf kupoval štyri reálne veci:
   živosť, dôveryhodnosť modelu, okamžitú odmenu a drámu na poslednom kroku. Ale: rozdeľuje pozornosť
   práve tam, kde je nerozdelená pozornosť celý dizajn; na mobile je `NARROW` layout 300 jednotiek
   vysoký **pod poliami aj tlačidlami**, teda mimo obrazovky na každom kroku; učí nesprávne čítanie
   (deterministický model, ktorého krivka trhá pri každej číslici — vrátane stavu, kde vymazané pole
   commitne `0` a projekcia na okamih ukáže katastrofu); **prepáli jediný zapamätateľný obrázok
   25× predtým, než si ho používateľ zaslúži** (§6.2 hovorí, že práve ten obrázok je rastový kanál);
   a je sebavedomý skôr než vstupy — na 1. kroku je 90 % krivky národný priemer. Pôvodný bod 4 mal
   pravdu v *potrebe* a nie v *nástroji*: predpísal graf tam, kde potreboval dôsledok. §6.2 toho
   istého dokumentu už pomenúva lepší nástroj — **dno vypísané vetou v slovách**.
2. **Náhrada: „consequence ribbon"** — tri sloty medzi telom kroku a tlačidlami, dva riadky, žiadne
   SVG, nad zlomom aj na 360 px telefóne. (a) verdikt ako čip *farba + glyf + slovo* plus dno vetou;
   (b) **delta pripísaná tomuto kroku** — `Tento krok: dno o 128 000 Kč níž`, čo je skutočné zlepšenie
   proti grafu: graf ukazoval *stav* a nechal používateľa hádať, ktorá odpoveď ním pohla;
   (c) **poctivý merač úplnosti** `Vaše čísla: 6 ze 14 · zbytek je národní průměr`. Cena: jeden
   `simulate()` navyše pri mount-e kroku (0,9 ms), namiesto prekreslenia 5 kB SVG cesty na stisk.
   `role="status" aria-live="polite"`, ale **živý región sa zapisuje len pri commite kroku, nikdy pri
   každej číslici**. Terminálna odmena zostáva: graf sa na plánovej stránke nakreslí **raz**
   (400 ms, callout dna naposledy, vypnuté pri `prefers-reduced-motion`) plus rekapitulácia troch
   najväčších delt z wizardu, každá pomenovaná svojím krokom.
3. **„Zbaliteľné taby" = disclosure-per-card, nie taby a nie akordeón.** Taby zobrazia práve jeden
   panel, sekcie tu nie sú rovnocenné (nálezy sa musia čítať pred porovnaním) a tab bar zabije dve
   veci, na ktoré táto stránka je: `Ctrl+F` cez celý plán a tlač/PNG celého plánu; šesť čipov sa na
   telefóne navyše skroluje horizontálne, čo §6.3 pre telo stránky zakazuje. Akordeón s jednou otvorenou
   sekciou vynúti „čítaj A *namiesto* B" a zavrie sekciu, v ktorej si práve použil opravu.
   Disclosure per karta je jediná z troch možností, kde má „rozbaliť všetko" zmysel. Tab-like
   navigáciu dostane cez **sticky section rail** pod hlavičkou: čipy, ktoré doskrolujú a otvoria sekciu.
4. **Krajina prestáva byť prvá otázka wizardu.** Odvodí sa z locale (`cs → CZ`, `sk → SK`) a v hlavičke
   wizardu je `Česko · změnit`. Dnešné `setJurisdiction` volá `defaultScenario(code, startMonth)` a
   **zahodí všetko, čo používateľ napísal** — strata dát za prvým ovládacím prvkom produktu. Po
   refaktore sa pri zmene krajiny prepíšu iba polia s `provenance === 'default'`, nič sa nekonvertuje
   a povie sa to.
5. **Žiadna lever na nájom vo v1.** `recommend()` radí podľa `relativeChange`, takže 10 % zníženie
   nájmu by sa zoradilo **nad** 40 % zníženie DCA a „presťahujte sa" by sa prezentovalo ako *najmenej
   drastická* možnosť. To je chyba v radení preoblečená za leveru. Rieši sa až váhou narušenia
   v kontrakte odporúčaní.
6. **`type="number"` sa v celom produkte ruší.** Mutuje hodnotu pri scrolle nad zaostreným poľom —
   na dlhej editačnej stránke to ticho prepisuje plán. Parsovanie prevezmeme: `money()` formátuje
   s U+00A0, takže **dnes sa výstup produktu nedá vložiť spätne do jeho vlastného vstupu** (`39 000 Kč`
   → `NaN` → ticho nič), a `39,5` s desatinnou čiarkou tiež nie. Pole odmieta svoj vlastný locale.
7. **Tailwind: rozhodnúť, nie odložiť.** Je nainštalovaný, je build dependency a produkuje **nula
   utilít** (v kóde nie je ani jedna Tailwind trieda). Voľba: (a) prihlásiť sa k nemu cez
   `@theme inline` s mapovaním na existujúce custom properties a migrovať inline štýly na utility —
   **odporúčané, je už zaplatený**; (b) odstrániť ho a doplniť ~15 riadkov preflightu.
   „Nainštalovaný a nepoužívaný" je jediná možnosť bez obhajoby.

#### 2.5.4 Dizajnový systém

Stav zistený čítaním, nie odhadom: **11 ručných tried** (`muted` ×35, `btn` ×20, `card` ×15,
`tabular` ×10, `field` ×6 …), **220 miest s `style={{`** v 18 súboroch, **19 tokenov**,
`grep boxShadow` → **nula výskytov v celom produkte**, 13 rôznych `fontSize`, 12 rôznych medzier,
4 nezosúladené radiusy. „Nedokončené" je presne toto: chýbajúca elevácia a nekonzistentná geometria.

**Rotujúci headline.** Vertikálny roll nad grid-stackovanou schránkou: všetky slogany v jednej
grid celle (`grid-area: 1/1`), takže **výšku najvyššieho slogana nikdy nepočítame** — riešia ju
browser layoutom nad server-renderovaným HTML, zdarma pri resize, zoome aj zmene locale. Žiadny
`ResizeObserver`, žiadna uložená výška, ktorá môže zostarnúť. `<h1>` obsahuje **jediný neskrytý
textový node** (`visually-hidden` prvý slogan), vizuálny stack je `aria-hidden` — čítač obrazovky
prečíta jednu otázku a rotáciu nikdy nepočuje; žiadne `aria-live`, žiadne `aria-label`. Prvý slogan
je literál `0` na serveri aj klientovi (žiadny `Math.random`, žiadny `Date.now`), takže hydratácia
je byte-identická. Pauza pri hover/focus/`visibilitychange`, statický pri `prefers-reduced-motion`.
Animácia iba `transform` + `opacity`, bez `overflow: hidden` (klip by odrezal `ý`, `ž`, `j`).
**Pozor pre e2e:** `textContent` h1 teraz obsahuje všetkých šesť reťazcov, takže assertion musí
zostať `toContainText`, nikdy `toHaveText`, a slogan č. 1 musí zostať na indexe 0.

```
cs: Kdy si můžeme dovolit dítě? · Utáhneme hypotéku po refixaci? · Investuju si dost na penzi?
    Přežije rozpočet jeden příjem? · Kdy nám rezerva klesne na dno? · Nájem, nebo vlastní byt?
sk: Kedy si môžeme dovoliť dieťa? · Utiahneme hypotéku po refixácii? · Investujem si dosť na dôchodok?
    Prežije rozpočet jeden príjem? · Kedy nám rezerva klesne na dno? · Nájom, alebo vlastný byt?
```

Všetkých šesť je **druhého rádu** — nedajú sa odpovedať číslom, ktoré už poznáš, iba simuláciou
vlastnej domácnosti mesiac po mesiaci. Všetky ≤ 32 znakov (≤ 2 riadky na 360 px). Slogan č. 3 je
zámerne v **prvej osobe jednotného čísla** v oboch jazykoch, kým ostatné sú množné: dôchodok je
individuálny, rozpočet spoločný. Neopravovať na množné „pre konzistenciu".

**Navigácia.** Dnes: jeden `flex` riadok, päť nerozlíšených odkazov vo `--accent` modrej, žiadny
aktívny stav, žiadny divider, žiadne CTA — nie je čo čítať, takže oko nemá čo robiť. Plus štyri
chyby: `flexWrap: 'wrap'` + `position: sticky` znamená, že na úzkom viewporte hlavička ticho narastie
na 116–174 px a preskrolí každý in-page anchor; prepínač jazyka vedie **vždy na `/`**, takže čitateľ
`/cs/metodika` skončí na slovenskej domovskej stránke; žiadna indikácia aktuálnej stránky; žiadny
skip link pred sticky hlavičkou. Nové: tri tiery v jednom 64 px pruhu — identita (značka + inline SVG
krivka rezervy, ktorá klesne a zotaví sa), tri destinácie (`/plan`, `/parametre`, `/metodika`) vo
`--ink-secondary` a **nie v accent modrej** (nav odkazy sú nábytok, nie obsah — a práve modrá je
veľká časť dôvodu, prečo pruh čítame ako jednolitý pás), a po 1px divideri utility: segmentový
prepínač `CS | SK` mieriaci na `usePathname()`, ikonové prepnutie témy, primárne CTA. **`/zasady` ide
z navigácie do footera** — je to právny dokument, nie destinácia, a zaberal pätinu vizuálneho budgetu
pruhu; táto jediná zmena prispieva k „vyzerá navrhnuto" najviac. CTA sa **potláča na landing page**
(hero CTA je 60 px pod ním; dva identické primary buttony v jednom viewporte sú klasický príznak
nedokončenej navigácie) a na `/plan`. **Žiadny hamburger, a je to obhájené:** tri destinácie a tri
utility za focus trap, `aria-expanded`, `inert`, scroll lock, outside-click, Escape, animáciu za
`prefers-reduced-motion` a auto-close pri zmene route = ~130 riadkov a sedem nových režimov zlyhania
za skrytie troch slov. Namiesto toho dva riadky a **na mobile statická hlavička** (dva riadky = 102 px
= 16 % 640 px viewportu na stránke, ktorej celá hodnota je 300 px graf). Aktívna route má **tri
signály, ani jeden farbu**: `aria-current="page"`, 2px spodná lišta (zmena *tvaru*) a váha 500 → 650
s rezervovanou šírkou cez skrytý bold `::after` klon, aby promócia odkazu nepohla susedmi.

**Tlačidlá.** Dnešný `.btn` nemá kontrakt na výšku (~45 px emergentne z font metrík), a každé
kompaktné miesto ho prepisuje inline `padding: '5px 10px', fontSize: 13` (~32 px) — **skopírované
v piatich súboroch, v šiestej variante `'5px 12px'`**. Nekonzistentná výška ovládacích prvkov je
najhlasnejší „nedokončený" signál v akomkoľvek UI. Ďalej: žiadny `:active` (tlačidlo, ktoré
nereaguje na stlačenie, je obrázok tlačidla), žiadny `:disabled`, focus ring dedený z globálneho `*`
pravidla, ktoré nastavuje `border-radius: 4px` **na prvok** — takže každé tlačidlo pri zaostrení
**zmení tvar** z 8 px na 4 px — a ringuje sa v `--accent`, teda v tej istej farbe, akú má primárne
tlačidlo ako výplň. Sekundárne tlačidlo je v svetlom režime `#ffffff` na `#fcfcfb` = **1,03:1** výplne
s hairline `1,4:1` — vizuálne zakázaný input, nie tlačidlo. Hover hýbe len 1px borderom, na primary
je to `filter: brightness(1.08)`, čo sa nedá vyjadriť tokenom ani odmerať na kontrast. Nový systém:
**4 varianty** (primary / secondary / ghost / danger), **3 veľkosti** (34 / 40 / 48 px) plus
`.btn-icon`, pod `@media (pointer: coarse)` **všetky s podlahou 44 px** — jedno pravidlo, ktoré naraz
opraví všetkých šesť dnešných 32 px cieľov. **7 stavov** na variantu vrátane `loading`
(`data-loading` + `aria-busy` + `disabled`, spinner v rezervovanom ikonovom slote, aby label neposkočil —
dnes sú `handleShare`, `handleExport`, `handleImportFile` aj `downloadChartPng` async a tlačidlo je
medzitým inertné a mlčí). Prepočítané kontrasty (nie odhad): primary label 6,29 svetlo / 6,65 tmavo;
výplň vs stránka 5,96 / 6,89; **focus ring dvojpásový** (`--ring-inset` vyplní offset gap,
`--ring` je vonku), minimum v celej matici **6,29:1** proti požadovaným 3:1, na `danger` sa ring
prepne na `--danger-ring`, aby „zaostrené" nečítalo ako „modré, teda neškodné".

**Tokeny.** 17 existujúcich zostáva verbatim; `--ink-muted` sa **mení** (`#898781` = 3,50:1 na
`--surface`, používa sa pre 12px hinty — živá chyba 1.4.3) na `#6e6c66` / `#9a9892`. `--accent`
si necháva hodnotu, ale **prestáva byť výplň tlačidla** (biela na ňom = 4,42:1) a zostáva farbou
odkazov a série. Nové skupiny: akčná farba (`--accent-strong*`, `--danger*`), povrchy ovládacích
prvkov (`--control-*`, s `--control-border` na `rgba(11,11,11,0.5)` namiesto `--border-strong`
0,18, ktorý splošťuje na 1,4:1), focus (`--ring`, `--ring-inset`, `--ring-w`, `--ring-gap`),
**stavové farby ako text** so 7:1 (`--status-*-text` — dnešné `--status-*` sú výplne pre graf
a niektoré ako text padajú: `#fab219` = 1,79:1, a `StatTile` ich renderuje ako 22px čísla),
navigácia, **elevácia** (`--shadow-1..3`, `--shadow-press`, `--shadow-hi` — 1px horný highlight je
najlacnejší „dokončený" signál, aký existuje), geometria (`--radius-xs..pill`), spacing
(`--space-1..8` = 4/8/12/16/20/24/32/48, ruší 5/6/10/14/18/22), typová stupnica
(`--text-2xs..display`, zámerne **absorbuje** dnešné 12/13/14/16 bez vizuálnej zmeny, takže migrácia
je premenovanie a nie redizajn) a motion. Každý nový token musí byť vo **všetkých troch** blokoch,
ktoré súbor už udržuje. Tmavý režim zostáva čistý override hodnôt; jediná výnimka sú `--shadow-*`
(čierny shadow na čiernej ploche je neviditeľný, elevácia sa nesie svetlejším povrchom a highlightom)
— a je to zdôvodnené na mieste. Font stack zostáva systémový: `font-src 'self'` v CSP nič iné
nepripúšťa, ikony teda inline SVG.

**Kritické: `Layout.font` hodnoty 10/11/12 v `ReserveChart.tsx` sú jednotky viewBoxu, nie pixely.**
Migrácia typovej stupnice ich nesmie prepísať; SVG geometria grafu je z refaktoru vyňatá celá.

#### 2.5.5 Wizard: sedem krokov, štyri ovládacie prvky na obrazovku

Dnes: 4 kroky, na kroku 2 sedem ovládacích prvkov plus tlačidlo refixácie. Nové: **7 krokov,
maximum 4 ovládacie prvky na obrazovku, tri kroky sú jediný tap.** Viac krokov a **menej vstupov na
obrazovku** — a to druhé je číslo, ktoré riadi opustenie, nie počet krokov.

| # | id | Úloha | Prvky | Vetvenie |
|---|---|---|---|---|
| 1 | `shape` | domácnosť + vek(y) + voliteľné meno | 1 voľba + 1–2 roky | `single` / `couple` pre všetko ďalšie |
| 2 | `income` | čistý mesačný príjem | 1–2 sumy | počet z kroku 1 |
| 3 | `housing` | hypotéka / nájom / vlastné bez hypotéky | 1 voľba + 0–5 | trojcestné |
| 4 | `debts` | ostatné dlhy — brána | 1 voľba, potom repeater | pri „nie" prázdne telo |
| 5 | `expenses` | štyri pravidelné výdavky | 4 sumy | — |
| 6 | `cash` | rezerva + pravidelné investovanie | 4 | — |
| 7 | `children` | zámer mať deti | 1 voľba + 0–3 | štvorcestné |

Krok 1 je jediná odpoveď, ktorá reštrukturalizuje každú ďalšiu obrazovku, stojí jeden tap a hádanie
naslepo stojí používateľa prestavbu v polovici wizardu — preto **bez predvolby a `Pokračovať` je
zakázané, kým nevyberie**. Všetko ostatné je predvyplnené. Krok 7 má predvolené `maybe` (deti `[]`,
porovnanie si necháva stĺpce „dieťa 2029 / 2032" — o tom to celé je), `no` ich vymení za „vyšší vklad"
a „skoršie splatenie hypotéky", `have` pripúšťa **narodenie v minulosti** (dnes je `minYear` nastavené
na `startMonth.year`, takže **existujúce dieťa sa nedá zadať vôbec**) a polia o rodičovskej sa ukážu
len ak je dieťa mladšie ako 3 roky.

Progres: `Krok {step} z {total}` musí byť **ICU select**, lebo celkový počet sa hýbe medzi 4 a 7
a čeština aj slovenčina majú `ze čtyř` / `z pěti` / `ze šesti` / `ze sedmi` a `zo štyroch` /
`z piatich` / `zo šiestich` / `zo siedmich`. Dnešné pevné „ze" je pri piatich krokoch chyba.

„Odhadnem to teraz" má tri úrovne, nie jednu: **per krok** sekundárne tlačidlo `Odhadnout za mě` /
`Odhadnúť za mňa`, **per pole** 10px badge `odhad` na každom poli s `provenance === 'default'`, ktorý
zmizne pri prvej editácii, plus `Zpět na průměr`, a **globálne** preznačený skip
`Přeskočit zbytek — chci vidět plán`.

**Ešte jedna vec, ktorá vyšla z čítania katalógov:** `sk.json` prepína medzi vykaním a tykaním
**vnútri toho istého súboru** (`doplníš`, `Posuň dátum`, `skontroluj ich`, `nedostaneš návrh`,
`bez tvojho vedomia` proti vykaniu všade inde). Formálnosť, ktorá sa preklopí v strede toku, čítame
ako strojový preklad — presne tá dôveryhodnosť, ktorú §6.3 chráni. Zjednotiť na vykanie v oboch
jazykoch a prejsť celý súbor.

#### 2.5.6 Jedno pole, všade

Diagnóza bodu 9, konkrétne: **jednotka je vpašovaná do labelu** (`Roční růst příjmu · %`) a `suffix`
je preťažený — raz je to skutočná jednotka (`%`, `měsíců`), raz taxonomický tag (`Fixní`
vo výdavkoch); jedna prop s dvoma významami sa nedá ani nastylovať ani prečítať správne. **A mena
nie je uvedená nikde** — `income`, `m-balance`, `m-payment`, `r-balance`, `dca`, `exp-*`, `child-cost`,
každá obálka, každý sleeve: ani jedno pole nenesie `Kč` ani `€`. Najdôležitejšia jednotka
vo finančnom plánovači je jediná, ktorú editačná plocha nikdy nevypíše — pri tom, že `money()`
existuje presne preto, že `128,652 CZK` číta ako cudzí nástroj. **Kroky sú arbitrárne a nesúhlasia
medzi poliami tej istej veličiny:** „mesačná suma" má štyri rôzne granularity klávesových šípok
a „ročná sadzba" tri; `child-parental` a `horizon` nepredávajú `step` vôbec. **`repeat(auto-fit,
minmax(...))` vyrába osirelé stĺpce** — osobný fieldset s 3 poľami dá na desktope 5 traktov (tri polia
vľavo, dva prázdne trakty), výdavky 4 → `3 + 1 osirelé` na tablete, karta dieťaťa 5 → osirelé takmer
na každej medzišírke — a minimá sú 150 / 160 / 180 / 190 / 240 px v piatich súboroch, takže nič
v dvoch susedných sekciách nelícuje a oko sa učí mriežku odznova pri každej karte. **To je najväčší
jediný prispievateľ k „vizuálne rozbité".** Ďalej: `type=number` mutuje pri scrolle,
`Number('39 000')` je `NaN`, vymazanie poľa okamžite commitne `0`, `max={36}` je iba poradné (napíš
400 a 400 pôjde do enginu), hierarchia nadpisov je **obrátená** (h1 26 → h2 20 → **h3 14**, teda
najhlbšia a najpočetnejšia úroveň je najmenej viditeľná), **nie je žiadny error state** (jediná
cross-field validácia v produkte je odsek 100–300 px od poľa, ktoré ju spôsobilo, bez `aria-invalid`),
a tabulárne číslice sú opt-in, takže **štyri najväčšie čísla na stránke sú proporcionálne**, kým malé
v tabuľkách pod nimi tabulárne.

Špecifikácia: anatómia `label + [odhad] · control s jednotkou ako afix vnútri rámu (aria-hidden,
duplikovaná do prístupného názvu) · hint alebo error v rovnakom slote`. `type="text"` všade, vlastné
parsovanie (strip `\s`, U+00A0, U+202F, U+2009; `,` → `.`; akceptuj U+2212), zobrazenie zoskupené
mimo focusu a surové vo focuse, **prázdne pole necommitne nič**, klávesnica ↑/↓ = krok,
Shift = 10 krokov, `min`/`max` **vynútené pri commite**. Jedna tabuľka krokov pre celý produkt:
tri menové škály (`money.monthly` 500/20, `money.balance` 10 000/500, `money.large` 50 000/2 000)
a tri percentuálne (`percent.rate` 0,1, `percent.growth` 0,25, `percent.share` 5) plus
`months`/`years`/`year`. **`auto-fit` sa zakazuje:** 12-stĺpcová mriežka ≥900 px, 6 pri 600–899, 1 pod
600, každé pole deklaruje `span` a v skupine `sum(span) % 12 === 0` — osirelé stĺpce sa tým stanú
štrukturálne nemožné. Kanonické riadky: hypotéka `6 · 3 · 3` → `6 · 6`; osoba `6 · 3 · 3`;
dlh `4 · 4 · 2 · 2`; výdavky `4 × 3`. Zdieľané komponenty: `NumberField`, `TextField` (dnes
neexistuje, preto si `EnvelopesEditor` a `SleevesEditor` ručne skladajú `.field`), `ChoiceField`
(`segmented` ≤3 / `cards` pre vetvenia / `select` ≥5), `MonthYearField`, `FieldGroup`, **`Repeater`**
(nahrádza štyri ručné implementácie karty s remove tlačidlom — deti, obálky, sleeves, dlhy) a
`AdvancedDisclosure` pre ~40 % ovládacích prvkov, ktoré sú mechanizmus, nie fakt. `.field` sa ruší.
`tabular-nums` ide na `.f-control input`, `.stat-value` a každé `td`/`th` — nie opt-in.

#### 2.5.7 Plánová stránka

Sedem sekcií, vlastné disclosure (nie native `<details>`, lebo nadpis musí byť skutočný `h2` pre
outline dokumentu a tlač musí vedieť otvoriť z React stavu):

| # | id | CZ | SK | default |
|---|---|---|---|---|
| 1 | `verdikt` | Verdikt | Verdikt | **otvorené, nikdy zbaliteľné** |
| 2 | `nalezy` | Co model našel | Čo model našiel | otvorené (jediná sekcia s akciami) |
| 3 | `srovnani` | Srovnání scénářů | Porovnanie scenárov | zbalené |
| 4 | `citlivost` | Co když se předpoklady nevyplní | Čo keď sa predpoklady nevyplnia | zbalené |
| 5 | `cisla` | Čísla plánu | Čísla plánu | zbalené (celá editačná plocha) |
| 6 | `predpoklady` | Předpoklady a horizont | Predpoklady a horizont | zbalené |
| 7 | `export` | Uložit, sdílet, exportovat | Uložiť, zdieľať, exportovať | otvorené (jeden riadok) |

**Každá zbalená hlavička nesie živý súhrn** — `{count} nálezů · {critical} kritický`,
`Nejhorší předpoklad: {label} — dno {amount}`, `{total} čísel · {user} vašich, {defaults} národní
průměr` — takže zbalenie **nestojí žiadnu informáciu**. To je časť, ktorá robí vzor poctivým
a nie iba uhladenejším. Nadpis je `h2` 20 px / 650 / `--ink` (priama oprava bodu 8), celý riadok
hlavičky je tlačidlo min. 44 px, chevron na nábežnej hrane, súhrn 13 px na tom istom riadku.
Dnešné dlhé odseky pod nadpismi idú **dovnútra** panelu a skrátia sa na jednu vetu.

`hidden="until-found"` na paneloch (Chromium) znamená, že **zbalený obsah sa dá nájsť cez `Ctrl+F`**
a sekcia sa pri zhode sama otvorí — to je odpoveď na jedinú vážnu námietku proti zbaľovaniu
finančného dokumentu. `content-visibility: auto`, aby zbalený 40-poľový editor nestál nič pri layoute.
Šípky **zámerne neprepínajú** medzi hlavičkami (to je konvencia `tablist`, a toto tablist nie je);
skoky rieši rail. Shift+klik = solo. Stav sa ukladá do **samostatného kľúča** `wealthplanner.ui.v1`,
nie do plánu: „Začať znovu" nesmie resetovať čitateľské preferencie a poškodený UI blob nesmie
rozbiť načítanie plánu. Neznáme id padá na tabuľku defaultov, aby sekcia pridaná v ďalšom vydaní
nezdedila „zbalené" zo starého blobu. Stav sekcií **sa nikdy nezapisuje do zdieľaného linku**.

Deep link ide do **query parametra** `?s=srovnani`, nie do fragmentu — fragment vlastní `#p=` plán
a celé tvrdenie o privátnosti stojí na tom, že sa fragment neposiela na server. Query parameter **sa**
posiela, takže musí byť zdokumentované, že nesie id sekcie a nič viac. `history.replaceState`, nikdy
`pushState` — tlačidlo späť nesmie kráčať cez akordeón.

**Tlač nesmie nikdy vytlačiť zbalený plán**, a implementované to musí byť v React stave
(`beforeprint`/`afterprint` → `hidden={!open && !printing}`), nie v CSS: `@media print { [hidden]
{ display: block !important } }` nedokáže vrátiť obsah, ktorý React nikdy nevykreslil. **PNG export
nesmie čítať `hidden` DOM** — skladá sa off-DOM z modelu (graf + veta o dne + max tri nálezy +
`assumptions.inline` + dátum), takže zbalená a rozbalená stránka exportujú identicky. Riadok
s predpokladmi je v obrázku **povinný**: screenshot bez predpokladov je najväčšie riziko dezinformácie
tohto produktu, a screenshoty sú rastový kanál.

**Čo zo stránky ide von** (skrol bez rozhodnutia, v poradí ušetreného miesta): graf zo steppera;
`EnvelopesEditor` z default zobrazenia (engine má **test**, že obálky projekciu nemenia — sú
deskriptívne, takže nemenia žiadne rozhodnutie) do `cisla`; dva `SleevesEditor` do jednej skupiny
s prepínačom osoby; **duplicitný výber krajiny na plánovej stránke** (a jeho dnešné správanie je
strata dát, nie iba duplikát); vreckové a sweep cap z wizardu (mechanizmus, nie fakt — sweep cap
odvodiť ako `reserveFloor × 2`); per-person rast príjmu z wizardu; **štvrtá podmienená stat dlaždica**
(`summaryForegone` sa renderuje len keď `> 0` a cez `auto-fit` preskladá celú mriežku — z troch na
štyri; radšej `info` nález a **tri dlaždice pevne**, kde tretia sa prepína podľa `housing.kind`:
hypotéka → `Hypotéka splacena`, nájom → `Nájem v roce {year}`, vlastné → `Investice v roce {year}`);
päťtlačidlový footer (`Uložit` je jediné primary, `Reset` je **`danger`** — dnes vyzerá presne ako
`Export`); `refixHint` ako próza pri tlačidle; a **dve z troch takmer identických tabuliek** —
`Compare`, `Sensitivity` a tabuľka v grafe renderujú tú istú množinu stĺpcov v troch vizuálnych
dialektoch.

#### 2.5.8 Dve chyby, ktoré vyšli z analýzy screenshotov

**Chyba A — slovenské demo nikdy nespadne, takže slovenská landing page nedokáže to, na čom celý
produkt stojí.** Zmerané na skutočnom engine: CZ demo `minReserve −91 729 @ 2032-01`, `deficitAt
2031-09`, 58 mesiacov pod podlahou, najlacnejšia overená oprava `parentalMonths 24 → 21`. SK demo
`minReserve 8 000 @ null`, `deficitAt` nikdy, **0 mesiacov pod podlahou**, `detectProblems` prázdne —
takže `LandingHero` padne do else vetvy a vypíše *„V tejto podobe plán drží: rezerva nikdy neklesne
pod 3 870 €"*. Príčina nie je režim dávok (miery náhrady sú porovnateľné, 36 % v oboch krajinách),
ale **dva pomery v `skDefaults`**: hypotéka je poddimenzovaná (DSTI 20,5 % a DTI 3,42× proti českým
31,0 % a 4,82×) a hotovostná poduška predimenzovaná (rezerva 6,20 mesiaca fixných výdavkov a sweep
cap 19,38 proti českým 4,36 a 13,07). Runway 54 mesiacov (SK) proti 29 (CZ) pri rodičovskej dlhej
32 a 30 mesiacov. Oprava sú **dva riadky** — hypotéka `130 000` / splátka `650` (DTI 4,45×, splátka
je anuitná aritmetika 130 000 pri 3,5 % na 25 rokov, teda rok splatenia zostáva 2051) a rezerva
`6 500` / cap `19 500` (rovnaký násobok fixných výdavkov ako v CZ). Výsledok po tejto zmene:
`minReserve −3 068 @ 2032-03`, 17 negatívnych mesiacov, najlacnejšia oprava `24 → 19`, a bezdetná
`defaultScenario('SK')` **zostáva solventná**, takže demo si alarm stále zaslúži dieťaťom. Čísla
príjmov a výdavkov sa **nemenia** — tie sú národným priemerom so zdrojom; menia sa dve, ktoré boli
aj tak nepodložené (`DEFAULTS_META.SK.mortgageSource` je iba `https://nbs.sk/`, nie štatistická
stránka). Do plánu patria ako **odhad úmyselne proporčný k CZ**, s tým napísaným.

Dve veci nájdené v tej istej ceste: `minReserve` sa seeduje **otváracím zostatkom** pred cyklom, takže
plán, ktorého dno nikdy nespadne pod prvý deň, hlási `minReserveAt = null` a hero vypíše pomlčku tam,
kde má byť mesiac. A `PARENTAL_MAX_MONTHS = 36` v `sk.ts` mínus 8 mesiacov materskej dáva reálne
maximum **28**, kým `PlannerClient` povoľuje `max={36}` — slovenský používateľ môže napísať 36, nič
sa nezmení a rozumne usúdi, že model je pokazený.

**Chyba B — český plán sa obnoví na slovenskom plánovači.** Mapovanie locale → krajina existuje
presne na jednom mieste, a je to **lazy inicializátor `useState`, ktorý boot efekt okamžite zahodí**:
`loadPlan()` nastaví `setScenario(stored.scenario)` bez toho, aby kedykoľvek porovnal `locale`
s `stored.scenario.jurisdiction`. `localStorage` je navyše **jediný globálny kľúč**
`wealthplanner.plan.v1`, takže český a slovenský plán nemôžu koexistovať a druhé uloženie zničí prvé.
Mena **nie je iba prelepená**: `withRegime` ju derivuje z `jurisdiction`, ktorá zostáva `'CZ'`, takže
`4 510 000 Kč` sa vykreslí so slovenskými oddeľovačmi a Slovákovi idú do modelu **české limity ČNB
a české dávky**. A výber krajiny žije **len v prvom kroku onboardingu**, do ktorého obnovený plán
nikdy nevstúpi — plán je teda ticho a natrvalo český.

Oprava: `jurisdiction` sa **validuje** ako člen `{'CZ','SK'}` (dnes `input.jurisdiction === 'SK' ?
slovakia : czechia` znamená, že plán bez tohto kľúča sa ticho stane českým); `localStorage` sa kľúčuje
per krajinu s jednorazovou migráciou starého kľúča; pri prepnutí jazyka sa **nemigruje ani ticho
nezahadzuje** — český plán nie je konvertovateľný na slovenský (iná mena, iný *model* dávok, iné
limity, a FX kurz produkt zámerne nemá), takže per-country kľúč to vyrieši sám a zostane iba banner
pre prípad, že plán druhej krajiny existuje a táto je prázdna; výber krajiny musí byť dosiahnuteľný
aj z plánovej stránky (s potvrdením, lebo resetuje vstupy). Poradie precedencie: **fragment `#p=`**
(explicitný akt, vyhráva aj nad locale — ale nezhoda krajiny sa **oznámi**, nikdy neprepíše čísla
linku) → **`localStorage` pre krajinu tohto locale** → **`defaultScenario(countryFor(locale))`**, a
boot efekt musí závisieť od `[locale]`. `countryFor(locale)` má byť **jeden exportovaný helper** —
dnešný inline ternár na dvoch miestach je presne dôvod, prečo tretie miesto (cesta obnovy) mapovanie
nemá. A ešte: `sw.js` má offline fallback zadrôtovaný na `/cs/plan`, takže offline navigácia na
`/sk/plan`, ktorá minie precache, dostane českú stránku — nezávislá druhá cesta k tomu istému symptómu.

#### Stav implementácie — 25. 8. 2026

**Hotové a overené:** `pnpm check` (typecheck + 122 unit/golden/property/formátovacích testov + lint)
zelené, `engine-version-guard` na v4, produkčný build prechádza, **38 e2e testov (desktop + mobil)
zelených** vrátane brány na akúkoľvek chybu v konzole. Sedem existujúcich goldenov sa zmenilo presne
v jedinom riadku (`engineVersion` 3 → 4), tri nové goldeny pribudli. Zo 72 položiek checklistov je
**68 hotových**; štyri zámerne odložené sú nižšie nezaškrtnuté.

**Štyri odchýlky od plánu, každá zmerená a odôvodnená:**

1. **`ScenarioInput.mortgages` sa nezachovalo ako zrkadlo, bolo odstránené hneď.** Plán ho chcel
   nechať jedno vydanie kvôli uloženým plánom. Ale zrkadlo, ktoré nikto nečíta pre aritmetiku, sa
   dá rozísť s `housing` bez toho, aby to čokoľvek zachytilo — a presne to by sa stalo v
   `variants.ts`, kde šok sadzby zapisoval do `mortgages`, kým `simulate()` už čítal `housing`:
   riadok citlivosti by sa ticho stal no-opom. Referencií bolo iba dvadsať. Spätnú kompatibilitu
   nesie `upgradePlan()`, ktorý starý `mortgages` číta z legacy typu — plán uložený starým buildom
   sa načíta rovnako, len bez rizika dvoch pravd.
2. **`content-visibility: auto` na paneloch je zámerne von.** Zbalený panel je už `hidden`, takže
   layout nestojí nič aj bez toho — kým na otvorenom paneli render/unrender pri prechode viewportom
   mení jeho výšku počas skrolovania. Zmerané na Pixel 7: **každý klik na hlavičku sekcie pod grafom
   dopadol na graf**, pretože sa layout pohol medzi skrolom a klikom. `contain-intrinsic-size` to
   neopraví, reálne výšky sa od akéhokoľvek placeholderu líšia o stovky pixelov. Zostáva
   `contain: layout`, ktoré si necháva užitočnú polovicu.
3. **`.field` sa nezrušilo, iba označilo ako deprecated.** Ruší sa až s poslednými inline štýlmi;
   zrušiť ho v tomto commite by znamenalo prepísať naraz 18 súborov, čo je presne ten veľký buchot,
   ktorý plán zakazuje.
4. **Ako vedľajší produkt sa našla a opravila skutočná chyba layoutu:** `.stack-lg` bez
   `grid-template-columns` dostal implicitný `auto` track, ktorý je široký ako **max-content**
   najširšieho dieťaťa — takže sticky rail s deviatimi čipmi roztiahol celú stránku na **1450 px vo
   412 px viewporte**. `overflow-x` na dieťati to nezastaví. Telo stránky bolo klipnuté cez
   `overflow-x: hidden` a každý tap pod zlomom dopadal na iný prvok, než na aký mieril. §6.3 to
   zakazuje výslovne; teraz to hlídá aj e2e na mobilnom projekte.

**Ukážku na landingu sa dá opraviť priamo na mieste.** Každý návrh má tlačidlo „Použiť";
použitie prepočíta simuláciu, prekreslí graf a prepíše vetu nad ním — návštevník teda **vidí**, ako
deficit zmizol, namiesto toho, aby čítal tvrdenie, že by zmizol. Prijatá možnosť zostáva
označená (zelená hrana, čip „Použité", tlačidlo „Vrátiť späť"), takže je stále jasné, ktorú zmenu
obrázok zobrazuje.

**Práve jedna naraz**, a to je správnosť, nie zjednodušenie: dôkaz pred/po každej možnosti bol
spočítaný proti nedotknutej domácnosti, takže dve naskladané na sebe by boli dva dôkazy o situácii,
ktorá už neexistuje. Použitie druhej preto prvú vystrieda — čo je aj to, čo „jednu z týchto"
sľubuje. Zoznam možností zostáva odvodený z nedotknutej domácnosti, aby sa nestratil pod rukami
tomu, kto ho práve použil.

Veta o výsledku má **tri** stavy, nie dva, a tretí je dôvod prečo: odstránenie deficitu môže
nechať miernejší nález „pod odporúčaným minimom", pretože každý dôkaz bol len o deficite. Tvrdiť
„rezerva už pod nulu neklesne", kým veta nad grafom hlási zostávajúci nález, by sa čítalo ako že
si model protirečí.

**Landing page zahadzovala dve tretiny toho, čo engine našiel.** Vykresľovala `fixes[0]` a
ostatné nechala ležať: pri oboch demách recommender dokáže **tri** samostatné cesty z deficitu —
kratšia rodičovská, nižšie voľné výdavky, alebo menší mesačný vklad. Zobrazenie jednej robilo
z produktu nástroj s jedným názorom, pričom zoznam overených alternatív **je** to, čo tvrdí.
Teraz sú tam všetky tri, od najmenej drastickej, každá s vlastným dôkazom pred/po, a otvorený je
vždy len jeden dôkaz.

Zvýraznené sú **ako blok** — tónovaná plocha, accent hrana, accent nadpis („Model navrhuje jednu
z týchto 3 úprav — každá problém dokázateľne odstráni") — nie krikom vnútri každého riadku, čo by
vyrobilo len tri hlasné riadky. Nadpis sa prepne do jednotného čísla, keď engine nájde jednu
možnosť, pretože sľúbiť voľbu a nabídnuť jednu sa číta ako chyba.

**Nič už nevynáša verdikt o domácnosti, ktorú nikto nezadal.** Robili to dve miesta. Pás vo
wizarde vypisoval „Plán drží — najnižšia rezerva 200 000 Kč v auguste 2026" na prvej obrazovke
úplne novej session, čo je súd o národnom priemere prezlečenom za plán používateľa; kým nie je
jeho ani jedno číslo, pás teraz povie len to, na čo sa pozerá. A graf na landingu bol
nepomenovaná projekcia ničích dát — čo je horší prvý dojem než žiadny graf, pretože návštevník
nevie, či sú to jeho čísla, vzorka, alebo dekorácia. Teraz je to **pomenovaný príklad** s tromi
vetami: kto tá domácnosť je, čo v nej model našiel, a čo návštevník dostane, keď odpovie na tie
isté otázky. Každé číslo v tom texte je interpolované zo scenára, z ktorého je nakreslený graf,
takže sa text a obrázok nemôžu rozísť.

Pri tom sa opravilo aj „najnižšia rezerva 200 000 Kč v auguste 2026" — to bol doslova otváracií
zostatok v otváracom mesiaci. `simulate()` seeduje minimum prvým dňom, takže `minReserveAt` je
`null`, keď rezerva nikdy neklesne; tento prípad má teraz vlastnú vetu namiesto mesiaca.

**„Plán drží" je vonku**, na tvoju žiadosť. Zdravý verdikt je **„Rezerva vydrží"** — pomenúva to,
čo sa naozaj meria, a číta sa ako rovnocenný s ďalšími dvoma stavmi, ktoré boli o rezerve vždy.

**Klik do predvyplneného poľa a písanie odhad prepíše, nie zmrší.** Dve chyby za sebou. Pole si
pri fokuse prepisovalo vlastný buffer, a priradenie `value` do inputu zruší označenie — takže
select-all urobený riadok predtým bol pri prvom stisku klávesy už dávno preč a písanie
**pripájalo**: 39 000 plus 52000 dalo 3900052000. Po oprave tohto obyčajný klik stále len
umiestnil kurzor, takže písanie vkladalo — 61000 do 39 000 dalo 6100052000. Pri poliach
predvyplnených národným priemerom je „kliknem a napíšem" najčastejšia interakcia v celom
produkte, takže prichádzajúci klik teraz označí všetko, kým druhý klik vnútri kurzor stále
umiestni tam, kam si klikol.

**Zvolená téma prežije prepnutie jazyka.** Zmena locale mení segment `[locale]`, takže sa root
layout vykreslí znovu a React zladí `<html>` späť na server-renderované atribúty — `data-theme`
zmizol a stránka padla na `prefers-color-scheme`. Kto má tmavý systém a vybral si svetlý režim,
skončil kliknutím na „SK" v tmavom. Inline boot skript to zachytiť nemôže, ten beží len pri
plnom načítaní dokumentu. `<ThemeSync/>` s layout efektom nad pathname teraz obnoví voľbu
**pred** vykreslením, takže tam nie je ani jeden frame nesprávnej témy.

Dve veci, ktoré si tá oprava vyžiadala. Používa `usePathname` z `next/navigation`, nie z
next-intl — ten locale odstraňuje, takže by sa nezmenil práve pri tej jedinej navigácii, pre
ktorú to celé existuje. A zdieľaný kľúč musel **von z klientského komponentu**: konštanta
exportovaná z `'use client'` modulu nie je na serveri hodnota, ale klientská referencia, a jej
interpolácia do inline skriptu vygenerovala
`localStorage.getItem('function(){throw Error("Attempted to call THEME_KEY() from the server…")}')`
— apostrof v tej správe ukončil string a rozbil skript na každej stránke. Pravidlo e2e „nič
nesmie prísť do konzoly" to našlo na prvý beh.

**Refixácia zobrazovala zmenu, ktorú projekcia neobsahovala.** Krok vykresľoval dátum a novú
sadzbu tak, ako keby boli nastavené, kým `rateResets` bolo prázdne — obrazovka teda tvrdila, že
sadzba v roku 2029 stúpne, a model tvrdil, že nikdy. A dotknutie sa jedného poľa ticho commitlo
aj zobrazenú hodnotu druhého. Teraz je to výslovná otázka, **vypnutá defaultne**, s uvedeným
dôvodom, a kým na ňu neodpovieš, model nič nepredpokladá. Predvyplnený predpoklad, ktorý nikto
neurobil, je horší než žiadny — a najhorší práve pri najväčšom riziku celého plánu.

**Hotovosť a investície sú zoznamy, pretože presne to domácnosť má.** Jeden zostatok, jeden
úrok, jeden vklad a jeden očakávaný výnos vtlačili bežný účet na 0 %, sporiaci na 4 %, ETF na
7 % a čokoľvek špekulatívne do jediného priemeru — a postavili úrok a výnos vedľa seba, akoby to
boli dva druhy tej istej veci. Každý riadok teraz nesie **presne jedno percento**: účty majú sumu
a úrok, investície hodnotu, výnos a mesačný vklad. Oba zoznamy môžu byť prázdne, a vyprázdnený
zoznam prázdny zostane — nevzkriesi starý súčet.

Pod tým je **jedno zdokumentované miesto spojenia** v `apps/web/src/lib/pots.ts`, nie prepis
enginu. Dva investičné pojmy enginu nie sú zameniteľné: `jointInvesting` je vklad, ktorý model
**pozastaví**, keď nezostáva hotovosť, a cieľ, kam sa zmieta prebytok nad stropom rezervy —
takže môže byť len jeden, lebo „čo sa pozastaví prvé" je poradie, nie množina. Sleeves už svoj
vlastný výnos, zostatok a vklad majú. Preto pot 0 je `jointInvesting` (v UI tak aj pomenovaný a
bez tlačidla „odobrať", pretože je to rola, nie položka) a ostatné sú sleeves. Hotovosť dostala
`Reserve.accounts` ako **čisto deskriptívne** pole: projekcia číta súčet a váhovaný úrok, a test
tvrdí, že iné rozdelenie tých istých peňazí medzi účty nesmie pohnúť ani jedným číslom.

**Krajina je otázka, nie odvodenie z jazyka rozhrania — rozhodnutie 4 sa týmto opravuje.** Plán
hovoril „krajina prestáva byť prvá otázka wizardu, odvodí sa z locale". To je nesprávne pre
prípad, ktorý nie je ani vzácny, ani exotický: čítať po slovensky a pritom pracovať, mať
hypotéku a vychovávať deti v Česku. Takému človeku odvodenie z jazyka pokazí naraz menu, model
dávok, limity a každé predvyplnené číslo. Je to teraz **prvý krok wizardu** — pre väčšinu jeden
tap, pretože locale stále dodáva úvodnú odpoveď — a každá možnosť hovorí, čo znamená („Koruny,
české dávky, limity ČNB"). Voľba sa pamätá pod vlastným kľúčom, takže slovenský plán v korunách
prežije reload, a je dosiahnuteľná aj z plánovej stránky. Zmena krajiny prepočíta všetky defaulty
a povie to dopredu: mena je iná, model dávok je štrukturálne iný a kurz produkt zámerne nemá.
Čo z pôvodného rozhodnutia platí ďalej: zmena krajiny už nesmie ticho zahodiť zadané hodnoty.

**Mena je teraz čitateľná vnútri poľa.** Vykresľovala sa, ale bola pripnutá na pravý okraj 600px
ovládacieho prvku za vlasovou linkou, 500 px od číslic — čítala sa ako samostatný prvok, nie ako
súčasť čísla. Číselné vstupy sú zarovnané vpravo, takže hodnota končí tam, kde začína jej
jednotka, a čísla sa zoradia do stĺpca, čo je celý zmysel tabulárnych číslic.

**Autosave, a tlačidlo „Uložiť" zmizlo.** Plán, ktorý žije iba v prehliadači a treba ho uložiť
ručne, je plán, ktorý ľudia stratia. Zapisuje sa ~700 ms po tom, čo prestaneš písať, z jedného
miesta, aby to nemohlo zabudnúť žiadne budúce volanie. Tri podmienky, každá nesie váhu: len keď
používateľ naozaj niečo zmenil (inak by otvorenie cudzieho zdieľaného odkazu prepísalo jeho
vlastný uložený plán pre tú krajinu), len po odovzdaní z wizardu (opustený wizard tak nič
nezanechá a tvrdenie „uložený plán preskočí wizard" zostáva pravdivé) a debounced. Okno debounce
je okno, v ktorom zmena existuje iba v pamäti — preto je viditeľné („Ukládám…") a flushuje sa na
`pagehide` aj `visibilitychange`; `beforeunload` sa pri prepnutí aplikácie na telefóne nespustí.

**Čo pribudlo navrch plánu:** `scripts/style-guard.mjs` — dva ratchety (152 inline štýlov, 110
číselných literálov), ktoré môžu iba klesať, zapojené do CI aj do `ship.sh`; parita kľúčov medzi
`cs.json` a `sk.json` ako test; a `sk.json` zjednotené na vykanie.

#### Checklist A — Engine, model, migrácia (ide prvé; jeden bump)

- [x] `Person.birthYear?: number` + `ageAt(birthYear, ym)` v `time.ts` (guard: `--accept`)
- [x] `Housing` unia + `Rent` + `ScenarioInput.housing`, `mortgages` ako deprecated zrkadlo
- [x] Nájom do bloku výdavkov v `simulate.ts` s **vlastným** `growthFactor(annualIndexationPct, t)`
- [x] `MonthlyPoint.rentPayment` + `housingPayment`; `mortgagePaidYear` zostáva `null` pre nájomníka
- [x] `Liability` + `ScenarioInput.liabilities` + amortizácia ako rozšírenie 3. kroku
- [x] Splátka dlhu do `spending`, `fixedMonthlyOutgoings` **a** `floorThisMonth` (pred throttlom)
- [x] `netWorth` odčítava `liabilityBalance`; ručne dopočítaný `expected` v teste treba prepísať
- [x] `ScenarioInput.childrenIntent` + test, že projekciu **nemení ani o číslo**
- [x] `apps/web/src/lib/migrate.ts` `upgradePlan()`, idempotentný, volaný **zvnútra `withRegime`**
- [x] `schemaVersion` vedľa `engineVersion` v `savePlan`/`exportPlan`
- [x] `problems.ts`: `child-leave-unassigned` (**critical** — dnes dieťa stojí peniaze a nikto
      nejde na rodičovskú, a nič to nehlási; `foregoneIncome` padne z 911 904 na 0)
- [x] `criterionFor('child-leave-unassigned') === null` + akcia „prideliť rodičovskú" v UI
- [x] `defaultScenario(jurisdiction, start, people)` s **vlastným** baseline pre jednotlivca
- [x] `variants.ts`: `comparisonVariants` vetví na `childrenIntent`; `incomeDown` label pre jednotlivca
- [x] `ENGINE_VERSION` 3 → 4 **raz**; sedem goldenov = sedem jednoriadkových diffov
- [x] `metodika` order3 preformulovať na „dlhy sa umoria (hypotéka vrátane refixácie)" v oboch jazykoch

#### Checklist B — Dizajnový systém (môže ísť paralelne s A)

- [x] Commit 1: **iba `globals.css`** — celý token blok v troch theme scope-ách, `.btn` prepísaný
      (varianty, veľkosti, `:hover`/`:active`/`:disabled`/`:focus-visible`, `--shadow-hi`,
      `--control-border`), zmazaný `border-radius: 4px` z globálneho `:focus-visible`, `--shadow-1`
      na `.card`, `.visually-hidden`, 44 px podlaha pri `pointer: coarse`, opravený `--ink-muted`
- [x] `SiteNav.tsx`: tri tiery, pevná výška, `/zasady` do footera, CTA potlačené na `/` a `/plan`
- [x] Prepínač jazyka na `usePathname()`; aktívna route tromi signálmi bez farby; skip link
- [x] `ThemeToggle` ako ikonové tlačidlo; `THEME_BOOT` proti bliknutiu zlej farby
- [x] `RotatingHeadline.tsx` — grid stack, sr-only prvý slogan, pauza, `prefers-reduced-motion`
- [x] `landing.slogans` (6 + 6) v oboch katalógoch; e2e assertion zostáva `toContainText`
- [x] Commit 4: prijať veľkosti a varianty — `grep "padding: '5px"` (5 súborov), `Reset` = `danger`,
      in-card prepínače = `ghost btn-sm`, `data-loading` na štyri async handlery
- [x] Dva grep guardy v CI: strop na počet `style={{` (baseline 220, klesajúci) a zákaz
      `fontSize: <číslo>` / `borderRadius: <číslo>` / `gap: <číslo>` mimo `ReserveChart.tsx`
- [x] Rozhodnuté a zapísané: Tailwind (a) `@theme inline` alebo (b) odstrániť

#### Checklist C — Wizard

- [x] 7 krokov podľa tabuľky, max 4 prvky na obrazovku, `ChoiceField` variant `cards` na vetvenia
- [x] Krok 1 bez predvolby, `Pokračovať` zakázané do výberu; `single` škáluje defaulty (koeficienty)
- [x] Krok 3 trojcestný; krok 4 brána + `Repeater<Liability>` (max 6); krok 7 štvorcestný
- [x] **Graf zo steppera odstránený**; `ConsequenceRibbon` na jeho mieste
- [x] Ribbon: verdikt (farba + glyf + slovo), dno vetou, **delta pripísaná kroku**, merač úplnosti
- [x] `aria-live` sa zapisuje **len pri commite kroku**, nikdy pri stisku klávesy
- [ ] Terminálna odmena: graf sa nakreslí raz + rekapitulácia troch najväčších delt
- [ ] `provenance: Record<string, 'user'|'default'|'derived'|'imported'>` + badge `odhad` + „späť na priemer"
- [x] ICU select pre `Krok {step} z {total}` (4–7) v oboch jazykoch
- [x] Krajina von z wizardu; zmena krajiny prepíše **len** polia s `provenance === 'default'`
- [x] `minYear` pre narodenie dieťaťa `start.year − 25` (dnes sa existujúce dieťa nedá zadať)
- [x] Jednočlenná domácnosť: žiadny jednopoložkový `<select>` pre rodičovskú, veta namiesto neho
- [x] `sk.json` zjednotiť na vykanie v celom súbore

#### Checklist D — Parametrová plocha

- [x] `NumberField` s `kind` a tabuľkou krokov; `type="text"`, vlastné parsovanie, U+00A0 a `,`
- [x] Jednotka ako afix vnútri rámu, `aria-hidden` + sr-only v prístupnom názve; **mena všade**
- [x] Prázdne pole necommitne nič; `min`/`max` vynútené pri commite (`max={36}` znamená 36)
- [x] ↑/↓ krok, Shift = 10 krokov; zákaz mutácie scrollom (padá s `type=number`)
- [x] `TextField`, `ChoiceField`, `MonthYearField`, `FieldGroup`, `Repeater`, `AdvancedDisclosure`
- [x] 12/6/1-stĺpcová mriežka, `span` na každom poli, **`auto-fit` zakázané**; `.field` zrušené
- [x] Error state v komponente: `aria-invalid` + `aria-describedby`, cross-field poznámka
      **na chybnom poli**, nie v pate sekcie
- [x] `tabular-nums` na `.f-control input`, `.stat-value` a každé `td`/`th`
- [x] Zmazať mŕtve kľúče z oboch katalógov (`planner.personName`, `planner.refix`, `chart.floor` …)
- [x] Test parity kľúčov medzi `cs.json` a `sk.json` (dnes žiadny neexistuje)

#### Checklist E — Plánová stránka

- [x] Sedem sekcií podľa tabuľky, vlastné disclosure, `h2` 20/650, celý riadok hlavičky ako tlačidlo
- [x] **Živý súhrn v každej zbalenej hlavičke** — zbalenie nesmie stáť informáciu
- [x] Sticky section rail + `Rozbalit vše` / `Sbalit vše`; Shift+klik = solo
- [x] `hidden="until-found"` + `content-visibility: auto`
- [x] `wealthplanner.ui.v1` ako **samostatný** kľúč, try/catch, neznáme id → default
- [x] Deep link `?s=<id>` (nie fragment), `history.replaceState`, focus na hlavičku sekcie
- [x] `beforeprint`/`afterprint` → React stav; tlačový list (svetlá paleta, `break-inside: avoid`,
      `thead` ako `table-header-group`, predpoklady a dátum na každej strane)
- [ ] PNG celého plánu skladaný **off-DOM z modelu**; riadok s predpokladmi povinný
- [x] Tri stat dlaždice pevne, tretia sa prepína podľa `housing.kind`
- [x] Footer: `Uložit` primary, `Reset` danger, ostatné do zbalenej sekcie `export`
- [ ] Jedna tabuľková komponenta pre `Compare`, `Sensitivity` a tabuľku grafu

#### Checklist F — Opravy, fixtures, testy

- [x] SK demo: hypotéka `130 000` / `650`, rezerva `6 500` / cap `19 500` + `rentSource` v `DEFAULTS_META`
- [x] Test **pre každú jurisdikciu** (`describe.each`): demo spadne pod svoju podlahu,
      `minReserveAt` nie je `null`, existuje nález s **overenou** opravou, bezdetná default domácnosť
      zostáva solventná
- [x] `PlannerClient` `max` pre `parentalMonths` odvodiť z režimu (SK reálne 28, nie 36)
- [x] Chyba B: validácia `jurisdiction`, kľúč per krajina + migrácia, `countryFor()` helper,
      boot efekt na `[locale]`, banner pri nezhode fragmentu, `sw.js` fallback podľa locale
- [x] e2e: plán uložený na `/cs` sa **nesmie** objaviť na `/sk`; každá krajina má vlastný plán;
      český link otvorený pod `/sk` si necháva svoje čísla a povie to
- [x] Nové fixtures + goldeny: `czSingleWithChild`, `czCoupleRenting`, `czSingleRentingWithCarLoan`
- [x] Vlastnosti: vyšší nájom nikdy nezlepší dno; vyššia splátka dlhu nikdy nezlepší dno
- [x] `variants.ts`: `rentUp` (+2 pb indexácia) a `liabilityRateUp`; `rateUp` je pre nájomníka no-op

#### Checklist G — Tier 1 (v tom istom cykle, nie v tom istom commite)

- [x] `problems.ts`: `liability-rate-exceeds-return` (odvodené **z dvoch čísel používateľa**, takže
      nepomenúva žiadny produkt), `liability-never-repaid` (splátka nekryje ani úrok)
- [x] Lever `liabilities[i].monthlyPayment` so splátkou **clampnutou nad úrok** a potlačenou pri
      liability, ktorá už spustila `liability-rate-exceeds-return` (inak si dve karty protirečia)
- [x] `jurisdictions`: `statutoryRetirementAgeYears`, `typicalConsumerLoanRatePct`,
      `typicalCreditCardRatePct` — všetky `unverified: true`, riadok v `allParameters()` a `/parametre`
- [x] `problems.ts`: `children-intended-but-absent`, `horizon-before-retirement`, `envelope-owner-missing`
- [x] `horizonYear` odvodiť z veku: `max(najstarší birthYear + 65, start.year + 25)`

#### Poradie commitov

1. `globals.css` — tokeny a `.btn`. **Nula `.tsx`, nula testov, a je to najmenší commit, ktorý
   viditeľne opraví „fádne a nedokončené".** 101 volaní už ide cez deväť tried; prepísanie deviatich
   definícií upgraduje všetky bez otvorenia jediného `.tsx`.
2. Engine + `migrate.ts` + `ENGINE_VERSION` 4 + goldeny — **jeden commit**, lebo nasadená bundle
   nesmie čítať `housing`, ktorý migrácia ešte nedoplnila.
3. Navigácia. 4. Rotujúci headline. 5. Chyba A + B s testami (malé, samostatné, dá sa vydať kedykoľvek).
6. Polia (`NumberField` a mriežka) — najväčší jediný diff, ide sám.
7. Wizard + ribbon. 8. Plánová stránka a disclosure. 9. Tier 1.

Inline štýly sa retirujú **po kategóriách, nie po súboroch** (`fontSize` → `--text-*`,
potom `gap`/`padding` → `--space-*`, potom radiusy, potom extrakcia komponentov), aby bol každý diff
prehliadnuteľný a samostatne revertovateľný. `ReserveChart.tsx` sa nedotýka nikdy.

#### Nové riziká, ktoré táto fáza pridáva

| Riziko | Prečo je reálne | Protiopatrenie |
|---|---|---|
| Stará bundle + nový `localStorage` | Service worker cachuje bundle, plán je v prehliadači, koordinovaný rollout neexistuje | `upgradePlan` tolerantný **v oboch smeroch**; každé nové pole optional alebo defaultované **na mieste čítania**, nie iba v migrácii |
| Sedem goldenov sa prepíše viac než v jednom riadku | `UPDATE_GOLDEN=1` je jeden príkaz a diff sa dá odklikať | V review vyžadovať presne sedem jednoriadkových diffov; každé iné číslo = nová cesta presakuje do starej |
| `reserve-below-floor` začne padať nájomníkom | Nájom vstupuje do podlahy, čo je správne | Nezakrývať; vysvetliť v copy sekcie |
| Zbalená stránka sa vytlačí zbalená | CSS-only riešenie nedokáže vrátiť nevykreslený obsah | Stav v Reacte + `beforeprint`; CSS pravidlo iba ako druhá poistka |
| Rotujúci h1 rozbije e2e alebo hydratáciu | `textContent` obsahuje šesť reťazcov; interval a listenery v efektoch | `toContainText`, slogan 1 na indexe 0, prvý slogan literál na oboch stranách |
| Refaktor sa rozšíri na prepisovanie celej appky | 220 inline štýlov je pozvánka | Kategórie, nie súbory; grep guardy s klesajúcim baseline v CI |

### Fáza 2.5c — Zdroje a verdikt na landing page (hotové 25. 8. 2026)

Dve pripomienky z prevádzky, obe opravené a odmerané.

#### 2.5c.1 Mŕtve odkazy na `/parametre`

Používateľ nahlásil 404 na ČNB a NBS. Prešiel sa **každý** URL, ktorý sa dá dostať zo
`allParameters()` a z `DEFAULTS_META` — 21 adries — a každá bola skutočne stiahnutá a prečítaná,
nie odhadnutá podľa vzoru. Šesť z nich bolo mŕtvych:

| Bolo | Je | Prečo padlo |
|---|---|---|
| `cnb.cz/cs/dohled-financni-trh/…/stanovovani-limitu-uverovych-ukazatelu/` | `cnb.cz/cs/financni-stabilita/makroobezretnostni-politika/stanoveni-horni-hranice-uverovych-ukazatelu/` | ČNB presunula stránku do inej sekcie |
| `nbs.sk/dohlad-nad-financnym-trhom/politika-obozretnosti-na-makrourovni/` | `nbs.sk/financna-stabilita/nastroje-fs/{ltv,dsti,dti}/` | NBS nahradila jednu rozcestníkovú stránku stránkou na nástroj — a to je lepšie: každá uvádza svoj vlastný limit |
| `mpsv.cz/-/rodicovsky-prispevek` | `up.gov.cz/rodicovsky-prispevek` | 302 na `mpsv.gov.cz`; dávku vypláca Úrad práce, tak odkazujeme naň — a stránka priamo potvrdila 350 000 Kč |
| `socpoist.sk/materske` | `socpoist.sk/socialne-poistenie/nemocenske-poistenie/materske/dalsie-informacie-materske` | Presmerovanie prestalo existovať; nová stránka potvrdila 34 / 37 / 43 týždňov aj 75 % |
| `upsvr.gov.sk/socialne-veci-a-rodina/rodicovsky-prispevok` | `slov-lex.sk/pravne-predpisy/SK/ZZ/2009/571/` | ÚPSVaR stránku presunul už viackrát; zákon sa nehýbe |
| `oecd.org/economy/growth/OECD-Note-EquivalenceScales.pdf` | Eurostat glossary *Equivalised disposable income* | PDF z oecd.org zmizlo; Eurostat definuje tú istú škálu 1,0 / 0,5 / 0,3 |
| `deloitte.com/cz/cs/issues/real-estate/property-index.html` | `deloitte.com/cz-sk/en/Industries/real-estate/research/property-index.html` | Deloitte prešiel na `cz-sk` doménovú štruktúru |
| `cnb.cz/arad/` | `cnb.cz/cs/statistika/menova_bankovni_stat/harm_stat_data/mir_cs.htm` | ARAD odpovedal prázdnou SPA schránkou — odkaz na konkrétnu tabuľku (B3 vklady, B4 nové úvery) namiesto na aplikáciu |
| `csu.gov.cz/rychle-informace/prumerne-mzdy-1-ctvrtleti-2026` | `csu.gov.cz/zamestnanci-a-mzdy` | Fungovalo, ale kvartálny URL je mŕtvy v momente, keď je číslo prekonané — stabilná stránka ukazovateľa |
| `zakonyprolidi.cz/cs/1995-155` | `cssz.gov.cz/starobni-duchod-podrobne` | Bot-blokované; a stránka, ktorá číslo uvádza, je lepšia než zákon, ktorý si čitateľ musí nájsť |
| `zakonyprolidi.cz/cs/1992-586` | `financnisprava.gov.cz/cs/dane/dane/dan-z-prijmu/fyzicke-osoby` | to isté |

Zároveň sa opravili tri veci, ktoré tá kontrola odhalila:

- **`allParameters()` zahadzovalo zdroje.** Riadok `leave.regime` posielal na stránku
  `sources[0]` a zvyšok ticho vyhodil — takže zdroj rodičovského príspevku, teda konštanta
  v tomto balíku najpravdepodobnejšie zastaraná, nebol na `/parametre` vidieť vôbec. Riadok
  teraz nesie `sources: string[]` a stránka vypíše všetky.
- **`note` sa nikde nezobrazoval.** Stránka tvrdila „neoverené" bez toho, aby povedala čo
  presne nebolo overené. Poznámka je teraz pod názvom parametra.
- **CZ DSTI a DTI dostali `unverified: true`.** Stránka ČNB uvádza výslovne iba hranice LTV;
  45 / 50 / 8,5 pochádza z opatrenia z roku 2023 a treba ho prečítať. Predtým boli označené
  ako overené, čo nebola pravda.

Naopak, `unverified` **zmizlo** z SK `dtiMaxMultiple` — NBS stránka uvádza 8× ročného príjmu do
veku 40 rokov, takže hodnota je potvrdená primárnym zdrojom.

**`pnpm sources:check`** (`scripts/check-sources.mjs`) požiada o každý URL a vypíše mŕtve.
Nie je v CI: potrebuje sieť a tretie strany nemajú padať cez náš build. Za egress proxy
odpovedia všetky hosty 403 a skript to sám povie, aby sa taký beh nečítal ako 21 rozbitých
odkazov.

Zmena sa dotkla `packages/jurisdictions/src/{cz,sk}.ts`, ktoré engine guard sleduje — ale
menili sa iba `source`, `note` a komentáre, žiadne číslo. Preto `--accept` a **žiadny bump**
`ENGINE_VERSION`; potvrdzuje to 77 engine testov a 10 goldenov bez zmeny.

#### 2.5c.2 Verdikt nad grafom: červený výkričník → zelená fajka

Príkladová domácnosť má teraz **odrážky** namiesto odstavca — päť čísel v jednom bloku prózy je
blok prózy, ktorý nikto nečíta.

Veta nad grafom je nový blok `.verdict[data-state]` s tromi stavmi. Stav sa odvíja od **deficitu**,
teda od nálezu, proti ktorému bola každá možnosť dokázaná — a nie od „žiadne nálezy", čo je
rozhodnutie, ktoré si vyžiadalo meranie: v tomto príklade **každá** z troch možností deficit
odstráni a **každá** za sebou nechá miernejší `reserve-below-floor`. Pravidlo „zelená, až keď
nezostane nič" by sa teda nikdy nespustilo — používateľ by stlačil *Použiť*, videl graf vyskočiť
nad nulu a aj tak by dostal vynadané.

| Stav | Kedy | Ako vyzerá |
|---|---|---|
| `alarm` | rezerva ide pod nulu | červený `!` v krúžku, koniec vety („bude chýbať 91 729 Kč") červený a `nowrap` |
| `fixed` | použité, nezostal žiadny nález | zelená `✓`, veta hovorí, čo sa vyriešilo |
| `improved` | použité, deficit zmizol, zostáva miernejší nález | zelená `✓` na tom, čo sa naozaj vyriešilo, a zostatok pomenovaný pod tým o jednu veľkosť nižšie |

`improved` je jediné miesto, kde sa dala urobiť chyba a nespraviť ju stálo rozhodnutie: zelená
fajka je pravdivá (to, čo možnosť sľúbila, sa stalo), a to, čo zostáva, je povedané tou istou
vetou, takže sa nič neskrýva.

Zvýraznenie sumy je jediná landing-only kópia (`landing.verdictDeficit`) s tagom `<hi>`. Spoločné
`problems.*.title` renderuje planner obyčajným `t()`, takže tag v nich by ten hovor rozbil; iný
nález ako `reserve-deficit` padne späť na spoločnú vetu bez zvýraznenia, nezmizne.

Riadok `.suggest-outcome` sa zredukoval na pozvánku stlačiť *Použiť* — výsledok hlási verdikt nad
grafom a dve vety o tom istom by si konkurovali.

Overené: 48 e2e (červená → zelená, `data-state`, glyf, `verdict-rest`), oba guardy, screenshoty
v svetlom aj tmavom režime a na 412 px.

### Fáza 2.5d — Skóre nastavenia financií a mená osôb (analýza + implementácia, 25. 8. 2026)

#### 2.5d.1 Čo sa žiadalo

Dve veci. Menšia: v kroku 2 sa rok narodenia ukazoval predtým, než si používateľ vybral, či
plánuje sám alebo za dvoch, a osoba nemala meno. Väčšia: **po vyhodnotení nemá byť iba graf, ale
aj percento „ideálnosti" nastavenia**, rozbaliteľné na jednotlivé rozmery s vysvetlením a smerom,
kam sa má domácnosť pohnúť — vrátane rady „príliš si šetríš, investuj viac".

#### 2.5d.2 Výskum: čo z „zlatých štandardov" vôbec obstojí

Toto bolo treba zistiť skôr, než sa napíše jediné číslo, pretože väčšina pravidiel osobných
financií, ktoré znejú ako výskum, výskum nie sú. Prehľad, ktorý stojí za celým skóre:

| Pravidlo | Skutočný stav |
|---|---|
| **50/30/20** | Kniha z roku 2005 (Warren & Tyagi), **žiadne peer-reviewed overenie neexistuje**. Číslo 30 nemá odvodenie — je to zvyšok po 50 a 20. A strop 50 % je pre veľkú menšinu domácností aritmeticky nedosiahnuteľný: Harvard JCHS namerali, že **polovica amerických nájomníkov dáva na bývanie a energie viac než 30 %** príjmu. |
| **3–6 mesiacov rezervy** | Konvencia, o ktorej **JPMorganChase Institute v tlači píše, že „nie je empiricky podložená"**. Ich vlastný stress test na transakčných dátach ~65 000 domácností vychádza na **~6 týždňov** čistého príjmu. Vanguard nezávisle nachádza prah pri **2 000 $**. Tri metódy, ten istý rád veličiny — a je to *výrazne menej* než konvencia. |
| **8–12 mesiacov rezervy** | Suze Orman, ktorá pre to sama neuvádza výskum, ale „pokoj v duši". Nie je to zdroj. |
| **15 % z hrubého na dôchodok** | Fidelity. Aritmeticky v poriadku, ale **predpokladá začiatok v 25 a započítava príspevok zamestnávateľa** — a ten tu ako norma neexistuje. |
| **70–80 % náhradový pomer** | Profesionálny rozptyl je 60–85 %, takže tá presnosť je falošná. Biggs (Wharton Pension Research Council) ukazuje, že **wage-indexing vs price-indexing pohne odpoveďou o ~12 bodov** pri tej istej osobe. |
| **4 % pravidlo** | Jediné s primárnym empirickým základom (Bengen 1994, SAFEMAX 4,15 %). Dnes: Bengen sám 4,7 %, Morningstar 3,7–3,9 % — a **nehádajú sa o predpoveď, ale o otázku**. Bengen sa pýta „čo prežilo najhoršiu historickú kohortu", Morningstar „čo prežije 90 % simulácií z dnešných valuácií". |
| **Splať dlh, ktorého úrok prevyšuje výnos** | **Nemá primárny zdroj a nepotrebuje ho** — je to dedukcia: splatenie dlhu s úrokom *r* dá istý, bezrizikový výnos presne *r*. Najrobustnejšie pravidlo v celom výskume je práve to, ktoré nikto neskúmal. |
| **Akcie vs hotovosť** | Dimson–Marsh–Staunton, **1900–2024, 35 trhov**: akcie 5,2 % reálne ročne, hotovosť 0,5 %. Prémia ~4,7 p. b. ročne. Toto je najlepšie podložené číslo z celého výskumu a je to celý kvantitatívny obsah pojmu „cash drag". |

**A regionálne dáta, ktoré menia obraz úplne:**

| | Česko | Slovensko | EU-27 |
|---|---|---|---|
| Miera úspor domácností (Eurostat `tec00131`) | **19,2 %** (2025) | **8,1 %** (2024) | 14,3 % (2025) |
| Nedokáže zvládnuť neočakávaný výdavok (EU-SILC `ilc_mdes04`) | **18,7 %** (2025) | **26,0 %** (2025) | 29,2 % (2025) |
| Náhradový pomer 1. piliera (EC Ageing Report 2024) | 42,7 % → ~40 % | 38 % → **33 %** (2070) | — |
| Povinný fondový pilier | **žiadny** | áno, 4 % | — |

České domácnosti šetria takmer 20 % disponibilného príjmu — jedna z najvyšších hodnôt v EU.
Slovenské 8 % — polovica európskeho priemeru a jedna z najnižších. **Jeden „stredoeurópsky"
benchmark pre obe krajiny by bol nezmysel**; sedia na opačných koncoch rozdelenia EU.

#### 2.5d.3 Rozhodnutia, ktoré z toho vyplynuli

1. **Skóre sa počíta výhradne z toho, čo `simulate()` už vrátil.** Žiadny paralelný model. Toto je
   to isté pravidlo, ktoré drží landing page a graf v súlade: keby skóre malo vlastnú aritmetiku,
   mohlo by tvrdiť „rezerva 90 %" nad grafom, ktorý ide pod nulu.
2. **50/30/20 sa nepoužije.** Nie preto, že je populárne, ale preto, že strop 50 % je pri českej
   a slovenskej cene bývania voči príjmu nedosiahnuteľný pre časť používateľov a 30 % nemá
   odvodenie. Namiesto podielov na kategórie meriame **priestor v rozpočte** — či po všetkom
   vôbec niečo zostáva.
3. **Regulatórny limit nie je cieľ domácnosti.** NBS 60 % DSTI je hranica, za ktorou *banka musí
   odmietnuť*, nie zdravý rozpočet. Skóre má vlastný, výrazne nižší poradný prah a **na
   regulatórnom strope dáva nulu** — bod, v ktorom ťa banka musí odmietnuť, nie je prechodová
   známka. (Mimochodom, 45 % DSTI a 8,5× DTI v ČR sú **deaktivované** od 1. 7. 2023; záväzné je
   iba LTV. To si vyžiadalo opravu poznámok na `/parametre`, ktoré som pred hodinou označil len
   ako „neoverené" — sú presnejšie ako to.)
4. **Cieľová miera investovania ide do `packages/jurisdictions`, nie do skóre.** Je to per-country
   konštanta s `verifiedAt`, zdrojom, `unverified: true` a poznámkou — presne ako každá iná
   konštanta na `/parametre`. Dôvod: je to **benchmark, nie výstup dôchodkového výpočtu**, a keď
   je viditeľná a datovaná, dá sa jej oponovať. Zahrabaná v skóre by sa jej oponovať nedalo.
5. **Over-saving penalizuje rozmer „Investovanie", nie „Rezerva".** Domácnosť s 18 mesiacmi
   v hotovosti nemá zlú rezervu — má zlé rozloženie. Vanguard číta tú istú konvenciu 3–6 mesiacov
   ako **3 mesiace v hotovosti + zvyšok v dostupných, ale investovaných** aktívach, takže sa dá
   povedať „máš priveľa hotovosti" bez toho, aby sme popreli pravidlo o rezerve.
6. **Penalizácia hotovosti je podmienená tým, že rezerva neklesá pod podlahu.** Toto je etická
   poistka, nie detail: pre finančne krehkú domácnosť je likvidita cennejšia než optimalizácia
   (St. Louis Fed: +100 $ likvidných aktív znižuje delikvenciu na účtoch o 8,3 p. b.). Rada
   „investuj namiesto šetrenia" daná niekomu, kto nemá na nečakaný výdavok, je škodlivá rada.
7. **Váhy sa presúvajú podľa plánov.** Keď je v horizonte dieťa (alebo `childrenIntent === 'yes'`),
   likvidita váži viac a dlhodobé investovanie menej. Cieľ rezervy sa **neposúva ručne** — engine
   počíta podlahu z výdavkov *daného mesiaca*, takže rodičovská cieľ zdvihne sama. Nedá sa to
   rozsynchronizovať, pretože je to to isté číslo.

#### 2.5d.4 Rozmery a krivky

| Rozmer | Meria | Váha (bez detí / s dieťaťom) |
|---|---|---|
| **Rezerva** | `reserveAtWorst / floorAtWorst` — 0 pri deficite, 100 na odporúčanej podlahe | 0,30 / **0,38** |
| **Investovanie** | mesačné vklady / čistý príjem voči cieľu krajiny, mínus penalizácia za prebytočnú hotovosť | 0,30 / 0,22 |
| **Dlhy** | podiel splátok na čistom príjme; **strop 55 bodov**, ak má akýkoľvek dlh vyšší úrok než očakávaný výnos | 0,20 / 0,20 |
| **Priestor v rozpočte** | prebytok prvého mesiaca / čistý príjem, cieľ 10 % | 0,20 / 0,20 |

Rozmer „Dlhy" má strop, nie odpočet: keď domácnosť platí 22 % na karte a čaká 7 % z ETF, je to
istá strata proti neistému výnosu a žiadny iný dobrý parameter to nemá vyvážiť.

#### 2.5d.5 Čo skóre nesmie robiť

- **Nesmie porovnávať s inými používateľmi.** Nie je to kreditné skóre a nikdy sa tak nesmie čítať.
- **Nesmie tvrdiť dôchodkový výsledok.** Nemodelujeme dekumuláciu, takže veta „toto vám zaručí
  rovnaký životný štandard na dôchodku" v produkte **nebude** — je to presne to tvrdenie, na ktoré
  nemáme model. Namiesto toho: cieľ je benchmark a je označený ako benchmark.
- **Nesmie odporučiť produkt.** Ani banku, ani fond, ani poistku.
- **Nesmie existovať bez rozpisu.** Jedno číslo bez dôvodov je veštba; každý rozmer nesie svoje
  číslo, vetu, prečo, a jeden konkrétny ďalší krok.

#### 2.5d.6 Čo pri implementácii spadlo (a prečo je to v dokumente)

Tri veci, ktoré prežili až do behu a zhodili ich testy alebo screenshot. Sú tu, pretože každá
je poučenie o skóre ako o žánri, nie preklep.

1. **Advice preskočilo na „hromadíš hotovosť" pri 1,2 mesiaca nad hranicou.** Komentár v kóde
   tvrdil „mesiac nad líniou je štuchnutie, rok je titulok" — a kód to nerobil, penalizácia aj
   titulok reagovali na tú istú nulu. Domácnosť so siedmimi mesiacmi hotovosti dostala ako
   hlavný nález cash pile namiesto toho, že neinvestuje nič. Zavedené
   `MATERIAL_CASH_EXCESS_MONTHS = 3`: **skóre reaguje od prvého mesiaca, titulok až od tretieho.**
2. **Kompozit spriemeroval fatálnu chybu.** Slovenský landing príklad dostal **58 %** — tri
   silné rozmery nesúce rezervu na 7. Plán, ktorý sa dostane pod nulu, čítaný ako trojka.
   Doplnený `DEFICIT_OVERALL_MAX = 45`: deficit nie je jedna zo štyroch úvah, je to nefunkčný
   plán, a žiadna disciplína v investovaní ho nesmie prekričať.
3. **Rozmer si protirečil sám so sebou.** „Priestor v rozpočtu **91 %**" a pod tým veta
   „prebytok je malý", pretože advice žiadal celých 100 a tón sa lámal na 70. Zosúladené na tú
   istú sedemdesiatku, ktorou UI zafarbuje riadok nazeleno — a uzamknuté testom.

A jedna vec, ktorú zachytil style-guard: pruh skóre bol `<div>` s inline `inlineSize`.
Ratchet ho odmietol správne — element, ktorý znamená „toľkoto zo sto", už existuje. Je to
`<progress>`, prináša si rolu aj hodnotu sám a nepotrebuje `aria-label`, ktorý screen readeru
vysvetľuje farebný obdĺžnik.

#### 2.5d.7 Mená a rok narodenia

Rok narodenia sa zjaví **až po** voľbe „jeden dospelý / dvaja dospelí" — predtým sa pýtal na rok
narodenia osoby, o ktorej ešte nebolo rozhodnuté, či existuje. Meno je nové, **voliteľné**, so
štítkom „voliteľné" a s vetou, že zostáva v prehliadači; placeholder aj default zostávajú
`Osoba 1` / `Osoba 2`, takže prázdne pole nikde nevytvorí prázdne miesto v texte.

### Fáza 2.5e — Menej textu (hotové 25. 8. 2026)

Landing page stratila štyri bloky prózy a panel skóre svoj disclaimer. Všetko odstránené bolo
pravdivé a nič z toho nikto nečítal — a každý blok tlačil graf, teda jedinú vec na stránke, ktorá
naozaj argumentuje, nižšie.

Tri kartičky sú teraz **tri slová a ikona**. Ikony sú inline SVG: CSP zakazuje tretiu domenu a
ikonový font pre tri glyfy by bol absurdný. E2e test kontroluje, že každý štítok má **najviac
štyri slová** a že sa tam nevrátil žiadny odstavec.

Caveat skóre sa presunul do `methodology.limits` na `/metodike` — do zoznamu, ktorý už vypisuje,
čo model nerobí. Tie dve tvrdenia, ktoré skóre nesmie robiť (porovnanie s inými, dôchodkový
výpočet), musia existovať niekde, a zoznam obmedzení je lepší domov než odstavec pod číselníkom,
ktorého sa nikto na nič nepýtal. Test kontroluje, že tam obe sú.

**Zelený štvorec okolo číselníka bola kolízia názvov tried.** `.ring` je Tailwindová utilita —
`box-shadow: 0 0 0 1px currentColor` — takže vlastná trieda toho istého mena zdedila 1px obrys
v tónovej farbe, ktorý vyzeral ako zámer. Premenované na `.gauge`; opravou je **názov, nie
override**, pretože trieda kolidujúca s utilitou je chyba čakajúca na ďalšiu utilitu.

Ratchety klesli: inline štýly 150 → 141, magické čísla 107 → 99.

#### Pozor pri doručovaní na macOS mount

Bridge do používateľovho stroja **nedovolí unlink**, takže obyčajný `tar -xzf` vytvorí len nové
súbory a všetky zmenené **ticho preskočí** — repozitár skončí v stave, ktorý sa ani nepreloží.
Vždy `tar -xzf ... --overwrite` (truncate namiesto unlink).

### Fáza 2.5f — Jedna vec, ktorá hovorí „začni tu" (hotové 25. 8. 2026)

Primárne tlačidlo v hlavičke smerovalo na `/plan`, čo je zároveň prvá destinácia v tej istej
lište — dva ovládacie prvky pre jednu route. Tlačidlo je preč a **akcent sa presunul na
destináciu, ktorú duplikovalo**, nie zmazaný spolu s ním: lišta má stále presne jednu vec, ktorá
hovorí „začni tu", a o jeden prvok menej.

Aktívny stav to neruší — bol už predtým postavený na troch signáloch (`aria-current`, 2px lišta,
váha 650) a farba medzi nimi zámerne nebola, takže akcentovaný odkaz a aktuálna stránka sú
rozlíšiteľné aj vedľa seba.

CTA sa prestalo menovať „Vyskúšať — bez registrácie" a menuje sa **„Vytvoriť prehľad"** —
pomenúva, čo vznikne, nie čo to nestojí.

### Fáza 2.6 — Hodnotenia od používateľov (analýza hotová, implementácia pauznutá)

> Analýza je dokončená 25. 8. 2026, implementácia odložená. Toto je jediná funkcia v celom
> produkte, ktorá **potrebuje server** — a tým sa dotýka tvrdenia, na ktorom stojí celá landing
> page. Preto je tu rozpísaná do rozhodnutí, nie do úloh: úlohy sú triviálne, rozhodnutia nie.

#### 2.6.1 Prečo je to iná trieda funkcie než všetko doteraz

Doteraz appka nekomunikuje s ničím. `connect-src 'self'` v CSP nie je náhoda ani lenivosť — je
to vynútenie tvrdenia „vaše čísla neopustia prehliadač". Hodnotenie musí odísť a musí ho vidieť
každý. To je prvá trhlina v tom tvrdení, a preto ju treba spraviť tak, aby tvrdenie zostalo
pravdivé, nie tak, aby sa dalo obhájiť.

**Kľúčové rozhodnutie: prehliadač nehovorí so Supabase, hovorí s vlastným API routom.**
Volanie Supabase priamo z klienta by znamenalo (a) rozšíriť CSP o cudziu domacinu a (b) poslať
anon kľúč v bundle. Route handler na rovnakom origine znamená, že **CSP sa nemení ani o znak**,
kľúč zostáva na serveri a stránka naďalej nekontaktuje nikoho. Server áno — v jej mene, kľúčom,
ktorý stránka nikdy nevidí. Overené: pri tomto rozdelení zostali všetky stránky statické (`●`)
a dynamický je jediný `/api/reviews` (`ƒ`).

#### 2.6.2 Sedem rozhodnutí

1. **Typ hodnotenia nemá pole pre nič z plánu.** Nie zostatok, nie dno, nie odvodené číslo.
   Hodnotenie nesie počet hviezdičiek, nepovinnú vetu a nepovinné meno. Nemožnosť je
   **štrukturálna**, nie sľub v komentári — a e2e test tvrdí, že POST obsahuje presne štyri
   kľúče (`rating`, `text`, `name`, `locale`).
2. **Nič sa nezverejní bez schválenia.** `status` má default `'pending'`. Verejný zapisovací
   endpoint na bezplatnom produkte raz dostane spam a raz aj nadávku — a toto je tvoja
   portfóliová stránka. Ručné schvaľovanie je jediný zodpovedný default.
3. **Nikdy vymyslené hodnotenie.** Keď nie je nič schválené, stena sa nevykreslí vôbec — žiadne
   placeholdery, žiadne „ukázkové" recenzie. Vymyslený posudok je lož v cudzom hlase.
4. **Priemer sa neukazuje pod 5 hodnotení.** „5,0 z 2 hodnotení" je číslo bez informácie.
   Do piatich sa zobrazí len počet.
5. **Meno áno, ale nepovinné a bez e-mailu.** Stena samých „Anonymne" nemá ako sociálny dôkaz
   cenu; placeholder navádza na „Jana z Brna" (krstné meno + mesto), čo je menej osobných údajov
   pri rovnakej dôveryhodnosti. **E-mail sa odmieta**, nie potichu odstraňuje — ľudia ho lepia do
   všetkého, čo sa menuje „meno", a stena je verejná. Kontrola e-mailu ide **pred** kontrolou
   odkazu, lebo `jana@example.com` matchuje oboje a užitočná správa je tá o e-maili.
6. **Nie modál.** Zadanie hovorí „vyskočí", ale dialóg prehodený cez cudzie rodinné financie
   v momente, keď na ne prvýkrát pozerá, prerušuje presne to, po čo prišla. Karta na konci
   verdiktu, s ~4 s odkladom: dosť dlho na prečítanie odpovede, dosť krátko, aby sa na ňu ešte
   pozeral. Pýtať sa **raz za život** — odoslanie aj odmietnutie sa pamätá.
7. **Pýtať sa len toho, kto naozaj prešiel otázkami.** Kto dal „preskočiť", videl národný priemer,
   nie svoju domácnosť, a nemá čo hodnotiť. (Pri analýze sa ukázalo, že „preskočiť" a „zobraziť
   plán" viedli na tú istú funkciu — `finishWizard` teraz rozlišuje `completed`, a to rozlíšenie
   je v kóde už teraz, aby sa ho nemuselo rekonštruovať.)

#### 2.6.3 Ochrana proti zneužitiu

Verejný neautentizovaný zápis potrebuje strop. **Neukladá sa IP adresa** — ukladá sa
`sha256(tajná soľ + adresa)` vo **vlastnej tabuľke**, ktorá je počítadlo, nie log, a maže sa po
siedmich dňoch. Bez nastavenej soli sa throttle **preskočí**, namiesto toho, aby ukladal niečo
slabšie, než tvrdia zásady. Strop 3 za deň na haš: pre človeka štedrý, pre skript nepoužiteľný.
Záznam sa píše **až po úspešnom vložení**, takže odmietnuté odoslanie nespáli návštevníkovi limit.

RLS je zapnuté na oboch tabuľkách a **žiadna politika nepúšťa anonymný prístup** — všetko ide cez
route handler so service kľúčom, ktorý RLS obchádza. Tabuľky sú tak z internetu nedosiahnuteľné
a anon kľúč nie je v prehliadači vôbec potrebný.

#### 2.6.4 Čo treba k spusteniu (a čo je už napísané)

SQL je hotové a v repozitári: **`supabase/reviews.sql`** — dve tabuľky, obmedzenia, indexy, RLS,
poznámky k moderovaniu a k retencii. Zvyšok je na tebe, lebo to sú účty:

- [ ] Spustiť `supabase/reviews.sql` v SQL editore Supabase
- [ ] Nastaviť na Verceli `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REVIEW_IP_SALT`
- [ ] Naplánovať dennú purge `review_throttle` (Supabase → Integrations → Cron)
- [ ] `apps/web/src/lib/reviews.ts` — čistý modul: typy, validácia, sanitácia, `summarise`, `forReader`
- [ ] `apps/web/src/lib/supabase.ts` — REST cez `fetch`, **žiadna závislosť**, len na serveri
- [ ] `apps/web/src/app/api/reviews/route.ts` — GET schválené (cache 5 min), POST ako `pending`
- [ ] `StarRating` ako **skutočná radio group** (šípky, tab, popis „4 z 5" textom vedľa hviezd);
      `.star` musí mať `position: relative` a `svg` `pointer-events: none` — inak sa všetkých päť
      skrytých inputov zloží na jedno miesto a klik na štvrtú hviezdu dopadne na cudzie SVG
- [ ] `ReviewPrompt` — karta na konci verdiktu, odklad, pamätá si odmietnutie, veta o tom, že sa
      neposiela nič z plánu, **priamo pri tlačidle** a nie v poznámke na inej stránke
- [ ] `ReviewWall` — fetch z `/api/reviews` v prehliadači, aby stránky zostali statické
- [ ] `/hodnoceni` ako plná stránka + tri najnovšie na landingu + odkaz vo footeri
- [ ] `zasady` — nová sekcia o tom, že hodnotenie je jediná vec, ktorá odchádza, a o hašovaní IP
- [ ] Testy: validácia (odkazy, e-maily, control znaky, dĺžky, „nemá kam dať číslo z plánu“),
      `summarise` pod aj nad hranicou priemeru, e2e na odklad, na „pýta sa raz“ a na obsah POSTu

**Jedna vec, ktorú si treba uvedomiť pri predvolených 5 hviezdičkách:** predvybrané maximum
posúva výsledok nahor. Chcel si to tak a je to legitímne (menšie trenie), ale na portfóliovej
stránke je stena samých päťok menej dôveryhodná než rozptyl. Ak by ťa to niekedy trápilo, stačí
zmeniť jedno počiatočné číslo.

### Fáza 3 — Launch #1 a rast (priebežne od konca fázy 2.5)

- [ ] 6–10 mikro-kalkulačiek ako SEO vstupné body, každá **lepšia než inkumbent**, každá končí „a teraz sa pozri, čo to spraví s vašou domácnosťou na 25 rokov": *kolik nás bude stát dítě · mateřská a rodičovská kalkulačka 2026 · můžeme si dovolit dítě · hypotéka a dítě · refixace hypotéky · kolik mít v rezervě* + SK ekvivalenty
- [ ] Reddit r/czech (636 tis.), r/Slovakia, r/czechrepublic — **ako príbeh, nie ako launch**: „simuloval som, čo spraví dieťa s financiami českého páru mesiac po mesiaci, a strašidelné nie sú náklady na dieťa, ale dno rezervy o štyri roky neskôr"
- [ ] Rodičovské komunity — Modrý koník, FB skupiny „plánujeme miminko". **Najvyššia konverzia, najnižšia konkurencia, úplne disjunktné od miest, kde marketuje fintech**
- [ ] Podcasty (Rozbité prasátko, Ve vatě, Vojta Žižka) — ponúkni moderátorovi prepočet jeho vlastných čísel pred pitchom
- [ ] FIRE a investičné FB/Discord skupiny v CZ/SK — najlepšie bug reporty
- [ ] Show HN + technický článok o binárnom hľadaní s verifikáciou — **najhodnotnejší portfóliový artefakt z celého plánu, viac než appka sama**. Až po dopilovaní
- [ ] Pitch pre CzechCrunch / Lupa / e15 s demografickým uhlom (pôrodnosť na 240-ročnom minime + 55 % viní peniaze), v januári alebo septembri
- [ ] Changelog, ktorý reálne udržuješ

### Fáza 4 — Voliteľné účty a synchronizácia (3–4 týždne)

Až keď o to ľudia požiadajú. Podmienka vstupu: aspoň niekoľko stoviek používateľov a opakovaná žiadosť.

- [ ] Supabase Auth: e-mail + heslo a magic link. **Custom SMTP (Resend) od prvého dňa** — vstavané 2 e-maily/hodinu sú v produkcii nepoužiteľné
- [ ] Schéma z §4 vrátane `is_household_member()` helpera
- [ ] **RLS politiky ako testy**, nie ako predpoklad. Test na každú tabuľku, že cudzia domácnosť nevidí nič
- [ ] Service-role key nikdy nikde, kam sa dostane klient
- [ ] **Šifrovanie plánu na klientovi** kľúčom odvodeným z používateľovej passphrase — server drží ciphertext, ktorý nedokáže prečítať
- [ ] Pozvanie druhého partnera do domácnosti, odchod člena, prenos vlastníctva
- [ ] Zmazanie účtu **v aplikácii** (Apple 5.1.1(v) to vyžaduje, keď existuje registrácia)
- [ ] Export všetkých dát a výmaz na požiadanie (GDPR čl. 15 a 17), funkčné, nie na papieri
- [ ] Cloudflare Turnstile, blokovanie disposable domén, stropy na počet scenárov
- [ ] Účet zostáva **voliteľný** — appka bez prihlásenia funguje naďalej v plnom rozsahu

### Fáza 5 — Notifikácie (2 týždne)

- [ ] `notification_preferences` (per typ, quiet hours, IANA timezone zbieraná pri registrácii)
- [ ] `notification_log` s unique constraintom a `on conflict do nothing`
- [ ] `pg_cron` → Edge Function, nočný prepočet a detekcia nových prekročení
- [ ] Web Push + VAPID, service worker. **Dokumentovať, že na iOS to funguje len po pridaní na plochu**, a naučiť to používateľa v produkte
- [ ] Štyri typy notifikácií z §7, nič viac
- [ ] Payload bez súm
- [ ] Mŕtvy token po 410 mazať
- [ ] Quiet hours: notifikáciu **neprepadni**, presuň za ich koniec
- [ ] Admin/SQL nástroj „čo by sa práve teraz poslalo domácnosti X" — inak sa to netestuje

### Fáza 6 — iOS (6–8 týždňov)

Vstupná podmienka: ~1 000 webových používateľov. Nativna appka pred tým nemá čo obhájiť.

- [ ] **Založiť s.r.o. a viesť Apple Developer Program na ňu** — Apple 5.1.1(ix). Cca 300 €, niekoľko týždňov, nedá sa retrofitnúť
- [ ] Expo (managed) + EAS, `apps/mobile`, **rovnaký `packages/engine`, žiadna reimplementácia**
- [ ] Nativne pôsobiaca navigácia a gestá, grafy cez Skia/`victory-native-xl`, **nikdy WebView graf**
- [ ] Push cez Expo Push, `push_tokens` tabuľka, refresh pri foreground
- [ ] Widget na plochu/lock screen: **mesiacov do dna rezervy** — jediná plauzibilná retenčná mechanika plannera
- [ ] Face ID / biometrický zámok plánu — najlacnejšia veľká výhra v dôvere
- [ ] Offline-first s tým istým enginom
- [ ] Metadata na App Store: **kalkulačka a simulátor na vzdelávacie účely**. Nikdy „poradenstvo", „investment", „money management" — to je 3.2.1(viii) a odmietnutie
- [ ] Zmazanie účtu v appke (5.1.1(v)), disclaimer na každej obrazovke s projekciou
- [ ] Dosť nativnych funkcií, aby 4.2 „repackaged website" nebola vôbec téma
- [ ] TestFlight beta s 20–30 ľuďmi z webu pred submitom
- [ ] Web a Edge Functions deployovať **z tej istej CI pipeline**, aby engine verzie nikdy nedivergovali

### Fáza 7 — Údržba a Android

- [ ] **Kalendárna udalosť na re-verifikáciu jurisdikčných parametrov**: 1. januára a 1. júla. Toto je najpravdepodobnejší zdroj nesprávnej projekcie
- [ ] Notifikácia o zmene zákona po každej aktualizácii parametrov
- [ ] GitHub Issues ako jediný kanál podpory — self-selektuje kompetentné hlásenia a je to portfóliový dôkaz
- [ ] Čestná politika odpovedí: „je to voľnočasový projekt, čítam všetko, odpovedám na čo stíham"
- [ ] Android z toho istého Expo kódu, keď iOS beží
- [ ] Neskôr, v poradí: viac detí, druhá nehnuteľnosť, príjem z prenájmu, strata práce, rozvod

---

## 9. Náklady

Kritická asymetria: **pri 10 000 používateľoch to stojí 0 €, ak sú účty voliteľné, a ~65 $/mes., ak sú povinné.**

| Používatelia | Čo praskne prvé | Reálny mesačný náklad |
|---|---|---|
| 100 | Nič. Domena je jediná položka | ~1 € |
| 1 000 | Nič, ak plány žijú v `localStorage` | ~1–2 € |
| 10 000 | Supabase egress a 500 MB DB → Pro 25 $; Vercel transfer → Pro 20 $; e-mail digest → Resend Pro 20 $ | ~65 $ (~1 600 Kč) |
| 100 000 | **Supabase Auth MAU** — Pro aj Team majú rovnakých 100k v cene, ďalej lineárne 0,00325 $/MAU bez lacnejšieho tieru | 150–400 $, široké pásmo podľa toho, či sú účty povinné |

**Skutočný strop nie sú peniaze, ale tvoj čas.** Pri 1–3 % kontaktnej miere je 10 000 používateľov 100–300 správ mesačne, teda 10–25 hodín — nekompatibilné so zamestnaním v Prahe. Free produkty majú **vyššiu** kontaktnú mieru než platené, pretože chýba cenový filter. **Praktický strop sólo projektu: 10–20 tisíc používateľov**, čo je násobne viac, než portfóliový kus potrebuje.

**Dve pasce:**
- **Vercel považuje žiadosť o dary za komerčné použitie.** Donate tlačidlo alebo GitHub Sponsors ťa presunie na Pro (20 $/mes.) — teda *žiadanie o peniaze na pokrytie nákladov je to, čo tie náklady vytvorí*.
- **Affiliate odkazy na Portu/Fondee/XTB by boli horšie než tých 20 $.** Provízia vedľa vety „zvýšte mesačný príspevok" zničí jediné, čo produkt tvrdí — že jeho odporúčania sú overené a nezaujaté. **Plochu odporúčaní nemonetizuj za žiadnu cenu.**

**Ak to niekedy prerastie free:** neúčtuj planner. Účtuj **hosting** — symbolický „supporter" nákup za cloud sync, viac zariadení a PDF export, s celým enginom a všetkými scenármi navždy zadarmo a použiteľnými bez účtu. Cena sedí na tom, čo naozaj stojí peniaze, a sľub zostáva doslovne pravdivý.

---

## 10. Register rizík

| Riziko | Dopad | Zmiernenie |
|---|---|---|
| **Zastaraná zákonná konštanta** | Ticho nesprávne projekcie bez chyby a bez varovania. **Toto je najpravdepodobnejší zdroj nesprávnej odpovede — nie bug v matematike** | `/parametre` s dátumami, verzovaný parameter set uložený pri pláne, kalendárna re-verifikácia 2× ročne, notifikácia pri zmene |
| **Chyba v RLS politike** | Únik príjmov, hypoték a mien detí tisícov domácností. 72 h hlásenie, článok v médiách, koniec portfóliovej hodnoty | Fáza 2 bez účtov vôbec; vo fáze 4 šifrovanie na klientovi, RLS ako testy, žiadny service-role key blízko klienta |
| **Apple 5.1.1(ix) — individuálny vývojár** | Odmietnutie iOS appky. Apple explicitne odmieta obchádzku „mám povolenie od firmy" | s.r.o. **pred** prvým submitom |
| **Apple 3.2.1(viii) — kategória money management** | Odmietnutie, požiadavka na licenciu | Metadata a copy vždy „kalkulačka a simulátor", nikdy poradenstvo. Nikdy sa nedotknúť reálnych účtov |
| **Investičné poradenstvo (zák. 256/2004) / poradenstvo o spotr. úvere (257/2016)** | Regulačný problém | Nikdy nemenovať nástroj, fond, ISIN, brokera ani bankový produkt. Nikdy neporovnávať poskytovateľov. Odporúčania **iba o vlastných parametroch používateľa**, nikdy o tom, čo kúpiť |
| **Dva enginy, dve odpovede** | Web povie január 2032, telefón február 2032 → celý produkt stráca dôveryhodnosť | Jeden `packages/engine`, jedna CI pipeline pre web aj Edge Functions |
| **Onboarding s 25 poliami** | 68 % opustenie, väčšina získaných používateľov stratená | Prefilled scenár + 4 mini-kroky + národné priemery ako defaulty |
| **Notifikačná únava** | Vypnutie notifikácií alebo zmazanie appky | Štyri typy, granulárne vypínateľné, quiet hours, žiadne sumy v payloade |
| **Voľba Expo namiesto Capacitoru je zlá** | Prepis mobilného UI | Hranica `packages/engine` drží cenu omylu na „prepíš UI", nie „prepíš produkt" |
| **Plné mesačné rady v `cached_result`** | Veľkosť DB praskne skôr než MAU | Cachuj iba súhrnné čísla, strop na počet autosave verzií, vynútené triggerom teraz |
| **Projekcia sa mýlila a niekto podľa nej rozhodol** | Reputačná udalosť | Panel citlivosti ako čestná odpoveď, predpoklady inline pri každom odporúčaní, dátum právneho stavu v UI, žiadne osobné písomné odporúčania e-mailom |

---

## 11. Otvorené otázky — každá za hodinu práce pred spustením

1. Ručne prezrieť `penize.cz/kalkulacky/narozeni-ditete` — je to najbližšie pomenovaný existujúci český nástroj a každé tvrdenie o novosti to má prežiť.
2. Hodina s právnikom na hranicu poradenstva. Odpoveď sa stane textom na landing page.
3. Overiť slovenské a české sumy dávok z primárnych zdrojov (MPSV, Sociálna poisťovňa, ČSSZ) a zafixovať zdroj pravdy pre ročnú re-verifikáciu. Dva sekundárne zdroje sa rozchádzali.
4. Potvrdiť oprávnenosť na Vercel/Supabase OSS sponzoring — mohlo by to znamenať doslova nulové náklady aj vo veľkosti.
5. Skontrolovať pracovnú zmluvu na IP klauzuly.
6. **Tailwind: prihlásiť sa k nemu (`@theme inline`) alebo ho odstrániť?** Dnes je nainštalovaný,
   je build dependency a produkuje nula utilít. Rozhodnutie patrí do commitu 1 fázy 2.5.
7. **Overiť koeficienty pre jednočlennú domácnosť** (OECD-modified equivalence scale) a typickú
   výšku nájmu v CZ a SK z primárneho zdroja — dnes sú to odhady a musia mať `verifiedAt`
   a riadok na `/parametre` ako každá iná konštanta.
8. **Overiť zákonný dôchodkový vek** v oboch krajinách (CZ 65 → 67 podľa novely z 2024;
   SK indexovaný na strednú dĺžku života) — bez neho sa slogan o dôchodku nesmie tvrdiť ako výpočet.

---

## 12. Zdroje

Plné citácie s URL sú v jednotlivých výskumných dokumentoch. Kľúčové primárne zdroje:

- [ProjectionLab — year-by-year](https://projectionlab.com/help/year-by-year) · [changemap (hlasovanie o funkciách)](https://changemap.co/projectifi/projectifi/)
- [ČSSZ — peněžitá pomoc v mateřství](https://www.cssz.gov.cz/penezita-pomoc-v-materstvi) · [KROS — dávky pracujúcich rodičov 2026](https://web.kros.sk/blog/pracujuci-rodicia-a-socialny-system-prehlad-davok-2026/)
- [ČSÚ — pôrodnosť na 240-ročnom minime](https://csu.gov.cz/produkty/pocet-narozenych-byl-loni-nejnizsi-za-poslednich-240-let) · [ČBA Hypomonitor](https://www.cbamonitor.cz/aktuality/cba-hypomonitor-zacatek-roku-2026-prinesl-silny-objem-hypotek)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) · [Apple Developer Program](https://developer.apple.com/programs/)
- [Next.js 16.3](https://nextjs.org/blog/next-16-3) · [Vercel pricing](https://vercel.com/pricing) · [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines) · [Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Supabase pricing](https://supabase.com/pricing) · [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) · [Supabase Cron](https://supabase.com/docs/guides/cron) · [Supabase SSR pre Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [ČNB — poskytovatelia spotrebiteľského úveru](https://www.cnb.cz/cs/dohled_financni_trh/vykon_dohledu/povolovaci_schvalovaci_rizeni/poskytovatele_spotrebitelskeho_uveru/index.html) · [ÚOOÚ — príručka k ochrane údajov](https://uoou.gov.cz/verejnost/zakladni-prirucka-k-ochrane-udaju)
- [Wilke — visualizing uncertainty](https://clauswilke.com/dataviz/visualizing-uncertainty.html) · [fintech onboarding](https://www.eleken.co/blog-posts/fintech-onboarding-simplification)

---

*Tento dokument je živý. Fázy 4–7 sa budú meniť podľa toho, čo sa naučíš vo fázach 1–3 — a to je v poriadku. Jediné, čo sa meniť nesmie, sú položky fázy 0 a hranica `packages/engine`.*
