package com.example.demo.controller;

import com.example.demo.entity.Evenement;
import com.example.demo.entity.Incident;
import com.example.demo.repository.EvenementRepository;
import com.example.demo.repository.IncidentRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/rssi-assistant")
public class RssiAssistantController {

    private static final Duration PYTHON_TIMEOUT = Duration.ofSeconds(180);

    private final EvenementRepository evenementRepository;
    private final IncidentRepository incidentRepository;
    private final ObjectMapper objectMapper;

    public RssiAssistantController(
            EvenementRepository evenementRepository,
            IncidentRepository incidentRepository,
            ObjectMapper objectMapper
    ) {
        this.evenementRepository = evenementRepository;
        this.incidentRepository = incidentRepository;
        this.objectMapper = objectMapper;
    }

    public record AssistantRequest(Long eventId, String question, List<Map<String, String>> history) {}

    public record GenerateTextRequest(
            String purpose,
            String field,
            String seed,
            Map<String, Object> event,
            Map<String, Object> incident
    ) {}

    private record PythonExecution(Map<String, Object> response, String command) {}

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        try {
            Path script = locatePythonScript();
            return ResponseEntity.ok(Map.of(
                    "available", true,
                    "script", script.toString(),
                    "message", "Le script Python de l'assistant est présent."
            ));
        } catch (IOException ex) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "available", false,
                    "message", sanitizeDetail(ex.getMessage())
            ));
        }
    }

    @PostMapping("/analyze")
    public ResponseEntity<?> analyze(@RequestBody AssistantRequest request) {
        if (request == null || request.question() == null || request.question().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "La question ne peut pas être vide."));
        }

        if (request.eventId() != null && evenementRepository.findById(request.eventId()).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "L'événement sélectionné est introuvable."));
        }

        List<Evenement> events = evenementRepository.findAll();
        List<Incident> incidents = incidentRepository.findAll();

        try {
            Path script = locatePythonScript();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("mode", "assistant");
            payload.put("question", request.question().trim());
            payload.put("history", request.history() == null ? List.of() : request.history());
            payload.put("selectedEventId", request.eventId());
            payload.put("events", events.stream().map(this::eventToMap).toList());
            payload.put("incidents", incidents.stream().map(this::incidentToMap).toList());
            payload.put("site", siteKnowledge());

            String inputJson = objectMapper.writeValueAsString(payload);
            PythonExecution execution = executeWithAvailablePython(script, inputJson);
            Map<String, Object> response = new LinkedHashMap<>(execution.response());
            response.putIfAbsent("pythonCommand", execution.command());
            return ResponseEntity.ok(response);
        } catch (Exception ex) {
            // A small, data-grounded fallback keeps the page usable while exposing the real diagnostic.
            Map<String, Object> fallback = buildFallbackResponse(request, events, incidents, ex);
            return ResponseEntity.ok(fallback);
        }
    }


    @PostMapping("/generate-text")
    public ResponseEntity<?> generateText(@RequestBody GenerateTextRequest request) {
        if (request == null || request.seed() == null || request.seed().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "message", "Saisissez quelques mots avant de lancer la génération."
            ));
        }

        try {
            Path script = locatePythonScript();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("mode", "generate_text");
            payload.put("purpose", request.purpose());
            payload.put("field", request.field());
            payload.put("seed", request.seed().trim());
            payload.put("event", request.event() == null ? Map.of() : request.event());
            payload.put("incident", request.incident() == null ? Map.of() : request.incident());

            PythonExecution execution = executeWithAvailablePython(
                    script,
                    objectMapper.writeValueAsString(payload)
            );
            Map<String, Object> response = new LinkedHashMap<>(execution.response());
            response.putIfAbsent("pythonCommand", execution.command());
            return ResponseEntity.ok(response);
        } catch (Exception ex) {
            String fallback = buildTextFallback(request.seed(), request.field(), request.event());
            return ResponseEntity.ok(Map.of(
                    "text", fallback,
                    "engine", "java-fallback",
                    "modelAvailable", false,
                    "diagnostic", sanitizeDetail(ex.getMessage())
            ));
        }
    }

    private String buildTextFallback(String seed, String field, Map<String, Object> event) {
        String cleaned = seed == null ? "" : seed.trim().replaceAll("[.!?]+$", "");
        String title = event == null ? "" : String.valueOf(event.getOrDefault("title", ""));
        String normalized = normalize(cleaned + " " + title);
        if (normalized.contains("auth") || normalized.contains("connexion") || normalized.contains("login")) {
            return cleaned + ". Des anomalies d’authentification ont été observées sur le service concerné et peuvent perturber l’accès des utilisateurs ou signaler une tentative non autorisée. Les journaux de connexion, les comptes touchés et les adresses sources doivent être analysés pour confirmer l’origine et le périmètre.";
        }
        if (normalized.contains("reseau") || normalized.contains("vpn") || normalized.contains("panne") || normalized.contains("indisponibilite")) {
            return cleaned + ". Une dégradation de la connectivité affecte le périmètre concerné et peut interrompre l’accès aux applications ou services métiers. Les équipements, la supervision et les changements récents doivent être vérifiés avant un rétablissement contrôlé.";
        }
        return cleaned + ". L’événement nécessite une analyse technique afin d’identifier son origine, le périmètre affecté et les impacts réels sur le service. Les journaux disponibles, les changements récents et les mesures déjà entreprises doivent être documentés avant la qualification.";
    }

    private PythonExecution executeWithAvailablePython(Path script, String inputJson) throws Exception {
        List<List<String>> commands = new ArrayList<>();
        commands.add(List.of("py", "-3", "-X", "utf8", script.toString()));
        commands.add(List.of("python", "-X", "utf8", script.toString()));
        commands.add(List.of("python3", "-X", "utf8", script.toString()));
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData != null && !localAppData.isBlank()) {
            for (String version : List.of("Python313", "Python312", "Python311", "Python310")) {
                Path executable = Path.of(localAppData, "Programs", "Python", version, "python.exe");
                if (Files.isRegularFile(executable)) {
                    commands.add(0, List.of(executable.toString(), "-X", "utf8", script.toString()));
                }
            }
        }

        List<String> diagnostics = new ArrayList<>();
        for (List<String> command : commands) {
            try {
                ProcessBuilder builder = new ProcessBuilder(command);
                builder.directory(script.getParent().toFile());
                builder.environment().put("PYTHONUTF8", "1");
                builder.environment().put("PYTHONIOENCODING", "utf-8");
                Process process = builder.start();

                process.getOutputStream().write(inputJson.getBytes(StandardCharsets.UTF_8));
                process.getOutputStream().flush();
                process.getOutputStream().close();

                boolean completed = process.waitFor(PYTHON_TIMEOUT.toSeconds(), TimeUnit.SECONDS);
                if (!completed) {
                    process.destroyForcibly();
                    diagnostics.add(String.join(" ", command) + " : délai dépassé");
                    continue;
                }

                String stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
                String stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8).trim();
                if (process.exitValue() != 0 || stdout.isBlank()) {
                    diagnostics.add(String.join(" ", command) + " : " + sanitizeDetail(stderr.isBlank() ? stdout : stderr));
                    continue;
                }

                Map<String, Object> response = objectMapper.readValue(
                        stdout,
                        new TypeReference<Map<String, Object>>() {}
                );
                return new PythonExecution(response, String.join(" ", command.subList(0, Math.min(2, command.size()))));
            } catch (Exception ex) {
                diagnostics.add(String.join(" ", command) + " : " + sanitizeDetail(ex.getMessage()));
            }
        }
        throw new IOException("Aucune commande Python n'a pu exécuter l'assistant. " + String.join(" | ", diagnostics));
    }

    private Path locatePythonScript() throws IOException {
        Path workingDirectory = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        List<Path> candidates = new ArrayList<>();
        String configuredScript = System.getenv("TELNET_ASSISTANT_SCRIPT");
        if (configuredScript != null && !configuredScript.isBlank()) {
            candidates.add(Path.of(configuredScript));
        }
        candidates.add(workingDirectory.resolve("python").resolve("rssi_assistant.py"));
        candidates.add(workingDirectory.resolve("demo").resolve("python").resolve("rssi_assistant.py"));
        if (workingDirectory.getParent() != null) {
            candidates.add(workingDirectory.getParent().resolve("demo").resolve("python").resolve("rssi_assistant.py"));
            candidates.add(workingDirectory.getParent().resolve("python").resolve("rssi_assistant.py"));
        }

        return candidates.stream()
                .map(Path::normalize)
                .filter(Files::isRegularFile)
                .findFirst()
                .orElseThrow(() -> new IOException(
                        "rssi_assistant.py introuvable. Chemins vérifiés : "
                                + candidates.stream().map(Path::toString).toList()
                ));
    }

    private Map<String, Object> buildFallbackResponse(
            AssistantRequest request,
            List<Evenement> events,
            List<Incident> incidents,
            Exception error
    ) {
        String question = request == null || request.question() == null ? "" : request.question();
        long openIncidents = incidents.stream()
                .filter(incident -> !"Clôturé".equalsIgnoreCase(incident.getTraitementEtat())
                        && !"Clos".equalsIgnoreCase(incident.getTraitementEtat()))
                .count();
        long risks = incidents.stream()
                .mapToLong(incident -> incident.getRisques() == null ? 0 : incident.getRisques().size())
                .sum();

        String normalized = java.text.Normalizer.normalize(
                        question.toLowerCase(Locale.ROOT),
                        java.text.Normalizer.Form.NFD
                )
                .replaceAll("\\p{M}+", "")
                .replaceAll("[^a-z0-9]+", " ")
                .trim();

        Evenement selected = request == null || request.eventId() == null
                ? null
                : events.stream().filter(event -> request.eventId().equals(event.getId())).findFirst().orElse(null);
        if (selected == null) {
            selected = inferEventForFallback(question, request == null ? List.of() : request.history(), events);
        }
        Long selectedEventId = selected == null ? null : selected.getId();
        Incident selectedIncident = selectedEventId == null
                ? null
                : incidents.stream()
                        .filter(incident -> incident.getEvenement() != null
                                && selectedEventId.equals(incident.getEvenement().getId()))
                        .findFirst()
                        .orElse(null);

        String answer;
        if (normalized.matches("^(bonjour|bonsoir|salut|hello|hi|hey|coucou).*$")) {
            answer = "Bonjour. Je peux expliquer le site TELNET, guider une opération et analyser l'événement sélectionné.";
        } else if (normalized.contains("que peux tu faire") || normalized.contains("comment peux tu aider")
                || normalized.contains("what can you do") || normalized.contains("a quoi tu sers")) {
            answer = "Je peux vous guider pour déclarer, envoyer et qualifier un événement, gérer un plan d'incident, "
                    + "sélectionner des risques, rechercher dans les audits, modifier le profil et interpréter le dashboard. "
                    + "Avec un événement sélectionné, je peux aussi expliquer ses données, ses impacts et son état.";
        } else if (selected != null && (normalized.contains("explique") || normalized.contains("resume")
                || normalized.contains("c est quoi") || normalized.contains("detail"))) {
            answer = "L'événement #EV-" + selected.getId() + " « " + safe(selected.getLibelleErreur(), "Sans nom")
                    + " » est décrit ainsi : " + safe(selected.getDescriptionDetaillee(), "aucune description détaillée")
                    + ". État : " + safe(selected.getEtat(), "non renseigné")
                    + "; qualification : " + safe(selected.getQualification(), "non renseignée") + ".";
        } else if (selected != null && (normalized.contains("risque") || normalized.contains("impact")
                || normalized.contains("confidentialite") || normalized.contains("integrite")
                || normalized.contains("disponibilite"))) {
            String registeredRisks = selectedIncident == null || selectedIncident.getRisques() == null
                    ? "aucun risque enregistré"
                    : selectedIncident.getRisques().stream()
                            .map(risk -> safe(risk.getReference(), "Sans ID") + " — " + safe(risk.getDescription(), "sans description"))
                            .reduce((left, right) -> left + "; " + right)
                            .orElse("aucun risque enregistré");
            answer = "Impacts de l'événement #EV-" + selected.getId()
                    + " — Confidentialité : " + safe(selected.getImpactConfidentialite(), "non renseignée")
                    + "; Intégrité : " + safe(selected.getImpactIntegrite(), "non renseignée")
                    + "; Disponibilité : " + safe(selected.getImpactDisponibilite(), "non renseignée")
                    + ". Risques associés : " + registeredRisks + ".";
        } else if (selected != null && (normalized.contains("cause") || normalized.contains("pourquoi")
                || normalized.contains("origine"))) {
            answer = "Causes possibles enregistrées pour #EV-" + selected.getId() + " : "
                    + safe(selected.getCausesPossibles(), "aucune cause n'est enregistrée")
                    + ". Elles doivent être confirmées par les journaux et les tests.";
        } else if (selected != null && (normalized.contains("etat") || normalized.contains("statut")
                || normalized.contains("duree") || normalized.contains("indisponibilite"))) {
            answer = selectedIncident == null
                    ? "Aucun plan d'incident n'est associé à l'événement #EV-" + selected.getId() + "."
                    : "Plan associé à #EV-" + selected.getId() + " — état : "
                            + safe(selectedIncident.getTraitementEtat(), "non renseigné")
                            + "; durée d'indisponibilité : " + safe(selectedIncident.getDureeIndisponibilite(), "non renseignée")
                            + "; durée de traitement : " + safe(selectedIncident.getDureeTraitement(), "non renseignée") + ".";
        } else if (normalized.contains("qualification") || normalized.contains("qualifier")) {
            answer = "Dans Tous les événements, ouvrez Qualifier puis renseignez obligatoirement Confidentialité, Intégrité et Disponibilité avec Mineur, Majeur ou Critique. "
                    + "Dès qu'au moins un axe est Critique, TELNET classe automatiquement l'événement comme incident et ouvre le plan associé.";
        } else if (normalized.contains("risque")) {
            answer = "Dans le plan d'incident, choisissez un risque existant par ID et description ou ajoutez une nouvelle ligne. "
                    + "La description est obligatoire; l'ID du risque peut être saisi manuellement.";
        } else if (normalized.contains("audit") || normalized.contains("journal") || normalized.contains("log")) {
            answer = "Le Journal d'audit se recherche par utilisateur, action ou date. Plusieurs mots sont acceptés et les accents sont ignorés.";
        } else if (normalized.contains("profil") || normalized.contains("compte") || normalized.contains("email")
                || normalized.contains("mot de passe")) {
            answer = "Ouvrez Mon Profil ou Settings. Modifiez les champs souhaités, saisissez le mot de passe actuel si nécessaire, puis enregistrez.";
        } else if (normalized.contains("micro") || normalized.contains("voix") || normalized.contains("recherche")) {
            answer = "Cliquez sur le microphone, autorisez son accès et dictez en français. Le texte reconnu est placé dans la recherche ou la question.";
        } else if (normalized.contains("supprimer") && normalized.contains("incident")) {
            answer = "Dans Plan d'incidents, utilisez la corbeille de la ligne puis confirmez. L'événement lié revient en attente de qualification.";
        } else if (normalized.contains("declarer") || normalized.contains("creer") && normalized.contains("evenement")) {
            answer = "Dans Mes Déclarations ou Tous les événements, cliquez sur Déclarer un problème, complétez les champs obligatoires puis enregistrez.";
        } else if (normalized.contains("combien") || normalized.contains("total") || normalized.contains("dashboard")) {
            answer = "La base contient " + events.size() + " événement(s), " + incidents.size()
                    + " incident(s), dont " + openIncidents + " non clôturé(s), et " + risks + " risque(s).";
        } else {
            answer = "Je peux analyser les données TELNET actuellement enregistrées et répondre sur les événements, incidents, risques, impacts CID, audits, comptes et procédures. "
                    + "Décrivez simplement la situation, le titre, le ticket, le code erreur ou le service concerné.";
        }

        List<String> proposedActions = selected == null ? List.of() : fallbackActions(selected);
        boolean critical = selected != null && isCriticalIncident(selected);
        boolean asksForPlan = normalized.contains("action") || normalized.contains("approche")
                || normalized.contains("demarche") || normalized.contains("resoudre")
                || normalized.contains("solution") || normalized.contains("traitement")
                || normalized.contains("rempl") || normalized.contains("plan");
        boolean askToFillIncident = critical && asksForPlan;

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("answer", answer);
        response.put("selectedEventId", selected == null ? null : selected.getId());
        response.put("confirmationPrompt", askToFillIncident
                ? "Voulez-vous que je remplisse le plan d'incident avec cette analyse ?"
                : "");
        response.put("askToFillIncident", askToFillIncident);
        response.put("similarFound", false);
        response.put("matches", List.of());
        response.put("actions", asksForPlan ? proposedActions : List.of());
        response.put("incidentDraft", askToFillIncident ? fallbackIncidentDraft(selected, selectedIncident, proposedActions) : Map.of());
        response.put("source", "Guide TELNET — mode de secours Java");
        response.put("engine", "java-fallback");
        response.put("diagnostic", sanitizeDetail(error.getMessage()));
        return response;
    }


    private Evenement inferEventForFallback(
            String question,
            List<Map<String, String>> history,
            List<Evenement> events
    ) {
        if (events == null || events.isEmpty()) return null;
        StringBuilder contextBuilder = new StringBuilder(question == null ? "" : question);
        if (history != null) {
            int start = Math.max(0, history.size() - 6);
            for (int index = start; index < history.size(); index++) {
                Map<String, String> message = history.get(index);
                if (message != null) contextBuilder.append(' ').append(message.getOrDefault("text", ""));
            }
        }
        String context = normalize(contextBuilder.toString());
        Evenement exact = events.stream().filter(event -> {
            String reference = normalize(event.getReferenceEvenement());
            String ticket = normalize(event.getIdTicket());
            String errorCode = normalize(event.getCodeErreur());
            return (!reference.isBlank() && context.contains(reference))
                    || (!ticket.isBlank() && context.contains(ticket))
                    || (!errorCode.isBlank() && context.contains(errorCode));
        }).findFirst().orElse(null);
        if (exact != null) return exact;

        Evenement best = null;
        double bestScore = 0.0;
        for (Evenement event : events) {
            String data = normalize(String.join(" ",
                    safe(event.getReferenceEvenement(), ""),
                    safe(event.getLibelleErreur(), ""),
                    safe(event.getDescriptionDetaillee(), ""),
                    safe(event.getIdTicket(), ""),
                    safe(event.getCodeErreur(), ""),
                    safe(event.getServiceOsAppli(), ""),
                    safe(event.getNatureEvenement(), "")
            ));
            double score = tokenOverlap(context, data);
            if (score > bestScore || (score == bestScore && best != null && event.getId() != null
                    && best.getId() != null && event.getId() > best.getId())) {
                best = event;
                bestScore = score;
            }
        }
        return bestScore >= 0.16 ? best : null;
    }

    private double tokenOverlap(String left, String right) {
        java.util.Set<String> leftTokens = new java.util.HashSet<>(List.of(left.split("\\s+")));
        java.util.Set<String> rightTokens = new java.util.HashSet<>(List.of(right.split("\\s+")));
        leftTokens.removeIf(token -> token.length() < 3);
        rightTokens.removeIf(token -> token.length() < 3);
        if (leftTokens.isEmpty() || rightTokens.isEmpty()) return 0.0;
        long common = leftTokens.stream().filter(rightTokens::contains).count();
        return (double) common / (double) leftTokens.size();
    }

    private boolean isCriticalIncident(Evenement event) {
        if (event == null) return false;
        boolean complete = List.of(
                safe(event.getImpactConfidentialite(), ""),
                safe(event.getImpactIntegrite(), ""),
                safe(event.getImpactDisponibilite(), "")
        ).stream().allMatch(value -> Set.of("Mineur", "Majeur", "Critique").contains(value));
        return complete && ("Critique".equals(event.getImpactConfidentialite())
                || "Critique".equals(event.getImpactIntegrite())
                || "Critique".equals(event.getImpactDisponibilite()));
    }

    private List<String> fallbackActions(Evenement event) {
        String context = normalize(String.join(" ", safe(event.getLibelleErreur(), ""),
                safe(event.getDescriptionDetaillee(), ""), safe(event.getServiceOsAppli(), "")));
        if (context.contains("auth") || context.contains("connexion") || context.contains("login")) {
            return List.of(
                    "Identifier les comptes, adresses sources et plages horaires concernés dans les journaux.",
                    "Bloquer ou réinitialiser les accès suspects sans interrompre les comptes légitimes.",
                    "Corriger le mécanisme d'authentification puis surveiller les nouvelles tentatives."
            );
        }
        if (context.contains("reseau") || context.contains("vpn") || context.contains("panne") || context.contains("indisponibilite")) {
            return List.of(
                    "Vérifier la supervision, les équipements réseau et les dernières modifications.",
                    "Isoler le composant défaillant et activer une solution de secours si elle existe.",
                    "Rétablir progressivement le service puis surveiller sa stabilité."
            );
        }
        return List.of(
                "Confirmer le périmètre, les actifs touchés et les impacts CID avec les preuves disponibles.",
                "Collecter les journaux et appliquer une mesure d'atténuation réversible.",
                "Tester le retour à la normale, documenter la cause et définir une action préventive."
        );
    }

    private Map<String, Object> fallbackIncidentDraft(
            Evenement event,
            Incident incident,
            List<String> actions
    ) {
        Map<String, Object> draft = new LinkedHashMap<>();
        draft.put("typesIncident", incident != null && incident.getTypesIncident() != null
                ? incident.getTypesIncident() : List.of("Défaillance technique"));
        draft.put("niveauImpact", incident != null && incident.getNiveauImpact() != null
                ? incident.getNiveauImpact() : "NIVEAU_4");
        draft.put("dureeIndisponibilite", incident == null ? "" : safe(incident.getDureeIndisponibilite(), ""));
        draft.put("mesureAction", incident == null ? actions.get(0) : safe(incident.getMesureAction(), actions.get(0)));
        draft.put("mesureEtat", incident == null ? "En cours" : safe(incident.getMesureEtat(), "En cours"));
        draft.put("traitementAction", incident == null ? String.join("\n", actions) : safe(incident.getTraitementAction(), String.join("\n", actions)));
        draft.put("traitementEtat", incident == null ? "En cours" : safe(incident.getTraitementEtat(), "En cours"));
        draft.put("preconisation", incident == null ? "Vérifier les preuves, tester le retour à la normale et renforcer la prévention." : safe(incident.getPreconisation(), ""));
        draft.put("actionCorrective", incident == null ? "Documenter la cause racine et prévenir la récidive." : safe(incident.getActionCorrective(), ""));
        draft.put("impactContinuite", "Critique".equals(event.getImpactDisponibilite()));
        draft.put("impactContinuiteDescription", "Impact sur la continuité à confirmer avec la supervision et les utilisateurs concernés.");
        draft.put("changementDeclenche", false);
        draft.put("changementDeclencheDescription", "");
        draft.put("risques", incident == null || incident.getRisques() == null
                ? List.of(Map.of("reference", "", "description", "Risque à préciser selon le périmètre et les impacts observés."))
                : incident.getRisques().stream().map(risk -> Map.of(
                        "reference", safe(risk.getReference(), ""),
                        "description", safe(risk.getDescription(), "Risque à préciser")
                )).toList());
        return draft;
    }

    private String normalize(String value) {
        return java.text.Normalizer.normalize(
                        value == null ? "" : value.toLowerCase(Locale.ROOT),
                        java.text.Normalizer.Form.NFD
                )
                .replaceAll("\\p{M}+", "")
                .replaceAll("[^a-z0-9]+", " ")
                .trim();
    }

    private String safe(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private Map<String, Object> siteKnowledge() {
        return Map.of(
                "pages", List.of("Dashboard RSSI", "Tous les événements", "Plan d'incidents", "Journal d'audits", "Assistant RSSI", "Settings"),
                "eventWorkflow", "Un détecteur déclare un événement, l'envoie au RSSI, puis le RSSI qualifie les impacts CID. Un événement devient un incident lorsque les trois impacts CID sont renseignés et qu’au moins un impact est Critique.",
                "incidentWorkflow", "Le plan contient les mesures d'atténuation, le traitement, les risques, les actions correctives, le suivi et les durées.",
                "roles", "USER correspond au détecteur. ADMIN, ROLE_ADMIN ou RSSI correspondent au RSSI.",
                "search", "Les pages événements, incidents et audits peuvent être filtrées par texte ou par voix.",
                "account", "Le profil permet de modifier le nom, l'email et le mot de passe après vérification du mot de passe actuel."
        );
    }

    private Map<String, Object> eventToMap(Evenement event) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", event.getId());
        data.put("reference", event.getReferenceEvenement());
        data.put("title", event.getLibelleErreur());
        data.put("description", event.getDescriptionDetaillee());
        data.put("date", event.getDateHeureDetection());
        data.put("source", event.getDetecteParSource());
        data.put("declaredBy", event.getDeclarePar());
        data.put("ticket", event.getIdTicket());
        data.put("nature", event.getNatureEvenement());
        data.put("service", event.getServiceOsAppli());
        data.put("equipment", event.getEquipementHardware());
        data.put("errorCode", event.getCodeErreur());
        data.put("possibleCauses", event.getCausesPossibles());
        data.put("state", event.getEtat());
        data.put("qualification", event.getQualification());
        data.put("confidentiality", event.getImpactConfidentialite());
        data.put("integrity", event.getImpactIntegrite());
        data.put("availability", event.getImpactDisponibilite());
        return data;
    }

    private Map<String, Object> incidentToMap(Incident incident) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", incident.getId());
        data.put("eventId", incident.getEvenement() == null ? null : incident.getEvenement().getId());
        data.put("types", incident.getTypesIncident());
        data.put("impactLevel", incident.getNiveauImpact());
        data.put("downtime", incident.getDureeIndisponibilite());
        data.put("mitigationAction", incident.getMesureAction());
        data.put("mitigationState", incident.getMesureEtat());
        data.put("treatmentAction", incident.getTraitementAction());
        data.put("treatmentState", incident.getTraitementEtat());
        data.put("treatmentDuration", incident.getDureeTraitement());
        data.put("recommendation", incident.getPreconisation());
        data.put("correctiveAction", incident.getActionCorrective());
        data.put("effectiveness", incident.getEfficacite());
        data.put("effectivenessComment", incident.getCommentaireEfficacite());
        data.put("similarEvents", incident.getEvenementsSimilaires());
        data.put("similarEventsDescription", incident.getEvenementsDetailsDescription());
        data.put("followUpComments", incident.getSuiviCommentaires());
        data.put("risks", incident.getRisques() == null ? List.of() : incident.getRisques().stream().map(risk -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", risk.getId());
            item.put("reference", risk.getReference());
            item.put("description", risk.getDescription());
            return item;
        }).toList());
        return data;
    }

    private String sanitizeDetail(String value) {
        if (value == null || value.isBlank()) return "détail indisponible";
        String oneLine = value.replaceAll("[\\r\\n]+", " ").trim();
        return oneLine.length() > 500 ? oneLine.substring(0, 500) + "…" : oneLine;
    }
}
