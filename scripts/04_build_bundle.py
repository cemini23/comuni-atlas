#!/usr/bin/env python3
"""Compile the offline atlas bundle in data/built/.

Inputs (produced by scripts 01 and 02, plus the committed seed):
- data/raw/comuni.json
- data/raw/anpr_archivio_comuni.csv
- data/raw/centroids.json
- data/raw/provinces.geojson
- data/raw/seed_overlays.json
- data/raw/antenati_firecrawl.json  (optional)

The bundle is enough to run the site and the CLI with no network and no API key.
Sovereignty is modeled on the province that held the comune in that year.
The map uses today's provincial mesh, colored by that sovereignty.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
BUILT = ROOT / "data" / "built"
START = "1796-01-01"
END = "2026-12-31"

# Codes follow matteocontrini/comuni-json (current ISTAT), not older memorized lists.
GROUPS = {
    "piedmont": ["001", "002", "003", "004", "005", "006", "007", "096", "103"],
    "liguria": ["008", "009", "010", "011"],
    "lombardy": ["012", "013", "014", "015", "016", "017", "018", "019", "097", "098", "108"],
    "mantova": ["020"],
    "bolzano": ["021"],
    "trento": ["022"],
    "veneto": ["023", "024", "025", "026", "027", "028", "029"],
    "friuli": ["030", "093"],
    "giulia": ["031", "032", "801"],
    "parma": ["033", "034"],
    "modena": ["035", "036", "045"],
    "romagna": ["037", "038", "039", "040", "099"],
    "lucca": ["046"],
    "tuscany": ["047", "048", "049", "050", "051", "052", "053", "100"],
    "marche": ["041", "042", "043", "044", "109"],
    "umbria": ["054", "055"],
    "lazio": ["056", "057", "058", "059", "060"],
    "south": ["061", "062", "063", "064", "065", "066", "067", "068", "069", "070", "071", "072", "073", "074", "075", "076", "077", "078", "079", "080", "094", "101", "102", "110"],
    "sicily": ["081", "082", "083", "084", "085", "086", "087", "088", "089"],
    "sardinia": ["090", "091", "092", "095", "104", "105", "106", "107", "111"],
    "lost": ["701", "702", "703"],
}

NAME_RULES = {
    "084": [("1796-01-01", "1927-07-26", "Girgenti"), ("1927-07-27", END, "Agrigento")],
    "061": [("1796-01-01", "1927-01-11", "Terra di Lavoro"), ("1927-01-12", END, "Caserta")],
    "059": [("1934-10-26", "1945-04-08", "Littoria"), ("1945-04-09", END, "Latina")],
    "040": [("1796-01-01", "1992-04-15", "Forlì"), ("1992-04-16", END, "Forlì-Cesena")],
    "086": [("1927-01-12", "1927-11-30", "Castrogiovanni"), ("1927-12-01", END, "Enna")],
    "022": [("1796-01-01", "1920-10-15", "Tirolo"), ("1920-10-16", END, "Trento")],
    "021": [("1796-01-01", "1927-01-11", "Tirolo"), ("1927-01-12", END, "Bolzano")],
    "032": [("1796-01-01", "1920-12-31", "Litorale austriaco"), ("1921-01-01", END, "Trieste")],
    "031": [("1796-01-01", "1920-12-31", "Gorizia e Gradisca"), ("1921-01-01", END, "Gorizia")],
    "104": [(START, END, "Olbia-Tempio")],
    "105": [(START, END, "Ogliastra")],
    "106": [(START, END, "Medio Campidano")],
    "107": [(START, END, "Carbonia-Iglesias")],
    "701": [(START, END, "Fiume")],
    "702": [(START, END, "Pola")],
    "703": [(START, END, "Zara")],
    "801": [(START, END, "Venezia Giulia")],
}

ABRUZZO = {"066", "067", "068", "069"}
MOLISE = {"070", "094"}
SEZIONE = {"093", "094", "095", "096", "097", "098", "099", "100", "101", "102", "103", "108", "109"}

ARCHIVE_SLUG = {
    "001": "torino", "002": "vercelli", "003": "novara", "004": "cuneo", "005": "asti", "006": "alessandria",
    "007": "aosta", "008": "imperia", "009": "savona", "010": "genova", "011": "la-spezia",
    "012": "varese", "013": "como", "014": "sondrio", "015": "milano", "016": "bergamo", "017": "brescia",
    "018": "pavia", "019": "cremona", "020": "mantova", "021": "bolzano", "022": "trento",
    "023": "verona", "024": "vicenza", "025": "belluno", "026": "treviso", "027": "venezia", "028": "padova", "029": "rovigo",
    "030": "udine", "031": "gorizia", "032": "trieste", "093": "pordenone",
    "033": "piacenza", "034": "parma", "035": "reggio-emilia", "036": "modena", "037": "bologna", "038": "ferrara",
    "039": "ravenna", "040": "forli", "099": "rimini",
    "041": "pesaro", "042": "ancona", "043": "macerata", "044": "ascoli-piceno", "109": "fermo",
    "045": "massa", "046": "lucca", "047": "pistoia", "048": "firenze", "049": "livorno", "050": "pisa",
    "051": "arezzo", "052": "siena", "053": "grosseto", "100": "prato",
    "054": "perugia", "055": "terni",
    "056": "viterbo", "057": "rieti", "058": "roma", "059": "latina", "060": "frosinone",
    "061": "caserta", "062": "benevento", "063": "napoli", "064": "avellino", "065": "salerno",
    "066": "laquila", "067": "teramo", "068": "pescara", "069": "chieti",
    "070": "campobasso", "094": "isernia",
    "071": "foggia", "072": "bari", "073": "taranto", "074": "brindisi", "075": "lecce", "110": "bari",
    "076": "potenza", "077": "matera",
    "078": "cosenza", "079": "catanzaro", "080": "reggio-calabria", "101": "crotone", "102": "vibo-valentia",
    "081": "trapani", "082": "palermo", "083": "messina", "084": "agrigento", "085": "caltanissetta",
    "086": "enna", "087": "catania", "088": "ragusa", "089": "siracusa",
    "090": "sassari", "091": "nuoro", "092": "cagliari", "095": "oristano", "111": "cagliari",
    "104": "sassari", "105": "nuoro", "106": "cagliari", "107": "cagliari",
    "701": "trieste", "702": "trieste", "703": "trieste", "801": "trieste",
    "096": "biella", "097": "lecco", "098": "lodi", "103": "verbania", "108": "monza",
}

SLUG_TITLE = {
    "laquila": "L'Aquila", "reggio-emilia": "Reggio Emilia", "reggio-calabria": "Reggio Calabria",
    "forli": "Forlì", "massa": "Massa", "pesaro": "Pesaro", "ascoli-piceno": "Ascoli Piceno",
    "la-spezia": "La Spezia", "vibo-valentia": "Vibo Valentia", "aosta": "Aosta", "verbania": "Verbania",
}

EXTRA_SIGLA = {"104": "OT", "105": "OG", "106": "VS", "107": "CI", "701": "FU", "702": "PL", "703": "ZA", "801": "VG"}

SMALL = {"di", "del", "della", "dei", "degli", "delle", "e", "ed", "al", "alla", "da", "de", "in", "su", "sul"}
SMALL_LEFT = {"d", "l", "dell", "nell", "sant", "un", "s"}


def span(start, end, polity, record, note=""):
    return {"from": start, "to": end, "polityId": polity, "recordId": record, "note": note}


def kingdom_tail(before):
    """Shared close for lands already inside the Kingdom on 1 January 1866."""
    return before + [
        span("1866-01-01", "1946-06-17", "regno-italia", "italiano", "Stato Civile Italiano begins on 1 January 1866."),
        span("1946-06-18", END, "repubblica", "italiano", "The Italian Republic."),
    ]


def group_spans():
    sicily = kingdom_tail([
        span(START, "1815-12-09", "sicilia-borbone", "parish", "The Bourbon court rules Sicily. Napoleon does not introduce civil registration on the island."),
        span("1815-12-10", "1819-12-31", "due-sicilie", "parish", "The Kingdom of the Two Sicilies is formed in 1816. Parish registers continue on the island."),
        span("1820-01-01", "1861-03-16", "due-sicilie", "borbonico", "Stato Civile begins in Sicily on 1 January 1820."),
        span("1861-03-17", "1865-12-31", "regno-italia", "borbonico", "Sicily is in the Kingdom of Italy. The Bourbon civil register continues through 1865."),
    ])
    south = kingdom_tail([
        span(START, "1805-12-31", "napoli-borbone", "parish", "Kingdom of Naples. Parish registers."),
        span("1806-01-01", "1808-12-31", "murat", "parish", "Joseph Bonaparte rules Naples. The civil register is decreed in 1809."),
        span("1809-01-01", "1815-05-20", "murat", "napoleonico", "Stato Civile Napoleonico on the mainland South, from 1809."),
        span("1815-05-21", "1861-03-16", "due-sicilie", "borbonico", "The restored Bourbons keep civil registration."),
        span("1861-03-17", "1865-12-31", "regno-italia", "borbonico", "The Bourbon civil register continues through 1865."),
    ])
    lazio = [
        span(START, "1808-12-31", "papal", "parish", "Papal States. Parish registers."),
        span("1809-01-01", "1814-05-23", "francia", "napoleonico", "Rome and its departments are annexed to France."),
        span("1814-05-24", "1870-09-19", "papal", "parish", "Papal rule returns. The Roman Republic of 1849 is a short break."),
        span("1870-09-20", "1870-12-31", "regno-italia", "parish", "Rome is taken on 20 September 1870. Civil registration starts in 1871."),
        span("1871-01-01", "1946-06-17", "regno-italia", "italiano", "Stato Civile Italiano in Lazio starts on 1 January 1871."),
        span("1946-06-18", END, "repubblica", "italiano", "The Italian Republic."),
    ]
    papal_1860 = kingdom_tail([
        span(START, "1808-12-31", "papal", "parish", "Papal States. Parish registers."),
        span("1809-01-01", "1814-05-23", "francia", "napoleonico", "French annexation. Napoleonic civil registration."),
        span("1814-05-24", "1860-11-03", "papal", "parish", "Papal rule returns until the annexations of 1860."),
        span("1860-11-04", "1865-12-31", "regno-italia", "parish", "Annexed to the Kingdom. Statewide civil registration starts on 1 January 1866."),
    ])
    romagna = kingdom_tail([
        span(START, "1805-12-31", "papal", "parish", "Papal legations, with the revolutionary occupations of the late 1790s."),
        span("1806-01-01", "1814-04-30", "napoleonico-italia", "napoleonico", "Napoleonic Kingdom of Italy."),
        span("1814-05-01", "1859-06-11", "papal", "parish", "The legations return to the Pope."),
        span("1859-06-12", "1861-03-16", "regno-sardegna", "parish", "The legations join the Kingdom of Sardinia in 1859."),
        span("1861-03-17", "1865-12-31", "regno-italia", "parish", "Statewide civil registration starts on 1 January 1866."),
    ])
    tuscany = kingdom_tail([
        span(START, "1807-12-31", "toscana", "parish", "Grand Duchy of Tuscany. Parish registers."),
        span("1808-01-01", "1814-04-30", "francia", "napoleonico", "Tuscany is annexed to France."),
        span("1814-05-01", "1816-12-31", "toscana", "parish", "The Grand Duchy is restored."),
        span("1817-01-01", "1860-03-22", "toscana", "granducale", "From 1817 the Grand Duchy keeps a civil register through parish duplicates."),
        span("1860-03-23", "1861-03-16", "regno-sardegna", "granducale", "Tuscany joins the Kingdom of Sardinia. The Tuscan register continues."),
        span("1861-03-17", "1865-12-31", "regno-italia", "granducale", "The Tuscan register continues through 1865."),
    ])
    lucca = [
        span(START, "1805-06-03", "lucca", "parish", "Duchy of Lucca. Parish registers."),
        span("1805-06-04", "1814-04-30", "francia", "napoleonico", "Elisa Bonaparte's principality, then French rule."),
        span("1814-05-01", "1847-10-04", "lucca", "parish", "The Duchy of Lucca is restored."),
        span("1847-10-05", "1860-03-22", "toscana", "granducale", "Lucca passes to the Grand Duchy of Tuscany in 1847."),
        span("1860-03-23", "1861-03-16", "regno-sardegna", "granducale", "Tuscany joins the Kingdom of Sardinia."),
        span("1861-03-17", "1865-12-31", "regno-italia", "granducale", "The Tuscan register continues through 1865."),
        span("1866-01-01", "1946-06-17", "regno-italia", "italiano", "Stato Civile Italiano begins on 1 January 1866."),
        span("1946-06-18", END, "repubblica", "italiano", "The Italian Republic."),
    ]
    modena = kingdom_tail([
        span(START, "1805-12-31", "modena", "parish", "Duchy of Modena. Parish registers. Massa-Carrara follows Modena, not Tuscany, in this period."),
        span("1806-01-01", "1814-04-30", "napoleonico-italia", "napoleonico", "Napoleonic civil registration."),
        span("1814-05-01", "1859-06-11", "modena", "parish", "The Duchy of Modena is restored."),
        span("1859-06-12", "1861-03-16", "regno-sardegna", "parish", "Modena joins the Kingdom of Sardinia."),
        span("1861-03-17", "1865-12-31", "regno-italia", "parish", "Statewide civil registration starts on 1 January 1866."),
    ])
    parma = kingdom_tail([
        span(START, "1805-12-31", "parma", "parish", "Duchy of Parma. Parish registers."),
        span("1806-01-01", "1814-04-30", "napoleonico-italia", "napoleonico", "Napoleonic civil registration."),
        span("1814-05-01", "1859-06-11", "parma", "parish", "The Duchy of Parma is restored."),
        span("1859-06-12", "1861-03-16", "regno-sardegna", "parish", "Parma joins the Kingdom of Sardinia."),
        span("1861-03-17", "1865-12-31", "regno-italia", "parish", "Statewide civil registration starts on 1 January 1866."),
    ])
    lombardy = kingdom_tail([
        span(START, "1805-12-31", "transizione", "parish", "Austrian Milan, then the Cisalpine Republic and the Italian Republic. Parish registers."),
        span("1806-01-01", "1814-04-30", "napoleonico-italia", "napoleonico", "Napoleonic Kingdom of Italy."),
        span("1814-05-01", "1859-06-11", "lombardo-veneto", "parish", "Austrian Regno Lombardo-Veneto. Civil registration is left to the parishes."),
        span("1859-06-12", "1861-03-16", "regno-sardegna", "parish", "Lombardy, except Mantua, joins the Kingdom of Sardinia."),
        span("1861-03-17", "1865-12-31", "regno-italia", "parish", "Statewide civil registration starts on 1 January 1866."),
    ])
    mantova = [
        span(START, "1805-12-31", "transizione", "parish", "Mantua passes through the revolutionary republics. Parish registers."),
        span("1806-01-01", "1814-04-30", "napoleonico-italia", "napoleonico", "Napoleonic Kingdom of Italy."),
        span("1814-05-01", "1866-10-20", "lombardo-veneto", "parish", "Mantua stays Austrian through 1866, after the rest of Lombardy has left."),
        span("1866-10-21", "1871-08-31", "regno-italia", "parish", "Annexed in October 1866. Stato Civile Italiano here starts on 1 September 1871."),
        span("1871-09-01", "1946-06-17", "regno-italia", "italiano", "Stato Civile Italiano from 1 September 1871."),
        span("1946-06-18", END, "repubblica", "italiano", "The Italian Republic."),
    ]
    veneto = [
        span(START, "1797-05-11", "repubblica-venezia", "parish", "The Republic of Venice. Parish registers."),
        span("1797-05-12", "1805-12-31", "austria", "parish", "Campo Formio and the later transfers. Parish registers."),
        span("1806-01-01", "1814-04-30", "napoleonico-italia", "napoleonico", "Napoleonic Kingdom of Italy."),
        span("1814-05-01", "1866-10-20", "lombardo-veneto", "parish", "Austrian Regno Lombardo-Veneto. Civil registration is left to the parishes."),
        span("1866-10-21", "1871-08-31", "regno-italia", "parish", "Annexed in October 1866. Stato Civile Italiano here starts on 1 September 1871."),
        span("1871-09-01", "1946-06-17", "regno-italia", "italiano", "Stato Civile Italiano from 1 September 1871."),
        span("1946-06-18", END, "repubblica", "italiano", "The Italian Republic."),
    ]
    trento = [
        span(START, "1803-02-28", "trento-vescovile", "parish", "Prince-bishopric of Trent. Parish registers."),
        span("1803-03-01", "1809-12-31", "austria", "austriaco", "Secularized Tyrol under Austria."),
        span("1810-01-01", "1814-04-30", "napoleonico-italia", "napoleonico", "Department of Alto Adige in the Napoleonic Kingdom of Italy."),
        span("1814-05-01", "1867-12-31", "austria", "austriaco", "Austrian Tyrol. Church registers (Matriken) are the legal record."),
        span("1868-01-01", "1919-09-09", "austria-hungary", "austriaco", "Austro-Hungarian Tyrol. Not part of the Kingdom of Italy."),
        span("1919-09-10", "1923-12-31", "regno-italia", "austriaco", "Treaty of Saint-Germain. Italian administration; the older Austrian registers remain the record until the mid-1920s."),
        span("1924-01-01", "1946-06-17", "regno-italia", "italiano", "Stato Civile Italiano is in regular use from 1924."),
        span("1946-06-18", END, "repubblica", "italiano", "The Italian Republic."),
    ]
    bolzano = [
        span(START, "1805-12-25", "austria", "austriaco", "Austrian Tyrol. Church registers."),
        span("1805-12-26", "1810-02-27", "baviera", "austriaco", "Bavarian Tyrol after Pressburg."),
        span("1810-02-28", "1813-12-31", "napoleonico-italia", "napoleonico", "Brief Napoleonic rule in the southern Tyrol."),
        span("1814-01-01", "1867-12-31", "austria", "austriaco", "Austrian Tyrol returns."),
        span("1868-01-01", "1919-09-09", "austria-hungary", "austriaco", "Austro-Hungarian South Tyrol. Not part of the Kingdom of Italy."),
        span("1919-09-10", "1923-12-31", "regno-italia", "austriaco", "Annexed after Saint-Germain. The province of Bolzano is created in 1927."),
        span("1924-01-01", "1946-06-17", "regno-italia", "italiano", "Stato Civile Italiano is in regular use from 1924."),
        span("1946-06-18", END, "repubblica", "italiano", "The Italian Republic."),
    ]
    giulia = [
        span(START, "1809-10-13", "austria", "austriaco", "Austrian Küstenland. Church registers."),
        span("1809-10-14", "1813-12-31", "francia", "napoleonico", "Illyrian Provinces."),
        span("1814-01-01", "1867-12-31", "austria", "austriaco", "Austria returns. Church registers are the legal record."),
        span("1868-01-01", "1918-11-03", "austria-hungary", "austriaco", "Austro-Hungarian coast. Not part of the Kingdom of Italy."),
        span("1918-11-04", "1923-12-31", "regno-italia", "austriaco", "Occupied, then annexed under Saint-Germain and Rapallo."),
        span("1924-01-01", "1946-06-17", "regno-italia", "italiano", "Stato Civile Italiano is in regular use from 1924."),
        span("1946-06-18", END, "repubblica", "italiano", "The Italian Republic. The 1947 treaty moves the eastern border."),
    ]
    piedmont = kingdom_tail([
        span(START, "1802-09-10", "regno-sardegna", "parish", "Kingdom of Sardinia. French occupation begins in the late 1790s. Parish registers."),
        span("1802-09-11", "1814-05-19", "francia", "napoleonico", "Piedmont and Aosta are annexed to France."),
        span("1814-05-20", "1837-12-31", "regno-sardegna", "parish", "Savoy rule returns. Parish registers."),
        span("1838-01-01", "1861-03-16", "regno-sardegna", "sabaudo", "Parish-kept Stato Civile of the Kingdom of Sardinia, from 1838."),
        span("1861-03-17", "1865-12-31", "regno-italia", "sabaudo", "The Sabaudo register continues until the 1866 national code."),
    ])
    liguria = kingdom_tail([
        span(START, "1797-06-13", "genova", "parish", "Republic of Genoa. Parish registers."),
        span("1797-06-14", "1805-06-03", "liguria-repubblica", "parish", "Ligurian Republic."),
        span("1805-06-04", "1814-04-30", "francia", "napoleonico", "Liguria is annexed to France."),
        span("1814-05-01", "1837-12-31", "regno-sardegna", "parish", "Liguria joins the Kingdom of Sardinia."),
        span("1838-01-01", "1861-03-16", "regno-sardegna", "sabaudo", "Parish-kept Stato Civile from 1838."),
        span("1861-03-17", "1865-12-31", "regno-italia", "sabaudo", "The Sabaudo register continues until the 1866 national code."),
    ])
    sardinia = kingdom_tail([
        span(START, "1837-12-31", "regno-sardegna", "parish", "The island stays under Savoy. Napoleon does not occupy it. Parish registers."),
        span("1838-01-01", "1861-03-16", "regno-sardegna", "sabaudo", "Parish-kept Stato Civile from 1838."),
        span("1861-03-17", "1865-12-31", "regno-italia", "sabaudo", "The Sabaudo register continues until the 1866 national code."),
    ])
    lost = [
        span(START, "1809-10-13", "austria", "austriaco", "Austrian coast."),
        span("1809-10-14", "1813-12-31", "francia", "napoleonico", "Illyrian Provinces."),
        span("1814-01-01", "1867-12-31", "austria", "austriaco", "Austrian rule returns."),
        span("1868-01-01", "1918-11-03", "austria-hungary", "austriaco", "Austro-Hungarian coast."),
        span("1918-11-04", "1923-12-31", "regno-italia", "austriaco", "Italian occupation and annexation."),
        span("1924-01-01", "1947-09-15", "regno-italia", "italiano", "Italian civil registration during the interwar annexation."),
        span("1947-09-16", END, "ceduto-1947", "outside", "Ceded under the Treaty of Paris, 10 February 1947. Not an Italian comune today."),
    ]
    return {
        "sicily": sicily, "south": south, "lazio": lazio, "marche": papal_1860, "umbria": papal_1860,
        "romagna": romagna, "tuscany": tuscany, "lucca": lucca, "modena": modena, "parma": parma,
        "lombardy": lombardy, "mantova": mantova, "veneto": veneto, "friuli": veneto,
        "trento": trento, "bolzano": bolzano, "giulia": giulia, "piedmont": piedmont,
        "liguria": liguria, "sardinia": sardinia, "lost": lost,
    }


POLITIES = [
    {"id": "repubblica-venezia", "name": "Repubblica di Venezia", "nameEn": "Republic of Venice", "family": "pre-unitarian", "color": "#8e3d4a"},
    {"id": "genova", "name": "Repubblica di Genova", "nameEn": "Republic of Genoa", "family": "pre-unitarian", "color": "#2f5d50"},
    {"id": "liguria-repubblica", "name": "Repubblica Ligure", "nameEn": "Ligurian Republic", "family": "pre-unitarian", "color": "#3d6b5e"},
    {"id": "transizione", "name": "Transizione rivoluzionaria", "nameEn": "Revolutionary transition", "family": "pre-unitarian", "color": "#8d7b66"},
    {"id": "trento-vescovile", "name": "Principato vescovile di Trento", "nameEn": "Prince-bishopric of Trent", "family": "austrian", "color": "#8d6a7a"},
    {"id": "sicilia-borbone", "name": "Regno di Sicilia", "nameEn": "Kingdom of Sicily", "family": "pre-unitarian", "color": "#b08a3e"},
    {"id": "napoli-borbone", "name": "Regno di Napoli", "nameEn": "Kingdom of Naples", "family": "pre-unitarian", "color": "#8a5a2b"},
    {"id": "murat", "name": "Regno di Napoli napoleonico", "nameEn": "Napoleonic Naples", "family": "french", "color": "#8a5a2b"},
    {"id": "due-sicilie", "name": "Regno delle Due Sicilie", "nameEn": "Kingdom of the Two Sicilies", "family": "pre-unitarian", "color": "#a67c2d"},
    {"id": "lombardo-veneto", "name": "Regno Lombardo-Veneto", "nameEn": "Kingdom of Lombardy–Venetia", "family": "austrian", "color": "#c2a15a"},
    {"id": "austria", "name": "Impero austriaco", "nameEn": "Austrian Empire", "family": "austrian", "color": "#6b6256"},
    {"id": "austria-hungary", "name": "Impero austro-ungarico", "nameEn": "Austria-Hungary", "family": "austrian", "color": "#3e3a34"},
    {"id": "baviera", "name": "Regno di Baviera", "nameEn": "Kingdom of Bavaria", "family": "austrian", "color": "#6e8e9e"},
    {"id": "papal", "name": "Stato Pontificio", "nameEn": "Papal States", "family": "pre-unitarian", "color": "#c4b49a"},
    {"id": "toscana", "name": "Granducato di Toscana", "nameEn": "Grand Duchy of Tuscany", "family": "pre-unitarian", "color": "#7d2e3a"},
    {"id": "lucca", "name": "Ducato di Lucca", "nameEn": "Duchy of Lucca", "family": "pre-unitarian", "color": "#6d4c41"},
    {"id": "parma", "name": "Ducato di Parma", "nameEn": "Duchy of Parma", "family": "pre-unitarian", "color": "#5e4d86"},
    {"id": "modena", "name": "Ducato di Modena", "nameEn": "Duchy of Modena", "family": "pre-unitarian", "color": "#3e6b52"},
    {"id": "francia", "name": "Impero francese", "nameEn": "French Empire", "family": "french", "color": "#2457a6"},
    {"id": "napoleonico-italia", "name": "Regno d'Italia napoleonico", "nameEn": "Napoleonic Kingdom of Italy", "family": "french", "color": "#3e6ea8"},
    {"id": "regno-sardegna", "name": "Regno di Sardegna", "nameEn": "Kingdom of Sardinia", "family": "savoy", "color": "#1e4d78"},
    {"id": "regno-italia", "name": "Regno d'Italia", "nameEn": "Kingdom of Italy", "family": "italian", "color": "#2c6b45"},
    {"id": "repubblica", "name": "Repubblica Italiana", "nameEn": "Italian Republic", "family": "italian", "color": "#1f6b4a"},
    {"id": "ceduto-1947", "name": "Territorio ceduto nel 1947", "nameEn": "Territory ceded in 1947", "family": "outside", "color": "#9a8f84"},
]

RECORDS = [
    {"id": "parish", "name": "Registri parrocchiali", "nameEn": "Parish registers", "civil": False, "note": "Baptisms, marriages, and burials, plus Stati delle Anime where they survive."},
    {"id": "napoleonico", "name": "Stato Civile Napoleonico", "nameEn": "Napoleonic civil registration", "civil": True, "note": "Civil births, marriages, and deaths introduced under French or Napoleonic rule."},
    {"id": "borbonico", "name": "Stato Civile Borbonico", "nameEn": "Bourbon civil registration", "civil": True, "note": "Mainland South from 1809. Sicily from 1 January 1820. The Bourbons kept the series after 1815."},
    {"id": "granducale", "name": "Stato Civile del Granducato di Toscana", "nameEn": "Tuscan grand-ducal civil register", "civil": True, "note": "From 1817, usually kept as a duplicate of the parish register."},
    {"id": "sabaudo", "name": "Stato Civile sabaudo", "nameEn": "Savoy civil registration", "civil": True, "note": "From 1838 in the Kingdom of Sardinia. Priests often kept the register."},
    {"id": "austriaco", "name": "Matriken austriaci", "nameEn": "Austrian church registers", "civil": False, "note": "In Austrian and Austro-Hungarian lands the parish Matriken were the legal register."},
    {"id": "italiano", "name": "Stato Civile Italiano", "nameEn": "Italian civil registration", "civil": True, "note": "The national series. The start year depends on when this town entered the system."},
    {"id": "outside", "name": "Fuori dallo Stato italiano", "nameEn": "Outside the Italian state", "civil": False, "note": "This ground is not an Italian comune on this date."},
]

EPOCHS = [
    {"id": "pre-napoleonic", "from": 1796, "to": 1805, "name": "Pre-Napoleonic transition", "note": "Parish registers. The old states are still the frame, under revolutionary pressure."},
    {"id": "napoleonic", "from": 1806, "to": 1814, "name": "Napoleonic era", "note": "Stato Civile Napoleonico spreads through the Kingdom of Italy, the French departments, and Murat's Naples. Sicily and the island of Sardinia stay outside it."},
    {"id": "restoration", "from": 1815, "to": 1859, "name": "Restoration", "note": "Two Sicilies, Lombardy–Venetia, the Papal States, Tuscany, Sardinia, Parma, and Modena."},
    {"id": "unification", "from": 1860, "to": 1865, "name": "Unification", "note": "The Kingdom of Italy is proclaimed on 17 March 1861. Veneto, Mantua, Rome, and the Austrian south Tyrol are still outside."},
    {"id": "civil-code", "from": 1866, "to": 1869, "name": "Civil code of 1866", "note": "Stato Civile Italiano starts on 1 January 1866. Veneto and Mantua are annexed in October 1866. Their civil series starts on 1 September 1871."},
    {"id": "rome", "from": 1870, "to": 1919, "name": "Rome in the Kingdom", "note": "Rome is taken on 20 September 1870. Lazio civil registration starts in 1871. The Austrian frontier still runs above Verona and east of Udine."},
    {"id": "annexations", "from": 1920, "to": 1945, "name": "Annexations and the later Kingdom", "note": "Trentino, Alto Adige, Trieste, Gorizia, Istria, and Zara enter the Kingdom. The 1920s bring comuni soppressi, renames, and new provinces."},
    {"id": "republic", "from": 1946, "to": 2026, "name": "Italian Republic", "note": "The 1947 eastern border, then the modern province splits."},
]


def day_before(iso: str) -> str:
    year, month, day = (int(part) for part in iso.split("-"))
    return (dt.date(year, month, day) - dt.timedelta(days=1)).isoformat()


def title_it(value: str) -> str:
    parts = value.strip().split()
    out = []
    for index, token in enumerate(parts):
        lower = token.lower().replace("’", "'")
        first = index == 0
        if "'" in lower:
            left, right = lower.split("'", 1)
            right_out = right[:1].upper() + right[1:] if right else ""
            if first or left not in SMALL_LEFT:
                left_out = left[:1].upper() + left[1:] if left else ""
            else:
                left_out = left
            out.append(left_out + "'" + right_out)
        elif not first and lower in SMALL:
            out.append(lower)
        else:
            out.append(lower[:1].upper() + lower[1:] if lower else lower)
    return " ".join(out)


def should_backfill(earliest: str, living: bool = False) -> bool:
    """Extend the first ANPR row back to 1796.

    ANPR often dates an old city from a later decree. Genova is 1873, Roma is
    1884, Torino is 1889, and Gaeta is 1897. A living comune dated on or before
    31 December 1922 is treated as already there. A suppressed row stays on the
    annexation windows, so Elena (1897) does not gain a false early life.
    """
    if earliest <= "1861-03-17":
        return True
    if "1866-10-01" <= earliest <= "1867-01-31":
        return True
    if "1870-09-01" <= earliest <= "1872-01-31":
        return True
    if "1918-11-01" <= earliest <= "1922-01-31":
        return True
    if living and earliest <= "1922-12-31":
        return True
    return False


def province_name(code: str, date: str, modern: str) -> str:
    for start, end, name in NAME_RULES.get(code, []):
        if start <= date <= end:
            return name
    return modern or code


def region_name(code: str, date: str, modern: str) -> str:
    if code in ABRUZZO:
        return "Abruzzi e Molise" if date < "1963-12-27" else "Abruzzo"
    if code in MOLISE:
        return "Abruzzi e Molise" if date < "1963-12-27" else "Molise"
    if code in {"021", "022"} and date < "1920-10-16":
        return "Tirolo"
    if code in {"031", "032", "801", "701", "702", "703"} and date < "1921-01-01":
        return "Litorale austriaco"
    if code in {"030", "093"} and date < "1866-10-21":
        return "Friuli"
    if code == "045" and date < "1859-06-12":
        return "Ducato di Modena"
    if code == "046" and date < "1847-10-05":
        return "Ducato di Lucca"
    return modern or ""


def split_span(item, cuts):
    points = [item["from"]]
    for cut in sorted(set(cuts)):
        if item["from"] < cut <= item["to"]:
            points.append(cut)
    pieces = []
    for index, start in enumerate(points):
        end = item["to"] if index + 1 == len(points) else day_before(points[index + 1])
        if start <= end:
            piece = dict(item)
            piece["from"] = start
            piece["to"] = end
            pieces.append(piece)
    return pieces


def code_group_map():
    mapping = {}
    for name, codes in GROUPS.items():
        for code in codes:
            mapping[code] = name
    return mapping


def build_rules(meta):
    spans_by_group = group_spans()
    mapping = code_group_map()
    rules = {}
    for code, group in sorted(mapping.items()):
        info = meta.get(code, {})
        modern = info.get("name") or province_name(code, END, "")
        cuts = set()
        named = NAME_RULES.get(code, [])
        for start, _end, _name in named[1:]:
            cuts.add(start)
        if code in ABRUZZO or code in MOLISE:
            cuts.add("1963-12-27")
        if code in {"021", "022"}:
            cuts.add("1920-10-16")
        if code in {"030", "093"}:
            cuts.add("1866-10-21")
        if code == "045":
            cuts.add("1859-06-12")
        if code == "046":
            cuts.add("1847-10-05")
        annotated = []
        for item in spans_by_group[group]:
            for piece in split_span(item, cuts):
                piece["provinceName"] = province_name(code, piece["from"], modern)
                piece["regionName"] = region_name(code, piece["from"], info.get("region", ""))
                piece["archiveId"] = ARCHIVE_SLUG.get(code, "roma")
                piece["sigla"] = info.get("sigla") or EXTRA_SIGLA.get(code, "")
                if code in SEZIONE:
                    extra = " This province uses a sezione or the archive of the older province. Prefer the historical province on the card."
                    piece["note"] = (piece.get("note") or "") + extra
                annotated.append(piece)
        rules[code] = annotated
    return rules


def load_comuni():
    rows = json.loads((RAW / "comuni.json").read_text(encoding="utf-8"))
    by_catasto = {}
    meta = {}
    for row in rows:
        code = str(row["provincia"]["codice"]).zfill(3)
        meta.setdefault(code, {
            "name": row["provincia"]["nome"],
            "sigla": row["sigla"],
            "region": row["regione"]["nome"],
        })
        by_catasto[row["codiceCatastale"]] = row
    for code, sigla in EXTRA_SIGLA.items():
        meta.setdefault(code, {"name": province_name(code, END, ""), "sigla": sigla, "region": ""})
    return rows, by_catasto, meta


def load_anpr():
    groups = {}
    with (RAW / "anpr_archivio_comuni.csv").open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            catasto = (row.get("CODCATASTALE") or "").strip().upper()
            if not catasto:
                continue
            groups.setdefault(catasto, []).append(row)
    return groups


def place_spans(rows, living=False):
    ordered = sorted(rows, key=lambda row: (row["DATAISTITUZIONE"], row["DATACESSAZIONE"]))
    raw = []
    for row in ordered:
        start = row["DATAISTITUZIONE"]
        end = row["DATACESSAZIONE"]
        if not start or not end:
            continue
        if end.startswith("9999"):
            end = END
        name = title_it(row["DENOMINAZIONE_IT"])
        code = str(row["IDPROVINCIAISTAT"]).zfill(3)
        raw.append({"from": start, "to": end, "name": name, "provinceCode": code})
    if not raw:
        return []
    if should_backfill(raw[0]["from"], living=living) and raw[0]["from"] > START:
        raw.insert(0, {
            "from": START,
            "to": day_before(raw[0]["from"]),
            "name": raw[0]["name"],
            "provinceCode": raw[0]["provinceCode"],
        })
    merged = []
    for item in raw:
        item["from"] = max(item["from"], START)
        item["to"] = min(item["to"], END)
        if item["from"] > item["to"]:
            continue
        if merged and merged[-1]["name"] == item["name"] and merged[-1]["provinceCode"] == item["provinceCode"] and day_before(item["from"]) <= merged[-1]["to"]:
            merged[-1]["to"] = max(merged[-1]["to"], item["to"])
            continue
        merged.append(item)
    return merged


def geometry_centroids(provinces):
    centers = {}
    for feature in provinces["features"]:
        code = str(feature["properties"]["prov_istat_code"]).zfill(3)
        numbers = []

        def walk(node):
            if isinstance(node, list) and node and isinstance(node[0], (int, float)):
                numbers.append(node)
            elif isinstance(node, list):
                for child in node:
                    walk(child)

        walk(feature["geometry"]["coordinates"])
        if numbers:
            centers[code] = {
                "lng": round(sum(point[0] for point in numbers) / len(numbers), 5),
                "lat": round(sum(point[1] for point in numbers) / len(numbers), 5),
            }
    return centers


def build_places(comuni_rows, by_catasto, anpr, centroids, province_centers, overlays):
    places = []
    seen = set()
    for catasto, rows in sorted(anpr.items()):
        spans = place_spans(rows, living=catasto in by_catasto)
        if not spans:
            continue
        active = next((row for row in rows if str(row.get("DATACESSAZIONE", "")).startswith("9999")), None)
        modern = by_catasto.get(catasto)
        suppressed = active is None or modern is None
        istat = ""
        if modern:
            istat = modern["codice"]
        elif active:
            istat = str(active["CODISTAT"]).zfill(6)
        else:
            istat = str(rows[-1]["CODISTAT"]).zfill(6)
        point = centroids.get(istat)
        if not point and active:
            point = centroids.get(str(active["CODISTAT"]).zfill(6))
        if not point:
            for row in rows:
                point = centroids.get(str(row["CODISTAT"]).zfill(6))
                if point:
                    break
        province_code = str(modern["provincia"]["codice"]).zfill(3) if modern else spans[-1]["provinceCode"]
        if not point:
            point = province_centers.get(province_code)
        name = modern["nome"] if modern else spans[-1]["name"]
        place = {
            "id": istat if modern else f"ceased-{catasto}",
            "kind": "comune",
            "istat": istat if modern else "",
            "catasto": catasto,
            "name": name,
            "provinceCode": province_code,
            "province": modern["provincia"]["nome"] if modern else "",
            "sigla": modern["sigla"] if modern else "",
            "region": modern["regione"]["nome"] if modern else "",
            "population": modern.get("popolazione") or 0 if modern else 0,
            "lat": point["lat"] if point else None,
            "lng": point["lng"] if point else None,
            "suppressed": suppressed,
            "spans": spans,
        }
        aliases = overlays.get("englishNames", {}).get(name, [])
        if aliases:
            place["aliases"] = aliases
        successor = overlays.get("successors", {}).get(catasto)
        if successor:
            place["successorCatasto"] = successor
            place["successorNote"] = overlays.get("successorNotes", {}).get(catasto, "")
        if name == "Benevento" and not suppressed:
            place["overrides"] = [{
                "from": START,
                "to": "1860-09-10",
                "polityId": "papal",
                "recordId": "parish",
                "provinceName": "Benevento",
                "regionName": "Stato Pontificio",
                "archiveId": "benevento",
                "sigla": "BN",
                "note": "Papal enclave inside the Kingdom of Naples until annexation in 1860.",
            }]
        places.append(place)
        seen.add(catasto)

    for row in comuni_rows:
        if row["codiceCatastale"] in seen:
            continue
        code = str(row["provincia"]["codice"]).zfill(3)
        point = centroids.get(row["codice"]) or province_centers.get(code)
        place = {
            "id": row["codice"],
            "kind": "comune",
            "istat": row["codice"],
            "catasto": row["codiceCatastale"],
            "name": row["nome"],
            "provinceCode": code,
            "province": row["provincia"]["nome"],
            "sigla": row["sigla"],
            "region": row["regione"]["nome"],
            "population": row.get("popolazione") or 0,
            "lat": point["lat"] if point else None,
            "lng": point["lng"] if point else None,
            "suppressed": False,
            "spans": [{"from": START, "to": END, "name": row["nome"], "provinceCode": code}],
        }
        aliases = overlays.get("englishNames", {}).get(row["nome"], [])
        if aliases:
            place["aliases"] = aliases
        places.append(place)

    for landmark in overlays.get("landmarks", []):
        places.append({
            "id": landmark["id"],
            "kind": "landmark",
            "name": landmark["name"],
            "aliases": landmark.get("aliases", []),
            "lat": landmark["lat"],
            "lng": landmark["lng"],
            "note": landmark.get("note", ""),
            "anchor": landmark.get("anchor") or "Genova",
            "population": 0,
            "suppressed": False,
            "spans": [],
        })
    for item in overlays.get("gazetteer", []):
        places.append({
            "id": item["id"],
            "kind": "external",
            "name": item["name"],
            "aliases": item.get("aliases", []),
            "lat": item["lat"],
            "lng": item["lng"],
            "note": item.get("note", ""),
            "population": 0,
            "suppressed": False,
            "spans": [],
        })
    places.sort(key=lambda place: (place["kind"] != "comune", place["name"], place["id"]))
    return places


def build_archives(scraped_note: str):
    by_slug = {}
    for code, slug in sorted(ARCHIVE_SLUG.items()):
        entry = by_slug.setdefault(slug, {
            "id": slug,
            "slug": slug,
            "name": f"Archivio di Stato di {SLUG_TITLE.get(slug, slug.replace('-', ' ').title())}",
            "antenatiUrl": f"https://antenati.cultura.gov.it/archivio/archivio-di-stato-di-{slug}/",
            "provinces": [],
            "kind": "sezione" if code in SEZIONE else "archivio",
        })
        entry["provinces"].append(code)
        if code not in SEZIONE:
            entry["kind"] = "archivio"
    archives = sorted(by_slug.values(), key=lambda item: item["name"])
    return {
        "source": "Curated offline list of Archivi di Stato and sezioni. Antenati URLs use the stable /archivio/archivio-di-stato-di-{slug}/ pattern.",
        "firecrawl": scraped_note,
        "archives": archives,
    }


def build_routes():
    return {
        "routes": [
            {
                "id": "garibaldi-mille",
                "title": "I Mille, 1860",
                "titleEn": "Garibaldi's Thousand, 1860",
                "summary": "From Quarto dei Mille to Marsala, Palermo, and Napoli.",
                "match": ["Quarto", "Marsala", "Palermo", "Napoli"],
                "stops": [
                    {"year": 1860, "place": "Quarto dei Mille", "label": "Departure, 5 May 1860"},
                    {"year": 1860, "place": "Marsala", "label": "Landing, 11 May 1860"},
                    {"year": 1860, "place": "Palermo", "label": "Palermo, 27 May 1860"},
                    {"year": 1860, "place": "Napoli", "label": "Entry into Naples, 7 September 1860"},
                ],
            },
            {
                "id": "lercara-new-york",
                "title": "Rotta di emigrazione, Lercara Friddi",
                "titleEn": "A Great Arrival route from Lercara Friddi",
                "summary": "A sample chain from a Sicilian town through Palermo to New York.",
                "match": ["Lercara Friddi", "Palermo", "New York"],
                "stops": [
                    {"year": 1878, "place": "Lercara Friddi", "label": "Birth town"},
                    {"year": 1902, "place": "Palermo", "label": "Port of Palermo"},
                    {"year": 1902, "place": "New York", "label": "Ellis Island"},
                ],
            },
        ]
    }


def span_at(spans, iso):
    for item in spans:
        if item["from"] <= iso <= item["to"]:
            return item
    return None


def smoke(places, rules):
    def find_name(name):
        target = name.lower()
        for place in places:
            if place["name"].lower() == target:
                return place
            for item in place.get("spans", []):
                if item["name"].lower() == target:
                    return place
        raise SystemExit(f"missing place {name}")

    enna = find_name("Castrogiovanni")
    at_1884 = span_at(enna["spans"], "1884-07-01")
    rule_1884 = span_at(rules[at_1884["provinceCode"]], "1884-07-01")
    udine = find_name("Udine")
    at_1852 = span_at(udine["spans"], "1852-07-01")
    rule_1852 = span_at(rules[at_1852["provinceCode"]], "1852-07-01")
    trento = find_name("Trento")
    at_1910 = span_at(trento["spans"], "1910-07-01")
    rule_1910 = span_at(rules[at_1910["provinceCode"]], "1910-07-01")
    checks = [
        ("Castrogiovanni 1884", at_1884["name"], at_1884["provinceCode"], rule_1884["provinceName"], rule_1884["polityId"], rule_1884["recordId"]),
        ("Udine 1852", at_1852["name"], at_1852["provinceCode"], rule_1852["provinceName"], rule_1852["polityId"], rule_1852["recordId"]),
        ("Trento 1910", at_1910["name"], at_1910["provinceCode"], rule_1910["provinceName"], rule_1910["polityId"], rule_1910["recordId"]),
    ]
    for line in checks:
        print(" | ".join(line))
    if rule_1884["polityId"] != "regno-italia" or at_1884["provinceCode"] != "085" or at_1884["name"] != "Castrogiovanni":
        raise SystemExit("Castrogiovanni 1884 check failed")
    if rule_1852["polityId"] != "lombardo-veneto" or rule_1852["recordId"] != "parish":
        raise SystemExit("Udine 1852 check failed")
    if rule_1910["polityId"] != "austria-hungary" or rule_1910["provinceName"] != "Tirolo":
        raise SystemExit("Trento 1910 check failed")


def main() -> int:
    BUILT.mkdir(parents=True, exist_ok=True)
    overlays = json.loads((RAW / "seed_overlays.json").read_text(encoding="utf-8"))
    comuni_rows, by_catasto, meta = load_comuni()
    anpr = load_anpr()
    centroids = json.loads((RAW / "centroids.json").read_text(encoding="utf-8"))
    provinces = json.loads((RAW / "provinces.geojson").read_text(encoding="utf-8"))
    rules = build_rules(meta)
    places = build_places(comuni_rows, by_catasto, anpr, centroids, geometry_centroids(provinces), overlays)
    scraped = "not run"
    scrape_path = RAW / "antenati_firecrawl.json"
    if scrape_path.exists():
        scraped = f"present at {scrape_path.name}"
    index = {
        "version": 1,
        "generatedFrom": [
            "matteocontrini/comuni-json",
            "ANPR archivio storico dei comuni",
            "openpolis/geojson-italy",
            "curated regime model in scripts/04_build_bundle.py",
        ],
        "yearMin": 1796,
        "yearMax": 2026,
        "placeCount": len(places),
        "places": places,
    }
    polities = {
        "yearMin": 1796,
        "yearMax": 2026,
        "epochs": EPOCHS,
        "polities": POLITIES,
        "records": RECORDS,
        "provinceRules": rules,
        "mapNote": "The mesh is the modern provincial boundary. Color shows the sovereign regime of that ground in the selected year. It is not a historical polygon.",
    }
    (BUILT / "comuni-index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (BUILT / "polities.json").write_text(json.dumps(polities, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (BUILT / "archives.json").write_text(json.dumps(build_archives(scraped), ensure_ascii=False, indent=2), encoding="utf-8")
    (BUILT / "routes.json").write_text(json.dumps(build_routes(), ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.copyfile(RAW / "provinces.geojson", BUILT / "provinces.geojson")
    for name in ("comuni-index.json", "polities.json", "archives.json", "routes.json", "provinces.geojson"):
        path = BUILT / name
        print(f"{name} {path.stat().st_size} bytes")
    smoke(places, rules)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
