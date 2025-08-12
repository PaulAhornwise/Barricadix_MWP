import { useEffect, useState, useRef } from "react";
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
function defaultResolve(_field: string, candidates: Candidate[] = [], threshold = 0.7) {
  if (!candidates || candidates.length === 0) return { ask: true, reason: "missing" };
  const best = [...candidates].sort((a, b) => b.confidence - a.confidence)[0];
  if (best.confidence >= threshold) return { value: best.value, ask: false };
  return { value: best.value, ask: true, reason: "low_confidence" };
}

// --------------------------- Übersetzungsfunktion ---------------------------
function t(key: string): string {
  // NEUE METHODE: Versuche zuerst, die globale Übersetzungsfunktion zu verwenden
  if (typeof window !== 'undefined' && (window as any).t) {
    try {
      const globalTranslation = (window as any).t(key);
      if (globalTranslation && globalTranslation !== key) {
        console.log(`Chatbot: Using global translation for "${key}":`, globalTranslation);
        return globalTranslation;
      }
    } catch (error) {
      console.log('Chatbot: Global translation failed, using fallback');
    }
  }
  
  // ALTE METHODE: Eingebettete Übersetzungen als Fallback
  // Direkter Zugriff auf eingebettete Übersetzungen
  const embeddedTranslations: Record<string, Record<string, string>> = {
    de: {
      "ai.chatbot.title": "Zufahrtsschutz-Assistent",
      "ai.chatbot.welcome": "Willkommen zum Zufahrtsschutz-Assistenten. Ich stelle nur Fragen, die noch fehlen oder unsicher sind. Bereit?",
      "ai.chatbot.assetQuestion": "Welche Schutzgüter möchten Sie absichern? Hinweis: Grundlage für Schutzziel & Schutzklasse (DIN SPEC 91414-2 / ISO 22343-2)",
      "ai.chatbot.inputPlaceholder": "Antwort eingeben...",
      "ai.chatbot.sendButton": "Senden",
      "ai.chatbot.stakeholderQuestion": "Wer sind die relevanten Stakeholder (Behörden, Veranstalter, Betreiber)?",
      "ai.chatbot.restRiskQuestion": "Welches akzeptable Restrisiko gilt?",
      "ai.chatbot.operationalQuestion": "Betriebsanforderungen (mehrfach wählbar)",
      "ai.chatbot.threatQuestion": "Welche Art fahrzeuggestützter Bedrohung ist zu erwarten?",
      "ai.chatbot.vehicleTypesQuestion": "Welche Fahrzeugtypen sind relevant?",
      "ai.chatbot.accessCorridorsQuestion": "Wo könnten Fahrzeuge eindringen? (Karte markieren oder beschreiben)",
      "ai.chatbot.speedQuestion": "Maximale Zufahrtsgeschwindigkeit (km/h)",
      "ai.chatbot.angleQuestion": "Wahrscheinlicher Anprallwinkel (°)",
      "ai.chatbot.groundQuestion": "Untergrund/Fundamente am Standort",
      "ai.chatbot.riskMatrixQuestion": "Risikobewertung: Eintrittswahrscheinlichkeit & Schadensausmaß",
      "ai.chatbot.completionMessage": "Danke! Alle erforderlichen Angaben sind vorhanden. Möchten Sie den normkonformen PDF-Plan erzeugen?",
      "ai.chatbot.infoPrefix": "Hinweis: ",
      "ai.chatbot.assetQuestionInfo": "Grundlage für Schutzziel & Schutzklasse (DIN SPEC 91414-2 / ISO 22343-2)",
      "ai.chatbot.restRiskQuestionInfo": "Steuert Schutzklasse/Sicherungsgrad (DIN SPEC 91414-2)",
      "ai.chatbot.speedQuestionInfo": "Pflichtparameter für FSB-Performance (ISO 22343-2/-1)",
      "ai.chatbot.angleQuestionInfo": "Pflichtparameter für FSB-Performance (ISO 22343-2/-1)",
      "ai.chatbot.riskMatrixQuestionInfo": "Erzeugt Sicherungsgrad & Schutzklasse (DIN SPEC 91414-2)",
      "ai.chatbot.assetOptions": "Menschenmenge,Gebäude,KRITIS-Prozess,Veranstaltungsfläche",
      "ai.chatbot.assetPlaceholder": "z. B. Menschenmenge, Bühne",
      "ai.chatbot.stakeholderOptions": "Behörden,Veranstalter,Betreiber",
      "ai.chatbot.restRiskOptions": "niedrig,mittel,hoch",
      "ai.chatbot.operationalOptions": "Feuerwehrzufahrt,Fluchtwege,Verkehrssicherheit,Betriebssicherheit",
      "ai.chatbot.threatOptions": "intentional,unbeabsichtigt,beides",
      "ai.chatbot.vehicleOptions": "PKW,Transporter,LKW,Bus",
      "ai.chatbot.groundOptions": "Asphalt,Beton,Pflaster,Erde,Unbekannt",
      "ai.chatbot.riskMatrixOptions": "EW:niedrig|SA:gering,EW:niedrig|SA:mittel,EW:mittel|SA:mittel,EW:hoch|SA:schwer",
      "ai.chatbot.accessCorridorsPlaceholder": "Polyline/Polygon auswählen oder kurz beschreiben"
    },
    en: {
      "ai.chatbot.title": "Access Protection Assistant",
      "ai.chatbot.welcome": "Welcome to the Access Protection Assistant. I only ask questions that are still missing or uncertain. Ready?",
      "ai.chatbot.assetQuestion": "Which protective assets would you like to secure? Note: Basis for Protection Goal & Protection Class (DIN SPEC 91414-2 / ISO 22343-2)",
      "ai.chatbot.inputPlaceholder": "Enter answer...",
      "ai.chatbot.sendButton": "Send",
      "ai.chatbot.stakeholderQuestion": "Who are the relevant stakeholders (authorities, organizers, operators)?",
      "ai.chatbot.restRiskQuestion": "What acceptable residual risk applies?",
      "ai.chatbot.operationalQuestion": "Operational requirements (multiple choice)",
      "ai.chatbot.threatQuestion": "What type of vehicle-based threat is expected?",
      "ai.chatbot.vehicleTypesQuestion": "Which vehicle types are relevant?",
      "ai.chatbot.accessCorridorsQuestion": "Where could vehicles penetrate? (Mark on map or describe)",
      "ai.chatbot.speedQuestion": "Maximum access speed (km/h)",
      "ai.chatbot.angleQuestion": "Probable impact angle (°)",
      "ai.chatbot.groundQuestion": "Ground/foundations at the site",
      "ai.chatbot.riskMatrixQuestion": "Risk assessment: probability of occurrence & extent of damage",
      "ai.chatbot.completionMessage": "Thank you! All required information is available. Would you like to generate the standards-compliant PDF plan?",
      "ai.chatbot.infoPrefix": "Note: ",
      "ai.chatbot.assetQuestionInfo": "Basis for Protection Goal & Protection Class (DIN SPEC 91414-2 / ISO 22343-2)",
      "ai.chatbot.restRiskQuestionInfo": "Controls Protection Class/Security Level (DIN SPEC 91414-2)",
      "ai.chatbot.speedQuestionInfo": "Required parameter for FSB performance (ISO 22343-2/-1)",
      "ai.chatbot.angleQuestionInfo": "Required parameter for FSB performance (ISO 22343-2/-1)",
      "ai.chatbot.riskMatrixQuestionInfo": "Generates Security Level & Protection Class (DIN SPEC 91414-2)",
      "ai.chatbot.assetOptions": "Crowd,Building,CRITIS Process,Event Area",
      "ai.chatbot.assetPlaceholder": "e.g. crowd, stage",
      "ai.chatbot.stakeholderOptions": "Authorities,Organizers,Operators",
      "ai.chatbot.restRiskOptions": "low,medium,high",
      "ai.chatbot.operationalOptions": "Fire Brigade Access,Escape Routes,Traffic Safety,Operational Safety",
      "ai.chatbot.threatOptions": "intentional,unintentional,both",
      "ai.chatbot.vehicleOptions": "Car,Van,Truck,Bus",
      "ai.chatbot.groundOptions": "Asphalt,Concrete,Pavement,Earth,Unknown",
      "ai.chatbot.riskMatrixOptions": "PO:low|SD:medium,PO:medium|SD:medium,PO:high|SD:severe",
      "ai.chatbot.accessCorridorsPlaceholder": "Select polyline/polygon or describe briefly"
    }
  };
  
  // Aktuelle Sprache aus dem globalen Übersetzungssystem holen
  let currentLang: 'de' | 'en' = 'de';
  
  // Versuche, die aktuelle Sprache aus dem globalen System zu holen
  if (typeof window !== 'undefined') {
    // Prüfe verschiedene mögliche Quellen für die aktuelle Sprache
    if ((window as any).currentLanguage) {
      currentLang = (window as any).currentLanguage;
      console.log('Chatbot: Language from window.currentLanguage:', currentLang);
    } else if ((window as any).translations && (window as any).translations.currentLanguage) {
      currentLang = (window as any).translations.currentLanguage;
      console.log('Chatbot: Language from window.translations.currentLanguage:', currentLang);
    } else {
      // Fallback: Prüfe, welche Flagge aktiv ist
      const germanFlag = document.querySelector('.lang-btn[data-lang="de"].active');
      const englishFlag = document.querySelector('.lang-btn[data-lang="en"].active');
      
      console.log('Chatbot: DOM flag detection - German flag:', germanFlag, 'English flag:', englishFlag);
      
      if (englishFlag) {
        currentLang = 'en';
        console.log('Chatbot: Language from DOM flag detection (EN):', currentLang);
      } else if (germanFlag) {
        currentLang = 'de';
        console.log('Chatbot: Language from DOM flag detection (DE):', currentLang);
      } else {
        console.log('Chatbot: Language detection failed, using default (DE)');
        // Zusätzliche Debug-Info: Alle lang-btn Elemente auflisten
        const allLangBtns = document.querySelectorAll('.lang-btn');
        console.log('Chatbot: All lang-btn elements found:', allLangBtns);
        allLangBtns.forEach((btn, index) => {
          console.log(`Chatbot: lang-btn ${index}:`, {
            classList: btn.classList.toString(),
            dataLang: (btn as HTMLElement).dataset.lang,
            isActive: btn.classList.contains('active')
          });
        });
      }
    }
  }
  
  // Debug: Log der aktuellen Sprache
  console.log(`Chatbot translation for key "${key}": language="${currentLang}", result="${embeddedTranslations[currentLang]?.[key] || key}"`);
  
  // Übersetzung aus eingebetteten Übersetzungen holen
  if (embeddedTranslations[currentLang] && embeddedTranslations[currentLang][key]) {
    return embeddedTranslations[currentLang][key];
  }
  
  // Fallback: Schlüssel zurückgeben
  return key;
}

// --------------------------- Fragen-Definition ---------------------------
function getQuestions(): Question[] {
  return [
    {
      id: "schutzgueter",
      label: t("ai.chatbot.assetQuestion"),
      field: "schutzgüter",
      type: "chips",
      options: t("ai.chatbot.assetOptions").split(","),
      placeholder: t("ai.chatbot.assetPlaceholder"),
      info: t("ai.chatbot.assetQuestionInfo"),
    },
    {
      id: "stakeholder",
      label: t("ai.chatbot.stakeholderQuestion"),
      field: "stakeholder",
      type: "chips",
      options: t("ai.chatbot.stakeholderOptions").split(","),
    },
    {
      id: "restrisiko",
      label: t("ai.chatbot.restRiskQuestion"),
      field: "restrisiko.klasse",
      type: "select",
      options: t("ai.chatbot.restRiskOptions").split(","),
      info: t("ai.chatbot.restRiskQuestionInfo"),
    },
    {
      id: "betrieb",
      label: t("ai.chatbot.operationalQuestion"),
      field: "betrieb",
      type: "multiselect",
      options: t("ai.chatbot.operationalOptions").split(","),
    },
    {
      id: "bedrohung",
      label: t("ai.chatbot.threatQuestion"),
      field: "risiko.bedrohung.art",
      type: "select",
      options: t("ai.chatbot.threatOptions").split(","),
    },
    {
      id: "fahrzeugtypen",
      label: t("ai.chatbot.vehicleTypesQuestion"),
      field: "risiko.bedrohung.fahrzeugtypen",
      type: "chips",
      options: t("ai.chatbot.vehicleOptions").split(","),
    },
    {
      id: "anfahrkorridore",
      label: t("ai.chatbot.accessCorridorsQuestion"),
      field: "risiko.site.anfahrkorridore",
      type: "geo",
      placeholder: t("ai.chatbot.accessCorridorsPlaceholder"),
    },
    {
      id: "geschwindigkeit",
      label: t("ai.chatbot.speedQuestion"),
      field: "risiko.dynamik.v_kmh",
      type: "number",
      info: t("ai.chatbot.speedQuestionInfo"),
      resolver: (cand) => defaultResolve("risiko.dynamik.v_kmh", cand, 0.7),
    },
    {
      id: "winkel",
      label: t("ai.chatbot.angleQuestion"),
      field: "risiko.dynamik.winkel_grad",
      type: "number",
      info: t("ai.chatbot.angleQuestionInfo"),
      resolver: (cand) => defaultResolve("risiko.dynamik.winkel_grad", cand, 0.7),
    },
    {
      id: "untergrund",
      label: t("ai.chatbot.groundQuestion"),
      field: "risiko.site.untergrund",
      type: "select",
      options: t("ai.chatbot.groundOptions").split(","),
    },
    {
      id: "risikomatrix",
      label: t("ai.chatbot.riskMatrixQuestion"),
      field: "risiko.matrix",
      type: "select",
      options: t("ai.chatbot.riskMatrixOptions").split(","),
      info: t("ai.chatbot.riskMatrixQuestionInfo"),
    },
  ];
}

// --------------------------- UI-Komponenten ---------------------------
function ChatbotButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      aria-label={t("ai.chatbot.title")}
      onClick={onToggle}
      className="zb-btn"
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
        placeholder={t("ai.chatbot.inputPlaceholder")}
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
        {t("ai.chatbot.sendButton")}
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

  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<{ role: "bot" | "user"; text: string; field?: string }[]>([]);
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [completed, setCompleted] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Erstnachricht
  useEffect(() => {
    if (messages.length === 0) {
      pushBot(t("ai.chatbot.welcome"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automatisches Scrollen nach neuen Nachrichten
  useEffect(() => {
    if (messages.length > 0) {
      // Sofort scrollen
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      
      // Zusätzlich nach einem kurzen Delay für bessere Kompatibilität
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [messages.length]);

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
    for (const q of getQuestions()) {
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

  // Fragenfluss steuern
  useEffect(() => {
    if (completed) return;
    if (currentQ) return;
    const next = findNextQuestion();
    if (next) {
      setCurrentQ(next);
      // Übersetze die Frage und den Hinweis
      const translatedLabel = next.label;
      const translatedInfo = next.info ? t("ai.chatbot.infoPrefix") + next.info : "";
      pushBot(translatedLabel + (translatedInfo ? `\n\n${translatedInfo}` : ""));
    } else if (!completed && messages.length > 0) {
      pushBot(t("ai.chatbot.completionMessage"));
      setCompleted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningState, open, currentQ, completed]);

    // Chatbot neu rendern bei Sprachänderung
  useEffect(() => {
    const handleLanguageChange = () => {
      console.log('Language changed, re-rendering chatbot');
      // Alle Nachrichten neu generieren mit der neuen Sprache
      setMessages([]);
      setCurrentQ(null);
      setCompleted(false);
      
      // Willkommensnachricht in der neuen Sprache
      setTimeout(() => {
        pushBot(t("ai.chatbot.welcome"));
      }, 100);
    };
  
    // Event Listener für Sprachänderungen
    window.addEventListener('languageChanged', handleLanguageChange);
    
    // Zusätzlich: Prüfe alle 100ms, ob sich die Sprache geändert hat
    const intervalId = setInterval(() => {
      const currentLang = (window as any).currentLanguage;
      if (currentLang && currentLang !== (window as any).lastChatbotLanguage) {
        (window as any).lastChatbotLanguage = currentLang;
        console.log('Chatbot: Language change detected via polling:', currentLang);
        handleLanguageChange();
      }
      
      // Zusätzlich: Prüfe DOM-Flags
      const germanFlag = document.querySelector('.lang-btn[data-lang="de"].active');
      const englishFlag = document.querySelector('.lang-btn[data-lang="en"].active');
      
      let detectedLang: 'de' | 'en' | null = null;
      if (englishFlag) detectedLang = 'en';
      else if (germanFlag) detectedLang = 'de';
      
      if (detectedLang && detectedLang !== (window as any).lastChatbotDetectedLanguage) {
        (window as any).lastChatbotDetectedLanguage = detectedLang;
        console.log('Chatbot: Language change detected via DOM flags:', detectedLang);
        handleLanguageChange();
      }
    }, 100);
    
    return () => {
      window.removeEventListener('languageChanged', handleLanguageChange);
      clearInterval(intervalId);
    };
  }, []);

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
            className="zb-panel"
            aria-label="Zufahrtsschutz-Assistent Panel"
          >
            <header className="zb-header">
              <div className="zb-title">{t("ai.chatbot.title")}</div>
            </header>

            <div className="zb-messages" ref={messagesContainerRef}>
              {messages.map((m, idx) => <ChatMessage key={idx} role={m.role} text={m.text} />)}
            </div>

            <ChatInput onSend={handleAnswer} />
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
