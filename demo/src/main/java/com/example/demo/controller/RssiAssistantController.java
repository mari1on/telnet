package com.example.demo.controller;

import com.example.demo.entity.Evenement;
import com.example.demo.entity.Incident;
import com.example.demo.repository.EvenementRepository;
import com.example.demo.repository.IncidentRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
import java.util.Map;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/rssi-assistant")
public class RssiAssistantController {

    private static final Duration PYTHON_TIMEOUT = Duration.ofSeconds(25);

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

    @PostMapping("/analyze")
    public ResponseEntity<?> analyze(@RequestBody AssistantRequest request) {
        if (request == null || request.eventId() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Sélectionnez un événement à analyser."));
        }
        if (request.question() == null || request.question().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "La question ne peut pas être vide."));
        }

        Evenement selectedEvent = evenementRepository.findById(request.eventId()).orElse(null);
        if (selectedEvent == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Événement introuvable."));
        }

        try {
            Path script = locatePythonScript();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("question", request.question().trim());
            payload.put("history", request.history() == null ? List.of() : request.history());
            payload.put("selectedEventId", request.eventId());
            payload.put("events", evenementRepository.findAll().stream().map(this::eventToMap).toList());
            payload.put("incidents", incidentRepository.findAll().stream().map(this::incidentToMap).toList());

            Process process = startPython(script);
            String inputJson = objectMapper.writeValueAsString(payload);
            process.getOutputStream().write(inputJson.getBytes(StandardCharsets.UTF_8));
            process.getOutputStream().close();

            boolean completed = process.waitFor(PYTHON_TIMEOUT.toSeconds(), TimeUnit.SECONDS);
            if (!completed) {
                process.destroyForcibly();
                return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
                        .body(Map.of("message", "Le moteur Python a dépassé le temps d’analyse autorisé."));
            }

            String stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            String stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8).trim();

            if (process.exitValue() != 0) {
                String detail = stderr.isBlank() ? stdout : stderr;
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(Map.of("message", "Erreur du moteur Python local : " + sanitizeDetail(detail)));
            }
            if (stdout.isBlank()) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(Map.of("message", "Le moteur Python n’a retourné aucun résultat."));
            }

            Map<String, Object> response = objectMapper.readValue(
                    stdout,
                    new TypeReference<Map<String, Object>>() {}
            );
            return ResponseEntity.ok(response);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "message",
                    "Python 3 ou le fichier demo/python/rssi_assistant.py est introuvable. " + sanitizeDetail(e.getMessage())
            ));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "L’analyse Python a été interrompue."));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "Impossible d’exécuter l’assistant local : " + sanitizeDetail(e.getMessage())));
        }
    }

    private Path locatePythonScript() throws IOException {
        Path workingDirectory = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        List<Path> candidates = List.of(
                workingDirectory.resolve("python").resolve("rssi_assistant.py"),
                workingDirectory.resolve("demo").resolve("python").resolve("rssi_assistant.py"),
                workingDirectory.getParent() == null
                        ? workingDirectory.resolve("python").resolve("rssi_assistant.py")
                        : workingDirectory.getParent().resolve("demo").resolve("python").resolve("rssi_assistant.py")
        );

        return candidates.stream()
                .filter(Files::isRegularFile)
                .findFirst()
                .orElseThrow(() -> new IOException("rssi_assistant.py absent dans le dossier demo/python."));
    }

    private Process startPython(Path script) throws IOException {
        List<List<String>> commands = new ArrayList<>();
        commands.add(List.of("python", script.toString()));
        commands.add(List.of("py", "-3", script.toString()));
        commands.add(List.of("python3", script.toString()));

        IOException lastError = null;
        for (List<String> command : commands) {
            try {
                return new ProcessBuilder(command)
                        .redirectErrorStream(false)
                        .start();
            } catch (IOException e) {
                lastError = e;
            }
        }
        throw new IOException("Aucune commande Python 3 disponible (python, py -3 ou python3).", lastError);
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
        return data;
    }

    private String sanitizeDetail(String value) {
        if (value == null || value.isBlank()) {
            return "détail indisponible";
        }
        String oneLine = value.replaceAll("[\\r\\n]+", " ").trim();
        return oneLine.length() > 300 ? oneLine.substring(0, 300) + "…" : oneLine;
    }
}
