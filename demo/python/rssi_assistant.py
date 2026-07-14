#!/usr/bin/env python3
"""Assistant RSSI local fondé sur l'historique TELNET.

Entrée : un objet JSON sur stdin.
Sortie : un objet JSON sur stdout.
Aucune bibliothèque externe et aucun appel réseau.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from typing import Any

STOP_WORDS = {
    "alors", "avec", "avoir", "cette", "dans", "des", "elle", "elles", "encore",
    "est", "ete", "faire", "fois", "il", "ils", "les", "leur", "mais", "nous",
    "pour", "probleme", "que", "quel", "quelle", "qui", "quoi", "sans", "sur",
    "une", "vous", "event", "evenement", "incident", "rssi", "deja", "comment",
    "peut", "doit", "sont", "aux", "par", "plus", "moins", "tres", "cela", "ceci",
}

# Les variantes françaises/anglaises et les différences de casse sont regroupées
# sous un même terme canonique afin d'améliorer les questions courtes.
SYNONYM_GROUPS: dict[str, set[str]] = {
    "authentification": {"authentification", "authentication", "login", "connexion", "acces", "credential", "identifiant"},
    "motdepasse": {"password", "passwd", "mdp", "mot", "passe"},
    "reseau": {"reseau", "network", "connectivite", "connexion", "vpn", "firewall", "parefeu"},
    "indisponibilite": {"indisponibilite", "panne", "outage", "down", "timeout", "interruption", "coupure"},
    "serveur": {"serveur", "server", "machine", "host", "vm"},
    "malware": {"malware", "virus", "ransomware", "trojan", "cheval", "phishing", "hameconnage"},
    "correctif": {"patch", "correctif", "miseajour", "update", "upgrade"},
    "isolation": {"isolation", "isoler", "quarantaine", "quarantine", "segmenter"},
    "compte": {"compte", "account", "utilisateur", "user"},
    "journal": {"journal", "journaux", "log", "logs", "trace", "traces"},
    "critique": {"critique", "critical", "majeur", "grave", "severe"},
}

CANONICAL_BY_TOKEN = {
    variant: canonical
    for canonical, variants in SYNONYM_GROUPS.items()
    for variant in variants
}


def normalize(value: Any) -> str:
    text = str(value or "").casefold()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return re.sub(r"\s+", " ", text)


def tokens(value: Any) -> set[str]:
    result: set[str] = set()
    for token in normalize(value).split():
        if len(token) < 3 or token in STOP_WORDS:
            continue
        result.add(CANONICAL_BY_TOKEN.get(token, token))
    return result


def event_text(event: dict[str, Any]) -> str:
    fields = (
        "title", "description", "source", "declaredBy", "ticket", "nature", "service",
        "equipment", "errorCode", "possibleCauses", "state", "qualification",
        "confidentiality", "integrity", "availability",
    )
    return " ".join(str(event.get(field) or "") for field in fields)


def field_tokens(event: dict[str, Any], field: str) -> set[str]:
    return tokens(event.get(field))


def similarity(query: str, selected: dict[str, Any], candidate: dict[str, Any]) -> tuple[float, list[str]]:
    selected_text = event_text(selected)
    candidate_text = event_text(candidate)
    query_context = f"{query} {selected_text}"

    query_tokens = tokens(query_context)
    candidate_tokens = tokens(candidate_text)
    union = query_tokens | candidate_tokens
    jaccard = len(query_tokens & candidate_tokens) / len(union) if union else 0.0

    title_sequence = SequenceMatcher(
        None,
        normalize(f"{selected.get('title', '')} {selected.get('description', '')}"),
        normalize(f"{candidate.get('title', '')} {candidate.get('description', '')}"),
    ).ratio()

    title_left = field_tokens(selected, "title") | tokens(query)
    title_right = field_tokens(candidate, "title")
    title_union = title_left | title_right
    title_overlap = len(title_left & title_right) / len(title_union) if title_union else 0.0

    boosts = 0.0
    reasons: list[str] = []
    for field, label, weight in (
        ("errorCode", "même code d’erreur", 0.20),
        ("service", "même service", 0.15),
        ("nature", "même nature", 0.11),
        ("equipment", "même équipement", 0.09),
        ("source", "même source", 0.05),
    ):
        left = normalize(selected.get(field))
        right = normalize(candidate.get(field))
        if left and right and (left == right or left in right or right in left):
            boosts += weight
            reasons.append(label)

    # Le score combine le vocabulaire, le titre/description et les métadonnées techniques.
    score = min(1.0, 0.42 * jaccard + 0.23 * title_sequence + 0.20 * title_overlap + boosts)
    return score, reasons


def clean_action(value: Any) -> str | None:
    text = re.sub(r"\s+", " ", str(value or "")).strip(" .;\n\t")
    if len(text) < 5:
        return None
    return text[0].upper() + text[1:]


def unique_actions(values: list[Any], limit: int = 7) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        action = clean_action(raw)
        if not action:
            continue
        key = normalize(action)
        if key in seen:
            continue
        seen.add(key)
        result.append(action)
        if len(result) >= limit:
            break
    return result


def fallback_actions(selected: dict[str, Any], question: str) -> list[str]:
    context = tokens(f"{question} {event_text(selected)}")
    actions: list[str] = [
        "Conserver les journaux techniques et les horodatages avant toute modification.",
        "Confirmer le périmètre affecté, les utilisateurs concernés et le service métier impacté.",
    ]

    if {"authentification", "motdepasse", "compte"} & context:
        actions.extend([
            "Vérifier les journaux d’authentification, les échecs répétés, les adresses IP et les comptes ciblés.",
            "Bloquer temporairement les sources suspectes et réinitialiser uniquement les comptes confirmés comme compromis.",
            "Vérifier l’activation du MFA et lancer une revue des privilèges du compte concerné.",
        ])
    elif {"serveur", "indisponibilite", "reseau"} & context:
        actions.extend([
            "Vérifier la supervision, la connectivité, l’espace disque, la mémoire et les dépendances du service.",
            "Appliquer une mesure de contournement contrôlée avant le redémarrage ou la bascule du service.",
            "Comparer les journaux avant et après rétablissement pour confirmer la cause racine.",
        ])
    elif "malware" in context:
        actions.extend([
            "Isoler l’équipement concerné sans supprimer les preuves utiles à l’investigation.",
            "Lancer l’analyse EDR ou antivirus et rechercher les mêmes indicateurs sur le reste du parc.",
            "Révoquer les sessions et secrets exposés après validation du périmètre compromis.",
        ])
    else:
        actions.extend([
            "Comparer les changements récents, les alertes de supervision et les erreurs applicatives autour de l’heure de détection.",
            "Appliquer une action réversible, documentée et validée par le responsable du service.",
            "Mesurer l’efficacité de l’action avant la clôture de l’incident.",
        ])

    return unique_actions(actions)


def user_history_text(history: Any) -> str:
    if not isinstance(history, list):
        return ""
    parts: list[str] = []
    for item in history[-8:]:
        if not isinstance(item, dict):
            continue
        if normalize(item.get("role")) != "user":
            continue
        text = str(item.get("text") or "").strip()
        if text:
            parts.append(text)
    return " ".join(parts)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        events = payload.get("events") or []
        incidents = payload.get("incidents") or []
        selected_id = payload.get("selectedEventId")
        question = str(payload.get("question") or "").strip()
        history_context = user_history_text(payload.get("history"))
        full_question = f"{history_context} {question}".strip()

        selected = next((event for event in events if event.get("id") == selected_id), None)
        if not selected:
            raise ValueError("Événement sélectionné introuvable dans les données reçues.")

        scored: list[tuple[float, dict[str, Any], list[str]]] = []
        for event in events:
            if event.get("id") == selected_id:
                continue
            score, reasons = similarity(full_question, selected, event)
            if score >= 0.14:
                scored.append((score, event, reasons))
        scored.sort(key=lambda item: item[0], reverse=True)
        scored = scored[:4]

        incident_by_event: dict[Any, list[dict[str, Any]]] = {}
        for incident in incidents:
            incident_by_event.setdefault(incident.get("eventId"), []).append(incident)

        action_values: list[Any] = []
        matches: list[dict[str, Any]] = []
        for score, event, reasons in scored:
            matches.append({
                "eventId": event.get("id"),
                "title": event.get("title") or "Sans nom",
                "date": event.get("date"),
                "score": round(score * 100),
                "qualification": event.get("qualification") or "NON_QUALIFIE",
                "reason": ", ".join(reasons[:3]) if reasons else "vocabulaire et description proches",
            })
            for incident in incident_by_event.get(event.get("id"), []):
                action_values.extend([
                    incident.get("mitigationAction"),
                    incident.get("treatmentAction"),
                    incident.get("recommendation"),
                    incident.get("correctiveAction"),
                    incident.get("effectivenessComment"),
                    incident.get("followUpComments"),
                ])

        actions = unique_actions(action_values)
        historical_action_count = len(actions)
        if len(actions) < 3:
            actions = unique_actions(actions + fallback_actions(selected, full_question))

        similar_found = bool(matches)
        if similar_found:
            best = matches[0]
            origin = (
                f"{historical_action_count} action(s) proviennent de plans enregistrés"
                if historical_action_count
                else "aucune action exploitable n’était renseignée dans les anciens plans"
            )
            answer = (
                f"Oui, {len(matches)} événement(s) comparable(s) ont été trouvés. "
                f"Le cas le plus proche est #EV-{best['eventId']} « {best['title']} » "
                f"avec un score de {best['score']} % ({best['reason']}). "
                f"Pour les propositions ci-dessous, {origin}; les contrôles manquants ont été complétés par des règles de sécurité prudentes."
            )
            confirmation = (
                "Vérifiez que le service, le périmètre et les symptômes sont réellement comparables. "
                "Confirmez uniquement après cette vérification; sinon annulez et précisez votre question."
            )
        else:
            answer = (
                "Non, aucun événement historique n’est assez proche pour réutiliser un ancien plan avec confiance. "
                "Les propositions affichées sont donc des mesures initiales génériques adaptées aux mots-clés et aux métadonnées de l’événement."
            )
            confirmation = (
                "Vérifiez le périmètre, la criticité et les symptômes. Confirmez pour préparer un brouillon, ou annulez sans modifier le plan d’incident."
            )

        response = {
            "answer": answer,
            "confirmationPrompt": confirmation,
            "similarFound": similar_found,
            "matches": matches,
            "actions": actions,
            "source": "Historique TELNET — analyse locale",
        }
        json.dump(response, sys.stdout, ensure_ascii=False)
        return 0
    except Exception as exc:  # sortie contrôlée pour le pont Java
        json.dump({"error": str(exc)}, sys.stderr, ensure_ascii=False)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
