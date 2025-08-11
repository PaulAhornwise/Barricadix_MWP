import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Chatbot-Widget für Zufahrtsschutz-Assistent (DIN SPEC 91414-2 / ISO 22343-2)
 * --------------------------------------------------------------
 * Verwendung:
 * 1) Lege den Kartencontainer als `relative` an und rendere <ZufahrtsschutzChatbot /> als Kind.
 * 2) Optional: Übergib `planningState` und `setPlanningState` aus eurem globalen Store.
 * 3) Der Bot fragt nur Werte ab, die im State fehlen oder zu unsicher sind.
 *
 * Props:
 *  - planningState?: beliebiges Objekt, das die Planungsdaten hält
 *  - setPlanningState?: (updater) => void – zum Zurückschreiben in euren Store
 *  - getCandidatesFor?: (field: string) => Array<{value:any, confidence:number, source:string}> –
 *      liefert vorhandene Kandidaten (z.B. Karte, Threat-Profil) für den Resolver
 *
 * Styling: TailwindCSS vorausgesetzt. Animation via Framer Motion.
 */

// --------------------------- Hilfs-Types ---------------------------
type Candidate<T = any> = { value: T; confidence: number; source: string };

type Question = {
  id: string;
  label: string;
  field: string; // Zielpfad im planningState (dot notation)
  type: "text" | "multiselect" | "select" | "number" | "bool" | "chips" | "geo";
  options?: string[];
  placeholder?: string;
  info?: string; // Kurz-Hinweis, warum die Frage wichtig ist
  dependsOn?: string[]; // andere Felder, die zuerst benötigt werden
  resolver?: (candidates: Candidate[]) => { value?: any; ask: boolean; reason?: string };
};

// --------------------------- Utility: get/set by path ---------------------------
function getByPath(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}
function setByPath(obj: any, path: string, value: any) {
  const keys = path.split(".");
  const last = keys.pop() as string;
  let cur = obj;
  for (const k of keys) {
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[last] = value;
}

// --------------------------- Default Resolver ---------------------------
function defaultResolve(field: string, candidates: Candidate[] = [], threshold = 0.7) {
  if (!candidates || candidates.length === 0) return { ask: true, reason: "missing" };
  const best = [...candidates].sort((a, b) => b.confidence - a.confidence)[0];
  if (best.confidence >= threshold) return { value: best.value, ask: false };
  return { value: best.value, ask: true, reason: "low_confidence" };
}

// --------------------------- Fragen-Definition ---------------------------
const QUESTIONS: Question[] = [
  {
    id: "schutzgueter",
    label: "Welche Schutzgüter möchten Sie absichern?",
    field: "schutzgüter",
    type: "chips",
    options: ["Menschenmenge", "Gebäude", "KRITIS-Prozess", "Veranstaltungsfläche"],
    placeholder: "z. B. Menschenmenge, Bühne",
    info: "Grundlage für Schutzziel & Schutzklasse (DIN SPEC 91414-2 / ISO 22343-2)",
  },
  {
    id: "stakeholder",
    label: "Wer sind die relevanten Stakeholder (Behörden, Veranstalter, Betreiber)?",
    field: "stakeholder",
    type: "chips",
    options: ["Behörden", "Veranstalter", "Betreiber"],
  },
  {
    id: "restrisiko",
    label: "Welches akzeptable Restrisiko gilt?",
    field: "restrisiko.klasse",
    type: "select",
    options: ["niedrig", "mittel", "hoch"],
    info: "Steuert Schutzklasse/Sicherungsgrad (DIN SPEC 91414-2)",
  },
  {
    id: "betrieb",
    label: "Betriebsanforderungen (mehrfach wählbar)",
    field: "betrieb",
    type: "multiselect",
    options: ["Feuerwehrzufahrt", "Fluchtwege", "Verkehrssicherheit", "Betriebssicherheit"],
  },
  {
    id: "bedrohung",
    label: "Welche Art fahrzeuggestützter Bedrohung ist zu erwarten?",
    field: "risiko.bedrohung.art",
    type: "select",
    options: ["intentional", "unbeabsichtigt", "beides"],
  },
  {
    id: "fahrzeugtypen",
    label: "Welche Fahrzeugtypen sind relevant?",
    field: "risiko.bedrohung.fahrzeugtypen",
    type: "chips",
    options: ["PKW", "Transporter", "LKW", "Bus"],
  },
  {
    id: "anfahrkorridore",
    label: "Wo könnten Fahrzeuge eindringen? (Karte markieren oder beschreiben)",
    field: "risiko.site.anfahrkorridore",
    type: "geo",
    placeholder: "Polyline/Polygon auswählen oder kurz beschreiben",
  },
  {
    id: "geschwindigkeit",
    label: "Maximale Zufahrtsgeschwindigkeit (km/h)",
    field: "risiko.dynamik.v_kmh",
    type: "number",
    info: "Pflichtparameter für FSB-Performance (ISO 22343-2/-1)",
    resolver: (cand) => defaultResolve("risiko.dynamik.v_kmh", cand, 0.7),
  },
  {
    id: "winkel",
    label: "Wahrscheinlicher Anprallwinkel (°)",
    field: "risiko.dynamik.winkel_grad",
    type: "number",
    info: "Pflichtparameter für FSB-Performance (ISO 22343-2/-1)",
    resolver: (cand) => defaultResolve("risiko.dynamik.winkel_grad", cand, 0.7),
  },
  {
    id: "untergrund",
    label: "Untergrund/Fundamente am Standort",
    field: "risiko.site.untergrund",
    type: "select",
    options: ["Asphalt", "Beton", "Pflaster", "Erde", "Unbekannt"],
  },
  {
    id: "risikomatrix",
    label: "Risikobewertung: Eintrittswahrscheinlichkeit & Schadensausmaß",
    field: "risiko.matrix",
    type: "select",
    options: [
      "EW:niedrig|SA:gering",
      "EW:niedrig|SA:mittel",
      "EW:mittel|SA:mittel",
      "EW:hoch|SA:schwer",
    ],
    info: "Erzeugt Sicherungsgrad & Schutzklasse (DIN SPEC 91414-2)",
  },
];

// --------------------------- UI-Komponenten ---------------------------
function ChatbotButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      aria-label="Zufahrtsschutz-Assistent öffnen"
      onClick={onToggle}
      className="zb-btn absolute bottom-5 right-5"
    >
      <span className="text-xl">{open ? "×" : "💬"}</span>
    </button>
  );
}

function ChatMessage({ role, text }: { role: "bot" | "user"; text: string }) {
  const isBot = role === "bot";
  return (
    <div className={`zb-msg ${isBot ? "zb-msg-left" : "zb-msg-right"}`}>
      <div className={`zb-bubble ${isBot ? "zb-bot" : "zb-user"}`}>
        {text}
      </div>
    </div>
  );
}

function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="zb-input">
      <input
        className="zb-input-field"
        placeholder="Antwort eingeben…"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val.trim()) {
            onSend(val.trim());
            setVal("");
          }
        }}
      />
      <button
        className="zb-input-send"
        onClick={() => {
          if (!val.trim()) return;
          onSend(val.trim());
          setVal("");
        }}
      >
        Senden
      </button>
    </div>
  );
}

// --------------------------- Haupt-Widget ---------------------------
export default function ZufahrtsschutzChatbot({
  planningState: externalState,
  setPlanningState: externalSet,
  getCandidatesFor,
}: {
  planningState?: any;
  setPlanningState?: (updater: (prev: any) => any) => void;
  getCandidatesFor?: (field: string) => Candidate[];
}) {
  // Lokaler Fallback-State (falls kein externer Store übergeben):
  const [internalPS, setInternalPS] = useState<any>({});
  const planningState = externalState ?? internalPS;
  const setPlanningState = externalSet ?? ((updater: (prev: any) => any) => setInternalPS((p: any) => updater(p)));
  // Expose globally so the Bericht-Fallback Chat-Daten nutzen kann
  (window as any).planningState = planningState;

  const [open, setOpen] = useState(true); // Automatisch öffnen
  const [messages, setMessages] = useState<{ role: "bot" | "user"; text: string; field?: string }[]>([]);
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [completed, setCompleted] = useState(false);

  // Erstnachricht und erste Frage sofort anzeigen
  useEffect(() => {
    if (messages.length === 0) {
      pushBot("Willkommen zum Zufahrtsschutz‑Assistenten. Ich stelle nur Fragen, die noch fehlen oder unsicher sind. Bereit?");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushBot(text: string) {
    setMessages((m) => [...m, { role: "bot", text }]);
  }
  function pushUser(text: string, field?: string) {
    setMessages((m) => [...m, { role: "user", text, field }]);
  }

  // Resolver: prüft, ob Frage gestellt werden muss
  const resolveField = (q: Question) => {
    const existing = getByPath(planningState, q.field);
    if (existing !== undefined && existing !== null && existing !== "") {
      return { ask: false, value: existing };
    }
    const candidates = getCandidatesFor ? getCandidatesFor(q.field) : [];
    const r = q.resolver ? q.resolver(candidates) : defaultResolve(q.field, candidates, 0.7);
    return r;
  };

  // Nächste Frage finden
  function findNextQuestion(): Question | null {
    for (const q of QUESTIONS) {
      if (q.dependsOn) {
        const unmet = q.dependsOn.find((p) => !getByPath(planningState, p));
        if (unmet) continue;
      }
      const res = resolveField(q);
      if (res.ask) return q;
      if (res.value !== undefined) {
        // Auto-übernehmen
        setPlanningState((prev) => {
          const clone = { ...(prev ?? {}) };
          setByPath(clone, q.field, res.value);
          return clone;
        });
      }
    }
    return null;
  }

  // Fragenfluss sofort starten, wenn der Chatbot geöffnet ist
  useEffect(() => {
    if (completed) return;
    if (currentQ) return;
    const next = findNextQuestion();
    if (next) {
      setCurrentQ(next);
      pushBot(next.label + (next.info ? `\n\nHinweis: ${next.info}` : ""));
    } else if (!completed && messages.length > 0) {
      pushBot("Danke! Alle erforderlichen Angaben sind vorhanden. Möchten Sie den normkonformen PDF-Plan erzeugen?");
      setCompleted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningState, currentQ, completed, messages.length]);

  // Antwortverarbeitung
  function handleAnswer(text: string) {
    if (!currentQ) {
      // Startbestätigung
      if (/^(ja|start|bereit|ok|okay|los)/i.test(text)) {
        setCompleted(false); // Neustart des Flows
        setCurrentQ(null); // triggert findNextQuestion
      }
      pushUser(text);
      return;
    }

    pushUser(text, currentQ.field);

    // rudimentäre Typ-Parsings
    let value: any = text;
    if (currentQ.type === "number") {
      const num = parseFloat(text.replace(",", "."));
      value = isNaN(num) ? undefined : num;
    } else if (currentQ.type === "chips") {
      // Kommagetrennt in Array
      value = text.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (currentQ.type === "multiselect") {
      value = text.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (currentQ.type === "select") {
      value = text.trim();
    } else if (currentQ.type === "bool") {
      value = /^(ja|true|y|yes)$/i.test(text);
    }

    setPlanningState((prev: any) => {
      const clone = { ...(prev ?? {}) };
      if (value !== undefined) setByPath(clone, currentQ.field, value);
      return clone;
    });

    // nächste Frage vorbereiten
    setCurrentQ(null);
  }

  return (
    <>
      <ChatbotButton open={open} onToggle={() => setOpen((o) => !o)} />

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 28 }}
            className="zb-panel absolute right-5 bottom-24"
            aria-label="Zufahrtsschutz-Assistent Panel"
          >
            <header className="zb-header">
              <div className="zb-title">Zufahrtsschutz‑Assistent</div>
              <div className="zb-sub">DIN SPEC 91414‑2 · ISO 22343‑2</div>
            </header>

            <div className="zb-messages">
              {messages.map((m, idx) => <ChatMessage key={idx} role={m.role} text={m.text} />)}
            </div>

            <ChatInput onSend={handleAnswer} />
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
