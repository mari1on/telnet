#!/usr/bin/env python3
"""Assistant RSSI local et déterministe.

Entrée JSON sur stdin, sortie JSON sur stdout. Aucun appel réseau et aucune
bibliothèque externe. Le moteur répond uniquement à partir des données TELNET
transmises par Spring Boot et d'un guide fonctionnel intégré.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from typing import Any, Iterable

STOP_WORDS = {
    "a", "ai", "au", "aux", "avec", "ce", "ces", "cette", "dans", "de", "des",
    "du", "elle", "en", "est", "et", "il", "je", "la", "le", "les", "leur", "mais",
    "me", "mes", "mon", "ne", "nous", "on", "ou", "par", "pas", "plus", "pour",
    "que", "qui", "se", "son", "sur", "un", "une", "vous", "the", "is", "are",
    "of", "to", "in", "and", "for", "with", "what", "how", "why", "can", "do",
}

SYNONYMS: dict[str, set[str]] = {
    "authentification": {"authentification", "authentication", "login", "connexion", "acces", "credential", "identifiant"},
    "motdepasse": {"password", "passwd", "mdp", "motdepasse"},
    "reseau": {"reseau", "network", "connectivite", "vpn", "firewall", "parefeu"},
    "indisponibilite": {"indisponibilite", "panne", "outage", "down", "downtime", "timeout", "interruption", "coupure"},
    "serveur": {"serveur", "server", "machine", "host", "vm"},
    "malware": {"malware", "virus", "ransomware", "trojan", "phishing", "hameconnage"},
    "correctif": {"patch", "correctif", "miseajour", "update", "upgrade"},
    "risque": {"risque", "risques", "menace", "menaces", "danger", "dangers", "risk", "risks"},
    "similaire": {"similaire", "similaires", "semblable", "historique", "precedent", "recurrence", "deja", "similar"},
    "action": {"action", "actions", "approche", "solution", "resoudre", "traiter", "corriger", "recommandation", "recommend"},
    "expliquer": {"explique", "expliquer", "resume", "resumer", "comprendre", "signifie", "definition", "explain", "summary"},
    "cause": {"cause", "causes", "origine", "pourquoi", "racine", "rootcause", "why"},
    "incident": {"incident", "incidents", "plan", "traitement"},
    "evenement": {"evenement", "evenements", "event", "events", "declaration", "signalement"},
    "qualification": {"qualification", "qualifier", "classer", "classification"},
    "compte": {"compte", "profil", "email", "password", "motdepasse", "settings", "parametres"},
    "audit": {"audit", "journal", "log", "logs", "trace"},
    "recherche": {"recherche", "chercher", "search", "filtre", "filter", "micro", "voix", "voice"},
    "supprimer": {"supprimer", "effacer", "delete", "remove"},
    "creer": {"creer", "ajouter", "nouveau", "create", "add"},
}
CANONICAL = {variant: canonical for canonical, variants in SYNONYMS.items() for variant in variants}


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or "").casefold())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def tokens(value: Any) -> set[str]:
    result: set[str] = set()
    for token in normalize(value).split():
        if len(token) < 2 or token in STOP_WORDS:
            continue
        result.add(CANONICAL.get(token, token))
    return result


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


def event_text(event: dict[str, Any]) -> str:
    return " ".join(str(event.get(key) or "") for key in (
        "id", "title", "description", "source", "declaredBy", "ticket", "nature",
        "service", "equipment", "errorCode", "possibleCauses", "state", "qualification",
        "confidentiality", "integrity", "availability",
    ))


def similarity_text(left: str, right: str) -> float:
    lt = tokens(left)
    rt = tokens(right)
    union = lt | rt
    jaccard = len(lt & rt) / len(union) if union else 0.0
    sequence = SequenceMatcher(None, normalize(left), normalize(right)).ratio()
    return 0.78 * jaccard + 0.22 * sequence


def is_greeting(question: str) -> bool:
    q = normalize(question)
    return bool(re.fullmatch(r"(?:bonjour|bonsoir|salut|hello|hi|hey|coucou)(?: comment ca va)?", q))


def is_thanks(question: str) -> bool:
    q = normalize(question)
    return any(term in q for term in ("merci", "thanks", "thank you")) and len(q.split()) <= 7


def select_event(events: list[dict[str, Any]], selected_id: Any, question: str) -> dict[str, Any] | None:
    if selected_id is not None:
        selected = next((event for event in events if str(event.get("id")) == str(selected_id)), None)
        if selected:
            return selected

    explicit_ids = re.findall(r"(?:#?ev[- ]?|evenement\s*#?|event\s*#?)(\d+)", normalize(question))
    for event_id in explicit_ids:
        selected = next((event for event in events if str(event.get("id")) == event_id), None)
        if selected:
            return selected

    q_tokens = tokens(question)
    event_signal = q_tokens & {
        "evenement", "expliquer", "cause", "risque", "similaire", "action", "incident",
        "reseau", "authentification", "indisponibilite", "serveur", "malware",
    }
    if not event_signal or len(q_tokens) < 2:
        return None

    ranked = sorted(
        ((similarity_text(question, event_text(event)), event) for event in events),
        key=lambda item: item[0],
        reverse=True,
    )
    return ranked[0][1] if ranked and ranked[0][0] >= 0.23 else None


def related_incident(incidents: list[dict[str, Any]], event_id: Any) -> dict[str, Any] | None:
    return next((incident for incident in incidents if str(incident.get("eventId")) == str(event_id)), None)


def infer_risks(event: dict[str, Any]) -> list[str]:
    context = normalize(event_text(event))
    risks: list[str] = []
    if any(term in context for term in ("authentification", "login", "acces", "compte")):
        risks += ["accès non autorisé", "compromission ou verrouillage de comptes", "indisponibilité du service d’authentification"]
    if any(term in context for term in ("reseau", "vpn", "serveur", "indisponibilite", "panne")):
        risks += ["interruption de service", "perte de connectivité", "retard ou perte de transactions en cours"]
    if any(term in context for term in ("malware", "virus", "ransomware", "phishing")):
        risks += ["propagation de la menace", "exfiltration ou chiffrement de données", "compromission d’identifiants"]
    if not risks:
        risks += ["dégradation du service", "impact sur les utilisateurs", "récidive si la cause racine n’est pas corrigée"]
    return unique_strings(risks)


def baseline_actions(event: dict[str, Any]) -> list[str]:
    context = normalize(event_text(event))
    actions = ["Conserver les journaux, heures, captures et éléments techniques utiles à l’analyse."]
    if any(term in context for term in ("authentification", "login", "acces", "compte")):
        actions += [
            "Vérifier les journaux d’authentification, les comptes concernés et les adresses sources.",
            "Bloquer temporairement les accès suspects et réinitialiser les identifiants exposés.",
            "Contrôler les règles MFA, de verrouillage et les droits des comptes sensibles.",
        ]
    elif any(term in context for term in ("reseau", "vpn", "serveur", "indisponibilite", "panne")):
        actions += [
            "Vérifier l’état des équipements, liens, services et dernières modifications de configuration.",
            "Isoler le composant défaillant et activer une solution de secours si elle existe.",
            "Rétablir le service progressivement puis surveiller la stabilité et les erreurs résiduelles.",
        ]
    elif any(term in context for term in ("malware", "virus", "ransomware", "phishing")):
        actions += [
            "Isoler les équipements ou comptes potentiellement compromis.",
            "Collecter les indicateurs de compromission et analyser journaux, fichiers et connexions.",
            "Éradiquer la menace, appliquer les correctifs et valider l’intégrité avant remise en service.",
        ]
    else:
        actions += [
            "Qualifier le périmètre, les utilisateurs affectés et les impacts confidentialité, intégrité et disponibilité.",
            "Identifier la cause racine et appliquer une mesure d’atténuation réversible.",
            "Tester le retour à la normale et documenter une action préventive.",
        ]
    return unique_strings(actions)


def find_similar(selected: dict[str, Any], events: list[dict[str, Any]], question: str) -> list[dict[str, Any]]:
    ranked: list[tuple[float, dict[str, Any]]] = []
    for candidate in events:
        if candidate.get("id") == selected.get("id"):
            continue
        score = similarity_text(f"{question} {event_text(selected)}", event_text(candidate))
        for field, boost in (("errorCode", .20), ("service", .14), ("nature", .12), ("equipment", .08)):
            left = normalize(selected.get(field))
            right = normalize(candidate.get(field))
            if left and right and left == right:
                score += boost
        if score >= .16:
            ranked.append((min(score, 1.0), candidate))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [
        {
            "eventId": candidate.get("id"),
            "title": first_non_empty(candidate.get("title"), fallback="Sans nom"),
            "date": candidate.get("date"),
            "score": round(score * 100),
            "qualification": candidate.get("qualification"),
            "reason": "titre, contexte, service, nature ou code erreur en commun",
        }
        for score, candidate in ranked[:5]
    ]


HELP_TOPICS: list[dict[str, Any]] = [
    {
        "title": "Connexion et inscription",
        "keywords": "connexion connecter login inscription inscrire compte acces identifiant email",
        "answer": "Sur la page d’authentification, utilisez Se connecter avec le nom d’utilisateur ou l’email. S’inscrire sert uniquement à créer un nouveau compte.",
    },
    {
        "title": "Mot de passe oublié",
        "keywords": "mot de passe oublie code email reset recuperer connexion",
        "answer": "Le lien Mot de passe oublié est disponible sur la page Se connecter. Saisissez votre identifiant ou email, recevez le code à six chiffres, puis définissez un nouveau mot de passe.",
    },
    {
        "title": "Déclarer un événement",
        "keywords": "declarer ajouter creer evenement signalement probleme detecteur formulaire",
        "answer": "Dans Mes Déclarations ou Tous les événements, cliquez sur Déclarer un problème, complétez les champs obligatoires puis enregistrez. Le ticket et le code erreur sont générés automatiquement.",
    },
    {
        "title": "Envoyer au RSSI",
        "keywords": "envoyer rssi notification mail detecteur evenement",
        "answer": "Le détecteur enregistre d’abord un événement complet, puis utilise l’action Envoyer au RSSI. Le statut Envoyé apparaît ensuite dans la ligne.",
    },
    {
        "title": "Qualification CID",
        "keywords": "qualification qualifier confidentialite integrite disponibilite cid incident classer",
        "answer": "Dans Tous les événements, ouvrez Qualifier, renseignez les trois impacts CID et leurs commentaires. Un impact majeur ou critique classe l’événement comme incident et ouvre le plan associé.",
    },
    {
        "title": "Risques",
        "keywords": "risque risques selectionner existant nouveau id reference description",
        "answer": "Dans la qualification ou le plan d’incident, sélectionnez un risque existant par ID et description, ou créez un nouveau risque. Son ID est généré automatiquement et sa description reste modifiable.",
    },
    {
        "title": "Plan d’incident",
        "keywords": "plan incident attenuation traitement corrective suivi duree indisponibilite",
        "answer": "Le Plan d’incidents centralise les mesures d’atténuation, le traitement, les durées, les risques, les actions correctives et le suivi. Ouvrez la ligne avec le bouton de gestion, puis enregistrez.",
    },
    {
        "title": "Suppression",
        "keywords": "supprimer effacer delete incident evenement corbeille",
        "answer": "Utilisez la corbeille de la ligne concernée puis confirmez. La suppression d’un incident détache son événement et le remet en attente de qualification.",
    },
    {
        "title": "Journal d’audit",
        "keywords": "journal audit logs historique action utilisateur date recherche",
        "answer": "Le Journal d’audit affiche l’horodatage, l’utilisateur et l’action. La recherche accepte plusieurs mots, les accents et les dates françaises.",
    },
    {
        "title": "Recherche vocale",
        "keywords": "recherche micro microphone voix dictee parole speech",
        "answer": "Cliquez sur le microphone, autorisez son accès dans le navigateur et dictez en français. Le texte reconnu est placé dans la recherche ou dans la question de l’assistant.",
    },
    {
        "title": "Profil et sécurité",
        "keywords": "profil compte settings email mot de passe role utilisateur changer",
        "answer": "Ouvrez Mon Profil ou Settings. Le profil est affiché dans une page du dashboard. Pour changer l’email ou le mot de passe, confirmez avec le mot de passe actuel.",
    },
    {
        "title": "Dashboard RSSI",
        "keywords": "dashboard statistique kpi carte evenement incident risque impact taux",
        "answer": "Le Dashboard RSSI synthétise les événements, incidents, risques, impacts critiques, états et temps de traitement à partir des données enregistrées.",
    },
    {
        "title": "Assistant RSSI",
        "keywords": "assistant chatbot aide question site evenement incident risque approche",
        "answer": "L’Assistant RSSI répond aux questions sur le fonctionnement du site et analyse les événements, incidents et risques disponibles. Sélectionner un événement améliore les réponses techniques ciblées.",
    },
]


def help_answers(question: str) -> list[str]:
    q_tokens = tokens(question)
    if not q_tokens:
        return []
    ranked: list[tuple[float, dict[str, Any]]] = []
    for topic in HELP_TOPICS:
        topic_tokens = tokens(f"{topic['title']} {topic['keywords']}")
        overlap = len(q_tokens & topic_tokens)
        if overlap:
            score = overlap / max(1, len(q_tokens)) + SequenceMatcher(None, normalize(question), normalize(topic["keywords"])).ratio() * .12
            ranked.append((score, topic))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [f"**{topic['title']}** — {topic['answer']}" for _, topic in ranked[:2]]


def data_overview(events: list[dict[str, Any]], incidents: list[dict[str, Any]]) -> str:
    open_count = sum(1 for incident in incidents if normalize(incident.get("treatmentState")) != "cloture")
    closed_count = len(incidents) - open_count
    total_risks = sum(len(incident.get("risks") or []) for incident in incidents)
    return (
        f"**Vue d’ensemble** — {len(events)} événement(s), {len(incidents)} incident(s), "
        f"{open_count} non clôturé(s), {closed_count} clôturé(s) et {total_risks} risque(s) associé(s)."
    )


def build_response(payload: dict[str, Any]) -> dict[str, Any]:
    question = str(payload.get("question") or "").strip()
    if not question:
        raise ValueError("La question est vide.")

    events = list(payload.get("events") or [])
    incidents = list(payload.get("incidents") or [])
    selected_id = payload.get("selectedEventId")

    if is_greeting(question):
        return {
            "answer": "Bonjour. Je peux vous guider dans le site TELNET ou analyser un événement, un incident, ses risques et les actions possibles. Quelle information recherchez-vous ?",
            "confirmationPrompt": "",
            "similarFound": False,
            "matches": [],
            "actions": [],
            "source": "Guide fonctionnel TELNET",
        }
    if is_thanks(question):
        return {
            "answer": "Avec plaisir. Vous pouvez continuer avec une question sur le site, un événement, un incident ou un risque.",
            "confirmationPrompt": "",
            "similarFound": False,
            "matches": [],
            "actions": [],
            "source": "Guide fonctionnel TELNET",
        }

    q = normalize(question)
    q_tokens = tokens(question)
    sections: list[str] = []
    actions: list[str] = []
    matches: list[dict[str, Any]] = []

    # Le contexte historique n'est utilisé que pour résoudre une référence courte, jamais pour déterminer l'intention principale.
    history = [item for item in (payload.get("history") or []) if isinstance(item, dict) and item.get("role") == "user"]
    referential = any(term in q.split() for term in ("ce", "cet", "cette", "celui", "elle", "il", "meme"))
    selection_question = question
    if referential and history:
        selection_question = f"{history[-1].get('text', '')} {question}".strip()

    selected = select_event(events, selected_id, selection_question)

    # Questions globales sur les données.
    if any(word in q for word in ("combien", "nombre", "total", "statistique", "vue d ensemble", "dashboard")):
        sections.append(data_overview(events, incidents))

    # Le guide fonctionnel n'est ajouté que pour une question globale. Une analyse d'événement reste ciblée.
    site_intents = {"compte", "audit", "recherche", "qualification", "supprimer", "creer"}
    if selected is None or bool(q_tokens & site_intents):
        sections.extend(help_answers(question))
    if selected:
        event_id = selected.get("id")
        incident = related_incident(incidents, event_id)
        title = first_non_empty(selected.get("title"), fallback=f"Événement #{event_id}")

        wants_explain = "expliquer" in q_tokens or any(term in q for term in ("c est quoi", "qu est ce", "resume", "tell me about"))
        wants_details = any(term in q for term in ("ticket", "code erreur", "date", "source", "service", "equipement", "detail"))
        wants_causes = "cause" in q_tokens or "pourquoi" in q
        wants_risks = "risque" in q_tokens or any(term in q for term in ("impact", "confidentialite", "integrite", "disponibilite"))
        wants_similar = "similaire" in q_tokens
        wants_actions = "action" in q_tokens or any(term in q for term in ("que faire", "comment resoudre", "approche", "recommand"))
        wants_status = any(term in q for term in ("etat", "statut", "duree", "cloture", "indisponibilite"))

        # Une question ciblée non classée reçoit un résumé, sans répéter automatiquement risques + actions.
        if not any((wants_explain, wants_details, wants_causes, wants_risks, wants_similar, wants_actions, wants_status)):
            wants_explain = True

        if wants_explain:
            sections.append(
                f"**Explication de « {title} »** — {first_non_empty(selected.get('description'), fallback='aucune description détaillée')}. "
                f"Source : {first_non_empty(selected.get('source'))}; service ou équipement : "
                f"{first_non_empty(selected.get('service'), selected.get('equipment'))}; état : "
                f"{first_non_empty(selected.get('state'))}; qualification : {first_non_empty(selected.get('qualification'))}."
            )

        if wants_details:
            sections.append(
                f"**Détails vérifiables** — événement #EV-{event_id}; ticket : {first_non_empty(selected.get('ticket'))}; "
                f"code erreur : {first_non_empty(selected.get('errorCode'))}; date : {first_non_empty(selected.get('date'))}; "
                f"service : {first_non_empty(selected.get('service'))}; équipement : {first_non_empty(selected.get('equipment'))}."
            )

        if wants_causes:
            sections.append(
                f"**Causes possibles** — {first_non_empty(selected.get('possibleCauses'), fallback='aucune cause n’est enregistrée')}. "
                "Une cause reste une hypothèse jusqu’à sa confirmation par les journaux et les tests."
            )

        if wants_risks:
            registered: list[str] = []
            if incident:
                registered = [
                    f"{first_non_empty(risk.get('reference'), fallback='Sans ID')} — {first_non_empty(risk.get('description'))}"
                    for risk in incident.get("risks") or []
                ]
            cid = (
                f"Confidentialité : {first_non_empty(selected.get('confidentiality'))}; "
                f"Intégrité : {first_non_empty(selected.get('integrity'))}; "
                f"Disponibilité : {first_non_empty(selected.get('availability'))}."
            )
            registered_text = " Risques enregistrés : " + "; ".join(registered) + "." if registered else ""
            sections.append(f"**Risques et impacts CID** — {cid} Risques à examiner : {', '.join(infer_risks(selected))}.{registered_text}")

        matches = find_similar(selected, events, question)
        if wants_similar:
            if matches:
                summary = "; ".join(f"#EV-{m['eventId']} {m['title']} ({m['score']} %)" for m in matches[:3])
                sections.append(f"**Événements similaires** — {summary}.")
            else:
                sections.append("**Événements similaires** — aucun cas suffisamment proche n’a été trouvé dans les données disponibles.")

        if wants_status:
            if incident:
                sections.append(
                    f"**État du plan** — traitement : {first_non_empty(incident.get('treatmentState'))}; "
                    f"indisponibilité : {first_non_empty(incident.get('downtime'))}; "
                    f"durée de traitement : {first_non_empty(incident.get('treatmentDuration'))}."
                )
            else:
                sections.append("**État du plan** — aucun incident n’est associé à cet événement.")

        historical_incidents = [
            inc for inc in incidents
            if any(str(match.get("eventId")) == str(inc.get("eventId")) for match in matches)
        ]
        historical_actions = unique_strings(
            value for inc in historical_incidents for value in (
                inc.get("mitigationAction"), inc.get("treatmentAction"),
                inc.get("recommendation"), inc.get("correctiveAction"),
            )
        )
        actions = unique_strings([*historical_actions[:4], *baseline_actions(selected)])[:7]
        if wants_actions:
            prefix = "Les premières actions proviennent de cas similaires. " if historical_actions else ""
            numbered = " ".join(f"{index + 1}) {action}" for index, action in enumerate(actions[:5]))
            sections.append(f"**Approche recommandée** — {prefix}{numbered}")

    if not sections:
        sections.append(
            "Je n’ai pas trouvé une réponse suffisamment précise dans les données ou le guide du site. "
            "Reformulez avec l’objectif recherché, par exemple : déclarer un événement, qualifier un incident, "
            "choisir un risque, rechercher un audit, modifier le profil, ou analyser l’événement #EV-12."
        )

    answer = "\n\n".join(unique_strings(sections))
    return {
        "answer": answer,
        "confirmationPrompt": (
            "Souhaitez-vous confirmer ces actions et les préparer dans le plan d’incident ?"
            if actions and selected else
            ""
        ),
        "similarFound": bool(matches),
        "matches": matches,
        "actions": actions,
        "source": "Données et guide fonctionnel TELNET",
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        json.dump(build_response(payload), sys.stdout, ensure_ascii=False)
        return 0
    except Exception as exc:  # noqa: BLE001
        json.dump({"message": str(exc)}, sys.stderr, ensure_ascii=False)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
