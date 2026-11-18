# Český Těšín 2000 – Izometrická pixel-art mapa

Tento plán popisuje čtyřfázový postup vygenerování izometrické pixel-art mapy celého katastrálního území Českého Těšína z otevřených dat (ČÚZK, OpenStreetMap, celorepublikový GTFS) a její napojení na moderní webový prohlížeč **Český Těšín 2000** připravený k publikaci na GitHub.

---

## Kontrola a klíčová rozhodnutí uživatele

> [!IMPORTANT]
> Níže jsou shrnuty potvrzené preference z úvodních otázek a hlavní rozhodovací brána, na kterou budeme čekat po dokončení Fáze 1.

- **Územní rozsah (Potvrzeno)**: Celé katastrální území Českého Těšína (~33,8 km², česká strana pokrytá daty ČÚZK DMP 1G a ortofotem).
- **Publikace na GitHub (Potvrzeno)**: Udržet výsledný statický build a dlaždice v limitech běžného GitHub repozitáře (bez nutnosti externího media serveru či překročení limitu velikosti jednotlivých souborů).
- **Aktivní vrstvy a živé režimy (Potvrzeno)**:
  1. Provoz MHD, příměstských linek ODIS a vlaků podle reálných jízdních řádů GTFS.
  2. Reálné počasí, vítr a přepínání všech 4 ročních období (jaro, léto, podzim, zima).
  3. Noční režim a interaktivní klikací vrstva budov a ulic.
  4. Hlavní památky a body zájmu ve městě Český Těšín.
- **Otevřené rozhodnutí po Fázi 1 (Výběr rozlišení)**: Po založení města a přesném výpočtu počtu čtverců obdržíte srovnání velikosti na disku a odhadované doby CPU renderování pro základní (`0,2 m/px`) a detailní (`0,1 m/px`) rozlišení. Renderování spustíme až po Vašem výslovném potvrzení.

> [!WARNING]
> **Hardwarové limity prostředí (4 GiB RAM, 2 vCPU, bez GPU, 0 B swap, 503 GiB disk)**:
> Kontejner nemá GPU akceleraci ani swap paměť. Při souběžném renderování dlaždic a zpracování rozsáhlých rastrových/LiDAR dat proto omezíme paralelismus (1–2 procesy) a průběžně uvolníme mezipaměť, aby nedošlo k vyčerpání operační paměti.

---

## 1. Přehled a základní koncept

- **Co projekt dělá**: Spojuje generátor izometrických map *izomapa* a moderní webový prohlížeč *brno2000* do samostatného interaktivního průvodce městem **Český Těšín 2000** v estetice klasických budovatelských strategií.
- **Cílové publikum**: Obyvatelé a návštěvníci Českého Těšína, fanoušci městské dopravy, kartografie a pixel-artu.
- **Hlavní přínos**: Přehledná, rychle načítaná mapa s živým pohybem veřejné dopravy (MHD, ODIS, vlaky), sezónní atmosférou a lokálním hostováním všech dat na stejné doméně přímo z GitHub repozitáře.

---

## 2. Uživatelský zážitek a vizuální design

- **Průchod uživatele**:
  - Po otevření stránky se zobrazí celoplošný izometrický pohled na Český Těšín s okamžitým načtením přehledové vrstvy a postupným doostřováním Deep Zoom dlaždic při přiblížení.
  - Uživatel může plynule přepínat roční období (jaro, léto, podzim, zima) i noční režim, zapínat živé počasí a animovaný vítr nebo klikat na budovy, ulice a místní památky pro zobrazení detailních informací.
  - Animovaná vozidla MHD, regionálních linek ODIS a vlaků projíždějí po silniční a železniční síti v reálném čase podle jízdních řádů.
- **Vizuální identita a prostorová kompozice**:
  - *Estetický směr*: Retro-izometrický pixel-art inspirovaný *SimCity 2000* v čistém moderním celoplošném prohlížeči bez rušivých rámečků a scrollbaru.
  - *Barevná paleta a nálada*: Přirozené sezónní palety terénu a střech z ortofota, kontrastní noční nasvícení oken a ulic, poloprůhledné tmavé plovoucí ovládací panely nad mapovou plochou pro zachování čitelnosti HUD prvků.
  - *Typografie a čitelnost*: Jasná hierarchie popisků v sémantické DOM vrstvě nad plátnem, jednotná česká lokalizace bez brněnských zbytků a tabulární číslice pro jízdní řády a souřadnice.
- **Kredity a licence**: Patička i informační dialog zachovávají plné uvedení obou původních autorů (Adam Klatovský – *izomapa*, Mirek Kubásek – *brno2000*) v souladu s licencí **AGPL-3.0**.

---

## 3. Klíčová produktová rozhodnutí a kompromisy

- **Rozlišení vs. limity GitHub repozitáře**:
  - *Zvolený přístup*: Upřednostnit výpočet čtverců pro oba režimy (`0,2 m/px` vs. `0,1 m/px`) s doporučením `0,2 m/px` pro celé katastrální území (~33,8 km²) přes 5 renderovacích variant (4 období + noc).
  - *Proč*: Rozlišení `0,1 m/px` znamená 4× více pixelů a výrazně větší objem dlaždic, což při pokrytí celého katastru v 5 variantách může překročit pohodlné limity běžného GitHub repozitáře a násobně prodloužit CPU renderování.
- **Same-origin statické servírování bez externího media serveru**:
  - *Zvolený přístup*: Nastavit relativní načítání dlaždic a metadat v rámci jediné domény a zkopírovat kompletní výstup pyramidy, přehledového obrázku, obrysů i dopravy do veřejných podkladů webového prohlížeče.
  - *Proč*: Odstraňuje nutnost provozovat oddělený CDN/media server a umožňuje okamžité nasazení výsledné statické složky přímo přes GitHub Pages nebo jiný statický hosting.
- **Filtrace vrstev specifických pro původní brněnský projekt**:
  - *Zvolený přístup*: V konfiguraci buildu a aplikace skrýt brněnské vrstvy bez těšínských dat pomocí mechanismu `HIDDEN` a nahradit všechny brněnské texty, loga a body zájmu za obsah Českého Těšína.
  - *Proč*: Zachová se plná stabilita moderního prohlížeče bez rozbitých prázdných přepínačů a matoucího brandingu.
- **Konzervativní správa paměti při renderování**:
  - *Zvolený přístup*: Omezit počet paralelních procesů při generování dlaždic a čištění mezivýsledků a nepoužívat paměťově náročné hromadné procesy nad limit 4 GiB RAM.
  - *Proč*: Zabrání pádu kontejneru (OOM kill) při nepřítomnosti swapu a GPU.

---

## 4. Technická architektura a datová strategie *(Technická reference)*

### Architektura čtyřfázového workflow

```
┌────────────────────────────────────────────────────────────────────────────┐
│ FÁZE 1: Příprava repozitářů a kontrola prostředí                           │
│  ├─ Klon generátoru izomapa + prohlížeče brno2000 (tesin-web)              │
│  ├─ Nastudování dokumentace (AGENTS, CLAUDE, README, DATA, UPRAVY)         │
│  ├─ Instalace prostředí přes setup skript + ověření Python 3.11 / Node 22  │
│  └─ Založení města Český Těšín → výpočet čtverců → [BRÁNA: Volba rozlišení]│
└───────────────────────────────────────┬────────────────────────────────────┘
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ FÁZE 2: Otevřená data, GTFS doprava a renderování mapy                     │
│  ├─ Konfigurace města (pocasi: true, vitr: true, hlaseni: false)           │
│  ├─ Stažení geodat: OSM/Overture, ČÚZK DMP 1G, ortofoto, ZABAGED, terén    │
│  ├─ Stažení celorepublikového GTFS + ořez na Těšín → MHD, ODIS, vlaky      │
│  └─ CPU render: 4 roční období + noc → klikací overlay → Deep Zoom tiles   │
└───────────────────────────────────────┬────────────────────────────────────┘
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ FÁZE 3: Integrace do prohlížeče Český Těšín 2000                           │
│  ├─ Přenos Deep Zoom pyramidy, náhledu, metadat, obrysů, ulic a MHD dat    │
│  ├─ Relativní konfigurace cest (bez externího media serveru)               │
│  ├─ Rebranding webu + doplnění těšínských POI + skrytí brněnských vrstev   │
│  └─ Zachování AGPL-3.0 kreditů (Adam Klatovský, Mirek Kubásek)             │
└───────────────────────────────────────┬────────────────────────────────────┘
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ FÁZE 4: Produkční sestavení a příprava pro GitHub                          │
│  ├─ Produkční build statické aplikace                                      │
│  ├─ Kontrola ignore pravidel, limitu souborů (<100 MB) a celkové velikosti │
│  └─ Ověření relativních cest a připravenosti pro git push                  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Datový model a návaznost vrstev

- **Geoprostorová vrstva**: Hranice celého katastrálního území Českého Těšína, digitální model povrchu (ČÚZK DMP 1G), letecké ortofoto pro barvy střech a zeleně, ZABAGED a vektorové budovy/cesty z OpenStreetMap a Overture.
- **Dopravní vrstva**: Celorepublikový GTFS dataset oříznutý na zastávky a spoje procházející Českým Těšínem; trasy povrchové dopravy (MHD, ODIS, vlaky) dopočítané po reálné silniční a kolejové síti tam, kde chybí geometrie tras.
- **Interaktivní vrstvy a prostředí**: Konfigurace počasí a směru/síly větru, výpočty konvexních obrysů budov a ulic pro klikací dotazy a sada lokálních památek a bodů zájmu Českého Těšína.
- **Průběh ověřovacích bran**:
  1. Po **Fázi 1** předložíme zjištěné parametry kontejneru, počet čtverců a srovnání času/velikosti pro `0,2 m/px` vs. `0,1 m/px` a počkáme na Vaše potvrzení.
  2. Po **Fázi 2**, **Fázi 3** a **Fázi 4** vždy stručně shrneme výsledky, ověříme velikost dat pro GitHub a funkčnost relativních cest v produkčním buildu.
