// src/systems/NarratorSystem.js
const GENERAL_LINES = [
  "Der Besucher betrat Halle 6 mit einem klaren Ziel. Dieses Ziel war naiv, aber klar.",
  "Links befand sich der gesuchte Stand. Der Besucher ging nach rechts. Offenbar war Orientierung heute als optionales Feature aktiviert.",
  "Er stellte sich in die Warteschlange. Nicht weil er wusste, wofür sie war, sondern weil andere Menschen bereits darin standen. So entstehen Institutionen.",
  "Vor ihm lagen zwei Wege. Einer führte zum Ausgang. Der andere war mit einem großen blinkenden Drachen beschildert. Seine Entscheidung überraschte niemanden.",
  "Der Besucher drückte den roten Knopf. Es gab keinen vernünftigen Anlass dafür. Andererseits war er rot.",
  "Auf dem Bildschirm stand deutlich: 'Nicht berühren.' Der Besucher verstand dies als persönliche Einladung.",
  "Er erhielt ein digitales Namensschild. Es bezeichnete ihn als Gast. Damit war sein bisheriges Leben offenbar administrativ beendet.",
  "Die App bat um Zugriff auf seinen Standort. Er befand sich direkt vor dem Stand. Die App wollte sicher sein.",
  "Der Standmitarbeiter lächelte professionell. Es war jenes Lächeln, das entsteht, wenn die Fluchtwege im Arbeitsvertrag nicht erwähnt wurden.",
  "Der Besucher hatte nun drei Newsletter abonniert und noch immer nicht erfahren, was das Spiel eigentlich war.",
  "Er nahm den kostenlosen Energy-Drink. Kostenlos ist ein starkes Wort für eine Flüssigkeit, die später Kontrolle über den Puls übernimmt.",
  "Die Demo begann. Der Besucher durfte laufen, springen und eine Tür öffnen. Nach acht Jahren Entwicklung wollte man offenbar nichts überstürzen.",
  "Er übersprang das Tutorial. Wenige Sekunden später suchte er nach dem Tutorial.",
  "Der Hallenplan erklärte, der Stand liege 40 Meter entfernt. Nach zwölf Minuten hatte sich die Entfernung auf 55 Meter erhöht. Der Stand gewann.",
  "Der Besucher sprach den NPC an. Der NPC wiederholte denselben Satz. Der Besucher versuchte es erneut. Beide hielten den jeweils anderen für technisch eingeschränkt.",
  "Ein Mitarbeiter bat ihn, kurz zu warten. 'Kurz' war hier kein Zeitraum. Es war eine Unternehmenskultur.",
  "Er betrat den abgesperrten Bereich, weil das Absperrband auf Hüfthöhe hing und damit eher wie eine Herausforderung wirkte.",
  "Die Tür öffnete sich nur für registrierte Fachbesucher. Der Besucher war registriert. Leider nicht als sich selbst.",
  "Sein QR-Code wurde abgelehnt. Nicht wegen Ungültigkeit. Der Scanner hatte schlicht andere Vorstellungen von ihm.",
  "Er versuchte, die App neu zu starten. Die App interpretierte dies als Vertrauensbruch.",
  "Der Besucher wollte lediglich ein Spiel ausprobieren. Inzwischen besaß er einen Account, eine Kunden-ID und eine dokumentierte Abneigung gegen Zwei-Faktor-Authentifizierung.",
  "Die Warteschlange bewegte sich. Nicht nach vorn, aber Bewegung war Bewegung.",
  "Am Ende der Schlange befand sich eine zweite Schlange. Dies war kein Fehler. Dies war Fortschritt.",
  "Er fragte nach dem Ausgang. Der Mitarbeiter zeigte auf ein Schild. Das Schild zeigte auf einen anderen Mitarbeiter. Die Verantwortung war sauber verteilt.",
  "Der Besucher setzte sich auf einen freien Stuhl. Sofort erschien ein Mitarbeiter und erklärte, der Stuhl gehöre zum Standkonzept.",
  "Er nahm ein Werbegeschenk. Es war ein Schlüsselband. Damit verfügte er nun über vier Schlüsselbänder und keinen Schlüssel.",
  "Die Kamera fotografierte ihn im exakt falschen Moment. Das System bezeichnete das Ergebnis als Erinnerung.",
  "Der Besucher schloss die Datenschutzerklärung. Die Datenschutzerklärung bemerkte es.",
  "Er verließ den Stand ohne Interesse am Produkt. Der Stand registrierte dies als erfolgreiche Interaktion.",
  "Die App gratulierte ihm zu 10.000 Schritten. Sie verschwieg, dass 8.000 davon durch falsche Navigation entstanden waren.",
  "Der Besucher wollte zurück zu Halle 4. Halle 4 war damit nicht einverstanden.",
  "Ein Maskottchen winkte ihm zu. Er winkte zurück. Damit war eine soziale Verpflichtung entstanden, deren Umfang beide unterschätzt hatten.",
  "Er öffnete die Karte. Die Karte drehte sich. Er drehte sich ebenfalls. Für einige Sekunden bestand Gleichstand.",
  "Der Besucher ignorierte die Durchsage. Die Durchsage wiederholte sich lauter, wie es Systeme tun, die Überzeugung mit Lautstärke verwechseln.",
  "Die Demo stürzte ab. Der Mitarbeiter nannte es einen bekannten Fehler. Der Besucher fand diese Formulierung beruhigend, obwohl sie das Gegenteil bedeutete.",
  "Er erreichte den Ausgang. Die App fragte, ob er seinen Besuch wirklich abbrechen wolle. Vier Hallen, zwei Blasen und ein leerer Akku galten offenbar als unzureichende Begründung.",
  "Der Besucher drückte auf 'Nein'. Nicht freiwillig. Der Button 'Ja' befand sich hinter einem Newsletter-Fenster.",
  "Für einen kurzen Moment glaubte er, die Kontrolle zurückgewonnen zu haben. Dann vibrierte sein Telefon.",
  "Die Messe endete um 20 Uhr. Sein Account blieb aktiv.",
  "Er verließ das Gelände mit einem Stoffbeutel, sieben Flyern und keiner Erinnerung daran, weshalb er ursprünglich gekommen war."
];

const PLAYER_REACTIVE_LINES = {
  jump: [
    "Der Besucher sprang erneut. Der Boden hatte ihn bislang zuverlässig getragen, doch Vertrauen war offenbar keine Option.",
    "Springen war eine Entscheidung, die der Besucher häufig traf, ohne dass die Umgebung sie erfordert hätte."
  ],
  walk_backwards: [
    "Er entschied sich, rückwärts zu gehen. So konnte er wenigstens sehen, welche Chancen er bereits vertan hatte.",
    "Rückwärtsgehen war hier keine taktische Entscheidung. Es war eine Lebenseinstellung."
  ],
  idle_long: [
    "Der Besucher bewegte sich nicht. Die Messe bewegte sich ebenfalls nicht. Dennoch war nur einer von beiden erschöpft.",
    "Er stand still. Die Partikel um ihn herum jedoch nicht. Damit war er moralisch im Nachteil."
  ],
  wall_hit: [
    "Vor ihm befand sich eine Wand. Der Besucher führte eine kurze, aber eindeutige technische Prüfung durch.",
    "Die Wand bestand aus Beton. Der Besucher bestand aus Optimismus. Beide blieben zunächst unverändert."
  ],
  ignore_objective: [
    "Das Ziel lag direkt vor ihm. Er entfernte sich davon mit jener Entschlossenheit, die normalerweise nur Menschen mit einem Plan besitzen.",
    "Er ignorierte den Zielmarker. Dies war keine Rebellion. Es war Inkompetenz, die sich als Rebellion tarnte."
  ],
  return_after_long: [
    "Er war zurückgekehrt. Der Stand hatte sich nicht verändert. Das machte die Angelegenheit unangenehm persönlich.",
    "Wieder da. Der Stand hatte nicht auf ihn gewartet, was ehrlicherweise auch nicht vereinbart worden war."
  ],
  click_everything: [
    "Der Besucher untersuchte jeden Gegenstand. Nicht aus Neugier, sondern aus der tiefen Überzeugung, dass irgendwo ein Entwickler Arbeitszeit verschwendet haben musste.",
    "Er klickte alles an. Die Welt reagierte auf etwa die Hälfte. Das war mehr, als er erwartet hatte."
  ],
  leave_tutorial: [
    "Das Tutorial war noch nicht beendet. Der Besucher schon.",
    "Er verließ den Übungsbereich. Die Konsequenzen würden sich nicht sofort zeigen. Das war das Problem."
  ],
  fall_out: [
    "Der Besucher hatte das Messegelände verlassen, ohne einen vorgesehenen Ausgang zu benutzen. Endlich eine effiziente Route.",
    "Außerhalb der Karte. Technisch gesehen war er nun ein Bug."
  ],
  block_npc: [
    "Der Besucher stellte sich dem Mitarbeiter in den Weg. Der Mitarbeiter passte seine Route an. Der Besucher hatte damit seine erste messbare Wirkung auf die Veranstaltung erzielt.",
    "Er blockierte einen NPC. In manchen Kulturen würde das als Aggression gelten. Hier galt es als Interaktion."
  ],
  stage_enter: [
    "Er betrat die Bühne. Niemand hatte ihn eingeladen. Das Publikum bestand aus drei NPCs, einem Feuerlöscher und seinem eigenen Fehlurteil.",
    "Die Bühne war für jemand anderen gedacht. Der Besucher war für niemanden gedacht. Insofern passte es."
  ],
  too_much_merch: [
    "Er nahm noch einen Stoffbeutel. Ab diesem Punkt transportierte er keine Werbegeschenke mehr. Die Werbegeschenke transportierten ihn.",
    "Sein Inventar war voll. Sein Leben war voll. Beides war sein eigener Fehler."
  ],
  close_app: [
    "Der Besucher schloss die Anwendung. Die Anwendung blieb überzeugt, dass es sich um ein Versehen handelte.",
    "Beenden. Das System fragte nach dem Grund. Der Besucher nannte 'Freiheit'. Das System akzeptierte es nicht."
  ]
};

export class NarratorSystem {
  constructor() {
    this.cooldowns = new Map();
    this.globalCooldown = 0;
    this.lastLine = '';
  }

  trigger(eventType, context = {}) {
    if (this.globalCooldown > 0) return;
    const pool = PLAYER_REACTIVE_LINES[eventType] || GENERAL_LINES;
    const line = pool[Math.floor(Math.random() * pool.length)];
    if (line === this.lastLine) return;
    this.lastLine = line;
    this.showLine(line);
    this.globalCooldown = 8;
    this.cooldowns.set(eventType, 15);
  }

  showLine(text) {
    console.log(`[ERZÄHLER] ${text}`);
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('narrator-line', { detail: { text } }));
    }
  }

  update(dt) {
    if (this.globalCooldown > 0) this.globalCooldown -= dt;
    for (const [key, val] of this.cooldowns) {
      if (val > 0) this.cooldowns.set(key, val - dt);
    }
  }
}
