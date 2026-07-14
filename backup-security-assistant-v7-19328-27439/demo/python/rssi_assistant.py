#!/usr/bin/env python3
"""Assistant RSSI local pour les événements, incidents et risques TELNET.

Le programme lit un JSON sur stdin et écrit un JSON sur stdout.
Il n'effectue aucun appel réseau et n'utilise aucune bibliothèque externe.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from typing import Any, Iterable

STOP_WORDS = {
    "alors", "avec", "avoir", "cette", "dans", "des", "elle", "elles", "encore",
    "est", "ete", "faire", "fois", "il", "ils", "les", "leur", "mais", "nous",
    "pour", "que", "quel", "quelle", "qui", "quoi", "sans", "sur", "une", "vous",
    "peut", "doit", "sont", "aux", "par", "plus", "moins", "tres", "cela", "ceci",
}

SYNONYMS: dict[str, set[str]] = {
    "authentification": {"authentification", "authentication", "login", "connexion", "acces", "credential", "identifiant"},
    "motdepasse": {"password", "passwd", "mdp", "motdepasse"},
    "reseau": {"reseau", "network", "connectivite", "vpn", "firewall", "parefeu"},
    "indisponibilite": {"indisponibilite", "panne", "outage", "down", "timeout", "interruption", "coupure"},
    "serveur": {"serveur", "server", "machine", "host", "vm"},
    "malware": {"malware", "virus", "ransomware", "trojan", "phishing", "hameconnage"},
    "correctif": {"patch", "correctif", "miseajour", "update", "upgrade"},
    "isolation": {"isolation", "isoler", "quarantaine", "quarantine", "segmenter"},
    "risque": {"risque", "risques", "menace", "menaces", "danger", "dangers"},
    "similaire": {"similaire", "similaires", "semblable", "historique", "precedent", "recurrence", "deja"},
    "action": {"action", "actions", "approche", "solution", "resoudre", "traiter", "corriger", "recommandation"},
    "expliquer": {"explique", "expliquer", "resume", "resumer", "comprendre", "signifie", "definition"},
    "cause": {"cause", "causes", "origine", "pourquoi", "racine", "rootcause"},
    "detail": {"detail", "details", "ticket", "code", "source", "date", "service", "equipement"},
}
CANONICAL = {variant: canonical for canonical, variants in SYNONYMS.items() for variant in variants}


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or "").casefold())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def tokens(value: Any) -> set[str]:
    result: set[str] = set()
    for token in normalize(value).split():
        if len(token) < 3 or token in STOP_WORDS:
            continue
        result.add(CANONICAL.get(token, token))
    return result


def text_of_event(event: dict[str, Any]) -> str:
    keys = (
        "title", "description", "source", "declaredBy", "ticket", "nature", "service",
        "equipment", "errorCode", "possibleCauses", "state", "qualification",
        "confidentiality", "integrity", "availability",
    )
    return " ".join(str(event.get(key) or "") for key in keys)


def first_non_empty(*values: Any, fallback: str = "non renseigné") -> str:
    for value in values:
        if value is not None and str(value).strip():
            return str(value).strip()
    return fallback


def unique_strings(values: Iterable[Any]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = str(value or "").strip()
        key = normalize(text)
        if text and key and key not in seen:
            seen.add(key)
            result.append(text)
    return result


def similarity(selected: dict[str, Any], candidate: dict[str, Any], question: str) -> tuple[float, list[str]]:
    left_tokens = tokens(f"{question} {text_of_event(selected)}")
    right_tokens = tokens(text_of_event(candidate))
    union = left_tokens | right_tokens
    overlap = len(left_tokens & right_tokens) / len(union) if union else 0.0
    sequence = SequenceMatcher(None, normalize(text_of_event(selected)), normalize(text_of_event(candidate))).ratio()

    boost = 0.0
    reasons: list[str] = []
    for field, label, weight in (
        ("errorCode", "même code d’erreur", 0.20),
        ("service", "même service", 0.14),
        ("nature", "même nature", 0.12),
        ("equipment", "même équipement", 0.09),
        ("source", "même source", 0.05),
    ):
        left = normalize(selected.get(field))
        right = normalize(candidate.get(field))
        if left and right and (left == right or left in right or right in left):
            boost += weight
            reasons.append(label)

    score = min(1.0, 0.53 * overlap + 0.27 * sequence + boost)
    if not reasons and left_tokens & right_tokens:
        shared = sorted(left_tokens & right_tokens)[:4]
        reasons.append("termes communs : " + ", ".join(shared))
    return score, reasons


def classify_intents(question: str) -> set[str]:
    q = normalize(question)
    q_tokens = tokens(question)
    intents: set[str] = set()
    if "expliquer" in q_tokens or any(word in q for word in ("qu est ce", "c est quoi", "donne moi un resume")):
        intents.add("explain")
    if "risque" in q_tokens or any(word in q for word in ("impact", "confidentialite", "integrite", "disponibilite", "menace")):
        intents.add("risks")
    if "similaire" in q_tokens:
        intents.add("similar")
    if "action" in q_tokens or any(word in q for word in ("que faire", "comment faire", "quelle approche", "plan d incident")):
        intents.add("actions")
    if "cause" in q_tokens or any(word in q for word in ("pourquoi", "cause racine", "origine probable")):
        intents.add("causes")
    if "detail" in q_tokens or any(word in q for word in ("id ticket", "code erreur", "detecte par", "quelle date", "quel service")):
        intents.add("details")
    if any(word in q for word in ("etat", "statut", "duree", "indisponibilite", "traitement", "cloture")):
        intents.add("status")
    if any(word in q for word in ("combien", "nombre", "total")):
        intents.add("count")
    if not intents:
        intents.update({"explain", "risks", "actions"})
    return intents


def impact_summary(event: dict[str, Any]) -> str:
    return (
        f"Confidentialité : {first_non_empty(event.get('confidentiality'))}; "
        f"Intégrité : {first_non_empty(event.get('integrity'))}; "
        f"Disponibilité : {first_non_empty(event.get('availability'))}."
    )


def inferred_risks(event: dict[str, Any]) -> list[str]:
    context = normalize(text_of_event(event))
    risks: list[str] = []
    if any(term in context for term in ("authentification", "authentication", "login", "acces", "credential", "compte")):
        risks += ["compromission ou verrouillage de comptes", "accès non autorisé", "indisponibilité du service d’authentification"]
    if any(term in context for term in ("reseau", "vpn", "panne", "indisponibilite", "serveur")):
        risks += ["interruption de service", "perte de connectivité", "retard ou perte de transactions en cours"]
    if any(term in context for term in ("malware", "virus", "ransomware", "phishing")):
        risks += ["propagation du logiciel malveillant", "exfiltration ou chiffrement de données", "compromission d’identifiants"]
    if not risks:
        risks += ["dégradation du service", "impact sur les utilisateurs", "récidive si la cause racine n’est pas corrigée"]
    return unique_strings(risks)


def baseline_actions(event: dict[str, Any]) -> list[str]:
    context = normalize(text_of_event(event))
    actions = ["Conserver les journaux, heures et éléments techniques utiles à l’analyse."]
    if any(term in context for term in ("authentification", "authentication", "login", "acces", "credential", "compte")):
        actions += [
            "Vérifier les journaux d’authentification, les comptes concernés et les adresses sources.",
            "Bloquer temporairement les accès suspects et réinitialiser les identifiants exposés.",
            "Contrôler les règles MFA, de verrouillage et les droits des comptes sensibles.",
        ]
    elif any(term in context for term in ("reseau", "vpn", "panne", "indisponibilite", "serveur")):
        actions += [
            "Vérifier l’état des équipements, liens, services et dernières modifications de configuration.",
            "Isoler le composant défaillant et activer une solution de secours si elle existe.",
            "Rétablir le service progressivement puis surveiller la stabilité et les erreurs résiduelles.",
        ]
    elif any(term in context for term in ("malware", "virus", "ransomware", "phishing")):
        actions += [
            "Isoler immédiatement les équipements ou comptes potentiellement compromis.",
            "Collecter les indicateurs de compromission et analyser les journaux, fichiers et connexions.",
            "Éradiquer la menace, appliquer les correctifs puis valider l’intégrité avant remise en service.",
        ]
    else:
        actions += [
            "Qualifier le périmètre, les utilisateurs affectés et la criticité CID.",
            "Identifier la cause racine et appliquer une mesure d’atténuation réversible.",
            "Tester le retour à la normale et documenter une action préventive.",
        ]
    return unique_strings(actions)


def build_response(payload: dict[str, Any]) -> dict[str, Any]:
    question = str(payload.get("question") or "").strip()
    history = list(payload.get("history") or [])
    recent_context = " ".join(
        str(item.get("text") or "") for item in history[-6:]
        if isinstance(item, dict)
    )
    contextual_question = f"{recent_context} {question}".strip()
    events = list(payload.get("events") or [])
    incidents = list(payload.get("incidents") or [])
    selected_id = payload.get("selectedEventId")
    selected = next((event for event in events if event.get("id") == selected_id), None)
    if selected is None:
        raise ValueError("Événement sélectionné introuvable dans les données transmises.")

    selected_incident = next((inc for inc in incidents if inc.get("eventId") == selected_id), None)
    scored: list[tuple[float, dict[str, Any], list[str]]] = []
    for event in events:
        if event.get("id") == selected_id:
            continue
        score, reasons = similarity(selected, event, contextual_question)
        if score >= 0.16:
            scored.append((score, event, reasons))
    scored.sort(key=lambda item: item[0], reverse=True)
    top = scored[:5]

    matches = [
        {
            "eventId": event.get("id"),
            "title": first_non_empty(event.get("title"), fallback="Sans nom"),
            "date": event.get("date"),
            "score": round(score * 100),
            "qualification": event.get("qualification"),
            "reason": ", ".join(reasons),
        }
        for score, event, reasons in top
    ]

    related_incidents = [inc for inc in incidents if inc.get("eventId") in {m[1].get("id") for m in top}]
    historical_actions = unique_strings(
        value
        for inc in related_incidents
        for value in (
            inc.get("mitigationAction"), inc.get("treatmentAction"),
            inc.get("recommendation"), inc.get("correctiveAction"),
        )
    )
    actions = unique_strings([*historical_actions[:4], *baseline_actions(selected)])[:7]

    intents = classify_intents(contextual_question)
    sections: list[str] = []
    title = first_non_empty(selected.get("title"), fallback=f"Événement #{selected_id}")

    if "count" in intents:
        total_risks = sum(len(inc.get("risks") or []) for inc in incidents)
        sections.append(
            f"La base contient {len(events)} événement(s), {len(incidents)} incident(s) et {total_risks} risque(s) associé(s)."
        )

    if "explain" in intents:
        description = first_non_empty(selected.get("description"), fallback="aucune description détaillée")
        sections.append(
            f"**Explication de « {title} »** — {description}. "
            f"L’événement a été détecté par {first_non_empty(selected.get('source'))}, "
            f"sur {first_non_empty(selected.get('service'), selected.get('equipment'))}. "
            f"Son état est {first_non_empty(selected.get('state'))} et sa qualification est {first_non_empty(selected.get('qualification'))}."
        )

    if "details" in intents:
        sections.append(
            f"**Détails vérifiables** — ticket : {first_non_empty(selected.get('ticket'))}; "
            f"code erreur : {first_non_empty(selected.get('errorCode'))}; "
            f"date : {first_non_empty(selected.get('date'))}; "
            f"source : {first_non_empty(selected.get('source'))}; "
            f"service/équipement : {first_non_empty(selected.get('service'), selected.get('equipment'))}."
        )

    if "causes" in intents:
        causes = first_non_empty(selected.get("possibleCauses"), fallback="aucune cause n’est encore enregistrée")
        sections.append(
            f"**Causes possibles** — {causes}. "
            "Ces causes restent des hypothèses tant qu’elles ne sont pas confirmées par les journaux, les tests et les éléments techniques."
        )

    if "risks" in intents:
        registered = []
        if selected_incident:
            registered = [
                f"{first_non_empty(risk.get('reference'), fallback='Sans ID')} — {first_non_empty(risk.get('description'))}"
                for risk in selected_incident.get("risks") or []
            ]
        risk_text = " Risques enregistrés : " + "; ".join(registered) + "." if registered else ""
        sections.append(
            f"**Impacts CID** — {impact_summary(selected)} "
            f"Risques à examiner : {', '.join(inferred_risks(selected))}.{risk_text}"
        )

    if "similar" in intents:
        if matches:
            summary = "; ".join(
                f"#EV-{match['eventId']} {match['title']} ({match['score']} %)" for match in matches[:3]
            )
            sections.append(f"**Cas similaires** — {summary}.")
        else:
            sections.append("**Cas similaires** — aucun événement suffisamment proche n’a été trouvé dans l’historique disponible.")

    if "status" in intents:
        if selected_incident:
            sections.append(
                f"**État du plan** — traitement : {first_non_empty(selected_incident.get('treatmentState'))}; "
                f"durée d’indisponibilité : {first_non_empty(selected_incident.get('downtime'))}; "
                f"durée de traitement : {first_non_empty(selected_incident.get('treatmentDuration'))}."
            )
        else:
            sections.append("**État du plan** — aucun plan d’incident n’est encore associé à cet événement.")

    if "actions" in intents:
        provenance = "Les premières propositions proviennent de cas similaires déjà traités. " if historical_actions else ""
        action_lines = " ".join(f"{index + 1}) {action}" for index, action in enumerate(actions[:5]))
        sections.append(
            f"**Approche recommandée** — {provenance}{action_lines}"
        )

    answer = "\n\n".join(sections)
    confirmation = (
        "Souhaitez-vous confirmer ces actions et les préparer dans le plan d’incident ?"
        if actions else
        "Précisez la question pour obtenir des actions applicables au plan d’incident."
    )

    return {
        "answer": answer,
        "confirmationPrompt": confirmation,
        "similarFound": bool(matches),
        "matches": matches,
        "actions": actions,
        "source": "Analyse locale des données TELNET",
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        result = build_response(payload)
        json.dump(result, sys.stdout, ensure_ascii=False)
        return 0
    except Exception as exc:  # noqa: BLE001
        json.dump({"message": str(exc)}, sys.stderr, ensure_ascii=False)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
