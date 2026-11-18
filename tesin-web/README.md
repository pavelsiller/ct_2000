# Brno 2000 – zdrojový kód, verze 1.0 (18. 11. 2026)

Zdrojový kód webu [brno2000.cz](https://brno2000.cz/), pixelové mapy Brna. Brno 2000 vytvořil Mirek Kubásek.

Je to stav kódu webu z 18. listopadu 2026, upravený pro zveřejnění. Verzí 1.0 začíná nová řada s přepracovaným prohlížečem mapy. Starší vydání řady 0.x, postavená na projektu izomapa, jsou pod značkami [v0.1](https://github.com/MiroslavKubasek/brno2000/tree/v0.1), [v0.2](https://github.com/MiroslavKubasek/brno2000/tree/v0.2) a [v0.3](https://github.com/MiroslavKubasek/brno2000/tree/v0.3).

## Odkud projekt vychází

První verze prohlížeče vznikla 3. 11. 2026 podle webu [Izometrický Liberec](https://izomapa.fun/) a open-source projektu [izomapa](https://github.com/adamklatovsky/izomapa) od [Adama Klatovského](https://www.adamklatovsky.cz/) (AGPL-3.0). Z izomapy pocházela kostra prohlížeče: stavba stránky, názvy prvků a nastavení a část stylů.

Ve verzi 1.0 je prohlížeč přepracovaný, vzhled inspirovaný hrami 90. let zůstal. S tím, jak mapa rostla, bylo potřeba ji lépe přizpůsobit mobilům, na kterých ji otevírá 64 % návštěvníků. Projekt dál vychází z izomapy a kód zůstává pod stejnou licencí.

Mapové dlaždice vznikají samostatnými nástroji, které nejsou součástí tohoto repozitáře.

## Co je nového proti verzi 0.3

- Přepracovaný prohlížeč: lepší chování na telefonech, rychlejší start a přístupnější vzhled (kontrast, písmo, kontrastní zobrazení).
- Spojení: vyhledávání spojení MHD, cesta na mapě, nastupování a přestupy, co si vzít s sebou podle počasí.
- Moje: uložená místa, zastávky, spoje a pohledy na mapu (jen v prohlížeči).
- Brno teď: přehled toho, co se ve městě právě děje, jako samostatná stránka.
- Nové vrstvy a datové mapy: nádraží a vlaky, dopravní nehody, kriminalita, pocitová mapa, odstávky vody, události.
- Klidná mapa, snímek mapy ke sdílení a předčítání karet.

## Úpravy pro zveřejnění

Proti verzi, která běží na brno2000.cz:

- mapové dlaždice se čtou z demo serveru, vykreslené jen automaticky z otevřených dat;
- přiložená jsou jen data, která se smějí šířit, ostatní soubory jsou prázdné a některé vrstvy mají ukázková data;
- chybí osobní údaje autora, měření návštěvnosti a části, které nejsou veřejné.

Podrobněji v souboru [UPRAVY.md](UPRAVY.md).

## Data

Která data jsou přiložená a odkud jsou, je v souboru [DATA.md](DATA.md), i s licencemi. U služeb, ze kterých stránka čte přímo, platí i jejich podmínky (například bezplatné rozhraní Open-Meteo je určené pro nekomerční použití).

Jízdní řád MHD (`public/data/mhd.json`) je ukázkový: jeden týden z listopadu 2026 (23.–29. 11.), který se opakuje až do 1. 1. 2050. Polohy vozů jsou živé, odjezdy ze zastávek i nalezená spojení se od skutečných mohou lišit.

## Dlaždice mapy

Dlaždice na demo serveru `demo.brno2000.cz` slouží pouze k místnímu vývoji a vyzkoušení projektu. Pro veřejný provoz vlastní mapy si připravte vlastní dlaždice a jejich hosting.

Prohlížeč čte dlaždice z adresy v souboru `.env` (`VITE_MEDIA_BASE`) v této podobě:

- `tiles/r0/<období>/map.dzi` a složka `map_files/` vedle něj: pyramida Deep Zoom, dlaždice WebP o hraně 512 px bez překryvu. Celý obraz má 56 000 × 30 300 px.
- `tiles/r0/<období>/mini.webp`: malý obrázek celé mapy pro minimapu.
- Období jsou čtyři: `spring`, `summer`, `autumn`, `winter`. Mapa se otevírá v tom, které právě je.

Umístění mapy v terénu popisuje `public/data/r0/meta.json`. Polohy v datech (obrysy budov, ulice, popisky) jsou v obrazových bodech téhož rámce, vlastní dlaždice ho proto musí dodržet.

## Jak to spustit

Potřebujete Node.js 22 nebo novější.

```sh
npm install
npm run dev
```

Mapa poběží na adrese, kterou příkaz vypíše (obvykle `http://localhost:5173/`).

- `npm run build` sestaví stránku do složky `dist-public/` a vyrobí k ní stránky míst (`/misto/`). Na vývojovém serveru (`npm run dev`) stránky míst nejsou.
- `npm run preview` sestavenou stránku ukáže.

## Nastavení

- **`.env`**: adresa dlaždic (`VITE_MEDIA_BASE`). Prázdné `VITE_DATA_BASE` znamená data ze složky `public/data`.
- **`site.config.json`**: adresa webu, kontakt a měření návštěvnosti (vypnuté).
- **`vite.config.js`**: které části mapy jsou vypnuté (`HIDDEN`).

## Licence

Zdrojový kód je pod licencí [GNU AGPL-3.0](LICENSE). © 2026 Mirek Kubásek. Projekt vychází z projektu izomapa © 2026 Adam Klatovský (AGPL-3.0).

Kdo kód upraví a provozuje jako web, musí zveřejnit své úpravy pod stejnou licencí a zachovat informace o autorech.

Co pod licenci kódu nepatří:

- **Dlaždice mapy.** V repozitáři nejsou a mají vlastní podmínky (viz výše).
- **Data** ve složce `public/data`. Mají licence svých zdrojů (OpenStreetMap ODbL, otevřená data města Brna CC BY a další), jsou uvedené v [DATA.md](DATA.md).
- **Obrázky `public/og.png`, `public/og-hasici.png` a `src/img/prehled-mapa*.webp`.** Jsou to ukázky mapy z brno2000.cz.

Licence ke zdrojovému kódu sama o sobě neuděluje právo používat název a logo Brno 2000 jako označení vlastního projektu. Pokud na kódu postavíte vlastní web, použijte prosím vlastní název a vizuální identitu, aby nedocházelo k záměně.

Použité knihovny mají vlastní licence: [OpenSeadragon](https://openseadragon.github.io/) (BSD-3-Clause), písma z balíčků Fontsource (SIL OFL).
