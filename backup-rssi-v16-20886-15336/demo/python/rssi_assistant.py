#!/usr/bin/env python3
"""Assistant RSSI TELNET V16.

Le script reçoit à chaque question les événements et incidents actuels de MySQL.
Il utilise un modèle conversationnel Ollama installé localement par INSTALLER.cmd,
puis un moteur de secours basé sur des règles si le modèle local est indisponible.
Aucune clé API n'est nécessaire et les données restent sur la machine.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

MODEL = os.environ.get("TELNET_AI_MODEL", "qwen2.5:3b")
OLLAMA_URL = os.environ.get("TELNET_OLLAMA_URL", "http://127.0.0.1:11434")
TIMEOUT = int(os.environ.get("TELNET_AI_TIMEOUT_SECONDS", "120"))

SITE_GUIDE = """
TELNET est une plateforme de gestion des événements de sécurité. Le détecteur
crée une déclaration, la complète et l'envoie au RSSI. Le RSSI consulte les
notifications, qualifie l'événement avec les trois impacts Confidentialité,
Intégrité et Disponibilité, puis gère le plan d'incident, les risques et le suivi.
Les trois impacts doivent être Mineur, Majeur ou Critique. Au moins un impact
Critique classe automatiquement l'événement comme INCIDENT. Sinon il est classé
NON_INCIDENT. Le Journal d'audit conserve les actions. Settings gère le profil
et le thème. L'Assistant RSSI peut expliquer une situation, retrouver des cas
similaires, proposer des risques et des actions, et préparer une fiche d'incident.
""".strip()

SYNONYMS = {
    "authentication": "authentification", "login": "authentification", "signin": "authentification",
    "connexion": "reseau", "connection": "reseau", "timeout": "panne", "exception": "erreur", "access": "acces", "credential": "identifiant",
    "network": "reseau", "connectivity": "reseau", "vpn": "reseau", "lan": "reseau",
    "outage": "panne", "downtime": "panne", "down": "panne", "indisponibilite": "panne",
    "failure": "echec", "failed": "echec", "error": "erreur", "issue": "probleme",
    "server": "serveur", "database": "base", "db": "base", "application": "application",
    "risk": "risque", "risks": "risque", "threat": "menace", "impact": "impact",
    "event": "evenement", "events": "evenement", "declaration": "evenement",
    "incident": "incident", "critical": "critique", "major": "majeur", "minor": "mineur",
    "availability": "disponibilite", "integrity": "integrite", "confidentiality": "confidentialite",
    "action": "action", "actions": "action", "solution": "action", "resolve": "resoudre",
    "fix": "resoudre", "explain": "expliquer", "similar": "similaire", "history": "historique",
    "website": "site", "platform": "site", "telnett": "telnet",
    "fire": "incendie", "smoke": "fumee", "alarm": "alarme", "blaze": "incendie",
    "hiii": "hi", "hii": "hi", "helloo": "hello", "helloooo": "hello", "cvvvv": "cv",
}

STOP_WORDS = {
    "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "a", "au", "aux",
    "dans", "sur", "pour", "avec", "ce", "cet", "cette", "est", "sont", "je", "tu", "il",
    "elle", "nous", "vous", "me", "moi", "mon", "ma", "mes", "the", "an", "and", "or",
    "of", "to", "in", "on", "for", "is", "are", "what", "how", "please", "svp",
}


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or "").lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return " ".join(SYNONYMS.get(part, part) for part in text.split())


def tokens(value: Any) -> set[str]:
    return {part for part in normalize(value).split() if len(part) > 1 and part not in STOP_WORDS}


def fuzzy_has(text: str, choices: set[str], threshold: float = 0.72) -> bool:
    words = normalize(text).split()
    for word in words:
        if word in choices:
            return True
        if len(word) >= 4 and any(SequenceMatcher(None, word, choice).ratio() >= threshold for choice in choices):
            return True
    return False


def similarity(left: Any, right: Any) -> float:
    lt, rt = tokens(left), tokens(right)
    union = lt | rt
    jaccard = len(lt & rt) / len(union) if union else 0.0
    sequence = SequenceMatcher(None, normalize(left), normalize(right)).ratio()
    return 0.76 * jaccard + 0.24 * sequence


def event_text(event: dict[str, Any] | None) -> str:
    if not event:
        return ""
    return " ".join(str(event.get(key) or "") for key in (
        "id", "reference", "title", "description", "source", "declaredBy", "ticket", "nature",
        "service", "equipment", "errorCode", "possibleCauses", "state", "qualification",
        "confidentiality", "integrity", "availability",
    ))


def compact_event(event: dict[str, Any] | None) -> dict[str, Any] | None:
    if not event:
        return None
    return {key: event.get(key) for key in (
        "id", "reference", "title", "description", "date", "source", "declaredBy", "ticket", "nature",
        "service", "equipment", "errorCode", "possibleCauses", "state", "qualification",
        "confidentiality", "integrity", "availability",
    )}


def compact_incident(incident: dict[str, Any] | None) -> dict[str, Any] | None:
    if not incident:
        return None
    return {key: incident.get(key) for key in (
        "id", "eventId", "types", "impactLevel", "downtime", "mitigationAction", "mitigationState",
        "treatmentAction", "treatmentState", "treatmentDuration", "recommendation", "correctiveAction",
        "effectiveness", "effectivenessComment", "similarEvents", "similarEventsDescription",
        "followUpComments", "risks",
    )}


def related_incident(incidents: list[dict[str, Any]], event_id: Any) -> dict[str, Any] | None:
    return next((item for item in incidents if str(item.get("eventId")) == str(event_id)), None)


def cid_classification(event: dict[str, Any] | None) -> tuple[str, bool, bool]:
    if not event:
        return "NON_RENSEIGNE", False, False
    values = [normalize(event.get("confidentiality")), normalize(event.get("integrity")), normalize(event.get("availability"))]
    complete = all(value in {"mineur", "majeur", "critique"} for value in values)
    critical = "critique" in values
    if not complete:
        return "INCOMPLET", critical, False
    return ("INCIDENT" if critical else "NON_INCIDENT"), critical, True


def user_history_text(history: list[dict[str, Any]], limit: int = 6) -> str:
    """Return only recent user messages so assistant replies never contaminate the topic."""
    messages = [
        str(item.get("text") or "").strip()
        for item in history
        if isinstance(item, dict) and str(item.get("role") or "user").lower() == "user"
        and str(item.get("text") or "").strip()
    ]
    return " ".join(messages[-limit:])


def conversation_text(question: str, history: list[dict[str, Any]]) -> str:
    recent = user_history_text(history)
    return f"{recent} {question}".strip()


def last_substantive_user_message(history: list[dict[str, Any]]) -> str:
    """Find the latest user message that carries a technical topic, not small talk."""
    for item in reversed(history):
        if not isinstance(item, dict) or str(item.get("role") or "user").lower() != "user":
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        intent = infer_intent(text)
        # Skip short follow-up commands that do not carry their own technical subject.
        if intent in {"fill", "actions", "risks", "similar", "classification", "explain", "causes"} and scenario_kind(text) == "generic":
            continue
        if intent not in {"greeting", "smalltalk"} and len(tokens(text)) > 0:
            return text
    return ""


def select_event(events: list[dict[str, Any]], selected_id: Any, question: str,
                 history: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, float]:
    if selected_id is not None:
        selected = next((event for event in events if str(event.get("id")) == str(selected_id)), None)
        if selected:
            return selected, 1.0

    query = normalize(question)
    if any(expression in query for expression in ("dernier evenement", "evenement recent", "nouvel evenement", "derniere declaration")):
        latest = max(events, key=lambda item: int(item.get("id") or 0), default=None)
        if latest:
            return latest, 0.92
    explicit = re.search(r"(?:ev\s*)?(\d{1,9})", query)
    if explicit and any(word in query for word in ("ev", "evenement", "reference", "numero")):
        selected = next((event for event in events if str(event.get("id")) == explicit.group(1)), None)
        if selected:
            return selected, 1.0

    for event in events:
        for key in ("reference", "ticket", "errorCode"):
            value = normalize(event.get(key))
            if value and value in query:
                return event, 0.98

    query_scenario = scenario_kind(query)
    query_tokens = tokens(query) - {"evenement", "incident", "probleme", "erreur", "normal"}
    ranked: list[tuple[float, dict[str, Any]]] = []
    for event in events:
        text = event_text(event)
        score = similarity(query, text)
        event_scenario = scenario_kind(text)
        overlap = query_tokens & tokens(text)
        if query_scenario != "generic" and (event_scenario == query_scenario
                or (query_scenario == "technical" and event_scenario in {"outage", "authentication", "data", "malware"})):
            score += 0.24
        elif query_scenario not in {"generic", "technical"} and event_scenario not in {query_scenario, "generic", "technical"}:
            score -= 0.18
        if overlap:
            score += min(0.18, 0.06 * len(overlap))
        ranked.append((score, event))
    ranked.sort(key=lambda item: (item[0], int(item[1].get("id") or 0)), reverse=True)
    if ranked:
        best_score, best_event = ranked[0]
        best_overlap = query_tokens & tokens(event_text(best_event))
        best_scenario = scenario_kind(event_text(best_event))
        same_scenario = query_scenario != "generic" and (best_scenario == query_scenario
                        or (query_scenario == "technical" and best_scenario in {"outage", "authentication", "data", "malware"}))
        if best_score >= 0.34 and (best_overlap or same_scenario):
            return best_event, min(best_score, 1.0)
    return None, ranked[0][0] if ranked else 0.0


def find_similar(events: list[dict[str, Any]], event: dict[str, Any], limit: int = 5) -> list[dict[str, Any]]:
    ranked: list[tuple[float, dict[str, Any]]] = []
    for candidate in events:
        if str(candidate.get("id")) == str(event.get("id")):
            continue
        score = similarity(event_text(event), event_text(candidate))
        if event.get("errorCode") and normalize(event.get("errorCode")) == normalize(candidate.get("errorCode")):
            score += 0.18
        if event.get("service") and normalize(event.get("service")) == normalize(candidate.get("service")):
            score += 0.08
        if event.get("title") and normalize(event.get("title")) == normalize(candidate.get("title")):
            score += 0.12
        if score >= 0.18:
            ranked.append((min(score, 1.0), candidate))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [{
        "eventId": item.get("id"), "title": item.get("title") or "Sans titre", "date": item.get("date"),
        "score": round(score * 100), "qualification": item.get("qualification") or "NON_QUALIFIE",
        "reason": "contexte, service, titre ou code erreur en commun",
    } for score, item in ranked[:limit]]


def scenario_kind(text: str) -> str:
    q = normalize(text)
    words = set(q.split())
    if {"incendie", "feu", "fumee", "alarme"} & words or "alarme incendie" in q:
        return "fire"
    if ({"panne", "indisponibilite", "coupure", "plantage", "timeout"} & words
            and {"serveur", "reseau", "base", "service", "application", "systeme"} & words):
        return "outage"
    if any(expr in q for expr in ("panne serveur", "serveur panne", "serveur indisponible",
                                   "service indisponible", "reseau panne", "connexion timeout")):
        return "outage"
    if "authentification" in words or "mot passe" in q or "compte bloque" in q or "acces suspect" in q:
        return "authentication"
    if {"malware", "virus", "ransomware", "phishing"} & words:
        return "malware"
    if {"fuite", "exfiltration", "confidentialite"} & words or "donnee exposee" in q:
        return "data"
    if {"serveur", "base", "application", "reseau", "systeme"} & words:
        return "technical"
    return "generic"


def baseline_actions(event: dict[str, Any] | None, scenario: str = "generic") -> list[str]:
    context = normalize(event_text(event)) if event else ""
    kind = scenario if scenario != "generic" else scenario_kind(context)
    if kind == "fire":
        return [
            "Déclencher la procédure d'urgence, prévenir les personnes présentes et contacter la sécurité du site.",
            "Vérifier l'alarme sans s'exposer, évacuer la zone concernée et appeler les secours si nécessaire.",
            "Couper ou isoler les équipements uniquement si cette action est prévue et sûre.",
            "Après mise en sécurité, évaluer les dommages, la disponibilité des services et conserver les traces de l'événement.",
        ]
    if kind == "outage":
        return [
            "Confirmer les services, utilisateurs et équipements réellement indisponibles.",
            "Consulter la supervision et les journaux, puis vérifier les changements récents.",
            "Isoler le composant défaillant et activer la redondance ou la procédure de secours.",
            "Rétablir progressivement le service et surveiller les erreurs résiduelles.",
        ]
    if kind == "authentication":
        return [
            "Identifier les comptes, adresses sources et plages horaires concernés.",
            "Bloquer les accès suspects et préserver les preuves dans les journaux.",
            "Réinitialiser les identifiants compromis et vérifier la configuration d'authentification.",
            "Surveiller les nouvelles tentatives et renforcer le MFA si nécessaire.",
        ]
    if kind == "malware":
        return [
            "Isoler immédiatement les postes ou serveurs suspects du réseau.",
            "Conserver les traces, identifier le vecteur d'entrée et mesurer la propagation.",
            "Éradiquer la menace, restaurer depuis une source saine et changer les secrets exposés.",
            "Renforcer les contrôles et surveiller toute récidive.",
        ]
    if kind == "data":
        return [
            "Limiter l'accès aux données et préserver les journaux d'accès.",
            "Identifier les données, les personnes et la période potentiellement concernées.",
            "Bloquer le canal de fuite et vérifier les obligations de notification.",
            "Corriger la cause et renforcer les contrôles d'accès.",
        ]
    if kind == "technical":
        return [
            "Identifier précisément le serveur, le service concerné et les utilisateurs impactés.",
            "Consulter la supervision, les journaux et les changements récents avant toute modification.",
            "Tester la disponibilité, les ressources, le réseau et les dépendances du service.",
            "Appliquer une mesure réversible, surveiller le résultat et documenter les constats.",
        ]
    return [
        "Confirmer le périmètre, les actifs touchés et les preuves disponibles.",
        "Renseigner les trois impacts CID et appliquer une mesure d'atténuation réversible.",
        "Traiter la cause, vérifier le retour à la normale et documenter les actions.",
    ]


def baseline_risks(event: dict[str, Any] | None, scenario: str) -> list[dict[str, str]]:
    kind = scenario if scenario != "generic" else scenario_kind(event_text(event))
    descriptions = {
        "fire": ["Danger pour les personnes et dommages matériels sur le site.", "Arrêt des équipements, perte de disponibilité et interruption de la continuité d'activité."],
        "outage": ["Interruption ou forte dégradation des services métiers.", "Perte de productivité et non-respect des engagements de disponibilité."],
        "authentication": ["Accès non autorisé à un compte ou un service.", "Blocage des utilisateurs légitimes et compromission d'identifiants."],
        "malware": ["Propagation de la menace et indisponibilité des systèmes.", "Chiffrement, altération ou exfiltration de données."],
        "data": ["Divulgation de données sensibles.", "Impact réglementaire, contractuel et réputationnel."],
        "technical": ["Dégradation ou indisponibilité du service hébergé.", "Altération de traitements ou perte de données si le serveur est instable."],
        "generic": ["Dégradation du service et impact sur les utilisateurs.", "Risque d'aggravation si la cause n'est pas contenue rapidement."],
    }[kind]
    return [{"reference": "", "description": item} for item in descriptions]


def wants_form_fill(question: str) -> bool:
    q = normalize(question)
    expressions = (
        "remplis le formulaire", "remplir le formulaire", "remplis la fiche", "remplir la fiche",
        "prepare la fiche", "preparer la fiche", "ouvre la fiche", "ouvrir la fiche",
        "complete le plan", "completer le plan", "remplis le plan", "remplir le plan",
        "genere la fiche", "generer la fiche", "cree la fiche", "creer la fiche",
    )
    return any(expression in q for expression in expressions) or (
        fuzzy_has(q, {"remplir", "completer", "preparer", "generer", "ouvrir"})
        and fuzzy_has(q, {"fiche", "formulaire", "plan", "incident"})
    )


def infer_intent(question: str) -> str:
    q = normalize(question)
    if re.fullmatch(r"(?:bonjour+|bonsoir+|salut+|coucou+|hello+|hi+|hey+)", q):
        return "greeting"
    if (re.fullmatch(r"c+v+", q)
            or any(expr in q for expr in ("comment ca va", "ca va", "vous allez bien",
                                          "tu vas bien", "comment vas tu", "comment allez vous",
                                          "tout va bien", "how are you"))):
        return "smalltalk"
    if wants_form_fill(question):
        return "fill"
    if ("telnet" in q and any(word in q for word in ("fonctionnement", "fonctionne", "site", "plateforme"))) or "que peux tu faire" in q:
        return "site"
    # Intent detection uses explicit roots instead of fuzzy matching short words.
    if any(root in q for root in ("action", "que faire", "quoi faire", "resoud", "solution", "demarche", "approche", "traiter", "corriger")):
        return "actions"
    if any(root in q for root in ("risque", "impact", "menace", "danger")):
        return "risks"
    if any(root in q for root in ("similaire", "historique", "precedent", "ressembl")):
        return "similar"
    if any(root in q for root in ("incident", "qualification", "qualifier", "critique", "classification", "evenement normal")):
        return "classification"
    if any(root in q for root in ("explique", "resume", "decris", "comprendre", "c est quoi")):
        return "explain"
    if any(root in q for root in ("cause", "origine", "pourquoi")):
        return "causes"
    if any(root in q for root in ("audit", "journal")):
        return "audit"
    if any(root in q for root in ("mot de passe", "profil", "email", "compte")):
        return "account"
    if any(root in q for root in ("combien", "nombre", "total", "statistique", "dashboard")):
        return "count"
    return "analysis"


def qualification_suggestion(event: dict[str, Any] | None, scenario: str) -> dict[str, Any]:
    current = event or {}
    current_values = [normalize(current.get("confidentiality")), normalize(current.get("integrity")), normalize(current.get("availability"))]
    if all(value in {"mineur", "majeur", "critique"} for value in current_values):
        values = [str(current.get("confidentiality")), str(current.get("integrity")), str(current.get("availability"))]
    elif scenario == "fire":
        values = ["Mineur", "Majeur", "Critique"]
    elif scenario == "outage":
        values = ["Mineur", "Majeur", "Critique"]
    elif scenario == "authentication":
        values = ["Critique", "Critique", "Majeur"]
    elif scenario == "technical":
        values = ["Mineur", "Majeur", "Critique"]
    elif scenario in {"malware", "data"}:
        values = ["Critique", "Critique", "Majeur"]
    else:
        values = ["Mineur", "Majeur", "Critique"]
    classification = "INCIDENT" if "Critique" in values else "NON_INCIDENT"
    comments = {
        "fire": [
            "Aucun indice direct de divulgation; niveau proposé à confirmer.",
            "Les équipements et les données en cours de traitement peuvent être endommagés.",
            "L'évacuation ou l'arrêt des équipements peut interrompre le service.",
        ],
        "outage": [
            "Aucun indice direct de divulgation; niveau proposé à confirmer.",
            "Des transactions interrompues ou incomplètes sont possibles.",
            "Le service peut être indisponible pour les utilisateurs.",
        ],
        "authentication": [
            "Un accès non autorisé ou une exposition de données est possible.",
            "Une modification non autorisée doit être écartée.",
            "Les comptes ou le service d'authentification peuvent être perturbés.",
        ],
        "malware": [
            "Une exfiltration de données est possible.",
            "Des fichiers ou configurations peuvent être altérés.",
            "La propagation peut rendre les systèmes indisponibles.",
        ],
        "data": [
            "Des données sensibles peuvent être exposées.",
            "L'intégrité des informations concernées doit être vérifiée.",
            "Le service peut être perturbé pendant le confinement.",
        ],
        "technical": [
            "Aucun indice direct de divulgation; niveau proposé à confirmer.",
            "Des traitements ou données en cours peuvent être affectés.",
            "Le service hébergé peut devenir indisponible; niveau proposé à confirmer.",
        ],
        "generic": [
            "Niveau suggéré à confirmer par le RSSI.",
            "Niveau suggéré à confirmer par le RSSI.",
            "Niveau suggéré à confirmer par le RSSI.",
        ],
    }.get(scenario, ["Niveau suggéré à confirmer par le RSSI."] * 3)
    return {
        "impactConfidentialite": values[0],
        "impactIntegrite": values[1],
        "impactDisponibilite": values[2],
        "commentaireConfidentialite": comments[0],
        "commentaireIntegrite": comments[1],
        "commentaireDisponibilite": comments[2],
        "qualification": classification,
    }


def build_draft(event: dict[str, Any] | None, incident: dict[str, Any] | None,
                actions: list[str], model_draft: dict[str, Any] | None = None,
                scenario: str = "generic") -> dict[str, Any]:
    if not event:
        return {}
    draft = dict(model_draft or {})
    current = incident or {}
    classification, critical, complete = cid_classification(event)
    if not complete:
        proposed = qualification_suggestion(event, scenario)
        critical = "Critique" in [
            proposed.get("impactConfidentialite"),
            proposed.get("impactIntegrite"),
            proposed.get("impactDisponibilite"),
        ]
        classification = "INCIDENT" if critical else "NON_INCIDENT"
    default_level = "NIVEAU_4" if critical else "NIVEAU_2"
    draft.setdefault("typesIncident", current.get("types") or (["Défaillance technique"] if scenario == "outage" else ["Autre"]))
    draft.setdefault("niveauImpact", current.get("impactLevel") or default_level)
    draft.setdefault("mesureAction", current.get("mitigationAction") or (actions[0] if actions else "Confirmer le périmètre et contenir l'impact."))
    draft.setdefault("mesureEtat", current.get("mitigationState") or "En cours")
    draft.setdefault("traitementAction", current.get("treatmentAction") or "\n".join(f"{i+1}. {a}" for i, a in enumerate(actions)))
    draft.setdefault("traitementEtat", current.get("treatmentState") or "En cours")
    draft.setdefault("preconisation", current.get("recommendation") or "Renforcer la surveillance et documenter les mesures préventives.")
    draft.setdefault("actionCorrective", current.get("correctiveAction") or "Corriger la cause racine après validation technique.")
    draft.setdefault("impactContinuite", bool(critical))
    draft.setdefault("impactContinuiteDescription", "Impact possible sur la continuité du service; confirmer le périmètre métier.")
    draft.setdefault("changementDeclenche", False)
    draft.setdefault("changementDeclencheDescription", "")
    draft.setdefault("risques", current.get("risks") or baseline_risks(event, scenario))
    draft.setdefault("mesureResponsable", "RSSI")
    draft.setdefault("mesureDelai", "Immédiat")
    draft.setdefault("traitementResponsable", "RSSI")
    draft.setdefault("correctiveResponsable", "RSSI")
    draft.setdefault("commentaireEfficacite", "À mesurer après stabilisation du service.")
    draft.setdefault("hasRisquesAssocies", True)
    draft.setdefault("capitalisation", True)
    draft.setdefault("evenementsSimilaires", "Oui" if incident and incident.get("similarEvents") == "Oui" else "Non")
    draft.setdefault("miseAJourPcaNecessaire", False)
    draft.setdefault("risquesAMettreAJour", False)
    draft.setdefault("suiviCommentaires", "Proposition générée par l’assistant et à confirmer par le RSSI.")
    draft["classificationCid"] = classification
    return draft


def run_model(prompt: str, json_format: bool = False) -> tuple[str, str]:
    try:
        return run_ollama(prompt, json_format), f"ollama:{MODEL}"
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Le modèle IA local {MODEL} n'est pas disponible: {exc}") from exc


def find_ollama_executable() -> str | None:
    candidates = [os.environ.get("OLLAMA_EXE"), shutil.which("ollama")]
    if os.environ.get("LOCALAPPDATA"):
        candidates.append(str(Path(os.environ["LOCALAPPDATA"]) / "Programs" / "Ollama" / "ollama.exe"))
    if os.environ.get("ProgramFiles"):
        candidates.append(str(Path(os.environ["ProgramFiles"]) / "Ollama" / "ollama.exe"))
    return next((candidate for candidate in candidates if candidate and (Path(candidate).is_file() or shutil.which(candidate))), None)


def ollama_http(prompt: str, json_format: bool = False) -> str:
    body: dict[str, Any] = {"model": MODEL, "prompt": prompt, "stream": False, "options": {"temperature": 0.32, "num_ctx": 8192}}
    if json_format:
        body["format"] = "json"
    request = urllib.request.Request(
        f"{OLLAMA_URL.rstrip('/')}/api/generate",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        payload = json.loads(response.read().decode("utf-8"))
    result = str(payload.get("response") or "").strip()
    if not result:
        raise RuntimeError("Le modèle local n'a produit aucune réponse.")
    return result


def run_ollama(prompt: str, json_format: bool = False) -> str:
    try:
        return ollama_http(prompt, json_format)
    except Exception as first_error:  # noqa: BLE001
        executable = find_ollama_executable()
        if not executable:
            raise RuntimeError(f"Ollama introuvable: {first_error}") from first_error
        subprocess.Popen([executable, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        for _ in range(16):
            time.sleep(0.5)
            try:
                return ollama_http(prompt, json_format)
            except Exception:  # noqa: BLE001
                pass
        raise RuntimeError(f"Ollama ne répond pas ou le modèle {MODEL} n'est pas installé.")


def parse_json_object(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end < start:
        raise ValueError("Réponse JSON absente")
    return json.loads(cleaned[start:end + 1])


def fallback_description(seed: str, event: dict[str, Any]) -> str:
    base = seed.strip().rstrip(".!?")
    kind = scenario_kind(f"{event.get('title', '')} {base}")
    if kind == "outage":
        return f"{base}. Une indisponibilité ou une dégradation affecte le service concerné et peut empêcher les utilisateurs d'accéder aux applications. La supervision, les équipements et les changements récents doivent être contrôlés afin d'identifier la cause et de rétablir le service de manière sécurisée."
    if kind == "authentication":
        return f"{base}. Des anomalies d'authentification ont été constatées et peuvent correspondre à un compte bloqué, une erreur de configuration ou une tentative d'accès non autorisée. Les journaux, les comptes concernés et les adresses sources doivent être analysés pour confirmer l'origine et le périmètre."
    return f"{base}. L'événement nécessite une analyse technique pour déterminer son origine, les actifs concernés et les impacts sur le service. Les journaux disponibles, les changements récents et les premières mesures prises doivent être documentés avant la qualification RSSI."


def generate_text(payload: dict[str, Any]) -> dict[str, Any]:
    seed = str(payload.get("seed") or "").strip()
    if not seed:
        raise ValueError("Quelques mots sont nécessaires pour lancer la génération.")
    purpose = str(payload.get("purpose") or "description professionnelle")
    field = str(payload.get("field") or "description")
    event = payload.get("event") if isinstance(payload.get("event"), dict) else {}
    incident = payload.get("incident") if isinstance(payload.get("incident"), dict) else {}
    prompt = f"""
Tu es un assistant RSSI francophone. Rédige uniquement le contenu du champ « {field} ».
Objectif: {purpose}. Transforme les quelques mots fournis en 2 ou 3 phrases naturelles,
professionnelles et cohérentes. N'invente aucun identifiant, date, preuve ou résultat
technique absent. Aucun titre, aucune liste et aucun Markdown.
Mots fournis: {seed}
Événement: {json.dumps(event, ensure_ascii=False)[:4000]}
Incident: {json.dumps(incident, ensure_ascii=False)[:4000]}
""".strip()
    try:
        generated, engine = run_model(prompt)
        text = generated.strip().strip('"')
        return {"text": text, "engine": engine, "modelAvailable": True}
    except Exception as exc:  # noqa: BLE001
        return {"text": fallback_description(seed, event), "engine": "fallback-local", "modelAvailable": False, "diagnostic": str(exc)[:500]}


def fallback_answer(question: str, event: dict[str, Any] | None, incident: dict[str, Any] | None,
                    events: list[dict[str, Any]], incidents: list[dict[str, Any]], history: list[dict[str, Any]],
                    score: float, diagnostic: str) -> dict[str, Any]:
    intent = infer_intent(question)
    # Une nouvelle description doit être analysée pour elle-même; l'historique sert seulement aux suivis courts.
    scenario = scenario_kind(question)
    # Only genuine follow-up questions inherit the latest user topic. Assistant replies are ignored.
    if scenario == "generic" and intent in {"fill", "actions", "risks", "similar", "classification", "explain", "causes"}:
        scenario = scenario_kind(last_substantive_user_message(history))
    classification, critical, complete = cid_classification(event)
    actions: list[str] = []
    matches: list[dict[str, Any]] = []
    ask = False
    normalized = normalize(question)
    compact = re.sub(r"(.)\1{3,}", r"\1\1", normalized)

    if intent == "greeting":
        answer = "Bonjour ! Je vais bien, merci. Décrivez-moi simplement la situation, même en deux ou trois mots, ou posez votre question sur TELNET."
    elif intent == "smalltalk":
        answer = "Ça va bien, merci ! Et vous ? Je peux aussi analyser une panne, un incendie, une anomalie d’accès ou vous guider dans TELNET."
    elif len(tokens(compact)) == 0 or (len(compact) > 2 and len(set(compact.replace(" ", ""))) <= 2):
        answer = "Je n’ai pas compris ce message. Écrivez une courte situation en français, par exemple « panne serveur », « alarme incendie » ou « échec d’authentification »."
    elif intent == "site":
        answer = "TELNET suit le cycle complet de sécurité : le détecteur déclare un événement et l’envoie au RSSI; le RSSI renseigne les trois impacts Confidentialité, Intégrité et Disponibilité. Si au moins un impact est Critique, l’événement devient un incident et une fiche de traitement est ouverte. Le plan centralise ensuite les mesures, le traitement, les risques, les actions correctives et le suivi."
    elif intent == "count":
        open_count = sum(1 for item in incidents if normalize(item.get("treatmentState")) not in {"clos", "cloture", "termine"})
        answer = f"La base contient actuellement {len(events)} événement(s) et {len(incidents)} incident(s), dont {open_count} non clôturé(s)."
    elif intent == "audit":
        answer = "Le Journal d’audit conserve les actions réalisées dans TELNET. La recherche accepte un utilisateur, une action ou une date et la dictée vocale est configurée en français."
    elif intent == "account":
        answer = "Le profil permet de modifier le nom, l’email et le mot de passe. Pour le RSSI, le thème sombre ou clair se choisit dans Settings."
    elif event:
        title = event.get("title") or event.get("reference") or f"Événement #{event.get('id')}"
        impacts = f"confidentialité {event.get('confidentiality') or 'non renseignée'}, intégrité {event.get('integrity') or 'non renseignée'}, disponibilité {event.get('availability') or 'non renseignée'}"
        if intent == "fill":
            actions = baseline_actions(event, scenario)
            answer = f"Je peux préparer la qualification CID et préremplir la fiche d’incident de « {title} ». Je vais d’abord proposer les trois impacts, puis remplir les mesures, le traitement, les risques, les actions correctives et le suivi. Rien ne sera enregistré sans votre confirmation."
        elif intent == "actions":
            actions = baseline_actions(event, scenario)
            answer = f"Pour « {title} », je recommande : " + " ".join(f"{i+1}) {a}" for i, a in enumerate(actions))
        elif intent == "causes":
            recorded = str(event.get("possibleCauses") or "").strip()
            if recorded:
                answer = f"Les causes déjà enregistrées pour « {title} » sont : {recorded}. Elles doivent être confirmées par les journaux, la supervision et les changements récents."
            else:
                answer = f"Pour « {title} », vérifiez d’abord les changements récents, les journaux, la capacité des ressources, la connectivité et l’état du composant concerné. Ces éléments permettront de distinguer une panne technique, une mauvaise configuration ou une action malveillante."
        elif intent == "risks":
            recorded = (incident or {}).get("risks") or []
            generated = recorded or baseline_risks(event, scenario)
            text = "; ".join(f"{item.get('reference') or 'sans ID'} — {item.get('description') or 'sans description'}" for item in generated)
            answer = f"Pour « {title} », les impacts actuels sont {impacts}. Risques à examiner : {text}."
        elif intent == "similar":
            matches = find_similar(events, event)
            answer = f"J’ai trouvé {len(matches)} événement(s) comparable(s) à « {title} » dans l’historique TELNET."
        elif intent == "classification":
            if complete:
                answer = f"Les impacts de « {title} » sont {impacts}. La règle TELNET donne {classification}. Un seul impact Critique suffit pour le qualifier comme incident."
            else:
                suggested = qualification_suggestion(event, scenario)
                answer = f"La qualification de « {title} » est incomplète. Proposition à confirmer : confidentialité {suggested['impactConfidentialite']}, intégrité {suggested['impactIntegrite']}, disponibilité {suggested['impactDisponibilite']}."
        else:
            description = event.get("description") or "Aucune description détaillée n’est encore enregistrée."
            answer = f"« {title} » correspond à : {description} État : {event.get('state') or 'non renseigné'}. Impacts : {impacts}. Classification calculée : {classification}."
        suggested = qualification_suggestion(event, scenario)
        ask = bool("Critique" in [suggested.get("impactConfidentialite"), suggested.get("impactIntegrite"), suggested.get("impactDisponibilite")]
                   and intent in {"fill", "actions", "analysis", "classification", "risks", "explain", "causes"})
        if ask and not actions:
            actions = baseline_actions(event, scenario)
    else:
        actions = baseline_actions(None, scenario)
        risks = baseline_risks(None, scenario)
        if scenario == "fire":
            if intent == "actions":
                answer = "Pour une alarme ou un départ d’incendie : 1) mettez immédiatement les personnes en sécurité et appliquez la procédure d’évacuation; 2) prévenez la sécurité du site et les secours selon les consignes internes; 3) n’intervenez sur les équipements que si cela est prévu et sans danger; 4) après la mise en sécurité, documentez la zone, les dommages et l’indisponibilité dans TELNET."
            elif intent == "classification":
                answer = "Une alarme incendie est d’abord un événement à déclarer. Elle devient un incident TELNET dès qu’au moins un impact CID est Critique — par exemple une disponibilité Critique si la zone ou les équipements doivent être arrêtés. Les trois impacts doivent être évalués avant confirmation."
            else:
                answer = "Une alarme ou un départ d’incendie est d’abord une urgence humaine et physique. Mettez les personnes en sécurité, appliquez la procédure d’évacuation, prévenez la sécurité du site et les secours selon les consignes internes. Ensuite, documentez la zone et les équipements touchés dans TELNET. Les risques principaux sont les blessures, les dommages matériels, l’arrêt des équipements et l’interruption de service."
        elif scenario == "outage":
            if intent == "actions":
                answer = "Pour une panne serveur : 1) confirmez les services et utilisateurs impactés; 2) consultez la supervision, les journaux et les changements récents; 3) vérifiez les ressources, le matériel, le réseau et les dépendances; 4) activez la redondance ou la procédure de secours; 5) restaurez progressivement le service et surveillez les erreurs résiduelles."
            elif intent == "classification":
                answer = "Une panne serveur est un événement de sécurité ou d’exploitation à déclarer. Si la disponibilité est Critique — ou si un autre axe CID est Critique — TELNET la classe comme incident. Une interruption limitée peut rester un événement non incident après évaluation des trois impacts."
            elif intent == "fill":
                answer = "Je peux préparer la qualification et la fiche d’incident d’une panne serveur. Je vais proposer une disponibilité Critique, vérifier l’intégrité des traitements interrompus, puis préremplir les mesures, le traitement, les risques et le suivi. Pour appliquer ce remplissage à la base, je dois rattacher la proposition à la déclaration serveur la plus proche dans l’historique."
            else:
                answer = "Une panne serveur signifie que le service est indisponible ou fortement dégradé. Les causes fréquentes sont une saturation des ressources, une panne matérielle, une erreur de configuration, un problème réseau, une mise à jour défectueuse ou une dépendance externe indisponible. Vérifiez la supervision et les journaux, identifiez les utilisateurs touchés, contrôlez les changements récents, activez la redondance si elle existe, puis restaurez progressivement le service. Le risque principal concerne la disponibilité; l’intégrité doit aussi être vérifiée si des traitements ont été interrompus."
        elif scenario == "technical":
            if intent == "classification":
                answer = "Un problème sur un serveur est d’abord un événement à analyser. Il devient un incident si l’un des trois impacts CID est Critique. Vérifiez surtout la disponibilité du service, puis l’intégrité des traitements et la confidentialité des données avant de confirmer."
            elif intent == "actions":
                answer = "Pour analyser ce problème serveur : 1) identifiez le service et les utilisateurs touchés; 2) consultez la supervision et les journaux; 3) vérifiez les changements récents, les ressources, le réseau et les dépendances; 4) appliquez une mesure réversible; 5) surveillez le résultat et documentez les impacts CID."
            else:
                answer = "Un événement sur un serveur peut correspondre à une panne, une saturation, une erreur de configuration, un problème réseau ou une anomalie de sécurité. Commencez par identifier le symptôme et le service touché, puis consultez la supervision et les journaux. Il sera classé comme incident seulement si au moins un impact Confidentialité, Intégrité ou Disponibilité est Critique."
        elif scenario == "authentication":
            answer = "Une anomalie d’authentification peut venir d’un compte bloqué, d’un mot de passe expiré, d’une mauvaise configuration, d’un service d’identité indisponible ou de tentatives d’accès suspectes. Analysez les comptes, les adresses sources et les journaux, bloquez les accès suspects et vérifiez le MFA."
        elif scenario == "malware":
            answer = "Isolez immédiatement le poste ou le serveur suspect, conservez les traces, mesurez la propagation et identifiez le vecteur d’entrée. Éradiquez la menace, restaurez depuis une source saine et changez les secrets potentiellement exposés."
        elif scenario == "data":
            answer = "Limitez immédiatement l’accès aux données, préservez les journaux et identifiez les informations et personnes concernées. Bloquez le canal de fuite, vérifiez les obligations de notification, corrigez la cause et renforcez les contrôles d’accès."
        else:
            if intent == "fill":
                answer = "Je peux préremplir une fiche uniquement lorsqu’une déclaration enregistrée peut être identifiée. Décrivez le dernier événement ou dites « dernier événement », puis je proposerai la qualification et le remplissage sans vous demander son ID."
            elif intent == "actions":
                answer = "Pour agir sans inventer de détails : 1) confirmez ce qui s’est passé et le périmètre touché; 2) conservez les preuves et appliquez un confinement réversible; 3) vérifiez les changements récents et la supervision; 4) rétablissez le service de façon contrôlée; 5) documentez les impacts CID et les actions."
            elif intent == "risks":
                answer = "Les risques dépendent de la situation, mais vérifiez systématiquement la confidentialité des données, l’intégrité des traitements, la disponibilité du service, l’impact sur les utilisateurs et la continuité d’activité."
            elif intent == "causes":
                answer = "Les premières causes à vérifier sont les changements récents, les erreurs de configuration, la saturation des ressources, les pannes matérielles ou réseau, les dépendances externes et les actions malveillantes."
            else:
                answer = "Je peux analyser cette situation même si elle n’existe pas encore dans l’historique. Précisez simplement ce que vous observez, par exemple le symptôme, le service touché ou depuis quand cela dure; je proposerai les causes, les risques et les actions sans exiger un ID."

    if event and intent == "similar" and not matches:
        matches = find_similar(events, event)
    if intent == "actions" and actions and "1)" not in answer:
        answer = answer.rstrip() + " " + " ".join(f"{index + 1}) {action}" for index, action in enumerate(actions))
    if ask and intent == "fill":
        answer = answer.rstrip() + " Utilisez le bouton « Oui, préparer la fiche » pour voir le remplissage progressif à l’écran; aucune donnée ne sera enregistrée sans validation finale."
    return {
        "answer": answer,
        "selectedEventId": event.get("id") if event else None,
        "confirmationPrompt": "Voulez-vous que je remplisse progressivement la qualification et la fiche d’incident avec cette proposition ?" if ask else "",
        "askToFillIncident": ask,
        "similarFound": bool(matches),
        "matches": matches,
        "actions": actions,
        "incidentDraft": build_draft(event, incident, actions, scenario=scenario),
        "qualificationDraft": qualification_suggestion(event, scenario),
        "source": "Données TELNET — moteur local de secours",
        "engine": "fallback-local",
        "diagnostic": diagnostic[:500],
        "matchScore": round(score * 100),
    }

def assistant(payload: dict[str, Any]) -> dict[str, Any]:
    question = str(payload.get("question") or "").strip()
    if not question:
        raise ValueError("La question ne peut pas être vide.")
    events = list(payload.get("events") or [])
    incidents = list(payload.get("incidents") or [])
    history = list(payload.get("history") or [])
    intent = infer_intent(question)
    follow_up = intent in {"fill", "actions", "risks", "similar", "classification", "explain", "causes"} and len(tokens(question)) <= 12
    previous_topic = last_substantive_user_message(history) if follow_up else ""
    context_query = f"{previous_topic} {question}".strip() if previous_topic else question
    selected_id = payload.get("selectedEventId") if follow_up else None
    event, event_score = select_event(events, selected_id, context_query, history if follow_up else [])
    incident = related_incident(incidents, event.get("id")) if event else None
    classification, critical, complete = cid_classification(event)
    scenario = scenario_kind(context_query)

    if intent in {"greeting", "smalltalk"}:
        answer = ("Bonjour ! Comment puis-je vous aider ? Vous pouvez me poser une question générale ou décrire un événement en quelques mots."
                  if intent == "greeting"
                  else "Je vais bien, merci ! Et vous ? Je peux ensuite vous aider sur TELNET ou analyser une situation technique.")
        return {
            "answer": answer,
            "selectedEventId": None, "confirmationPrompt": "", "askToFillIncident": False,
            "similarFound": False, "matches": [], "actions": [], "incidentDraft": {},
            "qualificationDraft": {}, "source": "Assistant TELNET", "engine": "direct-conversation",
        }

    ranked = sorted(events, key=lambda item: similarity(context_query, event_text(item)), reverse=True)[:15]
    relevant_ids = {str(item.get("id")) for item in ranked}
    relevant_incidents = [item for item in incidents if str(item.get("eventId")) in relevant_ids][:15]
    context = {
        "selectedEvent": compact_event(event), "selectedIncident": compact_incident(incident),
        "eventMatchScore": round(event_score * 100), "classificationCid": classification,
        "classificationComplete": complete, "scenario": scenario, "intent": intent,
        "relevantEvents": [compact_event(item) for item in ranked],
        "relevantIncidents": [compact_incident(item) for item in relevant_incidents],
        "counts": {"events": len(events), "incidents": len(incidents)},
    }
    history_text = [{"role": str(item.get("role") or "user"), "text": str(item.get("text") or "")[:1200]} for item in history[-10:] if isinstance(item, dict)]

    prompt = f"""
Tu es un véritable chatbot RSSI conversationnel de TELNET. Réponds toujours en français naturel et directement à la dernière question.
Réponds correctement aux salutations, à la conversation courante et aux questions générales, sans ramener systématiquement la discussion vers un incident. Comprends une description libre, même sans titre, ID, ticket ou code erreur.
L'historique contient des messages utilisateur et assistant, mais le sujet technique doit être déduit en priorité des derniers messages UTILISATEUR. Utilise-le pour les questions de suivi telles que « que dois-je faire alors ? ». Ne répète jamais la réponse précédente. Une nouvelle situation comme « incendie » ou « panne serveur » remplace immédiatement le sujet précédent.
Si la question est imprécise, donne quand même une analyse prudente, des risques et des étapes utiles au lieu de réclamer un identifiant.
Mets les actions utiles directement dans answer sous forme de phrases ou d'une courte liste textuelle; l'interface ne montre pas une carte d'actions séparée. Utilise les données live et les cas
historiques, sans inventer de faits. Explique clairement ce qui est certain, probable
ou à confirmer. Les trois impacts CID sont obligatoires et au moins un Critique donne
INCIDENT. Si un événement est identifié, propose le remplissage de la qualification et de la fiche dès que ta proposition CID contient au moins un impact Critique, même si les impacts enregistrés sont encore incomplets. Si l'utilisateur demande explicitement de remplir, préparer, compléter ou ouvrir la fiche, askToFillIncident doit être true lorsque l'événement est identifié et que la proposition est INCIDENT. Le bouton Oui déclenchera le remplissage progressif; ne prétends jamais que la fiche est déjà enregistrée.

GUIDE TELNET:
{SITE_GUIDE}

DONNÉES LIVE:
{json.dumps(context, ensure_ascii=False)[:30000]}

HISTORIQUE:
{json.dumps(history_text, ensure_ascii=False)[:9000]}

QUESTION ACTUELLE:
{question}

Retourne uniquement un JSON valide:
{{
  "answer": "réponse adaptée à la question actuelle",
  "actions": ["actions uniquement lorsqu'elles sont utiles"],
  "askToFillIncident": true ou false,
  "confirmationPrompt": "question de confirmation ou chaîne vide",
  "qualificationDraft": {{
    "impactConfidentialite": "Mineur|Majeur|Critique",
    "impactIntegrite": "Mineur|Majeur|Critique",
    "impactDisponibilite": "Mineur|Majeur|Critique",
    "commentaireConfidentialite": "", "commentaireIntegrite": "", "commentaireDisponibilite": "",
    "qualification": "INCIDENT|NON_INCIDENT"
  }},
  "incidentDraft": {{
    "typesIncident": ["type"], "niveauImpact": "NIVEAU_1|NIVEAU_2|NIVEAU_3|NIVEAU_4",
    "dureeIndisponibilite": "", "mesureAction": "", "mesureEtat": "En cours",
    "traitementAction": "", "traitementEtat": "En cours", "preconisation": "",
    "actionCorrective": "", "impactContinuite": false,
    "impactContinuiteDescription": "", "changementDeclenche": false,
    "changementDeclencheDescription": "", "risques": [{{"reference": "", "description": "description obligatoire"}}]
  }}
}}
""".strip()

    try:
        generated, engine = run_model(prompt, json_format=True)
        model = parse_json_object(generated)
        answer = str(model.get("answer") or "").strip()
        if not answer:
            raise ValueError("Réponse vide")
        actions = [str(item).strip() for item in (model.get("actions") or []) if str(item).strip()][:8]
        if intent == "actions" and not actions:
            actions = baseline_actions(event, scenario)
        model_draft = model.get("incidentDraft") if isinstance(model.get("incidentDraft"), dict) else {}
        suggested_qualification = model.get("qualificationDraft") if isinstance(model.get("qualificationDraft"), dict) else qualification_suggestion(event, scenario)
        suggested_values = [suggested_qualification.get("impactConfidentialite"), suggested_qualification.get("impactIntegrite"), suggested_qualification.get("impactDisponibilite")]
        suggested_incident = "Critique" in suggested_values
        explicit_fill = wants_form_fill(question)
        relevant_intent = intent in {"fill", "actions", "analysis", "classification", "risks", "explain", "causes"}
        ask = bool(event and suggested_incident and (explicit_fill or (relevant_intent and model.get("askToFillIncident", True))))
        if ask and not actions:
            actions = baseline_actions(event, scenario)
        if intent == "actions" and actions and not any(token in answer for token in ("1)", "1.", "premièrement")):
            answer = answer.rstrip() + "\n\n" + "\n".join(f"{index + 1}. {action}" for index, action in enumerate(actions))
        if ask and intent == "fill" and "Oui, préparer la fiche" not in answer:
            answer = answer.rstrip() + " Je peux maintenant préremplir toute la qualification et la fiche; cliquez sur « Oui, préparer la fiche » pour voir chaque champ se compléter progressivement."
        matches = find_similar(events, event) if event and intent == "similar" else []
        return {
            "answer": answer,
            "selectedEventId": event.get("id") if event else None,
            "confirmationPrompt": str(model.get("confirmationPrompt") or ("Voulez-vous que je remplisse maintenant la qualification puis toute la fiche d’incident, champ par champ, sous votre contrôle ?" if ask else "")),
            "askToFillIncident": ask,
            "similarFound": bool(matches), "matches": matches, "actions": actions,
            "incidentDraft": build_draft(event, incident, actions, model_draft, scenario),
            "qualificationDraft": suggested_qualification,
            "source": "Assistant IA TELNET + données live", "engine": engine,
        }
    except Exception as exc:  # noqa: BLE001
        return fallback_answer(question, event, incident, events, incidents, history, event_score, str(exc))


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        result = generate_text(payload) if str(payload.get("mode") or "assistant") == "generate_text" else assistant(payload)
        json.dump(result, sys.stdout, ensure_ascii=False)
        return 0
    except Exception as exc:  # noqa: BLE001
        json.dump({"message": str(exc)}, sys.stderr, ensure_ascii=False)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
