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
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/rssi-assistant")
public class RssiAssistantController {

    private static final Duration PYTHON_TIMEOUT = Duration.ofSeconds(35);

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
            payload.put("question", request.question().trim());
            payload.put("history", request.history() == null ? List.of() : request.history());
            payload.put("selectedEventId", request.eventId());
            payload.put("events", events.stream().map(this::eventToMap).toList());
            payload.put("incidents", incidents.stream().map(this::incidentToMap).toList());
            payload.put("site", siteKnowledge());

            String inputJson = objectMapper.writeValueAsString(payload);
            PythonExecution execution = executeWithAvailablePython(script, inputJson);
            Map<String, Object> response = new LinkedHashMap<>(execution.response());
            response.put("engine", execution.command());
            return ResponseEntity.ok(response);
        } catch (Exception ex) {
            // A small, data-grounded fallback keeps the page usable while exposing the real diagnostic.
            Map<String, Object> fallback = buildFallbackResponse(request.question(), events, incidents, ex);
            return ResponseEntity.ok(fallback);
        }
    }

    private PythonExecution executeWithAvailablePython(Path script, String inputJson) throws Exception {
        List<List<String>> commands = List.of(
                List.of("py", "-3", "-X", "utf8", script.toString()),
                List.of("python", "-X", "utf8", script.toString()),
                List.of("python3", "-X", "utf8", script.toString())
        );

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
            String question,
            List<Evenement> events,
            List<Incident> incidents,
            Exception error
    ) {
        long openIncidents = incidents.stream()
                .filter(incident -> !"Clôturé".equalsIgnoreCase(incident.getTraitementEtat()))
                .count();
        long risks = incidents.stream()
                .mapToLong(incident -> incident.getRisques() == null ? 0 : incident.getRisques().size())
                .sum();

        String normalized = java.text.Normalizer.normalize(
                        question == null ? "" : question.toLowerCase(Locale.ROOT),
                        java.text.Normalizer.Form.NFD
                )
                .replaceAll("\\p{M}+", "")
                .replaceAll("[^a-z0-9]+", " ")
                .trim();

        String answer;
        if (normalized.matches("^(bonjour|bonsoir|salut|hello|hi|hey|coucou).*$")) {
            answer = "Bonjour. Je peux vous guider dans TELNET sur les événements, incidents, risques, recherches, audits et paramètres du compte.";
        } else if (normalized.contains("qualification") || normalized.contains("qualifier")) {
            answer = "Dans Tous les événements, ouvrez l'action Qualifier, renseignez Confidentialité, Intégrité et Disponibilité, puis confirmez. Un impact majeur ou critique ouvre le plan d'incident.";
        } else if (normalized.contains("risque")) {
            answer = "Dans la qualification ou le plan d'incident, choisissez un risque existant par ID et description, ou créez un nouveau risque. Son ID est généré automatiquement.";
        } else if (normalized.contains("audit") || normalized.contains("journal") || normalized.contains("log")) {
            answer = "Le Journal d'audit permet de rechercher par utilisateur, action ou date. La recherche accepte plusieurs mots et ignore les accents.";
        } else if (normalized.contains("profil") || normalized.contains("compte") || normalized.contains("email") || normalized.contains("mot de passe")) {
            answer = "Ouvrez Mon Profil ou Settings. Pour changer l'email ou le mot de passe, saisissez le mot de passe actuel puis enregistrez.";
        } else if (normalized.contains("micro") || normalized.contains("voix") || normalized.contains("recherche")) {
            answer = "Cliquez sur le microphone, autorisez son accès et dictez en français. Le texte est inséré dans la recherche ou dans la question de l'assistant.";
        } else if (normalized.contains("supprimer") && normalized.contains("incident")) {
            answer = "Dans Plan d'incidents, utilisez la corbeille de la ligne et confirmez. L'événement lié revient en attente de qualification.";
        } else {
            answer = "Mode de secours actif. La base contient " + events.size() + " événement(s), "
                    + incidents.size() + " incident(s), dont " + openIncidents + " non clôturé(s), et "
                    + risks + " risque(s). Posez une question précise sur le fonctionnement du site ou sélectionnez un événement.";
        }

        return Map.of(
                "answer", answer,
                "confirmationPrompt", "",
                "similarFound", false,
                "matches", List.of(),
                "actions", List.of(),
                "source", "Guide TELNET — mode de secours Java",
                "diagnostic", sanitizeDetail(error.getMessage())
        );
    }

    private Map<String, Object> siteKnowledge() {
        return Map.of(
                "pages", List.of("Dashboard RSSI", "Tous les événements", "Plan d'incidents", "Journal d'audits", "Assistant RSSI", "Settings"),
                "eventWorkflow", "Un détecteur déclare un événement, l'envoie au RSSI, puis le RSSI qualifie les impacts CID. Un impact majeur ou critique peut conduire à un incident.",
                "incidentWorkflow", "Le plan contient les mesures d'atténuation, le traitement, les risques, les actions correctives, le suivi et les durées.",
                "roles", "USER correspond au détecteur. ADMIN, ROLE_ADMIN ou RSSI correspondent au RSSI.",
                "search", "Les pages événements, incidents et audits peuvent être filtrées par texte ou par voix.",
                "account", "Le profil permet de modifier le nom, l'email et le mot de passe après vérification du mot de passe actuel."
        );
    }

    private Map<String, Object> eventToMap(Evenement event) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", event.getId());
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
