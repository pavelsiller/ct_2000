# Úpravy proti verzi, která běží na brno2000.cz

Vydání vychází ze stavu kódu webu brno2000.cz z 18. listopadu 2026. Před zveřejněním bylo upraveno takto:

- Dlaždice mapy se čtou z demo serveru a data ze složky `public/data`, ne ze serverů webu.
- Živé zdroje (polohy MHD, počasí, ovzduší, doprava, fotky z ulice, webkamery) se čtou přímo z jejich služeb.
- Přiložená jsou jen data, která se smějí šířit. Ostatní soubory jsou prázdné, ve správném tvaru. Přehled je v [DATA.md](DATA.md).
- Některé vrstvy mají ukázková data. Bez datového serveru je stránka ukazuje bez ohledu na jejich stáří.
- Jízdní řád MHD je ukázkový: jeden týden z listopadu 2026, který se opakuje do 1. 1. 2050.
- Odstraněné: osobní údaje autora, měření návštěvnosti, ovládání ladicích nástrojů a části, které nejsou veřejné.
- Odstraněná část komentářů a textů, které se týkaly provozu webu.
- Vrstva meteostanic ukazuje jen stanice s otevřenou licencí.
