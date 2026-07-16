package com.example.demo.controller;

import com.example.demo.entity.Incident;
import com.example.demo.service.IncidentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/incidents")
@CrossOrigin(origins = "*")
public class IncidentController {

    private final IncidentService incidentService;

    public IncidentController(IncidentService incidentService) {
        this.incidentService = incidentService;
    }

    @GetMapping
    public List<Incident> getAllIncidents() {
        return incidentService.getAllIncidents();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Incident> getIncidentById(@PathVariable Long id) {
        return incidentService.getIncidentById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> createIncident(
            @RequestBody Incident incident,
            @RequestHeader(value = "X-User-Username", required = false) String username) {
        try {
            return ResponseEntity.ok(incidentService.createIncident(incident, username));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
        } catch (RuntimeException ex) {
            return ResponseEntity.internalServerError().body(Map.of(
                    "message", "Impossible d’enregistrer l’incident. Vérifiez les champs du plan et réessayez.",
                    "detail", rootMessage(ex)
            ));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateIncident(
            @PathVariable Long id,
            @RequestBody Incident details,
            @RequestHeader(value = "X-User-Username", required = false) String username) {
        try {
            return incidentService.updateIncident(id, details, username)
                    .<ResponseEntity<?>>map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
        } catch (RuntimeException ex) {
            return ResponseEntity.internalServerError().body(Map.of(
                    "message", "Impossible de mettre à jour l’incident. Vérifiez les champs du plan et réessayez.",
                    "detail", rootMessage(ex)
            ));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIncident(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Username", required = false) String username) {
        if (incidentService.deleteIncident(id, username)) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }
    private String rootMessage(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        String message = current.getMessage();
        return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
    }
}

