package com.example.demo.controller;

import com.example.demo.service.AuditLogService;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * Sauvegarde défensive du plan d'incident.
 *
 * Cet endpoint accepte un JSON souple puis écrit les valeurs explicitement dans
 * MySQL. Il évite les échecs de désérialisation des dates/heures et les problèmes
 * d'entités Risque détachées qui pouvaient bloquer le formulaire généré par l'IA.
 */
@RestController
@RequestMapping("/api/incidents")
@CrossOrigin(origins = "*")
public class IncidentPlanSaveController {

    private static final LinkedHashMap<String, String> INCIDENT_COLUMNS = new LinkedHashMap<>();
    static {
        INCIDENT_COLUMNS.put("niveauImpact", "niveau_impact");
        INCIDENT_COLUMNS.put("dureeIndisponibilite", "duree_indisponibilite");
        INCIDENT_COLUMNS.put("mesureActionNumero", "mesure_action_numero");
        INCIDENT_COLUMNS.put("mesureAction", "mesure_action");
        INCIDENT_COLUMNS.put("mesureResponsable", "mesure_responsable");
        INCIDENT_COLUMNS.put("mesureDelai", "mesure_delai");
        INCIDENT_COLUMNS.put("mesureEtat", "mesure_etat");
        INCIDENT_COLUMNS.put("mesureDDT", "mesureddt");
        INCIDENT_COLUMNS.put("dureeAttenuation", "duree_attenuation");
        INCIDENT_COLUMNS.put("heureAttenuation", "heure_attenuation");
        INCIDENT_COLUMNS.put("mesureDateCloture", "mesure_date_cloture");
        INCIDENT_COLUMNS.put("mesureHeureCloture", "mesure_heure_cloture");
        INCIDENT_COLUMNS.put("traitementAction", "traitement_action");
        INCIDENT_COLUMNS.put("traitementDDT", "traitementddt");
        INCIDENT_COLUMNS.put("traitementHDT", "traitementhdt");
        INCIDENT_COLUMNS.put("traitementResponsable", "traitement_responsable");
        INCIDENT_COLUMNS.put("traitementEtat", "traitement_etat");
        INCIDENT_COLUMNS.put("traitementDateCloture", "traitement_date_cloture");
        INCIDENT_COLUMNS.put("traitementHeureCloture", "traitement_heure_cloture");
        INCIDENT_COLUMNS.put("dureeTraitement", "duree_traitement");
        INCIDENT_COLUMNS.put("heureTraitement", "heure_traitement");
        INCIDENT_COLUMNS.put("preconisation", "preconisation");
        INCIDENT_COLUMNS.put("actionCorrective", "action_corrective");
        INCIDENT_COLUMNS.put("correctiveResponsable", "corrective_responsable");
        INCIDENT_COLUMNS.put("correctiveDateDebut", "corrective_date_debut");
        INCIDENT_COLUMNS.put("correctiveDateCloture", "corrective_date_cloture");
        INCIDENT_COLUMNS.put("dateMesureEfficacite", "date_mesure_efficacite");
        INCIDENT_COLUMNS.put("efficacite", "efficacite");
        INCIDENT_COLUMNS.put("commentaireEfficacite", "commentaire_efficacite");
        INCIDENT_COLUMNS.put("hasRisquesAssocies", "has_risques_associes");
        INCIDENT_COLUMNS.put("impactContinuite", "impact_continuite");
        INCIDENT_COLUMNS.put("impactContinuiteDescription", "impact_continuite_description");
        INCIDENT_COLUMNS.put("capitalisation", "capitalisation");
        INCIDENT_COLUMNS.put("evenementsSimilaires", "evenements_similaires");
        INCIDENT_COLUMNS.put("evenementsDetailsDescription", "evenements_details_description");
        INCIDENT_COLUMNS.put("changementDeclenche", "changement_declenche");
        INCIDENT_COLUMNS.put("changementDeclencheDescription", "changement_declenche_description");
        INCIDENT_COLUMNS.put("miseAJourPcaNecessaire", "miseajour_pca_necessaire");
        INCIDENT_COLUMNS.put("referencePca", "reference_pca");
        INCIDENT_COLUMNS.put("risquesAMettreAJour", "risquesamettreajour");
        INCIDENT_COLUMNS.put("risquesMiseAJour", "risques_miseajour");
        INCIDENT_COLUMNS.put("risquesMiseAJourDescription", "risques_miseajour_description");
        INCIDENT_COLUMNS.put("suiviEdition", "suivi_edition");
        INCIDENT_COLUMNS.put("suiviDate", "suivi_date");
        INCIDENT_COLUMNS.put("suiviAuteur", "suivi_auteur");
        INCIDENT_COLUMNS.put("suiviCommentaires", "suivi_commentaires");
    }

    private final JdbcTemplate jdbcTemplate;
    private final AuditLogService auditLogService;

    public IncidentPlanSaveController(JdbcTemplate jdbcTemplate, AuditLogService auditLogService) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLogService = auditLogService;
        System.out.println(">>> TELNET V19 : moteur de sauvegarde du plan d'incident chargé.");
    }

    @GetMapping("/save-plan/version")
    public Map<String, String> version() {
        return Map.of("version", "v19-jdbc-plan-save");
    }

    @PostMapping("/save-plan")
    @Transactional
    public ResponseEntity<?> savePlan(
            @RequestBody Map<String, Object> payload,
            @RequestHeader(value = "X-User-Username", required = false) String username) {
        try {
            long eventId = readEventId(payload);
            Integer eventCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM evenements WHERE id = ?", Integer.class, eventId);
            if (eventCount == null || eventCount == 0) {
                return ResponseEntity.badRequest().body(error(
                        "L'événement rattaché au plan est introuvable.", null));
            }

            Long incidentId = findIncidentId(eventId);
            boolean created = incidentId == null;
            if (created) incidentId = insertIncident(eventId);

            Map<String, ColumnInfo> metadata = loadColumnMetadata("incidents");
            updateIncidentFields(incidentId, payload, metadata);
            saveIncidentTypes(incidentId, payload.get("typesIncident"));
            saveRisks(incidentId, payload.get("risques"));

            // Le plan confirmé correspond nécessairement à un incident.
            jdbcTemplate.update(
                    "UPDATE evenements SET qualification = 'INCIDENT' WHERE id = ?", eventId);

            try {
                auditLogService.logAction(username,
                        (created ? "Création" : "Mise à jour")
                                + " du plan de l'Incident N° " + incidentId
                                + " lié à l'Événement N° " + eventId);
            } catch (RuntimeException ignored) {
                // Le journal ne doit jamais annuler la sauvegarde métier.
            }

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("id", incidentId);
            body.put("eventId", eventId);
            body.put("created", created);
            body.put("message", created
                    ? "Incident qualifié et plan créé."
                    : "Plan d'incident mis à jour.");
            body.put("saveEngine", "jdbc-v19");
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(error(ex.getMessage(), ex));
        } catch (DataAccessException ex) {
            return ResponseEntity.internalServerError().body(error(
                    "MySQL a refusé une valeur du plan d'incident.", ex));
        } catch (RuntimeException ex) {
            return ResponseEntity.internalServerError().body(error(
                    "Impossible d'enregistrer le plan d'incident.", ex));
        }
    }

    private long readEventId(Map<String, Object> payload) {
        Object direct = payload.get("eventId");
        Object nested = null;
        if (payload.get("evenement") instanceof Map<?, ?> event) nested = event.get("id");
        Object value = direct != null ? direct : nested;
        if (value == null) throw new IllegalArgumentException(
                "Sélectionnez l'événement rattaché à l'incident.");
        try {
            long id = value instanceof Number number
                    ? number.longValue()
                    : Long.parseLong(String.valueOf(value).trim());
            if (id <= 0) throw new NumberFormatException();
            return id;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Identifiant d'événement invalide.");
        }
    }

    private Long findIncidentId(long eventId) {
        List<Long> ids = jdbcTemplate.query(
                "SELECT id FROM incidents WHERE evenement_id = ? ORDER BY id LIMIT 1",
                (rs, rowNum) -> rs.getLong(1), eventId);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private long insertIncident(long eventId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO incidents (evenement_id) VALUES (?)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, eventId);
            return statement;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            Long recovered = findIncidentId(eventId);
            if (recovered == null) throw new IllegalStateException(
                    "MySQL n'a pas renvoyé l'identifiant du nouvel incident.");
            return recovered;
        }
        return key.longValue();
    }

    private void updateIncidentFields(long incidentId,
                                      Map<String, Object> payload,
                                      Map<String, ColumnInfo> metadata) {
        for (Map.Entry<String, String> mapping : INCIDENT_COLUMNS.entrySet()) {
            String jsonField = mapping.getKey();
            String column = mapping.getValue();
            ColumnInfo info = metadata.get(column.toLowerCase(Locale.ROOT));
            if (info == null) continue; // Compatibilité avec une ancienne base.

            Object normalized;
            try {
                normalized = convertValue(payload.get(jsonField), info);
            } catch (IllegalArgumentException ex) {
                throw new IllegalArgumentException("Champ « " + jsonField + " » : " + ex.getMessage());
            }

            try {
                jdbcTemplate.update("UPDATE incidents SET `" + column + "` = ? WHERE id = ?",
                        normalized, incidentId);
            } catch (DataAccessException ex) {
                throw new IllegalArgumentException(
                        "Le champ « " + jsonField + " » contient une valeur refusée par MySQL : "
                                + rootMessage(ex));
            }
        }
    }

    private void saveIncidentTypes(long incidentId, Object rawTypes) {
        jdbcTemplate.update("DELETE FROM incident_types WHERE incident_id = ?", incidentId);
        LinkedHashSet<String> types = new LinkedHashSet<>();
        if (rawTypes instanceof Collection<?> collection) {
            for (Object value : collection) addNonBlank(types, value, 240);
        } else {
            addNonBlank(types, rawTypes, 240);
        }
        if (types.isEmpty()) types.add("Autre");
        for (String type : types) {
            jdbcTemplate.update(
                    "INSERT INTO incident_types (incident_id, type_incident) VALUES (?, ?)",
                    incidentId, type);
        }
    }

    private void saveRisks(long incidentId, Object rawRisks) {
        jdbcTemplate.update("DELETE FROM risques WHERE incident_id = ?", incidentId);
        if (!(rawRisks instanceof Collection<?> collection)) return;

        int index = 0;
        for (Object item : collection) {
            index++;
            if (!(item instanceof Map<?, ?> risk)) continue;
            String description = cleanString(risk.get("description"));
            String reference = cleanString(risk.get("reference"));
            if (description == null) {
                throw new IllegalArgumentException(
                        "La description du risque n°" + index + " est obligatoire.");
            }
            if (reference != null && reference.length() > 240) {
                reference = reference.substring(0, 240);
            }
            jdbcTemplate.update(
                    "INSERT INTO risques (description, reference, incident_id) VALUES (?, ?, ?)",
                    description, reference, incidentId);
        }
    }

    private Map<String, ColumnInfo> loadColumnMetadata(String table) {
        Map<String, ColumnInfo> result = new HashMap<>();
        jdbcTemplate.query(
                "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH "
                        + "FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                rs -> {
                    String name = rs.getString("COLUMN_NAME");
                    long max = rs.getLong("CHARACTER_MAXIMUM_LENGTH");
                    if (rs.wasNull()) max = 0;
                    result.put(name.toLowerCase(Locale.ROOT),
                            new ColumnInfo(rs.getString("DATA_TYPE"), max));
                }, table);
        return result;
    }

    private Object convertValue(Object raw, ColumnInfo info) {
        if (raw == null) return null;
        String type = info.dataType.toLowerCase(Locale.ROOT);

        if (type.equals("bit") || type.equals("boolean") || type.equals("tinyint")) {
            return toBoolean(raw);
        }

        String text = cleanString(raw);
        if (text == null) return null;

        try {
            if (type.equals("date")) return Date.valueOf(LocalDate.parse(text));
            if (type.equals("time")) {
                String normalized = text.length() == 5 ? text + ":00" : text;
                return Time.valueOf(LocalTime.parse(normalized));
            }
        } catch (DateTimeParseException | IllegalArgumentException ex) {
            throw new IllegalArgumentException(
                    type.equals("date") ? "date invalide" : "heure invalide");
        }

        if (info.maxLength > 0 && text.length() > info.maxLength) {
            text = text.substring(0, (int) info.maxLength);
        }
        return text;
    }

    private Boolean toBoolean(Object raw) {
        if (raw instanceof Boolean value) return value;
        if (raw instanceof Number number) return number.intValue() != 0;
        String value = String.valueOf(raw).trim().toLowerCase(Locale.ROOT);
        return value.equals("true") || value.equals("1") || value.equals("oui")
                || value.equals("yes") || value.equals("on");
    }

    private void addNonBlank(Set<String> target, Object raw, int max) {
        String value = cleanString(raw);
        if (value == null) return;
        target.add(value.length() <= max ? value : value.substring(0, max));
    }

    private String cleanString(Object raw) {
        if (raw == null) return null;
        String value = String.valueOf(raw).trim();
        return value.isEmpty() ? null : value;
    }

    private Map<String, Object> error(String message, Throwable error) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message == null || message.isBlank()
                ? "Impossible d'enregistrer le plan d'incident." : message);
        if (error != null) body.put("detail", rootMessage(error));
        body.put("saveEngine", "jdbc-v19");
        return body;
    }

    private String rootMessage(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        String message = current.getMessage();
        return message == null || message.isBlank()
                ? error.getClass().getSimpleName()
                : message;
    }

    private static final class ColumnInfo {
        private final String dataType;
        private final long maxLength;

        private ColumnInfo(String dataType, long maxLength) {
            this.dataType = dataType;
            this.maxLength = maxLength;
        }
    }
}
