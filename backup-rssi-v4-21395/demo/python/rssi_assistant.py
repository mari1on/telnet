#!/usr/bin/env python3
"""Assistant RSSI local.

Le programme lit un objet JSON sur stdin et écrit un objet JSON sur stdout.
Il utilise uniquement la bibliothèque standard Python : aucune API externe,
aucun envoi réseau et aucun modèle cloud.
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
}


def normalize(value: Any) -> str:
    text = str(value or "")
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^a-zA-Z0-9]+", " ", text).lower().strip()
    return re.sub(r"\s+", " ", text)


def tokens(value: Any) -> set[str]:
    return {
        token for token in normalize(value).split()
        if len(token) >= 3 and token not in STOP_WORDS
    }


def event_text(event: dict[str, Any]) -> str:
    fields = (
        "title", "description", "source", "declaredBy", "ticket", "nature", "service",
        "equipment", "errorCode", "possibleCauses", "state", "qualification",
        "confidentiality", "integrity", "availability",
    )
    return " ".join(str(event.get(field) or "") for field in fields)


def similarity(query: str, selected: dict[str, Any], candidate: dict[str, Any]) -> float:
    selected_text = event_text(selected)
    candidate_text = event_text(candidate)
    query_text = f"{query} {selected_text}"

    query_tokens = tokens(query_text)
    candidate_tokens = tokens(candidate_text)
    union = query_tokens | candidate_tokens
    jaccard = len(query_tokens & candidate_tokens) / len(union) if union else 0.0

    sequence = SequenceMatcher(
        None,
        normalize(f"{selected.get('title', '')} {selected.get('description', '')}"),
        normalize(f"{candidate.get('title', '')} {candidate.get('description', '')}"),
    ).ratio()

    boosts = 0.0
    for field, weight in (("nature", 0.12), ("service", 0.14), ("errorCode", 0.16), ("equipment", 0.08)):
        left = normalize(selected.get(field))
        right = normalize(candidate.get(field))
        if left and right and left == right:
            boosts += weight

    return min(1.0, 0.56 * jaccard + 0.28 * sequence + boosts)


def clean_action(value: Any) -> str | None:
    text = re.sub(r"\s+", " ", str(value or "")).strip(" .;\n\t")
    if len(text) < 8:
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
    context = normalize(f"{question} {event_text(selected)}")
    actions: list[str] = [
        "Conserver les journaux techniques et horodatages avant toute modification.",
        "Confirmer le périmètre affecté, les utilisateurs concernés et le service métier impacté.",
    ]

    if any(word in context for word in ("authentification", "authentication", "login", "mot passe", "vpn", "acces")):
        actions.extend([
            "Vérifier les journaux d’authentification, les échecs répétés, les adresses IP et les comptes ciblés.",
            "Bloquer temporairement les sources suspectes et réinitialiser uniquement les comptes confirmés comme compromis.",
            "Vérifier l’activation du MFA et lancer une revue des privilèges du compte concerné.",
        ])
    elif any(word in context for word in ("serveur", "panne", "indisponibilite", "timeout", "reseau")):
        actions.extend([
            "Vérifier la supervision, la connectivité, l’espace disque, la mémoire et les dépendances du service.",
            "Appliquer une mesure de contournement contrôlée avant le redémarrage ou la bascule du service.",
            "Comparer les logs avant et après rétablissement pour confirmer la cause racine.",
        ])
    elif any(word in context for word in ("malware", "virus", "phishing", "ransomware")):
        actions.extend([
            "Isoler l’équipement concerné sans supprimer les preuves utiles à l’investigation.",
            "Lancer l’analyse EDR/antivirus et rechercher les mêmes indicateurs sur le reste du parc.",
            "Révoquer les sessions et secrets exposés après validation du périmètre compromis.",
        ])
    else:
        actions.extend([
            "Comparer les changements récents, les alertes de supervision et les erreurs applicatives autour de l’heure de détection.",
            "Appliquer une action réversible, documentée et validée par le responsable du service.",
            "Mesurer l’efficacité de l’action avant la clôture de l’incident.",
        ])

    return unique_actions(actions)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        events = payload.get("events") or []
        incidents = payload.get("incidents") or []
        selected_id = payload.get("selectedEventId")
        question = str(payload.get("question") or "").strip()

        selected = next((event for event in events if event.get("id") == selected_id), None)
        if not selected:
            raise ValueError("Événement sélectionné introuvable dans les données reçues.")

        scored: list[tuple[float, dict[str, Any]]] = []
        for event in events:
            if event.get("id") == selected_id:
                continue
            score = similarity(question, selected, event)
            if score >= 0.18:
                scored.append((score, event))
        scored.sort(key=lambda item: item[0], reverse=True)
        scored = scored[:4]

        incident_by_event: dict[Any, list[dict[str, Any]]] = {}
        for incident in incidents:
            incident_by_event.setdefault(incident.get("eventId"), []).append(incident)

        action_values: list[Any] = []
        matches: list[dict[str, Any]] = []
        for score, event in scored:
            matches.append({
                "eventId": event.get("id"),
                "title": event.get("title") or "Sans nom",
                "date": event.get("date"),
                "score": round(score * 100),
                "qualification": event.get("qualification") or "NON_QUALIFIE",
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
        if len(actions) < 3:
            actions = unique_actions(actions + fallback_actions(selected, question))

        similar_found = bool(matches)
        if similar_found:
            best = matches[0]
            answer = (
                f"J’ai trouvé {len(matches)} événement(s) similaire(s) dans l’historique. "
                f"Le cas le plus proche est #EV-{best['eventId']} « {best['title']} » "
                f"avec une similarité estimée à {best['score']} %. "
                "Les actions ci-dessous proviennent des plans déjà enregistrés, complétées par des contrôles de sécurité prudents."
            )
            confirmation = (
                "Confirmez-vous que le contexte technique et le périmètre affecté sont comparables ? "
                "Après confirmation, vous pourrez préremplir le plan d’incident, puis le vérifier avant sauvegarde."
            )
        else:
            answer = (
                "Aucun événement historique n’atteint le seuil de similarité. "
                "Je propose donc une procédure initiale générique fondée sur les informations de l’événement sélectionné."
            )
            confirmation = (
                "Confirmez-vous le périmètre, la criticité et les symptômes avant d’appliquer ces actions au plan d’incident ?"
            )

        response = {
            "answer": answer,
            "confirmationPrompt": confirmation,
            "similarFound": similar_found,
            "matches": matches,
            "actions": actions,
            "source": "Moteur Python local — historique TELNET, sans API externe",
        }
        json.dump(response, sys.stdout, ensure_ascii=False)
        return 0
    except Exception as exc:  # noqa: BLE001 - sortie contrôlée pour le pont Java
        json.dump({"error": str(exc)}, sys.stderr, ensure_ascii=False)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
