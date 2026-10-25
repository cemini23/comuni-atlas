#!/usr/bin/env python3
"""Map each Italian province to its primary diocese, then ask Wikidata.

The province table is the offline source. The build uses it even when Wikidata
does not answer. Wikidata (P708 diocese, and a church founded before 1900)
writes data/raw/dioceses_wikidata.json. That file overlays a single comune
when the query returns a row.

A province often holds more than one diocese. The table names the diocese of
the provincial capital and says so in the note.
"""

from __future__ import annotations

import csv
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
WIKI_OUT = RAW / "dioceses_wikidata.json"
UA = "comuni-atlas/1.0 (https://youratto.com/atlas)"
SPARQL = "https://query.wikidata.org/sparql"

# code, diocese, archive, cathedral, BeWeB place, note
PROVINCES = [
    ("001", "Arcidiocesi di Torino", "Archivio Storico Diocesano di Torino", "Duomo di Torino", "Torino", ""),
    ("002", "Arcidiocesi di Vercelli", "Archivio Storico Diocesano di Vercelli", "Duomo di Vercelli", "Vercelli", ""),
    ("003", "Diocesi di Novara", "Archivio Storico Diocesano di Novara", "Duomo di Novara", "Novara", ""),
    ("004", "Diocesi di Cuneo-Fossano", "Archivio Storico Diocesano di Cuneo", "Duomo di Cuneo", "Cuneo", "Fossano is part of the same diocese."),
    ("005", "Diocesi di Asti", "Archivio Storico Diocesano di Asti", "Duomo di Asti", "Asti", ""),
    ("006", "Diocesi di Alessandria", "Archivio Storico Diocesano di Alessandria", "Duomo di Alessandria", "Alessandria", ""),
    ("007", "Diocesi di Aosta", "Archivio Storico Diocesano di Aosta", "Cattedrale di Aosta", "Aosta", ""),
    ("008", "Diocesi di Albenga-Imperia", "Archivio Storico Diocesano di Albenga-Imperia", "Cattedrale di Albenga", "Imperia", "The cathedral is in Albenga. Imperia has the concattedrale."),
    ("009", "Diocesi di Savona-Noli", "Archivio Storico Diocesano di Savona", "Duomo di Savona", "Savona", ""),
    ("010", "Arcidiocesi di Genova", "Archivio Storico Diocesano di Genova", "Cattedrale di San Lorenzo", "Genova", ""),
    ("011", "Diocesi della Spezia-Sarzana-Brugnato", "Archivio Storico Diocesano della Spezia", "Duomo della Spezia", "La Spezia", ""),
    ("012", "Arcidiocesi di Milano", "Archivio Storico Diocesano di Milano", "Duomo di Milano", "Milano", "Varese has no diocese of its own. The provincial capital is in the Archdiocese of Milan."),
    ("013", "Diocesi di Como", "Archivio Storico Diocesano di Como", "Duomo di Como", "Como", ""),
    ("014", "Diocesi di Como", "Archivio Storico Diocesano di Como", "Duomo di Como", "Como", "Sondrio is in the Diocese of Como."),
    ("015", "Arcidiocesi di Milano", "Archivio Storico Diocesano di Milano", "Duomo di Milano", "Milano", ""),
    ("016", "Diocesi di Bergamo", "Archivio Storico Diocesano di Bergamo", "Duomo di Bergamo", "Bergamo", ""),
    ("017", "Diocesi di Brescia", "Archivio Storico Diocesano di Brescia", "Duomo di Brescia", "Brescia", ""),
    ("018", "Diocesi di Pavia", "Archivio Storico Diocesano di Pavia", "Duomo di Pavia", "Pavia", ""),
    ("019", "Diocesi di Cremona", "Archivio Storico Diocesano di Cremona", "Duomo di Cremona", "Cremona", ""),
    ("020", "Diocesi di Mantova", "Archivio Storico Diocesano di Mantova", "Duomo di Mantova", "Mantova", ""),
    ("021", "Diocesi di Bolzano-Bressanone", "Archivio Storico Diocesano di Bolzano-Bressanone", "Duomo di Bolzano", "Bolzano", ""),
    ("022", "Arcidiocesi di Trento", "Archivio Storico Diocesano di Trento", "Duomo di Trento", "Trento", ""),
    ("023", "Diocesi di Verona", "Archivio Storico Diocesano di Verona", "Duomo di Verona", "Verona", ""),
    ("024", "Diocesi di Vicenza", "Archivio Storico Diocesano di Vicenza", "Duomo di Vicenza", "Vicenza", ""),
    ("025", "Diocesi di Belluno-Feltre", "Archivio Storico Diocesano di Belluno", "Duomo di Belluno", "Belluno", ""),
    ("026", "Diocesi di Treviso", "Archivio Storico Diocesano di Treviso", "Duomo di Treviso", "Treviso", ""),
    ("027", "Patriarcato di Venezia", "Archivio Storico del Patriarcato di Venezia", "Basilica di San Marco", "Venezia", ""),
    ("028", "Diocesi di Padova", "Archivio Storico Diocesano di Padova", "Duomo di Padova", "Padova", ""),
    ("029", "Diocesi di Adria-Rovigo", "Archivio Storico Diocesano di Adria-Rovigo", "Duomo di Rovigo", "Rovigo", "Adria and Rovigo share this diocese."),
    ("030", "Arcidiocesi di Udine", "Archivio Storico Diocesano di Udine", "Duomo di Udine", "Udine", ""),
    ("031", "Arcidiocesi di Gorizia", "Archivio Storico Diocesano di Gorizia", "Duomo di Gorizia", "Gorizia", ""),
    ("032", "Diocesi di Trieste", "Archivio Storico Diocesano di Trieste", "Duomo di Trieste", "Trieste", ""),
    ("033", "Diocesi di Piacenza-Bobbio", "Archivio Storico Diocesano di Piacenza", "Duomo di Piacenza", "Piacenza", ""),
    ("034", "Diocesi di Parma", "Archivio Storico Diocesano di Parma", "Duomo di Parma", "Parma", ""),
    ("035", "Diocesi di Reggio Emilia-Guastalla", "Archivio Storico Diocesano di Reggio Emilia", "Duomo di Reggio Emilia", "Reggio Emilia", ""),
    ("036", "Arcidiocesi di Modena-Nonantola", "Archivio Storico Diocesano di Modena", "Duomo di Modena", "Modena", ""),
    ("037", "Arcidiocesi di Bologna", "Archivio Storico Diocesano di Bologna", "Cattedrale di San Pietro", "Bologna", ""),
    ("038", "Arcidiocesi di Ferrara-Comacchio", "Archivio Storico Diocesano di Ferrara", "Duomo di Ferrara", "Ferrara", ""),
    ("039", "Arcidiocesi di Ravenna-Cervia", "Archivio Storico Diocesano di Ravenna", "Duomo di Ravenna", "Ravenna", ""),
    ("040", "Diocesi di Forlì-Bertinoro", "Archivio Storico Diocesano di Forlì", "Duomo di Forlì", "Forlì", "Cesena is the Diocesi di Cesena-Sarsina, not this diocese."),
    ("041", "Arcidiocesi di Pesaro", "Archivio Storico Diocesano di Pesaro", "Duomo di Pesaro", "Pesaro", "Urbino is a separate archdiocese."),
    ("042", "Arcidiocesi di Ancona-Osimo", "Archivio Storico Diocesano di Ancona", "Duomo di Ancona", "Ancona", ""),
    ("043", "Diocesi di Macerata", "Archivio Storico Diocesano di Macerata", "Duomo di Macerata", "Macerata", ""),
    ("044", "Diocesi di Ascoli Piceno", "Archivio Storico Diocesano di Ascoli Piceno", "Duomo di Ascoli Piceno", "Ascoli Piceno", ""),
    ("045", "Diocesi di Massa Carrara-Pontremoli", "Archivio Storico Diocesano di Massa", "Duomo di Massa", "Massa", ""),
    ("046", "Arcidiocesi di Lucca", "Archivio Storico Diocesano di Lucca", "Duomo di Lucca", "Lucca", ""),
    ("047", "Diocesi di Pistoia", "Archivio Storico Diocesano di Pistoia", "Duomo di Pistoia", "Pistoia", ""),
    ("048", "Arcidiocesi di Firenze", "Archivio Storico Diocesano di Firenze", "Cattedrale di Santa Maria del Fiore", "Firenze", ""),
    ("049", "Diocesi di Livorno", "Archivio Storico Diocesano di Livorno", "Duomo di Livorno", "Livorno", ""),
    ("050", "Arcidiocesi di Pisa", "Archivio Storico Diocesano di Pisa", "Duomo di Pisa", "Pisa", ""),
    ("051", "Diocesi di Arezzo-Cortona-Sansepolcro", "Archivio Storico Diocesano di Arezzo", "Duomo di Arezzo", "Arezzo", ""),
    ("052", "Arcidiocesi di Siena-Colle di Val d'Elsa-Montalcino", "Archivio Storico Diocesano di Siena", "Duomo di Siena", "Siena", ""),
    ("053", "Diocesi di Grosseto", "Archivio Storico Diocesano di Grosseto", "Duomo di Grosseto", "Grosseto", ""),
    ("054", "Arcidiocesi di Perugia-Città della Pieve", "Archivio Storico Diocesano di Perugia", "Duomo di Perugia", "Perugia", ""),
    ("055", "Diocesi di Terni-Narni-Amelia", "Archivio Storico Diocesano di Terni", "Duomo di Terni", "Terni", ""),
    ("056", "Diocesi di Viterbo", "Archivio Storico Diocesano di Viterbo", "Duomo di Viterbo", "Viterbo", ""),
    ("057", "Diocesi di Rieti", "Archivio Storico Diocesano di Rieti", "Duomo di Rieti", "Rieti", ""),
    ("058", "Diocesi di Roma", "Archivio Storico Diocesano di Roma", "Basilica di San Giovanni in Laterano", "Roma", "The cathedral of the Diocese of Rome is San Giovanni in Laterano."),
    ("059", "Diocesi di Latina-Terracina-Sezze-Priverno", "Archivio Storico Diocesano di Latina", "Duomo di Latina", "Latina", ""),
    ("060", "Diocesi di Frosinone-Veroli-Ferentino", "Archivio Storico Diocesano di Frosinone", "Duomo di Frosinone", "Frosinone", ""),
    ("061", "Diocesi di Caserta", "Archivio Storico Diocesano di Caserta", "Duomo di Caserta", "Caserta", ""),
    ("062", "Arcidiocesi di Benevento", "Archivio Storico Diocesano di Benevento", "Duomo di Benevento", "Benevento", ""),
    ("063", "Arcidiocesi di Napoli", "Archivio Storico Diocesano di Napoli", "Duomo di Napoli", "Napoli", ""),
    ("064", "Diocesi di Avellino", "Archivio Storico Diocesano di Avellino", "Duomo di Avellino", "Avellino", ""),
    ("065", "Arcidiocesi di Salerno-Campagna-Acerno", "Archivio Storico Diocesano di Salerno", "Duomo di Salerno", "Salerno", ""),
    ("066", "Arcidiocesi dell'Aquila", "Archivio Storico Diocesano dell'Aquila", "Duomo dell'Aquila", "L'Aquila", ""),
    ("067", "Diocesi di Teramo-Atri", "Archivio Storico Diocesano di Teramo", "Duomo di Teramo", "Teramo", ""),
    ("068", "Arcidiocesi di Pescara-Penne", "Archivio Storico Diocesano di Pescara", "Duomo di Pescara", "Pescara", ""),
    ("069", "Arcidiocesi di Chieti-Vasto", "Archivio Storico Diocesano di Chieti", "Duomo di Chieti", "Chieti", ""),
    ("070", "Arcidiocesi di Campobasso-Boiano", "Archivio Storico Diocesano di Campobasso", "Duomo di Campobasso", "Campobasso", ""),
    ("071", "Arcidiocesi di Foggia-Bovino", "Archivio Storico Diocesano di Foggia", "Duomo di Foggia", "Foggia", ""),
    ("072", "Arcidiocesi di Bari-Bitonto", "Archivio Storico Diocesano di Bari", "Duomo di Bari", "Bari", ""),
    ("073", "Arcidiocesi di Taranto", "Archivio Storico Diocesano di Taranto", "Duomo di Taranto", "Taranto", ""),
    ("074", "Arcidiocesi di Brindisi-Ostuni", "Archivio Storico Diocesano di Brindisi", "Duomo di Brindisi", "Brindisi", ""),
    ("075", "Arcidiocesi di Lecce", "Archivio Storico Diocesano di Lecce", "Duomo di Lecce", "Lecce", ""),
    ("076", "Arcidiocesi di Potenza-Muro Lucano-Marsico Nuovo", "Archivio Storico Diocesano di Potenza", "Duomo di Potenza", "Potenza", ""),
    ("077", "Arcidiocesi di Matera-Irsina", "Archivio Storico Diocesano di Matera", "Duomo di Matera", "Matera", ""),
    ("078", "Arcidiocesi di Cosenza-Bisignano", "Archivio Storico Diocesano di Cosenza", "Duomo di Cosenza", "Cosenza", ""),
    ("079", "Arcidiocesi di Catanzaro-Squillace", "Archivio Storico Diocesano di Catanzaro", "Duomo di Catanzaro", "Catanzaro", ""),
    ("080", "Arcidiocesi di Reggio Calabria-Bova", "Archivio Storico Diocesano di Reggio Calabria", "Duomo di Reggio Calabria", "Reggio Calabria", ""),
    ("081", "Diocesi di Trapani", "Archivio Storico Diocesano di Trapani", "Duomo di Trapani", "Trapani", "Mazara del Vallo is a separate diocese."),
    ("082", "Arcidiocesi di Palermo", "Archivio Storico Diocesano di Palermo", "Cattedrale di Palermo", "Palermo", ""),
    ("083", "Arcidiocesi di Messina-Lipari-Santa Lucia del Mela", "Archivio Storico Diocesano di Messina", "Duomo di Messina", "Messina", ""),
    ("084", "Arcidiocesi di Agrigento", "Archivio Storico Diocesano di Agrigento", "Duomo di Agrigento", "Agrigento", ""),
    ("085", "Diocesi di Caltanissetta", "Archivio Storico Diocesano di Caltanissetta", "Duomo di Caltanissetta", "Caltanissetta", ""),
    ("086", "Diocesi di Piazza Armerina", "Archivio Storico Diocesano di Piazza Armerina", "Cattedrale di Piazza Armerina", "Piazza Armerina", "Enna, the old Castrogiovanni, is in the Diocese of Piazza Armerina. The Duomo of Enna is a mother church of that city, not a separate diocese."),
    ("087", "Arcidiocesi di Catania", "Archivio Storico Diocesano di Catania", "Duomo di Catania", "Catania", ""),
    ("088", "Diocesi di Ragusa", "Archivio Storico Diocesano di Ragusa", "Duomo di Ragusa", "Ragusa", ""),
    ("089", "Arcidiocesi di Siracusa", "Archivio Storico Diocesano di Siracusa", "Duomo di Siracusa", "Siracusa", ""),
    ("090", "Arcidiocesi di Sassari", "Archivio Storico Diocesano di Sassari", "Duomo di Sassari", "Sassari", ""),
    ("091", "Diocesi di Nuoro", "Archivio Storico Diocesano di Nuoro", "Duomo di Nuoro", "Nuoro", ""),
    ("092", "Arcidiocesi di Cagliari", "Archivio Storico Diocesano di Cagliari", "Duomo di Cagliari", "Cagliari", ""),
    ("093", "Diocesi di Concordia-Pordenone", "Archivio Storico Diocesano di Pordenone", "Duomo di Pordenone", "Pordenone", ""),
    ("094", "Diocesi di Isernia-Venafro", "Archivio Storico Diocesano di Isernia", "Duomo di Isernia", "Isernia", ""),
    ("095", "Arcidiocesi di Oristano", "Archivio Storico Diocesano di Oristano", "Duomo di Oristano", "Oristano", ""),
    ("096", "Diocesi di Biella", "Archivio Storico Diocesano di Biella", "Duomo di Biella", "Biella", ""),
    ("097", "Arcidiocesi di Milano", "Archivio Storico Diocesano di Milano", "Duomo di Milano", "Milano", "Lecco is in the Archdiocese of Milan."),
    ("098", "Diocesi di Lodi", "Archivio Storico Diocesano di Lodi", "Duomo di Lodi", "Lodi", ""),
    ("099", "Diocesi di Rimini", "Archivio Storico Diocesano di Rimini", "Duomo di Rimini", "Rimini", ""),
    ("100", "Diocesi di Prato", "Archivio Storico Diocesano di Prato", "Duomo di Prato", "Prato", ""),
    ("101", "Arcidiocesi di Crotone-Santa Severina", "Archivio Storico Diocesano di Crotone", "Duomo di Crotone", "Crotone", ""),
    ("102", "Diocesi di Mileto-Nicotera-Tropea", "Archivio Storico Diocesano di Mileto", "Cattedrale di Mileto", "Mileto", "Vibo Valentia is in this diocese. The archive is at Mileto."),
    ("103", "Diocesi di Novara", "Archivio Storico Diocesano di Novara", "Duomo di Novara", "Novara", "Verbania and the rest of Verbano-Cusio-Ossola are in the Diocese of Novara."),
    ("108", "Arcidiocesi di Milano", "Archivio Storico Diocesano di Milano", "Duomo di Milano", "Milano", "Monza is in the Archdiocese of Milan."),
    ("109", "Arcidiocesi di Fermo", "Archivio Storico Diocesano di Fermo", "Duomo di Fermo", "Fermo", ""),
    ("110", "Arcidiocesi di Trani-Barletta-Bisceglie", "Archivio Storico Diocesano di Trani", "Duomo di Trani", "Trani", "Andria is the Diocesi di Andria, a different diocese in the same province."),
    ("111", "Diocesi di Iglesias", "Archivio Storico Diocesano di Iglesias", "Duomo di Iglesias", "Iglesias", "Carbonia, the provincial seat, is in the Diocese of Iglesias. Other towns in Sud Sardegna use Ales-Terralba or another diocese."),
]


def beweb(place: str) -> str:
    # The /ricerca path returns 404. BeWeB reads the search from the hash.
    query = urllib.parse.urlencode({
        "action": "ricerca/risultati",
        "view": "griglia",
        "locale": "it",
        "dominio": "7",
        "ambito": "FONDI",
        "liberaluogo": place,
    })
    return f"https://www.beweb.chiesacattolica.it/beniarchivistici/?l=it_IT#{query}"


def province_bundle() -> dict:
    by_province = {}
    for code, name, archive, cathedral, search, note in PROVINCES:
        by_province[code] = {
            "name": name,
            "archive": archive,
            "cathedral": cathedral,
            "searchPlace": search,
            "bewebUrl": beweb(search),
            "note": note,
            "source": "province-seat",
        }
    return {
        "source": "Offline diocese of each provincial capital, CEI names. Wikidata P708 overlays a comune when a cached row exists.",
        "beweb": "https://www.beweb.chiesacattolica.it/",
        "byProvince": by_province,
        "byIstat": {},
    }


def sparql(query: str, timeout: int) -> str:
    data = urllib.parse.urlencode({"query": query}).encode()
    request = urllib.request.Request(
        SPARQL,
        data=data,
        headers={"Accept": "text/csv", "User-Agent": UA},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


DIOCESE_QUERY = """
SELECT ?istat ?dioceseLabel WHERE {
  ?comune wdt:P31 wd:Q747074 ;
          wdt:P635 ?istat ;
          wdt:P708 ?diocese .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}
"""

CHURCH_QUERY = """
SELECT ?istat ?churchLabel ?inception WHERE {
  ?comune wdt:P31 wd:Q747074 ;
          wdt:P635 ?istat .
  ?church wdt:P131 ?comune ;
          wdt:P31/wdt:P279* wd:Q16970 ;
          wdt:P571 ?inception .
  FILTER(YEAR(?inception) < 1900)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}
"""


def istat_code(value: str) -> str:
    digits = "".join(ch for ch in value if ch.isdigit())
    return digits.zfill(6) if digits else ""


def church_rank(label: str) -> int:
    text = label.lower()
    if "chiesa madre" in text or "cattedrale" in text or text.startswith("duomo"):
        return 3
    if "pieve" in text or "basilica" in text:
        return 2
    return 1


def fetch_wikidata() -> dict:
    by_istat: dict[str, dict] = {}
    try:
        table = list(csv.DictReader(io.StringIO(sparql(DIOCESE_QUERY, 50))))
    except Exception as error:
        print(f"wikidata diocese query failed: {error}")
        table = []
    for row in table:
        code = istat_code(row.get("istat", ""))
        label = (row.get("dioceseLabel") or "").strip()
        if not code or not label or label.startswith("Q"):
            continue
        by_istat[code] = {
            "name": label,
            "archive": f"Archivio Storico Diocesano — {label}",
            "searchPlace": label,
            "bewebUrl": beweb(label),
            "source": "wikidata",
        }
    print(f"wikidata dioceses {len(by_istat)}")
    churches: dict[str, tuple[int, str]] = {}
    try:
        church_rows = list(csv.DictReader(io.StringIO(sparql(CHURCH_QUERY, 45))))
    except Exception as error:
        print(f"wikidata church query failed: {error}")
        church_rows = []
    for row in church_rows:
        code = istat_code(row.get("istat", ""))
        label = (row.get("churchLabel") or "").strip()
        if not code or not label or label.startswith("Q"):
            continue
        rank = church_rank(label)
        previous = churches.get(code)
        if previous is None or rank > previous[0]:
            churches[code] = (rank, label)
    for code, (_rank, label) in churches.items():
        slot = by_istat.setdefault(code, {"source": "wikidata"})
        slot["church"] = label
    print(f"wikidata churches {len(churches)}")
    return {"byIstat": by_istat}


def main() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    payload = fetch_wikidata()
    WIKI_OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {WIKI_OUT} rows {len(payload['byIstat'])}")
    bundle = province_bundle()
    if len(bundle["byProvince"]) < 100:
        raise SystemExit("province diocese table is incomplete")
    print(f"province dioceses {len(bundle['byProvince'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
