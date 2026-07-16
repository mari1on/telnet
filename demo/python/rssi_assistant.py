#!/usr/bin/env python3
"""Assistant RSSI TELNET.

Le moteur charge les événements et incidents courants à chaque question. Il utilise
un modèle local Ollama lorsqu'il est disponible et un mode de secours déterministe
sinon. Aucune donnée n'est envoyée vers un service cloud par ce script.
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
import urllib.error
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

MODEL = os.environ.get("TELNET_AI_MODEL", "qwen2.5:3b")
OLLAMA_URL = os.environ.get("TELNET_OLLAMA_URL", "http://127.0.0.1:11434")
TIMEOUT = int(os.environ.get("TELNET_AI_TIMEOUT_SECONDS", "120"))

SITE_GUIDE = """
TELNET gère les événements de sécurité, leur qualification CID et les plans d'incident.
Le détecteur utilise Mes Déclarations et Mon Profil. Le RSSI utilise Dashboard, Tous les
événements, Plan d'incidents, Journal d'audits, Assistant RSSI et Settings.
Un détecteur crée un événement, complète le ticket et le code erreur, puis l'envoie au
RSSI. Le RSSI doit renseigner les trois impacts Confidentialité, Intégrité et
Disponibilité avec Mineur, Majeur ou Critique. Si au moins un impact est Critique,
l'événement est classé INCIDENT et le plan d'incident doit s'ouvrir. Sinon il est
classé NON_INCIDENT. Le plan contient atténuation, traitement, actions correctives,
continuité, PCA, risques, efficacité et suivi. La description d'un risque est
obligatoire; son ID peut être saisi manuellement. Les recherches acceptent le texte
et la voix. Le profil permet de modifier le nom, l'email et le mot de passe.
""".strip()


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or "").lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def tokens(value: Any) -> set[str]:
    stop = {
        "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "a",
        "au", "aux", "dans", "sur", "pour", "avec", "ce", "cet", "cette", "est",
        "sont", "je", "tu", "il", "elle", "nous", "vous", "me", "moi", "the", "an",
        "and", "or", "of", "to", "in", "on", "for", "is", "are", "what", "how",
    }
    synonyms = {
        "authentication": "authentification", "login": "authentification",
        "network": "reseau", "connectivity": "reseau", "outage": "indisponibilite",
        "downtime": "indisponibilite", "risk": "risque", "risks": "risque",
        "event": "evenement", "events": "evenement", "incident": "incident",
        "critical": "critique", "major": "majeur", "minor": "mineur",
        "availability": "disponibilite", "integrity": "integrite",
        "confidentiality": "confidentialite", "failure": "echec", "failed": "echec",
    }
    result: set[str] = set()
    for part in normalize(value).split():
        if len(part) > 1 and part not in stop:
            result.add(synonyms.get(part, part))
    return result


def similarity(left: Any, right: Any) -> float:
    lt, rt = tokens(left), tokens(right)
    union = lt | rt
    jaccard = len(lt & rt) / len(union) if union else 0.0
    sequence = SequenceMatcher(None, normalize(left), normalize(right)).ratio()
    return 0.78 * jaccard + 0.22 * sequence


def event_text(event: dict[str, Any]) -> str:
    return " ".join(str(event.get(key) or "") for key in (
        "id", "reference", "title", "description", "source", "declaredBy", "ticket",
        "nature", "service", "equipment", "errorCode", "possibleCauses", "state",
        "qualification", "confidentiality", "integrity", "availability",
    ))


def incident_text(incident: dict[str, Any]) -> str:
    return " ".join(str(incident.get(key) or "") for key in (
        "id", "eventId", "types", "impactLevel", "downtime", "mitigationAction",
        "treatmentAction", "recommendation", "correctiveAction", "risks",
    ))


def compact_event(event: dict[str, Any] | None) -> dict[str, Any] | None:
    if not event:
        return None
    return {key: event.get(key) for key in (
        "id", "reference", "title", "description", "date", "source", "declaredBy",
        "ticket", "nature", "service", "equipment", "errorCode", "possibleCauses",
        "state", "qualification", "confidentiality", "integrity", "availability",
    )}


def compact_incident(incident: dict[str, Any] | None) -> dict[str, Any] | None:
    if not incident:
        return None
    return {key: incident.get(key) for key in (
        "id", "eventId", "types", "impactLevel", "downtime", "mitigationAction",
        "mitigationState", "treatmentAction", "treatmentState", "treatmentDuration",
        "recommendation", "correctiveAction", "effectiveness", "effectivenessComment",
        "similarEvents", "similarEventsDescription", "followUpComments", "risks",
    )}


def select_event(events: list[dict[str, Any]], selected_id: Any, question: str,
                 history: list[dict[str, Any]]) -> dict[str, Any] | None:
    q = normalize(question)
    explicit = re.search(r"(?:#?ev[- _:]*)?(\d{1,9})", q)
    if explicit and ("ev" in q or "evenement" in q or "event" in q or "#" in question):
        for event in events:
            if str(event.get("id")) == explicit.group(1):
                return event

    # Business reference, ticket or error code exact/partial match.
    for event in events:
        for key in ("reference", "ticket", "errorCode"):
            value = normalize(event.get(key))
            if value and (value in q or q in value) and len(q) >= 3:
                return event

    contextual = question
    if len(tokens(question)) <= 4 and history:
        contextual = " ".join(str(item.get("text") or "") for item in history[-4:]) + " " + question

    ranked = sorted(
        ((
            similarity(contextual, event_text(event))
            + (0.04 if normalize(event.get("qualification")) in {"", "non qualifie", "non_qualifie"} else 0.0),
            event,
        ) for event in events),
        key=lambda item: (item[0], int(item[1].get("id") or 0)), reverse=True,
    )
    if ranked and ranked[0][0] >= 0.14:
        return ranked[0][1]

    if selected_id is not None:
        return next((event for event in events if str(event.get("id")) == str(selected_id)), None)
    return None


def related_incident(incidents: list[dict[str, Any]], event_id: Any) -> dict[str, Any] | None:
    return next((item for item in incidents if str(item.get("eventId")) == str(event_id)), None)


def cid_classification(event: dict[str, Any] | None) -> tuple[str, bool]:
    if not event:
        return "NON_RENSEIGNE", False
    values = [event.get("confidentiality"), event.get("integrity"), event.get("availability")]
    normalized = [normalize(value) for value in values]
    allowed = {"mineur", "majeur", "critique"}
    complete = all(value in allowed for value in normalized)
    if not complete:
        return "INCOMPLET", False
    incident = "critique" in normalized
    return ("INCIDENT" if incident else "NON_INCIDENT"), incident


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
        if score >= 0.20:
            ranked.append((min(score, 1.0), candidate))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [
        {
            "eventId": item.get("id"), "title": item.get("title") or "Sans titre",
            "date": item.get("date"), "score": round(score * 100),
            "qualification": item.get("qualification") or "NON_QUALIFIE",
            "reason": "titre, service, code erreur ou contexte en commun",
        }
        for score, item in ranked[:limit]
    ]


def find_ollama_executable() -> str | None:
    configured = os.environ.get("OLLAMA_EXE")
    candidates = [configured, shutil.which("ollama")]
    local = os.environ.get("LOCALAPPDATA")
    program_files = os.environ.get("ProgramFiles")
    if local:
        candidates.append(str(Path(local) / "Programs" / "Ollama" / "ollama.exe"))
    if program_files:
        candidates.append(str(Path(program_files) / "Ollama" / "ollama.exe"))
    for candidate in candidates:
        if candidate and (Path(candidate).is_file() or shutil.which(candidate)):
            return candidate
    return None


def ollama_http(prompt: str, json_format: bool = False) -> str:
    body: dict[str, Any] = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.25, "num_ctx": 8192},
    }
    if json_format:
        body["format"] = "json"
    request = urllib.request.Request(
        f"{OLLAMA_URL.rstrip('/')}/api/generate",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
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
        try:
            subprocess.Popen(
                [executable, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            for _ in range(12):
                time.sleep(0.5)
                try:
                    return ollama_http(prompt, json_format)
                except Exception:  # noqa: BLE001
                    pass
        except Exception as start_error:  # noqa: BLE001
            raise RuntimeError(f"Impossible de démarrer Ollama: {start_error}") from start_error
        raise RuntimeError(
            f"Ollama ne répond pas ou le modèle {MODEL} n'est pas installé. Lancez SETUP-LOCAL-AI.cmd."
        )


def parse_json_object(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end < start:
        raise ValueError("Réponse JSON absente")
    return json.loads(cleaned[start:end + 1])


def fallback_description(seed: str, event: dict[str, Any]) -> str:
    base = seed.strip().rstrip(".!?")
    context = normalize(f"{event.get('title', '')} {base}")
    if any(term in context for term in ("authentification", "authentication", "login", "connexion", "acces")):
        return (
            f"{base}. Des anomalies d’authentification ont été observées sur le service concerné et peuvent perturber "
            "l’accès des utilisateurs ou signaler une tentative non autorisée. Les journaux de connexion, les comptes "
            "touchés et les adresses sources doivent être analysés pour confirmer l’origine et le périmètre."
        )
    if any(term in context for term in ("reseau", "network", "vpn", "panne", "indisponibilite")):
        return (
            f"{base}. Une dégradation de la connectivité affecte le périmètre concerné et peut interrompre l’accès aux "
            "applications ou services métiers. Les équipements, la supervision et les changements récents doivent être "
            "vérifiés avant un rétablissement contrôlé."
        )
    return (
        f"{base}. L’événement nécessite une analyse technique afin d’identifier son origine, le périmètre affecté et les "
        "impacts réels sur le service. Les journaux disponibles, les changements récents et les mesures déjà entreprises "
        "doivent être documentés avant la qualification."
    )


def generate_text(payload: dict[str, Any]) -> dict[str, Any]:
    seed = str(payload.get("seed") or "").strip()
    if not seed:
        raise ValueError("Quelques mots sont nécessaires pour lancer la génération.")
    purpose = str(payload.get("purpose") or "description professionnelle")
    field = str(payload.get("field") or "description")
    event = payload.get("event") if isinstance(payload.get("event"), dict) else {}
    incident = payload.get("incident") if isinstance(payload.get("incident"), dict) else {}
    prompt = f"""
Tu es un assistant RSSI francophone. Rédige uniquement le texte destiné au champ
« {field} ». But: {purpose}. Écris 2 ou 3 phrases professionnelles, naturelles et
précises. Pars des mots fournis, sans inventer de date, d'identité, d'ID, de preuve
ou de résultat technique absent. Aucun titre, aucune puce, aucun Markdown.
Mots fournis: {seed}
Contexte événement: {json.dumps(event, ensure_ascii=False)[:3500]}
Contexte incident: {json.dumps(incident, ensure_ascii=False)[:3500]}
""".strip()
    try:
        text = run_ollama(prompt).strip().strip('"')
        return {"text": text, "engine": f"ollama:{MODEL}", "modelAvailable": True}
    except Exception as exc:  # noqa: BLE001
        return {
            "text": fallback_description(seed, event), "engine": "fallback-local",
            "modelAvailable": False, "diagnostic": str(exc)[:500],
        }


def baseline_actions(event: dict[str, Any]) -> list[str]:
    context = normalize(event_text(event))
    if any(term in context for term in ("authentification", "login", "connexion", "auth")):
        return [
            "Identifier les comptes, adresses sources et plages horaires concernés dans les journaux.",
            "Bloquer ou réinitialiser les accès suspects sans interrompre les comptes légitimes.",
            "Corriger la configuration ou le mécanisme d'authentification puis surveiller les nouvelles tentatives.",
        ]
    if any(term in context for term in ("reseau", "vpn", "indisponibilite", "panne")):
        return [
            "Vérifier la supervision, les équipements réseau et les dernières modifications de configuration.",
            "Isoler le composant défaillant et activer une solution de secours si elle existe.",
            "Rétablir progressivement le service puis surveiller la stabilité et les erreurs résiduelles.",
        ]
    return [
        "Confirmer le périmètre, les actifs touchés et les impacts CID à partir des preuves disponibles.",
        "Collecter les journaux et appliquer une mesure d'atténuation réversible.",
        "Tester le retour à la normale, documenter la cause et définir une action préventive.",
    ]


def build_draft(event: dict[str, Any] | None, incident: dict[str, Any] | None,
                actions: list[str], model_draft: dict[str, Any] | None = None) -> dict[str, Any]:
    if not event:
        return {}
    draft = dict(model_draft or {})
    classification, critical = cid_classification(event)
    default_level = "NIVEAU_4" if critical else "NIVEAU_2"
    draft.setdefault("typesIncident", (incident or {}).get("types") or ["Défaillance technique"])
    draft.setdefault("niveauImpact", (incident or {}).get("impactLevel") or default_level)
    draft.setdefault("dureeIndisponibilite", (incident or {}).get("downtime") or "")
    draft.setdefault("mesureAction", (incident or {}).get("mitigationAction") or (actions[0] if actions else "Collecter les preuves et contenir l'impact."))
    draft.setdefault("mesureEtat", (incident or {}).get("mitigationState") or "En cours")
    draft.setdefault("traitementAction", (incident or {}).get("treatmentAction") or "\n".join(actions))
    draft.setdefault("traitementEtat", (incident or {}).get("treatmentState") or "En cours")
    draft.setdefault("preconisation", (incident or {}).get("recommendation") or "Vérifier les preuves, tester le retour à la normale et renforcer la prévention.")
    draft.setdefault("actionCorrective", (incident or {}).get("correctiveAction") or "Documenter la cause racine et appliquer une action empêchant la récidive.")
    draft.setdefault("impactContinuite", normalize(event.get("availability")) == "critique")
    draft.setdefault("impactContinuiteDescription", "Impact sur la continuité à confirmer avec la supervision et les utilisateurs concernés.")
    draft.setdefault("changementDeclenche", False)
    draft.setdefault("changementDeclencheDescription", "")
    draft.setdefault("risques", (incident or {}).get("risks") or [{"reference": "", "description": "Risque à préciser selon le périmètre et les impacts observés."}])
    draft["classificationCid"] = classification
    return draft


def question_requests_similar(question: str) -> bool:
    q = normalize(question)
    return any(term in q for term in ("similaire", "historique", "precedent", "deja arrive", "similar", "history"))


def question_requests_actions(question: str) -> bool:
    q = normalize(question)
    return any(term in q for term in ("action", "approche", "demarche", "resoudre", "solution", "traitement", "que faire", "recommend"))


def fallback_answer(question: str, event: dict[str, Any] | None, incident: dict[str, Any] | None,
                    events: list[dict[str, Any]], incidents: list[dict[str, Any]], diagnostic: str) -> dict[str, Any]:
    q = normalize(question)
    actions: list[str] = []
    matches: list[dict[str, Any]] = []
    if re.match(r"^(bonjour|salut|bonsoir|hello|hi|hey)\b", q):
        answer = "Bonjour. Je peux analyser les événements et incidents TELNET, expliquer les risques, proposer une démarche ou vous guider dans l'application."
    elif event:
        title = event.get("title") or f"Événement {event.get('reference') or event.get('id')}"
        classification, critical = cid_classification(event)
        impacts = (
            f"confidentialité {event.get('confidentiality') or 'non renseignée'}, "
            f"intégrité {event.get('integrity') or 'non renseignée'} et "
            f"disponibilité {event.get('availability') or 'non renseignée'}"
        )
        if question_requests_similar(question):
            matches = find_similar(events, event)
            answer = f"J’ai trouvé {len(matches)} événement(s) comparable(s) à « {title} » dans l’historique actuel."
        elif any(term in q for term in ("risque", "impact", "confidentialite", "integrite", "disponibilite")):
            risks = (incident or {}).get("risks") or []
            risk_text = "; ".join(
                f"{item.get('reference') or 'sans ID'} — {item.get('description') or 'sans description'}" for item in risks
            ) or "aucun risque n’est encore enregistré"
            answer = f"Pour « {title} », les impacts sont {impacts}. Classification CID calculée : {classification}. Risques enregistrés : {risk_text}."
        elif any(term in q for term in ("qualifie", "qualification", "incident", "critique")):
            answer = f"Les trois impacts de « {title} » sont {impacts}. La règle TELNET donne {classification}: un seul impact Critique suffit pour classer l’événement comme incident."
        elif question_requests_actions(question):
            actions = baseline_actions(event)
            answer = f"Pour « {title} », commencez par confirmer le périmètre et les preuves, puis contenez l’impact et restaurez le service de façon contrôlée."
        else:
            answer = (
                f"« {title} » est décrit ainsi : {event.get('description') or 'description non renseignée'}. "
                f"État : {event.get('state') or 'non renseigné'}; qualification : {event.get('qualification') or classification}. "
                f"Impacts : {impacts}."
            )
        ask = bool(critical and (actions or any(term in q for term in ("analyse", "incident", "qualifie", "risque"))))
    elif any(term in q for term in ("combien", "nombre", "total", "dashboard")):
        open_incidents = sum(1 for item in incidents if normalize(item.get("treatmentState")) not in {"clos", "cloture", "termine"})
        answer = f"La base actuelle contient {len(events)} événement(s) et {len(incidents)} incident(s), dont {open_incidents} non clôturé(s)."
        ask = False
    elif "mot de passe" in q or "password" in q:
        answer = "Pour un mot de passe oublié, utilisez le lien de la page Connexion, saisissez votre email ou nom d’utilisateur, puis le code reçu par email. Pour le changer depuis le profil, saisissez le mot de passe actuel et le nouveau mot de passe."
        ask = False
    elif "audit" in q:
        answer = "Le Journal d’audits permet de rechercher par utilisateur, action ou date. La recherche textuelle et la recherche vocale appliquent le filtre à la liste affichée."
        ask = False
    elif "risque" in q:
        answer = "Dans le plan d’incident, vous pouvez choisir un risque existant ou créer une nouvelle ligne. La description est obligatoire; l’ID peut être saisi manuellement."
        ask = False
    else:
        answer = "Je peux vous guider sur TELNET et analyser les données enregistrées. Reformulez la question avec le titre, le ticket, le code erreur, le service ou la situation concernée."
        ask = False

    if event and question_requests_actions(question) and not actions:
        actions = baseline_actions(event)
    if event and question_requests_similar(question) and not matches:
        matches = find_similar(events, event)
    classification, critical = cid_classification(event)
    ask = bool(event and critical and (actions or question_requests_actions(question))) if 'ask' not in locals() else ask
    return {
        "answer": answer,
        "selectedEventId": event.get("id") if event else None,
        "confirmationPrompt": "Voulez-vous que je remplisse le plan d’incident avec cette analyse ?" if ask else "",
        "askToFillIncident": ask,
        "similarFound": bool(matches),
        "matches": matches,
        "actions": actions,
        "incidentDraft": build_draft(event, incident, actions),
        "source": "Données TELNET — mode de secours local",
        "engine": "fallback-local",
        "diagnostic": diagnostic[:500],
    }


def assistant(payload: dict[str, Any]) -> dict[str, Any]:
    question = str(payload.get("question") or "").strip()
    if not question:
        raise ValueError("La question ne peut pas être vide.")
    events = list(payload.get("events") or [])
    incidents = list(payload.get("incidents") or [])
    history = list(payload.get("history") or [])
    event = select_event(events, payload.get("selectedEventId"), question, history)
    incident = related_incident(incidents, event.get("id")) if event else None
    classification, critical = cid_classification(event)

    # Les nouvelles données sont intégrées à chaque requête, sans réentraînement du modèle.
    relevant_events = sorted(
        events, key=lambda item: similarity(question + " " + (event_text(event) if event else ""), event_text(item)), reverse=True
    )[:12]
    relevant_ids = {str(item.get("id")) for item in relevant_events}
    relevant_incidents = [item for item in incidents if str(item.get("eventId")) in relevant_ids][:12]
    similar = find_similar(events, event) if event and question_requests_similar(question) else []

    data_context = {
        "selectedEvent": compact_event(event),
        "selectedIncident": compact_incident(incident),
        "classificationCidCalculee": classification,
        "regleIncident": "les 3 impacts sont obligatoires; au moins un Critique => INCIDENT",
        "relevantEvents": [compact_event(item) for item in relevant_events],
        "relevantIncidents": [compact_incident(item) for item in relevant_incidents],
        "counts": {"events": len(events), "incidents": len(incidents)},
    }
    history_text = [
        {"role": str(item.get("role") or "user"), "text": str(item.get("text") or "")[:900]}
        for item in history[-8:] if isinstance(item, dict)
    ]

    prompt = f"""
Tu es le chatbot RSSI intelligent de TELNET. Réponds en français naturel et
professionnel à toute question liée au site, aux événements, incidents, risques,
impacts CID, plans de traitement, audits et comptes. Utilise l'historique de la
conversation et les données live fournies. Ne réclame pas l'ID si le titre, ticket,
code erreur, service ou contexte permet d'identifier l'événement. Ne répète pas les
cas similaires ni les actions sauf si la question les demande. N'invente aucune
donnée. Tu peux expliquer, comparer, compter, qualifier et proposer une démarche.
La classification CID calculée par le serveur est prioritaire sur ton opinion.

GUIDE:
{SITE_GUIDE}

DONNÉES LIVE:
{json.dumps(data_context, ensure_ascii=False)[:26000]}

HISTORIQUE:
{json.dumps(history_text, ensure_ascii=False)[:7000]}

QUESTION:
{question}

Retourne uniquement un JSON valide:
{{
  "answer": "réponse complète mais concise",
  "actions": ["actions seulement si pertinentes"],
  "askToFillIncident": true ou false,
  "confirmationPrompt": "question de confirmation ou chaîne vide",
  "incidentDraft": {{
    "typesIncident": ["type"], "niveauImpact": "NIVEAU_1|NIVEAU_2|NIVEAU_3|NIVEAU_4",
    "dureeIndisponibilite": "", "mesureAction": "", "mesureEtat": "En cours",
    "traitementAction": "", "traitementEtat": "En cours", "preconisation": "",
    "actionCorrective": "", "impactContinuite": false,
    "impactContinuiteDescription": "", "changementDeclenche": false,
    "changementDeclencheDescription": "", "risques": [{{"reference": "", "description": "description obligatoire"}}]
  }}
}}
askToFillIncident peut être vrai uniquement si un événement précis est identifié,
sa classification CID calculée est INCIDENT, et la réponse contient une analyse ou
des actions utiles au plan.
""".strip()

    try:
        raw = run_ollama(prompt, json_format=True)
        model = parse_json_object(raw)
        answer = str(model.get("answer") or "").strip()
        if not answer:
            raise ValueError("Le modèle n'a pas fourni de réponse.")
        actions = [str(item).strip() for item in (model.get("actions") or []) if str(item).strip()][:8]
        model_draft = model.get("incidentDraft") if isinstance(model.get("incidentDraft"), dict) else {}
        ask = bool(event and critical and model.get("askToFillIncident") and (actions or model_draft))
        if event and critical and question_requests_actions(question) and not actions:
            actions = baseline_actions(event)
            ask = True
        return {
            "answer": answer,
            "selectedEventId": event.get("id") if event else None,
            "confirmationPrompt": str(model.get("confirmationPrompt") or ("Voulez-vous que je remplisse le plan d’incident avec cette analyse ?" if ask else "")),
            "askToFillIncident": ask,
            "similarFound": bool(similar),
            "matches": similar,
            "actions": actions,
            "incidentDraft": build_draft(event, incident, actions, model_draft),
            "source": "Modèle local TELNET + données live",
            "engine": f"ollama:{MODEL}",
        }
    except Exception as exc:  # noqa: BLE001
        return fallback_answer(question, event, incident, events, incidents, str(exc))


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
